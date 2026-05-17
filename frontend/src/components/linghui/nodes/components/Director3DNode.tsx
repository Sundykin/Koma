/**
 * Director3D 节点卡片（画布上紧凑展示）。
 *
 * 不在卡片里跑 3D（开销大），只显示：
 *   - 标签
 *   - 角色数量、相机 FOV、背景模式 等摘要
 *   - 最近导出的 lineart 缩略（如果有）
 *
 * 完整的 3D 视口在节点编辑器里挂（Director3DNodeEditor）。
 */
import React, { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Camera, Image as ImageIcon, Maximize2, Users } from 'lucide-react';
import type {
  LinghuiDirector3DNodeProperties,
  LinghuiNodeData,
  LinghuiRunStatus,
} from '../../../../types/linghui';
import {
  useLinghuiNodeEditorVisibility,
  useLinghuiNodeInteraction,
  useLinghuiNodeInteractionApi,
  useNodeRunState,
} from '../state/LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveDefaultCompactNodeStyle } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { createDefaultDirector3DScene } from '../../director3d/director3dScene';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
};

function Director3DNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as Partial<LinghuiDirector3DNodeProperties> & {
    lineartDataUrl?: string;
    timelineVideoUrl?: string;
    timelineVideoPosterUrl?: string;
    outputMode?: 'lineart' | 'video';
  };
  const scene = props.scene ?? createDefaultDirector3DScene();
  const lineartDataUrl = props.lineartDataUrl;
  const timelineVideoUrl = props.timelineVideoUrl;
  const timelineVideoPoster = props.timelineVideoPosterUrl;
  const isVideoOutput = props.outputMode === 'video' && Boolean(timelineVideoUrl);
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const interactionApi = useLinghuiNodeInteractionApi();
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/director3d');

  const nodeStyle = cssVars({
    ...resolveDefaultCompactNodeStyle({ thumbHeight: 168, minHeight: 286 }),
    '--linghui-node-border': status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'var(--token-border-base)'),
    '--linghui-accent': nodeData.accent,
    '--linghui-progress': `${runState?.progress ?? 0}%`,
  });

  const handleOpenEditor = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    interactionApi.openNodeEditor(id);
  }, [interactionApi, id]);

  return (
    <div
      className={`linghuiCompactNode linghuiDirector3DNode nopan is-${status} ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''}`}
      data-node-preview-area="true"
      data-view-mode={viewMode}
      style={nodeStyle}
      {...interactionHandlers}
    >
      <LinghuiNodePorts accent={nodeData.accent} inputs={nodeData.inputs} outputs={nodeData.outputs} />

      {/* 预览区：show 视频（有 mp4 时）或线稿图，点这里不展开编辑器 */}
      <div
        className="linghuiCompactThumb linghuiDirector3DCompactThumb"
        data-node-preview-area="true"
      >
        {isVideoOutput ? (
          <video
            className="linghuiDirector3DCompactVideo"
            src={timelineVideoUrl}
            poster={timelineVideoPoster}
            muted
            loop
            playsInline
            controls
            draggable={false}
          />
        ) : lineartDataUrl ? (
          <img src={lineartDataUrl} alt="lineart" draggable={false} />
        ) : (
          <div className="linghuiDirector3DCompactPlaceholder">
            <Camera size={28} />
            <span>3D 导演工作台</span>
          </div>
        )}
      </div>

      <div className="linghuiCompactInfo">
        <div className="linghuiDirector3DCompactHeader">
          <div className="linghuiDirector3DCompactTitle">
            <span className="linghuiDirector3DCompactIcon"><Camera size={13} /></span>
            <EditableCompactNodeLabel nodeId={id} label={nodeData.label} fallbackLabel="3D 导演" />
          </div>
          <span className="linghuiDirector3DCompactMode">{isVideoOutput ? '视频' : '线稿'}</span>
        </div>
        <div className="linghuiDirector3DCompactStats" data-node-preview-area="true">
          <span><Users size={11} /> {scene.actors.length} 人</span>
          <span><Camera size={11} /> {Math.round(scene.camera.fov)}° · {scene.camera.aspectRatio}</span>
          <span><ImageIcon size={11} /> {scene.background.mode === 'panorama' ? '全景' : scene.background.mode === 'image-plane' ? '图片' : scene.background.mode === 'color' ? '纯色' : '空'}</span>
        </div>
        <div className="linghuiDirector3DActionRow" data-node-preview-area="true">
          <span className="linghuiDirector3DDragHint">拖动卡片空白区移动节点</span>
          <button
            type="button"
            className="linghuiDirector3DOpenButton nodrag nopan"
            onPointerDown={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onClick={handleOpenEditor}
            title="打开 3D 导演工作台进行编辑"
            aria-label="打开 3D 导演工作台"
          >
            <Maximize2 size={13} />
            <span>工作台</span>
          </button>
        </div>
        <LinghuiNodeRunError runState={runState} />
        {status === 'running' && (
          <div className="linghuiCompactProgress">
            <div className="linghuiCompactProgressBar" />
          </div>
        )}
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/director3d" /> : null}
    </div>
  );
}

export const Director3DNode = memo(Director3DNodeInner);
