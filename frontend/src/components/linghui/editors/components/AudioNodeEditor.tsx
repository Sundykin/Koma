import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Dropdown, Popover, Select } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Music4, Trash2, UploadCloud } from 'lucide-react';
import {
  getLinghuiResultPrimaryMedia,
  type LinghuiAudioNodeProperties,
  type LinghuiNodeData,
  type LinghuiNodeRunState,
} from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { listConfiguredModelSelectOptions } from '../../../../providers/channel/resolver';
import { getProjectTTSProvider } from '../../../../providers';
import { electronService, openFileDialog } from '../../../../services/electronService';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { createLinghuiWorkspaceAsset, importLinghuiWorkspaceAsset } from '../../../../store/linghuiStorage';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { useLinghuiActionLock } from '../hooks/useLinghuiActionLock';

function getPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

function getSourceName(source: string): string {
  if (!source) return '未选择音频';
  if (source.startsWith('data:')) return '已导入本地音频';
  const normalized = source.split('?')[0].split('#')[0];
  return normalized.split(/[\\/]/).pop() || '音频素材';
}

interface ProviderOption {
  value: string;
  label: string;
  channelLabel?: string;
  modelLabel?: string;
}

interface VoiceOption {
  value: string;
  label: string;
}

interface AudioNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  promptReferences?: LinghuiPromptReferenceItem[];
  workspaceId?: string | null;
  onAssetLibraryMutate?: () => void;
  onRun: () => void;
}

