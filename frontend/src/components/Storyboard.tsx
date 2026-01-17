import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Card,
  Button,
  Space,
  Tag,
  Segmented,
  Select,
  Tooltip,
  Typography,
  Image,
  Form,
  Badge,
  message,
  Input,
  Modal,
  Popconfirm,
  Spin,
  Empty,
} from 'antd';
import {
  PlayCircleOutlined,
  VideoCameraOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  CameraOutlined,
  CaretRightOutlined,
  CheckCircleOutlined,
  CheckCircleFilled,
  SendOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  LoadingOutlined,
  RobotOutlined,
  ExpandOutlined,
} from '@ant-design/icons';
import type { Shot, Character, Scene, AppSettings, ITVModelConfig } from '../types';
import { loadShots, saveShots, loadCharacters, loadScenes } from '../store/projectStore';
import { generateShotImage, batchGenerateShotImages } from '../services/ShotGenerationService';
import { startShotAnalysis } from '../services/ShotAnalysisService';
import { TaskManager } from '../services/TaskManager';
import { electronService } from '../services/electronService';
import { ScriptEditor } from '../editor';
import type { MentionItem } from '../editor';
import './Storyboard.css';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

// 常量配置
const SHOT_TYPE_MAP: Record<string, string> = {
  'close-up': '特写',
  'medium': '中景',
  'wide': '全景',
  'extreme-wide': '大全景'
};

const CAMERA_MOVEMENT_MAP: Record<string, string> = {
  'static': '固定',
  'pan': '摇镜',
  'zoom-in': '推镜',
  'tracking': '跟随',
  'handheld': '手持'
};

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

// ============ 分镜卡片组件 (memo) ============
interface ShotCardProps {
  shot: Shot;
  index: number;
  isSelected: boolean;
  isGenerating: boolean;
  characters: Character[];
  onSelect: (id: string) => void;
  onToggleConfirm: (shot: Shot) => void;
  onEdit: (shot: Shot) => void;
  onDelete: (id: string) => void;
  onGenerateImage: (id: string) => void;
}

const ShotCard = memo<ShotCardProps>(({
  shot,
  index,
  isSelected,
  isGenerating,
  characters,
  onSelect,
  onToggleConfirm,
  onEdit,
  onDelete,
  onGenerateImage,
}) => {
  const imageUrl = shot.imagePath
    ? electronService.fs.toLocalUrl(shot.imagePath)
    : `https://picsum.photos/seed/${shot.id}/300/169`;

  return (
    <div
      className={`shotCard ${isSelected ? 'selected' : ''} ${shot.confirmed ? 'confirmed' : ''}`}
      onClick={() => onSelect(shot.id)}
    >
      <Badge count={index + 1} className="shotIndex" />
      {shot.confirmed && (
        <CheckCircleFilled className="confirmedBadge" style={{ color: '#52c41a', position: 'absolute', top: 8, right: 8, fontSize: 18, zIndex: 10 }} />
      )}

      {/* 缩略图 */}
      <div className="shotThumbnail">
        {isGenerating ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a' }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
          </div>
        ) : (
          <Image
            src={imageUrl}
            alt="Storyboard thumbnail"
            preview={!!shot.imagePath}
            fallback="https://picsum.photos/seed/fallback/300/169"
          />
        )}
        <div className="thumbnailOverlay">
          <PlayCircleOutlined className="playIcon" />
        </div>
        <Tag className="durationTag">{shot.duration}s</Tag>
        <Tag className="shotTypeTag">{SHOT_TYPE_MAP[shot.shotType] || shot.shotType}</Tag>
        {!shot.imagePath && !isGenerating && (
          <Tag className="noImageTag" color="warning">无图</Tag>
        )}
      </div>

      {/* 内容区 */}
      <div className="shotContent">
        <Paragraph className="scriptContent" ellipsis={{ rows: 1 }}>
          "{shot.scriptContent || '(无剧本内容)'}"
        </Paragraph>

        <div className="shotDescription">
          <CameraOutlined />
          <Paragraph ellipsis={{ rows: 2 }} className="descText">
            {shot.description || '(无描述)'}
          </Paragraph>
        </div>

        <div className="shotFooter">
          <Space size={4} wrap>
            {shot.cameraMovement !== 'static' && (
              <Tag color="purple">
                {CAMERA_MOVEMENT_MAP[shot.cameraMovement] || shot.cameraMovement}
              </Tag>
            )}
            {shot.characters?.map(charId => {
              const char = characters.find(c => c.id === charId);
              return char ? <Tag key={charId} color="blue">{char.name}</Tag> : null;
            })}
          </Space>

          <Space size={4}>
            <Tooltip title="生成图片">
              <Button
                type="text"
                size="small"
                icon={isGenerating ? <LoadingOutlined /> : <ThunderboltOutlined />}
                disabled={isGenerating}
                onClick={(e) => { e.stopPropagation(); onGenerateImage(shot.id); }}
              />
            </Tooltip>
            <Tooltip title={shot.confirmed ? '取消确认' : '确认此分镜'}>
              <Button
                type="text"
                size="small"
                icon={shot.confirmed ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <CheckCircleOutlined />}
                onClick={(e) => { e.stopPropagation(); onToggleConfirm(shot); }}
              />
            </Tooltip>
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => { e.stopPropagation(); onEdit(shot); }}
              />
            </Tooltip>
            <Popconfirm
              title="确定删除此分镜？"
              onConfirm={(e) => { e?.stopPropagation(); onDelete(shot.id); }}
              onCancel={(e) => e?.stopPropagation()}
            >
              <Tooltip title="删除">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        </div>
      </div>
    </div>
  );
});

