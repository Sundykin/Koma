import {
  type LinghuiImageNodeProperties,
  type LinghuiNodeResult,
} from '../../../../types/linghui';
import {
  normalizeLinghuiImageCinematicConfig,
  normalizeLinghuiImageFocusRegion,
  normalizeLinghuiImageMarkPoints,
} from '../../../../types/linghui';
import {
  collectLinghuiPromptReferenceImageSources,
} from '../../editors/state/linghuiPromptReferences';
import {
  buildMediaItem,
  collectReferenceSources,
  collectTextSnippets,
  mergePromptWithTextInputs,
  mergeUniqueSources,
  resolveImageNodeMode,
  type ExecutionNodeView,
} from './linghuiExecutionShared';
import {
  getLinghuiImageImportItems,
  resolveLinghuiImagePrimaryImportItem,
} from '../../editors/state/linghuiImageCollections';
import {
  generateImageWithProvider,
} from './linghuiExecutionProviders';
import {
  appendImageCinematicInstruction,
  appendImageFocusInstruction,
  appendImageMarkInstruction,
} from './linghuiImagePromptDirectives';
import {
  generateBatchImagesWithCandidateSelection,
  IMAGE_BATCH_VARIANT_STRATEGY,
} from './linghuiImageBatchSelection';
import { executeDirector3DNode } from './linghuiDirector3DExecutor';
import { executePanoramaNodeWithImageExecutor } from './linghuiPanoramaExecutor';
import { executeAgentNode, executeTextNode } from './linghuiTextAgentExecutors';
import { executeScriptNode, executeStoryboardNode } from './linghuiScriptExecutors';
import { executeAudioNode, executeVideoNode } from './linghuiMediaNodeExecutors';
import type { NodeExecutionProgressHandler } from './linghuiNodeExecutorTypes';
import { createLogger } from '../../../../store/logger';
import { runWithTask } from '../../../../services/taskRunner';
import type { TaskSubType } from '../../../../services/TaskManager';

const imageExecutionLogger = createLogger('LinghuiImageExecution');

export { executeDirector3DNode } from './linghuiDirector3DExecutor';
export { executeAgentNode, executeTextNode } from './linghuiTextAgentExecutors';
export { executeScriptNode, executeStoryboardNode } from './linghuiScriptExecutors';
export { executeAudioNode, executeVideoNode } from './linghuiMediaNodeExecutors';

// 节点类型 → TaskManager subType 映射，便于面板按图标分组
const LINGHUI_NODE_TASK_SUBTYPE: Record<string, TaskSubType> = {
  'linghui/text': 'linghui-text',
  'linghui/agent': 'linghui-agent',
  'linghui/image': 'linghui-image',
  // 全景节点也用 image subtype（任务面板按图标分组时与图片同列）
  'linghui/panorama': 'linghui-image',
  'linghui/video': 'linghui-video',
  'linghui/audio': 'linghui-audio',
  'linghui/script': 'linghui-script',
  // 故事板节点本质上和 script 走同一条 LLM 链路，subtype 复用 linghui-script
  'linghui/storyboard': 'linghui-script',
  // 3D 导演不真正调远程 provider，按 image subtype 分组（导出 lineart 走渲染器）
  'linghui/director3d': 'linghui-image',
};

