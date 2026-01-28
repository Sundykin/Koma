import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Button,
  Space,
  Segmented,
  Select,
  Typography,
  Input,
  Modal,
  Form,
  Spin,
  Empty,
  App,
} from 'antd';
import {
  PlusOutlined,
  LoadingOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { Shot, Character, Scene, Prop, AppSettings, ShotVideo, EpisodeAnalysis } from '../../types';
import { loadEpisodeShots, saveEpisodeShots, loadCharacters, loadScenes, loadProps, loadEpisodeAnalysis } from '../../store/projectStore';
import { generateShotImage, batchGenerateShotImages } from '../../services/ShotGenerationService';
import { shotRenderWorkflow, batchRenderShots } from '../../workflow/shotRenderWorkflow';
import { startShotAnalysis, type PresetAssets } from '../../services/ShotAnalysisService';
import { generateShotPrompt, batchGenerateShotPrompts } from '../../services/ShotPromptService';
import { TaskManager } from '../../services/TaskManager';
import { ScriptEditor } from '../../editor';
import type { MentionItem } from '../../editor';
import { StoryboardLayout } from './StoryboardLayout';
import { StoryboardStudio } from './StoryboardStudio';
import { ShotListEditor } from './ShotListEditor';
import { ShotAssetPresetModal } from './ShotAssetPresetModal';
import './Storyboard.css';
import './ShotListEditor.css';

const { Text } = Typography;
const { TextArea } = Input;

const SHOT_TYPE_OPTIONS = [
  { label: 'CU', value: 'close-up' },
  { label: 'MED', value: 'medium' },
  { label: 'WIDE', value: 'wide' },
  { label: 'X-WIDE', value: 'extreme-wide' },
];

const CAMERA_OPTIONS = [
  { label: '固定镜头', value: 'static' },
  { label: '水平摇镜', value: 'pan' },
  { label: '跟随镜头', value: 'tracking' },
  { label: '缓慢推镜', value: 'zoom-in' },
  { label: '手持晃动', value: 'handheld' },
];

// 合并两个分镜
function mergeShots(target: Shot, source: Shot): Shot {
  return {
    ...target,
    scriptContent: [target.scriptContent, source.scriptContent].filter(Boolean).join('\n'),
    description: [target.description, source.description].filter(Boolean).join('\n\n'),
    duration: target.duration + source.duration,
    characters: [...new Set([...target.characters, ...source.characters])],
    dialogue: [target.dialogue, source.dialogue].filter(Boolean).join('\n'),
    props: [...new Set([...(target.props || []), ...(source.props || [])])],
    imagePaths: [...(target.imagePaths || []), ...(source.imagePaths || [])],
    videos: [...(target.videos || []), ...(source.videos || [])],
  };
}

// ============ 主组件 ============
interface StoryboardProps {
  projectId: string;
  episodeId?: string;
  episodeName?: string;
  script?: string;
  llmConfigId?: string;
  ttiConfigId?: string;
  settings: AppSettings;
  mentionItems?: MentionItem[];
  onConfirmedShotsToTimeline?: (shots: Shot[]) => void;
}

export const Storyboard: React.FC<StoryboardProps> = ({
  projectId,
  episodeId,
  episodeName,
  script,
  llmConfigId,
  ttiConfigId,
  settings,
  mentionItems = [],
  onConfirmedShotsToTimeline,
}) => {
  const { message } = App.useApp();
  const [shots, setShots] = useState<Shot[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingShots, setGeneratingShots] = useState<Set<string>>(new Set());
  // 状态拆分：图片/视频提示词独立追踪
  const [generatingImagePrompts, setGeneratingImagePrompts] = useState<Set<string>>(new Set());
  const [generatingVideoPrompts, setGeneratingVideoPrompts] = useState<Set<string>>(new Set());
  const [renderingShots, setRenderingShots] = useState<Set<string>>(new Set());
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStep, setRenderStep] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; step?: string } | undefined>();

  // 预选资产弹窗
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetAssets, setPresetAssets] = useState<PresetAssets | null>(null);

  // 编辑弹窗
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Shot>>({});

  // 舞台区激活的分镜
  const [activeShotId, setActiveShotId] = useState<string | null>(null);

  // 获取当前激活的分镜对象
  const activeShot = useMemo(() =>
    shots.find(s => s.id === activeShotId) || null
  , [shots, activeShotId]);

  // 实际使用的 mentionItems
  // 只有已绑定 Sora2 的角色/道具才能在编辑器中被 @ 引用
  const actualMentionItems: MentionItem[] = useMemo(() => {
    if (mentionItems.length > 0) return mentionItems;
    const items: MentionItem[] = [];

    // 只添加已绑定 Sora2 的角色，使用 sora2CharacterId 作为 mention ID
    characters
      .filter(char => char.sora2CharacterId)
      .forEach(char => {
        items.push({
          id: char.sora2CharacterId!,  // 使用 Sora2 ID 避免 @char_char_xxx 重复
          type: 'char' as const,
          name: char.name,
          description: char.description,
          previewImage: char.costumePhotoPath,
        });
      });

    // 场景不需要 Sora2 绑定，保持使用自定义 ID
    scenes.forEach(scene => {
      items.push({
        id: scene.id,
        type: 'scene' as const,
        name: scene.name,
        description: scene.description,
        previewImage: scene.imagePath,
      });
    });

    // 只添加已绑定 Sora2 的道具，使用 sora2PropId 作为 mention ID
    props
      .filter(prop => prop.sora2PropId)
      .forEach(prop => {
        items.push({
          id: prop.sora2PropId!,  // 使用 Sora2 ID
          type: 'prop' as const,
          name: prop.name,
          description: prop.description,
          previewImage: prop.imagePath,
        });
      });

    return items;
  }, [mentionItems, characters, scenes, props]);

  // 加载数据
  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const loadedShots = episodeId ? await loadEpisodeShots(projectId, episodeId) : [];
      const [loadedCharacters, loadedScenes, loadedProps, episodeAnalysis] = await Promise.all([
        loadCharacters(projectId),
        loadScenes(projectId),
        loadProps(projectId),
        episodeId ? loadEpisodeAnalysis(projectId, episodeId) : Promise.resolve(null),
      ]);

      // 根据分集分析结果筛选资产
      let filteredCharacters = loadedCharacters;
      let filteredScenes = loadedScenes;
      let filteredProps = loadedProps;

      if (episodeAnalysis) {
        const charRefs = new Set(episodeAnalysis.characterRefs);
        const sceneRefs = new Set(episodeAnalysis.sceneRefs);
        const propRefs = new Set(episodeAnalysis.propRefs);

        filteredCharacters = loadedCharacters.filter(c => charRefs.has(c.id));
        filteredScenes = loadedScenes.filter(s => sceneRefs.has(s.id));
        filteredProps = loadedProps.filter(p => propRefs.has(p.id));
      }

      setShots(loadedShots);
      setCharacters(filteredCharacters);
      setScenes(filteredScenes);
      setProps(filteredProps);
    } catch (err) {
      console.error('[Storyboard] 加载失败:', err);
      message.error('加载分镜数据失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, episodeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 监听任务完成事件
  useEffect(() => {
    const unsubscribe = TaskManager.addListener((task) => {
      if (task.projectId !== projectId) return;
      if (task.type === 'shot-generation') {
        if (task.status === 'completed') {
          message.success(`分镜图片生成完成`);
          setGeneratingShots(prev => {
            const next = new Set(prev);
            next.delete(task.targetId!);
            return next;
          });
          loadData();
        } else if (task.status === 'failed') {
          message.error(`分镜图片生成失败: ${task.error}`);
          setGeneratingShots(prev => {
            const next = new Set(prev);
            next.delete(task.targetId!);
            return next;
          });
        }
      }
      if (task.type === 'shot-analysis') {
        if (task.status === 'completed') {
          message.success(`AI 分镜生成完成，共 ${task.result?.shotsCount || 0} 个分镜`);
          setIsAnalyzing(false);
          loadData();
        } else if (task.status === 'failed') {
          message.error(`AI 分镜生成失败: ${task.error}`);
          setIsAnalyzing(false);
        }
      }
    });
    return () => unsubscribe();
  }, [projectId, loadData]);

  // 保存分镜数据
  const saveAllShots = useCallback(async (updatedShots: Shot[]) => {
    if (!episodeId) {
      message.warning('未选择分集，无法保存分镜');
      return;
    }
    try {
      await saveEpisodeShots(projectId, episodeId, updatedShots);
      setShots(updatedShots);
    } catch (err) {
      message.error('保存失败');
    }
  }, [projectId, episodeId]);

  // ============ 回调函数 ============

  const handleToggleConfirm = useCallback(async (shot: Shot) => {
    const updatedShots = shots.map(s =>
      s.id === shot.id ? { ...s, confirmed: !s.confirmed } : s
    );
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  const handleDeleteShot = useCallback(async (shotId: string) => {
    const updatedShots = shots.filter(s => s.id !== shotId);
    await saveAllShots(updatedShots);
    message.success('分镜已删除');
  }, [shots, saveAllShots]);

  // 批量删除
  const handleBatchDelete = useCallback(async (shotIds: string[]) => {
    const updatedShots = shots.filter(s => !shotIds.includes(s.id));
    await saveAllShots(updatedShots);
    message.success(`已删除 ${shotIds.length} 个分镜`);
  }, [shots, saveAllShots]);

  // 批量确认/取消确认
  const handleBatchConfirm = useCallback(async (shotIds: string[], confirm: boolean) => {
    const updatedShots = shots.map(s =>
      shotIds.includes(s.id) ? { ...s, confirmed: confirm } : s
    );
    await saveAllShots(updatedShots);
    message.success(confirm ? `已确认 ${shotIds.length} 个分镜` : `已取消确认 ${shotIds.length} 个分镜`);
  }, [shots, saveAllShots]);

  const handleGenerateShotImage = useCallback(async (shotId: string) => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    setGeneratingShots(prev => new Set(prev).add(shotId));
    try {
      await generateShotImage(projectId, episodeId, shotId, characters, scenes, ttiConfigId);
      message.info('分镜图片生成任务已启动');
    } catch (err: any) {
      message.error(err.message || '启动生成失败');
      setGeneratingShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, characters, scenes, ttiConfigId]);

  // 渲染视频
  const handleRenderShotVideo = useCallback(async (shotId: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setRenderingShots(prev => new Set(prev).add(shotId));
    setRenderProgress(0);
    setRenderStep('准备渲染...');
    try {
      const result = await shotRenderWorkflow(
        {
          projectId,
          shot,
          projectConfigIds: {
            ttiConfigId,
            itvConfigId: settings.itvConfigs?.find(c => c.isDefault)?.id,
            ttsConfigId: settings.ttsConfigs?.find(c => c.isDefault)?.id,
          },
        },
        (progress, step) => {
          setRenderProgress(progress);
          setRenderStep(step || '');
        }
      );
      if (result.success && result.version) {
        // 更新 shot 的 videos 字段
        const newVideo: ShotVideo = {
          path: result.version.videoPath || result.version.remoteVideoUrl || '',
          thumbnailPath: result.version.imagePath,
          prompt: result.version.prompt,
          seed: result.version.seed,
          model: result.version.model,
          createdAt: result.version.createdAt || Date.now(),
        };
        const existingVideos = shot.videos || [];
        const updatedShots = shots.map(s =>
          s.id === shotId ? {
            ...s,
            videos: [...existingVideos, newVideo],
            currentVideoIndex: existingVideos.length,
            // 同时更新图片（如果有）
            ...(result.version.imagePath ? {
              imagePaths: [...(s.imagePaths || []), result.version.imagePath],
              currentImageIndex: (s.imagePaths || []).length,
              imagePath: result.version.imagePath,
            } : {}),
          } : s
        );
        await saveAllShots(updatedShots);
        message.success('分镜渲染完成');
      } else {
        message.error(result.error || '渲染失败');
        loadData();
      }
    } catch (err: any) {
      message.error(err.message || '渲染失败');
    } finally {
      setRenderingShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
      setRenderProgress(0);
      setRenderStep('');
    }
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, saveAllShots, loadData]);

  // 剧本内容变更
  const handleScriptChange = useCallback((shotId: string, scriptContent: string) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, scriptContent } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 文生图提示词变更
  const handleImagePromptChange = useCallback((shotId: string, imagePrompt: string) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, imagePrompt } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 图生视频提示词变更
  const handleVideoPromptChange = useCallback((shotId: string, videoPrompt: string) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, videoPrompt } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 角色变更
  const handleCharactersChange = useCallback((shotId: string, characterIds: string[]) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, characters: characterIds } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 场景变更
  const handleScenesChange = useCallback((shotId: string, sceneIds: string[]) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, scenes: sceneIds } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 参考图变更
  const handleReferenceImagesChange = useCallback((shotId: string, referenceImages: string[], selectedReferenceIndex: number) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, referenceImages, selectedReferenceIndex } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 道具变更
  const handlePropsChange = useCallback((shotId: string, propIds: string[]) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, props: propIds } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 多图片变更
  const handleImagesChange = useCallback((shotId: string, imagePaths: string[], currentImageIndex: number) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? {
        ...s,
        imagePaths,
        currentImageIndex,
        imagePath: imagePaths[currentImageIndex] || undefined,
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 多视频变更
  const handleVideosChange = useCallback((shotId: string, videos: ShotVideo[], currentVideoIndex: number) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, videos, currentVideoIndex } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 向上合并
  const handleMergeUp = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index <= 0) return;
    const target = shots[index - 1];
    const source = shots[index];
    const merged = mergeShots(target, source);
    const updatedShots = shots.filter((_, i) => i !== index).map((s, i) =>
      i === index - 1 ? merged : s
    );
    await saveAllShots(updatedShots);
    message.success('分镜已向上合并');
  }, [shots, saveAllShots]);

  // 向下合并
  const handleMergeDown = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0 || index >= shots.length - 1) return;
    const target = shots[index];
    const source = shots[index + 1];
    const merged = mergeShots(target, source);
    const updatedShots = shots.filter((_, i) => i !== index + 1).map((s, i) =>
      i === index ? merged : s
    );
    await saveAllShots(updatedShots);
    message.success('分镜已向下合并');
  }, [shots, saveAllShots]);

  // 上移
  const handleMoveUp = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index <= 0) return;
    const updatedShots = [...shots];
    [updatedShots[index - 1], updatedShots[index]] = [updatedShots[index], updatedShots[index - 1]];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 下移
  const handleMoveDown = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0 || index >= shots.length - 1) return;
    const updatedShots = [...shots];
    [updatedShots[index], updatedShots[index + 1]] = [updatedShots[index + 1], updatedShots[index]];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 生成图片提示词（首次生成）
  const handleGenerateImagePrompt = useCallback(async (shotId: string) => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setGeneratingImagePrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(
        projectId,
        episodeId,
        shot,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        llmConfigId,
        { image: true, video: false }  // 只生成图片提示词
      );
      if (result.success) {
        setShots(prev => prev.map(s => s.id === shotId ? {
          ...s,
          imagePrompt: result.imagePrompt,
        } : s));
        message.success('图片提示词生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGeneratingImagePrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 生成视频提示词（首次生成）
  const handleGenerateVideoPrompt = useCallback(async (shotId: string) => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setGeneratingVideoPrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(
        projectId,
        episodeId,
        shot,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        llmConfigId,
        { image: false, video: true }  // 只生成视频提示词
      );
      if (result.success) {
        setShots(prev => prev.map(s => s.id === shotId ? {
          ...s,
          videoPrompt: result.videoPrompt,
        } : s));
        message.success('视频提示词生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGeneratingVideoPrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 优化图片提示词（强制重新生成）
  const handleOptimizeImagePrompt = useCallback(async (shotId: string, _currentPrompt: string) => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setGeneratingImagePrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(
        projectId,
        episodeId,
        shot,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        llmConfigId,
        { image: true, video: false },
        { force: true }  // 强制重新生成
      );
      if (result.success) {
        setShots(prev => prev.map(s => s.id === shotId ? {
          ...s,
          imagePrompt: result.imagePrompt,
        } : s));
        message.success('图片提示词优化完成');
      } else {
        message.error(result.error || '优化失败');
      }
    } catch (err: any) {
      message.error(err.message || '优化失败');
    } finally {
      setGeneratingImagePrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 优化视频提示词（强制重新生成）
  const handleOptimizeVideoPrompt = useCallback(async (shotId: string, _currentPrompt: string) => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setGeneratingVideoPrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(
        projectId,
        episodeId,
        shot,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        llmConfigId,
        { image: false, video: true },
        { force: true }  // 强制重新生成
      );
      if (result.success) {
        setShots(prev => prev.map(s => s.id === shotId ? {
          ...s,
          videoPrompt: result.videoPrompt,
        } : s));
        message.success('视频提示词优化完成');
      } else {
        message.error(result.error || '优化失败');
      }
    } catch (err: any) {
      message.error(err.message || '优化失败');
    } finally {
      setGeneratingVideoPrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 批量生成提示词（跳过已有提示词的）
  const handleBatchGeneratePrompts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    // 如果指定了 shotIds，则只处理这些分镜中缺少提示词的
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithoutPrompt = baseShots.filter(s => !s.imagePrompt?.trim() || !s.videoPrompt?.trim());
    if (shotsWithoutPrompt.length === 0) {
      message.info('所选分镜都已有提示词');
      return;
    }
    const shotIds = shotsWithoutPrompt.map(s => s.id);
    setGeneratingImagePrompts(new Set(shotIds));
    setGeneratingVideoPrompts(new Set(shotIds));
    setBatchProgress({ current: 0, total: shotsWithoutPrompt.length, step: '准备生成...' });
    try {
      const results = await batchGenerateShotPrompts(
        projectId,
        episodeId,
        shotsWithoutPrompt,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        (current, total, result) => {
          setBatchProgress({ current, total, step: `生成中 ${current}/${total}` });
          if (result.success) {
            setShots(prev => prev.map(s => s.id === result.shotId ? {
              ...s,
              imagePrompt: result.imagePrompt,
              videoPrompt: result.videoPrompt,
            } : s));
          }
        },
        llmConfigId
      );
      const successCount = results.filter(r => r.success).length;
      message.success(`提示词生成完成: ${successCount}/${results.length} 成功`);
    } catch (err: any) {
      message.error(err.message || '批量生成失败');
    } finally {
      setGeneratingImagePrompts(new Set());
      setGeneratingVideoPrompts(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 批量重新生成提示词（强制重新生成已有提示词的）
  const handleBatchReGeneratePrompts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithPrompt = baseShots.filter(s => s.imagePrompt?.trim() || s.videoPrompt?.trim());
    if (shotsWithPrompt.length === 0) {
      message.info('所选分镜都没有提示词');
      return;
    }
    const shotIds = shotsWithPrompt.map(s => s.id);
    setGeneratingImagePrompts(new Set(shotIds));
    setGeneratingVideoPrompts(new Set(shotIds));
    setBatchProgress({ current: 0, total: shotsWithPrompt.length, step: '准备重新生成...' });
    try {
      const results = await batchGenerateShotPrompts(
        projectId,
        episodeId,
        shotsWithPrompt,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        (current, total, result) => {
          setBatchProgress({ current, total, step: `重新生成中 ${current}/${total}` });
          if (result.success) {
            setShots(prev => prev.map(s => s.id === result.shotId ? {
              ...s,
              imagePrompt: result.imagePrompt,
              videoPrompt: result.videoPrompt,
            } : s));
          }
        },
        llmConfigId
      );
      const successCount = results.filter(r => r.success).length;
      message.success(`提示词重新生成完成: ${successCount}/${results.length} 成功`);
    } catch (err: any) {
      message.error(err.message || '批量重新生成失败');
    } finally {
      setGeneratingImagePrompts(new Set());
      setGeneratingVideoPrompts(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 创建新分镜
  const createNewShot = useCallback((): Shot => ({
    id: uuidv4(),
    scriptContent: '',
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 3,
    description: '',
    characters: [],
    dialogue: '',
    emotion: '',
  }), []);

  // 在末尾添加分镜
  const handleAddShot = useCallback(async () => {
    const newShot = createNewShot();
    const updatedShots = [...shots, newShot];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots, createNewShot]);

  // 在指定位置上方插入
  const handleInsertAbove = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0) return;
    const newShot = createNewShot();
    const updatedShots = [...shots.slice(0, index), newShot, ...shots.slice(index)];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots, createNewShot]);

  // 在指定位置下方插入
  const handleInsertBelow = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0) return;
    const newShot = createNewShot();
    const updatedShots = [...shots.slice(0, index + 1), newShot, ...shots.slice(index + 1)];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots, createNewShot]);

  // 打开预选资产弹窗
  const handleOpenPresetModal = useCallback(() => {
    if (!episodeId || !script) {
      message.warning('缺少分集信息或剧本内容');
      return;
    }
    setPresetModalOpen(true);
  }, [episodeId, script, message]);

  // 预选资产确认后执行 AI 分镜生成
  const handlePresetConfirm = useCallback(async (assets: PresetAssets) => {
    setPresetModalOpen(false);
    setPresetAssets(assets);
    setIsAnalyzing(true);
    try {
      await startShotAnalysis(
        projectId,
        episodeId!,
        episodeName || `分集 ${episodeId}`,
        script!,
        llmConfigId,
        assets  // 传递预选资产
      );
      message.info('AI 分镜生成任务已启动，可在状态栏查看进度');
    } catch (err: any) {
      message.error(err.message || '启动生成失败');
      setIsAnalyzing(false);
    }
  }, [projectId, episodeId, episodeName, script, llmConfigId, message]);

  const handleGenerateAIShots = useCallback(async () => {
    if (!episodeId || !script) {
      message.warning('缺少分集信息或剧本内容');
      return;
    }
    // 检查是否有已绑定 Sora2 的资产，如有则打开预选对话框
    const hasBoundCharacters = characters.some(c => c.sora2CharacterId);
    const hasBoundProps = props.some(p => p.sora2PropId);
    if (hasBoundCharacters || hasBoundProps) {
      setPresetModalOpen(true);
    } else {
      // 无已绑定资产，直接生成
      setIsAnalyzing(true);
      try {
        await startShotAnalysis(projectId, episodeId, episodeName || `分集 ${episodeId}`, script, llmConfigId);
        message.info('AI 分镜生成任务已启动，可在状态栏查看进度');
      } catch (err: any) {
        message.error(err.message || '启动生成失败');
        setIsAnalyzing(false);
      }
    }
  }, [projectId, episodeId, episodeName, script, llmConfigId, characters, props, message]);

  const handleSaveEdit = useCallback(async () => {
    if (!editFormData.scriptContent?.trim()) {
      message.warning('请输入剧本内容');
      return;
    }
    if (!editFormData.description?.trim()) {
      message.warning('请输入画面描述');
      return;
    }
    const updatedShot: Shot = { ...editingShot!, ...editFormData } as Shot;
    const isNew = !shots.find(s => s.id === editingShot!.id);
    let updatedShots: Shot[];
    if (isNew) {
      updatedShots = [...shots, updatedShot];
      message.success('分镜已添加');
    } else {
      updatedShots = shots.map(s => s.id === updatedShot.id ? updatedShot : s);
      message.success('分镜已更新');
    }
    await saveAllShots(updatedShots);
    setEditModalOpen(false);
    setEditingShot(null);
    setEditFormData({});
  }, [editFormData, editingShot, shots, saveAllShots]);

  // 批量生成图片（跳过已有图片的）
  const handleBatchGenerate = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithoutImage = baseShots.filter(s => !s.imagePath && !(s.imagePaths?.length));
    if (shotsWithoutImage.length === 0) {
      message.info('所选分镜都已有图片');
      return;
    }
    const shotIds = shotsWithoutImage.map(s => s.id);
    setGeneratingShots(new Set(shotIds));
    try {
      await batchGenerateShotImages(projectId, episodeId, shotIds, characters, scenes, ttiConfigId);
      message.info(`已启动 ${shotIds.length} 个分镜的图片生成任务`);
    } catch (err: any) {
      message.error(err.message || '批量生成启动失败');
      setGeneratingShots(new Set());
    }
  }, [projectId, episodeId, shots, characters, scenes, ttiConfigId]);

  // 批量重新生成图片（强制重新生成已有图片的）
  const handleBatchReGenerateImages = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithImage = baseShots.filter(s => s.imagePath || (s.imagePaths?.length));
    if (shotsWithImage.length === 0) {
      message.info('所选分镜都没有图片');
      return;
    }
    const shotIds = shotsWithImage.map(s => s.id);
    setGeneratingShots(new Set(shotIds));
    try {
      await batchGenerateShotImages(projectId, episodeId, shotIds, characters, scenes, ttiConfigId);
      message.info(`已启动 ${shotIds.length} 个分镜的图片重新生成任务`);
    } catch (err: any) {
      message.error(err.message || '批量重新生成启动失败');
      setGeneratingShots(new Set());
    }
  }, [projectId, episodeId, shots, characters, scenes, ttiConfigId]);

  // 批量渲染视频（已确认的）
  const handleBatchRenderVideos = useCallback(async (targetShotIds?: string[]) => {
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const confirmedToRender = baseShots.filter(s => s.confirmed);
    if (confirmedToRender.length === 0) {
      message.warning('请先确认要渲染的分镜');
      return;
    }
    const shotIds = confirmedToRender.map(s => s.id);
    setRenderingShots(new Set(shotIds));
    setRenderProgress(0);
    setRenderStep('准备批量渲染...');
    try {
      const result = await batchRenderShots(
        {
          projectId,
          shots: confirmedToRender,
          projectConfigIds: {
            ttiConfigId,
            itvConfigId: settings.itvConfigs?.find(c => c.isDefault)?.id,
            ttsConfigId: settings.ttsConfigs?.find(c => c.isDefault)?.id,
          },
        },
        (overall, current) => {
          setRenderProgress(overall);
          setRenderStep(`${current.step || ''} (${current.shotId})`);
        }
      );
      // 更新所有成功渲染的 shot 的 videos 字段
      const updatedShots = shots.map(s => {
        const renderResult = result.results.find(r => r.shotId === s.id && r.success && r.version);
        if (renderResult && renderResult.version) {
          const newVideo: ShotVideo = {
            path: renderResult.version.videoPath || renderResult.version.remoteVideoUrl || '',
            thumbnailPath: renderResult.version.imagePath,
            prompt: renderResult.version.prompt,
            seed: renderResult.version.seed,
            model: renderResult.version.model,
            createdAt: renderResult.version.createdAt || Date.now(),
          };
          const existingVideos = s.videos || [];
          return {
            ...s,
            videos: [...existingVideos, newVideo],
            currentVideoIndex: existingVideos.length,
            ...(renderResult.version.imagePath ? {
              imagePaths: [...(s.imagePaths || []), renderResult.version.imagePath],
              currentImageIndex: (s.imagePaths || []).length,
              imagePath: renderResult.version.imagePath,
            } : {}),
          };
        }
        return s;
      });
      await saveAllShots(updatedShots);
      message.success(`批量渲染完成: ${result.success} 成功, ${result.failed} 失败`);
    } catch (err: any) {
      message.error(err.message || '批量渲染失败');
    } finally {
      setRenderingShots(new Set());
      setRenderProgress(0);
      setRenderStep('');
    }
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, saveAllShots]);

  // 批量重新生成视频（已有视频的）
  const handleBatchReGenerateVideos = useCallback(async (targetShotIds?: string[]) => {
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithVideo = baseShots.filter(s => (s.videos?.length || 0) > 0);
    if (shotsWithVideo.length === 0) {
      message.info('所选分镜都没有视频');
      return;
    }
    const shotIds = shotsWithVideo.map(s => s.id);
    setRenderingShots(new Set(shotIds));
    setRenderProgress(0);
    setRenderStep('准备批量重新渲染...');
    try {
      const result = await batchRenderShots(
        {
          projectId,
          shots: shotsWithVideo,
          projectConfigIds: {
            ttiConfigId,
            itvConfigId: settings.itvConfigs?.find(c => c.isDefault)?.id,
            ttsConfigId: settings.ttsConfigs?.find(c => c.isDefault)?.id,
          },
        },
        (overall, current) => {
          setRenderProgress(overall);
          setRenderStep(`${current.step || ''} (${current.shotId})`);
        }
      );
      // 更新所有成功渲染的 shot 的 videos 字段
      const updatedShots = shots.map(s => {
        const renderResult = result.results.find(r => r.shotId === s.id && r.success && r.version);
        if (renderResult && renderResult.version) {
          const newVideo: ShotVideo = {
            path: renderResult.version.videoPath || renderResult.version.remoteVideoUrl || '',
            thumbnailPath: renderResult.version.imagePath,
            prompt: renderResult.version.prompt,
            seed: renderResult.version.seed,
            model: renderResult.version.model,
            createdAt: renderResult.version.createdAt || Date.now(),
          };
          const existingVideos = s.videos || [];
          return {
            ...s,
            videos: [...existingVideos, newVideo],
            currentVideoIndex: existingVideos.length,
            ...(renderResult.version.imagePath ? {
              imagePaths: [...(s.imagePaths || []), renderResult.version.imagePath],
              currentImageIndex: (s.imagePaths || []).length,
              imagePath: renderResult.version.imagePath,
            } : {}),
          };
        }
        return s;
      });
      await saveAllShots(updatedShots);
      message.success(`批量重新渲染完成: ${result.success} 成功, ${result.failed} 失败`);
    } catch (err: any) {
      message.error(err.message || '批量重新渲染失败');
    } finally {
      setRenderingShots(new Set());
      setRenderProgress(0);
      setRenderStep('');
    }
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, saveAllShots]);

  // ============ 渲染 ============

  if (loading) {
    return (
      <div className="storyboardContainer" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="加载分镜数据...">
          <div style={{ padding: 50 }} />
        </Spin>
      </div>
    );
  }

  return (
    <div className="storyboardContainer">
      {shots.length === 0 ? (
        <div className="storyboardEmpty">
          <Empty
            description={isAnalyzing ? "AI 正在生成分镜..." : "暂无分镜数据"}
            style={{ margin: '100px auto' }}
          >
            {isAnalyzing ? (
              <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
            ) : (
              <Space direction="vertical" size="middle">
                {script && episodeId && (
                  <Button
                    type="primary"
                    size="large"
                    icon={<RobotOutlined />}
                    onClick={handleGenerateAIShots}
                  >
                    AI 智能生成分镜
                  </Button>
                )}
                <Button icon={<PlusOutlined />} onClick={handleAddShot}>
                  手动添加分镜
                </Button>
                {!script && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    提示：需要先在剧本步骤输入内容才能使用 AI 生成
                  </Text>
                )}
              </Space>
            )}
          </Empty>
        </div>
      ) : (
        <StoryboardStudio>
          <ShotListEditor
            projectId={projectId}
            shots={shots}
            characters={characters}
            scenes={scenes}
            props={props}
            mentionItems={actualMentionItems}
            generatingImagePrompts={generatingImagePrompts}
            generatingVideoPrompts={generatingVideoPrompts}
            generatingImages={generatingShots}
            generatingVideos={renderingShots}
            batchProgress={batchProgress}
            activeShotId={activeShotId}
            onActiveShotChange={setActiveShotId}
            onScriptChange={handleScriptChange}
            onImagePromptChange={handleImagePromptChange}
            onVideoPromptChange={handleVideoPromptChange}
            onCharactersChange={handleCharactersChange}
            onScenesChange={handleScenesChange}
            onPropsChange={handlePropsChange}
            onReferenceImagesChange={handleReferenceImagesChange}
            onImagesChange={handleImagesChange}
            onVideosChange={handleVideosChange}
            onGenerateImagePrompt={handleGenerateImagePrompt}
            onGenerateVideoPrompt={handleGenerateVideoPrompt}
            onOptimizeImagePrompt={handleOptimizeImagePrompt}
            onOptimizeVideoPrompt={handleOptimizeVideoPrompt}
            onBatchGeneratePrompts={handleBatchGeneratePrompts}
            onBatchReGeneratePrompts={handleBatchReGeneratePrompts}
            onGenerateImage={handleGenerateShotImage}
            onBatchGenerateImages={handleBatchGenerate}
            onBatchReGenerateImages={handleBatchReGenerateImages}
            onGenerateVideo={handleRenderShotVideo}
            onBatchGenerateVideos={handleBatchRenderVideos}
            onBatchReGenerateVideos={handleBatchReGenerateVideos}
            onToggleConfirm={handleToggleConfirm}
            onDelete={handleDeleteShot}
            onBatchDelete={handleBatchDelete}
            onBatchConfirm={handleBatchConfirm}
            onMergeUp={handleMergeUp}
            onMergeDown={handleMergeDown}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onAddShot={handleAddShot}
            onInsertAbove={handleInsertAbove}
            onInsertBelow={handleInsertBelow}
          />
        </StoryboardStudio>
      )}

      {/* 编辑/添加分镜弹窗 */}
      <Modal
        title={editingShot && shots.find(s => s.id === editingShot.id) ? '编辑分镜' : '添加分镜'}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditingShot(null); setEditFormData({}); }}
        onOk={handleSaveEdit}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form layout="vertical">
          <Form.Item label="剧本内容" required>
            <TextArea
              rows={3}
              placeholder="对应剧本中的内容..."
              value={editFormData.scriptContent || ''}
              onChange={(e) => setEditFormData(prev => ({ ...prev, scriptContent: e.target.value }))}
            />
          </Form.Item>

          <Form.Item label="画面描述 (Prompt)" required>
            <ScriptEditor
              value={editFormData.description || ''}
              onChange={(value) => setEditFormData(prev => ({ ...prev, description: value }))}
              placeholder="描述这个镜头的画面，可使用 @ 引用角色或道具"
              mentionItems={actualMentionItems}
              minHeight="120px"
              maxHeight="200px"
              showLineNumbers={false}
              darkTheme={true}
            />
          </Form.Item>

          <Space size="large" style={{ width: '100%' }}>
            <Form.Item label="景别" style={{ marginBottom: 0 }}>
              <Segmented
                options={SHOT_TYPE_OPTIONS}
                value={editFormData.shotType || 'medium'}
                onChange={(value) => setEditFormData(prev => ({ ...prev, shotType: value as Shot['shotType'] }))}
              />
            </Form.Item>

            <Form.Item label="运镜" style={{ marginBottom: 0 }}>
              <Select
                options={CAMERA_OPTIONS}
                value={editFormData.cameraMovement || 'static'}
                onChange={(value) => setEditFormData(prev => ({ ...prev, cameraMovement: value }))}
                style={{ width: 160 }}
              />
            </Form.Item>

            <Form.Item label="时长（秒）" style={{ marginBottom: 0 }}>
              <Input
                type="number"
                min={1}
                max={60}
                value={editFormData.duration || 3}
                onChange={(e) => setEditFormData(prev => ({ ...prev, duration: parseInt(e.target.value) || 3 }))}
                style={{ width: 80 }}
              />
            </Form.Item>
          </Space>

          <Form.Item label="情绪氛围" style={{ marginTop: 16 }}>
            <Input
              placeholder="如：紧张、欢快、悲伤..."
              value={editFormData.emotion || ''}
              onChange={(e) => setEditFormData(prev => ({ ...prev, emotion: e.target.value }))}
            />
          </Form.Item>

          <Form.Item label="台词">
            <TextArea
              rows={2}
              placeholder="角色台词（如有）"
              value={editFormData.dialogue || ''}
              onChange={(e) => setEditFormData(prev => ({ ...prev, dialogue: e.target.value }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 预选资产弹窗 */}
      <ShotAssetPresetModal
        open={presetModalOpen}
        characters={characters}
        props={props}
        onConfirm={handlePresetConfirm}
        onCancel={() => setPresetModalOpen(false)}
      />
    </div>
  );
};
