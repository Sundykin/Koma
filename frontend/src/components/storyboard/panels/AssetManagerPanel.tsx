/**
 * AssetManagerPanel - 资产管理面板
 * 角色/场景/道具的查看、提取和编辑
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Button, Card, Empty, Spin, Typography, Space, App, Input, Modal } from 'antd';
import { RobotOutlined, EditOutlined } from '@ant-design/icons';
import type { Character, Scene, Prop } from '../../../types';
import { getMediaAssetDisplaySource } from '../../../types';
import { loadCharacters, loadScenes, loadProps, saveCharacters, saveScenes, saveProps, loadEpisodeShots } from '../../../store/projectStore';
import { getCharacterCostumePhotoSource } from '../../../utils/mediaSelectors';
import { createCreationContext } from '../../../services/CreationContext';
import { resolvePromptTemplate } from '../../../store/promptTemplates';
import { parseLLMJSON } from '../../../utils/llmJsonParser';
import { createLogger } from '../../../store/logger';
import { generateCostumePhoto } from '../../../workflow/characterAssetWorkflow';
import { v4 as uuidv4 } from 'uuid';
import type { AssetManagerSession, AssetPanelTab } from './workflowSessions';

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
  session: AssetManagerSession;
  onSessionChange: (updates: Partial<AssetManagerSession>) => void;
  onAssetsChanged?: () => void;
}

interface EditingAsset {
  type: 'character' | 'scene' | 'prop';
  index: number;
  name: string;
  description: string;
}

export const AssetManagerPanel: React.FC<AssetManagerPanelProps> = ({
  projectId,
  episodeId,
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
  const [generatingImage, setGeneratingImage] = useState(false);
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
  const handleOpenEdit = useCallback((type: 'character' | 'scene' | 'prop', index: number) => {
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

  // Generate reference image for character
  const handleGenerateImage = useCallback(async (charIndex: number) => {
    const char = characters[charIndex];
    if (!char) return;
    setGeneratingImage(true);
    try {
      const result = await generateCostumePhoto({ projectId, character: char });
      if (result.success) {
        message.success(`已生成 ${char.name} 定妆照`);
        updateSession({
          currentStep: 1,
          affectedScopeLabel: '角色资产',
          lastApplied: {
            appliedAt: Date.now(),
            summary: `已生成 ${char.name} 定妆照`,
            affectedCount: 1,
            scopeLabel: '角色资产',
          },
        });
        await loadAssets();
        onAssetsChanged?.();
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error('生成失败: ' + (err.message || '未知错误'));
    } finally {
      setGeneratingImage(false);
    }
  }, [characters, projectId, message, loadAssets, onAssetsChanged, updateSession]);

  const renderAssetCard = (type: 'character' | 'scene' | 'prop', index: number, name: string, description: string, image?: string) => (
    <Card
      size="small"
      className="bg-zinc-900 border-zinc-700 cursor-pointer hover:border-zinc-500 transition-colors"
      styles={{ body: { padding: '8px 12px' } }}
      onClick={() => handleOpenEdit(type, index)}
    >
      <div className="flex items-center gap-3">
        {image ? (
          <img src={image} alt={name} className="w-10 h-10 rounded object-cover" />
        ) : (
          <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center text-zinc-600 text-xs">N/A</div>
        )}
        <div className="flex-1 min-w-0">
          <Text className="text-zinc-200 block truncate">{name}</Text>
          <Text type="secondary" className="text-xs block truncate">{description || '无描述'}</Text>
        </div>
        <EditOutlined className="text-zinc-500 text-xs" />
      </div>
    </Card>
  );

  const renderList = (type: 'character' | 'scene' | 'prop', items: { name: string; description?: string; image?: string }[]) => {
    if (items.length === 0) return <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    return (
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i}>{renderAssetCard(type, i, item.name, item.description || '', item.image)}</div>
        ))}
      </div>
    );
  };

  if (loading) return <div className="flex justify-center p-8"><Spin /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 border-b border-zinc-800">
        <Button icon={<RobotOutlined />} size="small" onClick={handleExtractFromScript} loading={extracting}>
          从剧本提取
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Tabs
          activeKey={session.activeTab}
          onChange={(key) => updateSession({ activeTab: key as AssetPanelTab })}
          className="px-4"
          items={[
            { key: 'characters', label: `角色 (${characters.length})`, children: renderList('character', characters.map(c => ({ name: c.name, description: pickFirstText(c.prompt, c.appearance, c.description), image: getCharacterCostumePhotoSource(c) }))) },
            { key: 'scenes', label: `场景 (${scenes.length})`, children: renderList('scene', scenes.map(s => ({ name: s.name, description: pickFirstText(s.prompt, s.description), image: getMediaAssetDisplaySource(s.media?.previewImage) }))) },
            { key: 'props', label: `道具 (${props.length})`, children: renderList('prop', props.map(p => ({ name: p.name, description: pickFirstText(p.prompt, p.description), image: getMediaAssetDisplaySource(p.media?.previewImage) }))) },
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