export const AudioNodeEditor: React.FC<AudioNodeEditorProps> = ({
  nodeId,
  nodeData,
  nodeRun,
  promptReferences = [],
  workspaceId = null,
  onAssetLibraryMutate,
  onRun,
}) => {
  const { message } = App.useApp();
  const { updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiAudioNodeProperties;
  const source = String(props.source ?? '');
  const prompt = String(props.prompt ?? '');
  const ttsSelection = String(props.ttsSelection ?? '');
  const voiceId = String(props.voiceId ?? '');
  const previewSource = getPreviewSource(source);
  const sourceName = useMemo(() => getSourceName(source), [source]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const generatedAudio = getLinghuiResultPrimaryMedia(nodeRun?.result);
  const generatedAudioSource = getPreviewSource(generatedAudio?.source);
  const generatedAudioLabel = String(generatedAudio?.label ?? nodeData.label ?? '音频结果').trim();
  const generatedAudioDuration = generatedAudio?.durationSec;
  const canReuseGeneratedAudio = !source && Boolean(generatedAudio?.source);
  const isAudioGenerating = nodeRun?.status === 'running';
  const { locked: isRunActionLocked, runWithActionLock } = useLinghuiActionLock(isAudioGenerating);

  const handleRun = useCallback(() => {
    runWithActionLock(onRun);
  }, [onRun, runWithActionLock]);

  useEffect(() => {
    loadSettings().then(settings => {
      setProviders(listConfiguredModelSelectOptions(settings, 'tts', 'speech.text-to-speech').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
        channelLabel: option.channelLabel,
        modelLabel: option.modelLabel,
      })));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadVoices = async () => {
      try {
        const provider = await getProjectTTSProvider(ttsSelection || undefined);
        if (!provider || !provider.validate()) {
          if (!cancelled) {
            setVoiceOptions(voiceId ? [{ value: voiceId, label: `自定义音色 / ${voiceId}` }] : []);
          }
          return;
        }

        const voices = await provider.listVoices();
        if (cancelled) return;

        const nextOptions = voices.map(voice => ({
          value: voice.id,
          label: `${voice.name} / ${voice.language}`,
        }));

        if (voiceId && !nextOptions.some(option => option.value === voiceId)) {
          nextOptions.unshift({ value: voiceId, label: `自定义音色 / ${voiceId}` });
        }

        setVoiceOptions(nextOptions);
      } catch {
        if (!cancelled) {
          setVoiceOptions(voiceId ? [{ value: voiceId, label: `自定义音色 / ${voiceId}` }] : []);
        }
      }
    };

    void loadVoices();

    return () => {
      cancelled = true;
    };
  }, [ttsSelection, voiceId]);

  const updateProp = useCallback((key: string, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
  }, [nodeId, updateNodeData]);

  const applyUploadedAudio = useCallback(async (nextSource: string, filenameHint?: string) => {
    let resolvedSource = nextSource;

    if (
      workspaceId &&
      electronService.isElectron() &&
      nextSource &&
      !nextSource.startsWith('http://') &&
      !nextSource.startsWith('https://') &&
      !nextSource.startsWith('data:') &&
      !nextSource.startsWith('blob:')
    ) {
      resolvedSource = await importLinghuiWorkspaceAsset(workspaceId, nextSource, filenameHint);
    }

    updateNodeData(nodeId, prev => ({
      ...prev,
      label: prev.label === '音频' ? (filenameHint?.replace(/\.[^.]+$/, '') || prev.label) : prev.label,
      properties: {
        ...prev.properties,
        source: resolvedSource,
      },
    }));
  }, [nodeId, updateNodeData, workspaceId]);

  const handleSelectAudio = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }],
        multiple: false,
        title: '选择音频素材',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const filename = filePath.split(/[\\/]/).pop();
        await applyUploadedAudio(filePath, filename);
      }
    } catch (error: any) {
      message.error(error?.message || '选择音频失败');
    }
  }, [applyUploadedAudio, message]);

  const handleDropAudio = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('audio/')) {
      message.warning('请拖入音频文件');
      return;
    }

    try {
      const filePath = (file as File & { path?: string }).path;
      if (filePath) {
        await applyUploadedAudio(filePath, file.name);
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => message.error('读取音频失败');
      reader.onload = async () => {
        await applyUploadedAudio(String(reader.result ?? ''), file.name);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      message.error(error?.message || '导入音频失败');
    }
  }, [applyUploadedAudio, message]);

  const handleClearAudio = useCallback(() => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        source: '',
      },
    }));
  }, [nodeId, updateNodeData]);

  const handleReuseGeneratedAudio = useCallback(() => {
    const nextSource = String(generatedAudio?.source ?? '').trim();
    if (!nextSource) {
      message.info('当前还没有可复用的音频结果');
      return;
    }

    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        source: nextSource,
      },
    }));
    message.success('已将生成结果写回当前节点素材');
  }, [generatedAudio?.source, message, nodeId, updateNodeData]);

  const handleCreateAudioAsset = useCallback(async () => {
    if (!workspaceId) {
      message.warning('请先打开一个灵绘工作区，再保存音频资产');
      return;
    }

    try {
      const asset = await createLinghuiWorkspaceAsset({
        workspaceId,
        nodeId,
        nodeData,
        nodeRun,
      });
      onAssetLibraryMutate?.();
      message.success(`已保存音频资产：${asset.name}`);
    } catch (error: any) {
      message.error(error?.message || '保存音频资产失败');
    }
  }, [message, nodeData, nodeId, nodeRun, onAssetLibraryMutate, workspaceId]);

  const selectedProvider = useMemo(() => (
    providers.find(option => option.value === ttsSelection) ?? providers[0]
  ), [providers, ttsSelection]);
  const selectedVoice = useMemo(() => (
    voiceOptions.find(option => option.value === voiceId)
  ), [voiceId, voiceOptions]);
  const modelSummary = selectedProvider?.label || '未配置 TTS';
  const voiceSummary = selectedVoice?.label || (voiceId ? `音色 / ${voiceId}` : '默认音色');
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
        updateProp('ttsSelection', provider.value);
      },
    }))
  ), [providers, updateProp]);

  const audioSettingsContent = (
    <div
      className="linghuiEditorSettingsPopover"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">音色</div>
        <Select
          className="linghuiEditorSelect"
          value={voiceId || undefined}
          placeholder="选择音色"
          allowClear
          onChange={value => updateProp('voiceId', value ?? '')}
          options={voiceOptions}
          popupMatchSelectWidth={false}
          getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
        />
      </div>
      {generatedAudioSource ? (
        <div className="linghuiEditorSettingsMetrics">
          <div className="linghuiEditorSettingsBlock">
            <div className="linghuiEditorSettingsLabel">最近结果</div>
            <div className="linghuiEditorSettingsStat">{generatedAudioLabel}</div>
          </div>
          {generatedAudioDuration ? (
            <div className="linghuiEditorSettingsBlock">
              <div className="linghuiEditorSettingsLabel">时长</div>
              <div className="linghuiEditorSettingsStat">{Math.max(1, Math.round(generatedAudioDuration))} 秒</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="linghuiEditorPanel" onMouseDown={e => e.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">音频节点</div>
          <div className="linghuiEditorSubtitle">
            {source ? '当前透传本地音频' : '上传音频或生成语音'}
          </div>
        </div>
      </div>

      <div
        className={`linghuiReferenceDropzone linghuiAudioDropzone ${previewSource ? 'hasPreview' : ''}`}
        onDragOver={event => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={handleDropAudio}
        onClick={handleSelectAudio}
        role="button"
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void handleSelectAudio();
          }
        }}
      >
        {previewSource ? (
          <div className="linghuiAudioUploadCard">
            <div className="linghuiAudioUploadIcon">
              <Music4 size={24} />
            </div>
            <div className="linghuiAudioUploadMeta">
              <div className="linghuiAudioUploadTitle">{sourceName}</div>
              <div className="linghuiAudioUploadHint">已挂载到当前音频节点，点击可重新选择</div>
            </div>
            <audio
              className="linghuiNodePreviewAudio"
              src={previewSource}
              controls
              onMouseDown={event => event.stopPropagation()}
              onClick={event => event.stopPropagation()}
            />
          </div>
        ) : (
          <div className="linghuiReferencePlaceholder">
            <UploadCloud size={28} />
            <div>拖入音频到这里</div>
            <div className="linghuiReferencePlaceholderHint">或点击选择本地音频素材</div>
          </div>
        )}
      </div>

      {!source ? (
        <div className="linghuiEditorPrompt linghuiEditorCompactPrompt">
          <LinghuiPromptEditor
            value={prompt}
            onChange={value => updateProp('prompt', value)}
            references={promptReferences}
            placeholder="输入要合成的旁白、对白或音频描述，输入 @ 引用上游产物"
            surfaceStyle="fusion"
            minHeight="96px"
            maxHeight="188px"
          />
        </div>
      ) : null}

      <div className="linghuiEditorControlRow">
        {source ? (
          <span className="linghuiEditorSummaryPill">{sourceName}</span>
        ) : (
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
              content={audioSettingsContent}
              overlayClassName="linghuiEditorPopover"
              getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
              zIndex={1200}
            >
              <button
                type="button"
                className="linghuiEditorInlineTrigger"
                onClick={event => event.stopPropagation()}
              >
                {voiceSummary}
              </button>
            </Popover>

            {generatedAudioSource ? (
              <span className="linghuiEditorSummaryPill">
                {generatedAudioLabel}
                {generatedAudioDuration ? ` · ${Math.max(1, Math.round(generatedAudioDuration))}秒` : ''}
              </span>
            ) : null}
          </>
        )}

        <div className="linghuiEditorActionGroup">
          <Button size="small" icon={<UploadCloud size={14} />} onClick={handleSelectAudio}>
            {source ? '替换音频' : '上传音频'}
          </Button>
          {source ? (
            <Button size="small" icon={<Trash2 size={14} />} danger onClick={handleClearAudio}>
              清空素材
            </Button>
          ) : null}
          {!source && generatedAudioSource ? (
            <>
              <Button size="small" disabled={!canReuseGeneratedAudio} onClick={handleReuseGeneratedAudio}>
                写回素材
              </Button>
              <Button size="small" onClick={() => void handleCreateAudioAsset()}>
                保存为资产
              </Button>
            </>
          ) : null}
          {!source ? (
            <Button
              type="primary"
              icon={<ArrowUp size={14} />}
              onClick={handleRun}
              disabled={isRunActionLocked || isAudioGenerating}
              loading={isAudioGenerating}
            >
              生成
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
