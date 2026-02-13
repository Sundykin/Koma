/**
 * 最近项目管理
 * 通过 configBridge 访问后端
 */
import { configBridge } from '../../services/configBridge';
import type { RecentProject } from '../../types';

export async function loadRecentProjects(): Promise<RecentProject[]> {
  try {
    const remote = await configBridge.get<RecentProject[]>('recent-projects');
    if (remote && Array.isArray(remote)) return remote;
  } catch (err) {
    console.error('[loadRecentProjects] configBridge error:', err);
  }
  return [];
}

export async function saveRecentProjects(projects: RecentProject[]): Promise<void> {
  await configBridge.set('recent-projects', projects.slice(0, 20));
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
