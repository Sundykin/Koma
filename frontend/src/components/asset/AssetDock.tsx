/**
 * 项目资产 Dock：常驻编辑器右缘的三个悬浮入口（角色 / 场景 / 道具）。
 *
 * 抽屉内是可编辑表格：每个资产一行，字段直接内联编辑（失焦即保存）：
 *   - 角色：名称 / 定位 / 性别 / 年龄 / 音色 / 代称 / 提示词
 *   - 场景：名称 / 时间 / 位置 / 氛围 / 代称 / 提示词
 *   - 道具：名称 / 类型 / 代称 / 提示词
 * 左侧大图区：主参考图点击放大预览，支持 AI 生成 / 上传主图 / 上传"使用参考图"
 * （生成时作为身份/空间/物品参考传入）。抽屉头部有批量生成（补齐缺图）与演员库入口。
 * 角色行下方可展开 CharacterAppearancePanel（预览视频 + 子形象），全部在抽屉内完成，不弹窗。
 * 删除 = 从当前剧集移除（不删项目资产本体）。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Drawer, Empty, Image, Input, Modal, Select, Spin, Tooltip } from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  DeleteOutlined,
  LoadingOutlined,
  PictureOutlined,
  CloseOutlined,
  TeamOutlined,
  AudioOutlined,
  CloudUploadOutlined,
  SkinOutlined,
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { Character, Scene, Prop, ProjectStyleSnapshot, StoredMediaAsset } from '../../types';
import {
  loadCharacters,
  loadScenes,
  loadProps,
  saveCharacters,
  saveScenes,
  saveProps,
  removeAssetFromAnalysis,
  removeCharacterEpisodeRef,
  removeSceneEpisodeRef,
  removePropEpisodeRef,
} from '../../store/projectStore';
import { electronService, openFileDialog, fsCopy, fsExists, fsMkdir, fsReadFileAsBase64, fsRemove } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { createStoredMediaAsset, updateCharacterMedia, updateSceneMedia, updatePropMedia } from '../../utils/mediaAssets';
import { generateCostumePhoto } from '../../workflow/characterAssetWorkflow';
import { generateSceneImage, generatePropImage } from '../../workflow/scenePropAssetWorkflow';
import { ensureRemoteUrlForImageAsset } from '../../services/mediaRemoteUrlService';
import {
  getCharacterCostumePhotoSource,
  getScenePreviewImageSource,
  getPropPreviewImageSource,
} from '../../utils/mediaSelectors';
import { submitScriptAnalysisTask } from '../../services/analysisTaskClient';
import { CharacterVoiceSelect } from '../voiceLibrary/CharacterVoiceSelect';
import {
  loadVoiceLibrary,
  createVoiceCategory,
  createVoiceProfile,
} from '../../services/voiceLibrary/voiceLibraryService';
import { loadActorLibrary, createCharacterFromActor, saveActorFromCharacter } from '../../services/actorLibraryService';
import type { ActorProfile } from '../../types/actor-library';
import { useTaskTransitions } from '../../hooks';
import { CharacterAppearancePanel } from './CharacterAppearancePanel';

type AssetType = 'character' | 'scene' | 'prop';

const TYPE_META: Record<AssetType, { label: string; icon: React.ReactNode }> = {
  character: { label: '角色', icon: <UserOutlined /> },
  scene: { label: '场景', icon: <EnvironmentOutlined /> },
  prop: { label: '道具', icon: <InboxOutlined /> },
};

const ROLE_OPTIONS = [
  { value: 'protagonist', label: '主角' },
  { value: 'antagonist', label: '反派' },
  { value: 'supporting', label: '配角' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'neutral', label: '中性' },
  { value: 'unknown', label: '未知' },
];

const SCENE_TIME_OPTIONS = [
  { value: 'day', label: '白天' },
  { value: 'night', label: '夜晚' },
  { value: 'twilight', label: '黄昏' },
];

interface AssetDockProps {
  projectId: string;
  /** 当前剧集；行内「删除」= 从本集移除（不删项目资产本体） */
  episodeId?: string;
  /** 当前剧集名 + 剧本正文：用于「从剧本提取资产」任务 */
  episodeName?: string;
  script?: string;
  /** LLM 渠道选择（提取任务用） */
  llmSelection?: string;
  aspectRatio?: '16:9' | '9:16';
  ttiSelection?: string;
  styleSnapshot?: ProjectStyleSnapshot;
}

/** 本地路径/远程 URL 统一转可展示 src */
function toDisplaySrc(source?: string): string {
  if (!source) return '';
  if (source.startsWith('http') || source.startsWith('data:')) return source;
  return electronService.isElectron() ? electronService.fs.toLocalUrl(source) : '';
}

const inputCls = '!text-[12px] !bg-bg-surface/60';

