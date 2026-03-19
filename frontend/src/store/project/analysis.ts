/**
 * 剧集解析结果存储
 */
import { electronService } from '../../services/electronService';
import type { EpisodeAnalysis, Shot } from '../../types';
import type { TimelineData } from '../../types/editor';
import { getProjectPath } from './core';
import { saveEpisode } from './episodes';

export async function saveEpisodeAnalysis(
  projectId: string,
  episodeId: string,
  analysis: Omit<EpisodeAnalysis, 'episodeId' | 'createdAt' | 'updatedAt'>
): Promise<EpisodeAnalysis> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const projectPath = await getProjectPath(projectId);
  const episodePath = `${projectPath}/episodes/${episodeId}`;
  const now = Date.now();

  const existing = await loadEpisodeAnalysis(projectId, episodeId);
  const completedStages = Array.from(new Set([
    ...(existing?.completedStages || []),
    ...(analysis.completedStages || []),
  ]));
  const result: EpisodeAnalysis = {
    episodeId,
    characterRefs: analysis.characterRefs,
    sceneRefs: analysis.sceneRefs,
    propRefs: analysis.propRefs,
    completedStages,
    shots: analysis.shots,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await electronService.fs.writeFile(
    `${episodePath}/analysis.json`,
    JSON.stringify(result, null, 2)
  );

  await saveEpisode(projectId, episodeId, { hasAnalysis: true });

  return result;
}

export async function loadEpisodeAnalysis(
  projectId: string,
  episodeId: string
): Promise<EpisodeAnalysis | null> {
  if (!electronService.isElectron()) return null;

  try {
    const projectPath = await getProjectPath(projectId);
    const filePath = `${projectPath}/episodes/${episodeId}/analysis.json`;
    const exists = await electronService.fs.exists(filePath);
    if (!exists) return null;
    const data = await electronService.fs.readFile(filePath);
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function loadEpisodeShots(
  projectId: string,
  episodeId: string
): Promise<Shot[]> {
  const analysis = await loadEpisodeAnalysis(projectId, episodeId);
  return Array.isArray(analysis?.shots) ? analysis.shots.filter(Boolean) : [];
}

export async function saveEpisodeShots(
  projectId: string,
  episodeId: string,
  shots: Shot[]
): Promise<void> {
  if (!electronService.isElectron()) return;

  const projectPath = await getProjectPath(projectId);
  const episodePath = `${projectPath}/episodes/${episodeId}`;
  const now = Date.now();

  let analysis = await loadEpisodeAnalysis(projectId, episodeId);
  if (!analysis) {
    analysis = {
      episodeId,
      characterRefs: [],
      sceneRefs: [],
      propRefs: [],
      completedStages: [],
      shots: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  analysis.shots = shots;
  analysis.updatedAt = now;

  // 从 shots 中自动提取资产引用，合并到 refs（保留已有引用）
  const charSet = new Set(analysis.characterRefs || []);
  const sceneSet = new Set(analysis.sceneRefs || []);
  const propSet = new Set(analysis.propRefs || []);
  for (const shot of shots) {
    for (const id of shot.characters || []) { if (id) charSet.add(id); }
    for (const id of shot.scenes || []) { if (id) sceneSet.add(id); }
    for (const id of shot.props || []) { if (id) propSet.add(id); }
  }
  analysis.characterRefs = [...charSet];
  analysis.sceneRefs = [...sceneSet];
  analysis.propRefs = [...propSet];

  await electronService.fs.mkdir(episodePath);
  await electronService.fs.writeFile(
    `${episodePath}/analysis.json`,
    JSON.stringify(analysis, null, 2)
  );

  await saveEpisode(projectId, episodeId, { hasAnalysis: true });
}

export async function loadEpisodeTimeline(
  projectId: string,
  episodeId: string
): Promise<TimelineData | null> {
  if (!electronService.isElectron()) return null;

  const projectPath = await getProjectPath(projectId);
  const timelinePath = `${projectPath}/episodes/${episodeId}/timeline.json`;

  try {
    const exists = await electronService.fs.exists(timelinePath);
    if (!exists) return null;
    const content = await electronService.fs.readFile(timelinePath);
    return JSON.parse(content) as TimelineData;
  } catch {
    return null;
  }
}

export async function saveEpisodeTimeline(
  projectId: string,
  episodeId: string,
  data: Omit<TimelineData, 'updatedAt'>
): Promise<void> {
  if (!electronService.isElectron()) return;

  const projectPath = await getProjectPath(projectId);
  const episodePath = `${projectPath}/episodes/${episodeId}`;

  const timelineData: TimelineData = {
    ...data,
    updatedAt: Date.now(),
  };

  await electronService.fs.mkdir(episodePath);
  await electronService.fs.writeFile(
    `${episodePath}/timeline.json`,
    JSON.stringify(timelineData, null, 2)
  );
}

export async function updateShot(
  projectId: string,
  episodeId: string,
  shotId: string,
  updates: Partial<Shot>
): Promise<Shot | null> {
  const shots = await loadEpisodeShots(projectId, episodeId);
  const index = shots.findIndex(s => s.id === shotId);
  if (index === -1) return null;

  const updatedShot = { ...shots[index], ...updates };
  shots[index] = updatedShot;
  await saveEpisodeShots(projectId, episodeId, shots);

  return updatedShot;
}

/**
 * 从指定剧集的分析数据中移除资产引用（refs + shot bindings）
 */
export async function removeAssetFromAnalysis(
  projectId: string,
  episodeId: string,
  assetId: string,
  assetType: 'character' | 'scene' | 'prop'
): Promise<void> {
  if (!electronService.isElectron()) return;

  const analysis = await loadEpisodeAnalysis(projectId, episodeId);
  if (!analysis) return;

  const refsKey = assetType === 'character' ? 'characterRefs'
    : assetType === 'scene' ? 'sceneRefs'
    : 'propRefs';
  const shotKey = assetType === 'character' ? 'characters'
    : assetType === 'scene' ? 'scenes'
    : 'props';

  const hadRef = analysis[refsKey]?.includes(assetId);
  const filteredRefs = (analysis[refsKey] || []).filter((id: string) => id !== assetId);

  let shotsModified = false;
  const updatedShots = (analysis.shots || []).map(shot => {
    const arr = (shot as Record<string, unknown>)[shotKey] as string[] | undefined;
    if (arr?.includes(assetId)) {
      shotsModified = true;
      return { ...shot, [shotKey]: arr.filter(id => id !== assetId) };
    }
    return shot;
  });

  if (!hadRef && !shotsModified) return;

  const projectPath = await getProjectPath(projectId);
  const episodePath = `${projectPath}/episodes/${episodeId}`;
  const updated = {
    ...analysis,
    [refsKey]: filteredRefs,
    shots: updatedShots,
    updatedAt: Date.now(),
  };

  await electronService.fs.writeFile(
    `${episodePath}/analysis.json`,
    JSON.stringify(updated, null, 2)
  );
}

export async function deleteEpisodeAnalysis(
  projectId: string,
  episodeId: string
): Promise<boolean> {
  if (!electronService.isElectron()) return false;

  try {
    const projectPath = await getProjectPath(projectId);
    const filePath = `${projectPath}/episodes/${episodeId}/analysis.json`;
    const exists = await electronService.fs.exists(filePath);
    if (exists) {
      await electronService.fs.remove(filePath);
      await saveEpisode(projectId, episodeId, { hasAnalysis: false });
    }
    return true;
  } catch {
    return false;
  }
}
