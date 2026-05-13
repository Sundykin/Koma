/**
 * 二创工作台（R4）数据模型 —— 前端 mock 阶段使用，
 * 等 new-api 真接通后由 IPC 返回结构等同的数据。
 *
 * 字段集是 spec/video-diagnostic-report 与 spec/modification-workbench 的浅版。
 */

export type DimensionKind =
  | 'meta' | 'character' | 'scene' | 'shot' | 'script' | 'wardrobe'
  | 'action' | 'lighting' | 'ocr' | 'music' | 'risk' | 'feasibility' | 'prompts';

export interface SourceMedia {
  id: string;
  title: string;
  episodeNo?: number;
  durationMs: number;
  resolution: { w: number; h: number; fps: number };
  thumbnailUrl?: string;
  /** 派生自哪个版本 */
  parentId?: string;
  derivedFromPlanId?: string;
  createdAt: number;
}

export interface Character {
  id: string;
  name: string;
  thumbnailUrl?: string;
  screenTimePct: number;
  shotCount: number;
  closeUpCount: number;
  pairings: Array<{ characterId: string; sharedShots: number }>;
}

export interface Shot {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  shotType: '特写' | '近景' | '中景' | '全景' | '远景';
  cameraMotion: '固定' | '推' | '拉' | '摇' | '移' | '跟';
  characterIds: string[];
  sceneId: string;
  thumbnailUrl?: string;
  riskScore: number; // 0-1
}

export interface Scene {
  id: string;
  kind: '室内' | '室外' | '车内' | '夜景' | '日景';
  daytime: '清晨' | '白天' | '黄昏' | '夜晚';
  durationMs: number;
  shotIds: string[];
}

export interface ScriptLine {
  id: string;
  shotId: string;
  speakerCharacterId: string | null;
  text: string;
  startMs: number;
  endMs: number;
  emotion?: '平静' | '愤怒' | '悲伤' | '欢快' | '紧张';
}

export interface WardrobeUnit {
  id: string;
  characterId: string;
  episodeNo: number;
  description: string;
  colorHex: string;
  shotIds: string[];
}

export interface ActionSegment {
  id: string;
  startMs: number;
  endMs: number;
  kind: '对话' | '动作' | '亲密' | '打戏' | '奔跑';
  intensity: number; // 0-1
}

export interface OnScreenText {
  id: string;
  shotId: string;
  bbox: [number, number, number, number];
  text: string;
}

export interface MusicSegment {
  id: string;
  startMs: number;
  endMs: number;
  mood: '紧张' | '欢快' | '悲伤' | '神秘' | '宁静';
  hasVocals: boolean;
}

export interface RiskMark {
  id: string;
  shotId: string;
  kind: '强光' | '侧脸' | '遮挡' | '快速运动' | '特写超长';
  severity: number; // 0-1
}

export interface FeasibilityMark {
  shotId: string;
  faceSwapLite: 'easy' | 'medium' | 'hard';
  faceSwapPro: 'easy' | 'medium' | 'hard';
  bodyReshape: 'easy' | 'medium' | 'na';
  wardrobe: 'easy' | 'medium' | 'hard';
}

export interface DiagnosticReport {
  id: string;
  sourceMediaId: string;
  generatedAt: number;
  durationMs: number;
  /** 12 维度逐维状态 */
  dimensions: Record<DimensionKind, { status: 'ok' | 'partial' | 'failed'; coverage: number }>;
  characters: Character[];
  scenes: Scene[];
  shots: Shot[];
  scriptLines: ScriptLine[];
  wardrobeUnits: WardrobeUnit[];
  actions: ActionSegment[];
  onScreenTexts: OnScreenText[];
  musicSegments: MusicSegment[];
  riskMarks: RiskMark[];
  feasibility: FeasibilityMark[];
}

// —— 修改单 ——————————————————————————————————————————————————

export type ModificationKind =
  | 'face_swap' | 'body_reshape' | 'wardrobe' | 'aspect_ratio'
  | 'language_dub' | 'stylization';

export interface ModificationItem {
  itemId: string;
  kind: ModificationKind;
  /** 应用范围摘要文本（"全片该角色" / "S03 镜头 12-45" 等）*/
  scopeText: string;
  /** 涉及的 shot 数（决定估时基数）*/
  shotCount: number;
  /** 业务参数 */
  params: Record<string, unknown>;
  estUnits: number;
  estDurationSec: number;
  feasibilityScore: number; // 0-1
}

export interface ModificationPlan {
  planId: string;
  reportId: string;
  sourceMediaId: string;
  items: ModificationItem[];
  createdAt: number;
  /** DAG 依赖（mock 用层级序号即可） */
  dagLayers: string[][]; // 每层 itemId 数组
}

// —— 任务 ——————————————————————————————————————————————————

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface CloudJob {
  jobId: string;
  capability: ModificationKind;
  planId: string;
  itemId: string;
  status: JobStatus;
  progress: number; // 0-1
  etaSec?: number;
  currentStage?: string;
  startedAt: number;
  finishedAt?: number;
  errorMessage?: string;
  outputAvailable?: boolean;
  outputCount?: number;
}
