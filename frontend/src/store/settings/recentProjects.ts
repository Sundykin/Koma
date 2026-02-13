/**
 * 最近项目管理
 * 优先通过 configBridge 访问后端，fallback 旧逻辑
 */
import { electronService } from '../../services/electronService';
import { configBridge } from '../../services/configBridge';
import { getGlobalPath } from './core';
import type { RecentProject } from '../../types';

// 旧逻辑加载
async function loadLegacy(): Promise<RecentProject[]> {
  if (!electronService.isElectron()) {
    try {
      const data = localStorage.getItem('koma_recent_projects');
      if (data) return JSON.parse(data);
    } catch { /* ignore */ }
    return [];
  }
  try {
    const path = await getGlobalPath('recent-projects.json');
    const exists = await electronService.fs.exists(path);
    if (exists) {
      const data = await electronService.fs.readFile(path);
      return JSON.parse(data);
    }
  } catch { /* ignore */ }
  return [];
}

export async function loadRecentProjects(): Promise<RecentProject[]> {
  try {
    const remote = await configBridge.get<RecentProject[]>('recent-projects');
    if (remote && Array.isArray(remote) && remote.length > 0) {
      return remote;
    }
  } catch { /* fallback */ }
  // 后端无数据，走旧逻辑并同步
  const legacy = await loadLegacy();
  if (legacy.length > 0) {
    configBridge.set('recent-projects', legacy).catch(() => {});
  }
  return legacy;
}

export async function saveRecentProjects(projects: RecentProject[]): Promise<void> {
  const trimmed = projects.slice(0, 20);
  try {
    await configBridge.set('recent-projects', trimmed);
  } catch {
    // fallback
    if (!electronService.isElectron()) {
      localStorage.setItem('koma_recent_projects', JSON.stringify(trimmed));
      return;
    }
    const path = await getGlobalPath('recent-projects.json');
    await electronService.fs.writeFile(path, JSON.stringify(trimmed, null, 2));
  }
}

export async function addRecentProject(project: RecentProject): Promise<void> {
  const projects = await loadRecentProjects();
  const filtered = projects.filter((p) => p.id !== project.id);
  filtered.unshift({ ...project, lastOpened: Date.now() });
  await saveRecentProjects(filtered);
}

export async function removeRecentProject(projectId: string): Promise<void> {
  const projects = await loadRecentProjects();
  const filtered = projects.filter((p) => p.id !== projectId);
  await saveRecentProjects(filtered);
}
