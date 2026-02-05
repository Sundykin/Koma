/**
 * 项目核心管理
 * 项目创建、加载、保存、删除
 */
import { v4 as uuidv4 } from 'uuid';
import { electronService } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../storageConfig';
import { addRecentProject, getDefaultLLMConfig } from '../globalStore';
import type { ProjectMeta, Timeline } from '../../types';
import { DEFAULT_VIDEO_RESOLUTION } from '../../constants/dimensions';

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
    const projectPath = await getProjectPath(projectId);

    await electronService.fs.mkdir(projectPath);
    await electronService.fs.mkdir(`${projectPath}/assets/images`);
    await electronService.fs.mkdir(`${projectPath}/assets/videos`);
    await electronService.fs.mkdir(`${projectPath}/assets/audio`);
    await electronService.fs.mkdir(`${projectPath}/assets/fonts`);
    await electronService.fs.mkdir(`${projectPath}/shots`);
    await electronService.fs.mkdir(`${projectPath}/cache/thumbnails`);
    await electronService.fs.mkdir(`${projectPath}/cache/waveforms`);
    await electronService.fs.mkdir(`${projectPath}/cache/previews`);
    await electronService.fs.mkdir(`${projectPath}/exports`);
    await electronService.fs.mkdir(`${projectPath}/temp`);

    await electronService.fs.writeFile(
      `${projectPath}/project.json`,
      JSON.stringify(project, null, 2)
    );

    const timeline = createDefaultTimeline();
    await electronService.fs.writeFile(
      `${projectPath}/timeline.json`,
      JSON.stringify(timeline, null, 2)
    );

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
    resolution: { width: DEFAULT_VIDEO_RESOLUTION.width, height: DEFAULT_VIDEO_RESOLUTION.height },
  };
}

export async function loadProject(projectId: string): Promise<ProjectMeta | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(`${projectPath}/project.json`);
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveProject(project: ProjectMeta): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  const projectPath = await getProjectPath(project.id);
  project.updatedAt = Date.now();
  await electronService.fs.writeFile(
    `${projectPath}/project.json`,
    JSON.stringify(project, null, 2)
  );
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

  const projectPath = await getProjectPath(projectId);
  await electronService.fs.remove(projectPath);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  if (!electronService.isElectron()) {
    return [];
  }

  try {
    const root = await getProjectsRoot();
    const entries = await electronService.fs.readdir(root);
    const projects: ProjectMeta[] = [];

    for (const entry of entries) {
      const projectFile = `${root}/${entry}/project.json`;
      const exists = await electronService.fs.exists(projectFile);
      if (!exists) continue;

      try {
        const data = await electronService.fs.readFile(projectFile);
        projects.push(JSON.parse(data));
      } catch {
        // skip invalid projects
      }
    }

    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}
