import type { Shot } from '../../../types';
import type { CreativeOperatorLevel } from '../../../store/promptTemplates';

export type WorkflowPanelId = 'script' | 'assets' | 'inference' | 'style' | 'export' | 'assistant';
export type WorkflowShotScope = 'current-shot' | 'current-chapter' | 'selected-shots' | 'all-shots';
export type ScriptApplyMode = 'append' | 'replace';
export type StyleImpactScope = 'future-only' | WorkflowShotScope;
export type ExportExecutionType = 'video' | 'jianying' | 'images' | 'editor';

export interface StoryboardWorkflowContext {
  activeShotId: string | null;
  selectedShotIds: string[];
  shotCount: number;
}

export interface WorkflowApplyRecord {
  appliedAt: number;
  summary: string;
  affectedCount?: number;
  scopeLabel?: string;
}

export interface WorkflowSessionBase {
  currentStep: number;
  totalSteps: number;
  draftSummary?: string;
  affectedScopeLabel?: string;
  affectedCount?: number;
  lastApplied?: WorkflowApplyRecord;
}

export interface ScriptStudioSession extends WorkflowSessionBase {
  scriptText: string;
  splitResults: string[];
  applyMode: ScriptApplyMode;
  selectedOperatorIds: string[];
  refinedPreview?: string;
  chapterPreview?: string;
  /** 预处理检测到的集标记列表，如 ["第1集 xxx", "第2集 yyy"] */
  detectedEpisodes?: Array<{ index: number; name: string; lineStart: number }>;
  /** 用户选择的章节粒度：每章约包含多少集 */
  episodesPerChapter?: number;
  /** Plan C 章节规划结果（结构化） */
  chapterPlanningResult?: import('../../../services/chapterPlanning').ChapterPlanningResult;
  /** 集边界检测状态 */
  detectionStatus?: 'idle' | 'extracting' | 'done' | 'failed';
  /** 检测来源 */
  detectionSource?: 'regex' | 'llm' | 'user';
  /** 检测到的集边界（管线输出） */
  detectedBoundaries?: import('../../../services/episodeBoundaryDetector').EpisodeBoundary[];
}

export interface PromptDraftResult {
  shotId: string;
  shotIndex: number;
  scriptContent: string;
  imagePrompt: string;
  videoPrompt: string;
  accepted: boolean;
}

export interface RewriteDraftResult {
  shotId: string;
  shotIndex: number;
  original: string;
  rewritten: string;
  accepted: boolean;
}

export interface ChapterInferenceSession extends WorkflowSessionBase {
  templateLevel: CreativeOperatorLevel;
  scope: WorkflowShotScope;
  selectedOperatorIds: string[];
  promptDrafts: PromptDraftResult[];
  rewriteResults: RewriteDraftResult[];
}

export interface StyleImpactPlan {
  presetId: string;
  presetName: string;
  scope: StyleImpactScope;
  scopeLabel: string;
  affectedShotCount: number;
  templateLevel: CreativeOperatorLevel;
  summary: string;
}

export interface StyleSettingsSession extends WorkflowSessionBase {
  selectedPresetId?: string;
  impactScope: StyleImpactScope;
  reinferenceLevel: CreativeOperatorLevel;
  pendingPlan?: StyleImpactPlan;
}

export interface ExportSessionConfig {
  scope: WorkflowShotScope;
  stillDurationSeconds: number;
  imageFormat: 'png' | 'jpeg';
  superResolution: boolean;
  videoResolution: '720p' | '1080p' | '4K';
  videoFormat: 'mp4' | 'webm';
  includeAudio: boolean;
  includeSubtitles: boolean;
}

export interface ExportHistoryItem {
  time: string;
  type: string;
  path: string;
  count: number;
  templateName?: string;
}

export interface ExportTemplateAsset {
  id: string;
  name: string;
  exportType: Exclude<ExportExecutionType, 'editor'>;
  config: ExportSessionConfig;
  createdAt: number;
  source?: 'builtin' | 'custom';
  description?: string;
}

export interface ExportCenterSession extends WorkflowSessionBase {
  activeExport: ExportExecutionType | null;
  config: ExportSessionConfig;
  history: ExportHistoryItem[];
  templates: ExportTemplateAsset[];
  selectedTemplateId?: string;
}

export interface WorkflowPanelSessions {
  script: ScriptStudioSession;
  inference: ChapterInferenceSession;
  style: StyleSettingsSession;
  export: ExportCenterSession;
}

export interface ResolvedWorkflowScope {
  scope: WorkflowShotScope;
  label: string;
  shots: Shot[];
  shotIds: string[];
  isEmpty: boolean;
}

