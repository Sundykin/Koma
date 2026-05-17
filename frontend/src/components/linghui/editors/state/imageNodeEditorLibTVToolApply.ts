import type { LinghuiImageNodeProperties, LinghuiNodeData } from '../../../../types/linghui';
import { mergePromptSnippet } from '../components/ImageNodeEditorUtils';

interface ApplyImageToolPresetArgs {
  nodeId: string;
  label?: string;
  promptSnippet: string;
  properties: Partial<LinghuiImageNodeProperties>;
  onApplyImageToolPreset?: (preset: {
    label?: string;
    promptSnippet: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => void;
  onToolChange: (tool: null) => void;
  handleRun: () => void;
  updateNodeData: (
    nodeId: string,
    updater: (previous: LinghuiNodeData) => LinghuiNodeData,
    options?: { markStale?: boolean },
  ) => void;
}

export function applyImageToolPresetOrRun({
  nodeId,
  label,
  promptSnippet,
  properties,
  onApplyImageToolPreset,
  onToolChange,
  handleRun,
  updateNodeData,
}: ApplyImageToolPresetArgs) {
  if (onApplyImageToolPreset) {
    onApplyImageToolPreset({
      label,
      promptSnippet,
      properties,
    });
    onToolChange(null);
    return;
  }

  updateNodeData(nodeId, prev => ({
    ...prev,
    properties: {
      ...prev.properties,
      ...properties,
      prompt: mergePromptSnippet(String((prev.properties as Partial<LinghuiImageNodeProperties>).prompt ?? ''), promptSnippet),
    },
  }));
  onToolChange(null);
  handleRun();
}

export function buildOutpaintPromptSnippet(
  promptSnippet: string,
  outpaintRatio: { top: number; right: number; bottom: number; left: number },
) {
  const direction: string[] = [];
  if (outpaintRatio.top > 0.02) direction.push(`向上扩 ${Math.round(outpaintRatio.top * 100)}%`);
  if (outpaintRatio.right > 0.02) direction.push(`向右扩 ${Math.round(outpaintRatio.right * 100)}%`);
  if (outpaintRatio.bottom > 0.02) direction.push(`向下扩 ${Math.round(outpaintRatio.bottom * 100)}%`);
  if (outpaintRatio.left > 0.02) direction.push(`向左扩 ${Math.round(outpaintRatio.left * 100)}%`);
  const directionSnippet = direction.length > 0 ? `\n扩图方向：${direction.join('，')}。` : '';
  return `${promptSnippet}${directionSnippet}`;
}
