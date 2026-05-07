import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, InputNumber, Popover, Select } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp } from 'lucide-react';
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

  const selectedProvider = useMemo(() => (
    providers.find(option => option.value === llmSelection) ?? providers[0]
  ), [llmSelection, providers]);
  const modelSummary = selectedProvider?.label || '未配置 LLM';
  const settingsSummary = `${maxIterations} 轮 · ${enabledTools.length > 0 ? `${enabledTools.length} 个工具` : '纯推理'}`;

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
    <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">Agent 节点</div>
          <div className="linghuiEditorSubtitle">单 Agent 任务与工具推理</div>
        </div>
      </div>

      <div className="linghuiEditorPrompt linghuiEditorCompactPrompt">
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

      <div className="linghuiEditorField">
        <div className="linghuiEditorInlineHeader">
          <span className="linghuiEditorSettingsLabel">实时输出</span>
          <span className="linghuiEditorSummaryPill">{outputText.length} 字</span>
        </div>
        <div
          className="linghuiNodeTextarea linghuiEditorOutputText"
          style={{ '--linghui-output-min-height': '172px' } as React.CSSProperties}
        >
          {outputText || (isStreaming ? '正在等待 Agent 返回首段内容...' : '执行后会在这里显示实时输出')}
        </div>
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
            {settingsSummary}
          </button>
        </Popover>

        <div className="linghuiEditorActionGroup">
          <Button
            type="primary"
            icon={<ArrowUp size={14} />}
            onClick={handleRun}
            disabled={isRunActionLocked || isStreaming}
            loading={isStreaming}
          >
            执行
          </Button>
        </div>
      </div>
    </div>
  );
};
