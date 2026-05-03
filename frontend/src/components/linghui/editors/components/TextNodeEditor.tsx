import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiTextNodeMode,
  LinghuiTextNodeProperties,
} from '../../../../types/linghui';
import { getLinghuiResultText } from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { listConfiguredModelSelectOptions } from '../../../../providers/channel/resolver';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';

interface ProviderOption {
  value: string;
  label: string;
  channelLabel?: string;
  modelLabel?: string;
}

interface TextNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  promptReferences?: LinghuiPromptReferenceItem[];
  onRun: () => void;
}

const TEXT_MODES: Array<{ key: LinghuiTextNodeMode; label: string }> = [
  { key: 'manual', label: '手动输入' },
  { key: 'generate', label: 'LLM 生成' },
];

export const TextNodeEditor: React.FC<TextNodeEditorProps> = ({
  nodeId,
  nodeData,
  nodeRun,
  promptReferences = [],
  onRun,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiTextNodeProperties;
  const mode = (props.mode ?? 'manual') as LinghuiTextNodeMode;
  const content = String(props.content ?? '');
  const prompt = String(props.prompt ?? '');
  const systemPrompt = String(props.systemPrompt ?? '');
  const llmSelection = String(props.llmSelection ?? '');
  const [providers, setProviders] = useState<ProviderOption[]>([]);

  useEffect(() => {
    loadSettings().then(settings => {
      setProviders(listConfiguredModelSelectOptions(settings, 'llm', 'llm.chat').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
        channelLabel: option.channelLabel,
        modelLabel: option.modelLabel,
      })));
    });
  }, []);

  const updateProp = useCallback((key: string, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
  }, [nodeId, updateNodeData]);

  const selectedProvider = useMemo(() => (
    providers.find(option => option.value === llmSelection) ?? providers[0]
  ), [llmSelection, providers]);
  const modelSummary = selectedProvider?.label || '未配置 LLM';
  const systemPromptSummary = systemPrompt.trim() ? '系统提示 · 已设置' : '系统提示';
  const contentSummary = content.trim() ? `${content.trim().length} 字` : '手动文本';
  const outputText = String(getLinghuiResultText(nodeRun?.result) ?? '').trim();
  const isStreaming = nodeRun?.status === 'running' && mode === 'generate';

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
        updateProp('llmSelection', provider.value);
      },
    }))
  ), [providers, updateProp]);

  const settingsContent = (
    <div
      className="linghuiEditorSettingsPopover"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">系统提示</div>
        <textarea
          className="linghuiNodeTextarea linghuiEditorSettingsTextarea"
          placeholder="可选。约束输出风格、结构或语气"
          value={systemPrompt}
          onChange={event => updateProp('systemPrompt', event.target.value)}
          onMouseDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
        />
      </div>
    </div>
  );

  return (
    <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">文本节点</div>
          <div className="linghuiEditorSubtitle">
            {mode === 'manual' ? '直接编辑文本块' : '通过 LLM 生成文本内容'}
          </div>
        </div>
      </div>

      <div className="linghuiEditorRefModes">
        {TEXT_MODES.map(item => (
          <button
            key={item.key}
            className={`linghuiEditorRefModeTab ${mode === item.key ? 'isActive' : ''}`}
            onClick={() => updateProp('mode', item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === 'manual' ? (
        <div className="linghuiEditorField">
        <textarea
          className="linghuiNodeTextarea"
          placeholder="直接输入或粘贴角色设定、剧情描述、镜头要求等内容"
          value={content}
          onChange={event => updateProp('content', event.target.value)}
          onMouseDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
          style={{ '--linghui-textarea-min-height': '196px' } as React.CSSProperties}
        />
        </div>
      ) : (
        <>
          <div className="linghuiEditorPrompt linghuiEditorCompactPrompt">
            <LinghuiPromptEditor
              value={prompt}
              onChange={value => updateProp('prompt', value)}
              references={promptReferences}
              placeholder="描述要生成什么文本，输入 @ 引用上游产物"
              surfaceStyle="fusion"
              minHeight="112px"
              maxHeight="220px"
            />
          </div>

          <div className="linghuiEditorField">
            <div className="linghuiEditorInlineHeader">
              <span className="linghuiEditorSettingsLabel">实时输出</span>
              <span className="linghuiEditorSummaryPill">{outputText.length} 字</span>
            </div>
            <div
              className="linghuiNodeTextarea linghuiEditorOutputText"
              style={{ '--linghui-output-min-height': '196px' } as React.CSSProperties}
            >
              {outputText || (isStreaming ? '正在等待模型返回首段内容...' : '运行后会在这里显示实时文本结果')}
            </div>
          </div>
        </>
      )}

      <div className="linghuiEditorControlRow">
        {mode === 'generate' ? (
          <>
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

            <Popover
              trigger="click"
              placement="bottomRight"
              content={settingsContent}
              overlayClassName="linghuiEditorPopover"
              getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
              zIndex={1200}
            >
              <button
                type="button"
                className="linghuiEditorInlineTrigger"
                onClick={event => event.stopPropagation()}
              >
                {systemPromptSummary}
              </button>
            </Popover>
          </>
        ) : (
          <span className="linghuiEditorSummaryPill">{contentSummary}</span>
        )}

        <div className="linghuiEditorActionGroup">
          <Button
            type="primary"
            icon={<ArrowUp size={14} />}
            onClick={onRun}
          >
            {mode === 'generate' ? '生成' : '应用'}
          </Button>
        </div>
      </div>
    </div>
  );
};
