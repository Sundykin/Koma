/**
 * ScriptStudioPanel - 剧本工作室面板
 * 支持文本导入、AI拆分分镜、渐进式处理流程
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Button, Input, Upload, Steps, Space, Typography, App, List, Segmented, Tag } from 'antd';
import { UploadOutlined, ScissorOutlined, CheckOutlined, DeleteOutlined, MergeCellsOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { Shot } from '../../../types';
import { createCreationContext } from '../../../services/CreationContext';
import {
  getCreativeOperator,
  getCreativeOperatorsByPhase,
  resolvePromptTemplate,
} from '../../../store/promptTemplates';
import { saveEpisodeShots, loadEpisodeShots } from '../../../store/projectStore';
import { createLogger } from '../../../store/logger';
import type { ScriptStudioSession } from './workflowSessions';
import { createDefaultScriptStudioSession } from './workflowSessions';

const logger = createLogger('ScriptStudioPanel');
const { TextArea } = Input;
const { Text, Title } = Typography;

interface ScriptStudioPanelProps {
  projectId: string;
  episodeId: string;
  session: ScriptStudioSession;
  onSessionChange: (updates: Partial<ScriptStudioSession>) => void;
  onShotsImported?: () => void;
}

const STEPS = [
  { key: 'import', title: '导入文本' },
  { key: 'refine', title: '内容精炼' },
  { key: 'chapter', title: '章节划分' },
  { key: 'split', title: '拆分分镜' },
  { key: 'confirm', title: '确认写入' },
];

function createEmptyShot(scriptContent: string): Shot {
  return {
    id: uuidv4(),
    scriptContent,
    imagePrompt: '',
    videoPrompt: '',
    duration: 5,
    shotType: 'medium',
    cameraMovement: 'static',
    characters: [],
    scenes: [],
    props: [],
    confirmed: false,
  };
}

export const ScriptStudioPanel: React.FC<ScriptStudioPanelProps> = ({
  projectId,
  episodeId,
  session,
  onSessionChange,
  onShotsImported,
}) => {
  const { message } = App.useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingPreview, setStreamingPreview] = useState<string>('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const refineOperators = useMemo(() => getCreativeOperatorsByPhase('script-refine'), []);
  const chapterOperators = useMemo(() => getCreativeOperatorsByPhase('chapter-division'), []);

  const currentStep = session.currentStep ?? 0;
  const scriptText = session.scriptText ?? '';
  const splitResults = session.splitResults ?? [];
  const applyMode = session.applyMode ?? 'append';

  const updateSession = useCallback((updates: Partial<ScriptStudioSession>) => {
    onSessionChange(updates);
  }, [onSessionChange]);

  const trackOperator = useCallback((operatorId: string) => {
    updateSession({
      selectedOperatorIds: Array.from(new Set([...(session.selectedOperatorIds || []), operatorId])),
    });
  }, [session.selectedOperatorIds, updateSession]);

  const handleFileImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      updateSession({
        scriptText: text,
        currentStep: Math.max(currentStep, 1),
        draftSummary: `已导入 ${text.trim().length} 字原文`,
      });
      message.success(`已导入 ${file.name}`);
    };
    reader.readAsText(file);
    return false;
  }, [currentStep, message, updateSession]);

  const handleNextStep = useCallback(() => {
    updateSession({ currentStep: Math.min(currentStep + 1, STEPS.length - 1) });
  }, [currentStep, updateSession]);

  const handleSkipToSplit = useCallback(() => {
    updateSession({ currentStep: 3 });
  }, [updateSession]);

  const handleRefine = useCallback(async (operatorId: string) => {
    const operator = getCreativeOperator(operatorId);
    if (!scriptText.trim() || !operator?.templateType) {
      return;
    }

    setIsProcessing(true);
    setStreamingPreview('');
    try {
      const ctx = await createCreationContext(projectId, episodeId);
      const resolved = await resolvePromptTemplate(operator.templateType, { script: scriptText });

      // 优先使用流式调用（无超时限制），降级为普通调用
      let response: string;
      if (ctx.llmProvider.generateTextStream) {
        response = await ctx.llmProvider.generateTextStream(
          resolved.prompt,
          undefined,
          { source: 'script-studio', operation: 'refine' },
          (_delta, accumulated) => {
            setStreamingPreview(accumulated);
          },
        );
      } else {
        response = await ctx.llmProvider.generateText(resolved.prompt);
      }

      setStreamingPreview('');
      updateSession({
        scriptText: response || scriptText,
        refinedPreview: response || scriptText,
        currentStep: Math.max(currentStep, 2),
        draftSummary: `${operator.label} 已更新文本`,
      });
      trackOperator(operatorId);
      message.success(`${operator.label}完成`);
    } catch (err: any) {
      logger.error(`内容精炼失败 (${operatorId})`, err);
      message.error('处理失败: ' + (err.message || '未知错误'));
    } finally {
      setIsProcessing(false);
      setStreamingPreview('');
    }
  }, [currentStep, episodeId, message, projectId, scriptText, trackOperator, updateSession]);

  const handleChapterDivision = useCallback(async (operatorId: string) => {
    const operator = getCreativeOperator(operatorId);
    if (!scriptText.trim() || !operator?.templateType) {
      return;
    }

    setIsProcessing(true);
    setStreamingPreview('');
    try {
      const ctx = await createCreationContext(projectId, episodeId);
      const resolved = await resolvePromptTemplate(operator.templateType, { script: scriptText });

      let response: string;
      if (ctx.llmProvider.generateTextStream) {
        response = await ctx.llmProvider.generateTextStream(
          resolved.prompt,
          undefined,
          { source: 'script-studio', operation: 'chapter-division' },
          (_delta, accumulated) => {
            setStreamingPreview(accumulated);
          },
        );
      } else {
        response = await ctx.llmProvider.generateText(resolved.prompt);
      }

      setStreamingPreview('');
      updateSession({
        scriptText: response || scriptText,
        chapterPreview: response || scriptText,
        currentStep: Math.max(currentStep, 3),
        draftSummary: `${operator.label} 已生成章节预览`,
      });
      trackOperator(operatorId);
      message.success('章节划分完成');
    } catch (err: any) {
      logger.error('章节划分失败', err);
      message.error('划分失败: ' + (err.message || '未知错误'));
    } finally {
      setIsProcessing(false);
      setStreamingPreview('');
    }
  }, [currentStep, episodeId, message, projectId, scriptText, trackOperator, updateSession]);

  const handleAISplit = useCallback(async () => {
    if (!scriptText.trim()) {
      return;
    }
    setIsProcessing(true);
    setStreamingPreview('');
    try {
      const ctx = await createCreationContext(projectId, episodeId);
      const resolved = await resolvePromptTemplate('shot_breakdown', {
        script: scriptText,
        characters: '无',
        scenes: '无',
        props: '无',
      });

      let response: string;
      if (ctx.llmProvider.generateTextStream) {
        response = await ctx.llmProvider.generateTextStream(
          resolved.prompt,
          undefined,
          { source: 'script-studio', operation: 'shot-breakdown' },
          (_delta, accumulated) => {
            setStreamingPreview(accumulated);
          },
        );
      } else {
        response = await ctx.llmProvider.generateText(resolved.prompt);
      }

      setStreamingPreview('');
      let nextResults: string[] = [];

      try {
        const jsonBlock = response.match(/```json\s*([\s\S]*?)```/i)?.[1] || response;
        const parsed = JSON.parse(jsonBlock);
        const shots = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.shots)
            ? parsed.shots
            : [];
        nextResults = shots
          .map((item: any) => item?.scriptContent || item?.text || '')
          .map((text: string) => text.trim())
          .filter(Boolean);
      } catch {
        nextResults = [];
      }

      if (nextResults.length === 0) {
        const lines = response.split('\n').map(line => line.trim()).filter(Boolean);
        nextResults = lines.length > 0 ? lines : [response];
      }

      updateSession({
        splitResults: nextResults,
        currentStep: 4,
        draftSummary: `暂存 ${nextResults.length} 条分镜草稿`,
        affectedCount: nextResults.length,
      });
      message.success(`已拆分为 ${nextResults.length} 个分镜`);
    } catch (err: any) {
      logger.error('AI 分镜拆分失败', err);
      const fallbackResults = scriptText.split('\n').map(line => line.trim()).filter(Boolean);
      updateSession({
        splitResults: fallbackResults,
        currentStep: 4,
        draftSummary: `按文本行回退拆分 ${fallbackResults.length} 条`,
        affectedCount: fallbackResults.length,
      });
      message.warning('AI 拆分失败，已按行拆分');
    } finally {
      setIsProcessing(false);
      setStreamingPreview('');
    }
  }, [episodeId, message, projectId, scriptText, updateSession]);

  const handleDeleteSplit = useCallback((index: number) => {
    const nextResults = splitResults.filter((_, itemIndex) => itemIndex !== index);
    updateSession({
      splitResults: nextResults,
      draftSummary: nextResults.length > 0 ? `暂存 ${nextResults.length} 条分镜草稿` : undefined,
      affectedCount: nextResults.length,
    });
  }, [splitResults, updateSession]);

  const handleMergeSplit = useCallback((index: number) => {
    if (index >= splitResults.length - 1) {
      return;
    }
    const nextResults = [...splitResults];
    nextResults[index] = `${nextResults[index]}\n${nextResults[index + 1]}`;
    nextResults.splice(index + 1, 1);
    updateSession({
      splitResults: nextResults,
      draftSummary: `暂存 ${nextResults.length} 条分镜草稿`,
      affectedCount: nextResults.length,
    });
  }, [splitResults, updateSession]);

  const handleEditSplit = useCallback((index: number, value: string) => {
    const nextResults = [...splitResults];
    nextResults[index] = value;
    updateSession({ splitResults: nextResults });
    setEditingIndex(null);
  }, [splitResults, updateSession]);

  const handleConfirmImport = useCallback(async () => {
    if (splitResults.length === 0) {
      message.warning('没有可导入的分镜数据');
      return;
    }
    setIsProcessing(true);
    try {
      const existingShots = applyMode === 'replace' ? [] : await loadEpisodeShots(projectId, episodeId);
      const newShots = splitResults.map(text => createEmptyShot(text));
      const allShots = [...existingShots, ...newShots];
      await saveEpisodeShots(projectId, episodeId, allShots);
      message.success(applyMode === 'replace'
        ? `已替换为 ${newShots.length} 个分镜`
        : `已导入 ${newShots.length} 个分镜`);
      onSessionChange({
        ...createDefaultScriptStudioSession(),
        applyMode,
        lastApplied: {
          appliedAt: Date.now(),
          summary: applyMode === 'replace'
            ? `替换写入 ${newShots.length} 条分镜`
            : `追加写入 ${newShots.length} 条分镜`,
          affectedCount: newShots.length,
          scopeLabel: applyMode === 'replace' ? '替换本集分镜' : '追加到现有分镜',
        },
      });
      onShotsImported?.();
    } catch (err: any) {
      logger.error('导入分镜失败', err);
      message.error('导入失败: ' + (err.message || '未知错误'));
    } finally {
      setIsProcessing(false);
    }
  }, [applyMode, episodeId, message, onSessionChange, onShotsImported, projectId, splitResults]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 border-b border-zinc-800">
        <Steps
          current={currentStep}
          size="small"
          onChange={(step) => updateSession({ currentStep: step })}
          items={STEPS.map(step => ({ title: step.title }))}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">写入策略</span>
          <Segmented
            size="small"
            value={applyMode}
            onChange={(value) => updateSession({ applyMode: value as ScriptStudioSession['applyMode'] })}
            options={[
              { label: '追加到现有分镜', value: 'append' },
              { label: '替换本集分镜', value: 'replace' },
            ]}
          />
          {session.lastApplied && (
            <Tag className="m-0 border-zinc-700 bg-zinc-950 text-zinc-300">
              最近写入: {session.lastApplied.summary}
            </Tag>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {currentStep === 0 && (
          <div className="flex flex-col gap-4">
            <Title level={5} className="!text-zinc-300 !mb-0">导入剧本文本</Title>
            <TextArea
              value={scriptText}
              onChange={e => updateSession({ scriptText: e.target.value })}
              placeholder="粘贴剧本文本到这里..."
              rows={12}
              className="bg-zinc-900 border-zinc-700"
            />
            <Space>
              <Upload accept=".txt,.md,.srt" showUploadList={false} beforeUpload={handleFileImport}>
                <Button icon={<UploadOutlined />}>导入文件</Button>
              </Upload>
              <Text type="secondary">支持 .txt .md .srt</Text>
            </Space>
          </div>
        )}

        {currentStep === 1 && (
          <div className="flex flex-col gap-4">
            <Title level={5} className="!text-zinc-300 !mb-0">内容精炼（可选）</Title>
            <Text type="secondary">先把原文整理成更适合拆分分镜的素材。</Text>
            <Space wrap>
              {refineOperators.map((operator) => (
                <Button key={operator.id} onClick={() => handleRefine(operator.id)} loading={isProcessing}>
                  {operator.label}
                </Button>
              ))}
            </Space>
            <Button type="link" onClick={handleSkipToSplit}>跳过，直接拆分分镜</Button>
            {isProcessing && streamingPreview ? (
              <div className="relative">
                <TextArea value={streamingPreview} readOnly rows={10} className="bg-zinc-950 border-zinc-700 text-zinc-400" />
                <Text type="secondary" className="absolute bottom-2 right-3 text-[11px]">生成中…</Text>
              </div>
            ) : (
              <TextArea value={scriptText} onChange={e => updateSession({ scriptText: e.target.value })} rows={10} className="bg-zinc-900 border-zinc-700" />
            )}
          </div>
        )}

        {currentStep === 2 && (
          <div className="flex flex-col gap-4">
            <Title level={5} className="!text-zinc-300 !mb-0">章节划分（可选）</Title>
            <Text type="secondary">长文本建议先切出章节块，再进入拆分和推理。</Text>
            <Space wrap>
              {chapterOperators.map((operator) => (
                <Button key={operator.id} onClick={() => handleChapterDivision(operator.id)} loading={isProcessing}>
                  {operator.label}
                </Button>
              ))}
            </Space>
            <Button type="link" onClick={handleSkipToSplit}>跳过，直接拆分分镜</Button>
            {isProcessing && streamingPreview ? (
              <div className="relative">
                <TextArea value={streamingPreview} readOnly rows={8} className="bg-zinc-950 border-zinc-700 text-zinc-400" />
                <Text type="secondary" className="absolute bottom-2 right-3 text-[11px]">生成中…</Text>
              </div>
            ) : (
              <TextArea value={scriptText} onChange={e => updateSession({ scriptText: e.target.value })} rows={8} className="bg-zinc-900 border-zinc-700" />
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="flex flex-col gap-4">
            <Title level={5} className="!text-zinc-300 !mb-0">拆分为分镜</Title>
            <Text type="secondary">先生成暂存分镜草稿，再到下一步预览和确认。</Text>
            <Button type="primary" icon={<ScissorOutlined />} onClick={handleAISplit} loading={isProcessing} disabled={!scriptText.trim()}>
              AI 拆分分镜
            </Button>
            {isProcessing && streamingPreview ? (
              <div className="relative">
                <TextArea value={streamingPreview} readOnly rows={8} className="bg-zinc-950 border-zinc-700 text-zinc-400 font-mono text-xs" />
                <Text type="secondary" className="absolute bottom-2 right-3 text-[11px]">拆分中…</Text>
              </div>
            ) : splitResults.length > 0 ? (
              <Text type="secondary">已暂存 {splitResults.length} 个分镜草稿</Text>
            ) : null}
          </div>
        )}

        {currentStep === 4 && (
          <div className="flex flex-col gap-4">
            <Title level={5} className="!text-zinc-300 !mb-0">确认并写入</Title>
            <Text type="secondary">
              当前为 {applyMode === 'replace' ? '替换本集分镜' : '追加到现有分镜'} 模式，共 {splitResults.length} 个暂存分镜。
            </Text>
            <List
              size="small"
              dataSource={splitResults}
              renderItem={(item, index) => (
                <List.Item
                  className="!border-zinc-800"
                  actions={[
                    <Button key="merge" size="small" type="text" icon={<MergeCellsOutlined />} disabled={index >= splitResults.length - 1} onClick={() => handleMergeSplit(index)} />,
                    <Button key="delete" size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDeleteSplit(index)} />,
                  ]}
                >
                  <div className="flex items-start gap-2 w-full min-w-0">
                    <span className="text-zinc-500 text-xs shrink-0">#{index + 1}</span>
                    {editingIndex === index ? (
                      <TextArea
                        autoFocus
                        defaultValue={item}
                        rows={2}
                        className="bg-zinc-900 border-zinc-700 text-xs"
                        onBlur={(event) => handleEditSplit(index, event.target.value)}
                      />
                    ) : (
                      <Text className="text-xs text-zinc-300 cursor-pointer hover:text-zinc-100 flex-1 min-w-0" onClick={() => setEditingIndex(index)}>
                        {item.length > 100 ? `${item.slice(0, 100)}...` : item}
                      </Text>
                    )}
                  </div>
                </List.Item>
              )}
            />
            <Button type="primary" icon={<CheckOutlined />} onClick={handleConfirmImport} loading={isProcessing} disabled={splitResults.length === 0} block>
              确认写入 ({splitResults.length} 个分镜)
            </Button>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-zinc-800 flex justify-between shrink-0">
        <Button disabled={currentStep === 0} onClick={() => updateSession({ currentStep: Math.max(0, currentStep - 1) })}>上一步</Button>
        <Button type="primary" disabled={currentStep === STEPS.length - 1 || (currentStep === 0 && !scriptText.trim())} onClick={handleNextStep}>下一步</Button>
      </div>
    </div>
  );
};
