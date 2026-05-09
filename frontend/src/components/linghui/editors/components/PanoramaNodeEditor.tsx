/**
 * 全景节点编辑器
 *
 * 直接复用图片节点编辑器（提示词、模型选择、运行按钮、设置弹层）。
 * 全景独有的差异都通过 props 注入：
 *   - aspectRatioOptions：根据 projectionMode 动态筛选（ar720-band 给 16/21:9；2:1 球面只给 2:1）
 *   - hideBatchCount：单图为主，避免一次出多张全景
 *   - extraSettings：分两段
 *      - "投影模式"：ar720-band / equirectangular-2to1 / flat-wide
 *      - "场景类型"：自动 / 室内 / 室外
 *
 * 节点卡片本体的全景预览仍由 ImageNode 渲染，这里聚焦在编辑/调试侧。
 * 在主结果存在时，编辑器底部会渲染 seam 诊断面板（左右边界 + 横向重复 + 风险等级）。
 */
import React, { useEffect, useMemo } from 'react';
import type { ImageNodeEditorProps } from './ImageNodeEditor';
import { ImageNodeEditor } from './ImageNodeEditor';
import {
  PANORAMA_TEMPLATE_OPTIONS,
  type PanoramaTemplateKind,
} from '../../panorama/panoramaPromptTemplate';
import {
  PANORAMA_PROJECTION_OPTIONS,
  isAspectRatioAllowedForProjection,
  resolvePanoramaProjectionMode,
} from '../../panorama/panoramaProjection';
import { PanoramaSeamDiagnostics } from '../../panorama/PanoramaSeamDiagnostics';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { resolveLinghuiImageCollection } from '../state/linghuiImageCollections';

export type PanoramaNodeEditorProps = ImageNodeEditorProps;

function resolveTemplateKind(value: unknown): PanoramaTemplateKind {
  return value === 'indoor' || value === 'outdoor' ? value : 'auto';
}

export const PanoramaNodeEditor: React.FC<PanoramaNodeEditorProps> = (props) => {
  const { nodeId, nodeData, nodeRun } = props;
  const { updateNodeData } = useLinghuiNodeMutation();
  const currentTemplate = resolveTemplateKind(nodeData.properties?.panoramaTemplate);
  const currentProjection = resolvePanoramaProjectionMode(nodeData.properties?.projectionMode);

  const aspectRatioOptions = useMemo(() => {
    const option = PANORAMA_PROJECTION_OPTIONS.find(item => item.value === currentProjection);
    const allowed = option?.allowedAspectRatios ?? ['16:9', '21:9'];
    return allowed.map(ratio => ({ label: ratio, value: ratio }));
  }, [currentProjection]);

  // 切换投影模式后，如果当前比例已不再合法，自动归位到该模式的默认比例。
  useEffect(() => {
    const currentRatio = String(nodeData.properties?.aspectRatio ?? '').trim();
    if (!currentRatio) return;
    if (!isAspectRatioAllowedForProjection(currentRatio, currentProjection)) {
      const option = PANORAMA_PROJECTION_OPTIONS.find(item => item.value === currentProjection);
      const nextRatio = option?.defaultAspectRatio ?? '21:9';
      updateNodeData(nodeId, prev => ({
        ...prev,
        properties: { ...prev.properties, aspectRatio: nextRatio },
      }));
    }
  }, [currentProjection, nodeData.properties?.aspectRatio, nodeId, updateNodeData]);

  const setTemplate = (next: string) => {
    const normalized = resolveTemplateKind(next);
    if (normalized === currentTemplate) return;
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, panoramaTemplate: normalized },
    }));
  };

  const setProjection = (next: string) => {
    const normalized = resolvePanoramaProjectionMode(next);
    if (normalized === currentProjection) return;
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, projectionMode: normalized },
    }));
  };

  // 取节点当前主结果，用于 seam 诊断
  const collection = useMemo(
    () => resolveLinghuiImageCollection(nodeData.properties as never, nodeRun?.result),
    [nodeData.properties, nodeRun?.result],
  );
  const seamPreviewUrl = collection.primary?.source || '';

  return (
    <>
      <ImageNodeEditor
        {...props}
        aspectRatioOptions={aspectRatioOptions}
        hideBatchCount
        extraSettings={[
          {
            label: '投影模式',
            value: currentProjection,
            options: PANORAMA_PROJECTION_OPTIONS.map(option => ({
              value: option.value,
              label: option.label,
              hint: option.hint,
            })),
            onChange: setProjection,
          },
          {
            label: '场景类型',
            value: currentTemplate,
            options: PANORAMA_TEMPLATE_OPTIONS.map(option => ({
              value: option.value,
              label: option.label,
              hint: option.hint,
            })),
            onChange: setTemplate,
          },
        ]}
      />
      {seamPreviewUrl ? (
        <PanoramaSeamDiagnostics imageUrl={seamPreviewUrl} className="linghuiPanoramaSeamSection" />
      ) : null}
    </>
  );
};

export default PanoramaNodeEditor;
