import React, { useState, useCallback } from 'react';
import {
  Modal,
  Steps,
  Button,
  Space,
  Card,
  Row,
  Col,
  Tag,
  Input,
  Alert,
  Spin,
  Result,
  Typography,
  Tooltip,
  Popconfirm,
} from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  ToolOutlined,
  VideoCameraOutlined,
  CheckOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EditOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import type { Character, Scene, Prop, Shot } from '../types';
import {
  ScriptAnalysisService,
  createScriptAnalysisService,
  type AnalysisProgress,
  type AnalysisStage,
} from '../services/ScriptAnalysisService';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface ScriptAnalysisWizardProps {
  visible: boolean;
  script: string;
  projectLLMConfigId?: string;
  onCancel: () => void;
  onComplete: (result: {
    characters: Character[];
    scenes: Scene[];
    props: Prop[];
    shots: Shot[];
  }) => void;
  onGenerateCharacterAssets?: (characters: Character[]) => void;
}

type StepStatus = 'wait' | 'process' | 'finish' | 'error';

interface StepState {
  status: StepStatus;
  message?: string;
}

export const ScriptAnalysisWizard: React.FC<ScriptAnalysisWizardProps> = ({
  visible,
  script,
  projectLLMConfigId,
  onCancel,
  onComplete,
  onGenerateCharacterAssets,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [service, setService] = useState<ScriptAnalysisService | null>(null);

  // 步骤状态
  const [stepStates, setStepStates] = useState<StepState[]>([
    { status: 'wait' },
    { status: 'wait' },
    { status: 'wait' },
    { status: 'wait' },
  ]);

  // 解析结果
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);

  // 编辑状态
  const [editingItem, setEditingItem] = useState<{ type: string; index: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  // 错误信息
  const [error, setError] = useState<string | null>(null);

  const stageIndexMap: Record<AnalysisStage, number> = {
    characters: 0,
    scenes: 1,
    props: 2,
    shots: 3,
  };

  const handleProgress = useCallback((progress: AnalysisProgress) => {
    const index = stageIndexMap[progress.stage];
    setStepStates(prev => {
      const newStates = [...prev];
      newStates[index] = {
        status: progress.status === 'running' ? 'process' :
                progress.status === 'completed' ? 'finish' :
                progress.status === 'failed' ? 'error' : 'wait',
        message: progress.message,
      };
      return newStates;
    });
  }, []);

  // 开始分析
  const startAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    setStepStates([
      { status: 'wait' },
      { status: 'wait' },
      { status: 'wait' },
      { status: 'wait' },
    ]);

    const analysisService = createScriptAnalysisService(handleProgress);
    setService(analysisService);

    try {
      const configured = await analysisService.setLLMConfig(projectLLMConfigId);
      if (!configured) {
        setError('未配置 LLM 模型，请先在设置中添加');
        setAnalyzing(false);
        return;
      }

      // 第一步：提取角色
      const charResult = await analysisService.extractCharacters(script);
      if (charResult.success && charResult.data) {
        setCharacters(charResult.data);
        setCurrentStep(1);
      } else {
        setError(charResult.error || '角色提取失败');
        setAnalyzing(false);
        return;
      }

      // 第二步：提取场景
      const sceneResult = await analysisService.extractScenes(script);
      if (sceneResult.success && sceneResult.data) {
        setScenes(sceneResult.data);
        setCurrentStep(2);
      } else {
        setError(sceneResult.error || '场景提取失败');
        setAnalyzing(false);
        return;
      }

      // 第三步：提取道具
      const propsResult = await analysisService.extractProps(script);
      if (propsResult.success && propsResult.data) {
        setProps(propsResult.data);
        setCurrentStep(3);
      } else {
        setError(propsResult.error || '道具提取失败');
        setAnalyzing(false);
        return;
      }

      // 第四步：生成分镜
      const shotsResult = await analysisService.generateShots(
        script,
        charResult.data!,
        sceneResult.data!,
        propsResult.data!
      );
      if (shotsResult.success && shotsResult.data) {
        setShots(shotsResult.data);
        setCurrentStep(4);
      } else {
        setError(shotsResult.error || '分镜生成失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // 重新生成某个步骤
  const regenerateStep = async (step: number) => {
    if (!service) return;

    setAnalyzing(true);
    setError(null);

    try {
      switch (step) {
        case 0: {
          const result = await service.extractCharacters(script);
          if (result.success && result.data) {
            setCharacters(result.data);
          } else {
            setError(result.error || '重新生成失败');
          }
          break;
        }
        case 1: {
          const result = await service.extractScenes(script);
          if (result.success && result.data) {
            setScenes(result.data);
          } else {
            setError(result.error || '重新生成失败');
          }
          break;
        }
        case 2: {
          const result = await service.extractProps(script);
          if (result.success && result.data) {
            setProps(result.data);
          } else {
            setError(result.error || '重新生成失败');
          }
          break;
        }
        case 3: {
          const result = await service.generateShots(script, characters, scenes, props);
          if (result.success && result.data) {
            setShots(result.data);
          } else {
            setError(result.error || '重新生成失败');
          }
          break;
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // 删除项目
  const deleteItem = (type: string, index: number) => {
    switch (type) {
      case 'character':
        setCharacters(prev => prev.filter((_, i) => i !== index));
        break;
      case 'scene':
        setScenes(prev => prev.filter((_, i) => i !== index));
        break;
      case 'prop':
        setProps(prev => prev.filter((_, i) => i !== index));
        break;
      case 'shot':
        setShots(prev => prev.filter((_, i) => i !== index));
        break;
    }
  };

  // 完成
  const handleComplete = () => {
    onComplete({ characters, scenes, props, shots });
  };

  // 渲染步骤内容
  const renderStepContent = () => {
    if (currentStep === 0 && !analyzing && characters.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Paragraph>准备分析剧本，提取角色、场景、道具并生成分镜。</Paragraph>
          <Paragraph type="secondary">剧本长度：{script.length} 字符</Paragraph>
          <Button type="primary" size="large" onClick={startAnalysis}>
            开始 AI 解析
          </Button>
        </div>
      );
    }

    if (analyzing && currentStep < 4) {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
          <Paragraph style={{ marginTop: 24 }}>
            {stepStates[currentStep]?.message || '正在分析中...'}
          </Paragraph>
        </div>
      );
    }

    if (error) {
      return (
        <Result
          status="error"
          title="分析失败"
          subTitle={error}
          extra={[
            <Button key="retry" type="primary" onClick={startAnalysis}>
              重新开始
            </Button>,
            <Button key="cancel" onClick={onCancel}>
              取消
            </Button>,
          ]}
        />
      );
    }

    // 显示结果
    switch (currentStep) {
      case 1:
      case 4:
        if (characters.length > 0 && currentStep >= 1) {
          return renderCharactersList();
        }
        return null;
      default:
        return renderCurrentStepResult();
    }
  };

  const renderCharactersList = () => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>识别到 {characters.length} 个角色</Text>
        <Space>
          {onGenerateCharacterAssets && characters.length > 0 && (
            <Button
              size="small"
              icon={<PictureOutlined />}
              onClick={() => onGenerateCharacterAssets(characters)}
              type="primary"
              ghost
            >
              生成定妆照
            </Button>
          )}
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => regenerateStep(0)}
            disabled={analyzing}
          >
            重新生成
          </Button>
        </Space>
      </div>
      <Row gutter={[16, 16]}>
        {characters.map((char: Character, index: number) => (
          <Col key={char.id || index} xs={24} sm={12}>
            <Card
              size="small"
              title={
                <Space>
                  <UserOutlined />
                  {char.name}
                  <Tag color={char.role === 'protagonist' ? 'gold' : char.role === 'antagonist' ? 'red' : 'default'}>
                    {char.role === 'protagonist' ? '主角' : char.role === 'antagonist' ? '反派' : '配角'}
                  </Tag>
                </Space>
              }
              extra={
                <Popconfirm title="确定删除？" onConfirm={() => deleteItem('character', index)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              }
            >
              <Paragraph ellipsis={{ rows: 2 }}>{char.description}</Paragraph>
              <Text type="secondary" style={{ fontSize: 12 }}>外貌: {char.appearance?.slice(0, 50)}...</Text>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );

  const renderCurrentStepResult = () => {
    if (currentStep >= 2 && scenes.length > 0) {
      return (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Text strong>识别到 {scenes.length} 个场景</Text>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => regenerateStep(1)} disabled={analyzing}>
              重新生成
            </Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scenes.map((scene: Scene, index: number) => (
              <Card key={scene.id || index} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <EnvironmentOutlined style={{ fontSize: 24 }} />
                    <div>
                      <div><Space>{scene.name}<Tag>{scene.time === 'day' ? '白天' : scene.time === 'night' ? '夜晚' : '黄昏'}</Tag></Space></div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{scene.description?.slice(0, 80)}</Text>
                    </div>
                  </div>
                  <Popconfirm title="确定删除？" onConfirm={() => deleteItem('scene', index)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    if (currentStep >= 3 && props.length > 0) {
      return (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Text strong>识别到 {props.length} 个道具</Text>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => regenerateStep(2)} disabled={analyzing}>
              重新生成
            </Button>
          </div>
          <Row gutter={[16, 16]}>
            {props.map((prop: Prop, index: number) => (
              <Col key={prop.id || index} xs={24} sm={12} md={8}>
                <Card size="small">
                  <Space>
                    <ToolOutlined />
                    <Text strong>{prop.name}</Text>
                    <Tag>{prop.type}</Tag>
                    <Popconfirm title="确定删除？" onConfirm={() => deleteItem('prop', index)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      );
    }

    if (currentStep >= 4 && shots.length > 0) {
      return (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Text strong>生成 {shots.length} 个分镜</Text>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => regenerateStep(3)} disabled={analyzing}>
              重新生成
            </Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shots.map((shot: Shot, index: number) => (
              <Card key={shot.id || index} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 40, textAlign: 'center' }}>
                      <VideoCameraOutlined style={{ fontSize: 20 }} />
                      <div style={{ fontSize: 10, color: '#888' }}>#{index + 1}</div>
                    </div>
                    <div>
                      <div style={{ marginBottom: 4 }}>
                        <Space>
                          <Tag>{shot.shotType === 'close-up' ? '特写' : shot.shotType === 'medium' ? '中景' : shot.shotType === 'wide' ? '全景' : '大全景'}</Tag>
                          <Text type="secondary">{shot.duration}s</Text>
                          {shot.dialogue && <Tag color="blue">有台词</Tag>}
                        </Space>
                      </div>
                      <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 4 }}>{shot.description}</Paragraph>
                      {shot.scriptContent && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          原文: {shot.scriptContent.slice(0, 50)}...
                        </Text>
                      )}
                    </div>
                  </div>
                  <Popconfirm title="确定删除？" onConfirm={() => deleteItem('shot', index)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  const steps = [
    { title: '角色', icon: <UserOutlined /> },
    { title: '场景', icon: <EnvironmentOutlined /> },
    { title: '道具', icon: <ToolOutlined /> },
    { title: '分镜', icon: <VideoCameraOutlined /> },
  ];

  return (
    <Modal
      title="AI 剧本解析"
      open={visible}
      onCancel={onCancel}
      width={900}
      maskClosable={false}
      footer={
        currentStep === 4 && !analyzing && !error ? (
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" onClick={handleComplete}>
              确认并应用
            </Button>
          </Space>
        ) : null
      }
      destroyOnHidden
    >
      <Steps
        current={currentStep}
        items={steps.map((step, index) => ({
          ...step,
          status: stepStates[index]?.status,
          subTitle: stepStates[index]?.message,
        }))}
        style={{ marginBottom: 24 }}
      />

      <div style={{ minHeight: 300, maxHeight: 500, overflow: 'auto' }}>
        {renderStepContent()}
      </div>
    </Modal>
  );
};