export const AssetDock: React.FC<AssetDockProps> = ({
  projectId,
  episodeId,
  episodeName,
  script,
  llmSelection,
  aspectRatio,
  ttiSelection,
  styleSnapshot,
}) => {
  const { message } = App.useApp();
  const [openType, setOpenType] = useState<AssetType | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [actors, setActors] = useState<ActorProfile[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  // 音色上传：从角色行触发，上传到音色库后直接绑定到该角色
  const [voiceUpload, setVoiceUpload] = useState<{ characterId: string; name: string; filePath: string; submitting: boolean } | null>(null);
  // 上传成功后自增，强制 CharacterVoiceSelect 重新挂载以读到新音色
  const [voiceLibVersion, setVoiceLibVersion] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  // 角色形象面板（主形象预览视频 + 子形象管理）当前展开的角色 id；直接内嵌在角色行下方
  const [appearanceCharacterId, setAppearanceCharacterId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [chars, scns, prps] = await Promise.all([
        loadCharacters(projectId),
        loadScenes(projectId),
        loadProps(projectId),
      ]);
      setCharacters(chars);
      setScenes(scns);
      setProps(prps);
    } catch {
      message.error('加载项目资产失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, message]);

  // 打开抽屉时刷新（剧本解析/提取可能刚改过资产）
  useEffect(() => {
    if (openType) void loadAll();
  }, [openType, loadAll]);

  // 切到其它资产类型时收起展开的角色形象面板，避免下次回到角色页还挂着旧展开态
  useEffect(() => {
    if (openType !== 'character') setAppearanceCharacterId(null);
  }, [openType]);

  // 挂载先拉一次计数；剧本解析完成后再刷新一次（提取的新资产体现在角标上）
  useEffect(() => { void loadAll(); }, [loadAll]);
  useTaskTransitions(
    { scope: `project:${projectId}`, type: 'script-analysis', to: ['completed'] },
    () => { setIsExtracting(false); void loadAll(); },
  );

  // ---- 从剧本提取资产：提交解析任务，完成后由上面的 transition 钩子刷新列表 ----
  const handleExtractAssets = useCallback(async () => {
    if (!episodeId || !script?.trim()) {
      message.warning('请先选择剧集并填写剧本');
      return;
    }
    setIsExtracting(true);
    try {
      const { deduped } = await submitScriptAnalysisTask({
        projectId,
        episodeId,
        episodeName: episodeName || `第${episodeId}集`,
        script,
        llmSelection,
        styleSnapshot,
      });
        message.info(deduped ? '当前剧集已有提取任务在进行中' : '资产提取任务已启动，完成后自动刷新');
        if (deduped) setIsExtracting(false);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '启动资产提取失败');
      setIsExtracting(false);
    }
  }, [episodeId, episodeName, script, projectId, llmSelection, styleSnapshot, message]);

  const counts: Record<AssetType, number> = useMemo(() => ({
    character: characters.length,
    scene: scenes.length,
    prop: props.length,
  }), [characters, scenes, props]);

  // ---- 持久化：整表读-改-存（与项目内各处同一模式） ----
  const persist = useCallback(async (type: AssetType, updated: Character | Scene | Prop) => {
    if (type === 'character') {
      const list = await loadCharacters(projectId);
      const idx = list.findIndex(c => c.id === updated.id);
      if (idx === -1) return;
      list[idx] = updated as Character;
      await saveCharacters(projectId, list);
      setCharacters(list);
    } else if (type === 'scene') {
      const list = await loadScenes(projectId);
      const idx = list.findIndex(s => s.id === updated.id);
      if (idx === -1) return;
      list[idx] = updated as Scene;
      await saveScenes(projectId, list);
      setScenes(list);
    } else {
      const list = await loadProps(projectId);
      const idx = list.findIndex(p => p.id === updated.id);
      if (idx === -1) return;
      list[idx] = updated as Prop;
      await saveProps(projectId, list);
      setProps(list);
    }
  }, [projectId]);

  /** 行内编辑失焦即存：先本地更新保持输入流畅，再异步落盘 */
  const handleFieldSave = useCallback((type: AssetType, id: string, patch: Record<string, unknown>) => {
    const source = type === 'character' ? characters : type === 'scene' ? scenes : props;
    const current = source.find(a => a.id === id);
    if (!current) return;
    const updated = { ...current, ...patch };
    if (type === 'character') setCharacters(prev => prev.map(a => a.id === id ? updated as Character : a));
    else if (type === 'scene') setScenes(prev => prev.map(a => a.id === id ? updated as Scene : a));
    else setProps(prev => prev.map(a => a.id === id ? updated as Prop : a));
    void persist(type, updated).catch(() => message.error('保存失败'));
  }, [characters, scenes, props, persist, message]);

  // ---- 新建：建行后立即可编辑 ----
  const handleCreate = useCallback(async (type: AssetType) => {
    try {
      if (type === 'character') {
        const entity: Character = { id: uuidv4(), name: '新角色', role: 'supporting', prompt: '', gender: 'unknown' };
        await saveCharacters(projectId, [...characters, entity]);
        setCharacters(prev => [...prev, entity]);
      } else if (type === 'scene') {
        const entity: Scene = { id: uuidv4(), name: '新场景', prompt: '' };
        await saveScenes(projectId, [...scenes, entity]);
        setScenes(prev => [...prev, entity]);
      } else {
        const entity: Prop = { id: uuidv4(), name: '新道具', prompt: '' };
        await saveProps(projectId, [...props, entity]);
        setProps(prev => [...prev, entity]);
      }
    } catch {
      message.error('新建资产失败');
    }
  }, [projectId, characters, scenes, props, message]);

  // ---- 删除：从项目资产库真实删除（同时清当前剧集引用与本地参考图文件） ----
  const handleDelete = useCallback(async (type: AssetType, id: string) => {
    const list = type === 'character' ? characters : type === 'scene' ? scenes : props;
    const entity = list.find(a => a.id === id);
    try {
      if (episodeId) {
        const removeRef = type === 'character'
          ? removeCharacterEpisodeRef
          : type === 'scene' ? removeSceneEpisodeRef : removePropEpisodeRef;
        await Promise.all([
          removeAssetFromAnalysis(projectId, episodeId, id, type),
          removeRef(projectId, id, episodeId),
        ]).catch(() => undefined);
      }
      if (type === 'character') {
        const next = characters.filter(a => a.id !== id);
        await saveCharacters(projectId, next);
        setCharacters(next);
      } else if (type === 'scene') {
        const next = scenes.filter(a => a.id !== id);
        await saveScenes(projectId, next);
        setScenes(next);
      } else {
        const next = props.filter(a => a.id !== id);
        await saveProps(projectId, next);
        setProps(next);
      }
      // 本地媒体文件一并清理（远程 URL 无本地文件可删）
      const media = entity?.media as Record<string, { localPath?: string } | undefined> | undefined;
      for (const slot of ['costumePhoto', 'previewImage', 'previewVideo', 'referenceImage']) {
        const localPath = media?.[slot]?.localPath;
        if (localPath && !localPath.startsWith('http')) {
          await fsRemove(localPath).catch(() => undefined);
        }
      }
      message.success('已删除');
    } catch {
      message.error('删除失败');
    }
  }, [projectId, episodeId, characters, scenes, props, message]);

  // ---- 参考图路径 ----
  const getAssetPath = useCallback(async (type: AssetType, id: string, filename: string) => {
    const config = getStorageConfig() || (await initStorageConfig());
    const dirName = type === 'character' ? 'characters' : type === 'scene' ? 'scenes' : 'props';
    const dir = `${config.rootPath}/projects/${projectId}/assets/${dirName}/${id}`;
    if (!(await fsExists(dir))) await fsMkdir(dir);
    return `${dir}/${filename}`;
  }, [projectId]);

  /** 生成主图：有"使用参考图"时归一化后作为身份/空间参考传入 */
  const generateOne = useCallback(async (type: AssetType, id: string): Promise<boolean> => {
    const entity = (type === 'character' ? characters : type === 'scene' ? scenes : props).find(a => a.id === id);
    if (!entity) return false;
    let userReference = entity.media?.referenceImage;
    if (userReference) {
      try {
        userReference = await ensureRemoteUrlForImageAsset({
          projectId,
          asset: userReference,
          policy: 'best-effort',
          filenameHint: `${id}-reference.png`,
        });
      } catch { /* 归一化失败则用本地引用兜底 */ }
    }
    const destPath = await getAssetPath(type, id, `${type === 'character' ? 'costume' : 'preview'}-${Date.now()}.png`);
    const base = {
      projectId, aspectRatio, styleSnapshot, ttiSelection, destPath,
      bindOwner: false as const, normalizeRemoteUrl: true, userReference,
    };
    let result: { success: boolean; path?: string; url?: string; error?: string };
    if (type === 'character') {
      result = await generateCostumePhoto({ ...base, character: entity as Character });
    } else if (type === 'scene') {
      result = await generateSceneImage({ ...base, scene: entity as Scene });
    } else {
      result = await generatePropImage({ ...base, prop: entity as Prop });
    }
    if (!result.success || (!result.path && !result.url)) {
      message.error(result.error || `生成${TYPE_META[type].label}图失败`);
      return false;
    }
    const asset = createStoredMediaAsset('image', { localPath: result.path, remoteUrl: result.url });
    if (type === 'character') await persist(type, updateCharacterMedia(entity as Character, { costumePhoto: asset }));
    else if (type === 'scene') await persist(type, updateSceneMedia(entity as Scene, { previewImage: asset }));
    else await persist(type, updatePropMedia(entity as Prop, { previewImage: asset }));
    return true;
  }, [characters, scenes, props, projectId, aspectRatio, styleSnapshot, ttiSelection, getAssetPath, persist, message]);

  const handleGenerateImage = useCallback(async (type: AssetType, id: string) => {
    if (generatingIds.has(id)) return;
    setGeneratingIds(prev => new Set(prev).add(id));
    try {
      if (await generateOne(type, id)) message.success('参考图已生成');
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [generatingIds, generateOne, message]);

  /** 批量生成：补齐当前类型里缺主图的资产（逐个串行，行上有各自 spinner） */
  const missingImageIds = useCallback((type: AssetType): string[] => {
    if (type === 'character') return characters.filter(c => !getCharacterCostumePhotoSource(c)).map(c => c.id);
    if (type === 'scene') return scenes.filter(s => !getScenePreviewImageSource(s)).map(s => s.id);
    return props.filter(p => !getPropPreviewImageSource(p)).map(p => p.id);
  }, [characters, scenes, props]);

  const handleBatchGenerate = useCallback(async (type: AssetType) => {
    const ids = missingImageIds(type);
    if (ids.length === 0) {
      message.info('当前类型资产都已有参考图');
      return;
    }
    setBatchGenerating(true);
    setGeneratingIds(new Set(ids));
    let success = 0;
    try {
      for (const id of ids) {
        try {
          if (await generateOne(type, id)) success += 1;
        } catch { /* 单个失败不阻断批量 */ }
        setGeneratingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      message.success(`批量生成完成：${success}/${ids.length} 成功`);
    } finally {
      setBatchGenerating(false);
      setGeneratingIds(new Set());
    }
  }, [missingImageIds, generateOne, message]);

  /** 上传主图 */
  const handleUploadImage = useCallback(async (type: AssetType, id: string) => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: '选择参考图',
      });
      if (result.canceled || !result.filePaths[0]) return;
      const destPath = await getAssetPath(type, id, `upload-${Date.now()}.png`);
      await fsCopy(result.filePaths[0], destPath);
      const asset = createStoredMediaAsset('image', { localPath: destPath });
      const entity = (type === 'character' ? characters : type === 'scene' ? scenes : props).find(a => a.id === id);
      if (!entity) return;
      if (type === 'character') await persist(type, updateCharacterMedia(entity as Character, { costumePhoto: asset }));
      else if (type === 'scene') await persist(type, updateSceneMedia(entity as Scene, { previewImage: asset }));
      else await persist(type, updatePropMedia(entity as Prop, { previewImage: asset }));
      message.success('参考图已上传');
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '上传失败');
    }
  }, [characters, scenes, props, getAssetPath, persist, message]);

  /** 上传/清除「使用参考图」（生成时作为身份/空间/物品参考） */
  const handleUploadReference = useCallback(async (type: AssetType, id: string) => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: '选择使用参考图（生成时作为参考）',
      });
      if (result.canceled || !result.filePaths[0]) return;
      const destPath = await getAssetPath(type, id, `reference-${Date.now()}.png`);
      await fsCopy(result.filePaths[0], destPath);
      const asset = createStoredMediaAsset('image', { localPath: destPath });
      const entity = (type === 'character' ? characters : type === 'scene' ? scenes : props).find(a => a.id === id);
      if (!entity) return;
      if (type === 'character') await persist(type, updateCharacterMedia(entity as Character, { referenceImage: asset }));
      else if (type === 'scene') await persist(type, updateSceneMedia(entity as Scene, { referenceImage: asset }));
      else await persist(type, updatePropMedia(entity as Prop, { referenceImage: asset }));
      message.success('使用参考图已设置，生成时会作为参考');
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '上传失败');
    }
  }, [characters, scenes, props, getAssetPath, persist, message]);

  const handleClearReference = useCallback(async (type: AssetType, id: string) => {
    const entity = (type === 'character' ? characters : type === 'scene' ? scenes : props).find(a => a.id === id);
    if (!entity) return;
    if (type === 'character') await persist(type, updateCharacterMedia(entity as Character, { referenceImage: undefined }));
    else if (type === 'scene') await persist(type, updateSceneMedia(entity as Scene, { referenceImage: undefined }));
    else await persist(type, updatePropMedia(entity as Prop, { referenceImage: undefined }));
    message.success('已移除使用参考图');
  }, [characters, scenes, props, persist, message]);

  // ---- 演员库 ----
  const handleOpenLibrary = useCallback(async () => {
    setLibraryOpen(true);
    setLibraryLoading(true);
    try {
      setActors(await loadActorLibrary());
    } catch {
      message.error('加载演员库失败');
    } finally {
      setLibraryLoading(false);
    }
  }, [message]);

  const handlePickActor = useCallback(async (actor: ActorProfile) => {
    try {
      const character = await createCharacterFromActor(actor, projectId);
      await saveCharacters(projectId, [...characters, character]);
      setCharacters(prev => [...prev, character]);
      setLibraryOpen(false);
      message.success(`已把「${actor.name}」加入项目角色`);
    } catch {
      message.error('从演员库加入失败');
    }
  }, [projectId, characters, message]);

  const handleSaveToLibrary = useCallback(async (character: Character) => {
    try {
      await saveActorFromCharacter(character);
      message.success(`已把「${character.name}」存入演员库`);
    } catch {
      message.error('存入演员库失败');
    }
  }, [message]);

  // ---- 音色上传：选音频文件 → 建自定义音色 → 绑定到角色 ----
  const handlePickVoiceFile = useCallback(async () => {
    const result = await openFileDialog({
      filters: [{ name: '音频', extensions: ['wav', 'mp3', 'm4a', 'ogg', 'flac', 'webm'] }],
      title: '选择音色样本音频',
    });
    if (result.canceled || !result.filePaths[0]) return;
    const filePath = result.filePaths[0];
    setVoiceUpload(prev => prev ? { ...prev, filePath } : prev);
  }, []);

  const handleVoiceUploadSubmit = useCallback(async () => {
    if (!voiceUpload) return;
    const character = characters.find(c => c.id === voiceUpload.characterId);
    if (!voiceUpload.filePath) {
      message.warning('请选择音色样本音频');
      return;
    }
    const name = voiceUpload.name.trim();
    if (!name) {
      message.warning('请填写音色名称');
      return;
    }
    setVoiceUpload(prev => prev ? { ...prev, submitting: true } : prev);
    try {
      let snapshot = await loadVoiceLibrary();
      let category = snapshot.categories.find(c => c.source === 'custom');
      if (!category) {
        snapshot = await createVoiceCategory('自定义音色', snapshot);
        category = snapshot.categories.find(c => c.source === 'custom') ?? snapshot.categories[snapshot.categories.length - 1];
      }
      const sampleDataBase64 = await fsReadFileAsBase64(voiceUpload.filePath);
      const sampleExt = (voiceUpload.filePath.split('.').pop() || 'wav').toLowerCase();
      const gender = character?.gender === 'male' || character?.gender === 'female' || character?.gender === 'neutral'
        ? character.gender
        : undefined;
      const next = await createVoiceProfile({
        categoryId: category.id,
        name,
        gender,
        sampleDataBase64,
        sampleExt,
      }, snapshot);
      const created = next.profiles[next.profiles.length - 1];
      if (created) {
        handleFieldSave('character', voiceUpload.characterId, { voiceId: created.id });
      }
      setVoiceLibVersion(v => v + 1);
      setVoiceUpload(null);
      message.success(`音色「${name}」已上传并绑定`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '音色上传失败');
      setVoiceUpload(prev => prev ? { ...prev, submitting: false } : prev);
    }
  }, [voiceUpload, characters, handleFieldSave, message]);

  // ---- 行渲染 ----
  const renderMediaCell = (
    type: AssetType,
    id: string,
    mainSrc: string,
    reference?: StoredMediaAsset,
  ) => {
    const generating = generatingIds.has(id);
    const refSrc = toDisplaySrc(reference ? (reference.remoteUrl || reference.localPath) : undefined);
    return (
      <div className="flex flex-col gap-1.5 shrink-0 w-[148px]">
        {/* 主图：点击放大预览 */}
        <div className="relative w-[148px] h-[148px] rounded-md overflow-hidden bg-bg-elevated border border-border-subtle/70">
          {mainSrc ? (
            <Image
              src={mainSrc}
              width={148}
              height={148}
              className="object-cover"
              preview={{ mask: <span className="text-[11px]">预览</span> }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-text-tertiary gap-1">
              <PictureOutlined className="text-[22px]" />
              <span className="text-[10px]">暂无参考图</span>
            </div>
          )}
          {generating && (
            <div className="absolute inset-0 bg-bg-app/60 flex flex-col items-center justify-center gap-1 text-text-secondary">
              <LoadingOutlined />
              <span className="text-[10px]">生成中…</span>
            </div>
          )}
        </div>
        {/* 图操作：AI 生成 / 上传主图 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => void handleGenerateImage(type, id)}
            disabled={generating}
            className="flex-1 h-6 flex items-center justify-center gap-1 text-[10px] text-status-info bg-bg-surface border border-border-subtle rounded hover:border-status-info/60 cursor-pointer disabled:opacity-50"
          >
            <ThunderboltOutlined /> {mainSrc ? '重新生成' : 'AI 生成'}
          </button>
          <Tooltip title="上传本地图片作为主参考图">
            <button
              onClick={() => void handleUploadImage(type, id)}
              className="w-6 h-6 flex items-center justify-center text-text-secondary bg-bg-surface border border-border-subtle rounded hover:text-text-primary cursor-pointer"
            >
              <UploadOutlined className="text-[10px]" />
            </button>
          </Tooltip>
        </div>
        {/* 使用参考图（生成参考） */}
        {refSrc ? (
          <div className="flex items-center gap-1">
            <Image src={refSrc} width={28} height={28} className="object-cover rounded" preview={{ mask: false }} />
            <span className="flex-1 text-[10px] text-text-tertiary truncate" title="生成时作为参考">生成参考</span>
            <Tooltip title="移除使用参考图">
              <button
                onClick={() => void handleClearReference(type, id)}
                className="w-4 h-4 flex items-center justify-center text-text-tertiary hover:text-status-error cursor-pointer"
              >
                <CloseOutlined className="text-[8px]" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <Tooltip title="上传一张参考图，AI 生成主图时作为身份/空间/物品参考">
            <button
              onClick={() => void handleUploadReference(type, id)}
              className="h-6 w-full flex items-center justify-center gap-1 text-[10px] text-text-tertiary border border-dashed border-border-subtle rounded hover:text-text-secondary hover:border-border cursor-pointer"
            >
              <PlusOutlined className="text-[8px]" /> 使用参考图
            </button>
          </Tooltip>
        )}
      </div>
    );
  };

  const renderDeleteBtn = (type: AssetType, id: string) => (
    <Tooltip title="删除该资产（从项目资产库移除，参考图文件一并清理）">
      <button
        onClick={() => void handleDelete(type, id)}
        className="shrink-0 w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-status-error hover:bg-bg-hover rounded cursor-pointer"
      >
        <DeleteOutlined className="text-[12px]" />
      </button>
    </Tooltip>
  );

  const renderCharacterRow = (c: Character) => {
    const appearanceOpen = appearanceCharacterId === c.id;
    const variantCount = c.variants?.length || 0;
    return (
      <div key={c.id} className="px-3 py-3 border-b border-border-subtle/60">
        <div className="flex items-stretch gap-3">
          {renderMediaCell('character', c.id, toDisplaySrc(getCharacterCostumePhotoSource(c)), c.media?.referenceImage)}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            {/* 行1：身份字段 */}
            <div className="flex items-center gap-1.5 h-8">
              <Input
                key={`${c.id}-name`}
                defaultValue={c.name}
                placeholder="角色名"
                className={`${inputCls} flex-1 min-w-0`}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) handleFieldSave('character', c.id, { name: v }); }}
              />
              <Select value={c.role} options={ROLE_OPTIONS} className="w-[88px] shrink-0" onChange={(role) => handleFieldSave('character', c.id, { role })} />
              <Select value={c.gender ?? 'unknown'} options={GENDER_OPTIONS} className="w-[76px] shrink-0" onChange={(gender) => handleFieldSave('character', c.id, { gender })} />
              <Input
                key={`${c.id}-age`}
                defaultValue={c.age || ''}
                placeholder="年龄"
                className={`${inputCls} !w-[80px] shrink-0`}
                onBlur={(e) => { if (e.target.value !== (c.age || '')) handleFieldSave('character', c.id, { age: e.target.value }); }}
              />
              <Tooltip title="把该角色存入演员库（跨项目复用）">
                <button
                  onClick={() => void handleSaveToLibrary(c)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-accent hover:bg-bg-hover rounded cursor-pointer"
                >
                  <TeamOutlined className="text-[12px]" />
                </button>
              </Tooltip>
              {renderDeleteBtn('character', c.id)}
            </div>

            {/* 行2：音色 + 代称。音色必须能清空 —— 除了 Select 自带的 ✕，
                这里再给一个常驻按钮，窄布局下 antd 的清除图标容易被挤到点不到。 */}
            <div className="flex items-center gap-1.5 h-8">
              <div className="flex-1 min-w-0" key={`${c.id}-voice-${voiceLibVersion}`}>
                <CharacterVoiceSelect
                  value={c.voiceId}
                  placeholder="绑定音色"
                  onChange={(voiceId) => handleFieldSave('character', c.id, { voiceId: voiceId || undefined })}
                />
              </div>
              <Tooltip title={c.voiceId ? '清除音色绑定（回到项目默认音色）' : '当前未绑定音色'}>
                <button
                  onClick={() => handleFieldSave('character', c.id, { voiceId: undefined })}
                  disabled={!c.voiceId}
                  className="shrink-0 w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-status-error hover:bg-bg-hover rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <CloseOutlined className="text-[11px]" />
                </button>
              </Tooltip>
              <Tooltip title="上传自定义音色样本音频，上传后自动绑定到该角色">
                <button
                  onClick={() => setVoiceUpload({ characterId: c.id, name: `${c.name}的音色`, filePath: '', submitting: false })}
                  className="shrink-0 w-8 h-8 flex items-center justify-center text-text-secondary hover:text-accent hover:bg-bg-hover rounded cursor-pointer"
                >
                  <CloudUploadOutlined className="text-[13px]" />
                </button>
              </Tooltip>
              <Input
                key={`${c.id}-aliases`}
                defaultValue={c.aliases || ''}
                placeholder="代称（多个用英文逗号分隔）"
                className={`${inputCls} flex-1 min-w-0`}
                onBlur={(e) => { if (e.target.value !== (c.aliases || '')) handleFieldSave('character', c.id, { aliases: e.target.value }); }}
              />
            </div>

            {/* 行3：视觉提示词 */}
            <div className="flex-1 min-h-0">
              <Input.TextArea
                key={`${c.id}-prompt`}
                defaultValue={c.prompt || ''}
                placeholder="视觉描述提示词（外貌/服装/体态等客观可见设定，供生图生视频保持一致性）"
                className="!text-[11px] !bg-bg-surface/60 !h-full resize-none"
                onBlur={(e) => { if (e.target.value !== (c.prompt || '')) handleFieldSave('character', c.id, { prompt: e.target.value }); }}
              />
            </div>
          </div>
        </div>

        {/* 形象面板开关：预览视频 + 子形象都在抽屉内直接完成，不再弹窗 */}
        <button
          onClick={() => setAppearanceCharacterId(appearanceOpen ? null : c.id)}
          className={`mt-2 w-full h-7 flex items-center justify-center gap-1.5 text-[11px] rounded border transition-colors cursor-pointer ${
            appearanceOpen
              ? 'border-accent/50 text-accent bg-accent/5'
              : 'border-border-subtle text-text-tertiary hover:text-text-primary hover:border-border'
          }`}
        >
          <SkinOutlined className="text-[11px]" />
          形象 · 预览视频与子形象
          {variantCount > 0 && <span className="text-[10px] text-text-muted">（{variantCount} 个子形象）</span>}
          <span className="text-[9px]">{appearanceOpen ? '▲' : '▼'}</span>
        </button>

        {appearanceOpen && (
          <CharacterAppearancePanel
            projectId={projectId}
            character={c}
            script={script}
            aspectRatio={aspectRatio}
            styleSnapshot={styleSnapshot}
            ttiSelection={ttiSelection}
            llmSelection={llmSelection}
            onChange={async (updated) => {
              setCharacters(prev => prev.map(item => (item.id === updated.id ? updated : item)));
              await persist('character', updated);
            }}
          />
        )}
      </div>
    );
  };

  const renderSceneRow = (s: Scene) => (
    <div key={s.id} className="flex items-stretch gap-3 px-3 py-3 border-b border-border-subtle/60">
      {renderMediaCell('scene', s.id, toDisplaySrc(getScenePreviewImageSource(s)), s.media?.referenceImage)}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 h-8">
          <Input
            key={`${s.id}-name`}
            defaultValue={s.name}
            placeholder="场景名"
            className={`${inputCls} flex-1 min-w-0`}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) handleFieldSave('scene', s.id, { name: v }); }}
          />
          <Select
            value={s.time}
            options={SCENE_TIME_OPTIONS}
            allowClear
            placeholder="时间"
            className="w-[88px] shrink-0"
            onChange={(time) => handleFieldSave('scene', s.id, { time: time ?? undefined })}
          />
          <Input
            key={`${s.id}-location`}
            defaultValue={s.location || ''}
            placeholder="位置"
            className={`${inputCls} !w-[100px] shrink-0`}
            onBlur={(e) => { if (e.target.value !== (s.location || '')) handleFieldSave('scene', s.id, { location: e.target.value }); }}
          />
          <Input
            key={`${s.id}-mood`}
            defaultValue={s.mood || ''}
            placeholder="氛围"
            className={`${inputCls} !w-[100px] shrink-0`}
            onBlur={(e) => { if (e.target.value !== (s.mood || '')) handleFieldSave('scene', s.id, { mood: e.target.value }); }}
          />
          {renderDeleteBtn('scene', s.id)}
        </div>
        <Input
          key={`${s.id}-aliases`}
          defaultValue={s.aliases || ''}
          placeholder="代称（多个用英文逗号分隔）"
          className={`${inputCls} h-8`}
          onBlur={(e) => { if (e.target.value !== (s.aliases || '')) handleFieldSave('scene', s.id, { aliases: e.target.value }); }}
        />
        <div className="flex-1 min-h-0">
          <Input.TextArea
            key={`${s.id}-prompt`}
            defaultValue={s.prompt || ''}
            placeholder="空间/构图/光线等视觉描述提示词"
            className="!text-[11px] !bg-bg-surface/60 !h-full resize-none"
            onBlur={(e) => { if (e.target.value !== (s.prompt || '')) handleFieldSave('scene', s.id, { prompt: e.target.value }); }}
          />
        </div>
      </div>
    </div>
  );

  const renderPropRow = (p: Prop) => (
    <div key={p.id} className="flex items-stretch gap-3 px-3 py-3 border-b border-border-subtle/60">
      {renderMediaCell('prop', p.id, toDisplaySrc(getPropPreviewImageSource(p)), p.media?.referenceImage)}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 h-8">
          <Input
            key={`${p.id}-name`}
            defaultValue={p.name}
            placeholder="道具名"
            className={`${inputCls} flex-1 min-w-0`}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) handleFieldSave('prop', p.id, { name: v }); }}
          />
          <Input
            key={`${p.id}-type`}
            defaultValue={p.type || ''}
            placeholder="类型"
            className={`${inputCls} !w-[100px] shrink-0`}
            onBlur={(e) => { if (e.target.value !== (p.type || '')) handleFieldSave('prop', p.id, { type: e.target.value }); }}
          />
          <Input
            key={`${p.id}-aliases`}
            defaultValue={p.aliases || ''}
            placeholder="代称（多个用英文逗号分隔）"
            className={`${inputCls} flex-1 min-w-0`}
            onBlur={(e) => { if (e.target.value !== (p.aliases || '')) handleFieldSave('prop', p.id, { aliases: e.target.value }); }}
          />
          {renderDeleteBtn('prop', p.id)}
        </div>
        <div className="flex-1 min-h-0">
          <Input.TextArea
            key={`${p.id}-prompt`}
            defaultValue={p.prompt || ''}
            placeholder="材质/形状/关键特征等视觉描述提示词"
            className="!text-[11px] !bg-bg-surface/60 !h-full resize-none"
            onBlur={(e) => { if (e.target.value !== (p.prompt || '')) handleFieldSave('prop', p.id, { prompt: e.target.value }); }}
          />
        </div>
      </div>
    </div>
  );

  const renderRows = (type: AssetType) => {
    if (loading) {
      return <div className="flex justify-center py-10"><Spin size="small" /></div>;
    }
    if (type === 'character') {
      if (!characters.length) return <Empty description="暂无角色" className="py-10" />;
      return characters.map(renderCharacterRow);
    }
    if (type === 'scene') {
      if (!scenes.length) return <Empty description="暂无场景" className="py-10" />;
      return scenes.map(renderSceneRow);
    }
    if (!props.length) return <Empty description="暂无道具" className="py-10" />;
    return props.map(renderPropRow);
  };

  return (
    <>
      {/* 右缘居中悬浮入口：角色 / 场景 / 道具 */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
        {(Object.keys(TYPE_META) as AssetType[]).map(type => (
          <Tooltip key={type} title={`${TYPE_META[type].label}（${counts[type]}）`} placement="left">
            <button
              onClick={() => setOpenType(type)}
              className="relative flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-bg-surface border border-border-subtle shadow-md text-text-secondary hover:text-accent hover:border-accent/50 transition-colors cursor-pointer"
            >
              <span className="text-[14px] leading-none">{TYPE_META[type].icon}</span>
              <span className="text-[9px] leading-none mt-0.5 text-text-tertiary">{counts[type]}</span>
            </button>
          </Tooltip>
        ))}
      </div>

      <Drawer
        title={openType ? `${TYPE_META[openType].label}资产（${counts[openType]}）` : ''}
        placement="right"
        // 角色行内嵌形象面板（预览视频 + 子形象列表），比场景/道具需要更多横向空间
        width={openType === 'character' ? 880 : 720}
        open={openType !== null}
        onClose={() => { setOpenType(null); setAppearanceCharacterId(null); }}
        styles={{ body: { padding: 0 } }}
        extra={openType && (
          <div className="flex items-center gap-3">
            {openType === 'character' && (
              <button
                onClick={() => void handleOpenLibrary()}
                className="flex items-center gap-1 text-[12px] text-text-secondary hover:text-text-primary cursor-pointer"
              >
                <TeamOutlined className="text-[10px]" /> 演员库
              </button>
            )}
            <Tooltip title="从当前剧集剧本提取角色/场景/道具资产">
              <button
                onClick={() => void handleExtractAssets()}
                disabled={isExtracting}
                className="flex items-center gap-1 text-[12px] text-status-info hover:opacity-80 cursor-pointer disabled:opacity-50"
              >
                {isExtracting ? <LoadingOutlined className="text-[10px]" /> : <ThunderboltOutlined className="text-[10px]" />}
                从剧本提取
              </button>
            </Tooltip>
            <Tooltip title="为当前类型缺参考图的资产批量 AI 生成主图">
              <button
                onClick={() => void handleBatchGenerate(openType)}
                disabled={batchGenerating}
                className="flex items-center gap-1 text-[12px] text-status-info hover:opacity-80 cursor-pointer disabled:opacity-50"
              >
                {batchGenerating ? <LoadingOutlined className="text-[10px]" /> : <ThunderboltOutlined className="text-[10px]" />}
                批量生成
              </button>
            </Tooltip>
            <button
              onClick={() => void handleCreate(openType)}
              className="flex items-center gap-1 text-[12px] text-status-info hover:opacity-80 cursor-pointer"
            >
              <PlusOutlined className="text-[10px]" /> 新建{TYPE_META[openType].label}
            </button>
          </div>
        )}
      >
        {openType && renderRows(openType)}
      </Drawer>

      {/* 演员库：选入项目 */}
      <Modal
        title="演员库（选入项目）"
        open={libraryOpen}
        onCancel={() => setLibraryOpen(false)}
        footer={null}
        width={520}
      >
        {libraryLoading ? (
          <div className="flex justify-center py-8"><Spin size="small" /></div>
        ) : actors.length === 0 ? (
          <Empty description="演员库为空——可先在角色行上点「入库」" className="py-8" />
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {actors.map(actor => {
              return (
                <div key={actor.id} className="flex items-center gap-2.5 py-2 border-b border-border-subtle/60">
                  {(() => {
                    // 本地文件优先：remoteUrl 可能是已过期的临时容器链接
                    const src = toDisplaySrc(actor.costumePhotoPath) || toDisplaySrc(actor.costumePhotoRemoteUrl);
                    return src ? (
                      <Image src={src} width={40} height={40} className="object-cover rounded" preview={{ mask: false }} />
                    ) : (
                      <div className="w-10 h-10 rounded bg-bg-elevated flex items-center justify-center text-text-tertiary"><UserOutlined /></div>
                    );
                  })()}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-text-primary truncate">{actor.name}</div>
                    <div className="text-[11px] text-text-tertiary truncate">{actor.prompt || '（无描述）'}</div>
                  </div>
                  <button
                    onClick={() => void handlePickActor(actor)}
                    className="text-[11px] text-status-info hover:opacity-80 cursor-pointer shrink-0"
                  >
                    选入项目
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* 上传音色：样本音频 → 音色库 → 绑定到角色 */}
      <Modal
        title="上传音色并绑定"
        open={voiceUpload !== null}
        onCancel={() => setVoiceUpload(null)}
        onOk={() => void handleVoiceUploadSubmit()}
        okText={voiceUpload?.submitting ? '上传中…' : '上传并绑定'}
        okButtonProps={{ disabled: voiceUpload?.submitting }}
        width={420}
      >
        <div className="flex flex-col gap-3 py-2">
          <div>
            <div className="text-[12px] text-text-secondary mb-1">音色名称</div>
            <Input
              value={voiceUpload?.name ?? ''}
              onChange={(e) => setVoiceUpload(prev => prev ? { ...prev, name: e.target.value } : prev)}
              placeholder="例如：叶赎的音色"
            />
          </div>
          <div>
            <div className="text-[12px] text-text-secondary mb-1">样本音频（wav / mp3 / m4a / ogg / flac / webm）</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handlePickVoiceFile()}
                className="flex items-center gap-1 px-2.5 h-8 text-[12px] text-text-secondary bg-bg-surface border border-border rounded hover:text-text-primary cursor-pointer"
              >
                <AudioOutlined /> 选择音频文件
              </button>
              <span className="text-[11px] text-text-tertiary truncate flex-1">
                {voiceUpload?.filePath ? voiceUpload.filePath.split('/').pop() : '未选择'}
              </span>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default AssetDock;
