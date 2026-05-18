import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dropdown, InputNumber, Popover, Select } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, FileAudio, FileText, Image as ImageIcon, Settings2, Video, Wand2 } from 'lucide-react';
import { chatIPC, type MCPToolDefinition } from '../../../../chat/ipc';
import type {
  LinghuiAgentNodeProperties,
  LinghuiNodeData,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import { getLinghuiResultText } from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { listConfiguredModelSelectOptions } from '../../../../providers/channel/resolver';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { useLinghuiActionLock } from '../hooks/useLinghuiActionLock';
import {
  LINGHUI_AGENT_PROMPT_PRESETS,
  mergeLinghuiAgentPresetPrompt,
  mergeLinghuiAgentPresetSystemPrompt,
  type LinghuiAgentPromptPreset,
} from '../state/linghuiAgentPromptPresets';

interface ProviderOption {
  value: string;
  label: string;
  channelLabel?: string;
  modelLabel?: string;
}

interface AgentToolOption {
  value: string;
  label: string;
  searchText: string;
}

interface AgentNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  promptReferences?: LinghuiPromptReferenceItem[];
  onRun: () => void;
}

export const AgentNodeEditor: React.FC<AgentNodeEditorProps> = ({
  nodeId,
  nodeData,
  nodeRun,
  promptReferences = [],
  onRun,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiAgentNodeProperties;
  const prompt = String(props.prompt ?? '');
  const systemPrompt = String(props.systemPrompt ?? '');
  const llmSelection = String(props.llmSelection ?? '');
  const enabledTools = Array.isArray(props.enabledTools) ? props.enabledTools.map(item => String(item)) : [];
  const maxIterations = Math.max(1, Number(props.maxIterations ?? 6));
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [toolOptions, setToolOptions] = useState<AgentToolOption[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const outputText = String(getLinghuiResultText(nodeRun?.result) ?? '').trim();
  const isStreaming = nodeRun?.status === 'running';
  const { locked: isRunActionLocked, runWithActionLock } = useLinghuiActionLock(isStreaming);

  const handleRun = useCallback(() => {
    runWithActionLock(onRun);
  }, [onRun, runWithActionLock]);

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

  useEffect(() => {
    if (!chatIPC.isElectron()) {
      setToolOptions([]);
      return;
    }

    setToolsLoading(true);
    chatIPC.tools.listAll()
      .then((tools: MCPToolDefinition[]) => {
        setToolOptions(tools.map(tool => ({
          value: tool.name,
          label: tool.name,
          searchText: `${tool.name} ${tool.description || ''} ${tool.serverName || ''}`.toLowerCase(),
        })));
      })
      .catch(() => {
        setToolOptions([]);
      })
      .finally(() => {
        setToolsLoading(false);
      });
  }, []);

  const updateProp = useCallback((key: string, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
  }, [nodeId, updateNodeData]);

  const handleApplyPromptPreset = useCallback((preset: LinghuiAgentPromptPreset) => {
    updateNodeData(nodeId, prev => {
      const prevProps = prev.properties as Partial<LinghuiAgentNodeProperties>;
      return {
        ...prev,
        properties: {
          ...prev.properties,
          prompt: mergeLinghuiAgentPresetPrompt(String(prevProps.prompt ?? ''), preset),
          systemPrompt: mergeLinghuiAgentPresetSystemPrompt(String(prevProps.systemPrompt ?? ''), preset),
          maxIterations: preset.maxIterations ?? prevProps.maxIterations ?? 6,
        },
      };
    }, { markStale: false });
  }, [nodeId, updateNodeData]);

  const selectedProvider = useMemo(() => (
    providers.find(option => option.value === llmSelection) ?? providers[0]
  ), [llmSelection, providers]);
  const modelSummary = selectedProvider?.label || '未配置 LLM';
  const settingsSummary = `${maxIterations} 轮 · ${enabledTools.length > 0 ? `${enabledTools.length} 个工具` : '纯推理'}`;
  const canRunAgent = Boolean(prompt.trim() || promptReferences.length > 0);
  const referenceCards = useMemo(() => (
    promptReferences.map((reference, index) => ({
      ...reference,
      badge: String(index + 1),
      preview: reference.previewSource || (typeof reference.source === 'string' ? reference.source : ''),
    }))
  ), [promptReferences]);

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
      <div className="linghuiEditorSettingsMetrics">
        <div className="linghuiEditorSettingsBlock">
          <div className="linghuiEditorSettingsLabel">最大迭代数</div>
          <InputNumber
            min={1}
            max={24}
            value={maxIterations}
            onChange={value => updateProp('maxIterations', Math.max(1, Number(value ?? 1)))}
            className="linghuiEditorSettingNumber"
          />
        </div>
        <div className="linghuiEditorSettingsBlock">
          <div className="linghuiEditorSettingsLabel">工具状态</div>
          <div className="linghuiEditorSettingsStat">
            {enabledTools.length > 0 ? `已开放 ${enabledTools.length} 个工具` : '当前为纯推理'}
          </div>
        </div>
      </div>

      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">系统提示</div>
        <textarea
          className="linghuiNodeTextarea linghuiEditorSettingsTextarea"
          placeholder="可选。约束 Agent 的角色、输出格式、工具边界或回答风格"
          value={systemPrompt}
          onChange={event => updateProp('systemPrompt', event.target.value)}
          onMouseDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
        />
      </div>

      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">工具白名单</div>
        <Select
          mode="multiple"
          className="linghuiEditorSelect"
          value={enabledTools}
          placeholder="选择允许当前 Agent 调用的工具"
          onChange={value => updateProp('enabledTools', value)}
          options={toolOptions}
          loading={toolsLoading}
          popupMatchSelectWidth={false}
          optionFilterProp="label"
          filterOption={(input, option) => (
            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            || String((option as { searchText?: string } | undefined)?.searchText ?? '').includes(input.toLowerCase())
          )}
          getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
        />
      </div>
    </div>
  );

  return (
    <div
      className="linghuiEditorPanel linghuiScriptGeneratorPanel linghuiAgentGeneratorPanel"
      onMouseDown={event => event.stopPropagation()}
    >
      {referenceCards.length > 0 ? (
        <div className="linghuiScriptGeneratorRefs" aria-label="上游参考">
          {referenceCards.map(reference => (
            <div className="linghuiScriptGeneratorRefCard" key={reference.id} title={reference.name}>
              <div className="linghuiScriptGeneratorRefThumb">
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
                <span className="linghuiScriptGeneratorRefBadge">{reference.badge}</span>
              </div>
              <span className="linghuiScriptGeneratorRefName">{reference.name}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="linghuiEditorPrompt linghuiScriptGeneratorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={value => updateProp('prompt', value)}
          references={promptReferences}
          placeholder="描述 Agent 目标、输出要求和可用上下文，输入 @ 引用上游产物"
          surfaceStyle="fusion"
          minHeight="76px"
          maxHeight="176px"
        />
      </div>

      <div className="linghuiScriptPresetStrip" aria-label="Agent 任务模板">
        {LINGHUI_AGENT_PROMPT_PRESETS.map(preset => (
          <button
            key={preset.key}
            type="button"
            className="linghuiScriptPresetChip"
            onClick={event => {
              event.stopPropagation();
              handleApplyPromptPreset(preset);
            }}
            title={preset.description}
          >
            <Wand2 size={12} />
            {preset.label}
          </button>
        ))}
      </div>

      {(outputText || isStreaming) ? (
        <div
          className="linghuiTextGeneratorOutput linghuiAgentGeneratorOutput"
          title={`${outputText.length} 字`}
        >
          {outputText || '正在等待 Agent 返回首段内容...'}
        </div>
      ) : null}

      <div className="linghuiEditorControlRow linghuiScriptGeneratorControlRow">
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
            className={`linghuiScriptGeneratorChip ${providers.length === 0 ? 'isDisabled' : ''}`}
            onClick={event => event.stopPropagation()}
            disabled={providers.length === 0}
            title={modelSummary}
          >
            {modelSummary}
          </button>
        </Dropdown>

        <div className="linghuiScriptGeneratorSpacer" />

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
            className="linghuiScriptGeneratorIconButton"
            onClick={event => event.stopPropagation()}
            aria-label={settingsSummary}
            title={settingsSummary}
          >
            <Settings2 size={14} />
          </button>
        </Popover>

        <div className="linghuiEditorActionGroup">
          <button
            type="button"
            className="linghuiScriptGeneratorSubmit"
            onClick={handleRun}
            disabled={isRunActionLocked || isStreaming || !canRunAgent}
            aria-label="执行 Agent"
            title={canRunAgent ? '执行 Agent' : '请先输入任务目标'}
          >
            {isStreaming ? (
              <span className="linghuiScriptGeneratorSpinner" />
            ) : (
              <ArrowUp size={13} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
