/**
 * 图片生成器（控制器节点）→ 派生展示节点的纯函数逻辑。
 *
 * 不依赖 reactflow 实例，便于单测；hook 侧把 mutable 操作（setNodes / setEdges）
 * 与位置计算（measured width / parent group）传进来。
 */
import type {
  LinghuiImageGeneratorNodeProperties,
  LinghuiImageNodeProperties,
} from '../../../../types/linghui';

export interface SpawnImageFromGeneratorInput {
  /** 控制器节点的属性快照 */
  controller: LinghuiImageGeneratorNodeProperties;
  /** 新展示节点要继承的基础默认（用 createNewNodeData('linghui/image').properties） */
  imageDefaults: LinghuiImageNodeProperties;
  /** 控制器节点 id（写到展示节点的 generatedFromNodeId 上） */
  controllerNodeId: string;
}

export interface SpawnImageFromGeneratorResult {
  /** 给新展示节点的 properties */
  imageProperties: LinghuiImageNodeProperties;
  /** 给控制器节点的下一份 properties（generationCount++ + generatedImageNodeIds 追加占位） */
  buildNextControllerProperties: (newImageNodeId: string) => LinghuiImageGeneratorNodeProperties;
  /** 新展示节点 label 后缀（"#N"），调用方决定怎么和控制器 label 拼接 */
  sequence: number;
}

/**
 * 把控制器的 prompt/模型/比例/batch 复制成一份新的展示节点 properties，
 * 并返回控制器自身要更新的下一份 properties（生成历史链 +1）。
 *
 * 调用方拿到 imageProperties 后用 createCanvasNode + parentId/position 包装成 Node；
 * 拿到 buildNextControllerProperties 后在新节点 id 已知时调用，得到下一份控制器属性。
 */
export function planSpawnImageFromGenerator(
  input: SpawnImageFromGeneratorInput,
): SpawnImageFromGeneratorResult {
  const { controller, imageDefaults, controllerNodeId } = input;
  const sequence = (controller.generationCount ?? 0) + 1;

  const imageProperties: LinghuiImageNodeProperties = {
    ...imageDefaults,
    mode: 'generate',
    source: '',
    items: [],
    primaryAssetId: '',
    primaryResultSource: '',
    prompt: String(controller.prompt ?? '').trim(),
    ttiSelection: String(controller.ttiSelection ?? imageDefaults.ttiSelection ?? ''),
    aspectRatio: String(controller.aspectRatio ?? imageDefaults.aspectRatio ?? '3:4'),
    resolution: String(controller.resolution ?? imageDefaults.resolution ?? 'auto'),
    gridType: 'none',
    batchCount: (() => {
      const raw = Number(controller.batchCount ?? 1);
      if (!Number.isFinite(raw)) return 1;
      return Math.max(1, Math.round(raw));
    })(),
    generatedFromNodeId: controllerNodeId,
    generatedSequence: sequence,
  };

  const buildNextControllerProperties = (newImageNodeId: string): LinghuiImageGeneratorNodeProperties => {
    const prevIds = Array.isArray(controller.generatedImageNodeIds)
      ? controller.generatedImageNodeIds.filter((value): value is string => typeof value === 'string')
      : [];
    return {
      ...controller,
      generatedImageNodeIds: [...prevIds, newImageNodeId],
      generationCount: sequence,
    };
  };

  return {
    imageProperties,
    buildNextControllerProperties,
    sequence,
  };
}