export async function executeImageNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const source = String(node.properties.source ?? '').trim();
  const properties = node.properties as unknown as LinghuiImageNodeProperties;
  const mode = resolveImageNodeMode({ source, mode: properties.mode });
  const prompt = String(node.properties.prompt ?? '').trim();
  const ttiSelection = String(node.properties.ttiSelection ?? '');
  const batchCount = Math.max(1, Math.min(4, Number(node.properties.batchCount ?? 1)));
  const focusRegion = normalizeLinghuiImageFocusRegion(properties.focusRegion);
  const markPoints = normalizeLinghuiImageMarkPoints(properties.markPoints);
  const activeMarkPoints = markPoints.filter(point => point.enabled);
  const cinematic = normalizeLinghuiImageCinematicConfig(properties.cinematic);
  const hasCinematicDirective = (
    cinematic.lighting !== 'auto'
    || cinematic.focalLength !== 'auto'
    || cinematic.aperture !== 'auto'
  );
  // 画布 UI 选的比例 / 分辨率以前在执行器这层就被丢了 —— provider 永远拿不到用户的选择。
  // 这里收集起来，下面所有 generateImageWithProvider / 批量调用统一透传到 provider.start。
  const aspectRatio = String(properties.aspectRatio ?? '').trim() || undefined;
  const resolution = String(properties.resolution ?? '').trim() || undefined;
  const multiAngleConfig = properties.multiAngle?.enabled === true
    ? {
        endpointPath: properties.multiAngle.endpointPath,
        promptProtocol: properties.multiAngle.promptProtocol,
        azimuth: properties.multiAngle.azimuth,
        elevation: properties.multiAngle.elevation,
        distance: properties.multiAngle.distance,
        sourceReferenceIndex: 0,
      }
    : null;

  if (mode === 'import') {
    const importItems = getLinghuiImageImportItems(properties);
    const primaryImport = resolveLinghuiImagePrimaryImportItem(properties);
    if (!importItems.length) {
      throw new Error('请先上传图片素材');
    }

    const items = importItems.map(item => buildMediaItem({
      kind: 'image',
      source: item.source,
      label: item.label || node.title,
      width: item.width,
      height: item.height,
      mimeType: item.mimeType,
      metadata: item.aspectRatio ? { aspectRatio: item.aspectRatio } : undefined,
    }));
    const primary = items.find(item => item.source === primaryImport?.source) ?? items[0];
    const metadata = { source: primary?.source ?? source, mode: 'import', itemCount: items.length };

    if (items.length > 1) {
      return {
        kind: 'images',
        primary,
        items,
        metadata,
      };
    }

    return {
      kind: 'image',
      primary,
      metadata,
    };
  }

  const upstreamReferenceSources = collectReferenceSources(node.getAllInputImages());
  const textSnippets = collectTextSnippets(node.getAllInputResults(1));
  const promptReferences = node.getPromptReferences();
  const promptReferenceSources = collectLinghuiPromptReferenceImageSources(promptReferences);
  const focusRegionReferenceSources = focusRegion?.enabled && focusRegion.source ? [focusRegion.source] : [];
  const markPointReferenceSources = activeMarkPoints.map(point => point.source).filter(Boolean) as string[];
  const referenceSources = mergeUniqueSources(
    upstreamReferenceSources,
    focusRegionReferenceSources,
    markPointReferenceSources,
    promptReferenceSources,
  );
  const explicitPrompt = mergePromptWithTextInputs(prompt, textSnippets);
  const effectivePrompt = mergePromptWithTextInputs(prompt || node.title, textSnippets);
  const explicitPromptWithFocus = appendImageCinematicInstruction(
    appendImageMarkInstruction(
      appendImageFocusInstruction(explicitPrompt, focusRegion),
      activeMarkPoints,
    ),
    cinematic,
  );
  const effectivePromptWithFocus = appendImageCinematicInstruction(
    appendImageMarkInstruction(
      appendImageFocusInstruction(effectivePrompt, focusRegion),
      activeMarkPoints,
    ),
    cinematic,
  );
  const count = batchCount;
  const placeholderSubtitle = focusRegion?.enabled
    ? '聚焦区域生成'
    : hasCinematicDirective
      ? '电影感生成'
      : (prompt || '图片占位预览');
  const multiAnglePlaceholderSubtitle = focusRegion?.enabled
    ? '聚焦区域生成'
    : hasCinematicDirective
      ? '电影感多角度生成'
      : (prompt || '多角度图片占位预览');

  if (multiAngleConfig) {
    if (!upstreamReferenceSources.length) {
      imageExecutionLogger.warn('灵绘图片节点多角度执行缺少上游图片，保持失败', {
        nodeId: node.id,
        title: node.title,
        promptLength: explicitPrompt.trim().length,
        textInputCount: textSnippets.length,
        ttiSelection,
      });
      throw new Error('多角度生图需要先连接一张上游图片');
    }

    const image = await generateImageWithProvider({
      prompt: explicitPromptWithFocus,
      referenceSources: upstreamReferenceSources,
      ttiSelection,
      aspectRatio,
      resolution,
      promptReferences: [],
      settingsSnapshot: node.settingsSnapshot,
      multiAngle: multiAngleConfig,
      onProgress,
      placeholderTitle: node.title,
      placeholderSubtitle: multiAnglePlaceholderSubtitle,
      signal,
    });

    return {
      kind: 'image',
      primary: image,
      metadata: {
        prompt,
        mode: 'multi-angle',
        multiAngle: properties.multiAngle,
        ...(focusRegion?.enabled ? { focusRegion } : {}),
        ...(activeMarkPoints.length ? { markPoints: activeMarkPoints } : {}),
        ...(hasCinematicDirective ? { cinematic } : {}),
      },
    };
  }

  if (count > 1) {
    const batchResult = await generateBatchImagesWithCandidateSelection({
      prompt: effectivePromptWithFocus,
      count,
      title: node.title,
      placeholderBase: placeholderSubtitle,
      sharedParams: {
        referenceSources,
        ttiSelection,
        aspectRatio,
        resolution,
        promptReferences,
        settingsSnapshot: node.settingsSnapshot,
        onProgress,
        placeholderTitle: node.title,
        placeholderSubtitle,
        signal,
      },
    });

    const primary = batchResult.items[0];
    if (!primary) {
      throw new Error('图片生成未返回有效结果');
    }

    return {
      kind: 'images',
      primary,
      items: batchResult.items,
      metadata: {
        prompt,
        batchCount: count,
        batchMode: 'parallel-variant-prompts',
        variantStrategy: IMAGE_BATCH_VARIANT_STRATEGY,
        candidateSelection: batchResult.candidateSelection,
        similarityDedupe: batchResult.candidateSelection,
        mode: 'generate',
        ...(focusRegion?.enabled ? { focusRegion } : {}),
        ...(activeMarkPoints.length ? { markPoints: activeMarkPoints } : {}),
        ...(hasCinematicDirective ? { cinematic } : {}),
      },
    };
  }

  const image = await generateImageWithProvider({
    prompt: effectivePromptWithFocus,
    referenceSources,
    ttiSelection,
    aspectRatio,
    resolution,
    promptReferences,
    settingsSnapshot: node.settingsSnapshot,
    onProgress,
    placeholderTitle: node.title,
    placeholderSubtitle,
    signal,
  });

  return {
    kind: 'image',
    primary: image,
    metadata: {
      prompt,
      mode: 'generate',
      ...(focusRegion?.enabled ? { focusRegion } : {}),
      ...(activeMarkPoints.length ? { markPoints: activeMarkPoints } : {}),
      ...(hasCinematicDirective ? { cinematic } : {}),
    },
  };
}

