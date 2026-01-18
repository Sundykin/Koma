import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Button,
  Space,
  Segmented,
  Select,
  Typography,
  message,
  Input,
  Modal,
  Form,
  Spin,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  LoadingOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { Shot, Character, Scene, Prop, AppSettings } from '../types';
import { loadEpisodeShots, saveEpisodeShots, loadCharacters, loadScenes, loadProps } from '../store/projectStore';
import { generateShotImage, batchGenerateShotImages } from '../services/ShotGenerationService';
import { shotRenderWorkflow, batchRenderShots } from '../workflow/shotRenderWorkflow';
import { startShotAnalysis } from '../services/ShotAnalysisService';
import { generateShotPrompt, batchGenerateShotPrompts } from '../services/ShotPromptService';
import { TaskManager } from '../services/TaskManager';
import { ScriptEditor } from '../editor';
import type { MentionItem } from '../editor';
import { ShotListEditor } from './ShotListEditor';
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
  { label: '📷 固定镜头', value: 'static' },
  { label: '↔️ 水平摇镜', value: 'pan' },
  { label: '🏃 跟随镜头', value: 'tracking' },
  { label: '🔍 缓慢推镜', value: 'zoom-in' },
  { label: '👋 手持晃动', value: 'handheld' },
];

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
  const [shots, setShots] = useState<Shot[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingShots, setGeneratingShots] = useState<Set<string>>(new Set());
  const [generatingPrompts, setGeneratingPrompts] = useState<Set<string>>(new Set());
  const [renderingShots, setRenderingShots] = useState<Set<string>>(new Set());
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStep, setRenderStep] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; step?: string } | undefined>();

  // 编辑弹窗
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Shot>>({});

  // 实际使用的 mentionItems：优先使用外部传入的，如果为空则从本地数据构建
  const actualMentionItems: MentionItem[] = useMemo(() => {
    if (mentionItems.length > 0) return mentionItems;

    // 从本地加载的数据构建
    const items: MentionItem[] = [];

    // 角色
    characters.forEach(char => {
      items.push({
        id: char.id,
        type: 'char' as const,
        name: char.name,
        description: char.description,
        previewImage: char.costumePhotoPath,
        sora2CharacterId: char.sora2CharacterId,
      });
    });

    // 场景
    scenes.forEach(scene => {
      items.push({
        id: scene.id,
        type: 'scene' as const,
        name: scene.name,
        description: scene.description,
        previewImage: scene.imagePath,  // Scene 用 imagePath
      });
    });

    // 道具
    props.forEach(prop => {
      items.push({
        id: prop.id,
        type: 'prop' as const,
        name: prop.name,
        description: prop.description,
        previewImage: prop.imagePath,  // Prop 用 imagePath
      });
    });

    console.log('[Storyboard] 构建 mentionItems:', {
      characters: characters.length,
      scenes: scenes.length,
      props: props.length,
      total: items.length,
    });

    return items;
  }, [mentionItems, characters, scenes, props]);

  // 加载数据
  const loadData = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      // 分镜从分集级加载（如果有 episodeId）
      const loadedShots = episodeId
        ? await loadEpisodeShots(projectId, episodeId)
        : [];

      const [loadedCharacters, loadedScenes, loadedProps] = await Promise.all([
        loadCharacters(projectId),
        loadScenes(projectId),
        loadProps(projectId),
      ]);

      setShots(loadedShots);
      setCharacters(loadedCharacters);
      setScenes(loadedScenes);
      setProps(loadedProps);

      console.log('[Storyboard] 加载数据:', {
        episodeId,
        shots: loadedShots.length,
        characters: loadedCharacters.length,
        scenes: loadedScenes.length,
        props: loadedProps.length,
      });
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

  // 保存分镜数据（保存到分集级）
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

  // ============ 回调函数 (稳定化) ============

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

  // 渲染完整分镜（图片 + 语音 + 视频）
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

      if (result.success) {
        message.success('分镜渲染完成');
        loadData(); // 重新加载数据以显示新版本
      } else {
        message.error(result.error || '渲染失败');
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
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, loadData]);

  // 提示词变更
  const handleDescriptionChange = useCallback((shotId: string, description: string) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, description } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 参考图变更
  const handleImageChange = useCallback((shotId: string, imagePath: string | undefined) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, imagePath } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 生成单条提示词
  const handleGenerateShotPrompt = useCallback(async (shotId: string) => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    setGeneratingPrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(
        projectId,
        episodeId,
        shot,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        llmConfigId
      );
      if (result.success) {
        // 更新本地状态
        setShots(prev => prev.map(s => s.id === shotId ? { ...s, description: result.prompt } : s));
        message.success('提示词生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGeneratingPrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 批量生成提示词
  const handleBatchGeneratePrompts = useCallback(async () => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    const shotsWithoutPrompt = shots.filter(s => !s.description?.trim());
    if (shotsWithoutPrompt.length === 0) {
      message.info('所有分镜都已有提示词');
      return;
    }

    const shotIds = shotsWithoutPrompt.map(s => s.id);
    setGeneratingPrompts(new Set(shotIds));
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
            // 更新本地状态
            setShots(prev => prev.map(s => s.id === result.shotId ? { ...s, description: result.prompt } : s));
          }
        },
        llmConfigId
      );

      const successCount = results.filter(r => r.success).length;
      message.success(`提示词生成完成: ${successCount}/${results.length} 成功`);
    } catch (err: any) {
      message.error(err.message || '批量生成失败');
    } finally {
      setGeneratingPrompts(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  const handleAddShot = useCallback(() => {
    const newShot: Shot = {
      id: uuidv4(),
      scriptContent: '',
      shotType: 'medium',
      cameraMovement: 'static',
      duration: 3,
      description: '',
      characters: [],
      dialogue: '',
      emotion: '',
    };
    setEditingShot(newShot);
    setEditFormData({ ...newShot });
    setEditModalOpen(true);
  }, []);

  const handleGenerateAIShots = useCallback(async () => {
    if (!episodeId || !script) {
      message.warning('缺少分集信息或剧本内容');
      return;
    }

    setIsAnalyzing(true);
    try {
      await startShotAnalysis(
        projectId,
        episodeId,
        episodeName || `分集 ${episodeId}`,
        script,
        llmConfigId
      );
      message.info('AI 分镜生成任务已启动，可在状态栏查看进度');
    } catch (err: any) {
      message.error(err.message || '启动生成失败');
      setIsAnalyzing(false);
    }
  }, [projectId, episodeId, episodeName, script, llmConfigId]);

  const handleSaveEdit = useCallback(async () => {
    if (!editFormData.scriptContent?.trim()) {
      message.warning('请输入剧本内容');
      return;
    }
    if (!editFormData.description?.trim()) {
      message.warning('请输入画面描述');
      return;
    }

    const updatedShot: Shot = {
      ...editingShot!,
      ...editFormData,
    } as Shot;

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

  const handleBatchGenerate = useCallback(async () => {
    if (!episodeId) {
      message.warning('未选择分集');
      return;
    }
    const unconfirmedShots = shots.filter(s => !s.imagePath);
    if (unconfirmedShots.length === 0) {
      message.info('所有分镜都已有图片');
      return;
    }

    const shotIds = unconfirmedShots.map(s => s.id);
    setGeneratingShots(new Set(shotIds));

    try {
      await batchGenerateShotImages(projectId, episodeId, shotIds, characters, scenes, ttiConfigId);
      message.info(`已启动 ${shotIds.length} 个分镜的图片生成任务`);
    } catch (err: any) {
      message.error(err.message || '批量生成启动失败');
      setGeneratingShots(new Set());
    }
  }, [projectId, episodeId, shots, characters, scenes, ttiConfigId]);

  // 批量渲染视频（完整流程）
  const handleBatchRenderVideos = useCallback(async () => {
    const confirmedToRender = shots.filter(s => s.confirmed);
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

      message.success(`批量渲染完成: ${result.success} 成功, ${result.failed} 失败`);
      loadData();
    } catch (err: any) {
      message.error(err.message || '批量渲染失败');
    } finally {
      setRenderingShots(new Set());
      setRenderProgress(0);
      setRenderStep('');
    }
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, loadData]);

  // ============ 渲染 ============

  if (loading) {
    return (
      <div className="storyboardContainer" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="加载分镜数据..." />
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
        <ShotListEditor
          projectId={projectId}
          shots={shots}
          characters={characters}
          scenes={scenes}
          props={props}
          mentionItems={actualMentionItems}
          generatingPrompts={generatingPrompts}
          generatingImages={generatingShots}
          generatingVideos={renderingShots}
          batchProgress={batchProgress}
          onPromptChange={handleDescriptionChange}
          onImageChange={handleImageChange}
          onGeneratePrompt={handleGenerateShotPrompt}
          onBatchGeneratePrompts={handleBatchGeneratePrompts}
          onGenerateImage={handleGenerateShotImage}
          onBatchGenerateImages={handleBatchGenerate}
          onGenerateVideo={handleRenderShotVideo}
          onBatchGenerateVideos={handleBatchRenderVideos}
          onToggleConfirm={handleToggleConfirm}
          onDelete={handleDeleteShot}
          onAddShot={handleAddShot}
        />
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
    </div>
  );
};
