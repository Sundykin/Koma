/**
 * Orchestrator 核心类型定义
 * 基于 waoowaoo 的 Orchestrator 模式
 */

import type { RendererDelegate } from '../queue/workers/rendererDelegate';

// ============ Orchestrator Step 元数据 ============

export interface OrchestratorStepMeta {
  stepId: string;
  stepAttempt?: number;
  stepTitle: string;
  stepIndex: number;
  stepTotal: number;
}

export interface OrchestratorStepOutput {
  text: string;
  reasoning: string;
}

// ============ Orchestrator Context ============

export interface OrchestratorContext {
  taskId: string;
  projectId: string;
  episodeId: string;
  delegate: RendererDelegate;
  onProgress: (progress: number, phase: string, message: string) => void | Promise<void>;
  isCancelled?: () => boolean;
}

// ============ Orchestrator Result ============

export interface OrchestratorResult {
  summary: Record<string, unknown>;
  outputs: Record<string, unknown>[];
}

// ============ Story-to-Script Orchestrator ============

export interface StoryToScriptOrchestratorInput {
  content: string;
  baseCharacters: string[];
  baseLocations: string[];
  baseCharacterIntroductions: Array<{ name: string; introduction?: string | null }>;
  promptTemplates: StoryToScriptPromptTemplates;
  runStep: (
    meta: OrchestratorStepMeta,
    prompt: string,
    action: string,
    maxOutputTokens: number
  ) => Promise<OrchestratorStepOutput>;
  onStepError?: (meta: OrchestratorStepMeta, message: string) => void;
  onLog?: (message: string, details?: Record<string, unknown>) => void;
}

export interface StoryToScriptPromptTemplates {
  characterPromptTemplate: string;
  locationPromptTemplate: string;
  clipPromptTemplate: string;
  screenplayPromptTemplate: string;
}

export interface StoryToScriptClipCandidate {
  id: string;
  startText: string;
  endText: string;
  summary: string;
  location: string | null;
  characters: string[];
  content: string;
  matchLevel: 'L1' | 'L2' | 'L3';
  matchConfidence: number;
}

export interface StoryToScriptScreenplayResult {
  clipId: string;
  success: boolean;
  sceneCount: number;
  screenplay?: Record<string, unknown>;
  error?: string;
}

export interface StoryToScriptOrchestratorResult {
  characterStep: OrchestratorStepOutput;
  locationStep: OrchestratorStepOutput;
  splitStep: OrchestratorStepOutput;
  charactersObject: Record<string, unknown>;
  locationsObject: Record<string, unknown>;
  analyzedCharacters: Record<string, unknown>[];
  analyzedLocations: Record<string, unknown>[];
  charactersLibName: string;
  locationsLibName: string;
  charactersIntroduction: string;
  clipList: StoryToScriptClipCandidate[];
  screenplayResults: StoryToScriptScreenplayResult[];
  summary: {
    characterCount: number;
    locationCount: number;
    clipCount: number;
    screenplaySuccessCount: number;
    screenplayFailedCount: number;
    totalScenes: number;
  };
}

// ============ Script-to-Storyboard Orchestrator ============

export interface ScriptToStoryboardOrchestratorInput {
  clips: Array<{
    id: string;
    content: string | null;
    characters: string | null;
    location: string | null;
    screenplay: string | null;
  }>;
  novelPromotionData: {
    characters: Array<{
      name: string;
      appearance?: string;
      personality?: string;
      description?: string;
    }>;
    locations: Array<{
      name: string;
      description?: string;
    }>;
  };
  promptTemplates: ScriptToStoryboardPromptTemplates;
  runStep: (
    meta: OrchestratorStepMeta,
    prompt: string,
    action: string,
    maxOutputTokens: number
  ) => Promise<OrchestratorStepOutput>;
}

export interface ScriptToStoryboardPromptTemplates {
  phase1PlanTemplate: string;
  phase2CinematographyTemplate: string;
  phase2ActingTemplate: string;
  phase3DetailTemplate: string;
}

export interface StoryboardPanel {
  panelNumber: number;
  description: string;
  location: string;
  characters: string[];
  photographyPlan?: {
    composition: string;
    lighting: string;
    colorPalette: string;
    atmosphere: string;
    technicalNotes?: string;
  };
  actingNotes?: Array<{
    character: string;
    action: string;
  }>;
}

export interface ClipStoryboardPanels {
  clipId: string;
  clipIndex: number;
  finalPanels: StoryboardPanel[];
}

export interface ScriptToStoryboardOrchestratorResult {
  clipPanels: ClipStoryboardPanels[];
  summary: {
    clipCount: number;
    totalPanelCount: number;
    totalStepCount: number;
  };
}

// ============ JSON Parse Error ============

export class JsonParseError extends Error {
  rawText: string;
  constructor(message: string, rawText: string) {
    super(message);
    this.name = 'JsonParseError';
    this.rawText = rawText;
  }
}
