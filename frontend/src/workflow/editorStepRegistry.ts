/**
 * 编辑器步骤注册表
 *
 * 在 P0#3 重构之前，"三步流程"（assets/storyboard/video）的步骤元数据散落在
 * 至少 5 处（types.ts 的 EditorStep union、StepNavigator 的 steps 数组、
 * App.tsx 与 episodeEditorEntry.ts 的 stepOrder、Header.tsx 与 EditorView.tsx
 * 的 if-else nextAction），添加新步骤要全部修改。
 *
 * 重构后：本注册表是步骤元数据的唯一真源。UI 通过 listEditorSteps() 渲染
 * StepNavigator；stepOrder 由 listEditorStepIds() 派生；"下一步"按钮通过
 * getEditorStep(id).nextAction 查询。
 *
 * 添加新步骤：
 *   1. 在本文件 registerEditorStep({ id, ... })
 *   2. EditorView.tsx 中加分支以渲染对应组件（Component 不在 registry 中
 *      管理，因为各步骤组件接收的 props 差异太大；统一 ctx 留给后续阶段）
 *   3. 如该步骤需持久化进度：扩展 EpisodeStepProgress 与 SQL schema
 *
 * 删除步骤需要数据迁移评估，暂不支持。
 */
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Users, Clapperboard, Scissors } from 'lucide-react';
import type {
  Project,
  Episode,
  ScriptAnalysisResult,
  AppSettings,
  ProjectStyleSnapshot,
} from '../types';
import type { MentionItem } from '../editor';

export interface EditorStepNextAction {
  /** 跳转目标步骤 id（必须与 registry 中已注册的 id 匹配） */
  targetStepId: string;
  /** "下一步"按钮文案的 i18n key */
  labelKey: string;
}

/**
 * 编辑器步骤组件接收的统一上下文。
 *
 * 各 step component 自由从 ctx 取所需字段渲染，无需 EditorView 知道每个 component
 * 实际需要哪些 props。新增 step 时增 wrapper component + register，无需改 EditorView。
 */
export interface EditorStepContext {
  activeProject: Project;
  activeEpisode: Episode | null;
  scriptText: string;
  analysisData: ScriptAnalysisResult | null;
  appSettings: AppSettings;
  mentionItems: MentionItem[];
  styleSnapshot?: ProjectStyleSnapshot;
  llmSelection?: string;
  ttiSelection?: string;
  itvSelection?: string;
  ttsSelection?: string;
  onStepChange: (stepId: string) => void;
  onViewChange: (view: 'projects') => void;
}

export interface EditorStepDefinition {
  id: string;
  /** 排序值，决定 StepNavigator 中的显示顺序与 stepOrder 数组的顺序 */
  order: number;
  icon: LucideIcon;
  /** 步骤标题的 i18n key */
  labelKey: string;
  /** "下一步"按钮配置；最末步骤可省略 */
  nextAction?: EditorStepNextAction;
  /**
   * 步骤主视图组件。由 components/editor/steps/index.ts 通过
   * setStepComponent(id, Component) 在内置元数据基础上 patch 注入。
   * 缺失时 EditorView 渲染 fallback。
   */
  Component?: ComponentType<{ ctx: EditorStepContext }>;
}

class EditorStepRegistryImpl {
  private readonly steps = new Map<string, EditorStepDefinition>();

  register(def: EditorStepDefinition): void {
    if (this.steps.has(def.id)) {
      throw new Error(`Editor step "${def.id}" already registered`);
    }
    this.steps.set(def.id, def);
  }

  get(id: string): EditorStepDefinition | undefined {
    return this.steps.get(id);
  }

  list(): EditorStepDefinition[] {
    return Array.from(this.steps.values()).sort((a, b) => a.order - b.order);
  }

  ids(): string[] {
    return this.list().map((step) => step.id);
  }

  has(id: string): boolean {
    return this.steps.has(id);
  }
}

export const editorStepRegistry = new EditorStepRegistryImpl();

export function registerEditorStep(def: EditorStepDefinition): void {
  editorStepRegistry.register(def);
}

export function listEditorSteps(): EditorStepDefinition[] {
  return editorStepRegistry.list();
}

export function listEditorStepIds(): string[] {
  return editorStepRegistry.ids();
}

export function getEditorStep(id: string): EditorStepDefinition | undefined {
  return editorStepRegistry.get(id);
}

/**
 * 给已注册步骤补充/替换 Component。
 * 设计目的：工作流注册（id/order/icon/labelKey/nextAction）住在 workflow 层，
 * UI 渲染（Component）住在 components/editor/steps/，通过此函数桥接两层。
 */
export function setStepComponent(
  id: string,
  Component: ComponentType<{ ctx: EditorStepContext }>,
): void {
  const def = editorStepRegistry.get(id);
  if (!def) {
    throw new Error(`Cannot set component for unregistered step "${id}"`);
  }
  def.Component = Component;
}

// ========== 内置三步注册 ==========

registerEditorStep({
  id: 'assets',
  order: 0,
  icon: Users,
  labelKey: 'editor.stepAssets',
  nextAction: { targetStepId: 'storyboard', labelKey: 'editor.nextStoryboard' },
});

registerEditorStep({
  id: 'storyboard',
  order: 1,
  icon: Clapperboard,
  labelKey: 'editor.stepStoryboard',
  nextAction: { targetStepId: 'video', labelKey: 'editor.nextVideo' },
});

registerEditorStep({
  id: 'video',
  order: 2,
  icon: Scissors,
  labelKey: 'editor.stepVideo',
  // 末步骤无 nextAction
});
