import React, { useCallback, useEffect, useState } from 'react';
import { Button, InputNumber, Select } from 'antd';
import { ArrowUp, Sparkles, Wrench } from 'lucide-react';
import { chatIPC, type MCPToolDefinition } from '../../../../chat/ipc';
import type {
  LinghuiAgentNodeProperties,
  LinghuiNodeData,
} from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { listConfiguredModelSelectOptions } from '../../../../providers/channel/resolver';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';

interface ProviderOption {
  value: string;
  label: string;
}

interface AgentToolOption {
  value: string;
  label: string;
  searchText: string;
}

interface AgentNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  promptReferences?: LinghuiPromptReferenceItem[];
  onRun: () => void;
}

export const AgentNodeEditor: React.FC<AgentNodeEditorProps> = ({
  nodeId,
  nodeData,
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

  useEffect(() => {
    loadSettings().then(settings => {
      setProviders(listConfiguredModelSelectOptions(settings, 'llm', 'llm.chat').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
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

  const promptHint = promptReferences.length > 0
    ? '可输入 @ 引用上游文本或图片参考，运行时会把文本并入消息、把图片作为视觉参考发送给 Agent'
    : '输入 Agent 任务说明，运行时会把上游文本并入消息、把上游图片作为视觉参考发送给 Agent';

  return (
    <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">Agent 节点</div>
          <div className="linghuiEditorSubtitle">
            复用 chat Agent 推理与工具调用能力，在画布里执行单 Agent 任务并输出文本结果
          </div>
        </div>
      </div>

      <div className="linghuiEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={value => updateProp('prompt', value)}
          references={promptReferences}
          placeholder="描述 Agent 目标、输出要求和可用上下文，输入 @ 引用上游产物"
          darkTheme
          minHeight="112px"
          maxHeight="220px"
        />
        <div className="linghuiEditorPromptHint">{promptHint}</div>
      </div>

      <div className="linghuiEditorField">
        <div className="linghuiEditorFieldLabel">系统提示</div>
        <textarea
          className="linghuiNodeTextarea"
          placeholder="可选。约束 Agent 的角色、输出格式、工具使用边界或回答风格"
          value={systemPrompt}
          onChange={event => updateProp('systemPrompt', event.target.value)}
          onMouseDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
          style={{ minHeight: 100 }}
        />
      </div>

      <div className="linghuiEditorFieldGrid">
        <div className="linghuiEditorField">
          <div className="linghuiEditorFieldLabel">LLM 渠道</div>
          <Select
            size="small"
            className="linghuiEditorSelect"
            value={llmSelection || undefined}
            placeholder="选择对话模型"
            onChange={value => updateProp('llmSelection', value)}
            options={providers}
            popupMatchSelectWidth={false}
          />
        </div>

        <div className="linghuiEditorField">
          <div className="linghuiEditorFieldLabel">最大迭代数</div>
          <InputNumber
            size="small"
            min={1}
            max={24}
            value={maxIterations}
            onChange={value => updateProp('maxIterations', Math.max(1, Number(value ?? 1)))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div className="linghuiEditorField">
        <div className="linghuiEditorFieldLabel">工具白名单</div>
        <Select
          mode="multiple"
          size="small"
          className="linghuiEditorSelect"
          value={enabledTools}
          placeholder="选择允许当前 Agent 调用的工具，不选则仅做纯文本推理"
          onChange={value => updateProp('enabledTools', value)}
          options={toolOptions}
          loading={toolsLoading}
          popupMatchSelectWidth={false}
          optionFilterProp="label"
          filterOption={(input, option) => (
            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            || String((option as { searchText?: string } | undefined)?.searchText ?? '').includes(input.toLowerCase())
          )}
          style={{ width: '100%' }}
        />
        <div className="linghuiEditorPromptHint">
          只会向当前节点暴露这里选中的工具；未选工具不会进入本次 Agent 会话。
        </div>
      </div>

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarLeft">
          <span className="linghuiEditorInlineHint">
            <Wrench size={14} />
            {enabledTools.length > 0 ? `已开放 ${enabledTools.length} 个工具` : '未选工具时仅使用模型推理'}
          </span>
          <span className="linghuiEditorInlineHint">
            <Sparkles size={14} />
            首版仅支持文本结果，以及上游文本和图片输入
          </span>
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
