import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type NodeProps, useStore } from '@xyflow/react';
import { Modal, Button } from 'antd';
import { Film, Image as ImageIcon, Trash2, Combine, Scissors, ChevronUp, ChevronDown, Settings2 } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiVideoClipNodeProperties,
} from '../../../../types/linghui';
import {
  useLinghuiNodeInteraction,
  useLinghuiNodeMutation,
  useNodeRunState,
} from '../state/LinghuiNodeRunsContext';
import { useLinghuiConnectTarget } from '../state/useLinghuiConnectTarget';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { cssVars } from '../../../../theme/runtime';

/**
 * 视频合成节点（VideoClip）。
 *
 * - **自动从上游拉片段**：监听所有指向本节点的入边，把上游 video/image 节点的 source 同步进 clips[]。
 *   节点连线就生效，无需手动编辑。源节点更新 source 时下游同步刷新。
 * - **clips 排序 + 删除**：节点内每条 clip 有上下移按钮 + 删除按钮；编辑后 properties.clips 持久化。
 * - **剪辑详情**：点"打开剪辑"按钮弹 Modal，显示完整剪辑列表 + 导出参数（分辨率 / fps / 图片片段时长）。
 *   这是简版终剪面板；完整时间轴 NLE 留下一阶段做。
 * - **合成**：点"合成视频"按钮 → 由 executor 读取 clips 调 FFmpeg concat 生成最终 mp4。
 *   executor 尚未实现时按钮 disable + 提示"暂未实现"。
 */
interface IncomingClipCandidate {
  id: string;
  kind: 'video' | 'image';
  source: string;
  label?: string;
  durationSec?: number;
}

function VideoClipNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiVideoClipNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const { updateNodeData } = useLinghuiNodeMutation();
  const isConnectTarget = useLinghuiConnectTarget(id);
  const status = runState?.status ?? 'idle';
  const clips = props.clips ?? [];

  // 监听上游：从 edges + nodes 拉出所有 source 为 video/image、target === id 的节点 source。
  const incomingClips = useStore(state => {
    const inEdges = state.edges.filter(e => e.target === id);
    if (inEdges.length === 0) return [] as IncomingClipCandidate[];
    const candidates: IncomingClipCandidate[] = [];
    for (const edge of inEdges) {
      const src = state.nodes.find(n => n.id === edge.source);
      if (!src) continue;
      const srcData = src.data as unknown as LinghuiNodeData | undefined;
      if (!srcData) continue;
      const srcProps = srcData.properties as Record<string, unknown> | undefined;
      const srcSource = String(srcProps?.source ?? '').trim();
      if (!srcSource) continue;
      if (srcData.linghuiType === 'linghui/video') {
        candidates.push({ id: src.id, kind: 'video', source: srcSource, label: srcData.label });
      } else if (srcData.linghuiType === 'linghui/image') {
        candidates.push({ id: src.id, kind: 'image', source: srcSource, label: srcData.label });
      }
    }
    return candidates;
  }, (a, b) => {
    // 浅比较：长度 + 每项 id/source 一致即视为无变化，避免每次 store 变都触发 effect
    if (a.length !== b.length) return false;
    return a.every((item, i) => item.id === b[i].id && item.source === b[i].source);
  });

  // 自动 sync incoming → clips（删除已断开的，加入新连入的，保留用户排序）
  useEffect(() => {
    const currentIds = new Set(clips.map(c => c.id));
    const incomingIds = new Set(incomingClips.map(c => c.id));
    const needsAdd = incomingClips.filter(c => !currentIds.has(c.id));
    const needsRemove = clips.filter(c => !incomingIds.has(c.id));
    if (needsAdd.length === 0 && needsRemove.length === 0) return;

    updateNodeData(id, prev => {
      const prevProps = prev.properties as unknown as LinghuiVideoClipNodeProperties;
      const kept = (prevProps.clips ?? []).filter(c => incomingIds.has(c.id));
      const added = needsAdd.map(c => ({
        id: c.id,
        kind: c.kind,
        source: c.source,
        label: c.label,
        durationSec: c.kind === 'image' ? prevProps.imageDurationSec : undefined,
      }));
      return {
        ...prev,
        properties: {
          ...prev.properties,
          clips: [...kept, ...added],
        } as unknown as Record<string, unknown>,
      };
    }, { markStale: false });
  }, [id, incomingClips, clips, updateNodeData]);

  const totalDurationSec = useMemo(() => clips.reduce(
    (sum, clip) => sum + (clip.durationSec ?? (clip.kind === 'image' ? props.imageDurationSec : 0)),
    0,
  ), [clips, props.imageDurationSec]);

  const moveClip = useCallback((clipId: string, direction: -1 | 1) => {
    updateNodeData(id, prev => {
      const propsLocal = prev.properties as unknown as LinghuiVideoClipNodeProperties;
      const list = (propsLocal.clips ?? []).slice();
      const idx = list.findIndex(c => c.id === clipId);
      const nextIdx = idx + direction;
      if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return prev;
      [list[idx], list[nextIdx]] = [list[nextIdx], list[idx]];
      return { ...prev, properties: { ...prev.properties, clips: list } as unknown as Record<string, unknown> };
    });
  }, [id, updateNodeData]);

  const handleRemoveClip = useCallback((clipId: string) => {
    updateNodeData(id, prev => {
      const propsLocal = prev.properties as unknown as LinghuiVideoClipNodeProperties;
      return {
        ...prev,
        properties: {
          ...prev.properties,
          clips: (propsLocal.clips ?? []).filter(c => c.id !== clipId),
        } as unknown as Record<string, unknown>,
      };
    });
  }, [id, updateNodeData]);

  const [editorOpen, setEditorOpen] = useState(false);
  const nodeStyle = cssVars({ '--linghui-node-width': '320px' });

  return (
    <div
      className={`linghuiCompactNode linghuiVideoClipNode nopan is-${status} ${selected ? 'isSelected' : ''} ${isConnectTarget ? 'isConnectTarget' : ''}`}
      style={nodeStyle}
      {...interactionHandlers}
    >
      <LinghuiNodePorts accent={nodeData.accent} inputs={nodeData.inputs} outputs={nodeData.outputs} />

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel nodeId={id} label={nodeData.label} fallbackLabel="视频合成" />
        <span className="linghuiCompactMeta">
          {clips.length} 段 · {totalDurationSec.toFixed(1)}s · {props.resolution} / {props.fps}fps
        </span>
      </div>

      {clips.length === 0 ? (
        <div className="linghuiVideoClipEmptyHint">
          <Scissors size={20} />
          <span>从上游接入视频 / 图片节点</span>
          <span style={{ opacity: 0.6, fontSize: 11 }}>连线后自动作为合成片段</span>
        </div>
      ) : (
        <ul className="linghuiVideoClipList nodrag nowheel">
          {clips.map((clip, index) => (
            <li key={clip.id} className="linghuiVideoClipListItem">
              <span className="linghuiVideoClipListIndex">{index + 1}</span>
              {clip.kind === 'video' ? <Film size={14} /> : <ImageIcon size={14} />}
              <span className="linghuiVideoClipListLabel">{clip.label || `${clip.kind === 'video' ? '视频' : '图片'} ${index + 1}`}</span>
              <span className="linghuiVideoClipListDuration">
                {(clip.durationSec ?? (clip.kind === 'image' ? props.imageDurationSec : 0)).toFixed(1)}s
              </span>
              <button
                type="button"
                className="linghuiVideoClipListMove nodrag"
                title="上移"
                disabled={index === 0}
                onClick={(event) => { event.stopPropagation(); moveClip(clip.id, -1); }}
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                className="linghuiVideoClipListMove nodrag"
                title="下移"
                disabled={index === clips.length - 1}
                onClick={(event) => { event.stopPropagation(); moveClip(clip.id, 1); }}
              >
                <ChevronDown size={12} />
              </button>
              <button
                type="button"
                className="linghuiVideoClipListClear nodrag"
                title="从合成中移除（不影响上游节点）"
                onClick={(event) => { event.stopPropagation(); handleRemoveClip(clip.id); }}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <LinghuiNodeRunError runState={runState} />

      <div className="linghuiVideoClipFooter">
        <button
          type="button"
          className="linghuiVideoClipFooterButton nodrag"
          disabled={clips.length === 0}
          onClick={(event) => { event.stopPropagation(); setEditorOpen(true); }}
          title="打开剪辑面板调整片段参数"
        >
          <Settings2 size={12} />
          <span>打开剪辑</span>
        </button>
        <button
          type="button"
          className="linghuiVideoClipFooterButton nodrag"
          disabled={clips.length === 0 || status === 'running'}
          onClick={(event) => {
            event.stopPropagation();
            // 合成 executor 暂未接入：占位提示，用户能看到入口存在但知道当前需要等下一轮 FFmpeg 接通。
            Modal.info({
              title: '合成 executor 尚未接入',
              content: '当前版本仅完成 UI + 数据流；FFmpeg concat 链路将在下一轮更新中接通。',
            });
          }}
        >
          <Combine size={12} />
          <span>{status === 'running' ? '合成中…' : '合成视频'}</span>
        </button>
      </div>

      <Modal
        open={editorOpen}
        title="视频合成 · 剪辑详情"
        onCancel={() => setEditorOpen(false)}
        footer={<Button onClick={() => setEditorOpen(false)}>关闭</Button>}
        width={680}
        destroyOnHidden
      >
        <div className="linghuiVideoClipEditorBody">
          <div className="linghuiVideoClipEditorRow">
            <label>导出分辨率</label>
            <select
              value={props.resolution}
              onChange={event => updateNodeData(id, prev => ({
                ...prev,
                properties: { ...prev.properties, resolution: event.target.value as LinghuiVideoClipNodeProperties['resolution'] } as unknown as Record<string, unknown>,
              }))}
            >
              <option value="720p">720P</option>
              <option value="1080p">1080P</option>
              <option value="4K">4K</option>
            </select>
          </div>
          <div className="linghuiVideoClipEditorRow">
            <label>帧率</label>
            <select
              value={props.fps}
              onChange={event => updateNodeData(id, prev => ({
                ...prev,
                properties: { ...prev.properties, fps: Number(event.target.value) as LinghuiVideoClipNodeProperties['fps'] } as unknown as Record<string, unknown>,
              }))}
            >
              <option value={24}>24 fps</option>
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </div>
          <div className="linghuiVideoClipEditorRow">
            <label>图片片段默认时长（秒）</label>
            <input
              type="number"
              min={1}
              max={20}
              step={0.5}
              value={props.imageDurationSec}
              onChange={event => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next) || next <= 0) return;
                updateNodeData(id, prev => ({
                  ...prev,
                  properties: { ...prev.properties, imageDurationSec: next } as unknown as Record<string, unknown>,
                }));
              }}
            />
          </div>
          <div className="linghuiVideoClipEditorClipsHeader">片段列表（{clips.length} 段，共 {totalDurationSec.toFixed(1)}s）</div>
          <ol className="linghuiVideoClipEditorList">
            {clips.map((clip, index) => (
              <li key={clip.id}>
                <span>{index + 1}.</span>
                {clip.kind === 'video' ? <Film size={14} /> : <ImageIcon size={14} />}
                <span style={{ flex: 1 }}>{clip.label || `${clip.kind === 'video' ? '视频' : '图片'} ${index + 1}`}</span>
                <span>{(clip.durationSec ?? (clip.kind === 'image' ? props.imageDurationSec : 0)).toFixed(1)}s</span>
              </li>
            ))}
          </ol>
        </div>
      </Modal>
    </div>
  );
}

export const VideoClipNode = memo(VideoClipNodeInner);
