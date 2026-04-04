import { BaseController } from './base';
import { ensureServicesReady, services } from '../service';
import type { LinghuiWorkspaceDocument } from '../../frontend/src/types/linghui';

class LinghuiController extends BaseController {
  async listWorkspaces() {
    await ensureServicesReady();
    return services.linghui.listWorkspaces();
  }

  async loadWorkspace(args: { workspaceId: string }) {
    await ensureServicesReady();
    return services.linghui.loadWorkspace(args.workspaceId);
  }

  async saveWorkspace(args: { doc: LinghuiWorkspaceDocument }) {
    await ensureServicesReady();
    return services.linghui.saveWorkspace(args.doc);
  }

  async createWorkspace(args: { name?: string }) {
    await ensureServicesReady();
    return services.linghui.createWorkspace(args.name || '');
  }

  async saveWorkspaceAs(args: { doc: LinghuiWorkspaceDocument; name?: string }) {
    await ensureServicesReady();
    return services.linghui.saveWorkspaceAs(args.doc, args.name);
  }

  async deleteWorkspace(args: { workspaceId: string }) {
    await ensureServicesReady();
    services.linghui.deleteWorkspace(args.workspaceId);
    return { success: true };
  }

  async importWorkspace(args: { filePath: string }) {
    await ensureServicesReady();
    return services.linghui.importWorkspace(args.filePath);
  }

  async exportWorkspace(args: { doc: LinghuiWorkspaceDocument; destPath: string }) {
    await ensureServicesReady();
    return { path: services.linghui.exportWorkspace(args.doc, args.destPath) };
  }

  async getWorkspaceDir(args: { workspaceId: string }) {
    await ensureServicesReady();
    return { path: services.linghui.getWorkspaceDir(args.workspaceId) };
  }

  async listWorkflowTemplates(args: { workspaceId: string }) {
    await ensureServicesReady();
    return services.linghui.listWorkflowTemplates(args.workspaceId);
  }

  async createWorkflowTemplate(args: {
    workspaceId: string;
    name: string;
    description?: string;
    snapshot: any;
    sourceGroupId?: string;
  }) {
    await ensureServicesReady();
    return services.linghui.createWorkflowTemplate(args);
  }

  async listWorkspaceAssets(args: { workspaceId: string }) {
    await ensureServicesReady();
    return services.linghui.listWorkspaceAssets(args.workspaceId);
  }

  async createWorkspaceAsset(args: {
    workspaceId: string;
    nodeId: string;
    nodeData: any;
    nodeRun?: any;
  }) {
    await ensureServicesReady();
    return services.linghui.createWorkspaceAsset(args);
  }

  async listWorkspaceHistoryRecords(args: { workspaceId: string }) {
    await ensureServicesReady();
    return services.linghui.listWorkspaceHistoryRecords(args.workspaceId);
  }

  async createWorkspaceHistoryRecord(args: {
    workspaceId: string;
    nodeId: string;
    nodeData: any;
    nodeRun?: any;
  }) {
    await ensureServicesReady();
    return services.linghui.createWorkspaceHistoryRecord(args);
  }

  async importWorkspaceAsset(args: { workspaceId: string; sourcePath: string; filenameHint?: string }) {
    await ensureServicesReady();
    return { path: await services.linghui.importWorkspaceAsset(args.workspaceId, args.sourcePath, args.filenameHint) };
  }
}

export = LinghuiController;
