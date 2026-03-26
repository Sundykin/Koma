import React, { useCallback, useEffect, useState } from 'react';
import { Button, Dropdown, Select, Tooltip } from 'antd';
import { ArrowUp, Grid3x3, Image as ImageIcon } from 'lucide-react';
import type {
  LinghuiGridType,
  LinghuiNodeData,
} from '../../types/linghui';
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  GRID_TYPES,
} from '../../types/linghui';
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

interface ImageNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  referenceImages: Array<{ source?: string; label?: string }>;
  promptReferences?: LinghuiPromptReferenceItem[];
  onRun: () => void;
}

export const ImageNodeEditor: React.FC<ImageNodeEditorProps> = ({
  nodeId,
  nodeData,
  referenceImages,
  promptReferences = [],
  onRun,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties;
  const prompt = String(props.prompt ?? '');
  const ttiConfigId = String(props.ttiConfigId ?? '');
  const aspectRatio = String(props.aspectRatio ?? '3:4');
  const resolution = String(props.resolution ?? 'auto');
  const gridType = (props.gridType ?? 'none') as LinghuiGridType;
  const batchCount = Number(props.batchCount ?? 4);

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const mentionHint = promptReferences.length > 0
    ? '输入 @ 可直接引用上游图片、封面或文本产物，执行时会自动完成提示词替换'
    : '当前还没有可引用的上游产物，先连接参考图或上游图片节点';

  // 加载可用的 TTI providers
  useEffect(() => {
    loadSettings().then(settings => {
      const builtins = (settings.ttiConfigs ?? []).map(c => ({
        value: c.id,
        label: c.name || c.provider,
      }));
      const channels = (settings.channelConfigs ?? [])
        .filter(c => c.enabled && c.capabilities?.includes('tti'))
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
          <div className="linghuiEditorTitle">图片节点</div>
          <div className="linghuiEditorSubtitle">
            {referenceImages.length > 0
              ? `已注入 ${referenceImages.length} 张上游参考图，执行时会自动带入`
              : '可连接参考图节点作为上游输入'}
          </div>
        </div>
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
          placeholder="描述你想要生成的画面内容，输入 @ 引用上游产物"
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
            value={ttiConfigId || undefined}
            placeholder="选择生图渠道"
            onChange={v => updateProp('ttiConfigId', v)}
            options={providers}
            popupMatchSelectWidth={false}
            style={{ minWidth: 140 }}
          />

          <Select
            size="small"
            className="linghuiEditorSelect"
            value={`${aspectRatio}·${resolution}`}
            onChange={v => {
              const [ar, res] = v.split('·');
              updateProp('aspectRatio', ar);
              updateProp('resolution', res);
            }}
            popupMatchSelectWidth={false}
            options={IMAGE_ASPECT_RATIOS.flatMap(ar =>
              IMAGE_RESOLUTIONS.map(res => ({
                value: `${ar.value}·${res.value}`,
                label: `${ar.label} · ${res.label}`,
              })),
            )}
            style={{ minWidth: 120 }}
          />
        </div>

        <div className="linghuiEditorToolbarRight">
          <Dropdown
            menu={{
              items: GRID_TYPES.map(g => ({
                key: g.value,
                label: g.label,
                onClick: () => updateProp('gridType', g.value),
              })),
              selectedKeys: [gridType],
            }}
            trigger={['click']}
          >
            <Tooltip title="宫格类型">
              <Button size="small" icon={<Grid3x3 size={14} />} type={gridType !== 'none' ? 'primary' : 'default'}>
                {gridType !== 'none' ? gridType : ''}
              </Button>
            </Tooltip>
          </Dropdown>

          <Select
            size="small"
            value={batchCount}
            onChange={v => updateProp('batchCount', v)}
            options={[
              { value: 1, label: '1张' },
              { value: 2, label: '2张' },
              { value: 4, label: '4张' },
            ]}
            popupMatchSelectWidth={false}
            style={{ width: 72 }}
          />

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
