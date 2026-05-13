/**
 * R4 二创：视频导入库 IPC controller
 */
import { BaseController } from './base';
import { services, ensureServicesReady } from '../service';

class RecreationVideosController extends BaseController {
  async import(args: { srcPath: string; filename?: string }) {
    await ensureServicesReady();
    return services.recreationVideos.importVideo(args.srcPath, args.filename);
  }

  async list() {
    await ensureServicesReady();
    return services.recreationVideos.list();
  }

  async listDerived(args: { parentId: string }) {
    await ensureServicesReady();
    return services.recreationVideos.listDerived(args.parentId);
  }

  async get(args: { id: string }) {
    await ensureServicesReady();
    return services.recreationVideos.getById(args.id);
  }

  async delete(args: { id: string }) {
    await ensureServicesReady();
    const ok = await services.recreationVideos.deleteVideo(args.id);
    return { success: ok };
  }

  async saveDiagnosis(args: { id: string; diagnosis: any }) {
    await ensureServicesReady();
    services.recreationVideos.saveDiagnosis(args.id, args.diagnosis);
    return { success: true };
  }

  async loadDiagnosis(args: { id: string }) {
    await ensureServicesReady();
    return services.recreationVideos.loadDiagnosis(args.id);
  }

  async setDiagnosisStatus(args: { id: string; status: 'none' | 'running' | 'completed' | 'failed' }) {
    await ensureServicesReady();
    services.recreationVideos.setDiagnosisStatus(args.id, args.status);
    return { success: true };
  }
}

export = RecreationVideosController;
