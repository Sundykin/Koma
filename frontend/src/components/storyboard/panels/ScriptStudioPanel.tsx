/**
 * ScriptStudioPanel - 剧本工作室面板
 * 支持文本导入、AI拆分分镜、渐进式处理流程
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Upload, Steps, Space, Typography, App, List, Segmented, Tag, InputNumber, Slider, Progress, Card, Collapse, Spin } from 'antd';
import { UploadOutlined, ScissorOutlined, CheckOutlined, DeleteOutlined, MergeCellsOutlined, CheckCircleOutlined, ExclamationCircleOutlined, ClockCircleOutlined, RobotOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { Shot } from '../../../types';
import { createCreationContext } from '../../../services/CreationContext';
import {
  getCreativeOperator,
  getCreativeOperatorsByPhase,
  resolvePromptTemplate,
} from '../../../store/promptTemplates';
import {
  createEpisode,
  listEpisodes,
  loadEpisodeShots,
  saveEpisode,
  saveEpisodeShots,
} from '../../../store/projectStore';
import { createLogger } from '../../../store/logger';
import type { ScriptStudioSession } from './workflowSessions';
import { createDefaultScriptStudioSession } from './workflowSessions';
import { planChapters } from '../../../services/chapterPlanning';
import type { ChapterPlanningMode, ChapterPlanningProgress, ChapterPlanningStage, ChapterPreview } from '../../../services/chapterPlanning';
import { detectExplicitEpisodeBoundaries } from '../../../services/episodeBoundaryDetector';
import { detectEpisodeBoundaries } from '../../../services/episodeBoundaries';
import type { PipelineSource } from '../../../services/episodeBoundaries';
import { partitionScriptByEpisodeBoundaries } from '../../../services/episodeBoundarySplit';

const logger = createLogger('ScriptStudioPanel');
const { TextArea } = Input;
const { Text, Title } = Typography;

interface ScriptStudioPanelProps {
  projectId: string;
  episodeId: string;
  session: ScriptStudioSession;
  onSessionChange: (updates: Partial<ScriptStudioSession>) => void;
  onShotsImported?: () => void;
  onEpisodesChanged?: (preferredEpisodeId?: string) => void;
}

const STEPS = [
  { key: 'import', title: '导入文本' },
  { key: 'refine', title: '内容精炼' },
  { key: 'chapter', title: '章节划分' },
  { key: 'split', title: '拆分分镜' },
  { key: 'confirm', title: '确认写入' },
];

/** 章节规划管线阶段信息映射 */
const PLANNING_STAGES: Array<{
  stage: ChapterPlanningStage;
  title: string;
  description: string;
}> = [
  { stage: 'building-units', title: '构建单元', description: '分析剧本结构' },
  { stage: 'summarizing', title: '生成摘要', description: 'AI 为每集生成摘要' },
  { stage: 'scoring-candidates', title: '评估切点', description: '多维度评分候选切点' },
  { stage: 'llm-selecting', title: 'AI 选择', description: 'AI 选择最佳章节边界' },
  { stage: 'validating', title: '校验修复', description: '校验结果并自动修复' },
  { stage: 'materializing', title: '生成预览', description: '构建章节预览数据' },
];

function getPlanningStepIndex(stage: ChapterPlanningStage | undefined): number {
  if (!stage) return -1;
  if (stage === 'done') return PLANNING_STAGES.length;
  if (stage === 'error') return -1;
  if (stage === 'detecting-boundaries') return 0;
  const idx = PLANNING_STAGES.findIndex(s => s.stage === stage);
  return idx >= 0 ? idx : -1;
}

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

/** 根据总集数推算默认每章集数 */
function defaultEpisodesPerChapter(totalEpisodes: number): number {
  if (totalEpisodes <= 12) return 3;
  if (totalEpisodes <= 30) return 5;
  if (totalEpisodes <= 60) return 8;
  if (totalEpisodes <= 100) return 10;
  return 15;
}

