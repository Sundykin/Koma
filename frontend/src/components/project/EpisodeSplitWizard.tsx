/**
 * 剧集向导组件
 * 支持 AI 自动分析剧本并创建剧集
 */
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { ThunderboltOutlined, EditOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { LLMModelConfig, Episode } from '../../types';
import { EpisodeSplitService, type SplitAnalysis, type SplitResult } from '../../services/EpisodeSplitService';
import { getActiveLLMConfig } from '../../store/globalStore';
import { createEpisode } from '../../store/projectStore';
import { toUserMessage } from '../../utils/errorMessages';

const { Title, Text, Paragraph } = Typography;

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
  const { t } = useTranslation('project');
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
      message.warning(t('splitWizard.noContentWarning'));
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
      const episodes = await splitService.splitScript(script, result.suggestedCount);
      setSplitResults(episodes);

      setStep('preview');
    } catch (err: any) {
      message.error(t('splitWizard.analyzeError', { error: toUserMessage(err) }));
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

      message.success(t('splitWizard.createSuccess', { count: createdEpisodes.length }));
      onComplete(createdEpisodes);
    } catch (err: any) {
      message.error(t('splitWizard.createError', { error: toUserMessage(err) }));
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
      title={t('splitWizard.modalTitle')}
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={720}
      maskClosable={step === 'config'}
    >
      <Steps
        current={getStepIndex()}
        items={[
          { title: t('splitWizard.stepConfig') },
          { title: t('splitWizard.stepAnalyzing') },
          { title: t('splitWizard.stepPreview') },
          { title: t('splitWizard.stepCreate') },
        ]}
        style={{ marginBottom: 24 }}
      />

      {/* 步骤1：配置 */}
      {step === 'config' && (
        <div className="space-y-6">
          <div>
            <Text strong className="block mb-2">{t('splitWizard.targetCountLabel')}</Text>
            <InputNumber
              value={targetCount}
              onChange={(v) => setTargetCount(v || 3)}
              min={1}
              max={20}
              style={{ width: 120 }}
            />
            <Text type="secondary" className="ml-3">
              {t('splitWizard.targetCountHint')}
            </Text>
          </div>

          <div>
            <Text strong className="block mb-2">{t('splitWizard.strategyLabel')}</Text>
            <Radio.Group
              value={splitStrategy}
              onChange={(e) => setSplitStrategy(e.target.value)}
            >
              <Space orientation="vertical">
                <Radio value="auto">{t('splitWizard.strategyAuto')}</Radio>
                <Radio value="scene">{t('splitWizard.strategyScene')}</Radio>
                <Radio value="chapter">{t('splitWizard.strategyChapter')}</Radio>
              </Space>
            </Radio.Group>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <Text type="secondary">
              {t('splitWizard.scriptLength', { length: script.length })}
            </Text>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={handleCancel}>{t('common:cancel')}</Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleStartAnalysis}
            >
              {t('splitWizard.startAnalysisBtn')}
            </Button>
          </div>
        </div>
      )}

      {/* 步骤2：分析中 */}
      {step === 'analyzing' && (
        <div className="py-12 text-center">
          <Spin size="large" />
          <div className="mt-4">
            <Text>{t('splitWizard.analyzingText')}</Text>
          </div>
          <div className="mt-2">
            <Text type="secondary">{t('splitWizard.analyzingHint')}</Text>
          </div>
        </div>
      )}

      {/* 步骤3：预览 */}
      {step === 'preview' && (
        <div className="space-y-4">
          {analysis && (
            <Card size="small" className="bg-blue-50">
              <Text strong>{t('splitWizard.analysisResultLabel')}</Text>
              <Paragraph className="mt-2 mb-0" type="secondary">
                {analysis.reasoning}
              </Paragraph>
            </Card>
          )}

          <div>
            <Text strong>{t('splitWizard.previewLabel', { count: splitResults.length })}</Text>
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
                    {t('splitWizard.episodeCharCount', { count: item.scriptText.length })}
                  </Text>
                </div>
              </div>
            ))}
          </Flex>

          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={() => setStep('config')}>
              {t('splitWizard.reconfigBtn')}
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleCreateEpisodes}
            >
              {t('splitWizard.confirmCreateBtn')}
            </Button>
          </div>
        </div>
      )}

      {/* 步骤4：创建中 */}
      {step === 'creating' && (
        <div className="py-12 text-center">
          <Spin size="large" />
          <div className="mt-4">
            <Text>{t('splitWizard.creatingText')}</Text>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default EpisodeSplitWizard;
