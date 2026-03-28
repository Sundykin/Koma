import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Select } from 'antd';
import { ArrowUp, Music4, Trash2, UploadCloud } from 'lucide-react';
import type { LinghuiAudioNodeProperties, LinghuiNodeData, LinghuiNodeRunState } from '../../types/linghui';
import { loadSettings } from '../../store/settings/core';
import { electronService, openFileDialog } from '../../services/electronService';
import { createLinghuiWorkspaceAsset, importLinghuiWorkspaceAsset } from '../../store/linghuiStorage';
import { useLinghuiNodeMutation } from './nodes/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from './linghuiPromptReferences';

function getPreviewSource(source?: string): string {
  if (!source) return '';
  if (source.startsWith('http') || source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('koma-local://')) return source;
  return electronService.fs.toLocalUrl(source);
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
  const ttsConfigId = String(props.ttsConfigId ?? '');
  const previewSource = getPreviewSource(source);
  const sourceName = useMemo(() => getSourceName(source), [source]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const generatedAudioSource = getPreviewSource(nodeRun?.result?.primary?.source);
  const generatedAudioLabel = String(nodeRun?.result?.primary?.label ?? nodeData.label ?? '音频结果').trim();
  const generatedAudioDuration = nodeRun?.result?.primary?.durationSec;
  const generatedAudioText = String(nodeRun?.result?.text ?? '').trim();
  const canReuseGeneratedAudio = !source && Boolean(nodeRun?.result?.primary?.source);

  const upstreamSummary = useMemo(() => {
    if (!promptReferences.length) return '';

    const imageCount = promptReferences.filter(item => item.kind === 'image').length;
    const videoCount = promptReferences.filter(item => item.kind === 'video').length;
    const audioCount = promptReferences.filter(item => item.kind === 'audio').length;
    const textCount = promptReferences.filter(item => item.kind === 'text').length;
    return [
      imageCount > 0 ? `${imageCount} 个图片参考` : '',
      videoCount > 0 ? `${videoCount} 个视频参考` : '',
      audioCount > 0 ? `${audioCount} 条音频参考` : '',
      textCount > 0 ? `${textCount} 段文本输入` : '',
    ].filter(Boolean).join('、');
  }, [promptReferences]);

  const mentionHint = source
    ? '当前节点已挂载本地音频，会以导入模式输出；清空素材后可切回文本转语音'
    : promptReferences.length > 0
      ? `输入 @ 可直接引用上游文本、图片、视频或音频参考${upstreamSummary ? `；当前已接入 ${upstreamSummary}` : ''}`
    : '输入要合成的旁白、对白或提示文本，运行后会生成音频产物';

  useEffect(() => {
    loadSettings().then(settings => {
      const builtins = (settings.ttsConfigs ?? []).map(config => ({
        value: config.id,
        label: config.name || config.provider,
      }));
      const channels = (settings.channelConfigs ?? [])
        .filter(config => config.enabled && config.capabilities?.includes('tts'))
        .map(config => ({
          value: config.id,
          label: config.name || config.id,
        }));
      setProviders([...builtins, ...channels]);
    });
  }, []);

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
    const nextSource = String(nodeRun?.result?.primary?.source ?? '').trim();
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
  }, [message, nodeId, nodeRun?.result?.primary?.source, updateNodeData]);

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

  return (
    <div className="linghuiEditorPanel" onMouseDown={e => e.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">音频节点</div>
          <div className="linghuiEditorSubtitle">
            {source ? '当前已接入本地音频素材，可直接作为上游音频产物输出' : '支持本地上传或文本转语音两种模式'}
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

      <div className="linghuiEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={value => updateProp('prompt', value)}
          references={promptReferences}
          placeholder="输入要合成的旁白、对白或音频描述，输入 @ 引用上游产物"
          darkTheme
          minHeight="80px"
          maxHeight="160px"
        />
        <div className="linghuiEditorPromptHint">{mentionHint}</div>
      </div>

      {!source && generatedAudioSource && (
        <div className="linghuiEditorAssetGroup">
          <div className="linghuiEditorAssetTitle">生成结果</div>
          <div className="linghuiNodePreviewAudioWrap">
            <audio className="linghuiNodePreviewAudio" src={generatedAudioSource} controls />
            <div className="linghuiNodePreviewAudioMeta">
              <span>{generatedAudioLabel}</span>
              {generatedAudioDuration ? <span>{Math.max(1, Math.round(generatedAudioDuration))} 秒</span> : null}
            </div>
            {generatedAudioText ? <div className="linghuiNodePreviewText">{generatedAudioText}</div> : null}
          </div>
          <div className="linghuiEditorToolbar" style={{ marginTop: 10 }}>
            <div className="linghuiEditorToolbarLeft">
              <Button size="small" disabled={!canReuseGeneratedAudio} onClick={handleReuseGeneratedAudio}>
                写回当前素材
              </Button>
              <Button size="small" onClick={() => void handleCreateAudioAsset()}>
                保存为资产
              </Button>
            </div>
          </div>
          <div className="linghuiEditorPromptHint">可直接在这里试听、写回当前节点素材，或保存为资产后继续发送到画布。</div>
        </div>
      )}

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarLeft">
          <Button size="small" icon={<UploadCloud size={14} />} onClick={handleSelectAudio}>
            上传音频
          </Button>
          <Button size="small" icon={<Trash2 size={14} />} danger disabled={!source} onClick={handleClearAudio}>
            清空素材
          </Button>
          <Select
            size="small"
            className="linghuiEditorSelect"
            value={ttsConfigId || undefined}
            placeholder="选择 TTS 渠道"
            onChange={value => updateProp('ttsConfigId', value)}
            options={providers}
            popupMatchSelectWidth={false}
            style={{ minWidth: 160 }}
          />
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
