/**
 * 图片生成器（控制器节点）编辑器。
 *
 * 视觉对齐 ImageNodeEditor：
 *  - 顶层 linghuiEditorPanel
 *  - linghuiEditorPrompt 包 LinghuiPromptEditor
 *  - linghuiEditorControlRow：模型按钮 + 参数 Popover（比例·分辨率·张数）+ 生成按钮
 *
 * 行为差异：点击「生成」→ onGenerate() 让 canvas 派生展示节点 + 自动执行；
 * 控制器自身没有 nodeRun，所有出图状态由派生的下游 image 节点承载。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp } from 'lucide-react';
import type {
  LinghuiImageGeneratorNodeProperties,
  LinghuiNodeData,
} from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { listConfiguredModelSelectOptions } from '../../../../providers/channel/resolver';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { useLinghuiActionLock } from '../hooks/useLinghuiActionLock';

interface ProviderOption {
  value: string;
  label: string;
  channelLabel?: string;
  modelLabel?: string;
}

const ASPECT_RATIO_OPTIONS = ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'] as const;
const RESOLUTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];
const BATCH_OPTIONS = [1, 2, 4, 6, 8];

interface ImageGeneratorNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  promptReferences?: LinghuiPromptReferenceItem[];
  /** 点击「生成」时回调，返回新建的展示节点 id */
  onGenerate: () => string | null;
}

export const ImageGeneratorNodeEditor: React.FC<ImageGeneratorNodeEditorProps> = ({
  nodeId,
  nodeData,
  promptReferences = [],
  onGenerate,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiImageGeneratorNodeProperties;
  const prompt = String(props.prompt ?? '');
  const ttiSelection = String(props.ttiSelection ?? '');
  const aspectRatio = String(props.aspectRatio ?? '3:4');
  const resolution = String(props.resolution ?? 'auto');
  const batchCount = Math.max(1, Math.min(8, Math.round(Number(props.batchCount ?? 1))));

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const { locked: isGenerateLocked, runWithActionLock } = useLinghuiActionLock();

  useEffect(() => {
    loadSettings().then(settings => {
      setProviders(listConfiguredModelSelectOptions(settings, 'tti', 'image.text-to-image').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
        channelLabel: option.channelLabel,
        modelLabel: option.modelLabel,
      })));
    });
  }, []);

  const selectedProvider = useMemo(
    () => providers.find(option => option.value === ttiSelection) ?? providers[0],
    [providers, ttiSelection],
  );
  const modelSummary = selectedProvider?.label || '未配置生图模型';
  const parameterSummary = `${aspectRatio} · ${resolution} · ${batchCount}张`;

  const updateProp = useCallback((key: keyof LinghuiImageGeneratorNodeProperties, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
  }, [nodeId, updateNodeData]);

  const providerMenuItems = useMemo<MenuProps['items']>(() => (
    providers.map(provider => ({
      key: provider.value,
      label: (
        <div className="linghuiNodeEditorDropdownOption">
          <div className="linghuiNodeEditorDropdownTitle">{provider.modelLabel || provider.label}</div>
          <div className="linghuiNodeEditorDropdownDesc">
            {provider.channelLabel ? `${provider.channelLabel} / ${provider.label}` : provider.label}
          </div>
        </div>
      ),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        updateProp('ttiSelection', provider.value);
      },
    }))
  ), [providers, updateProp]);

  const handleGenerate = useCallback(() => {
    runWithActionLock(() => {
      onGenerate();
    });
  }, [onGenerate, runWithActionLock]);

  const parametersPopover = (
    <div
      className="linghuiEditorSettingsPopover"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">比例</div>
        <div className="linghuiEditorOptionGrid">
          {ASPECT_RATIO_OPTIONS.map(value => (
            <button
              key={value}
              type="button"
              className={`linghuiEditorOptionTile ${aspectRatio === value ? 'isActive' : ''}`}
              onClick={() => updateProp('aspectRatio', value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">分辨率</div>
        <div className="linghuiEditorOptionGrid isCompact">
          {RESOLUTION_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={`linghuiEditorOptionTile ${resolution === option.value ? 'isActive' : ''}`}
              onClick={() => updateProp('resolution', option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">出图数量</div>
        <div className="linghuiEditorOptionGrid">
          {BATCH_OPTIONS.map(value => (
            <button
              key={value}
              type="button"
              className={`linghuiEditorOptionTile ${batchCount === value ? 'isActive' : ''}`}
              onClick={() => updateProp('batchCount', value)}
            >
              {value}张
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
      <div className="linghuiEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={value => updateProp('prompt', value)}
          references={promptReferences}
          placeholder="输入 @ 引用上游产物"
          surfaceStyle="fusion"
          minHeight="76px"
          maxHeight="176px"
        />
      </div>

      <div className="linghuiEditorControlRow">
        <Dropdown
          trigger={providers.length > 0 ? ['click'] : []}
          menu={{
            items: providerMenuItems,
            selectable: true,
            selectedKeys: selectedProvider ? [selectedProvider.value] : [],
          }}
          classNames={{ root: 'linghuiNodeEditorDropdownMenu' }}
          getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
          styles={{ root: { zIndex: 1200 } }}
        >
          <button
            type="button"
            className={`linghuiEditorInlineTrigger ${providers.length === 0 ? 'isDisabled' : ''}`}
            onClick={event => event.stopPropagation()}
            disabled={providers.length === 0}
          >
            {modelSummary}
          </button>
        </Dropdown>

        <Popover
          trigger="click"
          placement="bottomRight"
          content={parametersPopover}
          overlayClassName="linghuiEditorPopover"
          getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
          zIndex={1200}
        >
          <button
            type="button"
            className="linghuiEditorInlineTrigger"
            onClick={event => event.stopPropagation()}
          >
            {parameterSummary}
          </button>
        </Popover>

        <div className="linghuiEditorActionGroup">
          <Button
            type="primary"
            size="small"
            icon={<ArrowUp size={12} />}
            onClick={handleGenerate}
            disabled={isGenerateLocked || !prompt.trim()}
          >
            生成
          </Button>
        </div>
      </div>
    </div>
  );
};
