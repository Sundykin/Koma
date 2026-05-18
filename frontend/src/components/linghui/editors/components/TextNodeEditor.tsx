import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dropdown, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, FileAudio, FileText, Image as ImageIcon, Languages, Loader2, Settings2, Video } from 'lucide-react';
import type { ModelConfig } from '../../../../types';
import type {
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiTextNodeProperties,
} from '../../../../types/linghui';
import { getLinghuiResultText } from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { buildLLMConfigFromContext, listConfiguredModelSelectOptions, resolveConfiguredChannelModel } from '../../../../providers/channel/resolver';
import { createLLMProvider } from '../../../../providers/llm';
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

interface TextNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  promptReferences?: LinghuiPromptReferenceItem[];
  onRun: () => void;
}

const TEXT_GENERATOR_PLACEHOLDER = '写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。';

export const TextNodeEditor: React.FC<TextNodeEditorProps> = ({
  nodeId,
  nodeData,
  nodeRun,
  promptReferences = [],
  onRun,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiTextNodeProperties;
  const prompt = String(props.prompt ?? '');
  const systemPrompt = String(props.systemPrompt ?? '');
  const llmSelection = String(props.llmSelection ?? '');
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState('');

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

  const updateProp = useCallback((key: string, value: unknown, options?: { markStale?: boolean }) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }), options);
  }, [nodeId, updateNodeData]);

  const selectedProvider = useMemo(() => (
    providers.find(option => option.value === llmSelection) ?? providers[0]
  ), [llmSelection, providers]);
  const modelSummary = selectedProvider?.label || '未配置 LLM';
  const systemPromptSummary = systemPrompt.trim() ? '系统提示 · 已设置' : '系统提示';
  const outputText = String(getLinghuiResultText(nodeRun?.result) ?? '').trim();
  const isStreaming = nodeRun?.status === 'running';
  const hasPrompt = Boolean(prompt.trim());
  const canGenerate = hasPrompt || promptReferences.some(ref => ref.kind === 'text' && String(ref.textValue ?? '').trim());
  const { locked: isRunActionLocked, runWithActionLock } = useLinghuiActionLock(isStreaming);

  const handleRun = useCallback(() => {
    updateProp('mode', 'generate', { markStale: false });
    runWithActionLock(onRun);
  }, [onRun, runWithActionLock, updateProp]);

  const handlePromptChange = useCallback((value: string) => {
    setTranslateError('');
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, mode: 'generate', prompt: value },
    }));
  }, [nodeId, updateNodeData]);

  const handleProviderChange = useCallback((provider: ProviderOption) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, mode: 'generate', llmSelection: provider.value },
    }), { markStale: false });
  }, [nodeId, updateNodeData]);

  const buildSelectedLLMConfig = useCallback(async (): Promise<ModelConfig | null> => {
    const settings = await loadSettings();
    const context = resolveConfiguredChannelModel(settings, 'llm', llmSelection || undefined, 'llm.chat');
    if (!context) return null;
    return buildLLMConfigFromContext(context);
  }, [llmSelection]);

  const handleTranslatePrompt = useCallback(async () => {
    const sourcePrompt = prompt.trim();
    if (!sourcePrompt || isTranslating) return;

    setIsTranslating(true);
    setTranslateError('');
    try {
      const config = await buildSelectedLLMConfig();
      if (!config) {
        throw new Error('未配置可用的 LLM 模型');
      }
      const provider = createLLMProvider(config);
      const translated = await provider.generateText(
        [
          'Translate the following prompt between Chinese and English.',
          'Keep @ref_ references, {{...}} tokens, bracketed camera/filler tokens, and line breaks unchanged.',
          'Return only the translated prompt.',
          '',
          sourcePrompt,
        ].join('\n'),
        undefined,
        {
          source: 'linghui',
          operation: 'text-node-prompt-translate',
          taskKind: 'rewrite',
          timeoutMs: 60000,
        },
      );
      const nextPrompt = translated.trim();
      if (nextPrompt && nextPrompt !== sourcePrompt) {
        updateNodeData(nodeId, prev => ({
          ...prev,
          properties: { ...prev.properties, mode: 'generate', prompt: nextPrompt },
        }));
      }
    } catch (error) {
      setTranslateError(error instanceof Error ? error.message : '翻译失败');
    } finally {
      setIsTranslating(false);
    }
  }, [buildSelectedLLMConfig, isTranslating, nodeId, prompt, updateNodeData]);

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
        handleProviderChange(provider);
      },
    }))
  ), [handleProviderChange, providers]);

  const referenceCards = useMemo(() => (
    promptReferences.map((reference, index) => ({
      ...reference,
      badge: String(index + 1),
      preview: reference.previewSource || (typeof reference.source === 'string' ? reference.source : ''),
      text: String(reference.textValue || reference.description || reference.name || '').trim(),
    }))
  ), [promptReferences]);

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
    <div
      className="linghuiEditorPanel linghuiTextGeneratorPanel"
      onMouseDown={event => event.stopPropagation()}
    >
      {referenceCards.length > 0 && (
        <div className="linghuiTextGeneratorRefs" aria-label="上游参考">
          {referenceCards.map(reference => (
            <div className="linghuiTextGeneratorRefCard" key={reference.id} title={reference.name}>
              <div className="linghuiTextGeneratorRefThumb">
                {reference.kind === 'image' && reference.preview ? (
                  <img src={reference.preview} alt="" draggable={false} />
                ) : reference.kind === 'video' && reference.preview ? (
                  <img src={reference.preview} alt="" draggable={false} />
                ) : reference.kind === 'video' ? (
                  <Video size={14} />
                ) : reference.kind === 'audio' ? (
                  <FileAudio size={14} />
                ) : reference.kind === 'text' ? (
                  <FileText size={14} />
                ) : (
                  <ImageIcon size={14} />
                )}
                <span className="linghuiTextGeneratorRefBadge">{reference.badge}</span>
              </div>
              <span className="linghuiTextGeneratorRefName">{reference.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="linghuiEditorPrompt linghuiTextGeneratorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={handlePromptChange}
          references={promptReferences}
          placeholder={TEXT_GENERATOR_PLACEHOLDER}
          surfaceStyle="fusion"
          minHeight="86px"
          maxHeight="168px"
        />
      </div>

      {(outputText || isStreaming) && (
        <div className="linghuiTextGeneratorOutput">
          {outputText || '正在等待模型返回首段内容...'}
        </div>
      )}

      {translateError && (
        <div className="linghuiTextGeneratorError">
          {translateError}
        </div>
      )}

      <div className="linghuiEditorControlRow linghuiTextGeneratorControlRow">
        <Dropdown
          trigger={providers.length > 0 ? ['click'] : []}
          menu={{
            items: providerMenuItems,
            selectable: true,
            selectedKeys: selectedProvider ? [selectedProvider.value] : [],
          }}
          classNames={{ root: 'linghuiNodeEditorDropdownMenu linghuiTextGeneratorDropdownMenu' }}
          getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
          overlayClassName="linghuiNodeEditorDropdownOverlay"
        >
          <button
            type="button"
            className={`linghuiTextGeneratorChip ${providers.length === 0 ? 'isDisabled' : ''}`}
            onClick={event => event.stopPropagation()}
            disabled={providers.length === 0}
            title={modelSummary}
          >
            {modelSummary}
          </button>
        </Dropdown>

        <div className="linghuiTextGeneratorSpacer" />

        <button
          type="button"
          className="linghuiTextGeneratorIconButton"
          onClick={handleTranslatePrompt}
          disabled={!prompt.trim() || isTranslating}
          aria-label="翻译提示词"
          title="翻译提示词"
        >
          {isTranslating ? <Loader2 size={14} className="linghuiTextGeneratorSpinIcon" /> : <Languages size={14} />}
        </button>

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
            className="linghuiTextGeneratorIconButton"
            onClick={event => event.stopPropagation()}
            aria-label={systemPromptSummary}
            title={systemPromptSummary}
          >
            <Settings2 size={14} />
          </button>
        </Popover>

        <div className="linghuiEditorActionGroup">
          <button
            type="button"
            className="linghuiTextGeneratorSubmit"
            onClick={handleRun}
            disabled={isRunActionLocked || isStreaming || !canGenerate}
            aria-label="生成文本"
            title={canGenerate ? '生成文本' : '请先输入提示词'}
          >
            {isStreaming ? (
              <span className="linghuiTextGeneratorSpinner" />
            ) : (
              <ArrowUp size={13} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
