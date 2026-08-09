import React from 'react';
import { Button, Tag, Tooltip } from 'antd';
import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  FolderOpen,
  Loader2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type {
  ProductionNextAction,
  ProductionNextActionType,
  ProductionStageKey,
  ProductionStageReadiness,
  ProjectProductionReadiness,
} from '../../services/projectProductionReadiness';

interface ProjectProductionReadinessPanelProps {
  readiness: ProjectProductionReadiness;
  onAction: (action: ProductionNextActionType) => void;
  onOpenAssets: () => void;
  onOpenStoryboard: () => void;
  busy?: boolean;
}

const stageIcons: Record<ProductionStageKey, React.ReactNode> = {
  script: <Sparkles className="w-3.5 h-3.5" />,
  assets: <Users className="w-3.5 h-3.5" />,
  storyboard: <Clapperboard className="w-3.5 h-3.5" />,
};

const stageLabels: Record<ProductionStageKey, string> = {
  script: '剧本',
  assets: '资产',
  storyboard: '分镜',
};

function stageClasses(status: ProductionStageReadiness['status']): {
  border: string;
  icon: string;
  label: string;
} {
  switch (status) {
    case 'ready':
      return { border: 'border-status-success/30', icon: 'bg-status-success/15 text-status-success', label: 'text-status-success' };
    case 'running':
      return { border: 'border-status-info/40', icon: 'bg-status-info/15 text-status-info', label: 'text-status-info' };
    case 'failed':
      return { border: 'border-status-error/40', icon: 'bg-status-error/15 text-status-error', label: 'text-status-error' };
    case 'incomplete':
      return { border: 'border-status-warning/40', icon: 'bg-status-warning/15 text-status-warning', label: 'text-status-warning' };
    default:
      return { border: 'border-border-subtle', icon: 'bg-bg-elevated text-text-tertiary', label: 'text-text-tertiary' };
  }
}

function StageCard({ stage }: { stage: ProductionStageReadiness }): React.ReactElement {
  const classes = stageClasses(stage.status);
  const isRunning = stage.status === 'running';
  const isError = stage.status === 'failed';
  return (
    <div className={`min-w-0 rounded-md border bg-bg-app/50 px-2.5 py-2 ${classes.border}`}>
      <div className="flex items-center justify-between gap-1">
        <div className={`flex items-center gap-1 text-[11px] font-medium ${classes.label}`}>
          <span className={`flex h-5 w-5 items-center justify-center rounded ${classes.icon}`}>
            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isError ? <TriangleAlert className="w-3.5 h-3.5" /> : stage.status === 'ready' ? <CheckCircle2 className="w-3.5 h-3.5" /> : stageIcons[stage.key]}
          </span>
          {stageLabels[stage.key]}
        </div>
        <span className={`text-[10px] font-medium ${classes.label}`}>
          {stage.total > 0 ? `${stage.done}/${stage.total}` : '—'}
        </span>
      </div>
      <div className="mt-1 truncate text-[11px] font-medium text-text-primary" title={stage.label}>
        {stage.label}
      </div>
      <div className="mt-0.5 line-clamp-2 min-h-[28px] text-[10px] leading-4 text-text-tertiary" title={stage.error || stage.detail}>
        {stage.error || stage.detail}
      </div>
    </div>
  );
}

export const ProjectProductionReadinessPanel: React.FC<ProjectProductionReadinessPanelProps> = ({
  readiness,
  onAction,
  onOpenAssets,
  onOpenStoryboard,
  busy = false,
}) => {
  const action: ProductionNextAction = readiness.nextAction;
  // 资产编辑器也支持先手动建立资产，因此只在未选择剧集时禁用入口，
  // 不把“尚未解析剧本”误当成不能编辑资产。
  const canOpenAssets = readiness.stages.script.status !== 'blocked';
  const canOpenStoryboard = readiness.shotCount > 0;
  const actionIsNavigation = action.type === 'open-assets' || action.type === 'open-storyboard';
  const handlePrimary = () => {
    if (action.type === 'open-assets') {
      onOpenAssets();
      return;
    }
    if (action.type === 'open-storyboard') {
      onOpenStoryboard();
      return;
    }
    onAction(action.type);
  };

  return (
    <section className="mx-3 mt-3 rounded-lg border border-border-subtle bg-bg-surface px-3 py-3" aria-label="项目生产进度">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-text-primary">本集生产进度</div>
            <div className="text-[10px] text-text-tertiary">剧本 → 资产 → 分镜</div>
          </div>
        </div>
        <Tag className="!m-0 !border-0 !bg-bg-elevated !px-1.5 !text-[10px] !text-text-tertiary">
          {readiness.shotCount > 0 ? `${readiness.shotCount} 镜` : '尚未拆镜'}
        </Tag>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <StageCard stage={readiness.stages.script} />
        <StageCard stage={readiness.stages.assets} />
        <StageCard stage={readiness.stages.storyboard} />
      </div>

      <div className="mt-3 rounded-md bg-bg-app px-2.5 py-2">
        <div className="flex items-start gap-2">
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-text-tertiary">建议下一步</div>
            <Tooltip title={action.reason} placement="top">
              <div className="truncate text-xs font-medium text-text-primary" title={action.reason}>{action.label}</div>
            </Tooltip>
          </div>
          {action.type === 'analyze-script' || action.type === 'generate-shots' || action.type === 'mark-script-ready' ? (
            <Button
              size="small"
              type="primary"
              loading={busy}
              disabled={action.disabled || busy}
              onClick={handlePrimary}
              className="!h-6 !px-2 !text-[10px]"
            >
              {action.type === 'analyze-script' || action.type === 'generate-shots' ? <RefreshCw className="mr-1 inline h-3 w-3" /> : null}
              执行
            </Button>
          ) : actionIsNavigation ? (
            <Button size="small" type="primary" disabled={action.disabled} onClick={handlePrimary} className="!h-6 !px-2 !text-[10px]">
              打开
            </Button>
          ) : (
            <span className="text-[10px] text-text-tertiary">{action.disabled ? '等待中' : '请继续编辑'}</span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5">
        <Button
          type="text"
          size="small"
          icon={<FolderOpen className="h-3 w-3" />}
          disabled={!canOpenAssets}
          onClick={onOpenAssets}
          className="!h-6 !px-1.5 !text-[10px] !text-text-secondary"
        >
          资产管理
        </Button>
        <Button
          type="text"
          size="small"
          icon={<Clapperboard className="h-3 w-3" />}
          disabled={!canOpenStoryboard}
          onClick={onOpenStoryboard}
          className="!h-6 !px-1.5 !text-[10px] !text-text-secondary"
        >
          分镜编辑
        </Button>
      </div>
    </section>
  );
};

export default ProjectProductionReadinessPanel;
