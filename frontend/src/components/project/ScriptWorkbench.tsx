/**
 * 剧本工作台
 * 包含工具栏和剧本编辑器，支持自动保存
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { App } from 'antd';
import { Film } from 'lucide-react';
import { InlineProjectToolbar } from './InlineProjectToolbar';
import { ScriptEditor } from '../../editor';
import { saveEpisode } from '../../store/projectStore';
import { generateRandomScript, polishScript } from '../../workflow/scriptGenerator';
import { startBackgroundAnalysis } from '../../services/ScriptAnalysisService';
import type { Project, Episode, AppSettings } from '../../types';
import { createLogger } from '../../store/logger';

const logger = createLogger('ScriptWorkbench');

interface ScriptWorkbenchProps {
  project: Project;
  episode: Episode | null;
  onScriptChange: (text: string) => void;
  onStartProduction: () => void;
}

export const ScriptWorkbench: React.FC<ScriptWorkbenchProps> = ({
  project,
  episode,
  onScriptChange,
  onStartProduction,
}) => {
  const { message } = App.useApp();
  const [localScript, setLocalScript] = useState(episode?.scriptText || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef(episode?.scriptText || '');

  // 同步外部 episode 变化
  useEffect(() => {
    setLocalScript(episode?.scriptText || '');
    lastSavedRef.current = episode?.scriptText || '';
  }, [episode?.id, episode?.scriptText]);

  // 自动保存 (防抖 2s)
  const saveScript = useCallback(async (text: string) => {
    if (!episode || text === lastSavedRef.current) return;

    setIsSaving(true);
    try {
      await saveEpisode(project.id, episode.id, { scriptText: text });
      lastSavedRef.current = text;
      onScriptChange(text);
    } catch (err: unknown) {
      logger.error('自动保存失败', err);
    } finally {
      setIsSaving(false);
    }
  }, [episode, project.id, onScriptChange]);

  const handleScriptChange = useCallback((text: string) => {
    setLocalScript(text);

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 设置新的定时器
    saveTimeoutRef.current = setTimeout(() => {
      saveScript(text);
    }, 2000);
  }, [saveScript]);

  // 组件卸载时保存
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // 立即保存未保存的内容
      if (localScript !== lastSavedRef.current && episode) {
        saveEpisode(project.id, episode.id, { scriptText: localScript }).catch(err => logger.error('保存失败', err));
      }
    };
  }, [localScript, episode, project.id]);

  // AI 随机生成
  const handleRandomGenerate = async () => {
    setIsGenerating(true);
    try {
      const script = await generateRandomScript('3');
      setLocalScript(script);
      await saveScript(script);
      message.success('剧本生成成功！');
    } catch (err: any) {
      message.error(`生成失败: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // AI 润色
  const handlePolish = async () => {
    if (!localScript.trim()) {
      message.warning('请先输入剧本内容');
      return;
    }
    setIsPolishing(true);
    try {
      const polished = await polishScript(
        {} as AppSettings,
        localScript,
        '使语言更加生动，对话更自然，情节更紧凑',
        () => {}
      );
      setLocalScript(polished);
      await saveScript(polished);
      message.success('润色完成！');
    } catch (err: any) {
      message.error(`润色失败: ${err.message}`);
    } finally {
      setIsPolishing(false);
    }
  };

  // 解析剧本
  const handleAnalyze = async () => {
    if (!episode || !localScript.trim()) {
      message.warning('请先输入剧本内容');
      return;
    }
    setIsAnalyzing(true);
    try {
      // 先保存当前剧本
      await saveScript(localScript);
      // 启动后台解析
      await startBackgroundAnalysis(
        project.id,
        episode.id,
        episode.title || `第${episode.number}集`,
        localScript,
        project.llmConfigId
      );
      message.success('解析任务已启动，可在状态栏查看进度');
    } catch (err: any) {
      message.error(`解析失败: ${err.message}`);
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
        isSaving={isSaving || isGenerating || isPolishing}
        isAnalyzing={isAnalyzing}
        onPolish={handlePolish}
        onRandomGenerate={handleRandomGenerate}
        onAnalyze={handleAnalyze}
        onStartProduction={onStartProduction}
      />

      {/* 剧本编辑器 */}
      <div className="flex-1 p-4 overflow-hidden">
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
      </div>

      {/* 底部状态栏 */}
      <div className="h-8 px-4 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800 bg-zinc-900">
        <span>
          第 {episode.number} 集: {episode.title}
        </span>
        <span>
          {localScript.length} 字符
        </span>
      </div>
    </div>
  );
};

export default ScriptWorkbench;
