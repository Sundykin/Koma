/**
 * 图片生成器（控制器节点）。
 *
 * 与传统 linghui/image 节点的本质差异：
 *  - 没有图片预览区
 *  - 点击「生成」→ canvas 派生新的下游 linghui/image 展示节点，自动连边 + 自动执行
 *  - 多次点击 = 多个下游节点，形成生成历史链
 *  - 节点本身没有 nodeRun（不参与 workflow 调度）
 *
 * 紧凑展示：
 *  - icon + label
 *  - prompt 摘要
 *  - "已生成 X 张" 计数
 *  - "生成" 主按钮（内置在编辑器里，节点 card 上仅展示状态）
 */
import React, { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { ImagePlus } from 'lucide-react';
import type {
  LinghuiImageGeneratorNodeProperties,
  LinghuiNodeData,
} from '../../../../types/linghui';
import {
  useLinghuiNodeEditorVisibility,
  useLinghuiNodeInteraction,
} from '../state/LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveDefaultCompactNodeStyle } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodePorts } from './LinghuiNodeHandle';

function ImageGeneratorNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiImageGeneratorNodeProperties;
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/image-generator');

  const generationCount = props.generationCount ?? 0;
  const aliveCount = (props.generatedImageNodeIds ?? []).length;
  const promptPreview = String(props.prompt ?? '').trim();

  const nodeStyle = cssVars({
    ...resolveDefaultCompactNodeStyle({ thumbHeight: 132, minHeight: 240 }),
    '--linghui-node-border': selected ? nodeData.accent : 'var(--token-border-base)',
    '--linghui-accent': nodeData.accent,
  });

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''}`}
      data-view-mode={viewMode}
      style={nodeStyle}
      {...interactionHandlers}
    >
      <LinghuiNodePorts accent={nodeData.accent} inputs={nodeData.inputs} outputs={nodeData.outputs} />

      <div className="linghuiCompactThumb linghuiCompactTextThumb">
        <div className="linghuiCompactTextGlyph linghuiCompactAccentText">
          <ImagePlus size={28} />
        </div>
        <div className="linghuiCompactTextLines">
          <span className="linghuiCompactAccentLineStrong" />
          <span className="linghuiCompactAccentLineMedium" />
          <span className="linghuiCompactAccentLineSoft" />
        </div>
      </div>

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel
          nodeId={id}
          label={nodeData.label}
          fallbackLabel="图片生成器"
        />
        <span className="linghuiCompactMeta">
          {generationCount > 0
            ? `已生成 ${generationCount} 次${aliveCount !== generationCount ? `（保留 ${aliveCount}）` : ''}`
            : '点击生成 → 右侧新建展示节点'}
        </span>
        {promptPreview ? (
          <div className="linghuiCompactTextExcerpt">
            {promptPreview.slice(0, 72)}
          </div>
        ) : null}
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/image-generator" /> : null}
    </div>
  );
}

export const ImageGeneratorNode = memo(ImageGeneratorNodeInner);
