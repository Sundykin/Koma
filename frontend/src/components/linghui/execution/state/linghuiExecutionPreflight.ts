/**
 * 灵绘执行前预检：在真正执行前把"必然失败"的节点输入缺失一次性列出来。
 *
 * 背景：此前节点输入校验全部在执行器运行时 throw（"请先上传图片素材"、
 * "多角度生图需要先连接一张上游图片"……），用户点击执行后要么卡住要么
 * 报一条含糊错误。成熟工具（Blender 渲染前检查、剪辑软件导出前拦缺素材）
 * 都会在入口前做预检。
 *
 * 设计约束：
 *  - 只报"确定会失败"的项（条件与执行器逐条对齐，避免误报/漏报）
 *  - 预检只做本地结构检查，不触发 LLM / 网络 / 生成
 *  - 阻塞性问题由调用方弹窗提示；预检本身不决定是否放行
 */
import type { LinghuiExecutionContext } from '../../../../types/linghui';
import type { LinghuiNodeType } from '../../../../types/linghui';
import { createNodeView } from './linghuiExecutionNodeView';
import { getLinghuiImageImportItems } from '../../editors/state/linghuiImageCollections';
import { resolveImageNodeMode } from './linghuiExecutionResultSources';

export interface LinghuiPreflightIssue {
  nodeId: string;
  nodeTitle: string;
  nodeType: LinghuiNodeType;
  /** 人读提示（与执行器报错文案一致，用户好对应） */
  message: string;
}

/**
 * 对目标节点集合做执行前预检，返回所有阻塞性问题（按节点顺序）。
 * 只检查"确定会失败"的输入缺失；其余校验留在执行器（执行时可能变化，
 * 如 LLM 生成后才有结果的上游，预检阶段无法预知）。
 */
export function preflightLinghuiTargetNodes(
  context: LinghuiExecutionContext,
  targetNodeIds: string[],
): LinghuiPreflightIssue[] {
  const issues: LinghuiPreflightIssue[] = [];
  const nodeIdSet = new Set(targetNodeIds);

  for (const snapshot of context.nodes) {
    if (!nodeIdSet.has(snapshot.id)) continue;
    const node = createNodeView(context, snapshot);
    const nodeType = node.type;

    if (nodeType === 'linghui/image') {
      const properties = node.properties as unknown as { mode?: string; multiAngle?: { enabled?: boolean } };
      const source = String(node.properties.source ?? '').trim();
      const mode = resolveImageNodeMode({ source, mode: properties.mode });

      if (mode === 'import') {
        const importItems = getLinghuiImageImportItems(node.properties as never);
        if (importItems.length === 0) {
          issues.push({ nodeId: node.id, nodeTitle: node.title, nodeType, message: '请先上传图片素材' });
          continue;
        }
      }

      if (properties.multiAngle?.enabled === true) {
        const upstreamImages = node.getAllInputImages();
        if (upstreamImages.length === 0) {
          issues.push({
            nodeId: node.id,
            nodeTitle: node.title,
            nodeType,
            message: '多角度生图需要先连接一张上游图片',
          });
        }
      }
    }

    if (nodeType === 'linghui/audio') {
      const source = String(node.properties.source ?? '').trim();
      const prompt = String(node.properties.prompt ?? '').trim();
      if (!source && !prompt) {
        // 与执行器一致：无本地上传音频、无自带文本、无上游文本、无提示词引用 → 必失败
        const hasUpstreamText = node.getAllInputResults(1).length > 0
          || node.getAllInputResults(2).length > 0
          || node.getAllInputResults(3).length > 0;
        const hasPromptReferences = node.getPromptReferences().length > 0;
        if (!hasUpstreamText && !hasPromptReferences) {
          issues.push({
            nodeId: node.id,
            nodeTitle: node.title,
            nodeType,
            message: '请先上传音频，或输入要合成的文本',
          });
        }
      }
    }
  }

  return issues;
}
