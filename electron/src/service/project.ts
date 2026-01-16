/**
 * 项目服务
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import archiver from 'archiver';
import extract from 'extract-zip';

export interface ProjectMeta {
  id: string;
  title: string;
  genre: string;
  mode: 'drama' | 'narration';
  createdAt: number;
  updatedAt: number;
}

export interface ExportOptions {
  excludeCache?: boolean;
  excludeTemp?: boolean;
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

    return this.storageRoot;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const projectsDir = path.join(this.storageRoot, 'projects');
    try {
      const dirs = await fs.promises.readdir(projectsDir);
      const projects: ProjectMeta[] = [];

      for (const dir of dirs) {
        const metaPath = path.join(projectsDir, dir, 'meta.json');
        try {
          const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
          projects.push(meta);
        } catch {
          // 跳过无效项目
        }
      }
      return projects;
    } catch {
      return [];
    }
  }

  async createProject(meta: ProjectMeta): Promise<ProjectMeta> {
    const projectDir = path.join(this.storageRoot, 'projects', meta.id);
    await fs.promises.mkdir(projectDir, { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'assets'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'shots'), { recursive: true });

    const metaPath = path.join(projectDir, 'meta.json');
    await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2));

    return meta;
  }

  async loadProject(projectId: string): Promise<ProjectMeta> {
    const metaPath = path.join(this.storageRoot, 'projects', projectId, 'meta.json');
    const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
    return meta;
  }

  async saveProject(projectId: string, data: any): Promise<{ success: boolean }> {
    const dataPath = path.join(this.storageRoot, 'projects', projectId, 'project.json');
    await fs.promises.writeFile(dataPath, JSON.stringify(data, null, 2));
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
      const originalMeta = JSON.parse(metaContent) as ProjectMeta;

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

      // 创建必要的目录结构
      await fs.promises.mkdir(path.join(projectDir, 'cache', 'thumbnails'), { recursive: true });
      await fs.promises.mkdir(path.join(projectDir, 'cache', 'waveforms'), { recursive: true });
      await fs.promises.mkdir(path.join(projectDir, 'cache', 'previews'), { recursive: true });
      await fs.promises.mkdir(path.join(projectDir, 'temp'), { recursive: true });

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
