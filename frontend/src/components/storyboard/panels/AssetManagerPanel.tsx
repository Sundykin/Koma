/**
 * AssetManagerPanel - 资产管理面板
 * 角色/场景/道具的查看、提取和编辑
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, Button, Card, Empty, Spin, Typography, Space, App, Input, Modal } from 'antd';
import { RobotOutlined, EditOutlined, ThunderboltOutlined, LoadingOutlined } from '@ant-design/icons';
import type { Character, Scene, Prop, ProjectStyleSnapshot } from '../../../types';
import { getMediaAssetDisplaySource } from '../../../types';
import { loadCharacters, loadScenes, loadProps, saveCharacters, saveScenes, saveProps, loadEpisodeShots } from '../../../store/projectStore';
import { getCharacterCostumePhotoSource } from '../../../utils/mediaSelectors';
import { createCreationContext } from '../../../services/CreationContext';
import { resolvePromptTemplate } from '../../../store/promptTemplates';
import { parseLLMJSON } from '../../../utils/llmJsonParser';
import { createLogger } from '../../../store/logger';
import { generateCostumePhoto } from '../../../workflow/characterAssetWorkflow';
import { generateSceneImage, generatePropImage } from '../../../workflow/scenePropAssetWorkflow';
import {
  createStoredMediaAsset,
  updateCharacterMedia,
  updateSceneMedia,
  updatePropMedia,
} from '../../../utils/mediaAssets';
import { v4 as uuidv4 } from 'uuid';
import type { AssetManagerSession, AssetPanelTab } from './workflowSessions';
import { resolveStoryboardMediaSource } from '../storyboardMedia';

const logger = createLogger('AssetManagerPanel');

/** LLM 可能返回对象包裹数组，强制提取为数组 */
function coerceArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const values = Object.values(data as Record<string, unknown>);
    const arr = values.find(v => Array.isArray(v));
    if (arr) return arr as T[];
  }
  return [];
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickFirstText(...values: unknown[]): string {
  return values.map(normalizeText).find(Boolean) || '';
}

function isSameText(a: unknown, b: unknown): boolean {
  return normalizeText(a) === normalizeText(b);
}

type ExtractedCharacter = {
  name?: string;
  prompt?: string;
  appearance?: string;
  description?: string;
  age?: string;
  gender?: Character['gender'];
  role?: Character['role'];
};

type ExtractedScene = {
  name?: string;
  prompt?: string;
  description?: string;
  time?: Scene['time'];
  mood?: string;
};

type ExtractedProp = {
  name?: string;
  prompt?: string;
  description?: string;
  type?: string;
};
const { Text } = Typography;
const { TextArea } = Input;

interface AssetManagerPanelProps {
  projectId: string;
  episodeId: string;
  ttiSelection?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  session: AssetManagerSession;
  onSessionChange: (updates: Partial<AssetManagerSession>) => void;
  onAssetsChanged?: () => void;
}

type AssetKind = 'character' | 'scene' | 'prop';

interface EditingAsset {
  type: AssetKind;
  index: number;
  name: string;
  description: string;
}

interface AssetListItem {
  id: string;
  index: number;
  name: string;
  description: string;
  image?: string;
}