export async function executePanoramaNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  return executePanoramaNodeWithImageExecutor(node, executeImageNode, onProgress, signal);
}

async function executeNodeInner(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  switch (node.type) {
    case 'linghui/text':
      return executeTextNode(node, onProgress, signal);
    case 'linghui/agent':
      return executeAgentNode(node, onProgress, signal);
    case 'linghui/image':
      return executeImageNode(node, onProgress, signal);
    case 'linghui/panorama':
      return executePanoramaNode(node, onProgress, signal);
    case 'linghui/video':
      return executeVideoNode(node, onProgress, signal);
    case 'linghui/audio':
      return executeAudioNode(node, onProgress, signal);
    case 'linghui/script':
      return executeScriptNode(node, onProgress, signal);
    case 'linghui/storyboard':
      return executeStoryboardNode(node, onProgress, signal);
    case 'linghui/director3d':
      return executeDirector3DNode(node);
    default:
      throw new Error(`暂不支持执行节点类型：${node.type}`);
  }
}

/**
 * 执行单个灵绘节点。
 *
 * 入口包了 runWithTask：所有 6 类节点（text/agent/image/video/audio/script）的执行
 * 都会作为一条 Task 出现在统一任务面板里，进度通过 ctx.progress 桥接。
 *
 * `taskMeta.projectId` 取激活的灵绘 workspace id（无独立项目时即等于 workspace id），
 * 即用户拍板的"workspaceId 当 projectId 兜底"最简策略。
 */
export async function executeNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
  taskMeta?: { projectId: string; nodeLabel?: string },
): Promise<LinghuiNodeResult> {
  // 没有 projectId 兜底（极少见，比如未激活 workspace 直接执行）则跳过 task 包装
  if (!taskMeta?.projectId) {
    return executeNodeInner(node, onProgress, signal);
  }

  const subType = LINGHUI_NODE_TASK_SUBTYPE[node.type] ?? 'linghui-text';
  const { result } = await runWithTask({
    projectId: taskMeta.projectId,
    category: 'linghui',
    subType,
    type: 'linghui-execution',
    targetType: 'linghui-node',
    targetId: node.id,
    targetName: taskMeta.nodeLabel || node.title || node.id,
    metadata: { nodeType: node.type },
    execute: async (ctx) => {
      // 把节点 onProgress 桥接到 TaskManager；既保留原有 React state 更新，又同步任务面板
      const wrappedProgress: NodeExecutionProgressHandler = (progress, message, partialResult) => {
        ctx.progress(progress, message);
        onProgress?.(progress, message, partialResult);
      };
      return executeNodeInner(node, wrappedProgress, signal);
    },
  });
  return result;
}
