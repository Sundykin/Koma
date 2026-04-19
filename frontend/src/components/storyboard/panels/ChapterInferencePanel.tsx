/**
 * ChapterInferencePanel - 章节推理面板
 * 批量推理提示词、改写文案，调用 LLM
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Button, Space, Typography, Select, Progress, App, List, Segmented, Tag } from 'antd';
import { ThunderboltOutlined, EditOutlined, CheckOutlined } from '@ant-design/icons';
import { createCreationContext } from '../../../services/CreationContext';
import { ShotPromptService } from '../../../services/ShotPromptService';
import {
  getCreativeOperatorsByPhase,
  resolveCreativeOperatorTemplate,
  resolvePromptTemplate,
} from '../../../store/promptTemplates';
import { loadEpisodeShots, saveEpisodeShots } from '../../../store/projectStore';
import { createLogger } from '../../../store/logger';
import type { StoryboardWorkflowContext } from './workflowSessions';
import {
  resolveStoryboardScope,
  type ChapterInferenceSession,
  type PromptDraftResult,
  type RewriteDraftResult,
  type WorkflowShotScope,
} from './workflowSessions';

const logger = createLogger('ChapterInferencePanel');
const { Text, Title } = Typography;

interface ChapterInferencePanelProps {
  projectId: string;
  episodeId: string;
  storyboardContext: StoryboardWorkflowContext;
  session: ChapterInferenceSession;
  onSessionChange: (updates: Partial<ChapterInferenceSession>) => void;
  onShotsChanged?: () => void;
}

export const ChapterInferencePanel: React.FC<ChapterInferencePanelProps> = ({
  projectId,
  episodeId,
  storyboardContext,
  session,
  onSessionChange,
  onShotsChanged,
}) => {
  const { message } = App.useApp();
  const [inferring, setInferring] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [progress, setProgress] = useState(0);

  const inferenceLevels = useMemo(
    () => getCreativeOperatorsByPhase('storyboard-inference', 'prompt-inference'),
    [],
  );
  const rewriteLevels = useMemo(
    () => getCreativeOperatorsByPhase('batch-rewrite', 'batch-rewrite'),
    [],
  );

  const updateSession = useCallback((updates: Partial<ChapterInferenceSession>) => {
    onSessionChange(updates);
  }, [onSessionChange]);

  const resolveScopeWithShots = useCallback(async () => {
    const shots = await loadEpisodeShots(projectId, episodeId);
    const resolved = resolveStoryboardScope(shots, storyboardContext, session.scope);
    if (resolved.isEmpty) {
      message.warning('当前范围内没有可处理的分镜');
      return null;
    }
    return { shots, resolved };
  }, [episodeId, message, projectId, session.scope, storyboardContext]);

  const handleInferPrompts = useCallback(async () => {
    setInferring(true);
    setProgress(0);
    try {
      const resolvedScope = await resolveScopeWithShots();
      if (!resolvedScope) {
        return;
      }

      const operator = resolveCreativeOperatorTemplate({
        phase: 'storyboard-inference',
        task: 'prompt-inference',
        level: session.templateLevel,
      });

      const ctx = await createCreationContext(projectId, episodeId);
      const service = new ShotPromptService(ctx);
      const drafts: PromptDraftResult[] = [];

      for (let index = 0; index < resolvedScope.resolved.shots.length; index += 1) {
        const shot = resolvedScope.resolved.shots[index];
        const prompts = await service.generateDualShotPrompts(
          shot,
          ctx.characters,
          ctx.styleSnapshot?.ttiStylePrefix || '',
          { image: true, video: true },
          { force: true },
          ctx.styleSnapshot,
        );
        drafts.push({
          shotId: shot.id,
          shotIndex: resolvedScope.shots.findIndex((item) => item.id === shot.id) + 1,
          scriptContent: shot.scriptContent || '',
          imagePrompt: prompts.imagePrompt,
          videoPrompt: prompts.videoPrompt,
          accepted: true,
        });
        setProgress(Math.round(((index + 1) / resolvedScope.resolved.shots.length) * 100));
      }

      updateSession({
        currentStep: 1,
        promptDrafts: drafts,
        rewriteResults: [],
        draftSummary: `暂存 ${drafts.length} 条推理结果`,
        affectedScopeLabel: resolvedScope.resolved.label,
        affectedCount: drafts.length,
        selectedOperatorIds: operator ? [operator.id] : [],
      });
      message.success(`已生成 ${drafts.length} 条提示词草稿`);
    } catch (err: any) {
      logger.error('批量推理失败', err);
      message.error('推理失败: ' + (err.message || '未知错误'));
    } finally {
      setInferring(false);
    }
  }, [episodeId, message, projectId, resolveScopeWithShots, session.templateLevel, updateSession]);

  const handleRewrite = useCallback(async () => {
    setRewriting(true);
    try {
      const resolvedScope = await resolveScopeWithShots();
      if (!resolvedScope) {
        return;
      }

      const operator = resolveCreativeOperatorTemplate({
        phase: 'batch-rewrite',
        task: 'batch-rewrite',
        level: session.templateLevel,
      });
      const ctx = await createCreationContext(projectId, episodeId);
      const shotsWithScript = resolvedScope.resolved.shots.filter((shot) => shot.scriptContent?.trim());

      if (shotsWithScript.length === 0) {
        message.info('当前范围没有可改写的分镜文案');
        return;
      }

      const scriptList = shotsWithScript.map((shot, index) => `${index + 1}. ${shot.scriptContent}`).join('\n');
      const resolvedTemplate = await resolvePromptTemplate('batch_rewrite', { script: scriptList });
      const prompt = operator?.extraInstruction?.trim()
        ? `${resolvedTemplate.prompt}\n\n补充改写要求：\n${operator.extraInstruction.trim()}`
        : resolvedTemplate.prompt;
      const response = await ctx.llmProvider.generateText(prompt);

      const results: RewriteDraftResult[] = shotsWithScript.map((shot) => ({
        shotId: shot.id,
        shotIndex: resolvedScope.shots.findIndex((item) => item.id === shot.id) + 1,
        original: shot.scriptContent || '',
        rewritten: shot.scriptContent || '',
        accepted: true,
      }));

      try {
        const parsed = JSON.parse(response || '[]');
        if (Array.isArray(parsed)) {
          parsed.forEach((item: any) => {
            const index = (item.panel_index || item.index || 0) - 1;
            if (index >= 0 && index < results.length && item.text) {
              results[index].rewritten = item.text;
            }
          });
        }
      } catch {
        const lines = (response || '').split('\n').filter(Boolean);
        lines.forEach((line, index) => {
          if (index < results.length) {
            results[index].rewritten = line.replace(/^\d+\.\s*/, '');
          }
        });
      }

      updateSession({
        currentStep: 1,
        rewriteResults: results,
        promptDrafts: [],
        draftSummary: `暂存 ${results.length} 条改写结果`,
        affectedScopeLabel: resolvedScope.resolved.label,
        affectedCount: results.length,
        selectedOperatorIds: operator ? [operator.id] : [],
      });
      message.success('改写完成，请预览后再应用');
    } catch (err: any) {
      logger.error('批量改写失败', err);
      message.error('改写失败: ' + (err.message || '未知错误'));
    } finally {
      setRewriting(false);
    }
  }, [episodeId, message, projectId, resolveScopeWithShots, session.templateLevel, updateSession]);

  const handleTogglePromptDraft = useCallback((index: number, accepted: boolean) => {
    const nextDrafts = [...session.promptDrafts];
    nextDrafts[index] = { ...nextDrafts[index], accepted };
    updateSession({ promptDrafts: nextDrafts });
  }, [session.promptDrafts, updateSession]);

  const handleToggleRewriteDraft = useCallback((index: number, accepted: boolean) => {
    const nextResults = [...session.rewriteResults];
    nextResults[index] = { ...nextResults[index], accepted };
    updateSession({ rewriteResults: nextResults });
  }, [session.rewriteResults, updateSession]);

  const handleApplyPromptDrafts = useCallback(async () => {
    const acceptedDrafts = session.promptDrafts.filter((item) => item.accepted);
    if (acceptedDrafts.length === 0) {
      message.warning('没有已确认的提示词结果');
      return;
    }
    try {
      const shots = await loadEpisodeShots(projectId, episodeId);
      const updatedShots = shots.map((shot) => {
        const draft = acceptedDrafts.find((item) => item.shotId === shot.id);
        return draft
          ? { ...shot, imagePrompt: draft.imagePrompt, videoPrompt: draft.videoPrompt }
          : shot;
      });
      await saveEpisodeShots(projectId, episodeId, updatedShots);
      updateSession({
        currentStep: 2,
        promptDrafts: [],
        draftSummary: undefined,
        lastApplied: {
          appliedAt: Date.now(),
          summary: `应用 ${acceptedDrafts.length} 条提示词结果`,
          affectedCount: acceptedDrafts.length,
          scopeLabel: session.affectedScopeLabel,
        },
      });
      onShotsChanged?.();
      message.success(`已应用 ${acceptedDrafts.length} 条提示词结果`);
    } catch (err: any) {
      message.error(err?.message || '应用提示词失败');
    }
  }, [episodeId, message, onShotsChanged, projectId, session.affectedScopeLabel, session.promptDrafts, updateSession]);

  const handleApplyRewrites = useCallback(async () => {
    const acceptedResults = session.rewriteResults.filter((item) => item.accepted);
    if (acceptedResults.length === 0) {
      message.warning('没有已确认的改写');
      return;
    }
    try {
      const shots = await loadEpisodeShots(projectId, episodeId);
      const updatedShots = shots.map((shot) => {
        const rewrite = acceptedResults.find((item) => item.shotId === shot.id);
        return rewrite ? { ...shot, scriptContent: rewrite.rewritten } : shot;
      });
      await saveEpisodeShots(projectId, episodeId, updatedShots);
      updateSession({
        currentStep: 2,
        rewriteResults: [],
        draftSummary: undefined,
        lastApplied: {
          appliedAt: Date.now(),
          summary: `应用 ${acceptedResults.length} 条文案改写`,
          affectedCount: acceptedResults.length,
          scopeLabel: session.affectedScopeLabel,
        },
      });
      onShotsChanged?.();
      message.success(`已应用 ${acceptedResults.length} 条改写`);
    } catch (err: any) {
      message.error(err?.message || '应用改写失败');
    }
  }, [episodeId, message, onShotsChanged, projectId, session.affectedScopeLabel, session.rewriteResults, updateSession]);

  const scopeOptions: Array<{ value: WorkflowShotScope; label: string }> = [
    { value: 'current-shot', label: '当前分镜' },
    { value: 'current-chapter', label: '当前章节' },
    { value: 'selected-shots', label: '选中分镜' },
    { value: 'all-shots', label: '全部分镜' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col gap-4">
        <Title level={5} className="!text-zinc-300 !mb-0">章节推理</Title>
        <Text type="secondary">所有结果先暂存为草稿，再按范围应用到分镜。</Text>

        <div className="grid grid-cols-1 gap-3">
          <div className="flex flex-col gap-2">
            <Text className="text-zinc-400 text-xs">作用范围</Text>
            <Segmented
              block
              value={session.scope}
              onChange={(value) => updateSession({ scope: value as WorkflowShotScope })}
              options={scopeOptions}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Text className="text-zinc-400 text-xs">推理档位</Text>
            <Select
              value={session.templateLevel}
              onChange={(value) => updateSession({ templateLevel: value })}
              options={inferenceLevels.map((operator) => ({
                value: operator.level,
                label: `${operator.label} - ${operator.description}`,
              }))}
              className="w-full"
            />
          </div>
        </div>

        <Space direction="vertical" className="w-full">
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={handleInferPrompts} loading={inferring} block>
            生成提示词草稿
          </Button>
          <Button icon={<EditOutlined />} onClick={handleRewrite} loading={rewriting} block>
            生成批量改写草稿
          </Button>
        </Space>

        {(inferring || rewriting) && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 transition-all duration-300">
            <div className="flex justify-between items-center mb-1">
              <Text type="secondary" className="text-xs">{inferring ? '正在推理提示词...' : '正在改写文案...'}</Text>
              <Text className="text-xs text-blue-400">{Math.round(progress)}%</Text>
            </div>
            <Progress percent={progress} size="small" showInfo={false} strokeColor="#3b82f6" />
          </div>
        )}

        {session.affectedScopeLabel && (
          <div className="flex items-center gap-2 text-xs">
            <Tag color="blue" className="m-0">{session.affectedScopeLabel}</Tag>
            {typeof session.affectedCount === 'number' && (
              <Text type="secondary">{session.affectedCount} 条分镜</Text>
            )}
          </div>
        )}

        {session.promptDrafts.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Text className="text-zinc-300 text-xs">
                提示词草稿 ({session.promptDrafts.filter((item) => item.accepted).length}/{session.promptDrafts.length} 已确认)
              </Text>
              <Button size="small" type="primary" onClick={handleApplyPromptDrafts}>
                应用已确认结果
              </Button>
            </div>
            <List
              size="small"
              dataSource={session.promptDrafts}
              renderItem={(item, index) => (
                <List.Item
                  className={`!border-y-zinc-800 !border-r-zinc-800 transition-colors pl-3 ${item.accepted ? 'border-l-2 !border-l-blue-500 bg-zinc-900/30' : 'border-l-2 !border-l-transparent'}`}
                  actions={[
                    <Button
                      key="accept"
                      size="small"
                      type={item.accepted ? 'primary' : 'default'}
                      icon={<CheckOutlined />}
                      onClick={() => handleTogglePromptDraft(index, !item.accepted)}
                    />,
                  ]}
                >
                  <div className="flex flex-col gap-1 w-full min-w-0">
                    <Text type="secondary" className="text-[10px] mb-1">#{item.shotIndex} {item.scriptContent || '暂无文案'}</Text>
                    <div className="border-t border-zinc-800/50 pt-2">
                      <Text className="text-[11px] text-zinc-500 block mb-1">图片提示词</Text>
                      <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{item.imagePrompt || '未生成'}</div>
                    </div>
                    <div className="border-t border-zinc-800/50 pt-2 mt-1">
                      <Text className="text-[11px] text-zinc-500 block mb-1">视频提示词</Text>
                      <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{item.videoPrompt || '未生成'}</div>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </div>
        )}

        {session.rewriteResults.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Text className="text-zinc-300 text-xs">
                改写草稿 ({session.rewriteResults.filter((item) => item.accepted).length}/{session.rewriteResults.length} 已确认)
              </Text>
              <Space>
                <Select
                  value={session.templateLevel}
                  onChange={(value) => updateSession({ templateLevel: value })}
                  size="small"
                  options={rewriteLevels.map((operator) => ({
                    value: operator.level,
                    label: operator.label,
                  }))}
                  className="w-32"
                />
                <Button size="small" type="primary" onClick={handleApplyRewrites}>应用已确认</Button>
              </Space>
            </div>
            <List
              size="small"
              dataSource={session.rewriteResults}
              renderItem={(item, index) => (
                <List.Item
                  className={`!border-y-zinc-800 !border-r-zinc-800 transition-colors pl-3 ${item.accepted ? 'border-l-2 !border-l-blue-500 bg-zinc-900/30' : 'border-l-2 !border-l-transparent'}`}
                  actions={[
                    <Button
                      key="accept"
                      size="small"
                      type={item.accepted ? 'primary' : 'default'}
                      icon={<CheckOutlined />}
                      onClick={() => handleToggleRewriteDraft(index, !item.accepted)}
                    />,
                  ]}
                >
                  <div className="flex flex-col gap-1 w-full min-w-0">
                    <Text type="secondary" className="text-[10px] mb-1">#{item.shotIndex}</Text>
                    <div className="border-t border-zinc-800/50 pt-2">
                      <Text type="secondary" className="text-[10px] line-through block mb-1">{item.original}</Text>
                      <Text className="text-xs text-zinc-300 leading-relaxed block">{item.rewritten}</Text>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
};
