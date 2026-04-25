/**
 * 剧本工作台
 * 包含工具栏和剧本编辑器，支持自动保存
 */
import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { App } from 'antd';
import { Film, Loader2 } from 'lucide-react';
import { InlineProjectToolbar } from './InlineProjectToolbar';
import { ScriptEditor } from '../../editor';
import { saveEpisode, loadEpisodeAnalysis, saveEpisodeAnalysis } from '../../store/projectStore';
import { generateRandomScript, polishScript } from '../../workflow/scriptGenerator';
import { startBackgroundAnalysis } from '../../services/ScriptAnalysisService';
import { TaskManager } from '../../services/TaskManager';
import type { Project, Episode, AppSettings } from '../../types';
import { createLogger } from '../../store/logger';
import { createAITraceId } from '../../utils/aiTrace';
import { classifyAIError } from '../../utils/aiError';
import { serializeMediaSelection } from '../../providers/channel/resolver';

const logger = createLogger('ScriptWorkbench');

interface ScriptWorkbenchProps {
  project: Project;
  episode: Episode | null;
  onScriptChange: (text: string) => void;
  onStartProduction: () => void;
}

export interface ScriptWorkbenchRef {
  flushSave: () => Promise<Episode | null>;
}

export const ScriptWorkbench = forwardRef<ScriptWorkbenchRef, ScriptWorkbenchProps>(({
  project,
  episode,
  onScriptChange,
  onStartProduction,
}, ref) => {
  const { message } = App.useApp();
  const [localScript, setLocalScript] = useState(episode?.scriptText || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingMode, setStreamingMode] = useState<'generate' | 'polish' | null>(null);
  const [streamingPreview, setStreamingPreview] = useState('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef(episode?.scriptText || '');
  const streamingPreviewRef = useRef<HTMLDivElement | null>(null);

  // 同步外部 episode 变化（仅在剧集 ID 切换时重置本地内容）
  useEffect(() => {
    setLocalScript(episode?.scriptText || '');
    lastSavedRef.current = episode?.scriptText || '';
  }, [episode?.id]);

  useEffect(() => {
    if (!episode) {
      setIsAnalyzing(false);
      return;
    }

    const syncAnalyzingState = () => {
      const running = TaskManager.getProjectTasks(project.id).some(task =>
        task.type === 'script-analysis'
        && task.targetId === episode.id
        && (task.status === 'pending' || task.status === 'running' || task.status === 'processing')
      );
      setIsAnalyzing(running);
    };

    syncAnalyzingState();
    const unsubscribe = TaskManager.addListener((task) => {
      if (task.projectId !== project.id) return;
      if (task.type !== 'script-analysis') return;
      if (task.targetId !== episode.id) return;
      syncAnalyzingState();
    });

    return () => unsubscribe();
  }, [project.id, episode?.id]);

  useEffect(() => {
    if (!streamingPreviewRef.current) return;
    streamingPreviewRef.current.scrollTop = streamingPreviewRef.current.scrollHeight;
  }, [streamingPreview]);

  // 自动保存 (防抖 2s)
  const saveScript = useCallback(async (text: string): Promise<Episode | null> => {
    if (!episode) return null;
    if (text === lastSavedRef.current) {
      return { ...episode, scriptText: text };
    }

    setIsSaving(true);
    try {
      const updated = await saveEpisode(project.id, episode.id, { scriptText: text });
      lastSavedRef.current = text;
      onScriptChange(text);
      return updated || { ...episode, scriptText: text };
    } catch (err: unknown) {
      logger.error('自动保存失败', err);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [episode, project.id, onScriptChange]);

  const flushSave = useCallback(async (): Promise<Episode | null> => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    return saveScript(localScript);
  }, [localScript, saveScript]);

  const handleManualSave = useCallback(async () => {
    if (!episode) {
      message.warning('请先选择剧集');
      return;
    }

    const result = await flushSave();
    if (result) {
      message.success('剧本已保存');
      return;
    }

    message.error('保存失败，请重试');
  }, [episode, flushSave, message]);

  useImperativeHandle(ref, () => ({
    flushSave,
  }), [flushSave]);

  const handleScriptChange = useCallback((text: string) => {
    setLocalScript(text);

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 设置新的定时器，保存成功后 saveScript 内部会回调 onScriptChange
    saveTimeoutRef.current = setTimeout(() => {
      saveScript(text);
    }, 2000);
  }, [saveScript]);

  // 用 ref 追踪最新状态，供组件卸载时使用
  const localScriptRef = useRef(localScript);
  localScriptRef.current = localScript;

  // 组件卸载时保存（剧集切换由 flushSave 处理，不在此处保存）
  useEffect(() => {
    const episodeId = episode?.id;
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      // 仅在组件卸载时保存，剧集切换走 flushSave 路径
      if (episodeId) {
        const currentScript = localScriptRef.current;
        if (currentScript !== lastSavedRef.current) {
          saveEpisode(project.id, episodeId, { scriptText: currentScript }).catch(err => logger.error('保存失败', err));
        }
      }
    };
  }, [project.id]);

  // AI 随机生成
  const handleRandomGenerate = async () => {
    const traceId = createAITraceId('random-script');
    setIsGenerating(true);
    setStreamingMode('generate');
    setStreamingPreview('');
    try {
      logger.info('用户触发随机生成剧本', {
        traceId,
        projectId: project.id,
        episodeId: episode?.id,
        episodeName: episode?.title,
      });

      const script = await generateRandomScript('3', undefined, {
        traceId,
        source: 'ScriptWorkbench.handleRandomGenerate',
        projectId: project.id,
        targetId: episode?.id,
        targetName: episode?.title || `第${episode?.number || 0}集`,
        styleSnapshot: project.styleSnapshot,
        project,
        onChunk: (_delta, accumulated) => {
          setStreamingPreview(accumulated);
        },
      });
      setStreamingPreview(script);
      setLocalScript(script);
      await saveScript(script);
      logger.info('随机生成剧本成功', {
        traceId,
        projectId: project.id,
        episodeId: episode?.id,
        scriptLength: script.length,
      });
      message.success('剧本生成成功！');
    } catch (err: unknown) {
      logger.error('随机生成失败', {
        traceId,
        error: err instanceof Error ? err.message : String(err),
      });
      message.error('剧本生成失败，请检查 LLM 配置后重试');
    } finally {
      setIsGenerating(false);
      setStreamingMode(null);
      setStreamingPreview('');
    }
  };

  // AI 润色
  const handlePolish = async () => {
    if (!localScript.trim()) {
      message.warning('请先输入剧本内容');
      return;
    }
    setIsPolishing(true);
    setStreamingMode('polish');
    setStreamingPreview('');
    try {
      const polished = await polishScript(
        {} as AppSettings,
        localScript,
        '使语言更加生动，对话更自然，情节更紧凑',
        () => {},
        { styleSnapshot: project.styleSnapshot, project },
        (_delta, accumulated) => {
          setStreamingPreview(accumulated);
        }
      );
      setStreamingPreview(polished);
      setLocalScript(polished);
      await saveScript(polished);
      message.success('润色完成！');
    } catch (err: unknown) {
      logger.error('润色失败', err);
      message.error(classifyAIError(err).userMessage);
    } finally {
      setIsPolishing(false);
      setStreamingMode(null);
      setStreamingPreview('');
    }
  };

  // 解析剧本
  const handleAnalyze = async () => {
    if (!episode || !localScript.trim()) {
      message.warning('请先输入剧本内容');
      return;
    }

    const existingTask = TaskManager.getProjectTasks(project.id).find(task =>
      task.type === 'script-analysis'
      && task.targetId === episode.id
      && (task.status === 'pending' || task.status === 'running' || task.status === 'processing')
    );
    if (existingTask) {
      message.info('当前剧集已在后台解析中，请等待完成后再试。');
      return;
    }

    setIsAnalyzing(true);
    try {
      // 先保存当前剧本
      await saveScript(localScript);
      // 备份旧分析数据，以便分析启动失败时恢复
      const previousAnalysis = await loadEpisodeAnalysis(project.id, episode.id);
      // 重置 completedStages（保留 shots 数据），确保重新分析能执行
      if (previousAnalysis) {
        await saveEpisodeAnalysis(project.id, episode.id, {
          ...previousAnalysis,
          completedStages: [],
        }, { resetStages: true });
      }
      // 启动后台解析
      try {
        const task = await startBackgroundAnalysis(
          project.id,
          episode.id,
          episode.title || `第${episode.number}集`,
          localScript,
          serializeMediaSelection(project.mediaSelections?.llm),
          project.styleSnapshot,
        );
        if (task.metadata?.deduped) {
          message.info('当前剧集已在后台解析中，请等待完成后再试。');
          return;
        }
        message.success('解析任务已启动，可在状态栏查看进度');
      } catch (analysisErr: unknown) {
        // 分析启动失败，恢复旧的分析数据
        if (previousAnalysis) {
          await saveEpisodeAnalysis(project.id, episode.id, previousAnalysis, { resetStages: true });
        }
        throw analysisErr;
      }
    } catch (err: unknown) {
      logger.error('解析失败', err);
      message.error(classifyAIError(err).userMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 空状态
  if (!episode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-950">
        <div className="w-20 h-20 mb-6 rounded-2xl bg-zinc-800/80 flex items-center justify-center">
          <Film className="w-10 h-10 text-zinc-600" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-200 mb-2">
          选择剧集开始创作
        </h2>
        <p className="text-sm text-zinc-500">
          从左侧选择一个剧集，或创建新剧集开始编写剧本
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-950">
      {/* 工具栏 */}
      <InlineProjectToolbar
        episode={episode}
        hasScript={!!localScript.trim()}
        isSaving={isSaving}
        isAnalyzing={isAnalyzing}
        isGenerating={isGenerating}
        isPolishing={isPolishing}
        onSave={handleManualSave}
        onPolish={handlePolish}
        onRandomGenerate={handleRandomGenerate}
        onAnalyze={handleAnalyze}
        onStartProduction={onStartProduction}
      />

      {/* 剧本编辑器 */}
      <div className="flex-1 p-4 overflow-hidden">
        {streamingMode ? (
          <div className="h-full flex flex-col overflow-hidden rounded-lg border border-emerald-500/20 bg-zinc-950">
            <div className="flex items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  <span>{streamingMode === 'generate' ? 'AI 正在生成剧本' : 'AI 正在润色剧本'}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {streamingMode === 'generate'
                    ? '内容会实时显示，完成后自动写入编辑器。'
                    : '润色结果会实时预览，完成后再覆盖当前剧本。'}
                </p>
              </div>
              <span className="shrink-0 text-xs text-zinc-500">{streamingPreview.length} 字符</span>
            </div>
            <div
              ref={streamingPreviewRef}
              className="flex-1 overflow-auto bg-[#1a1a1a]"
            >
              <pre className="min-h-full whitespace-pre-wrap break-words px-4 py-3 font-sans text-[13px] leading-6 text-zinc-200">
                {streamingPreview || (streamingMode === 'generate'
                  ? '正在等待模型返回首段内容...'
                  : '正在等待模型返回润色结果...')}
              </pre>
            </div>
          </div>
        ) : (
          <ScriptEditor
            value={localScript}
            onChange={handleScriptChange}
            placeholder="在此开始创作剧本... (支持 Markdown 格式)"
            minHeight="100%"
            maxHeight="100%"
            showLineNumbers={true}
            darkTheme={true}
            style={{ height: '100%', flex: 1 }}
          />
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="h-8 px-4 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800 bg-zinc-900">
        <span>
          第 {episode.number} 集: {episode.title}
        </span>
        <span>
          {(streamingMode ? streamingPreview.length : localScript.length)} 字符
        </span>
      </div>
    </div>
  );
});

ScriptWorkbench.displayName = 'ScriptWorkbench';

export default ScriptWorkbench;
