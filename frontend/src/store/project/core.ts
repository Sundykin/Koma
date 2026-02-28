/**
 * 项目核心管理
 * 项目创建、加载、保存、删除
 */
import { v4 as uuidv4 } from 'uuid';
import { electronService } from '../../services/electronService';
import { persistenceClient } from '../../utils/ipcRenderer';
import { getStorageConfig, initStorageConfig } from '../storageConfig';
import { addRecentProject, getDefaultLLMConfig } from '../globalStore';
import type { ProjectMeta, Timeline } from '../../types';

// ========== 路径工具 ==========

export async function getProjectsRoot(): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/projects`;
}

export async function getProjectPath(projectId: string): Promise<string> {
  const root = await getProjectsRoot();
  return `${root}/${projectId}`;
}

// ========== 项目管理 ==========

export async function createProject(
  title: string,
  genre: string,
  mode: 'drama' | 'narration',
  llmConfigId?: string
): Promise<ProjectMeta> {
  const projectId = uuidv4();
  const now = Date.now();

  let finalLLMConfigId = llmConfigId;
  if (!finalLLMConfigId) {
    const defaultConfig = await getDefaultLLMConfig();
    finalLLMConfigId = defaultConfig?.id;
  }

  const project: ProjectMeta = {
    id: projectId,
    title,
    genre,
    mode,
    createdAt: now,
    updatedAt: now,
    llmConfigId: finalLLMConfigId,
  };

  if (electronService.isElectron()) {
    await electronService.project.create(project as any);

    const timeline = createDefaultTimeline();
    await persistenceClient.save(projectId, 'project', project);
    await persistenceClient.save(projectId, 'timeline', timeline);

    const projectPath = await getProjectPath(projectId);
    await addRecentProject({
      id: projectId,
      title,
      path: projectPath,
      lastOpened: now,
    });
  }

  return project;
}

function createDefaultTimeline(): Timeline {
  return {
    id: uuidv4(),
    duration: 0,
    tracks: [
      {
        id: uuidv4(),
        name: '视频轨道 1',
        type: 'video',
        muted: false,
        locked: false,
        visible: true,
        height: 60,
        clips: [],
      },
      {
        id: uuidv4(),
        name: '音频轨道 1',
        type: 'audio',
        muted: false,
        locked: false,
        visible: true,
        height: 40,
        clips: [],
      },
      {
        id: uuidv4(),
        name: '字幕轨道',
        type: 'subtitle',
        muted: false,
        locked: false,
        visible: true,
        height: 30,
        clips: [],
      },
    ],
    fps: 30,
    resolution: { width: 1920, height: 1080 },
  };
}

export async function loadProject(projectId: string): Promise<ProjectMeta | null> {
  try {
    const project = await persistenceClient.findById<ProjectMeta>(projectId, 'project', projectId);
    return project || null;
  } catch {
    return null;
  }
}

export async function saveProject(project: ProjectMeta): Promise<void> {
  project.updatedAt = Date.now();
  await persistenceClient.save(project.id, 'project', project);
}

export async function updateProjectLLMConfig(
  projectId: string,
  llmConfigId: string | null
): Promise<ProjectMeta | null> {
  const project = await loadProject(projectId);
  if (!project) return null;

  project.llmConfigId = llmConfigId || undefined;
  await saveProject(project);
  return project;
}

export async function deleteProject(projectId: string): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  await electronService.project.remove(projectId);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  if (!electronService.isElectron()) {
    return [];
  }

  const projects = await electronService.project.list();
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
}
