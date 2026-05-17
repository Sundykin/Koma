import type {
  LinghuiExecutionQueueState,
  LinghuiImageNodeProperties,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import {
  IMAGE_ASPECT_RATIOS,
  LINGHUI_IMAGE_APERTURE_PRESETS,
  LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS,
} from '../../../../types/linghui';
import type { ProviderOption } from './ImageNodeEditorUtils';

export function resolveImageNodeRunState(params: {
  nodeId: string;
  nodeRun?: LinghuiNodeRunState;
  executionQueue?: LinghuiExecutionQueueState | null;
  generatedFromNodeId: string;
  generatedSequence: number;
}): {
  isImageGenerating: boolean;
  generateButtonText: string;
  derivedBannerText: string;
  isDerivedFromController: boolean;
} {
  const { nodeId, nodeRun, executionQueue, generatedFromNodeId, generatedSequence } = params;
  const isDerivedFromController = Boolean(generatedFromNodeId);
  const derivedBannerText = isDerivedFromController
    ? `这是控制器节点派生的结果${Number.isFinite(generatedSequence) && generatedSequence > 0 ? ` · 第 ${generatedSequence} 次` : ''}。修改 prompt / 参数请回到上游控制器节点重新生成。`
    : '';
  const generateProgressText = nodeRun?.status === 'running'
    && typeof nodeRun.progress === 'number'
    && Number.isFinite(nodeRun.progress)
    && nodeRun.progress > 0
    ? ` ${Math.max(0, Math.min(100, Math.round(nodeRun.progress)))}%`
    : '';
  const normalizedRunMessage = String(nodeRun?.message ?? '').trim();
  const isExecutionQueueActive = executionQueue?.status === 'running' || executionQueue?.status === 'canceling';
  const isNodeQueuedByExecutionQueue = Boolean(isExecutionQueueActive && executionQueue?.queuedNodeIds.includes(nodeId));
  const isNodeRunningByExecutionQueue = Boolean(isExecutionQueueActive && executionQueue?.runningNodeIds.includes(nodeId));
  const isImageGenerating = nodeRun?.status === 'running' || isNodeRunningByExecutionQueue || isNodeQueuedByExecutionQueue;
  const generateStateLabel = isNodeQueuedByExecutionQueue && nodeRun?.status !== 'running'
    ? '等待图片生成…'
    : normalizedRunMessage && normalizedRunMessage !== '准备执行'
      ? normalizedRunMessage
      : isImageGenerating
        ? '图片生成中'
        : '生成';
  const generateButtonText = isImageGenerating
    ? `${generateStateLabel}${generateProgressText}`
    : isDerivedFromController
      ? '再次生成'
      : '生成';

  return {
    isImageGenerating,
    generateButtonText,
    derivedBannerText,
    isDerivedFromController,
  };
}

export function resolveImageNodeSummaries(params: {
  props: LinghuiImageNodeProperties;
  cinematicConfig: LinghuiImageNodeProperties['cinematic'];
  selectedProvider?: ProviderOption;
  hideBatchCount: boolean;
}): {
  modelSummary: string;
  parameterSummary: string;
  cameraButtonSummary: string;
} {
  const { props, cinematicConfig, selectedProvider, hideBatchCount } = params;
  const aspectRatio = String(props.aspectRatio ?? IMAGE_ASPECT_RATIOS[0]?.value ?? '3:4');
  const resolution = String(props.resolution ?? 'auto');
  const batchCount = Number(props.batchCount ?? 1);
  const labels: string[] = [];
  const focal = LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS.find(option => option.value === cinematicConfig?.focalLength);
  if (focal && focal.value !== 'auto') labels.push(focal.label);
  const aperture = LINGHUI_IMAGE_APERTURE_PRESETS.find(option => option.value === cinematicConfig?.aperture);
  if (aperture && aperture.value !== 'auto') labels.push(aperture.label);
  const cameraSummary = labels.join(' · ');

  return {
    modelSummary: selectedProvider?.label || '未配置生图模型',
    parameterSummary: hideBatchCount
      ? `${aspectRatio} · ${resolution}`
      : `${aspectRatio} · ${resolution} · ${batchCount}张`,
    cameraButtonSummary: cameraSummary ? `镜头 · ${cameraSummary}` : '镜头 自动',
  };
}
