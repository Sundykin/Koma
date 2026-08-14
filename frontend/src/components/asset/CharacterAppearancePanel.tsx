/**
 * 角色形象面板 —— 直接内嵌在角色资产抽屉的角色行下方（展开式，不是弹窗）。
 *
 * 两块内容：
 *  - 主形象：预览视频。动作 + 台词由 AI 从剧本归纳该角色的性格与说话习惯后产出；
 *    生成后可一键把音轨提取成音色样本入库并绑定（模板已约束音轨只有角色干声）。
 *  - 子形象：同一角色的不同年龄 / 状态 / 穿着。主路径是「从剧本提取资产」时一并识别出来的
 *    （见 character_extraction 模板的 variants 章节）—— 阶段性外观变化要读完整段原文才判断得出。
 *    这里只做补充：给手动新建的角色补派生、改文案、出图。
 *    每个子形象以主形象定妆照为身份锚出图，保证是"同一个人"。
 *    这里的「激活」是角色级默认值，分镜级切换在分镜角色栏（优先级更高）。
 *
 * 本组件不直接落库：所有改动通过 onChange 交回 AssetDock 的整表读-改-存。
 */
import React, { useCallback, useMemo, useState } from 'react';
import { App, Button, Empty, Image, Input, InputNumber, Select, Tag, Tooltip } from 'antd';
import {
  AudioOutlined,
  DeleteOutlined,
  LoadingOutlined,
  PictureOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { Character, CharacterVariant, CharacterVariantKind, ProjectStyleSnapshot } from '../../types';
import { getMediaAssetDisplaySource } from '../../types';
import { electronService, fsExists, fsMkdir } from '../../services/electronService';
import { createCreationContext } from '../../services/CreationContext';
import {
  deriveCharacterVariants,
  generatePreviewVideoPrompt,
} from '../../services/CharacterAppearanceService';
import { extractCharacterVoiceSample } from '../../services/characterVoiceSampleService';
import {
  generateCharacterPreviewVideo,
  generateCharacterVariantPhoto,
} from '../../workflow/characterAssetWorkflow';
import { createStoredMediaAsset, updateCharacterMedia } from '../../utils/mediaAssets';
import { getCharacterCostumePhotoSource } from '../../utils/mediaSelectors';
import { hasVariantImage } from '../../utils/characterVariants';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';

const VARIANT_KIND_OPTIONS: Array<{ value: CharacterVariantKind; label: string }> = [
  { value: 'age', label: '年龄' },
  { value: 'state', label: '状态' },
  { value: 'outfit', label: '穿着' },
  { value: 'other', label: '其它' },
];

const inputCls = '!text-[12px] !bg-bg-surface/60';

interface CharacterAppearancePanelProps {
  projectId: string;
  character: Character;
  /** 当前剧集剧本：AI 推断性格/口头禅、派生子形象都靠它 */
  script?: string;
  aspectRatio?: '16:9' | '9:16';
  styleSnapshot?: ProjectStyleSnapshot;
  ttiSelection?: string;
  llmSelection?: string;
  /** 把改动交回 AssetDock 落库 */
  onChange: (updated: Character) => void | Promise<void>;
}

function toDisplaySrc(source?: string): string {
  if (!source) return '';
  if (source.startsWith('http') || source.startsWith('data:')) return source;
  return electronService.isElectron() ? electronService.fs.toLocalUrl(source) : '';
}

export const CharacterAppearancePanel: React.FC<CharacterAppearancePanelProps> = ({
  projectId,
  character,
  script,
  aspectRatio,
  styleSnapshot,
  ttiSelection,
  llmSelection,
  onChange,
}) => {
  const { message } = App.useApp();

  // 预览视频提示词（AI 生成后可手改）
  const [previewAction, setPreviewAction] = useState('');
  const [previewDialogue, setPreviewDialogue] = useState('');
  const [promptGenerating, setPromptGenerating] = useState(false);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [audioExtracting, setAudioExtracting] = useState(false);

  // 子形象
  const [deriving, setDeriving] = useState(false);
  const [deriveCount, setDeriveCount] = useState(4);
  const [variantBusyIds, setVariantBusyIds] = useState<Set<string>>(new Set());

  const costumeSrc = toDisplaySrc(getCharacterCostumePhotoSource(character));
  const previewVideoSrc = toDisplaySrc(getMediaAssetDisplaySource(character.media?.previewVideo));
  const variants = useMemo(() => character.variants || [], [character.variants]);

  const markVariantBusy = (id: string, busy: boolean) => {
    setVariantBusyIds(prev => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const assetDir = useCallback(async () => {
    const config = getStorageConfig() || (await initStorageConfig());
    const dir = `${config.rootPath}/projects/${projectId}/assets/characters/${character.id}`;
    if (!(await fsExists(dir))) await fsMkdir(dir);
    return dir;
  }, [projectId, character.id]);

  const withProvider = useCallback(async () => {
    const ctx = await createCreationContext(projectId, '', { llmConfigId: llmSelection });
    return ctx.llmProvider;
  }, [projectId, llmSelection]);

  // ---------- 主形象：预览视频 ----------

  const handleGeneratePrompt = async () => {
    setPromptGenerating(true);
    try {
      const provider = await withProvider();
      const result = await generatePreviewVideoPrompt(provider, character, { script });
      setPreviewAction(result.action);
      setPreviewDialogue(result.dialogue);
      message.success('已按剧本里的性格与说话习惯生成动作与台词');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '生成提示词失败');
    } finally {
      setPromptGenerating(false);
    }
  };

  const handleGeneratePreviewVideo = async () => {
    if (!costumeSrc) {
      message.warning('请先生成主形象定妆照');
      return;
    }
    setVideoGenerating(true);
    try {
      const dir = await assetDir();
      const result = await generateCharacterPreviewVideo({
        projectId,
        character,
        aspectRatio,
        styleSnapshot,
        previewAction: previewAction.trim() || undefined,
        previewDialogue: previewDialogue.trim() || undefined,
        destPath: `${dir}/preview-video-${Date.now()}.mp4`,
        bindOwner: false,
      });
      if (!result.success || !result.asset) {
        message.error(result.error || '生成预览视频失败');
        return;
      }
      await onChange(updateCharacterMedia(character, { previewVideo: result.asset }));
      message.success('预览视频已生成');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '生成预览视频失败');
    } finally {
      setVideoGenerating(false);
    }
  };

  const handleExtractAudio = async () => {
    if (!character.media?.previewVideo) {
      message.warning('请先生成预览视频');
      return;
    }
    setAudioExtracting(true);
    try {
      const result = await extractCharacterVoiceSample({ projectId, character });
      await onChange({ ...character, voiceId: result.voiceProfileId });
      message.success(`已提取角色音频并绑定音色「${result.voiceName}」`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '提取角色音频失败');
    } finally {
      setAudioExtracting(false);
    }
  };

  // ---------- 子形象 ----------

  const persistVariants = async (next: CharacterVariant[], extra?: Partial<Character>) => {
    await onChange({ ...character, ...extra, variants: next });
  };

  const handleDeriveVariants = async () => {
    if (!character.prompt?.trim()) {
      message.warning('请先填写角色的视觉描述提示词（子形象要基于它做差异）');
      return;
    }
    setDeriving(true);
    try {
      const provider = await withProvider();
      const derived = await deriveCharacterVariants(provider, character, { script, count: deriveCount });
      await persistVariants([...variants, ...derived]);
      message.success(`已派生 ${derived.length} 个子形象，逐个生成图片后即可在分镜中使用`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '派生子形象失败');
    } finally {
      setDeriving(false);
    }
  };

  const handleAddVariant = async () => {
    await persistVariants([
      ...variants,
      { id: uuidv4(), name: '新子形象', kind: 'outfit', prompt: '', keywords: '', createdAt: Date.now() },
    ]);
  };

  const handleVariantField = async (id: string, patch: Partial<CharacterVariant>) => {
    await persistVariants(variants.map(v => (v.id === id ? { ...v, ...patch } : v)));
  };

  const handleDeleteVariant = async (id: string) => {
    await persistVariants(
      variants.filter(v => v.id !== id),
      character.activeVariantId === id ? { activeVariantId: undefined } : undefined,
    );
  };

  const handleActivateVariant = async (id?: string) => {
    await onChange({ ...character, activeVariantId: id });
  };

  const handleGenerateVariantImage = async (variant: CharacterVariant) => {
    if (!variant.prompt.trim()) {
      message.warning('请先填写该子形象的差异描述');
      return;
    }
    markVariantBusy(variant.id, true);
    try {
      const dir = await assetDir();
      const result = await generateCharacterVariantPhoto({
        projectId,
        character,
        variant,
        aspectRatio,
        styleSnapshot,
        ttiSelection,
        destPath: `${dir}/variant-${variant.id}-${Date.now()}.png`,
        bindOwner: false,
      });
      if (!result.success || (!result.path && !result.url)) {
        message.error(result.error || '生成子形象图片失败');
        return;
      }
      const asset = createStoredMediaAsset('image', { localPath: result.path, remoteUrl: result.url });
      await persistVariants(
        variants.map(v => (v.id === variant.id ? { ...v, media: { ...(v.media || {}), costumePhoto: asset } } : v)),
      );
      message.success(`「${variant.name}」已生成`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '生成子形象图片失败');
    } finally {
      markVariantBusy(variant.id, false);
    }
  };

  // ---------- 渲染 ----------

  const renderVariantRow = (variant: CharacterVariant) => {
    const busy = variantBusyIds.has(variant.id);
    const src = toDisplaySrc(getMediaAssetDisplaySource(variant.media?.costumePhoto));
    const isActive = character.activeVariantId === variant.id;
    return (
      <div
        key={variant.id}
        className={`flex gap-2.5 p-2 rounded-md border ${
          isActive ? 'border-accent bg-accent/5' : 'border-border-subtle bg-bg-surface/40'
        }`}
      >
        <div className="relative w-[76px] h-[76px] shrink-0 rounded overflow-hidden bg-bg-elevated border border-border-subtle/70">
          {src ? (
            <Image src={src} width={76} height={76} className="object-cover" preview={{ mask: <span className="text-[10px]">预览</span> }} />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-text-tertiary gap-0.5">
              <PictureOutlined />
              <span className="text-[10px]">待生成</span>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 bg-bg-app/60 flex items-center justify-center text-text-secondary">
              <LoadingOutlined />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Input
              key={`${variant.id}-name`}
              size="small"
              defaultValue={variant.name}
              placeholder="子形象名，如「少年时期」"
              className={`${inputCls} flex-1 min-w-0`}
              onBlur={e => {
                const v = e.target.value.trim();
                if (v && v !== variant.name) void handleVariantField(variant.id, { name: v });
              }}
            />
            <Select
              size="small"
              value={variant.kind}
              options={VARIANT_KIND_OPTIONS}
              className="w-[74px] shrink-0"
              onChange={kind => void handleVariantField(variant.id, { kind })}
            />
            <Input
              key={`${variant.id}-keywords`}
              size="small"
              defaultValue={variant.keywords || ''}
              placeholder="触发词：少年,童年"
              className={`${inputCls} flex-1 min-w-0`}
              onBlur={e => {
                if (e.target.value !== (variant.keywords || '')) {
                  void handleVariantField(variant.id, { keywords: e.target.value });
                }
              }}
            />
            <Tooltip title={isActive ? '取消激活（回到主形象）' : '设为该角色默认形象；分镜内可再单独切换'}>
              <button
                onClick={() => void handleActivateVariant(isActive ? undefined : variant.id)}
                className={`shrink-0 h-6 px-2 text-[11px] rounded border cursor-pointer ${
                  isActive
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border-subtle text-text-tertiary hover:text-text-primary'
                }`}
              >
                {isActive ? '已激活' : '激活'}
              </button>
            </Tooltip>
            <Tooltip title="删除该子形象">
              <button
                onClick={() => void handleDeleteVariant(variant.id)}
                className="shrink-0 w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-status-error rounded cursor-pointer"
              >
                <DeleteOutlined className="text-[11px]" />
              </button>
            </Tooltip>
          </div>

          <div className="flex gap-1.5">
            <Input.TextArea
              key={`${variant.id}-prompt`}
              defaultValue={variant.prompt}
              placeholder="相对主形象改变了什么（只写差异：发型 / 伤痕 / 服装等可见变化）"
              autoSize={{ minRows: 2, maxRows: 3 }}
              className="!text-[11px] !bg-bg-surface/60 flex-1"
              onBlur={e => {
                if (e.target.value !== variant.prompt) void handleVariantField(variant.id, { prompt: e.target.value });
              }}
            />
            <Button
              size="small"
              icon={<ThunderboltOutlined />}
              loading={busy}
              onClick={() => void handleGenerateVariantImage(variant)}
              className="shrink-0 self-start"
            >
              {hasVariantImage(variant) ? '重生成' : '生成图'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-2 rounded-md border border-border-subtle/70 bg-bg-app/30 p-2.5 space-y-3">
      {/* ===== 主形象预览视频 ===== */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-text-primary">主形象 · 预览视频</span>
          <span className="text-[11px] text-text-muted truncate">音轨只保留角色干声，可直接提取成音色样本</span>
        </div>

        <div className="flex gap-2.5">
          <div className="w-[112px] h-[112px] shrink-0 rounded-md overflow-hidden bg-bg-elevated border border-border-subtle/70 flex items-center justify-center">
            {previewVideoSrc ? (
              <video src={previewVideoSrc} controls className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center text-text-tertiary gap-1">
                <VideoCameraOutlined className="text-[18px]" />
                <span className="text-[10px]">未生成</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <Input.TextArea
              value={previewAction}
              onChange={e => setPreviewAction(e.target.value)}
              placeholder="动作提示词（英文）：角色的动作、神态、视线，镜头保持稳定"
              autoSize={{ minRows: 2, maxRows: 3 }}
              className="!text-[11px] !bg-bg-surface/60"
            />
            <Input
              value={previewDialogue}
              onChange={e => setPreviewDialogue(e.target.value)}
              placeholder="台词（中文）：角色说出口的一句话，用于提取音色样本"
              className={inputCls}
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tooltip title="从剧本里归纳该角色的性格与说话习惯，推出动作与台词">
                <Button
                  size="small"
                  icon={promptGenerating ? <LoadingOutlined /> : <ThunderboltOutlined />}
                  disabled={promptGenerating}
                  onClick={() => void handleGeneratePrompt()}
                >
                  AI 生成动作与台词
                </Button>
              </Tooltip>
              <Button
                size="small"
                type="primary"
                icon={<VideoCameraOutlined />}
                loading={videoGenerating}
                disabled={!costumeSrc}
                onClick={() => void handleGeneratePreviewVideo()}
              >
                {previewVideoSrc ? '重新生成' : '生成预览视频'}
              </Button>
              <Tooltip title="从预览视频音轨提取角色人声，建成自定义音色并绑定到该角色（无背景音乐 / 音效）">
                <Button
                  size="small"
                  icon={<AudioOutlined />}
                  loading={audioExtracting}
                  disabled={!previewVideoSrc}
                  onClick={() => void handleExtractAudio()}
                >
                  提取角色音频
                </Button>
              </Tooltip>
              {!costumeSrc && <span className="text-[11px] text-status-warning">需先生成定妆照</span>}
            </div>
          </div>
        </div>
      </section>

      {/* ===== 子形象 ===== */}
      <section className="space-y-1.5 border-t border-border-subtle/60 pt-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-medium text-text-primary">子形象</span>
          <span className="text-[11px] text-text-muted flex-1 min-w-0 truncate">
            由「从剧本提取资产」自动识别；分镜可自动匹配或手动切换
          </span>
          <InputNumber
            size="small"
            min={1}
            max={8}
            value={deriveCount}
            onChange={v => setDeriveCount(v || 4)}
            className="!w-[56px]"
          />
          <Tooltip title="补充派生：手动新建的角色没走过剧本提取时用；正常情况下子形象在「从剧本提取资产」时已自动识别">
            <Button
              size="small"
              icon={deriving ? <LoadingOutlined /> : <ThunderboltOutlined />}
              disabled={deriving}
              onClick={() => void handleDeriveVariants()}
            >
              补充派生
            </Button>
          </Tooltip>
          <Button size="small" icon={<PlusOutlined />} onClick={() => void handleAddVariant()}>
            新建
          </Button>
        </div>

        {!costumeSrc && variants.length > 0 && (
          <div className="text-[11px] text-status-warning">
            定妆照是子形象出图的身份锚，缺了它无法保证派生出来还是同一个人。
          </div>
        )}

        {variants.length === 0 ? (
          <Empty
            description="暂无子形象 —— 「从剧本提取资产」会自动识别角色的阶段性外观变化"
            className="!my-3"
            imageStyle={{ height: 40 }}
          />
        ) : (
          <div className="space-y-1.5">{variants.map(renderVariantRow)}</div>
        )}

        {character.activeVariantId && (
          <div className="flex items-center gap-1.5">
            <Tag color="blue" className="!mr-0 !text-[11px]">角色级已激活子形象</Tag>
            <button
              onClick={() => void handleActivateVariant(undefined)}
              className="text-[11px] text-text-tertiary hover:text-accent cursor-pointer"
            >
              恢复为主形象
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default CharacterAppearancePanel;
