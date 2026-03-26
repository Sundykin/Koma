import React, { useCallback, useEffect, useState } from 'react';
import { Button, Select } from 'antd';
import { ArrowUp, Image as ImageIcon } from 'lucide-react';
import type { LinghuiNodeData, LinghuiVideoRefMode } from '../../types/linghui';
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from '../../types/linghui';
import { loadSettings } from '../../store/settings/core';
import { electronService } from '../../services/electronService';
import { useLinghuiNodeMutation } from './nodes/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from './linghuiPromptReferences';

function getPreviewSource(source?: string): string {
  if (!source) return '';
  if (source.startsWith('http') || source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('koma-local://')) return source;
  return electronService.fs.toLocalUrl(source);
}

interface ProviderOption {
  value: string;
  label: string;
}

const REF_MODES: Array<{ key: LinghuiVideoRefMode; label: string }> = [
  { key: 'all-ref', label: '全能参考' },
  { key: 'first-last-frame', label: '首尾帧' },
];

const DURATION_OPTIONS = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
];

interface VideoNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  referenceImages: Array<{ source?: string; label?: string }>;
  promptReferences?: LinghuiPromptReferenceItem[];
  onRun: () => void;
}

export const VideoNodeEditor: React.FC<VideoNodeEditorProps> = ({
  nodeId,
  nodeData,
  referenceImages,
  promptReferences = [],
  onRun,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties;
  const prompt = String(props.prompt ?? '');
  const itvConfigId = String(props.itvConfigId ?? '');
  const refMode = (props.refMode ?? 'all-ref') as LinghuiVideoRefMode;
  const aspectRatio = String(props.aspectRatio ?? '16:9');
  const resolution = String(props.resolution ?? '720P');
  const duration = Number(props.duration ?? 5);

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const mentionHint = promptReferences.length > 0
    ? '输入 @ 可直接引用上游产物，执行时会自动映射为 @Image N'
    : '连接参考图或图片节点后，才会有可引用的上游产物';

  useEffect(() => {
    loadSettings().then(settings => {
      const builtins = (settings.itvConfigs ?? []).map(c => ({
        value: c.id,
        label: c.name || c.provider,
      }));
      const channels = (settings.channelConfigs ?? [])
        .filter(c => c.enabled && c.capabilities?.includes('itv'))
        .map(c => ({
          value: c.id,
          label: c.name || c.id,
        }));
      setProviders([...builtins, ...channels]);
    });
  }, []);

  const updateProp = useCallback((key: string, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
  }, [nodeId, updateNodeData]);

  const handlePromptChange = useCallback((value: string) => {
    updateProp('prompt', value);
  }, [updateProp]);

  return (
    <div className="linghuiEditorPanel" onMouseDown={e => e.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">视频节点</div>
          <div className="linghuiEditorSubtitle">
            {referenceImages.length > 0
              ? `主参考会取第一张上游图片，其余 ${Math.max(referenceImages.length - 1, 0)} 张作为补充参考`
              : '建议先连接参考图或图片节点，再生成视频'}
          </div>
        </div>
      </div>

      <div className="linghuiEditorRefModes">
        {REF_MODES.map(mode => (
          <button
            key={mode.key}
            className={`linghuiEditorRefModeTab ${refMode === mode.key ? 'isActive' : ''}`}
            onClick={() => updateProp('refMode', mode.key)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {referenceImages.length > 0 && (
        <div className="linghuiEditorRefs">
          {referenceImages.map((ref, i) => {
            const src = getPreviewSource(ref.source);
            return (
              <div key={i} className="linghuiEditorRefThumb">
                {src ? <img src={src} alt={ref.label || `参考 ${i + 1}`} /> : <ImageIcon size={16} />}
                <span className="linghuiEditorRefBadge">{i + 1}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="linghuiEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={handlePromptChange}
          references={promptReferences}
          placeholder="描述镜头动作与节奏，输入 @ 引用上游产物"
          darkTheme
          minHeight="80px"
          maxHeight="160px"
        />
        <div className="linghuiEditorPromptHint">{mentionHint}</div>
      </div>

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarLeft">
          <Select
            size="small"
            className="linghuiEditorSelect"
            value={itvConfigId || undefined}
            placeholder="选择视频渠道"
            onChange={v => updateProp('itvConfigId', v)}
            options={providers}
            popupMatchSelectWidth={false}
            style={{ minWidth: 140 }}
          />

          <Select
            size="small"
            className="linghuiEditorSelect"
            value={`${aspectRatio}·${resolution}·${duration}s`}
            onChange={v => {
              const parts = v.split('·');
              updateProp('aspectRatio', parts[0]);
              updateProp('resolution', parts[1]);
              updateProp('duration', Number(parts[2]?.replace('s', '') ?? 5));
            }}
            popupMatchSelectWidth={false}
            options={VIDEO_ASPECT_RATIOS.flatMap(ar =>
              VIDEO_RESOLUTIONS.flatMap(res =>
                DURATION_OPTIONS.map(d => ({
                  value: `${ar.value}·${res.value}·${d.label}`,
                  label: `${ar.label} · ${res.label} · ${d.label}`,
                })),
              ),
            )}
            style={{ minWidth: 160 }}
          />
        </div>

        <div className="linghuiEditorToolbarRight">
          <Button
            type="primary"
            size="small"
            shape="circle"
            icon={<ArrowUp size={16} />}
            onClick={onRun}
          />
        </div>
      </div>
    </div>
  );
};
