/**
 * 最近项目管理（SQLite 版本）
 */
import type { RecentProject } from '../../types';
import { getConfigAPI } from '../../services/configBridge';
import { ensureConfigReady, useConfigStore } from '../useConfigStore';

async function rowToEntry(projectId: string, lastOpenedAt: number): Promise<RecentProject> {
  // RecentProject 的完整元数据需要从 projects 表取。本 store 只维护 {id, lastOpened}，
  // 富字段（title/thumbnail/...）在消费端按需二次解析。
  return {
    id: projectId,
    title: projectId,
    lastOpened: lastOpenedAt,
  } as RecentProject;
}

export async function loadRecentProjects(): Promise<RecentProject[]> {
  await ensureConfigReady();
  const rows = useConfigStore.getState().recent;
  return Promise.all(rows.map((r) => rowToEntry(r.project_id, r.last_opened_at)));
}

export async function saveRecentProjects(projects: RecentProject[]): Promise<void> {
  // SQLite 后端以 touch/remove 粒度写；此处遍历目标列表逐项 touch，
  // 并删除现有列表里缺失的条目。
  const api = getConfigAPI();
  await ensureConfigReady();
  const current = useConfigStore.getState().recent;
  const incomingIds = new Set(projects.map((p) => p.id));

  for (const row of current) {
    if (!incomingIds.has(row.project_id)) {
      await api.recent.remove(row.project_id);
    }
  }
  for (const project of projects) {
    await api.recent.touch(project.id);
  }
}

export async function addRecentProject(project: RecentProject): Promise<void> {
  const api = getConfigAPI();
  await api.recent.touch(project.id);
  await useConfigStore.getState().refreshDomain('recent');
}

export async function removeRecentProject(projectId: string): Promise<void> {
  const api = getConfigAPI();
  await api.recent.remove(projectId);
  await useConfigStore.getState().refreshDomain('recent');
}
