/**
 * 项目控制器
 */
import { BaseController } from './base';
import { services } from '../service';
import type { ProjectMeta, ExportOptions, ProjectsIndex } from '../service/project';

export class ProjectController extends BaseController {
  async list(): Promise<ProjectMeta[]> {
    return services.project.listProjects();
  }

  async create(args: ProjectMeta): Promise<ProjectMeta> {
    return services.project.createProject(args);
  }

  async load(args: { projectId: string }): Promise<ProjectMeta> {
    return services.project.loadProject(args.projectId);
  }

  async save(args: { projectId: string; data: any }): Promise<{ success: boolean }> {
    return services.project.saveProject(args.projectId, args.data);
  }

  async update(args: { projectId: string; updates: Partial<ProjectMeta> }): Promise<ProjectMeta> {
    return services.project.updateProject(args.projectId, args.updates);
  }

  async delete(args: { projectId: string }): Promise<{ success: boolean }> {
    return services.project.deleteProject(args.projectId);
  }

  async rebuildIndex(): Promise<ProjectsIndex> {
    return services.project.rebuildIndex();
  }

  async export(args: {
    projectId: string;
    destPath: string;
    options?: ExportOptions;
  }): Promise<{ success: boolean; path: string }> {
    return services.project.exportProject(args.projectId, args.destPath, args.options);
  }

  async import(args: {
    zipPath: string;
    newProjectId?: string;
  }): Promise<{ success: boolean; projectId: string; meta: ProjectMeta }> {
    return services.project.importProject(args.zipPath, args.newProjectId);
  }
}

export const projectController = new ProjectController();
export default projectController;
