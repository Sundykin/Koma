import React, { useEffect, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Project, Episode, EditorStep, EpisodeStepProgress,
  ScriptAnalysisResult, AppSettings, ProjectStyleSnapshot,
} from '../../types';
import type { MentionItem } from '../../editor';
import { StepNavigator } from '../common/StepNavigator';
import { serializeMediaSelection } from '../../providers/channel/resolver';
import {
  getEditorStep,
  type EditorStepContext,
} from '../../workflow/editorStepRegistry';
import { loadEpisodeAnalysis } from '../../store/projectStore';
import { TaskManager } from '../../services/TaskManager';
// 副作用 import：把各步骤 Component 注入到 registry
import './steps';

interface EditorViewProps {
  activeProject: Project;
  activeEpisode: Episode | null;
  editorStep: EditorStep;
  stepProgress: EpisodeStepProgress;
  scriptText: string;
  analysisData: ScriptAnalysisResult | null;
  appSettings: AppSettings;
  mentionItems: MentionItem[];
  onStepChange: (step: EditorStep) => void;
  onStepChangeWithMark: (step: EditorStep) => void;
  onViewChange: (view: 'projects') => void;
  onOpenProjectSettings: () => void;
  /** 'script' 步骤把编辑后的剧本回写到 App 顶层 state */
  onScriptChange?: (text: string) => void;
  /** 'script' 步骤里 ProjectOverview 修改项目元信息时回写 */
  onProjectUpdate?: (updates: Partial<Project>) => void;
  /** 'script' 步骤里选剧集时把当前剧集回写到 App 顶层 state */
  onActiveEpisodeChange?: (episode: Episode) => void;
}

export const EditorView: React.FC<EditorViewProps> = ({
  activeProject,
  activeEpisode,
  editorStep,
  stepProgress,
  scriptText,
  analysisData,
  appSettings,
  mentionItems,
  onStepChange,
  onStepChangeWithMark,
  onViewChange,
  onOpenProjectSettings,
  onScriptChange,
  onProjectUpdate,
  onActiveEpisodeChange,
}) => {
  const { t } = useTranslation();
  const styleSnapshot: ProjectStyleSnapshot | undefined = activeProject.styleSnapshot;
  const llmSelection = serializeMediaSelection(activeProject.mediaSelections?.llm);
  const ttiSelection = serializeMediaSelection(activeProject.mediaSelections?.tti);
  const itvSelection = serializeMediaSelection(activeProject.mediaSelections?.itv);
  const ttsSelection = serializeMediaSelection(activeProject.mediaSelections?.tts);

  // 'script' 步：跟踪当前剧集的解析就绪状态（剧本必须解析过才能进入下一步）
  // 派生顺序：episode.hasAnalysis → 兜底走 loadEpisodeAnalysis 的 completedStages 长度
  const [scriptAnalysisReady, setScriptAnalysisReady] = useState(false);
  useEffect(() => {
    if (!activeEpisode) {
      setScriptAnalysisReady(false);
      return;
    }
    let cancelled = false;
    const initial = !!activeEpisode.hasAnalysis;
    setScriptAnalysisReady(initial);
    // 兜底：从分析数据派生（避免 episode 字段未及时刷新）
    if (!initial) {
      loadEpisodeAnalysis(activeProject.id, activeEpisode.id)
        .then((analysis) => {
          if (cancelled) return;
          const stages = analysis?.completedStages || [];
          if (stages.length > 0) setScriptAnalysisReady(true);
        })
        .catch(() => {/* 加载失败时按未就绪处理 */});
    }
    // 监听后台解析任务完成事件
    const unsubscribe = TaskManager.addListener((task) => {
      if (task.projectId !== activeProject.id) return;
      if (task.type !== 'script-analysis') return;
      if (task.targetId !== activeEpisode.id) return;
      // 任务完成时标记就绪
      if (task.status === 'completed') {
        setScriptAnalysisReady(true);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeProject.id, activeEpisode]);

  // 数据驱动："下一步"按钮从 editorStepRegistry.nextAction 派生
  const getActionButton = () => {
    const next = getEditorStep(editorStep)?.nextAction;
    if (!next) return null;

    // 'script' 步：必须先解析剧本才能进入下一步
    const blockedByAnalysis = editorStep === 'script' && !scriptAnalysisReady;
    const tooltip = blockedByAnalysis
      ? '请先点击右侧资产面板的「解析剧本」完成解析'
      : undefined;

    const button = (
      <Button
        type="primary"
        disabled={blockedByAnalysis}
        onClick={() => onStepChangeWithMark(next.targetStepId as EditorStep)}
        className={blockedByAnalysis ? '' : 'bg-emerald-600 hover:bg-emerald-500 border-none'}
      >
        {t(next.labelKey)}
      </Button>
    );

    return tooltip ? <Tooltip title={tooltip}>{button}</Tooltip> : button;
  };

  // 构造 step 渲染上下文
  const ctx: EditorStepContext = {
    activeProject,
    activeEpisode,
    scriptText,
    analysisData,
    appSettings,
    mentionItems,
    styleSnapshot,
    llmSelection,
    ttiSelection,
    itvSelection,
    ttsSelection,
    onStepChange: (id) => onStepChange(id as EditorStep),
    onViewChange,
    onScriptChange,
    onProjectUpdate,
    onOpenProjectSettings,
    onActiveEpisodeChange,
  };

  // 数据驱动：从 registry 取当前 step 的 Component
  const stepDef = getEditorStep(editorStep);
  const StepComponent = stepDef?.Component;

  return (
    <div className="flex flex-col h-full">
      {/* 嵌入式步骤导航 */}
      <StepNavigator
        currentStep={editorStep}
        onStepChange={onStepChange}
        stepProgress={stepProgress}
        scriptText={scriptText}
        actionButton={getActionButton()}
      />

      {/* 主内容区 */}
      <div className="flex-1 overflow-hidden relative">
        {StepComponent ? (
          <StepComponent ctx={ctx} />
        ) : (
          // 未实现/未注册 Component 的 step：fallback
          <div className="flex h-full items-center justify-center text-zinc-500 flex-col gap-4">
            <Users className="w-16 h-16 opacity-10" />
            <p>步骤 "{editorStep}" 未实现。</p>
            <Button type="link" onClick={() => onViewChange('projects')}>返回项目列表</Button>
          </div>
        )}
      </div>
    </div>
  );
};
