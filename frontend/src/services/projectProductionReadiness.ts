import type { Character, Episode, EpisodeAnalysis, Prop, Scene, Shot } from '../types';
import type { TaskRecord } from './tasksIPC';
import {
  getCharacterCostumePhotoSource,
  getPropPreviewImageSource,
  getScenePreviewImageSource,
} from '../utils/mediaSelectors';

export type ProductionStageKey = 'script' | 'assets' | 'storyboard';
export type ProductionStageStatus = 'blocked' | 'incomplete' | 'running' | 'failed' | 'ready';
export type ProductionNextActionType =
  | 'select-episode'
  | 'write-script'
  | 'mark-script-ready'
  | 'analyze-script'
  | 'wait-script-analysis'
  | 'open-assets'
  | 'generate-shots'
  | 'wait-shot-analysis'
  | 'open-storyboard';

export interface ProductionStageReadiness {
  key: ProductionStageKey;
  status: ProductionStageStatus;
  done: number;
  total: number;
  label: string;
  detail: string;
  error?: string;
}

export interface MissingProductionAssets {
  characters: string[];
  scenes: string[];
  props: string[];
}

export interface ProductionNextAction {
  type: ProductionNextActionType;
  label: string;
  reason: string;
  disabled: boolean;
}

export interface ProjectProductionReadiness {
  stages: Record<ProductionStageKey, ProductionStageReadiness>;
  analysisComplete: boolean;
  missingAssets: MissingProductionAssets;
  missingAssetCount: number;
  shotCount: number;
  nextAction: ProductionNextAction;
}

export interface ProjectProductionReadinessInput {
  episode: Pick<Episode, 'id' | 'scriptText' | 'scriptReady' | 'hasAnalysis'> | null;
  analysis: Pick<
    EpisodeAnalysis,
    'characterRefs' | 'sceneRefs' | 'propRefs' | 'completedStages' | 'shots'
  > | null;
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  shots?: Shot[];
  tasks?: Array<Pick<TaskRecord, 'type' | 'status' | 'error' | 'updatedAt'>>;
}

const ACTIVE_STATUSES = new Set(['pending', 'running', 'processing']);
const FAILED_STATUSES = new Set(['failed', 'cancelled']);
const ANALYSIS_STAGES = ['characters', 'scenes', 'props'] as const;

function uniqueIds(ids?: string[]): string[] {
  return Array.from(new Set((ids || []).filter(Boolean)));
}

