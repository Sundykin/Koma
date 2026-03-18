/**
 * 项目服务
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import archiver from 'archiver';
import extract from 'extract-zip';

export interface ProjectStyleSnapshot {
  id: string;
  name: string;
  description: string;
  ttiStylePrefix: string;
  llmPromptSuffix: string;
  sourceType: 'builtin' | 'custom';
  sourcePresetId: string;
  createdAt: number;
}

export interface ProjectMeta {
  id: string;
  title: string;
  genre: string;
  mode: 'drama' | 'narration';
  status?: 'script' | 'storyboard' | 'generating' | 'completed';
  thumbnail?: string;
  episodes?: number;
  createdAt: number;
  updatedAt: number;
  llmConfigId?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  ttsConfigId?: string;
  stylePresetId?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  theme?: string;
  stylePrompt?: string;
}

// 项目索引文件结构
export interface ProjectsIndex {
  version: number;
  projects: ProjectMeta[];
}

export interface ExportOptions {
  excludeCache?: boolean;
  excludeTemp?: boolean;
}

function isProjectMeta(input: unknown): input is ProjectMeta {
  if (!input || typeof input !== 'object') return false;

  const meta = input as Partial<ProjectMeta>;
  return (
    typeof meta.id === 'string' &&
    meta.id.length > 0 &&
    typeof meta.title === 'string' &&
    meta.title.length > 0 &&
    typeof meta.genre === 'string' &&
    meta.genre.length > 0 &&
    (meta.mode === 'drama' || meta.mode === 'narration') &&
    typeof meta.createdAt === 'number' &&
    Number.isFinite(meta.createdAt) &&
    typeof meta.updatedAt === 'number' &&
    Number.isFinite(meta.updatedAt)
  );
}

function createDefaultTimeline() {
  return {
    id: `timeline-${Date.now()}`,
    duration: 0,
    tracks: [
      {
        id: `video-${Date.now()}`,
        name: '视频轨道 1',
        type: 'video',
        muted: false,
        locked: false,
        visible: true,
        height: 60,
        clips: [],
      },
      {
        id: `audio-${Date.now()}`,
        name: '音频轨道 1',
        type: 'audio',
        muted: false,
        locked: false,
        visible: true,
        height: 40,
        clips: [],
      },
      {
        id: `subtitle-${Date.now()}`,
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

export class ProjectService {
  private storageRoot: string = '';

  async init(rootPath?: string | null): Promise<string> {
    if (rootPath) {
      this.storageRoot = rootPath;
    } else {
      const home = app.getPath('home');
      this.storageRoot = path.join(home, '.koma');
    }

    await fs.promises.mkdir(this.storageRoot, { recursive: true });
    await fs.promises.mkdir(path.join(this.storageRoot, 'projects'), { recursive: true });

    // 确保索引文件存在
    const indexPath = this.getIndexPath();
    if (!fs.existsSync(indexPath)) {
      await this.rebuildIndex();
    }

    return this.storageRoot;
  }

  // ========== 索引管理 ==========

  private getIndexPath(): string {
    return path.join(this.storageRoot, 'projects-index.json');
  }

  async loadProjectsIndex(): Promise<ProjectsIndex> {
    const indexPath = this.getIndexPath();
    try {
      const content = await fs.promises.readFile(indexPath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<ProjectsIndex>;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) {
        return this.rebuildIndex();
      }

      return {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        projects: parsed.projects.filter(isProjectMeta),
      };
    } catch {
      return this.rebuildIndex();
    }
  }

  async saveProjectsIndex(index: ProjectsIndex): Promise<void> {
    const indexPath = this.getIndexPath();
    await fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  // 重建索引（遍历项目目录）
  async rebuildIndex(): Promise<ProjectsIndex> {
    const projectsDir = path.join(this.storageRoot, 'projects');
    const projects: ProjectMeta[] = [];

    try {
      const dirs = await fs.promises.readdir(projectsDir);
      for (const dir of dirs) {
        const metaPath = path.join(projectsDir, dir, 'meta.json');
        try {
          const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
          if (isProjectMeta(meta)) {
            projects.push(meta);
          }
        } catch {
          // 跳过无效项目
        }
      }
    } catch {
      // 目录不存在
    }

    const index: ProjectsIndex = { version: 1, projects };
    await this.saveProjectsIndex(index);
    return index;
  }

  // ========== 项目 CRUD ==========

  async listProjects(): Promise<ProjectMeta[]> {
    const index = await this.loadProjectsIndex();
    // 按更新时间降序排列
    return index.projects.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async createProject(meta: ProjectMeta): Promise<ProjectMeta> {
    if (!isProjectMeta(meta)) {
      throw new Error('Invalid project meta');
    }

    const projectDir = path.join(this.storageRoot, 'projects', meta.id);
    if (fs.existsSync(projectDir)) {
      throw new Error(`Project already exists: ${meta.id}`);
    }

    // 创建完整的项目目录结构
    await fs.promises.mkdir(projectDir, { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'assets', 'images'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'assets', 'videos'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'assets', 'audio'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'assets', 'fonts'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'shots'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'cache', 'thumbnails'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'cache', 'waveforms'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'cache', 'previews'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'exports'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'temp'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'episodes'), { recursive: true });

    // 保存项目元数据
    const metaPath = path.join(projectDir, 'meta.json');
    await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2));
    await fs.promises.writeFile(path.join(projectDir, 'project.json'), JSON.stringify(meta, null, 2));
    await fs.promises.writeFile(path.join(projectDir, 'timeline.json'), JSON.stringify(createDefaultTimeline(), null, 2));
    await fs.promises.writeFile(path.join(projectDir, 'characters.json'), '[]');
    await fs.promises.writeFile(path.join(projectDir, 'scenes.json'), '[]');
    await fs.promises.writeFile(path.join(projectDir, 'props.json'), '[]');
    await fs.promises.writeFile(path.join(projectDir, 'shots.json'), '[]');
    await fs.promises.writeFile(path.join(projectDir, 'assets.json'), '[]');

    // 同步更新索引
    const index = await this.loadProjectsIndex();
    index.projects.push(meta);
    await this.saveProjectsIndex(index);

    return meta;
  }

  async updateProject(projectId: string, updates: Partial<ProjectMeta>): Promise<ProjectMeta> {
    const projectDir = path.join(this.storageRoot, 'projects', projectId);
    const metaPath = path.join(projectDir, 'meta.json');

    // 读取现有元数据
    const existingMeta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8')) as ProjectMeta;

    // 合并更新
    const updatedMeta: ProjectMeta = {
      ...existingMeta,
      ...updates,
      id: projectId, // 确保 id 不变
      updatedAt: Date.now(),
    };

    if (!isProjectMeta(updatedMeta)) {
      throw new Error(`Invalid project update: ${projectId}`);
    }

    // 保存元数据
    await fs.promises.writeFile(metaPath, JSON.stringify(updatedMeta, null, 2));
    await fs.promises.writeFile(path.join(projectDir, 'project.json'), JSON.stringify(updatedMeta, null, 2));

    // 同步更新索引
    const index = await this.loadProjectsIndex();
    const projectIndex = index.projects.findIndex(p => p.id === projectId);
    if (projectIndex !== -1) {
      index.projects[projectIndex] = updatedMeta;
    } else {
      index.projects.push(updatedMeta);
    }
    await this.saveProjectsIndex(index);

    return updatedMeta;
  }

  async deleteProject(projectId: string): Promise<{ success: boolean }> {
    const projectDir = path.join(this.storageRoot, 'projects', projectId);

    // 删除项目目录
    try {
      await fs.promises.rm(projectDir, { recursive: true, force: true });
    } catch (err) {
      console.error('删除项目目录失败:', err);
      throw err;
    }

    // 从索引中移除
    const index = await this.loadProjectsIndex();
    index.projects = index.projects.filter(p => p.id !== projectId);
    await this.saveProjectsIndex(index);

    // 从最近项目中移除
    try {
      const recentPath = path.join(this.storageRoot, 'recent-projects.json');
      if (fs.existsSync(recentPath)) {
        const recent = JSON.parse(await fs.promises.readFile(recentPath, 'utf-8'));
        if (Array.isArray(recent)) {
          const filtered = recent.filter((r: any) => r.id !== projectId);
          await fs.promises.writeFile(recentPath, JSON.stringify(filtered, null, 2));
        }
      }
    } catch {
      // 忽略最近项目更新失败
    }

    return { success: true };
  }

  async loadProject(projectId: string): Promise<ProjectMeta> {
    const projectDir = path.join(this.storageRoot, 'projects', projectId);
    const metaPath = path.join(projectDir, 'meta.json');
    const projectPath = path.join(projectDir, 'project.json');

    try {
      const project = JSON.parse(await fs.promises.readFile(projectPath, 'utf-8'));
      if (isProjectMeta(project)) return project;
    } catch {}

    const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
    if (!isProjectMeta(meta)) {
      throw new Error(`Invalid project meta: ${projectId}`);
    }
    return meta;
  }

  async saveProject(projectId: string, data: any): Promise<{ success: boolean }> {
    await this.updateProject(projectId, data);
    return { success: true };
  }

  // 导出项目为 .koma.zip
  async exportProject(
    projectId: string,
    destPath: string,
    options: ExportOptions = {}
  ): Promise<{ success: boolean; path: string }> {
    const projectDir = path.join(this.storageRoot, 'projects', projectId);
    const { excludeCache = true, excludeTemp = true } = options;

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', () => {
        resolve({ success: true, path: destPath });
      });

      archive.on('error', (err: Error) => {
        reject(err);
      });

      archive.pipe(output);

      // 添加项目文件
      archive.glob('**/*', {
        cwd: projectDir,
        ignore: [
          ...(excludeCache ? ['cache/**'] : []),
          ...(excludeTemp ? ['temp/**'] : []),
        ],
      });

      archive.finalize();
    });
  }

  // 导入项目从 .koma.zip
  async importProject(
    zipPath: string,
    newProjectId?: string
  ): Promise<{ success: boolean; projectId: string; meta: ProjectMeta }> {
    const tempDir = path.join(this.storageRoot, 'temp_import_' + Date.now());

    try {
      // 解压到临时目录
      await extract(zipPath, { dir: tempDir });

      // 读取项目元数据
      let metaPath = path.join(tempDir, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        metaPath = path.join(tempDir, 'project.json');
      }

      const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
      const originalMeta = JSON.parse(metaContent);
      if (!isProjectMeta(originalMeta)) {
        throw new Error('Invalid project package');
      }

      // 生成新的项目ID（避免冲突）
      const projectId = newProjectId || `${originalMeta.id}_imported_${Date.now()}`;
      const projectDir = path.join(this.storageRoot, 'projects', projectId);

      // 移动到项目目录
      await fs.promises.mkdir(projectDir, { recursive: true });
      await this.copyDir(tempDir, projectDir);

      // 更新元数据
      const meta: ProjectMeta = {
        ...originalMeta,
        id: projectId,
        updatedAt: Date.now(),
      };

      await fs.promises.writeFile(
        path.join(projectDir, 'meta.json'),
        JSON.stringify(meta, null, 2)
      );
      await fs.promises.writeFile(
        path.join(projectDir, 'project.json'),
        JSON.stringify(meta, null, 2)
      );

      // 创建必要的目录结构
      await fs.promises.mkdir(path.join(projectDir, 'cache', 'thumbnails'), { recursive: true });
      await fs.promises.mkdir(path.join(projectDir, 'cache', 'waveforms'), { recursive: true });
      await fs.promises.mkdir(path.join(projectDir, 'cache', 'previews'), { recursive: true });
      await fs.promises.mkdir(path.join(projectDir, 'temp'), { recursive: true });

      const index = await this.loadProjectsIndex();
      const projectIndex = index.projects.findIndex(project => project.id === projectId);
      if (projectIndex >= 0) {
        index.projects[projectIndex] = meta;
      } else {
        index.projects.push(meta);
      }
      await this.saveProjectsIndex(index);

      // 清理临时目录
      await fs.promises.rm(tempDir, { recursive: true, force: true });

      return { success: true, projectId, meta };
    } catch (err) {
      // 清理临时目录
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {}
      throw err;
    }
  }

  // 递归复制目录
  private async copyDir(src: string, dest: string): Promise<void> {
    const entries = await fs.promises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fs.promises.mkdir(destPath, { recursive: true });
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }
}

export const projectService = new ProjectService();
export default projectService;
