/**
 * 故事板节点编辑器（剧情→分镜 傻瓜版）。
 *
 * 与脚本节点的差异：
 *  - 没有 mode 切换：只有"生成"路径
 *  - 没有系统提示设置入口：systemPrompt 完全由 executor 内置生成，用户不可改
 *  - 只暴露剧情大纲输入框 + LLM 选择 + 目标镜头数 + 视图模式
 *  - shot 列表渲染、派生镜头文本、生成分镜图、生成视频流程完全复用 ScriptNodeEditor 已有的 UI
 *    （通过同样的 onDeriveShots / onGenerateImages / onGenerateVideos props 透传）
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Dropdown, InputNumber, Modal } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Expand, Image as ImageIcon, LayoutGrid, Rows3, Video, Wand2 } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiStoryboardFrame,
  LinghuiStoryboardNodeProperties,
} from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
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

interface StoryboardNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  promptReferences?: LinghuiPromptReferenceItem[];
  onRun: () => void;
  onDeriveShots: (shots: LinghuiStoryboardFrame[]) => void;
  onGenerateImages: (shots: LinghuiStoryboardFrame[]) => void;
  onGenerateVideos: (shots: LinghuiStoryboardFrame[]) => void;
}

function toPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

function StoryboardShotCards(props: {
  shots: LinghuiStoryboardFrame[];
  selectedShotIds: string[];
  onToggleShot: (shotId: string, checked: boolean) => void;
}) {
  const selectedSet = new Set(props.selectedShotIds);

  return (
    <div className="linghuiScriptShotGrid">
      {props.shots.map((shot, index) => {
        const previewSource = toPreviewSource(shot.image?.source);
        const checked = selectedSet.has(shot.id);

        return (
          <label key={shot.id} className={`linghuiScriptShotCard ${checked ? 'isSelected' : ''}`}>
            <div className="linghuiScriptShotCardHeader">
              <Checkbox
                checked={checked}
                onChange={event => props.onToggleShot(shot.id, event.target.checked)}
              />
              <span className="linghuiScriptShotIndex">#{index + 1}</span>
              <span className="linghuiScriptShotDuration">{Math.max(1, Math.round(shot.durationSec || 3))} 秒</span>
            </div>
            {previewSource ? (
              <div className="linghuiScriptShotPreview">
                <img src={previewSource} alt={shot.title} />
              </div>
            ) : null}
            <div className="linghuiScriptShotTitle">{shot.title || `镜头 ${index + 1}`}</div>
            <div className="linghuiScriptShotDescription">{shot.description || '暂无镜头描述'}</div>
          </label>
        );
      })}
    </div>
  );
}

function StoryboardShotTable(props: {
  shots: LinghuiStoryboardFrame[];
  selectedShotIds: string[];
  onToggleShot: (shotId: string, checked: boolean) => void;
}) {
  const selectedSet = new Set(props.selectedShotIds);

  return (
    <div className="linghuiScriptShotTableWrap">
      <table className="linghuiScriptShotTable">
        <thead>
          <tr>
            <th />
            <th>镜头</th>
            <th>描述</th>
            <th>时长</th>
          </tr>
        </thead>
        <tbody>
          {props.shots.map((shot, index) => (
            <tr key={shot.id} className={selectedSet.has(shot.id) ? 'isSelected' : ''}>
              <td>
                <Checkbox
                  checked={selectedSet.has(shot.id)}
                  onChange={event => props.onToggleShot(shot.id, event.target.checked)}
                />
              </td>
              <td>{shot.title || `镜头 ${index + 1}`}</td>
              <td>{shot.description || '暂无镜头描述'}</td>
              <td>{Math.max(1, Math.round(shot.durationSec || 3))} 秒</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const StoryboardNodeEditor: React.FC<StoryboardNodeEditorProps> = ({
  nodeId,
  nodeData,
  nodeRun,
  promptReferences = [],
  onRun,
  onDeriveShots,
  onGenerateImages,
  onGenerateVideos,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiStoryboardNodeProperties;
  const prompt = String(props.prompt ?? '');
  const llmSelection = String(props.llmSelection ?? '');
  const targetShotCount = Math.max(4, Math.min(24, Math.round(Number(props.targetShotCount ?? 8))));
  const viewMode = props.viewMode === 'table' ? 'table' : 'cards';
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const isGenerating = nodeRun?.status === 'running';
  const { locked: isRunActionLocked, runWithActionLock } = useLinghuiActionLock(isGenerating);
  const { locked: isGenerateImagesLocked, runWithActionLock: runGenerateImagesWithLock } = useLinghuiActionLock();
  const { locked: isGenerateVideosLocked, runWithActionLock: runGenerateVideosWithLock } = useLinghuiActionLock();

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

  const previewState = useMemo(() => {
    if (nodeRun?.result?.kind === 'storyboard') {
      return {
        shots: nodeRun.result.shots ?? [],
        formattedText: String(nodeRun.result.text ?? ''),
        source: (nodeRun.status === 'running' ? 'stream' : 'result') as 'stream' | 'result',
      };
    }
    return {
      shots: [] as LinghuiStoryboardFrame[],
      formattedText: '',
      source: 'plain' as const,
    };
  }, [nodeRun]);

  useEffect(() => {
    const availableIds = new Set(previewState.shots.map(shot => shot.id));
    setSelectedShotIds(prev => {
      const filtered = prev.filter(id => availableIds.has(id));
      if (previewState.shots.length === 0) return [];
      if (filtered.length > 0) return filtered;
      return previewState.shots.map(shot => shot.id);
    });
  }, [previewState.shots]);

  const updateProp = useCallback((key: keyof LinghuiStoryboardNodeProperties, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
  }, [nodeId, updateNodeData]);

  const handleRun = useCallback(() => {
    runWithActionLock(onRun);
  }, [onRun, runWithActionLock]);

  const handleGenerateImages = useCallback((shots: LinghuiStoryboardFrame[]) => {
    runGenerateImagesWithLock(() => onGenerateImages(shots));
  }, [onGenerateImages, runGenerateImagesWithLock]);

  const handleGenerateVideos = useCallback((shots: LinghuiStoryboardFrame[]) => {
    runGenerateVideosWithLock(() => onGenerateVideos(shots));
  }, [onGenerateVideos, runGenerateVideosWithLock]);

  const handleToggleShot = useCallback((shotId: string, checked: boolean) => {
    setSelectedShotIds(prev => {
      if (checked) return prev.includes(shotId) ? prev : [...prev, shotId];
      return prev.filter(id => id !== shotId);
    });
  }, []);

  const selectedCount = selectedShotIds.length;
  const shotCount = previewState.shots.length;
  const selectedProvider = useMemo(
    () => providers.find(option => option.value === llmSelection) ?? providers[0],
    [llmSelection, providers],
  );
  const modelSummary = selectedProvider?.label || '未配置 LLM';
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

  const renderShotView = (immersive = false) => {
    if (!previewState.shots.length) {
      if (previewState.formattedText.trim()) {
        return (
          <div className="linghuiEditorField linghuiEditorFieldNoBottomGap">
            <div className="linghuiEditorInlineHeader">
              <span className="linghuiEditorSettingsLabel">{nodeRun?.status === 'running' ? '实时输出' : '生成结果'}</span>
              <span className="linghuiEditorSummaryPill">{previewState.formattedText.trim().length} 字</span>
            </div>
            <div
              className="linghuiNodeTextarea linghuiEditorOutputText"
              style={{ '--linghui-output-min-height': `${immersive ? 420 : 260}px` } as React.CSSProperties}
            >
              {previewState.formattedText}
            </div>
          </div>
        );
      }
      return (
        <div className="linghuiEditorEmptyState">
          填写左侧"剧情大纲"，点击生成即可自动拆分镜。
        </div>
      );
    }

    const selectedShots = previewState.shots.filter(shot => selectedShotIds.includes(shot.id));

    return (
      <>
        <div className="linghuiScriptPanelHeader">
          <div className="linghuiScriptPanelMeta">
            <span>{shotCount} 个镜头</span>
            <span>{selectedCount} 个已选</span>
            <span>故事板</span>
          </div>
          <div className="linghuiScriptPanelActions">
            <button
              type="button"
              className={`linghuiEditorToolChip ${viewMode === 'cards' ? 'isActive' : ''}`}
              onClick={() => updateProp('viewMode', 'cards')}
            >
              <LayoutGrid size={14} />
              卡片
            </button>
            <button
              type="button"
              className={`linghuiEditorToolChip ${viewMode === 'table' ? 'isActive' : ''}`}
              onClick={() => updateProp('viewMode', 'table')}
            >
              <Rows3 size={14} />
              表格
            </button>
            <Button size="small" onClick={() => setSelectedShotIds(previewState.shots.map(shot => shot.id))}>
              全选
            </Button>
            {!immersive && (
              <Button size="small" icon={<Expand size={14} />} onClick={() => setImmersiveOpen(true)}>
                全屏
              </Button>
            )}
            <Button
              size="small"
              icon={<Wand2 size={14} />}
              disabled={!selectedCount}
              onClick={() => onDeriveShots(selectedShots)}
            >
              派生镜头文本
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<ImageIcon size={14} />}
              disabled={!selectedCount || isGenerateImagesLocked}
              onClick={() => handleGenerateImages(selectedShots)}
            >
              生成分镜图
            </Button>
            <Button
              size="small"
              icon={<Video size={14} />}
              disabled={!selectedCount || isGenerateVideosLocked}
              onClick={() => handleGenerateVideos(selectedShots)}
            >
              生成视频流程
            </Button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <StoryboardShotTable
            shots={previewState.shots}
            selectedShotIds={selectedShotIds}
            onToggleShot={handleToggleShot}
          />
        ) : (
          <StoryboardShotCards
            shots={previewState.shots}
            selectedShotIds={selectedShotIds}
            onToggleShot={handleToggleShot}
          />
        )}
      </>
    );
  };

  return (
    <>
      <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
        <div className="linghuiEditorHeader">
          <div>
            <div className="linghuiEditorTitle">故事板节点</div>
            <div className="linghuiEditorSubtitle">
              只填剧情大纲，内置导演级提示词自动拆出可拍摄分镜
            </div>
          </div>
        </div>

        <div className="linghuiEditorPrompt linghuiEditorCompactPrompt">
          <LinghuiPromptEditor
            value={prompt}
            onChange={value => updateProp('prompt', value)}
            references={promptReferences}
            placeholder="用 1-3 段描述剧情：人物关系、地点、冲突、节奏与情感走向。例如：&#10;暴雨夜的废弃车站，少年与神秘女子第一次相遇，对方留下半枚硬币便消失在月台尽头..."
            surfaceStyle="fusion"
            minHeight="120px"
            maxHeight="260px"
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
            <span style={{ marginRight: 6 }}>目标镜头</span>
            <InputNumber
              size="small"
              min={4}
              max={24}
              value={targetShotCount}
              onChange={value => updateProp('targetShotCount', typeof value === 'number' ? value : 8)}
              controls
              style={{ width: 64 }}
            />
          </div>

          <div className="linghuiEditorActionGroup">
            <Button
              type="primary"
              size="small"
              icon={<ArrowUp size={12} />}
              onClick={handleRun}
              disabled={isRunActionLocked || isGenerating}
              loading={isGenerating}
            >
              生成故事板
            </Button>
          </div>
        </div>

        <div className="linghuiScriptPanel">
          {renderShotView()}
        </div>
      </div>

      <Modal
        open={immersiveOpen}
        onCancel={() => setImmersiveOpen(false)}
        footer={null}
        width={1040}
        title={`${nodeData.label} · 沉浸式故事板视图`}
        className="linghuiScriptImmersiveModal"
        destroyOnHidden={false}
      >
        {renderShotView(true)}
      </Modal>
    </>
  );
};

export default StoryboardNodeEditor;
