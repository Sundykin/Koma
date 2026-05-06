/**
 * 全景节点编辑器
 *
 * 直接复用图片节点编辑器（提示词、模型选择、运行按钮、设置弹层）。
 * 全景独有的差异都通过 props 注入，而不是在外部再加一个面板：
 *   - aspectRatioOptions：只允许 16:9 和 21:9（全景出图比例的范围）
 *   - hideBatchCount：单图为主，避免一次出多张全景
 *   - extraSettings：在设置弹层底部追加一行「场景类型」（自动 / 室内 / 室外），
 *     写回 properties.panoramaTemplate，由执行器选用对应的模板
 *
 * 720° 预览不在编辑器里渲染——它直接接管节点卡片本身的图片展示区域，
 * 由 ImageNode 在 linghuiType === 'linghui/panorama' 时挂 PanoramaViewport。
 */
import React from 'react';
import type { ImageNodeEditorProps } from './ImageNodeEditor';
import { ImageNodeEditor } from './ImageNodeEditor';
import {
  PANORAMA_TEMPLATE_OPTIONS,
  type PanoramaTemplateKind,
} from '../../panorama/panoramaPromptTemplate';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';

export type PanoramaNodeEditorProps = ImageNodeEditorProps;

const PANORAMA_ASPECT_RATIOS = [
  { label: '16:9', value: '16:9' },
  { label: '21:9', value: '21:9' },
];

function resolveTemplateKind(value: unknown): PanoramaTemplateKind {
  return value === 'indoor' || value === 'outdoor' ? value : 'auto';
}

export const PanoramaNodeEditor: React.FC<PanoramaNodeEditorProps> = (props) => {
  const { nodeId, nodeData } = props;
  const { updateNodeData } = useLinghuiNodeMutation();
  const currentTemplate = resolveTemplateKind(nodeData.properties?.panoramaTemplate);

  const setTemplate = (next: string) => {
    const normalized = resolveTemplateKind(next);
    if (normalized === currentTemplate) return;
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, panoramaTemplate: normalized },
    }));
  };

  return (
    <ImageNodeEditor
      {...props}
      aspectRatioOptions={PANORAMA_ASPECT_RATIOS}
      hideBatchCount
      extraSettings={{
        label: '场景类型',
        value: currentTemplate,
        options: PANORAMA_TEMPLATE_OPTIONS.map(option => ({
          value: option.value,
          label: option.label,
          hint: option.hint,
        })),
        onChange: setTemplate,
      }}
    />
  );
};

export default PanoramaNodeEditor;