export const ScriptStudioPanel: React.FC<ScriptStudioPanelProps> = ({
  projectId,
  episodeId,
  session,
  onSessionChange,
  onShotsImported,
  onEpisodesChanged,
}) => {
  const { message } = App.useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingPreview, setStreamingPreview] = useState<string>('');
  const [planningProgress, setPlanningProgress] = useState<ChapterPlanningProgress | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const refineOperators = useMemo(() => getCreativeOperatorsByPhase('script-refine'), []);

  const currentStep = session.currentStep ?? 0;
  const scriptText = session.scriptText ?? '';
  const splitResults = session.splitResults ?? [];
  const applyMode = session.applyMode ?? 'append';
  const chapterPreview = session.chapterPreview;
  const episodesPerChapter = session.episodesPerChapter;
  const chapterPlanningResult = session.chapterPlanningResult;
  const episodeDrafts = session.episodeDrafts ?? [];

  // ─── 集边界检测（同步 regex 即时显示 + 异步 LLM 后台增强） ───
  const [detectionStatus, setDetectionStatus] = useState<'idle' | 'extracting' | 'done' | 'failed'>('idle');
  const [detectionSource, setDetectionSource] = useState<PipelineSource>('none');
  const abortRef = useRef<AbortController | null>(null);

  // 同步 regex 快路径（即时展示）
  const regexDetectedEpisodes = useMemo(() => {
    if (!scriptText) return [];
    const boundaries = detectExplicitEpisodeBoundaries(scriptText);
    return boundaries.map((b, i) => ({
      index: b.episodeNumber ?? i + 1,
      name: b.title,
      lineStart: scriptText.substring(0, b.start).split('\n').length,
    }));
  }, [scriptText]);

  // 实际使用的检测结果（session 有缓存用缓存，否则用 regex）
  const autoDetectedEpisodes = session.detectedBoundaries && session.detectedBoundaries.length > 0
    ? session.detectedBoundaries.map((b, i) => ({
      index: b.episodeNumber ?? i + 1,
      name: b.title,
      lineStart: scriptText.substring(0, b.start).split('\n').length,
    }))
    : regexDetectedEpisodes;

  // 异步 LLM 管线（后台运行，只在 regex 不够确信时启动）
  useEffect(() => {
    // regex 已经检测到足够多集 → 不需要 LLM
    if (regexDetectedEpisodes.length >= 2) {
      setDetectionStatus('done');
      setDetectionSource('regex');
      // 把 regex 结果写入 session
      if (!session.detectedBoundaries) {
        const boundaries = detectExplicitEpisodeBoundaries(scriptText);
        updateSession({ detectedBoundaries: boundaries, detectionStatus: 'done', detectionSource: 'regex' });
      }
      return;
    }

    if (!scriptText || scriptText.length < 50) {
      setDetectionStatus('idle');
      setDetectionSource('none');
      return;
    }

    // 取消之前的检测
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      setDetectionStatus('extracting');
      try {
        const ctx = await createCreationContext(projectId, episodeId);
        const result = await detectEpisodeBoundaries(scriptText, {
          provider: ctx.llmProvider,
          callOptions: { source: 'script-studio', operation: 'episode-detection' },
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setDetectionSource(result.source);
        if (result.boundaries.length > 0) {
          updateSession({
            detectedBoundaries: result.boundaries,
            detectionStatus: 'done',
            detectionSource: result.source === 'regex' || result.source === 'regex-fallback' ? 'regex' : 'llm',
          });
          setDetectionStatus('done');
        } else {
          setDetectionStatus('done');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.error('LLM 集边界检测失败', err);
        setDetectionStatus('failed');
      }
    }, 1500); // debounce

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptText]);

  const totalEpisodes = autoDetectedEpisodes.length;
  const effectiveEpisodesPerChapter = episodesPerChapter ?? defaultEpisodesPerChapter(totalEpisodes);
  const suggestedChapters = totalEpisodes > 0 ? Math.max(1, Math.ceil(totalEpisodes / effectiveEpisodesPerChapter)) : 0;

  const resolvedChapters: ChapterPreview[] | null = useMemo(() => {
    if (chapterPlanningResult?.chapters && chapterPlanningResult.chapters.length > 0) {
      return chapterPlanningResult.chapters;
    }
    if (!chapterPreview) return null;
    try {
      const parsed = JSON.parse(chapterPreview);
      if (Array.isArray(parsed)) {
        return parsed.map((ch: any, index: number) => ({
          chapterIndex: index + 1,
          title: ch.title || `第${index + 1}章`,
          startUnitIndex: 0,
          endUnitIndex: 0,
          unitLabels: [],
          plotSummary: ch.plot || '',
          charCount: 0,
          startOffset: 0,
          endOffset: 0,
          _legacy: true,
          _startEpisode: ch.start_episode,
          _endEpisode: ch.end_episode,
          _start: ch.start,
          _end: ch.end,
        } as ChapterPreview & { _legacy?: boolean; _startEpisode?: number; _endEpisode?: number; _start?: number; _end?: number }));
      }
    } catch { }
    return null;
  }, [chapterPlanningResult, chapterPreview]);

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

  /** Plan C: 智能章节规划（规则候选切点 + LLM 选边界） */
  const handleSmartChapterPlanning = useCallback(async (mode: ChapterPlanningMode) => {
    if (!scriptText.trim()) return;

    setIsProcessing(true);
    setPlanningProgress(null);

    try {
      const ctx = await createCreationContext(projectId, episodeId);
      const perChapter = effectiveEpisodesPerChapter;
      const targetChapters = suggestedChapters > 0 ? suggestedChapters : undefined;

      const result = await planChapters({
        script: scriptText,
        config: {
          mode,
          targetChapters,
          unitsPerChapter: perChapter,
          minUnitsPerChapter: 2,
          maxUnitsPerChapter: 30,
        },
        provider: ctx.llmProvider,
        callOptions: {
          source: 'script-studio',
          operation: 'chapter-planning',
        },
        overrideBoundaries: session.detectedBoundaries,
        onProgress: (progress) => {
          setPlanningProgress(progress);
        },
      });

      updateSession({
        chapterPlanningResult: result,
        chapterPreview: JSON.stringify(result.chapters.map(ch => ({
          title: ch.title,
          plot: ch.plotSummary,
          start_unit: ch.startUnitIndex,
          end_unit: ch.endUnitIndex,
        }))),
        currentStep: Math.max(currentStep, 3),
        draftSummary: `已生成 ${result.chapters.length} 章${result.usedFallback ? '（降级）' : ''}`,
      });

      message.success(`智能划分完成: ${result.chapters.length} 章`);
    } catch (err: any) {
      logger.error('智能章节规划失败', err);
      message.error('规划失败: ' + (err.message || '未知错误'));
    } finally {
      setIsProcessing(false);
      setTimeout(() => setPlanningProgress(null), 600);
    }
  }, [currentStep, effectiveEpisodesPerChapter, episodeId, message, projectId, scriptText, session.detectedBoundaries, suggestedChapters, updateSession]);

  const handleAISplit = useCallback(async () => {
    if (!scriptText.trim()) {
      return;
    }
    setIsProcessing(true);
    setStreamingPreview('');
    try {
      const ctx = await createCreationContext(projectId, episodeId);

      // ─── 辅助函数：解析单段 LLM 响应为分镜文本数组 ───
      const parseShotResponse = (response: string): string[] => {
        try {
          const jsonBlock = response.match(/```json\s*([\s\S]*?)```/i)?.[1] || response;
          const parsed = JSON.parse(jsonBlock);
          const shots = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.shots)
              ? parsed.shots
              : [];
          const results = shots
            .map((item: any) => item?.scriptContent || item?.text || '')
            .map((text: string) => text.trim())
            .filter(Boolean);
          if (results.length > 0) return results;
        } catch { /* JSON parse failed, fallback below */ }
        // fallback: 按行拆分
        const lines = response.split('\n').map(line => line.trim()).filter(Boolean);
        return lines.length > 0 ? lines : [response];
      };

      // ─── 辅助函数：对单段文本调用 LLM 拆分分镜 ───
      const splitChunk = async (chunkScript: string, label: string): Promise<string[]> => {
        const resolved = await resolvePromptTemplate('shot_breakdown', {
          script: chunkScript,
          characters: '无',
          scenes: '无',
          props: '无',
        });

        let response: string;
        if (ctx.llmProvider.generateTextStream) {
          response = await ctx.llmProvider.generateTextStream(
            resolved.prompt,
            undefined,
            { source: 'script-studio', operation: 'shot-breakdown', disableChunking: true },
            (_delta, accumulated) => {
              setStreamingPreview(`${label}\n\n${accumulated}`);
            },
          );
        } else {
          response = await ctx.llmProvider.generateText(resolved.prompt);
        }
        return parseShotResponse(response);
      };

      let nextResults: string[] = [];
      let nextEpisodeDrafts: NonNullable<ScriptStudioSession['episodeDrafts']> | undefined;

      const chapters = resolvedChapters ?? [];
      const repairedChapters = chapters.length > 0 ? chapters.map((ch, idx) => {
        const isValid = ch.startOffset != null && ch.endOffset != null && ch.endOffset > ch.startOffset;
        if (isValid) return ch;

        const prevEnd = idx > 0 ? chapters[idx - 1].endOffset : 0;
        const nextStart = idx < chapters.length - 1 ? chapters[idx + 1].startOffset : scriptText.length;
        const repairedStart = (prevEnd != null && prevEnd > 0) ? prevEnd : 0;
        const repairedEnd = (nextStart != null && nextStart > repairedStart) ? nextStart : scriptText.length;

        logger.warn(`章节 ${idx + 1} "${ch.title}" offset 无效 (${ch.startOffset}-${ch.endOffset})，已推算为 ${repairedStart}-${repairedEnd}`);
        return { ...ch, startOffset: repairedStart, endOffset: repairedEnd };
      }) : [];
      const chapterSegments = repairedChapters
        .filter(ch => ch.endOffset > ch.startOffset)
        .map((ch, index) => ({
          episodeNumber: ch.chapterIndex || index + 1,
          title: (ch.title || `第${index + 1}集`).trim(),
          scriptText: scriptText.slice(ch.startOffset, ch.endOffset).trim(),
        }))
        .filter(segment => segment.scriptText.length > 0);

      const multiEpisodeSegments = chapterSegments.length > 0
        ? chapterSegments
        : (session.detectedBoundaries && session.detectedBoundaries.length > 1
          ? partitionScriptByEpisodeBoundaries(scriptText, session.detectedBoundaries)
          : []);

      if (multiEpisodeSegments.length > 1) {
        nextEpisodeDrafts = [];

        for (let i = 0; i < multiEpisodeSegments.length; i++) {
          const segment = multiEpisodeSegments[i];
          const label = `[第 ${i + 1}/${multiEpisodeSegments.length} 集] ${segment.title}`;
          setStreamingPreview(`${label}\n\n准备中…`);

          const episodeShots = await splitChunk(segment.scriptText, label);
          nextEpisodeDrafts.push({
            episodeNumber: segment.episodeNumber,
            title: segment.title,
            scriptText: segment.scriptText,
            splitResults: episodeShots,
          });
          nextResults.push(...episodeShots);
          setStreamingPreview(`已完成 ${i + 1}/${multiEpisodeSegments.length} 集，累计 ${nextResults.length} 个分镜`);
        }
      } else {
        logger.info('拆分前诊断', {
          resolvedChaptersCount: chapters.length,
          usableChapterSegments: chapterSegments.length,
          hasPlanC: !!chapterPlanningResult?.chapters?.length,
          hasLegacyPreview: !!chapterPreview,
          offsets: chapters.map(ch => ({ title: ch.title, start: ch.startOffset, end: ch.endOffset })),
        });

        if (chapterSegments.length === 1) {
          nextResults = await splitChunk(chapterSegments[0].scriptText, `[第 1/1 集] ${chapterSegments[0].title}`);
        } else {
          logger.warn('无有效章节结果，fallback 到整文拆分');
          nextResults = await splitChunk(scriptText, '[整文拆分]');
        }
      }

      setStreamingPreview('');

      if (nextResults.length === 0) {
        const lines = scriptText.split('\n').map(line => line.trim()).filter(Boolean);
        nextResults = lines.length > 0 ? lines : [scriptText];
      }

      updateSession({
        splitResults: nextResults,
        episodeDrafts: nextEpisodeDrafts,
        currentStep: 4,
        draftSummary: `暂存 ${nextResults.length} 条分镜草稿`,
        affectedCount: nextResults.length,
      });
      message.success(nextEpisodeDrafts && nextEpisodeDrafts.length > 1
        ? `已按 ${nextEpisodeDrafts.length} 集拆分，共 ${nextResults.length} 个分镜`
        : `已拆分为 ${nextResults.length} 个分镜`);
    } catch (err: any) {
      logger.error('AI 分镜拆分失败', err);
      const fallbackResults = scriptText.split('\n').map(line => line.trim()).filter(Boolean);
      updateSession({
        splitResults: fallbackResults,
        episodeDrafts: undefined,
        currentStep: 4,
        draftSummary: `按文本行回退拆分 ${fallbackResults.length} 条`,
        affectedCount: fallbackResults.length,
      });
      message.warning('AI 拆分失败，已按行拆分');
    } finally {
      setIsProcessing(false);
      setStreamingPreview('');
    }
  }, [chapterPlanningResult, chapterPreview, episodeId, message, projectId, resolvedChapters, scriptText, session.detectedBoundaries, updateSession]);

  const handleDeleteSplit = useCallback((index: number) => {
    const nextResults = splitResults.filter((_, itemIndex) => itemIndex !== index);
    updateSession({
      splitResults: nextResults,
      episodeDrafts: undefined,
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
      episodeDrafts: undefined,
      draftSummary: `暂存 ${nextResults.length} 条分镜草稿`,
      affectedCount: nextResults.length,
    });
  }, [splitResults, updateSession]);

  const handleEditSplit = useCallback((index: number, value: string) => {
    const nextResults = [...splitResults];
    nextResults[index] = value;
    updateSession({ splitResults: nextResults, episodeDrafts: undefined });
    setEditingIndex(null);
  }, [splitResults, updateSession]);

  const handleConfirmImport = useCallback(async () => {
    if (splitResults.length === 0) {
      message.warning('没有可导入的分镜数据');
      return;
    }
    setIsProcessing(true);
    try {
      if (episodeDrafts.length > 1) {
        const existingEpisodes = await listEpisodes(projectId);
        const episodeByNumber = new Map(existingEpisodes.map(item => [item.number, item]));

        for (let index = 0; index < episodeDrafts.length; index++) {
          const draft = episodeDrafts[index];
          let targetEpisode = index === 0
            ? existingEpisodes.find(item => item.id === episodeId) || null
            : episodeByNumber.get(draft.episodeNumber) || null;

          if (!targetEpisode) {
            targetEpisode = await createEpisode(projectId, {
              number: draft.episodeNumber,
              title: draft.title,
              scriptText: draft.scriptText,
              status: 'script',
            });
            episodeByNumber.set(targetEpisode.number, targetEpisode);
          }

          await saveEpisode(projectId, targetEpisode.id, {
            title: draft.title,
            scriptText: draft.scriptText,
            status: 'storyboard',
          });

          const existingShots = applyMode === 'replace' ? [] : await loadEpisodeShots(projectId, targetEpisode.id);
          const newShots = draft.splitResults.map(text => createEmptyShot(text));
          await saveEpisodeShots(projectId, targetEpisode.id, [...existingShots, ...newShots]);
        }

        message.success(`已按 ${episodeDrafts.length} 集写入分镜`);
        onSessionChange({
          ...createDefaultScriptStudioSession(),
          applyMode,
          lastApplied: {
            appliedAt: Date.now(),
            summary: `按 ${episodeDrafts.length} 集写入 ${splitResults.length} 条分镜`,
            affectedCount: splitResults.length,
            scopeLabel: '自动分发到多集',
          },
        });
        onEpisodesChanged?.(episodeId);
        onShotsImported?.();
        return;
      }

      await saveEpisode(projectId, episodeId, {
        scriptText,
        status: 'storyboard',
      });
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
      onEpisodesChanged?.(episodeId);
      onShotsImported?.();
    } catch (err: any) {
      logger.error('导入分镜失败', err);
      message.error('导入失败: ' + (err.message || '未知错误'));
    } finally {
      setIsProcessing(false);
    }
  }, [applyMode, episodeDrafts, episodeId, message, onEpisodesChanged, onSessionChange, onShotsImported, projectId, scriptText, splitResults]);

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
            <div className="flex items-center justify-between">
              <Title level={5} className="!text-zinc-300 !mb-0">章节划分</Title>
              <Button type="link" size="small" onClick={handleSkipToSplit}>跳过划分</Button>
            </div>
            <Text type="secondary">长文本建议先切出章节块，再进入拆分和推理。</Text>

            <Card size="small" className="!bg-zinc-900 !border-zinc-700" styles={{ body: { padding: '12px 16px' } }}>
              {totalEpisodes > 0 && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Tag color={detectionSource === 'llm' || detectionSource === 'llm-repaired' ? 'green' : 'blue'}>
                      检测到 {totalEpisodes} 集
                    </Tag>
                    {detectionStatus === 'extracting' && (
                      <Tag icon={<Spin size="small" className="mr-1" />} className="!border-zinc-600 !bg-zinc-800 !text-zinc-400">
                        AI 增强检测中
                      </Tag>
                    )}
                    {detectionSource === 'llm' || detectionSource === 'llm-repaired' ? (
                      <Tag icon={<RobotOutlined />} color="green" className="!m-0">AI</Tag>
                    ) : detectionSource === 'regex' || detectionSource === 'regex-fallback' ? (
                      <Tag className="!m-0 !border-zinc-600 !bg-zinc-800 !text-zinc-400">正则</Tag>
                    ) : null}
                    <Text type="secondary" className="text-xs">
                      第{autoDetectedEpisodes[0]?.index}集 – 第{autoDetectedEpisodes[autoDetectedEpisodes.length - 1]?.index}集
                    </Text>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <Text type="secondary" className="text-xs shrink-0">每章约</Text>
                    <Slider
                      className="flex-1"
                      min={1}
                      max={Math.max(totalEpisodes, 2)}
                      value={effectiveEpisodesPerChapter}
                      onChange={(val) => updateSession({ episodesPerChapter: val })}
                      disabled={isProcessing}
                    />
                    <InputNumber
                      size="small"
                      min={1}
                      max={totalEpisodes}
                      value={effectiveEpisodesPerChapter}
                      onChange={(val) => val && updateSession({ episodesPerChapter: val })}
                      className="!w-16"
                      disabled={isProcessing}
                    />
                    <Text type="secondary" className="text-xs shrink-0">集 → 约 {suggestedChapters} 章</Text>
                  </div>
                </>
              )}
              {totalEpisodes === 0 && detectionStatus === 'extracting' && (
                <div className="flex items-center gap-2 mb-2">
                  <Spin size="small" />
                  <Text type="secondary" className="text-xs">AI 正在检测集边界…</Text>
                </div>
              )}
              {totalEpisodes === 0 && detectionStatus === 'failed' && (
                <div className="flex items-center gap-2 mb-2">
                  <Tag color="orange">未检测到集标记</Tag>
                  <Text type="secondary" className="text-xs">将按整体文本处理</Text>
                </div>
              )}
              <Space wrap>
                <Button
                  type="primary"
                  onClick={() => handleSmartChapterPlanning('smart')}
                  loading={isProcessing}
                  disabled={!scriptText.trim() || isProcessing}
                >
                  AI 智能划分
                </Button>
                <Button
                  onClick={() => handleSmartChapterPlanning('even')}
                  loading={isProcessing}
                  disabled={!scriptText.trim() || isProcessing}
                >
                  均匀划分
                </Button>
              </Space>
            </Card>

            {isProcessing && planningProgress ? (
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
                <Steps
                  size="small"
                  current={getPlanningStepIndex(planningProgress.stage)}
                  items={PLANNING_STAGES.map(s => ({
                    title: s.title,
                    description: s.description,
                  }))}
                  direction="vertical"
                  className="!mb-3"
                />
                <Progress percent={Math.round(planningProgress.progress * 100)} size="small" strokeColor="#1677ff" />
                <Text type="secondary" className="text-xs mt-1 block">{planningProgress.message}</Text>
              </div>
            ) : resolvedChapters ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Text type="secondary">已划分 {resolvedChapters.length} 个章节</Text>
                  {chapterPlanningResult?.validation?.valid ? (
                    <Tag icon={<CheckCircleOutlined />} color="success">校验通过</Tag>
                  ) : chapterPlanningResult?.validation?.issues && chapterPlanningResult.validation.issues.length > 0 ? (
                    <Tag icon={<ExclamationCircleOutlined />} color="warning">
                      {chapterPlanningResult.validation.issues.length} 个问题
                    </Tag>
                  ) : null}
                  {chapterPlanningResult?.usedFallback && (
                    <Tag color="orange">降级模式</Tag>
                  )}
                  {chapterPlanningResult?.durationMs != null && (
                    <Tag icon={<ClockCircleOutlined />} className="!border-zinc-700 !bg-transparent !text-zinc-400">
                      {(chapterPlanningResult.durationMs / 1000).toFixed(1)}s
                    </Tag>
                  )}
                </div>

                <Collapse
                  size="small"
                  className="!bg-transparent !border-zinc-700 [&_.ant-collapse-panel]:!bg-zinc-900 [&_.ant-collapse-header]:!text-zinc-300"
                  styles={{
                    header: { color: '#d4d4d8' },
                    body: { backgroundColor: '#18181b', color: '#a1a1aa', padding: '12px 16px' },
                  }}
                  items={resolvedChapters.map((ch, index) => {
                    const isLegacy = '_legacy' in ch;
                    const rangeText = isLegacy
                      ? ((ch as any)._startEpisode != null && (ch as any)._endEpisode != null
                          ? `第${(ch as any)._startEpisode}–${(ch as any)._endEpisode}集`
                          : (ch as any)._start != null && (ch as any)._end != null
                            ? `行 ${(ch as any)._start}–${(ch as any)._end}`
                            : '')
                      : ch.unitLabels.length > 0
                        ? `${ch.unitLabels[0]} ~ ${ch.unitLabels[ch.unitLabels.length - 1]}`
                        : '';
                    const charInfo = ch.charCount > 0 ? `${(ch.charCount / 1000).toFixed(1)}K字` : '';
                    const unitCount = ch.endUnitIndex - ch.startUnitIndex + 1;

                    return {
                      key: String(index),
                      label: (
                        <div className="flex items-center gap-2 min-w-0">
                          <Tag className="!m-0 shrink-0">{index + 1}</Tag>
                          <Text strong className="!text-zinc-200 truncate">{ch.title}</Text>
                          {rangeText && <Tag className="!m-0 !border-zinc-600 !bg-zinc-800 !text-zinc-400 shrink-0">{rangeText}</Tag>}
                        </div>
                      ),
                      children: (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {charInfo && <Tag className="!m-0 !border-zinc-600 !bg-zinc-800 !text-zinc-400">{charInfo}</Tag>}
                            {unitCount > 0 && (
                              <Tag className="!m-0 !border-zinc-600 !bg-zinc-800 !text-zinc-400">{unitCount} 个单元</Tag>
                            )}
                          </div>
                          {ch.plotSummary ? (
                            <div className="border-l-2 border-zinc-600 pl-3">
                              <Text type="secondary" className="text-xs">{ch.plotSummary}</Text>
                            </div>
                          ) : (
                            <Text type="secondary" className="text-xs">暂无摘要</Text>
                          )}
                          {ch.startOffset < ch.endOffset && scriptText && (
                            <div className="mt-1">
                              <Text type="secondary" className="text-[11px] mb-1 block">剧本内容预览</Text>
                              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-xs text-zinc-400 bg-zinc-900 border border-zinc-700 rounded p-2 m-0">
                                {scriptText.slice(ch.startOffset, Math.min(ch.endOffset, ch.startOffset + 2000))}
                                {ch.endOffset - ch.startOffset > 2000 ? '\n…（已截断）' : ''}
                              </pre>
                            </div>
                          )}
                        </div>
                      ),
                    };
                  })}
                />
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
              <div className="flex flex-col gap-2">
                <Text type="secondary">已暂存 {splitResults.length} 个分镜草稿（到下一步可编辑和确认）</Text>
                {episodeDrafts.length > 1 && (
                  <Text type="secondary" className="text-xs">
                    当前已按 {episodeDrafts.length} 集拆分，将分别写入对应剧集。
                  </Text>
                )}
                <List
                  size="small"
                  dataSource={splitResults.slice(0, 20)}
                  renderItem={(item, index) => (
                    <List.Item className="!border-zinc-800 !py-1">
                      <div className="flex items-start gap-2 w-full min-w-0">
                        <span className="text-zinc-500 text-xs shrink-0">#{index + 1}</span>
                        <Text className="text-xs text-zinc-400 flex-1 min-w-0">
                          {item.length > 80 ? `${item.slice(0, 80)}...` : item}
                        </Text>
                      </div>
                    </List.Item>
                  )}
                />
                {splitResults.length > 20 && (
                  <Text type="secondary" className="text-xs">…还有 {splitResults.length - 20} 条，到下一步查看完整列表</Text>
                )}
              </div>
            ) : null}
          </div>
        )}

        {currentStep === 4 && (
          <div className="flex flex-col gap-4">
            <Title level={5} className="!text-zinc-300 !mb-0">确认并写入</Title>
            <Text type="secondary">
              {episodeDrafts.length > 1
                ? `将按检测到的 ${episodeDrafts.length} 集自动分发写入，共 ${splitResults.length} 个暂存分镜。`
                : `当前为 ${applyMode === 'replace' ? '替换本集分镜' : '追加到现有分镜'} 模式，共 ${splitResults.length} 个暂存分镜。`}
            </Text>
            {episodeDrafts.length > 1 && (
              <div className="rounded border border-zinc-800 bg-zinc-900/70 p-3 text-xs text-zinc-400">
                将更新第 {episodeDrafts[0]?.episodeNumber} 集到第 {episodeDrafts[episodeDrafts.length - 1]?.episodeNumber} 集，
                不存在的剧集会自动创建，已存在的剧集会写入对应分镜。
              </div>
            )}
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
              {episodeDrafts.length > 1
                ? `确认写入 ${episodeDrafts.length} 集 (${splitResults.length} 个分镜)`
                : `确认写入 (${splitResults.length} 个分镜)`}
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
