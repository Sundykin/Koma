import { BaseController } from './base';
import { ensureServicesReady, services } from '../service';
import type { LinghuiWorkspaceDocument } from '../../frontend/src/types/linghui';

function toLinghuiControllerError(operation: string, error: unknown): { success: false; error: string; operation: string } {
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  console.error(`[LinghuiController] ${operation} failed`, {
    error: message,
    stack: error instanceof Error ? error.stack : undefined,
  });
  return {
    success: false,
    error: `[linghui/${operation}] ${message}`,
    operation,
  };
}

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
    try {
      await ensureServicesReady();
      const result = services.linghui.saveWorkspace(args.doc);
      return result ?? toLinghuiControllerError('saveWorkspace', new Error('saveWorkspace 返回空结果'));
    } catch (error) {
      return toLinghuiControllerError('saveWorkspace', error);
    }
  }

  async createWorkspace(args: { name?: string }) {
    try {
      await ensureServicesReady();
      const result = services.linghui.createWorkspace(args.name || '');
      return result ?? toLinghuiControllerError('createWorkspace', new Error('createWorkspace 返回空结果'));
    } catch (error) {
      return toLinghuiControllerError('createWorkspace', error);
    }
  }

  async saveWorkspaceAs(args: { doc: LinghuiWorkspaceDocument; name?: string }) {
    try {
      await ensureServicesReady();
      const result = services.linghui.saveWorkspaceAs(args.doc, args.name);
      return result ?? toLinghuiControllerError('saveWorkspaceAs', new Error('saveWorkspaceAs 返回空结果'));
    } catch (error) {
      return toLinghuiControllerError('saveWorkspaceAs', error);
    }
  }

  async deleteWorkspace(args: { workspaceId: string }) {
    await ensureServicesReady();
    services.linghui.deleteWorkspace(args.workspaceId);
    return { success: true };
  }

  async importWorkspace(args: { filePath: string }) {
    try {
      await ensureServicesReady();
      const result = await services.linghui.importWorkspace(args.filePath);
      return result ?? toLinghuiControllerError('importWorkspace', new Error('importWorkspace 返回空结果'));
    } catch (error) {
      return toLinghuiControllerError('importWorkspace', error);
    }
  }

  async exportWorkspace(args: { doc: LinghuiWorkspaceDocument; destPath: string }) {
    try {
      await ensureServicesReady();
      const result = await services.linghui.exportWorkspace(args.doc, args.destPath);
      return result ? { path: result } : toLinghuiControllerError('exportWorkspace', new Error('exportWorkspace 返回空结果'));
    } catch (error) {
      return toLinghuiControllerError('exportWorkspace', error);
    }
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

  async syncProductionAssets(args: {
    workspaceId: string;
    nodeId: string;
    nodeType: any;
    assets: any[];
  }) {
    await ensureServicesReady();
    return services.linghui.syncProductionAssets(args);
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

  /* ============ 全局资产库（C-5B，跨 workspace 共享） ============ */

  async listGlobalAssets(args?: { kind?: 'character' | 'prop' }) {
    await ensureServicesReady();
    return services.linghui.listGlobalAssets(args?.kind);
  }

  async upsertGlobalAsset(args: {
    id?: string;
    kind: 'character' | 'prop';
    label: string;
    hint?: string;
    promptHint?: string;
    color?: string;
    scale?: number;
    posePreset?: string;
    propType?: string;
    category?: string;
    favorite?: boolean;
    referenceImages?: string[];
  }) {
    try {
      await ensureServicesReady();
      const result = services.linghui.upsertGlobalAsset(args);
      return result;
    } catch (error) {
      return toLinghuiControllerError('upsertGlobalAsset', error);
    }
  }

  async deleteGlobalAsset(args: { id: string }) {
    await ensureServicesReady();
    return { deleted: services.linghui.deleteGlobalAsset(args.id) };
  }
}

export = LinghuiController;