export const AssetManagerPanel: React.FC<AssetManagerPanelProps> = ({
  projectId,
  episodeId,
  ttiSelection,
  styleSnapshot,
  session,
  onSessionChange,
  onAssetsChanged,
}) => {
  const { message } = App.useApp();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [generatingPreviewKey, setGeneratingPreviewKey] = useState<string | null>(null);
  const [batchGeneratingTab, setBatchGeneratingTab] = useState<AssetPanelTab | null>(null);
  const [editingAsset, setEditingAsset] = useState<EditingAsset | null>(null);

  const updateSession = useCallback((updates: Partial<AssetManagerSession>) => {
    onSessionChange(updates);
  }, [onSessionChange]);

  const syncAssetSession = useCallback((
    nextCharacters: Character[],
    nextScenes: Scene[],
    nextProps: Prop[],
    updates: Partial<AssetManagerSession> = {},
  ) => {
    const nextSession: Partial<AssetManagerSession> = {
      characterCount: nextCharacters.length,
      sceneCount: nextScenes.length,
      propCount: nextProps.length,
      ...updates,
    };
    const shouldUpdate = nextSession.characterCount !== session.characterCount
      || nextSession.sceneCount !== session.sceneCount
      || nextSession.propCount !== session.propCount
      || Object.keys(updates).length > 0;

    if (shouldUpdate) {
      updateSession(nextSession);
    }
  }, [session.characterCount, session.propCount, session.sceneCount, updateSession]);

  const loadAssets = useCallback(async () => {
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
      syncAssetSession(chars, scns, prps);
    } catch {
      message.error('加载资产失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, message, syncAssetSession]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const updateLastApplied = useCallback((
    scopeLabel: string,
    summary: string,
    affectedCount: number,
    nextCharacters: Character[] = characters,
    nextScenes: Scene[] = scenes,
    nextProps: Prop[] = props,
  ) => {
    syncAssetSession(nextCharacters, nextScenes, nextProps, {
      currentStep: 1,
      affectedScopeLabel: scopeLabel,
      lastApplied: {
        appliedAt: Date.now(),
        summary,
        affectedCount,
        scopeLabel,
      },
    });
  }, [characters, props, scenes, syncAssetSession]);

  const characterItems = useMemo<AssetListItem[]>(
    () => characters.map((char, index) => ({
      id: char.id,
      index,
      name: char.name,
      description: pickFirstText(char.prompt, char.appearance, char.description),
      image: getCharacterCostumePhotoSource(char),
    })),
    [characters],
  );

  const sceneItems = useMemo<AssetListItem[]>(
    () => scenes.map((scene, index) => ({
      id: scene.id,
      index,
      name: scene.name,
      description: pickFirstText(scene.prompt, scene.description),
      image: getMediaAssetDisplaySource(scene.media?.previewImage),
    })),
    [scenes],
  );

  const propItems = useMemo<AssetListItem[]>(
    () => props.map((propItem, index) => ({
      id: propItem.id,
      index,
      name: propItem.name,
      description: pickFirstText(propItem.prompt, propItem.description),
      image: getMediaAssetDisplaySource(propItem.media?.previewImage),
    })),
    [props],
  );

  const tabGenerateLabel: Record<AssetPanelTab, string> = useMemo(() => ({
    characters: '补全角色定妆照',
    scenes: '补全场景预览图',
    props: '补全道具预览图',
  }), []);

  const buildPreviewKey = useCallback((type: AssetKind, assetId: string) => `${type}:${assetId}`, []);

  // Extract assets from script using LLM
  const handleExtractFromScript = useCallback(async () => {
    setExtracting(true);
    try {
      const ctx = await createCreationContext(projectId, episodeId);
      const shots = await loadEpisodeShots(projectId, episodeId);
      const scriptText = shots.map(s => s.scriptContent).filter(Boolean).join('\n');

      if (!scriptText.trim()) {
        message.warning('当前剧集没有分镜文案，请先导入剧本');
        return;
      }

      // Extract characters
      const charResolved = await resolvePromptTemplate('character_extraction', { script: scriptText });
      const charText = await ctx.llmProvider.generateText(charResolved.prompt);
      const extractedChars = coerceArray<ExtractedCharacter>(parseLLMJSON(charText));

      // Extract scenes
      const sceneResolved = await resolvePromptTemplate('scene_extraction', { script: scriptText });
      const sceneText = await ctx.llmProvider.generateText(sceneResolved.prompt);
      const extractedScenes = coerceArray<ExtractedScene>(parseLLMJSON(sceneText));

      // Extract props
      const propResolved = await resolvePromptTemplate('prop_extraction', { script: scriptText });
      const propText = await ctx.llmProvider.generateText(propResolved.prompt);
      const extractedProps = coerceArray<ExtractedProp>(parseLLMJSON(propText));

      // Merge with existing (avoid duplicates by name)
      const existingCharNames = new Set(characters.map(c => c.name));
      const extractedCharMap = new Map(
        extractedChars
          .map(char => [normalizeText(char.name), char] as const)
          .filter(([name]) => Boolean(name)),
      );
      let updatedCharCount = 0;
      const mergedCharacters = characters.map((char) => {
        const extracted = extractedCharMap.get(normalizeText(char.name));
        if (!extracted) return char;

        const nextChar: Character = {
          ...char,
          prompt: pickFirstText(char.prompt, extracted.prompt, extracted.appearance, extracted.description),
          appearance: pickFirstText(char.appearance, extracted.appearance),
          description: pickFirstText(char.description, extracted.description),
          age: pickFirstText(char.age, extracted.age),
          gender: char.gender || extracted.gender,
          role: char.role || extracted.role || 'supporting',
        };

        if (
          isSameText(nextChar.prompt, char.prompt)
          && isSameText(nextChar.appearance, char.appearance)
          && isSameText(nextChar.description, char.description)
          && isSameText(nextChar.age, char.age)
          && nextChar.gender === char.gender
          && nextChar.role === char.role
        ) {
          return char;
        }

        updatedCharCount += 1;
        return nextChar;
      });
      const newChars: Character[] = extractedChars
        .filter(c => c.name && !existingCharNames.has(c.name))
        .map(c => ({
          id: uuidv4(),
          name: normalizeText(c.name),
          prompt: pickFirstText(c.prompt, c.appearance, c.description),
          appearance: normalizeText(c.appearance),
          description: normalizeText(c.description),
          age: normalizeText(c.age),
          gender: c.gender,
          role: c.role || 'supporting',
        }));

      const existingSceneNames = new Set(scenes.map(s => s.name));
      const extractedSceneMap = new Map(
        extractedScenes
          .map(scene => [normalizeText(scene.name), scene] as const)
          .filter(([name]) => Boolean(name)),
      );
      let updatedSceneCount = 0;
      const mergedScenes = scenes.map((scene) => {
        const extracted = extractedSceneMap.get(normalizeText(scene.name));
        if (!extracted) return scene;

        const nextScene: Scene = {
          ...scene,
          prompt: pickFirstText(scene.prompt, extracted.prompt, extracted.description),
          description: pickFirstText(scene.description, extracted.description),
          time: scene.time || extracted.time,
          mood: pickFirstText(scene.mood, extracted.mood),
        };

        if (
          isSameText(nextScene.prompt, scene.prompt)
          && isSameText(nextScene.description, scene.description)
          && nextScene.time === scene.time
          && isSameText(nextScene.mood, scene.mood)
        ) {
          return scene;
        }

        updatedSceneCount += 1;
        return nextScene;
      });
      const newScenes: Scene[] = extractedScenes
        .filter(s => s.name && !existingSceneNames.has(s.name))
        .map(s => ({
          id: uuidv4(),
          name: normalizeText(s.name),
          prompt: pickFirstText(s.prompt, s.description),
          description: normalizeText(s.description),
          time: s.time,
          mood: normalizeText(s.mood),
        }));

      const existingPropNames = new Set(props.map(p => p.name));
      const extractedPropMap = new Map(
        extractedProps
          .map(prop => [normalizeText(prop.name), prop] as const)
          .filter(([name]) => Boolean(name)),
      );
      let updatedPropCount = 0;
      const mergedProps = props.map((propItem) => {
        const extracted = extractedPropMap.get(normalizeText(propItem.name));
        if (!extracted) return propItem;

        const nextProp: Prop = {
          ...propItem,
          prompt: pickFirstText(propItem.prompt, extracted.prompt, extracted.description),
          description: pickFirstText(propItem.description, extracted.description),
          type: pickFirstText(propItem.type, extracted.type),
        };

        if (
          isSameText(nextProp.prompt, propItem.prompt)
          && isSameText(nextProp.description, propItem.description)
          && isSameText(nextProp.type, propItem.type)
        ) {
          return propItem;
        }

        updatedPropCount += 1;
        return nextProp;
      });
      const newProps: Prop[] = extractedProps
        .filter(p => p.name && !existingPropNames.has(p.name))
        .map(p => ({
          id: uuidv4(),
          name: normalizeText(p.name),
          prompt: pickFirstText(p.prompt, p.description),
          description: normalizeText(p.description),
          type: normalizeText(p.type),
        }));

      const nextCharacters = updatedCharCount > 0 || newChars.length > 0 ? [...mergedCharacters, ...newChars] : characters;
      const nextScenes = updatedSceneCount > 0 || newScenes.length > 0 ? [...mergedScenes, ...newScenes] : scenes;
      const nextProps = updatedPropCount > 0 || newProps.length > 0 ? [...mergedProps, ...newProps] : props;

      if (updatedCharCount > 0 || newChars.length > 0) {
        await saveCharacters(projectId, nextCharacters);
        setCharacters(nextCharacters);
      }
      if (updatedSceneCount > 0 || newScenes.length > 0) {
        await saveScenes(projectId, nextScenes);
        setScenes(nextScenes);
      }
      if (updatedPropCount > 0 || newProps.length > 0) {
        await saveProps(projectId, nextProps);
        setProps(nextProps);
      }

      const createdCount = newChars.length + newScenes.length + newProps.length;
      const updatedCount = updatedCharCount + updatedSceneCount + updatedPropCount;
      const affectedCount = createdCount + updatedCount;
      syncAssetSession(nextCharacters, nextScenes, nextProps, {
        currentStep: affectedCount > 0 ? 1 : session.currentStep,
        affectedScopeLabel: '项目资产库',
        lastApplied: {
          appliedAt: Date.now(),
          summary: affectedCount > 0
            ? `新增 ${newChars.length} 角色 · ${newScenes.length} 场景 · ${newProps.length} 道具，回填 ${updatedCount} 条描述`
            : '已执行资产提取，未新增资产',
          affectedCount,
          scopeLabel: '项目资产库',
        },
      });
      onAssetsChanged?.();
      message.success(`提取完成: 新增 ${createdCount} 条，回填 ${updatedCount} 条描述`);
    } catch (err: any) {
      logger.error('资产提取失败', err);
      message.error('提取失败: ' + (err.message || '未知错误'));
    } finally {
      setExtracting(false);
    }
  }, [
    projectId,
    episodeId,
    characters,
    scenes,
    props,
    message,
    onAssetsChanged,
    session.currentStep,
    syncAssetSession,
  ]);

  // Edit asset
  const handleOpenEdit = useCallback((type: AssetKind, index: number) => {
    const list = type === 'character' ? characters : type === 'scene' ? scenes : props;
    const item = list[index];
    if (!item) return;
    setEditingAsset({ type, index, name: item.name, description: item.prompt || '' });
  }, [characters, scenes, props]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingAsset) return;
    try {
      if (editingAsset.type === 'character') {
        const updated = [...characters];
        updated[editingAsset.index] = { ...updated[editingAsset.index], name: editingAsset.name, prompt: editingAsset.description };
        await saveCharacters(projectId, updated);
        setCharacters(updated);
        syncAssetSession(updated, scenes, props, {
          currentStep: 1,
          affectedScopeLabel: '角色资产',
          lastApplied: {
            appliedAt: Date.now(),
            summary: `已更新角色资产: ${editingAsset.name}`,
            affectedCount: 1,
            scopeLabel: '角色资产',
          },
        });
      } else if (editingAsset.type === 'scene') {
        const updated = [...scenes];
        updated[editingAsset.index] = { ...updated[editingAsset.index], name: editingAsset.name, prompt: editingAsset.description };
        await saveScenes(projectId, updated);
        setScenes(updated);
        syncAssetSession(characters, updated, props, {
          currentStep: 1,
          affectedScopeLabel: '场景资产',
          lastApplied: {
            appliedAt: Date.now(),
            summary: `已更新场景资产: ${editingAsset.name}`,
            affectedCount: 1,
            scopeLabel: '场景资产',
          },
        });
      } else {
        const updated = [...props];
        updated[editingAsset.index] = { ...updated[editingAsset.index], name: editingAsset.name, prompt: editingAsset.description };
        await saveProps(projectId, updated);
        setProps(updated);
        syncAssetSession(characters, scenes, updated, {
          currentStep: 1,
          affectedScopeLabel: '道具资产',
          lastApplied: {
            appliedAt: Date.now(),
            summary: `已更新道具资产: ${editingAsset.name}`,
            affectedCount: 1,
            scopeLabel: '道具资产',
          },
        });
      }
      setEditingAsset(null);
      onAssetsChanged?.();
      message.success('已保存');
    } catch {
      message.error('保存失败');
    }
  }, [editingAsset, characters, scenes, props, projectId, message, onAssetsChanged, syncAssetSession]);

  const handleGeneratePreview = useCallback(async (type: AssetKind, index: number) => {
    if (type === 'character') {
      const target = characters[index];
      if (!target) return;
      setGeneratingPreviewKey(buildPreviewKey(type, target.id));
      try {
        const result = await generateCostumePhoto({
          projectId,
          character: target,
          styleSnapshot,
          ttiSelection,
        });

        if (!result.success || !result.path) {
          message.error(result.error || '角色定妆照生成失败');
          return;
        }

        const updatedCharacter = updateCharacterMedia(target, {
          costumePhoto: createStoredMediaAsset('image', {
            localPath: result.path,
            remoteUrl: result.url,
            createdAt: target.media?.costumePhoto?.createdAt,
          }),
        });
        const nextCharacters = [...characters];
        nextCharacters[index] = updatedCharacter;
        await saveCharacters(projectId, nextCharacters);
        setCharacters(nextCharacters);
        updateLastApplied('角色资产', `已生成 ${target.name} 定妆照`, 1, nextCharacters, scenes, props);
        onAssetsChanged?.();
        message.success(`已生成 ${target.name} 定妆照`);
      } catch (err: any) {
        message.error(`角色定妆照生成失败: ${err.message || '未知错误'}`);
      } finally {
        setGeneratingPreviewKey(null);
      }
      return;
    }

    if (type === 'scene') {
      const target = scenes[index];
      if (!target) return;
      setGeneratingPreviewKey(buildPreviewKey(type, target.id));
      try {
        const result = await generateSceneImage({
          projectId,
          scene: target,
          styleSnapshot,
          ttiSelection,
        });

        if (!result.success || !result.path) {
          message.error(result.error || '场景预览图生成失败');
          return;
        }

        const updatedScene = updateSceneMedia(target, {
          previewImage: createStoredMediaAsset('image', {
            localPath: result.path,
            remoteUrl: result.url,
            createdAt: target.media?.previewImage?.createdAt,
          }),
        });
        const nextScenes = [...scenes];
        nextScenes[index] = updatedScene;
        await saveScenes(projectId, nextScenes);
        setScenes(nextScenes);
        updateLastApplied('场景资产', `已生成 ${target.name} 场景预览图`, 1, characters, nextScenes, props);
        onAssetsChanged?.();
        message.success(`已生成 ${target.name} 场景预览图`);
      } catch (err: any) {
        message.error(`场景预览图生成失败: ${err.message || '未知错误'}`);
      } finally {
        setGeneratingPreviewKey(null);
      }
      return;
    }

    const target = props[index];
    if (!target) return;
    setGeneratingPreviewKey(buildPreviewKey(type, target.id));
    try {
      const result = await generatePropImage({
        projectId,
        prop: target,
        styleSnapshot,
        ttiSelection,
      });

      if (!result.success || !result.path) {
        message.error(result.error || '道具预览图生成失败');
        return;
      }

      const updatedProp = updatePropMedia(target, {
        previewImage: createStoredMediaAsset('image', {
          localPath: result.path,
          remoteUrl: result.url,
          createdAt: target.media?.previewImage?.createdAt,
        }),
      });
      const nextProps = [...props];
      nextProps[index] = updatedProp;
      await saveProps(projectId, nextProps);
      setProps(nextProps);
      updateLastApplied('道具资产', `已生成 ${target.name} 道具预览图`, 1, characters, scenes, nextProps);
      onAssetsChanged?.();
      message.success(`已生成 ${target.name} 道具预览图`);
    } catch (err: any) {
      message.error(`道具预览图生成失败: ${err.message || '未知错误'}`);
    } finally {
      setGeneratingPreviewKey(null);
    }
  }, [
    buildPreviewKey,
    characters,
    message,
    onAssetsChanged,
    projectId,
    props,
    scenes,
    styleSnapshot,
    ttiSelection,
    updateLastApplied,
  ]);

  const handleGenerateMissingPreviews = useCallback(async () => {
    const activeTab = session.activeTab;
    setBatchGeneratingTab(activeTab);

    try {
      if (activeTab === 'characters') {
        const targets = characters
          .map((character, index) => ({ character, index }))
          .filter(({ character }) => !getCharacterCostumePhotoSource(character));

        if (targets.length === 0) {
          message.info('当前角色都已有定妆照');
          return;
        }

        const nextCharacters = [...characters];
        let successCount = 0;
        for (const { character, index } of targets) {
          setGeneratingPreviewKey(buildPreviewKey('character', character.id));
          const result = await generateCostumePhoto({
            projectId,
            character: nextCharacters[index],
            styleSnapshot,
            ttiSelection,
          });
          if (!result.success || !result.path) {
            logger.warn('批量生成角色定妆照失败', { characterId: character.id, error: result.error });
            continue;
          }
          nextCharacters[index] = updateCharacterMedia(nextCharacters[index], {
            costumePhoto: createStoredMediaAsset('image', {
              localPath: result.path,
              remoteUrl: result.url,
              createdAt: nextCharacters[index].media?.costumePhoto?.createdAt,
            }),
          });
          successCount += 1;
        }
        setGeneratingPreviewKey(null);

        if (successCount === 0) {
          message.warning('角色定妆照生成失败，请检查图像模型配置');
          return;
        }

        await saveCharacters(projectId, nextCharacters);
        setCharacters(nextCharacters);
        updateLastApplied('角色资产', `已补全 ${successCount} 个角色定妆照`, successCount, nextCharacters, scenes, props);
        onAssetsChanged?.();
        message.success(`已补全 ${successCount} 个角色定妆照`);
        return;
      }

      if (activeTab === 'scenes') {
        const targets = scenes
          .map((scene, index) => ({ scene, index }))
          .filter(({ scene }) => !getMediaAssetDisplaySource(scene.media?.previewImage));

        if (targets.length === 0) {
          message.info('当前场景都已有预览图');
          return;
        }

        const nextScenes = [...scenes];
        let successCount = 0;
        for (const { scene, index } of targets) {
          setGeneratingPreviewKey(buildPreviewKey('scene', scene.id));
          const result = await generateSceneImage({
            projectId,
            scene: nextScenes[index],
            styleSnapshot,
            ttiSelection,
          });
          if (!result.success || !result.path) {
            logger.warn('批量生成场景预览图失败', { sceneId: scene.id, error: result.error });
            continue;
          }
          nextScenes[index] = updateSceneMedia(nextScenes[index], {
            previewImage: createStoredMediaAsset('image', {
              localPath: result.path,
              remoteUrl: result.url,
              createdAt: nextScenes[index].media?.previewImage?.createdAt,
            }),
          });
          successCount += 1;
        }
        setGeneratingPreviewKey(null);

        if (successCount === 0) {
          message.warning('场景预览图生成失败，请检查图像模型配置');
          return;
        }

        await saveScenes(projectId, nextScenes);
        setScenes(nextScenes);
        updateLastApplied('场景资产', `已补全 ${successCount} 个场景预览图`, successCount, characters, nextScenes, props);
        onAssetsChanged?.();
        message.success(`已补全 ${successCount} 个场景预览图`);
        return;
      }

      const targets = props
        .map((propItem, index) => ({ propItem, index }))
        .filter(({ propItem }) => !getMediaAssetDisplaySource(propItem.media?.previewImage));

      if (targets.length === 0) {
        message.info('当前道具都已有预览图');
        return;
      }

      const nextProps = [...props];
      let successCount = 0;
      for (const { propItem, index } of targets) {
        setGeneratingPreviewKey(buildPreviewKey('prop', propItem.id));
        const result = await generatePropImage({
          projectId,
          prop: nextProps[index],
          styleSnapshot,
          ttiSelection,
        });
        if (!result.success || !result.path) {
          logger.warn('批量生成道具预览图失败', { propId: propItem.id, error: result.error });
          continue;
        }
        nextProps[index] = updatePropMedia(nextProps[index], {
          previewImage: createStoredMediaAsset('image', {
            localPath: result.path,
            remoteUrl: result.url,
            createdAt: nextProps[index].media?.previewImage?.createdAt,
          }),
        });
        successCount += 1;
      }
      setGeneratingPreviewKey(null);

      if (successCount === 0) {
        message.warning('道具预览图生成失败，请检查图像模型配置');
        return;
      }

      await saveProps(projectId, nextProps);
      setProps(nextProps);
      updateLastApplied('道具资产', `已补全 ${successCount} 个道具预览图`, successCount, characters, scenes, nextProps);
      onAssetsChanged?.();
      message.success(`已补全 ${successCount} 个道具预览图`);
    } catch (err: any) {
      message.error(`批量生成预览失败: ${err.message || '未知错误'}`);
    } finally {
      setGeneratingPreviewKey(null);
      setBatchGeneratingTab(null);
    }
  }, [
    buildPreviewKey,
    characters,
    message,
    onAssetsChanged,
    projectId,
    props,
    scenes,
    session.activeTab,
    styleSnapshot,
    ttiSelection,
    updateLastApplied,
  ]);

  const renderAssetCard = (type: AssetKind, item: AssetListItem) => (
    <Card
      size="small"
      className="bg-zinc-900 border-zinc-700 cursor-pointer hover:border-zinc-500 transition-colors"
      styles={{ body: { padding: '8px 12px' } }}
      onClick={() => handleOpenEdit(type, item.index)}
    >
      <div className="flex items-center gap-3">
        {item.image ? (
          <img
            src={resolveStoryboardMediaSource(item.image)}
            alt={item.name}
            className="w-10 h-10 rounded object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center text-zinc-600 text-xs">N/A</div>
        )}
        <div className="flex-1 min-w-0">
          <Text className="text-zinc-200 block truncate">{item.name}</Text>
          <Text type="secondary" className="text-xs block truncate">{item.description || '无描述'}</Text>
        </div>
        <Space size={4} onClick={(event) => event.stopPropagation()}>
          <Button
            size="small"
            icon={
              generatingPreviewKey === buildPreviewKey(type, item.id)
                ? <LoadingOutlined />
                : <ThunderboltOutlined />
            }
            loading={generatingPreviewKey === buildPreviewKey(type, item.id)}
            disabled={extracting || batchGeneratingTab !== null}
            onClick={() => void handleGeneratePreview(type, item.index)}
          >
            {item.image ? '重生成' : '生成'}
          </Button>
          <Button size="small" icon={<EditOutlined />} disabled={batchGeneratingTab !== null} onClick={() => handleOpenEdit(type, item.index)}>
            编辑
          </Button>
        </Space>
      </div>
    </Card>
  );

  const renderList = (type: AssetKind, items: AssetListItem[]) => {
    if (items.length === 0) return <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    return (
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.id}>{renderAssetCard(type, item)}</div>
        ))}
      </div>
    );
  };

  if (loading) return <div className="flex justify-center p-8"><Spin /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 border-b border-zinc-800">
        <Space wrap>
          <Button icon={<RobotOutlined />} size="small" onClick={handleExtractFromScript} loading={extracting} disabled={batchGeneratingTab !== null}>
            从剧本提取
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            size="small"
            onClick={() => void handleGenerateMissingPreviews()}
            loading={batchGeneratingTab === session.activeTab}
            disabled={extracting || generatingPreviewKey !== null}
          >
            {tabGenerateLabel[session.activeTab]}
          </Button>
        </Space>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Tabs
          activeKey={session.activeTab}
          onChange={(key) => updateSession({ activeTab: key as AssetPanelTab })}
          className="px-4"
          items={[
            { key: 'characters', label: `角色 (${characters.length})`, children: renderList('character', characterItems) },
            { key: 'scenes', label: `场景 (${scenes.length})`, children: renderList('scene', sceneItems) },
            { key: 'props', label: `道具 (${props.length})`, children: renderList('prop', propItems) },
          ]}
        />
      </div>
      <Modal title="编辑资产" open={!!editingAsset} onOk={handleSaveEdit} onCancel={() => setEditingAsset(null)} okText="保存" cancelText="取消">
        {editingAsset && (
          <div className="flex flex-col gap-3">
            <div>
              <Text className="text-zinc-400 text-xs">名称</Text>
              <Input value={editingAsset.name} onChange={e => setEditingAsset({ ...editingAsset, name: e.target.value })} />
            </div>
            <div>
              <Text className="text-zinc-400 text-xs">描述 / 外观提示词</Text>
              <TextArea value={editingAsset.description} onChange={e => setEditingAsset({ ...editingAsset, description: e.target.value })} rows={4} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