function latestTask(
  tasks: ProjectProductionReadinessInput['tasks'],
  type: 'script-analysis' | 'shot-analysis',
): ProjectProductionReadinessInput['tasks'][number] | undefined {
  return (tasks || [])
    .filter((task) => task.type === type)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function taskState(task?: ProjectProductionReadinessInput['tasks'][number]): {
  active: boolean;
  failed: boolean;
  error?: string;
} {
  return {
    active: Boolean(task && ACTIVE_STATUSES.has(task.status)),
    failed: Boolean(task && FAILED_STATUSES.has(task.status)),
    error: task?.error || undefined,
  };
}

function missingReferencedAssets<T extends { id: string }>(
  refs: string[] | undefined,
  assets: T[],
  getSource: (asset?: T) => string | undefined,
): string[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return uniqueIds(refs).filter((id) => {
    const asset = byId.get(id);
    return !asset || !getSource(asset);
  });
}

function stage(
  key: ProductionStageKey,
  status: ProductionStageStatus,
  done: number,
  total: number,
  label: string,
  detail: string,
  error?: string,
): ProductionStageReadiness {
  return { key, status, done, total, label, detail, error };
}

export function buildProjectProductionReadiness({
  episode,
  analysis,
  characters,
  scenes,
  props,
  shots,
  tasks = [],
}: ProjectProductionReadinessInput): ProjectProductionReadiness {
  const scriptText = episode?.scriptText?.trim() || '';
  const scriptTask = taskState(latestTask(tasks, 'script-analysis'));
  const shotTask = taskState(latestTask(tasks, 'shot-analysis'));
  const completedStages = new Set(analysis?.completedStages || []);
  const completedAnalysisStages = ANALYSIS_STAGES.filter((name) => completedStages.has(name));

  const missingAssets: MissingProductionAssets = {
    characters: missingReferencedAssets(
      analysis?.characterRefs,
      characters,
      getCharacterCostumePhotoSource,
    ),
    scenes: missingReferencedAssets(
      analysis?.sceneRefs,
      scenes,
      getScenePreviewImageSource,
    ),
    props: missingReferencedAssets(
      analysis?.propRefs,
      props,
      getPropPreviewImageSource,
    ),
  };
  const assetTotal = uniqueIds(analysis?.characterRefs).length
    + uniqueIds(analysis?.sceneRefs).length
    + uniqueIds(analysis?.propRefs).length;
  const missingAssetCount = missingAssets.characters.length
    + missingAssets.scenes.length
    + missingAssets.props.length;
  const readyAssetCount = Math.max(0, assetTotal - missingAssetCount);
  const currentShots = shots ?? analysis?.shots ?? [];
  const shotCount = currentShots.length;
  // 旧项目可能没有逐阶段标记，但 episode.hasAnalysis、资产引用或已落盘 shots
  // 都是比 UI 导航进度更强的真实生产证据；不能因此强迫用户重复解析。
  const analysisComplete = completedAnalysisStages.length === ANALYSIS_STAGES.length
    || Boolean(episode?.hasAnalysis)
    || assetTotal > 0
    || shotCount > 0;

  let scriptStage: ProductionStageReadiness;
  if (!episode) {
    scriptStage = stage('script', 'blocked', 0, 1, '未选择剧集', '请先从左侧选择或创建剧集');
  } else if (!scriptText) {
    scriptStage = stage('script', 'incomplete', 0, 1, '缺少剧本', '输入或导入剧本后继续');
  } else if (scriptTask.active) {
    scriptStage = stage(
      'script',
      'running',
      completedAnalysisStages.length,
      ANALYSIS_STAGES.length,
      '正在解析剧本',
      `已完成 ${completedAnalysisStages.length}/${ANALYSIS_STAGES.length} 个提取阶段`,
    );
  } else if (scriptTask.failed && !analysisComplete) {
    scriptStage = stage(
      'script',
      'failed',
      completedAnalysisStages.length,
      ANALYSIS_STAGES.length,
      '剧本解析失败',
      '已保存的剧本和阶段结果不会丢失，可直接重试',
      scriptTask.error,
    );
  } else if (!episode.scriptReady) {
    scriptStage = stage('script', 'incomplete', 0, 1, '待确认生产稿', '先确认字幕行格式，再提取资产');
  } else if (!analysisComplete) {
    scriptStage = stage(
      'script',
      'incomplete',
      completedAnalysisStages.length,
      ANALYSIS_STAGES.length,
      '待解析剧本',
      `已完成 ${completedAnalysisStages.length}/${ANALYSIS_STAGES.length} 个提取阶段`,
    );
  } else {
    scriptStage = stage('script', 'ready', 1, 1, '剧本已解析', '角色、场景、道具已提取');
  }

  let assetsStage: ProductionStageReadiness;
  if (scriptTask.active) {
    assetsStage = stage(
      'assets',
      'running',
      readyAssetCount,
      assetTotal,
      '正在提取资产',
      '解析结果会逐步写入项目资产库',
    );
  } else if (scriptTask.failed && !analysisComplete) {
    assetsStage = stage(
      'assets',
      'failed',
      readyAssetCount,
      assetTotal,
      '资产提取未完成',
      '重试剧本解析可从已完成阶段继续',
      scriptTask.error,
    );
  } else if (!analysisComplete) {
    assetsStage = stage('assets', 'blocked', 0, 0, '等待剧本解析', '完成解析后统计当前剧集素材');
  } else if (missingAssetCount > 0) {
    assetsStage = stage(
      'assets',
      'incomplete',
      readyAssetCount,
      assetTotal,
      `${missingAssetCount} 个素材待补图`,
      `角色 ${missingAssets.characters.length} · 场景 ${missingAssets.scenes.length} · 道具 ${missingAssets.props.length}`,
    );
  } else {
    assetsStage = stage(
      'assets',
      'ready',
      assetTotal,
      assetTotal,
      assetTotal > 0 ? '资产已就绪' : '无需额外资产',
      assetTotal > 0 ? `${assetTotal} 个当前剧集素材均有参考图` : '本集未提取角色、场景或道具',
    );
  }

  let storyboardStage: ProductionStageReadiness;
  if (shotTask.active) {
    storyboardStage = stage('storyboard', 'running', shotCount, Math.max(shotCount, 1), '正在生成分镜', '完成后会自动刷新镜头数量');
  } else if (shotTask.failed && shotCount === 0) {
    storyboardStage = stage('storyboard', 'failed', 0, 1, '分镜生成失败', '可以从当前剧本和资产状态直接重试', shotTask.error);
  } else if (shotCount > 0) {
    storyboardStage = stage('storyboard', 'ready', shotCount, shotCount, `已生成 ${shotCount} 镜`, missingAssetCount > 0 ? `仍有 ${missingAssetCount} 个资产缺少参考图` : '可进入分镜生成图片和视频');
  } else if (!analysisComplete) {
    storyboardStage = stage('storyboard', 'blocked', 0, 1, '等待资产提取', '剧本解析完成后可生成分镜');
  } else {
    storyboardStage = stage('storyboard', 'incomplete', 0, 1, '待生成分镜', missingAssetCount > 0 ? `可先补齐 ${missingAssetCount} 个资产素材，也可继续生成分镜` : '资产已就绪，可生成分镜');
  }

  let nextAction: ProductionNextAction;
  if (!episode) {
    nextAction = { type: 'select-episode', label: '选择剧集', reason: '请先从左侧选择或创建剧集', disabled: true };
  } else if (!scriptText) {
    nextAction = { type: 'write-script', label: '先输入剧本', reason: '在中间编辑器输入、生成或导入剧本', disabled: true };
  } else if (scriptTask.active) {
    nextAction = { type: 'wait-script-analysis', label: '剧本解析中', reason: '结果会逐步写入，无需停留在此页面', disabled: true };
  } else if (!episode.scriptReady) {
    nextAction = { type: 'mark-script-ready', label: '确认生产稿', reason: '确认当前内容已整理为可拆分的字幕行格式', disabled: false };
  } else if (!analysisComplete) {
    nextAction = { type: 'analyze-script', label: scriptTask.failed ? '重试解析剧本' : '解析剧本', reason: scriptTask.error || '提取角色、场景和道具', disabled: false };
  } else if (missingAssetCount > 0) {
    nextAction = { type: 'open-assets', label: `处理 ${missingAssetCount} 个缺失素材`, reason: '进入项目资产子视图，可批量生成或手动补图', disabled: false };
  } else if (shotTask.active) {
    nextAction = { type: 'wait-shot-analysis', label: '分镜生成中', reason: '任务完成后会自动刷新', disabled: true };
  } else if (shotCount === 0) {
    nextAction = { type: 'generate-shots', label: shotTask.failed ? '重试生成分镜' : '生成分镜', reason: shotTask.error || '基于当前剧本和资产生成镜头', disabled: false };
  } else {
    nextAction = { type: 'open-storyboard', label: `打开 ${shotCount} 个分镜`, reason: '继续生成图片、视频和处理镜间连续性', disabled: false };
  }

  return {
    stages: { script: scriptStage, assets: assetsStage, storyboard: storyboardStage },
    analysisComplete,
    missingAssets,
    missingAssetCount,
    shotCount,
    nextAction,
  };
}