ShotCard.displayName = 'ShotCard';

// ============ 导演控制面板组件 (memo) ============
interface DirectorPanelProps {
  shot: Shot | null;
  itvConfig: ITVModelConfig | undefined;
  mentionItems: MentionItem[];
  isGenerating: boolean;
  onDescriptionChange: (shotId: string, description: string) => void;
  onShotTypeChange: (shotId: string, shotType: Shot['shotType']) => void;
  onCameraMovementChange: (shotId: string, movement: Shot['cameraMovement']) => void;
  onGenerateImage: (shotId: string) => void;
  onExpandEditor: () => void;
}

const DirectorPanel = memo<DirectorPanelProps>(({
  shot,
  itvConfig,
  mentionItems,
  isGenerating,
  onDescriptionChange,
  onShotTypeChange,
  onCameraMovementChange,
  onGenerateImage,
  onExpandEditor,
}) => {
  // 稳定的 onChange 回调
  const handleDescriptionChange = useCallback((value: string) => {
    if (shot) {
      onDescriptionChange(shot.id, value);
    }
  }, [shot?.id, onDescriptionChange]);

  const handleShotTypeChange = useCallback((value: string | number) => {
    if (shot) {
      onShotTypeChange(shot.id, value as Shot['shotType']);
    }
  }, [shot?.id, onShotTypeChange]);

  const handleCameraChange = useCallback((value: Shot['cameraMovement']) => {
    if (shot) {
      onCameraMovementChange(shot.id, value);
    }
  }, [shot?.id, onCameraMovementChange]);

  const handleGenerate = useCallback(() => {
    if (shot) {
      onGenerateImage(shot.id);
    }
  }, [shot?.id, onGenerateImage]);

  return (
    <div className="directorPanel">
      <div className="panelHeader">
        <SettingOutlined style={{ color: '#10b981' }} />
        <Text strong>AI 导演控制台</Text>
      </div>

      {shot ? (
        <div className="panelContent">
          <Form layout="vertical">
            <Form.Item label="视频生成引擎 (Global)">
              <Card size="small" className="engineCard">
                <div className="engineInfo">
                  <div className="engineIcon">
                    {itvConfig?.provider?.substring(0, 2).toUpperCase() || 'N/A'}
                  </div>
                  <div>
                    <Text strong style={{ textTransform: 'capitalize' }}>
                      {itvConfig?.provider || '未配置'}
                    </Text>
                    <br />
                    <Text type="secondary" code style={{ fontSize: 10 }}>
                      {itvConfig?.name || '-'}
                    </Text>
                  </div>
                  <Badge status={itvConfig ? "success" : "default"} className="statusBadge" />
                </div>
                <Text type="secondary" style={{ fontSize: 10 }}>
                  使用全局设置中配置的模型进行生成。
                </Text>
              </Card>
            </Form.Item>

            <Form.Item
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span>画面提示词 (Prompt)</span>
                  <Tooltip title="放大编辑">
                    <Button
                      type="text"
                      size="small"
                      icon={<ExpandOutlined />}
                      onClick={onExpandEditor}
                      style={{ marginRight: -8 }}
                    />
                  </Tooltip>
                </div>
              }
            >
              <ScriptEditor
                value={shot.description}
                onChange={handleDescriptionChange}
                placeholder="描述画面内容，可使用 @ 引用角色或道具"
                mentionItems={mentionItems}
                minHeight="120px"
                maxHeight="180px"
                showLineNumbers={false}
                darkTheme={true}
              />
            </Form.Item>

            <Form.Item label="景别 (Shot Size)">
              <Segmented
                options={SHOT_TYPE_OPTIONS}
                value={shot.shotType}
                onChange={handleShotTypeChange}
                block
              />
            </Form.Item>

            <Form.Item label="运镜 (Movement)">
              <Select
                options={CAMERA_OPTIONS}
                value={shot.cameraMovement}
                onChange={handleCameraChange}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Form>

          <div className="panelActions">
            <Button
              type="primary"
              size="large"
              icon={isGenerating ? <LoadingOutlined /> : <CaretRightOutlined />}
              disabled={isGenerating}
              onClick={handleGenerate}
              block
            >
              {isGenerating ? '生成中...' : '生成此镜头 (Render)'}
            </Button>
            <Text type="secondary" style={{ fontSize: 10, display: 'block', textAlign: 'center', marginTop: 8 }}>
              预计消耗 40 Tokens
            </Text>
          </div>
        </div>
      ) : (
        <div className="panelEmpty">
          <SettingOutlined style={{ fontSize: 48, opacity: 0.1 }} />
          <Text>请选择一个分镜</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>以配置详细的导演参数</Text>
        </div>
      )}
    </div>
  );
});