export interface WorkflowSessionDescriptor {
  stepText: string;
  draftText?: string;
  scopeText?: string;
  lastAppliedText?: string;
}

export function createDefaultStoryboardWorkflowContext(): StoryboardWorkflowContext {
  return {
    activeShotId: null,
    selectedShotIds: [],
    shotCount: 0,
  };
}

export function createDefaultScriptStudioSession(): ScriptStudioSession {
  return {
    currentStep: 0,
    totalSteps: 5,
    scriptText: '',
    splitResults: [],
    applyMode: 'append',
    selectedOperatorIds: [],
  };
}

export function createDefaultChapterInferenceSession(): ChapterInferenceSession {
  return {
    currentStep: 0,
    totalSteps: 3,
    templateLevel: 'basic',
    scope: 'current-chapter',
    selectedOperatorIds: [],
    promptDrafts: [],
    rewriteResults: [],
  };
}

export function createDefaultStyleSettingsSession(): StyleSettingsSession {
  return {
    currentStep: 0,
    totalSteps: 2,
    impactScope: 'future-only',
    reinferenceLevel: 'advanced',
  };
}

export function createDefaultExportSessionConfig(): ExportSessionConfig {
  return {
    scope: 'all-shots',
    stillDurationSeconds: 5,
    imageFormat: 'png',
    superResolution: false,
    videoResolution: '1080p',
    videoFormat: 'mp4',
    includeAudio: false,
    includeSubtitles: true,
  };
}

const BUILTIN_EXPORT_TEMPLATE_ASSETS: ExportTemplateAsset[] = [
  {
    id: 'builtin-export-basic',
    name: '基础模板',
    description: '来自官方导出模板，适合导出当前选中的分镜图片。',
    exportType: 'images',
    config: {
      ...createDefaultExportSessionConfig(),
      scope: 'selected-shots',
      imageFormat: 'png',
      superResolution: false,
    },
    createdAt: 10000,
    source: 'builtin',
  },
  {
    id: 'builtin-export-grid',
    name: '四列模板',
    description: '来自官方导出模板，适合批量导出全量图片并启用超分辨率。',
    exportType: 'images',
    config: {
      ...createDefaultExportSessionConfig(),
      scope: 'all-shots',
      imageFormat: 'png',
      superResolution: true,
    },
    createdAt: 10001,
    source: 'builtin',
  },
  {
    id: 'builtin-export-bulk',
    name: '大量导出模板',
    description: '来自官方导出模板，适合大批量导出全量图片素材。',
    exportType: 'images',
    config: {
      ...createDefaultExportSessionConfig(),
      scope: 'all-shots',
      imageFormat: 'png',
      superResolution: true,
    },
    createdAt: 10002,
    source: 'builtin',
  },
];

function mergeExportTemplates(
  templates?: ExportTemplateAsset[],
): ExportTemplateAsset[] {
  const merged = [...BUILTIN_EXPORT_TEMPLATE_ASSETS, ...(templates || [])];
  const seen = new Set<string>();

  return merged.filter((template) => {
    if (seen.has(template.id)) {
      return false;
    }
    seen.add(template.id);
    return true;
  });
}

export function createDefaultExportCenterSession(): ExportCenterSession {
  return {
    currentStep: 0,
    totalSteps: 2,
    activeExport: null,
    config: createDefaultExportSessionConfig(),
    history: [],
    templates: [...BUILTIN_EXPORT_TEMPLATE_ASSETS],
  };
}

export function createDefaultWorkflowPanelSessions(): WorkflowPanelSessions {
  return {
    script: createDefaultScriptStudioSession(),
    inference: createDefaultChapterInferenceSession(),
    style: createDefaultStyleSettingsSession(),
    export: createDefaultExportCenterSession(),
  };
}

export function ensureWorkflowPanelSessions(
  sessions?: Partial<WorkflowPanelSessions>,
): WorkflowPanelSessions {
  const defaults = createDefaultWorkflowPanelSessions();
  return {
    script: { ...defaults.script, ...sessions?.script },
    inference: { ...defaults.inference, ...sessions?.inference },
    style: { ...defaults.style, ...sessions?.style },
    export: {
      ...defaults.export,
      ...sessions?.export,
      config: { ...defaults.export.config, ...sessions?.export?.config },
      history: sessions?.export?.history || defaults.export.history,
      templates: mergeExportTemplates(sessions?.export?.templates),
    },
  };
}

