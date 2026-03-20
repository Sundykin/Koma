/**
 * 资产生成向导
 * 分步引导生成项目所有资产：角色 → 场景 → 道具 → 预览视频
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Steps,
  Button,
  Card,
  Flex,
  Progress,
  Typography,
  Space,
  Checkbox,
  Tag,
  Image,
  Spin,
  App,
  Result,
} from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  AppstoreOutlined,
  VideoCameraOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { Project } from '../../types';
import { loadCharacters, loadScenes, loadProps } from '../../store/projectStore';
import { electronService } from '../../services/electronService';
import {
  generateCostumePhoto,
  generateCharacterPreviewVideo,
} from '../../workflow/characterAssetWorkflow';
import { generateSceneImage, generatePropImage, generatePropPreviewVideo } from '../../workflow/scenePropAssetWorkflow';
import {
  getCharacterCostumePhotoSource,
  getCharacterPreviewVideoSource,
  getPropPreviewImageSource,
  getPropPreviewVideoSource,
  getScenePreviewImageSource,
} from '../../utils/mediaSelectors';

const { Text } = Typography;

interface AssetGenerationWizardProps {
  project: Project;
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

type WizardStep = 'characters' | 'scenes' | 'props' | 'videos' | 'complete';

interface ItemStatus {
  id: string;
  name: string;
  selected: boolean;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  progress: number;
  error?: string;
  imagePath?: string;
  sourceType?: 'character' | 'prop'; // 视频步骤区分角色/道具
}

const stepConfig = [
  { key: 'characters', title: '角色定妆照', icon: <UserOutlined /> },
  { key: 'scenes', title: '场景预览图', icon: <EnvironmentOutlined /> },
  { key: 'props', title: '道具参考图', icon: <AppstoreOutlined /> },
  { key: 'videos', title: '预览视频', icon: <VideoCameraOutlined /> },
];

export const AssetGenerationWizard: React.FC<AssetGenerationWizardProps> = ({
  project,
  open,
  onClose,
  onComplete,
}) => {
  const { message } = App.useApp();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentItem, setCurrentItem] = useState('');

  // 各步骤数据
  const [characters, setCharacters] = useState<ItemStatus[]>([]);
  const [scenes, setScenes] = useState<ItemStatus[]>([]);
  const [props, setProps] = useState<ItemStatus[]>([]);
  const [videoItems, setVideoItems] = useState<ItemStatus[]>([]);

  // 加载项目资产数据
  useEffect(() => {
    if (!open || !project) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [chars, scns, prps] = await Promise.all([
          loadCharacters(project.id),
          loadScenes(project.id),
          loadProps(project.id),
        ]);

        setCharacters(chars.map(c => ({
          id: c.id,
          name: c.name,
          selected: !getCharacterCostumePhotoSource(c),
          status: getCharacterCostumePhotoSource(c) ? 'completed' : 'pending',
          progress: getCharacterCostumePhotoSource(c) ? 100 : 0,
          imagePath: getCharacterCostumePhotoSource(c),
        })));

        setScenes(scns.map(s => ({
          id: s.id,
          name: s.name,
          selected: !getScenePreviewImageSource(s),
          status: getScenePreviewImageSource(s) ? 'completed' : 'pending',
          progress: getScenePreviewImageSource(s) ? 100 : 0,
          imagePath: getScenePreviewImageSource(s),
        })));

        setProps(prps.map(p => ({
          id: p.id,
          name: p.name,
          selected: !getPropPreviewImageSource(p),
          status: getPropPreviewImageSource(p) ? 'completed' : 'pending',
          progress: getPropPreviewImageSource(p) ? 100 : 0,
          imagePath: getPropPreviewImageSource(p),
        })));

        // 视频步骤：有定妆照的角色 + 有参考图的道具
        const charVideos: ItemStatus[] = chars
          .filter(c => getCharacterCostumePhotoSource(c))
          .map(c => ({
          id: c.id,
          name: `[角色] ${c.name}`,
          selected: !getCharacterPreviewVideoSource(c),
          status: getCharacterPreviewVideoSource(c) ? 'completed' : 'pending',
          progress: getCharacterPreviewVideoSource(c) ? 100 : 0,
          imagePath: getCharacterPreviewVideoSource(c),
          sourceType: 'character' as const,
        }));
        const propVideos: ItemStatus[] = prps
          .filter(p => getPropPreviewImageSource(p))
          .map(p => ({
          id: p.id,
          name: `[道具] ${p.name}`,
          selected: !getPropPreviewVideoSource(p),
          status: getPropPreviewVideoSource(p) ? 'completed' : 'pending',
          progress: getPropPreviewVideoSource(p) ? 100 : 0,
          imagePath: getPropPreviewVideoSource(p),
          sourceType: 'prop' as const,
        }));
        setVideoItems([...charVideos, ...propVideos]);
      } catch (err: any) {
        message.error(`加载数据失败: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [open, project, message]);

  // 切换选中状态
  const toggleSelect = useCallback((type: WizardStep, id: string) => {
    const updateList = (list: ItemStatus[], setter: React.Dispatch<React.SetStateAction<ItemStatus[]>>) => {
      setter(list.map(item =>
        item.id === id ? { ...item, selected: !item.selected } : item
      ));
    };

    switch (type) {
      case 'characters':
        updateList(characters, setCharacters);
        break;
      case 'scenes':
        updateList(scenes, setScenes);
        break;
      case 'props':
        updateList(props, setProps);
        break;
      case 'videos':
        updateList(videoItems, setVideoItems);
        break;
    }
  }, [characters, scenes, props, videoItems]);

  // 全选/取消全选
  const toggleSelectAll = useCallback((type: WizardStep, selected: boolean) => {
    const updateList = (list: ItemStatus[], setter: React.Dispatch<React.SetStateAction<ItemStatus[]>>) => {
      setter(list.map(item => ({ ...item, selected })));
    };

    switch (type) {
      case 'characters':
        updateList(characters, setCharacters);
        break;
      case 'scenes':
        updateList(scenes, setScenes);
        break;
      case 'props':
        updateList(props, setProps);
        break;
      case 'videos':
        updateList(videoItems, setVideoItems);
        break;
    }
  }, [characters, scenes, props, videoItems]);

  // 生成单个资产
  const generateOneItem = async (
    item: ItemStatus,
    stepKey: WizardStep,
    setter: React.Dispatch<React.SetStateAction<ItemStatus[]>>,
    onProgress: (progress: number, step: string) => void,
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    switch (stepKey) {
      case 'characters': {
        const chars = await loadCharacters(project.id);
        const char = chars.find(c => c.id === item.id);
        if (!char) return { success: false, error: '角色不存在' };
        return generateCostumePhoto({
          projectId: project.id,
          character: char,
          styleSnapshot: project.styleSnapshot,
          ttiConfigId: project.ttiConfigId,
          onProgress,
        });
      }
      case 'scenes': {
        const scns = await loadScenes(project.id);
        const scene = scns.find(s => s.id === item.id);
        if (!scene) return { success: false, error: '场景不存在' };
        return generateSceneImage({
          projectId: project.id,
          scene,
          styleSnapshot: project.styleSnapshot,
          ttiConfigId: project.ttiConfigId,
          onProgress,
        });
      }
      case 'props': {
        const prps = await loadProps(project.id);
        const prop = prps.find(p => p.id === item.id);
        if (!prop) return { success: false, error: '道具不存在' };
        return generatePropImage({
          projectId: project.id,
          prop,
          styleSnapshot: project.styleSnapshot,
          ttiConfigId: project.ttiConfigId,
          onProgress,
        });
      }
      case 'videos': {
        if (item.sourceType === 'prop') {
          const prps = await loadProps(project.id);
          const prop = prps.find(p => p.id === item.id);
          if (!prop) return { success: false, error: '道具不存在' };
          return generatePropPreviewVideo({
            projectId: project.id,
            prop,
            styleSnapshot: project.styleSnapshot,
            itvConfigId: project.itvConfigId,
            onProgress,
          });
        } else {
          const chars = await loadCharacters(project.id);
          const char = chars.find(c => c.id === item.id);
          if (!char) return { success: false, error: '角色不存在' };
          return generateCharacterPreviewVideo({
            projectId: project.id,
            character: char,
            styleSnapshot: project.styleSnapshot,
            itvConfigId: project.itvConfigId,
            onProgress,
          });
        }
      }
      default:
        return { success: false, error: '未知步骤' };
    }
  };

  // 获取当前步骤的 setter
  const getStepSetter = (stepKey: WizardStep): React.Dispatch<React.SetStateAction<ItemStatus[]>> => {
    switch (stepKey) {
      case 'characters': return setCharacters;
      case 'scenes': return setScenes;
      case 'props': return setProps;
      case 'videos': return setVideoItems;
      default: return setCharacters;
    }
  };

  // 开始生成当前步骤
  const startGeneration = async () => {
    setGenerating(true);
    setOverallProgress(0);

    const stepKey = stepConfig[currentStep].key as WizardStep;
    const setter = getStepSetter(stepKey);
    let items: ItemStatus[] = [];

    switch (stepKey) {
      case 'characters':
        items = characters.filter(c => c.selected);
        break;
      case 'scenes':
        items = scenes.filter(s => s.selected);
        break;
      case 'props':
        items = props.filter(p => p.selected);
        break;
      case 'videos':
        items = videoItems.filter(c => c.selected);
        break;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setCurrentItem(item.name);

      // 更新状态为生成中
      setter(prev => prev.map(it =>
        it.id === item.id ? { ...it, status: 'generating', progress: 0 } : it
      ));

      let result: { success: boolean; path?: string; error?: string };

      try {
        const onProgress = (progress: number, _step: string) => {
          setter(prev => prev.map(it =>
            it.id === item.id ? { ...it, progress } : it
          ));
          setOverallProgress(((i + progress / 100) / items.length) * 100);
        };

        result = await generateOneItem(item, stepKey, setter, onProgress);
      } catch (err: any) {
        result = { success: false, error: err.message };
      }

      // 更新状态
      setter(prev => prev.map(it =>
        it.id === item.id
          ? {
              ...it,
              status: result.success ? 'completed' : 'failed',
              progress: result.success ? 100 : 0,
              error: result.error,
              imagePath: result.path || it.imagePath,
            }
          : it
      ));
    }

    setGenerating(false);
    setCurrentItem('');
    setOverallProgress(100);
    message.success(`${stepConfig[currentStep].title}生成完成`);
  };

  // 重试单个失败项
  const retryItem = async (item: ItemStatus) => {
    const stepKey = stepConfig[currentStep].key as WizardStep;
    const setter = getStepSetter(stepKey);

    setGenerating(true);
    setCurrentItem(item.name);
    setOverallProgress(0);

    setter(prev => prev.map(it =>
      it.id === item.id ? { ...it, status: 'generating', progress: 0, error: undefined } : it
    ));

    let result: { success: boolean; path?: string; error?: string };
    try {
      const onProgress = (progress: number, _step: string) => {
        setter(prev => prev.map(it =>
          it.id === item.id ? { ...it, progress } : it
        ));
        setOverallProgress(progress);
      };

      result = await generateOneItem(item, stepKey, setter, onProgress);
    } catch (err: any) {
      result = { success: false, error: err.message };
    }

    setter(prev => prev.map(it =>
      it.id === item.id
        ? {
            ...it,
            status: result.success ? 'completed' : 'failed',
            progress: result.success ? 100 : 0,
            error: result.error,
            imagePath: result.path || it.imagePath,
          }
        : it
    ));

    setGenerating(false);
    setCurrentItem('');
    setOverallProgress(100);
    if (result.success) {
      message.success(`${item.name} 生成完成`);
    }
  };

  // 下一步
  const handleNext = async () => {
    if (currentStep < stepConfig.length - 1) {
      const nextStep = currentStep + 1;

      // 跳转到视频步骤时，重新加载数据（定妆照/参考图可能刚生成）
      if (stepConfig[nextStep].key === 'videos') {
        const [chars, prps] = await Promise.all([
          loadCharacters(project.id),
          loadProps(project.id),
        ]);
        const charVideos: ItemStatus[] = chars
          .filter(c => getCharacterCostumePhotoSource(c))
          .map(c => ({
          id: c.id,
          name: `[角色] ${c.name}`,
          selected: !getCharacterPreviewVideoSource(c),
          status: getCharacterPreviewVideoSource(c) ? 'completed' : 'pending',
          progress: getCharacterPreviewVideoSource(c) ? 100 : 0,
          imagePath: getCharacterPreviewVideoSource(c),
          sourceType: 'character' as const,
        }));
        const propVideos: ItemStatus[] = prps
          .filter(p => getPropPreviewImageSource(p))
          .map(p => ({
          id: p.id,
          name: `[道具] ${p.name}`,
          selected: !getPropPreviewVideoSource(p),
          status: getPropPreviewVideoSource(p) ? 'completed' : 'pending',
          progress: getPropPreviewVideoSource(p) ? 100 : 0,
          imagePath: getPropPreviewVideoSource(p),
          sourceType: 'prop' as const,
        }));
        setVideoItems([...charVideos, ...propVideos]);
      }

      setCurrentStep(nextStep);
      setOverallProgress(0);
    } else {
      // 完成
      onComplete?.();
      onClose();
    }
  };

  // 获取当前列表
  const getCurrentList = (): ItemStatus[] => {
    const stepKey = stepConfig[currentStep]?.key as WizardStep;
    switch (stepKey) {
      case 'characters': return characters;
      case 'scenes': return scenes;
      case 'props': return props;
      case 'videos': return videoItems;
      default: return [];
    }
  };

  const currentList = getCurrentList();
  const selectedCount = currentList.filter(i => i.selected).length;
  const completedCount = currentList.filter(i => i.status === 'completed').length;

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  // 渲染列表项
  const renderListItem = (item: ItemStatus, type: WizardStep) => {
    const statusIcon = item.status === 'completed' ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> :
      item.status === 'failed' ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> :
      item.status === 'generating' ? <LoadingOutlined style={{ color: '#1890ff' }} /> :
      null;

    return (
      <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #303030' }}>
        <Checkbox
          checked={item.selected}
          onChange={() => toggleSelect(type, item.id)}
          disabled={generating || item.status === 'generating'}
          style={{ marginRight: 12 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space>
            {item.name}
            {statusIcon}
            {item.status === 'generating' && (
              <Text type="secondary">{item.progress}%</Text>
            )}
          </Space>
          {item.error && <div><Text type="danger">{item.error}</Text></div>}
        </div>
        {item.imagePath && (
          <div style={{ width: 60, height: 60, marginLeft: 12 }}>
            {type === 'videos' ? (
              <video
                src={toLocalUrl(item.imagePath)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
              />
            ) : (
              <Image
                src={toLocalUrl(item.imagePath)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                preview={{ mask: null }}
              />
            )}
          </div>
        )}
        {item.status === 'failed' && (
          <Button
            type="link"
            icon={<ReloadOutlined />}
            onClick={() => retryItem(item)}
            disabled={generating}
            style={{ marginLeft: 8 }}
          >
            重试
          </Button>
        )}
      </div>
    );
  };

  return (
    <Modal
      title="资产生成向导"
      open={open}
      onCancel={() => !generating && onClose()}
      width={720}
      footer={null}
      mask={{ closable: !generating }}
      closable={!generating}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Steps
            current={currentStep}
            items={stepConfig.map(s => ({ title: s.title, icon: s.icon }))}
            style={{ marginBottom: 24 }}
          />

          {generating && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space orientation="vertical" style={{ width: '100%' }}>
                <Text>正在生成: {currentItem}</Text>
                <Progress percent={Math.round(overallProgress)} status="active" />
              </Space>
            </Card>
          )}

          <Card
            title={
              <Space>
                <span>{stepConfig[currentStep].title}</span>
                <Tag>{completedCount}/{currentList.length} 已完成</Tag>
              </Space>
            }
            extra={
              <Space>
                <Button
                  size="small"
                  onClick={() => toggleSelectAll(stepConfig[currentStep].key as WizardStep, true)}
                  disabled={generating}
                >
                  全选
                </Button>
                <Button
                  size="small"
                  onClick={() => toggleSelectAll(stepConfig[currentStep].key as WizardStep, false)}
                  disabled={generating}
                >
                  取消全选
                </Button>
              </Space>
            }
            styles={{ body: { maxHeight: 360, overflow: 'auto' } }}
          >
            {currentList.length === 0 ? (
              <Result
                status="info"
                title="暂无数据"
                subTitle={`请先在剧本分析中提取${stepConfig[currentStep].title.replace(/预览图|参考图|定妆照|视频/g, '')}`}
              />
            ) : (
              <Flex vertical>
                {currentList.map((item) => renderListItem(item, stepConfig[currentStep].key as WizardStep))}
              </Flex>
            )}
          </Card>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space>
              <Button onClick={onClose} disabled={generating}>
                取消
              </Button>
              {currentStep > 0 && (
                <Button onClick={() => setCurrentStep(currentStep - 1)} disabled={generating}>
                  上一步
                </Button>
              )}
              <Button
                type="primary"
                onClick={startGeneration}
                disabled={generating || selectedCount === 0}
                loading={generating}
                icon={<PlayCircleOutlined />}
              >
                开始生成 ({selectedCount})
              </Button>
              <Button onClick={handleNext} disabled={generating}>
                {currentStep === stepConfig.length - 1 ? '完成' : '下一步'}
              </Button>
            </Space>
          </div>
        </>
      )}
    </Modal>
  );
};

export default AssetGenerationWizard;