DirectorPanel.displayName = 'DirectorPanel';

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
  const [loading, setLoading] = useState(true);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [generatingShots, setGeneratingShots] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 编辑弹窗
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Shot>>({});

  // 放大编辑器弹窗
  const [expandEditorOpen, setExpandEditorOpen] = useState(false);
  const [expandEditorValue, setExpandEditorValue] = useState('');

  // 获取默认 ITV 配置
  const defaultITVConfig = useMemo(() =>
    settings.itvConfigs?.find(c => c.isDefault) || settings.itvConfigs?.[0],
    [settings.itvConfigs]
  );

  // 选中的分镜
  const selectedShot = useMemo(() =>
    shots.find(s => s.id === selectedShotId) || null,
    [shots, selectedShotId]
  );

  // 已确认的分镜
  const confirmedShots = useMemo(() => shots.filter(s => s.confirmed), [shots]);
  const confirmedCount = confirmedShots.length;
  const totalDuration = useMemo(() => shots.reduce((acc, s) => acc + s.duration, 0), [shots]);

  // 加载数据
  const loadData = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const [loadedShots, loadedCharacters, loadedScenes] = await Promise.all([
        loadShots(projectId),
        loadCharacters(projectId),
        loadScenes(projectId),
      ]);

      setShots(loadedShots);
      setCharacters(loadedCharacters);
      setScenes(loadedScenes);

      if (loadedShots.length > 0 && !selectedShotId) {
        setSelectedShotId(loadedShots[0].id);
      }

      console.log('[Storyboard] 加载数据:', {
        shots: loadedShots.length,
        characters: loadedCharacters.length,
        scenes: loadedScenes.length,
      });
    } catch (err) {
      console.error('[Storyboard] 加载失败:', err);
      message.error('加载分镜数据失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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
    try {
      await saveShots(projectId, updatedShots);
      setShots(updatedShots);
    } catch (err) {
      message.error('保存失败');
    }
  }, [projectId]);

  // ============ 回调函数 (稳定化) ============

  const handleSelectShot = useCallback((id: string) => {
    setSelectedShotId(id);
  }, []);

  const handleToggleConfirm = useCallback(async (shot: Shot) => {
    const updatedShots = shots.map(s =>
      s.id === shot.id ? { ...s, confirmed: !s.confirmed } : s
    );
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  const handleEditShot = useCallback((shot: Shot) => {
    setEditingShot(shot);
    setEditFormData({ ...shot });
    setEditModalOpen(true);
  }, []);

  const handleDeleteShot = useCallback(async (shotId: string) => {
    const updatedShots = shots.filter(s => s.id !== shotId);
    await saveAllShots(updatedShots);
    if (selectedShotId === shotId) {
      setSelectedShotId(updatedShots[0]?.id || null);
    }
    message.success('分镜已删除');
  }, [shots, saveAllShots, selectedShotId]);

  const handleGenerateShotImage = useCallback(async (shotId: string) => {
    setGeneratingShots(prev => new Set(prev).add(shotId));
    try {
      await generateShotImage(projectId, shotId, characters, scenes, ttiConfigId);
      message.info('分镜图片生成任务已启动');
    } catch (err: any) {
      message.error(err.message || '启动生成失败');
      setGeneratingShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, characters, scenes, ttiConfigId]);

  // 导演面板专用回调
  const handleDescriptionChange = useCallback((shotId: string, description: string) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, description } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  const handleShotTypeChange = useCallback((shotId: string, shotType: Shot['shotType']) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, shotType } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  const handleCameraMovementChange = useCallback((shotId: string, cameraMovement: Shot['cameraMovement']) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, cameraMovement } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 放大编辑器
  const handleExpandEditor = useCallback(() => {
    if (selectedShot) {
      setExpandEditorValue(selectedShot.description);
      setExpandEditorOpen(true);
    }
  }, [selectedShot]);

  const handleExpandEditorSave = useCallback(() => {
    if (selectedShot) {
      handleDescriptionChange(selectedShot.id, expandEditorValue);
      setExpandEditorOpen(false);
    }
  }, [selectedShot, expandEditorValue, handleDescriptionChange]);

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
    setSelectedShotId(updatedShot.id);
  }, [editFormData, editingShot, shots, saveAllShots]);

  const handleBatchGenerate = useCallback(async () => {
    const unconfirmedShots = shots.filter(s => !s.imagePath);
    if (unconfirmedShots.length === 0) {
      message.info('所有分镜都已有图片');
      return;
    }

    const shotIds = unconfirmedShots.map(s => s.id);
    setGeneratingShots(new Set(shotIds));

    try {
      await batchGenerateShotImages(projectId, shotIds, characters, scenes, ttiConfigId);
      message.info(`已启动 ${shotIds.length} 个分镜的图片生成任务`);
    } catch (err: any) {
      message.error(err.message || '批量生成启动失败');
      setGeneratingShots(new Set());
    }
  }, [projectId, shots, characters, scenes, ttiConfigId]);

  const handleSendToTimeline = useCallback(() => {
    if (confirmedCount === 0) {
      message.warning('请先确认至少一个分镜');
      return;
    }
    if (onConfirmedShotsToTimeline) {
      onConfirmedShotsToTimeline(confirmedShots);
      message.success(`${confirmedCount} 个分镜已入轨`);
    }
  }, [confirmedCount, confirmedShots, onConfirmedShotsToTimeline]);

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
      {/* 左侧：分镜列表 */}
      <div className="storyboardMain">
        {/* 顶部统计栏 */}
        <div className="storyboardHeader">
          <Space size="large">
            <div className="headerStat">
              <VideoCameraOutlined />
              <Text strong style={{ color: '#fff' }}>{shots.length}</Text>
              <Text type="secondary">Shots</Text>
            </div>
            <div className="headerStat">
              <CheckCircleOutlined style={{ color: confirmedCount > 0 ? '#52c41a' : undefined }} />
              <Text strong style={{ color: confirmedCount > 0 ? '#52c41a' : '#fff' }}>{confirmedCount}</Text>
              <Text type="secondary">已确认</Text>
            </div>
            <div className="headerStat">
              <Text strong style={{ color: '#fff' }}>{totalDuration}s</Text>
              <Text type="secondary">Duration</Text>
            </div>
          </Space>
          <Space>
            <Button icon={<PlusOutlined />} onClick={handleAddShot}>添加分镜</Button>
            <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
            <Button icon={<ThunderboltOutlined />} onClick={handleBatchGenerate}>批量渲染</Button>
            <Button
              icon={<SendOutlined />}
              disabled={confirmedCount === 0}
              onClick={handleSendToTimeline}
            >
              入轨 ({confirmedCount})
            </Button>
            <Button type="primary" icon={<PlayCircleOutlined />}>预览整片</Button>
          </Space>
        </div>

        {/* 镜头卡片列表 */}
        <div className="storyboardList">
          {shots.length === 0 ? (
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
                      提示：需要先在剧本步骤输入内容才能���用 AI 生成
                    </Text>
                  )}
                </Space>
              )}
            </Empty>
          ) : (
            shots.map((shot, index) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                index={index}
                isSelected={selectedShotId === shot.id}
                isGenerating={generatingShots.has(shot.id)}
                characters={characters}
                onSelect={handleSelectShot}
                onToggleConfirm={handleToggleConfirm}
                onEdit={handleEditShot}
                onDelete={handleDeleteShot}
                onGenerateImage={handleGenerateShotImage}
              />
            ))
          )}
        </div>
      </div>

      {/* 右侧：AI 导演控制面板 */}
      <DirectorPanel
        shot={selectedShot}
        itvConfig={defaultITVConfig}
        mentionItems={mentionItems}
        isGenerating={selectedShot ? generatingShots.has(selectedShot.id) : false}
        onDescriptionChange={handleDescriptionChange}
        onShotTypeChange={handleShotTypeChange}
        onCameraMovementChange={handleCameraMovementChange}
        onGenerateImage={handleGenerateShotImage}
        onExpandEditor={handleExpandEditor}
      />

      {/* 放大编辑器弹窗 */}
      <Modal
        title="编辑画面提示词"
        open={expandEditorOpen}
        onCancel={() => setExpandEditorOpen(false)}
        onOk={handleExpandEditorSave}
        okText="保存"
        cancelText="取消"
        width={800}
        centered
      >
        <ScriptEditor
          value={expandEditorValue}
          onChange={setExpandEditorValue}
          placeholder="详细描述画面内容，可使用 @ 引用角色或道具"
          mentionItems={mentionItems}
          minHeight="300px"
          maxHeight="500px"
          showLineNumbers={false}
          darkTheme={true}
        />
      </Modal>

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
              mentionItems={mentionItems}
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