export function resolveStoryboardScope(
  shots: Shot[],
  context: StoryboardWorkflowContext,
  scope: WorkflowShotScope,
): ResolvedWorkflowScope {
  switch (scope) {
    case 'current-shot': {
      const hit = shots.find((shot) => shot.id === context.activeShotId);
      return {
        scope,
        label: '当前分镜',
        shots: hit ? [hit] : [],
        shotIds: hit ? [hit.id] : [],
        isEmpty: !hit,
      };
    }
    case 'selected-shots': {
      const selected = shots.filter((shot) => context.selectedShotIds.includes(shot.id));
      return {
        scope,
        label: '选中分镜',
        shots: selected,
        shotIds: selected.map((shot) => shot.id),
        isEmpty: selected.length === 0,
      };
    }
    case 'all-shots':
      return {
        scope,
        label: '全部分镜',
        shots,
        shotIds: shots.map((shot) => shot.id),
        isEmpty: shots.length === 0,
      };
    case 'current-chapter':
    default:
      return {
        scope: 'current-chapter',
        label: '当前章节（本集）',
        shots,
        shotIds: shots.map((shot) => shot.id),
        isEmpty: shots.length === 0,
      };
  }
}

function formatAppliedTime(timestamp?: number): string | undefined {
  if (!timestamp) {
    return undefined;
  }
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function describeWorkflowSession(
  panelId: WorkflowPanelId,
  sessions: WorkflowPanelSessions,
): WorkflowSessionDescriptor | null {
  if (panelId === 'script') {
    const session = sessions.script;
    return {
      stepText: `${session.currentStep + 1}/${session.totalSteps}`,
      draftText: session.splitResults.length > 0
        ? `暂存 ${session.splitResults.length} 条分镜草稿`
        : session.scriptText.trim()
          ? `已录入 ${session.scriptText.trim().length} 字剧本`
          : undefined,
      scopeText: session.applyMode === 'replace' ? '写入模式: 替换本集分镜' : '写入模式: 追加到现有分镜',
      lastAppliedText: session.lastApplied
        ? `${session.lastApplied.summary}${formatAppliedTime(session.lastApplied.appliedAt) ? ` · ${formatAppliedTime(session.lastApplied.appliedAt)}` : ''}`
        : undefined,
    };
  }

  if (panelId === 'inference') {
    const session = sessions.inference;
    const draftCount = session.promptDrafts.length || session.rewriteResults.length;
    return {
      stepText: `${session.currentStep + 1}/${session.totalSteps}`,
      draftText: draftCount > 0 ? `暂存 ${draftCount} 条推理结果` : undefined,
      scopeText: session.affectedScopeLabel || undefined,
      lastAppliedText: session.lastApplied
        ? `${session.lastApplied.summary}${formatAppliedTime(session.lastApplied.appliedAt) ? ` · ${formatAppliedTime(session.lastApplied.appliedAt)}` : ''}`
        : undefined,
    };
  }

  if (panelId === 'style') {
    const session = sessions.style;
    return {
      stepText: `${session.currentStep + 1}/${session.totalSteps}`,
      draftText: session.pendingPlan ? '已生成重推理计划' : undefined,
      scopeText: session.pendingPlan?.scopeLabel || session.affectedScopeLabel,
      lastAppliedText: session.lastApplied
        ? `${session.lastApplied.summary}${formatAppliedTime(session.lastApplied.appliedAt) ? ` · ${formatAppliedTime(session.lastApplied.appliedAt)}` : ''}`
        : undefined,
    };
  }

  if (panelId === 'export') {
    const session = sessions.export;
    const scopeLabelMap: Record<WorkflowShotScope, string> = {
      'current-shot': '当前分镜',
      'current-chapter': '当前章节',
      'selected-shots': '选中分镜',
      'all-shots': '全部分镜',
    };
    const builtinCount = session.templates.filter((template) => template.source === 'builtin').length;
    const customCount = session.templates.filter((template) => template.source !== 'builtin').length;
    return {
      stepText: `${session.currentStep + 1}/${session.totalSteps}`,
      draftText: session.templates.length > 0
        ? `${builtinCount} 个内置模板${customCount > 0 ? ` + ${customCount} 个自定义模板` : ''}`
        : undefined,
      scopeText: [
        session.activeExport ? `当前方式: ${session.activeExport}` : undefined,
        `导出范围: ${scopeLabelMap[session.config.scope]}`,
      ].filter(Boolean).join(' · '),
      lastAppliedText: session.history[0]
        ? `${session.history[0].type} · ${session.history[0].count} 项 · ${session.history[0].time}`
        : undefined,
    };
  }

  return null;
}
