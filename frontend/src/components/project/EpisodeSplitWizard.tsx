/**
 * 剧集向导组件
 * 支持 AI 自动分析剧本并创建剧集
 */
import React, { useState, useCallback } from 'react';
import {
  Modal,
  Steps,
  Button,
  InputNumber,
  Radio,
  Space,
  Typography,
  Flex,
  Spin,
  Card,
  App,
} from 'antd';
import { ThunderboltOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { Episode } from '../../types';
import { EpisodeSplitService } from '../../services/EpisodeSplitService';
import type { SplitAnalysis, SplitResult } from '../../services/EpisodeSplitService';
import { getActiveLLMConfig } from '../../store/globalStore';
import { createEpisode } from '../../store/projectStore';

const { Text, Paragraph } = Typography;

interface EpisodeSplitWizardProps {
  visible: boolean;
  projectId: string;
  script: string;
  onCancel: () => void;
  onComplete: (episodes: Episode[]) => void;
}

type WizardStep = 'config' | 'analyzing' | 'preview' | 'creating';

export const EpisodeSplitWizard: React.FC<EpisodeSplitWizardProps> = ({
  visible,
  projectId,
  script,
  onCancel,
  onComplete,
}) => {
  const { message } = App.useApp();

  const [step, setStep] = useState<WizardStep>('config');
  const [targetCount, setTargetCount] = useState<number>(3);
  const [splitStrategy, setSplitStrategy] = useState<'auto' | 'scene' | 'chapter'>('auto');

  const [analysis, setAnalysis] = useState<SplitAnalysis | null>(null);
  const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
  const [service, setService] = useState<EpisodeSplitService | null>(null);

  // 开始分析
  const handleStartAnalysis = useCallback(async () => {
    if (!script.trim()) {
      message.warning('请先输入剧本内容');
      return;
    }

    setStep('analyzing');

    try {
      const config = await getActiveLLMConfig();
      if (!config) {
        throw new Error('请先配置 LLM');
      }

      const splitService = new EpisodeSplitService(config);
      setService(splitService);

      // 分析剧本
      const result = await splitService.analyzeScript(script, {
        targetEpisodeCount: targetCount,
        splitStrategy,
      });

      setAnalysis(result);

      // 执行分割
      const episodes = splitService.splitScript(script, result);
      setSplitResults(episodes);

      setStep('preview');
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage === '剧集分析已取消' || errorMessage === '剧集切分已取消') {
        return;
      }

      message.error(`分析失败: ${errorMessage}`);
      setStep('config');
    }
  }, [script, targetCount, splitStrategy, message]);

  // 创建剧集
  const handleCreateEpisodes = useCallback(async () => {
    if (splitResults.length === 0) return;

    setStep('creating');

    try {
      const createdEpisodes: Episode[] = [];

      for (let i = 0; i < splitResults.length; i++) {
        const result = splitResults[i];
        const episode = await createEpisode(projectId, {
          number: i + 1,
          title: result.title,
          scriptText: result.scriptText,
          status: 'script',
        });
        createdEpisodes.push(episode);
      }

      message.success(`成功创建 ${createdEpisodes.length} 个剧集`);
      onComplete(createdEpisodes);
    } catch (err: any) {
      message.error(`创建失败: ${err.message}`);
      setStep('preview');
    }
  }, [splitResults, projectId, message, onComplete]);

  // 取消
  const handleCancel = useCallback(() => {
    if (service) {
      service.abort();
    }
    setStep('config');
    setAnalysis(null);
    setSplitResults([]);
    onCancel();
  }, [service, onCancel]);

  // 获取当前步骤索引
  const getStepIndex = (): number => {
    switch (step) {
      case 'config': return 0;
      case 'analyzing': return 1;
      case 'preview': return 2;
      case 'creating': return 3;
      default: return 0;
    }
  };

  return (
    <Modal
      title="AI 自动剧集"
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={720}
      mask={{ closable: step === 'config' }}
    >
      <Steps
        current={getStepIndex()}
        items={[
          { title: '配置' },
          { title: '分析中' },
          { title: '预览' },
          { title: '创建' },
        ]}
        style={{ marginBottom: 24 }}
      />

      {/* 步骤1：配置 */}
      {step === 'config' && (
        <div className="space-y-6">
          <div>
            <Text strong className="block mb-2">目标集数</Text>
            <InputNumber
              value={targetCount}
              onChange={(v) => setTargetCount(v || 3)}
              min={1}
              style={{ width: 120 }}
            />
            <Text type="secondary" className="ml-3">
              原文已分集时优先按原文拆分，否则按目标集数规划
            </Text>
          </div>

          <div>
            <Text strong className="block mb-2">分割策略</Text>
            <Radio.Group
              value={splitStrategy}
              onChange={(e) => setSplitStrategy(e.target.value)}
            >
              <Space orientation="vertical">
                <Radio value="auto">智能分析（推荐）</Radio>
                <Radio value="scene">按场景分割</Radio>
                <Radio value="chapter">按章节分割</Radio>
              </Space>
            </Radio.Group>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <Text type="secondary">
              剧本长度: {script.length} 字符
            </Text>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={handleCancel}>取消</Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleStartAnalysis}
            >
              开始分析
            </Button>
          </div>
        </div>
      )}

      {/* 步骤2：分析中 */}
      {step === 'analyzing' && (
        <div className="py-12 text-center">
          <Spin size="large" />
          <div className="mt-4">
            <Text>AI 正在分析剧本并规划剧集...</Text>
          </div>
          <div className="mt-2">
            <Text type="secondary">这可能需要一些时间</Text>
          </div>
        </div>
      )}

      {/* 步骤3：预览 */}
      {step === 'preview' && (
        <div className="space-y-4">
          {analysis && (
            <Card size="small" className="bg-blue-50">
              <Text strong>分析结果：</Text>
              <Paragraph className="mt-2 mb-0" type="secondary">
                {analysis.reasoning}
              </Paragraph>
            </Card>
          )}

          <div>
            <Text strong>剧集预览 ({splitResults.length} 集)</Text>
          </div>

          <Flex vertical gap={8} style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #303030', borderRadius: 8 }}>
            {splitResults.map((item, index) => (
              <div key={index} style={{ padding: '12px 16px', borderBottom: '1px solid #303030', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center font-bold" style={{ flexShrink: 0 }}>
                  {index + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{item.title}</div>
                  <Text type="secondary">{item.summary}</Text>
                  <br />
                  <Text type="secondary" className="text-xs">
                    {item.scriptText.length} 字符
                  </Text>
                </div>
              </div>
            ))}
          </Flex>

          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={() => setStep('config')}>
              重新配置
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleCreateEpisodes}
            >
              确认创建剧集
            </Button>
          </div>
        </div>
      )}

      {/* 步骤4：创建中 */}
      {step === 'creating' && (
        <div className="py-12 text-center">
          <Spin size="large" />
          <div className="mt-4">
            <Text>正在创建剧集...</Text>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default EpisodeSplitWizard;
