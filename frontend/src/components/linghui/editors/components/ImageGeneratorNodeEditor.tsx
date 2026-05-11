/**
 * 图片生成器（控制器节点）编辑器。
 *
 * UI 要点：
 *  - 只暴露 prompt / 模型选择 / 比例 / batch
 *  - 「生成」按钮：调用 onGenerateImageFromController → canvas 在右侧派生展示节点 + 自动执行
 *  - 显示生成历史摘要：已生成 N 次，最新展示节点 id（可点击跳转）
 *  - 没有结果区域：所有出图状态在派生的下游 image 节点上展现
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, InputNumber, Segmented } from 'antd';
import type { MenuProps } from 'antd';
import { Sparkles } from 'lucide-react';
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

interface ImageGeneratorNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  promptReferences?: LinghuiPromptReferenceItem[];
  /** 点击「生成」时回调，参数是控制器节点 id，返回新建的展示节点 id */
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
  const batchCount = Math.max(1, Math.min(8, Math.round(Number(props.batchCount ?? 1))));
  const generationCount = props.generationCount ?? 0;
  const aliveCount = (props.generatedImageNodeIds ?? []).length;

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
  const modelSummary = selectedProvider?.label || '未配置图片模型';

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

  return (
    <div className="linghuiNodeEditorContent">
      <div className="linghuiEditorField linghuiEditorFieldNoBottomGap">
        <div className="linghuiEditorInlineHeader">
          <span className="linghuiEditorSettingsLabel">提示词</span>
          {generationCount > 0 ? (
            <span className="linghuiEditorSummaryPill">
              已生成 {generationCount} 次
              {aliveCount !== generationCount ? ` · 保留 ${aliveCount}` : ''}
            </span>
          ) : null}
        </div>
        <LinghuiPromptEditor
          value={prompt}
          onChange={value => updateProp('prompt', value)}
          references={promptReferences}
          placeholder="描述你想要生成的画面。例如：暴雨夜的废弃车站，少年的特写，冷蓝色调..."
          surfaceStyle="fusion"
          minHeight="100px"
          maxHeight="220px"
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
          overlayClassName="linghuiNodeEditorDropdownOverlay"
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

        <div className="linghuiEditorInlineTrigger" onClick={event => event.stopPropagation()}>
          <Segmented
            size="small"
            options={ASPECT_RATIO_OPTIONS.map(value => ({ label: value, value }))}
            value={aspectRatio}
            onChange={value => updateProp('aspectRatio', String(value))}
          />
        </div>

        <div className="linghuiEditorInlineTrigger" onClick={event => event.stopPropagation()}>
          <span style={{ marginRight: 6 }}>张数</span>
          <InputNumber
            size="small"
            min={1}
            max={8}
            value={batchCount}
            onChange={value => updateProp('batchCount', typeof value === 'number' ? value : 1)}
            controls
            style={{ width: 60 }}
          />
        </div>

        <div className="linghuiEditorActionGroup">
          <Button
            type="primary"
            size="small"
            icon={<Sparkles size={12} />}
            onClick={handleGenerate}
            disabled={isGenerateLocked || !prompt.trim()}
          >
            生成图片
          </Button>
        </div>
      </div>

      {generationCount === 0 ? (
        <div className="linghuiEditorEmptyState">
          点击「生成图片」后，会在画布右侧新建一个图片展示节点，每次点击都会保留为生成历史。
        </div>
      ) : null}
    </div>
  );
};
