/**
 * Script 阶段 — 剧本编辑 + 资产管理
 * 功能：剧本编辑(@引用) + 剧本解析 + 资产管理（角色/场景/道具生成）
 * 布局：8:4 grid 分栏（剧本编辑 | 资产面板）
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { App, Button } from 'antd';
import { ThunderboltOutlined, HighlightOutlined, LoadingOutlined } from '@ant-design/icons';
import {
  FileText, Package, Sparkles, ArrowRight, Check, Loader2,
} from 'lucide-react';
import { ScriptEditor } from '../../../editor';
import { ProjectAssetOverview } from '../../project/ProjectAssetOverview';
import { saveEpisode } from '../../../store/projectStore';
import { generateRandomScript, polishScript } from '../../../workflow/scriptGenerator';
import { startBackgroundAnalysis } from '../../../services/ScriptAnalysisService';

interface Episode {
  id: string;
  projectId: string;
  number: number;
  title: string;
  storyText?: string;
  scriptText?: string;
  createdAt: number;
  updatedAt: number;
}

interface ScriptStageProps {
  projectId: string;
  episode: Episode | null;
  projectConfig: {
    llmConfigId?: string;
    ttiConfigId?: string;
    [key: string]: any;
  };
  onEpisodeUpdate: (episodeId: string, updates: Partial<Episode>) => void;
  onRefreshStatuses: () => void;
  onStageChange: (stage: string) => void;
}

const ScriptStage: React.FC<ScriptStageProps> = ({
  projectId,
  episode,
  projectConfig,
  onEpisodeUpdate,
  onRefreshStatuses,
  onStageChange,
}) => {
  const { message } = App.useApp();
  const [localScript, setLocalScript] = useState(episode?.scriptText || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef(episode?.scriptText || '');

  // 同步 episode 变化
  useEffect(() => {
    setLocalScript(episode?.scriptText || '');
    lastSavedRef.current = episode?.scriptText || '';
  }, [episode?.id, episode?.scriptText]);

  // 自动保存
  const saveScript = useCallback(async (text: string) => {
    if (!episode || text === lastSavedRef.current) return;
    setIsSaving(true);
    try {
      await saveEpisode(projectId, episode.id, { scriptText: text } as any);
      lastSavedRef.current = text;
      onEpisodeUpdate(episode.id, { scriptText: text });
    } catch (err: any) {
      console.error('自动保存失败:', err);
    } finally {
      setIsSaving(false);
    }
  }, [episode, projectId, onEpisodeUpdate]);

  const handleScriptChange = useCallback((text: string) => {
    setLocalScript(text);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveScript(text), 2000);
  }, [saveScript]);

  // 卸载时保存
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // AI 随机生成
  const handleRandomGenerate = async () => {
    setIsGenerating(true);
    try {
      const script = await generateRandomScript('3');
      setLocalScript(script);
      await saveScript(script);
      message.success('剧本生成成功');
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
        {} as any,
        localScript,
        '使语言更加生动，对话更自然，情节更紧凑',
        () => {}
      );
      setLocalScript(polished);
      await saveScript(polished);
      message.success('润色完成');
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
      await saveScript(localScript);
      await startBackgroundAnalysis(
        projectId,
        episode.id,
        episode.title || `第${episode.number}集`,
        localScript,
        projectConfig.llmConfigId,
      );
      message.success('解析任务已启动，可在状态栏查看进度');
    } catch (err: any) {
      message.error(`解析失败: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleNext = useCallback(() => {
    onRefreshStatuses();
    onStageChange('storyboard');
  }, [onRefreshStatuses, onStageChange]);

  const hasScript = !!localScript.trim();
  const busyState = isSaving || isGenerating || isPolishing;

  if (!episode) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center space-y-3">
          <FileText className="w-12 h-12 mx-auto opacity-20" />
          <p>请先选择一个剧集</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pb-6">
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
        {/* Left panel: Script editor (col-span-8) */}
        <div className="col-span-8 flex flex-col">
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
              <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
              剧本编辑
            </h2>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {busyState ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span>已保存</span>
                </>
              )}
              <span className="text-zinc-600">|</span>
              <span>{localScript.length} 字符</span>
            </div>
          </div>

          {/* Glass surface panel */}
          <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Toolbar buttons row */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800">
              <Button
                type="text"
                size="small"
                icon={<ThunderboltOutlined />}
                onClick={handleRandomGenerate}
                loading={isGenerating}
                className="text-zinc-400 hover:text-purple-400"
              >
                AI生成
              </Button>
              <Button
                type="text"
                size="small"
                icon={<HighlightOutlined />}
                onClick={handlePolish}
                loading={isPolishing}
                disabled={!hasScript}
                className="text-zinc-400 hover:text-blue-400"
              >
                AI润色
              </Button>
              <Button
                type="text"
                size="small"
                icon={isAnalyzing ? <LoadingOutlined spin /> : <Sparkles className="w-4 h-4" />}
                onClick={handleAnalyze}
                disabled={!hasScript || isAnalyzing}
                className="text-zinc-400 hover:text-emerald-400"
              >
                {isAnalyzing ? '解析中...' : '解析剧本'}
              </Button>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
              <ScriptEditor
                value={localScript}
                onChange={handleScriptChange}
                placeholder="在此编辑剧本... (支持 @角色名 @场景名 引用)"
                minHeight="100%"
                maxHeight="100%"
                showLineNumbers={true}
                darkTheme={true}
                style={{ height: '100%', flex: 1 }}
              />
            </div>

            {/* Status bar */}
            <div className="h-7 px-4 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800">
              <span>第{episode.number}集: {episode.title}</span>
              <span>{localScript.length} 字符</span>
            </div>
          </div>
        </div>

        {/* Right panel: Assets (col-span-4) */}
        <div className="col-span-4 flex flex-col">
          {/* Section header */}
          <div className="flex items-center mb-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
              <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
              项目资产
            </h2>
          </div>

          {/* Glass surface panel */}
          <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <ProjectAssetOverview projectId={projectId} />
            </div>

            {/* CTA button */}
            <div className="p-3 border-t border-zinc-800">
              <button
                onClick={handleNext}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors"
              >
                下一步：分镜
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScriptStage;
