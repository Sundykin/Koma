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
const { Text } = Typography;
const { TextArea } = Input;

interface AssetManagerPanelProps {
  projectId: string;
  episodeId: string;
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
  onAssetsChanged: _onAssetsChanged,
}) => {
  const { message } = App.useApp();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [editingAsset, setEditingAsset] = useState<EditingAsset | null>(null);

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
    } catch {
      message.error('加载资产失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, message]);

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
      const extractedChars = coerceArray<{ name: string; prompt: string }>(parseLLMJSON(charText));

      // Extract scenes
      const sceneResolved = await resolvePromptTemplate('scene_extraction', { script: scriptText });
      const sceneText = await ctx.llmProvider.generateText(sceneResolved.prompt);
      const extractedScenes = coerceArray<{ name: string; prompt: string }>(parseLLMJSON(sceneText));

      // Extract props
      const propResolved = await resolvePromptTemplate('prop_extraction', { script: scriptText });
      const propText = await ctx.llmProvider.generateText(propResolved.prompt);
      const extractedProps = coerceArray<{ name: string; prompt: string }>(parseLLMJSON(propText));

      // Merge with existing (avoid duplicates by name)
      const existingCharNames = new Set(characters.map(c => c.name));
      const newChars: Character[] = extractedChars
        .filter(c => c.name && !existingCharNames.has(c.name))
        .map(c => ({
          id: uuidv4(),
          name: c.name,
          prompt: c.prompt || '',
          role: 'supporting' as const,
        }));

      const existingSceneNames = new Set(scenes.map(s => s.name));
      const newScenes: Scene[] = extractedScenes
        .filter(s => s.name && !existingSceneNames.has(s.name))
        .map(s => ({
          id: uuidv4(),
          name: s.name,
          prompt: s.prompt || '',
        }));

      const existingPropNames = new Set(props.map(p => p.name));
      const newProps: Prop[] = extractedProps
        .filter(p => p.name && !existingPropNames.has(p.name))
        .map(p => ({
          id: uuidv4(),
          name: p.name,
          prompt: p.prompt || '',
        }));

      if (newChars.length > 0) {
        const allChars = [...characters, ...newChars];
        await saveCharacters(projectId, allChars);
        setCharacters(allChars);
      }
      if (newScenes.length > 0) {
        const allScenes = [...scenes, ...newScenes];
        await saveScenes(projectId, allScenes);
        setScenes(allScenes);
      }
      if (newProps.length > 0) {
        const allProps = [...props, ...newProps];
        await saveProps(projectId, allProps);
        setProps(allProps);
      }

      message.success(`提取完成: ${newChars.length} 角色, ${newScenes.length} 场景, ${newProps.length} 道具`);
    } catch (err: any) {
      logger.error('资产提取失败', err);
      message.error('提取失败: ' + (err.message || '未知错误'));
    } finally {
      setExtracting(false);
    }
  }, [projectId, episodeId, characters, scenes, props, message]);

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
      } else if (editingAsset.type === 'scene') {
        const updated = [...scenes];
        updated[editingAsset.index] = { ...updated[editingAsset.index], name: editingAsset.name, prompt: editingAsset.description };
        await saveScenes(projectId, updated);
        setScenes(updated);
      } else {
        const updated = [...props];
        updated[editingAsset.index] = { ...updated[editingAsset.index], name: editingAsset.name, prompt: editingAsset.description };
        await saveProps(projectId, updated);
        setProps(updated);
      }
      setEditingAsset(null);
      message.success('已保存');
    } catch {
      message.error('保存失败');
    }
  }, [editingAsset, characters, scenes, props, projectId, message]);

  // Generate reference image for character
  const handleGenerateImage = useCallback(async (charIndex: number) => {
    const char = characters[charIndex];
    if (!char) return;
    setGeneratingImage(true);
    try {
      const result = await generateCostumePhoto({ projectId, character: char });
      if (result.success) {
        message.success(`已生成 ${char.name} 定妆照`);
        await loadAssets();
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error('生成失败: ' + (err.message || '未知错误'));
    } finally {
      setGeneratingImage(false);
    }
  }, [characters, projectId, message, loadAssets]);

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
          defaultActiveKey="characters"
          className="px-4"
          items={[
            { key: 'characters', label: `角色 (${characters.length})`, children: renderList('character', characters.map(c => ({ name: c.name, description: c.prompt, image: getCharacterCostumePhotoSource(c) }))) },
            { key: 'scenes', label: `场景 (${scenes.length})`, children: renderList('scene', scenes.map(s => ({ name: s.name, description: s.prompt, image: getMediaAssetDisplaySource(s.media?.previewImage) }))) },
            { key: 'props', label: `道具 (${props.length})`, children: renderList('prop', props.map(p => ({ name: p.name, description: p.prompt, image: getMediaAssetDisplaySource(p.media?.previewImage) }))) },
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
