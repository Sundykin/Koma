import React, { useCallback, useEffect, useState } from 'react';
import { Button, Select } from 'antd';
import { ArrowUp, Sparkles } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiTextNodeMode,
  LinghuiTextNodeProperties,
} from '../../types/linghui';
import { loadSettings } from '../../store/settings/core';
import { useLinghuiNodeMutation } from './nodes/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from './linghuiPromptReferences';

interface ProviderOption {
  value: string;
  label: string;
}

interface TextNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
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
  promptReferences = [],
  onRun,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiTextNodeProperties;
  const mode = (props.mode ?? 'manual') as LinghuiTextNodeMode;
  const content = String(props.content ?? '');
  const prompt = String(props.prompt ?? '');
  const systemPrompt = String(props.systemPrompt ?? '');
  const llmConfigId = String(props.llmConfigId ?? '');
  const [providers, setProviders] = useState<ProviderOption[]>([]);

  useEffect(() => {
    loadSettings().then(settings => {
      const builtins = (settings.llmConfigs ?? []).map(config => ({
        value: config.id,
        label: config.name || config.provider,
      }));
      setProviders(builtins);
    });
  }, []);

  const updateProp = useCallback((key: string, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
  }, [nodeId, updateNodeData]);

  const manualHint = '适合承载角色设定、剧情描述、世界观、镜头说明等稳定文本块';
  const generateHint = promptReferences.length > 0
    ? '可输入 @ 引用上游产物，再调用 LLM 生成提示词块或结构化文本'
    : '输入生成文本的要求，运行后会调用已配置的 LLM 生成内容';

  return (
    <div className="linghuiEditorPanel" onMouseDown={e => e.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">文本节点</div>
          <div className="linghuiEditorSubtitle">
            {mode === 'manual' ? '手动保存文本内容，作为下游提示词块或说明块' : '运行后通过 LLM 生成文本，可继续连接到图片或视频节点'}
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
          <div className="linghuiEditorFieldLabel">文本内容</div>
          <textarea
            className="linghuiNodeTextarea"
            placeholder="直接输入或粘贴角色设定、剧情描述、镜头要求等内容"
            value={content}
            onChange={event => updateProp('content', event.target.value)}
            onMouseDown={event => event.stopPropagation()}
            onKeyDown={event => event.stopPropagation()}
            style={{ minHeight: 180 }}
          />
          <div className="linghuiEditorPromptHint">{manualHint}</div>
        </div>
      ) : (
        <>
          <div className="linghuiEditorPrompt">
            <LinghuiPromptEditor
              value={prompt}
              onChange={value => updateProp('prompt', value)}
              references={promptReferences}
              placeholder="描述要生成什么文本，输入 @ 引用上游产物"
              darkTheme
              minHeight="96px"
              maxHeight="180px"
            />
            <div className="linghuiEditorPromptHint">{generateHint}</div>
          </div>

          <div className="linghuiEditorField">
            <div className="linghuiEditorFieldLabel">系统提示</div>
            <textarea
              className="linghuiNodeTextarea"
              placeholder="可选。约束输出风格、结构或语气"
              value={systemPrompt}
              onChange={event => updateProp('systemPrompt', event.target.value)}
              onMouseDown={event => event.stopPropagation()}
              onKeyDown={event => event.stopPropagation()}
              style={{ minHeight: 92 }}
            />
          </div>
        </>
      )}

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarLeft">
          {mode === 'generate' && (
            <>
              <Select
                size="small"
                className="linghuiEditorSelect"
                value={llmConfigId || undefined}
                placeholder="选择 LLM 渠道"
                onChange={value => updateProp('llmConfigId', value)}
                options={providers}
                popupMatchSelectWidth={false}
                style={{ minWidth: 160 }}
              />
              <span className="linghuiEditorInlineHint">
                <Sparkles size={14} />
                生成后结果会展示在节点预览中
              </span>
            </>
          )}
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
