import { BaseController } from './base';
import { services } from '../service';
import type { PersistenceEntity } from '../service/persistence';

export class PersistenceController extends BaseController {
  async list(args: { projectId: string; entity: PersistenceEntity }): Promise<any[]> {
    return services.persistence.list(args.projectId, args.entity);
  }

  async find(args: {
    projectId: string;
    entity: PersistenceEntity;
    query?: Record<string, unknown>;
  }): Promise<any[]> {
    return services.persistence.find(args.projectId, args.entity, args.query || {});
  }

  async findById(args: {
    projectId: string;
    entity: PersistenceEntity;
    id: string;
  }): Promise<any | null> {
    return services.persistence.findById(args.projectId, args.entity, args.id);
  }

  async save(args: {
    projectId: string;
    entity: PersistenceEntity;
    data: any;
  }): Promise<any> {
    const { projectId, entity, data } = args;

    if (entity === 'project' || entity === 'timeline') {
      return services.persistence.saveDocument(projectId, entity, data);
    }

    if (entity === 'episode') {
      return services.persistence.saveEntity(projectId, entity, data);
    }

    if (Array.isArray(data)) {
      return services.persistence.saveCollection(projectId, entity, data);
    }

    return services.persistence.saveEntity(projectId, entity, data);
  }

  async delete(args: {
    projectId: string;
    entity: PersistenceEntity;
    id: string;
  }): Promise<{ success: boolean }> {
    const deleted = await services.persistence.deleteEntity(args.projectId, args.entity, args.id);
    return { success: deleted };
  }

  async batchSave(args: {
    projectId: string;
    operations: Array<{ entity: PersistenceEntity; data: any }>;
  }): Promise<{ success: boolean }> {
    return services.persistence.batchSave(args.projectId, args.operations || []);
  }
}

export const persistenceController = new PersistenceController();
