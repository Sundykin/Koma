import * as fs from 'fs';
import * as path from 'path';
import { projectService } from './project';

export type PersistenceEntity =
  | 'project'
  | 'episode'
  | 'episodeAnalysis'
  | 'episodeTimeline'
  | 'shot'
  | 'character'
  | 'scene'
  | 'prop'
  | 'timeline'
  | 'asset';

export interface Repository<T = any, Q = Partial<T>> {
  find(query: Q): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  save(data: T): Promise<T>;
  delete(id: string): Promise<boolean>;
  list(): Promise<T[]>;
}

const COLLECTION_FILE_MAP: Record<Exclude<PersistenceEntity, 'episode' | 'project' | 'timeline' | 'episodeAnalysis' | 'episodeTimeline'>, string> = {
  shot: 'shots.json',
  character: 'characters.json',
  scene: 'scenes.json',
  prop: 'props.json',
  asset: 'assets.json',
};

const DOCUMENT_FILE_MAP: Record<'project' | 'timeline', string> = {
  project: 'project.json',
  timeline: 'timeline.json',
};

function matchesQuery<T extends Record<string, any>>(item: T, query: Partial<T>): boolean {
  const entries = Object.entries(query || {});
  if (!entries.length) return true;
  return entries.every(([key, value]) => item[key] === value);
}

class JsonCollectionRepository<T extends { id: string }> implements Repository<T> {
  constructor(
    private readonly getFilePath: () => string,
    private readonly migrationHook?: (items: T[]) => { migrated: T[]; changed: boolean }
  ) {}

  private async readAll(): Promise<T[]> {
    const filePath = this.getFilePath();
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed) ? parsed : [];
      if (!this.migrationHook) return items;
      const result = this.migrationHook(items);
      if (result.changed) {
        await this.writeAll(result.migrated);
      }
      return result.migrated;
    } catch {
      return [];
    }
  }

  private async writeAll(items: T[]): Promise<void> {
    const filePath = this.getFilePath();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(items, null, 2), 'utf-8');
  }

  async find(query: Partial<T>): Promise<T[]> {
    const items = await this.readAll();
    return items.filter((item) => matchesQuery(item as Record<string, any>, query as Partial<Record<string, any>>));
  }

  async findById(id: string): Promise<T | null> {
    const items = await this.readAll();
    return items.find((item) => item.id === id) || null;
  }

  async save(data: T): Promise<T> {
    const items = await this.readAll();
    const index = items.findIndex((item) => item.id === data.id);
    if (index >= 0) {
      items[index] = data;
    } else {
      items.push(data);
    }
    await this.writeAll(items);
    return data;
  }

  async delete(id: string): Promise<boolean> {
    const items = await this.readAll();
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return false;
    await this.writeAll(next);
    return true;
  }

  async list(): Promise<T[]> {
    return this.readAll();
  }

  async saveAll(items: T[]): Promise<T[]> {
    await this.writeAll(items);
    return items;
  }
}

class JsonDocumentRepository<T extends Record<string, any>> implements Repository<T, Partial<T>> {
  constructor(private readonly getFilePath: () => string) {}

  private async readDoc(): Promise<T | null> {
    const filePath = this.getFilePath();
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async find(query: Partial<T>): Promise<T[]> {
    const doc = await this.readDoc();
    if (!doc) return [];
    return matchesQuery(doc, query) ? [doc] : [];
  }

  async findById(_id: string): Promise<T | null> {
    return this.readDoc();
  }

  async save(data: T): Promise<T> {
    const filePath = this.getFilePath();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return data;
  }

  async delete(_id: string): Promise<boolean> {
    const filePath = this.getFilePath();
    try {
      await fs.promises.rm(filePath, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  async list(): Promise<T[]> {
    const doc = await this.readDoc();
    return doc ? [doc] : [];
  }
}

class EpisodeRepository implements Repository<any, Record<string, any>> {
  constructor(private readonly projectId: string) {}

  private getEpisodesRoot(): string {
    return path.join(projectService.getProjectPath(this.projectId), 'episodes');
  }

  private getMetaPath(id: string): string {
    return path.join(this.getEpisodesRoot(), id, 'meta.json');
  }

  async find(query: Record<string, any>): Promise<any[]> {
    const items = await this.list();
    return items.filter((item) => matchesQuery(item as Record<string, any>, query));
  }

  async findById(id: string): Promise<any | null> {
    try {
      const content = await fs.promises.readFile(this.getMetaPath(id), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async save(data: any): Promise<any> {
    const episodeId = data.id;
    if (!episodeId) {
      throw new Error('Episode id is required');
    }
    const episodeDir = path.join(this.getEpisodesRoot(), episodeId);
    await fs.promises.mkdir(path.join(episodeDir, 'assets'), { recursive: true });
    await fs.promises.writeFile(this.getMetaPath(episodeId), JSON.stringify(data, null, 2), 'utf-8');
    if (typeof data.scriptText === 'string') {
      await fs.promises.writeFile(path.join(episodeDir, 'script.txt'), data.scriptText, 'utf-8');
    }
    return data;
  }

  async delete(id: string): Promise<boolean> {
    try {
      await fs.promises.rm(path.join(this.getEpisodesRoot(), id), { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  async list(): Promise<any[]> {
    const root = this.getEpisodesRoot();
    try {
      const dirs = await fs.promises.readdir(root);
      const result: any[] = [];
      for (const dir of dirs) {
        const episode = await this.findById(dir);
        if (episode) result.push(episode);
      }
      return result;
    } catch {
      return [];
    }
  }
}

class EpisodeDocumentRepository implements Repository<any, Record<string, any>> {
  constructor(
    private readonly projectId: string,
    private readonly fileName: string
  ) {}

  private getEpisodesRoot(): string {
    return path.join(projectService.getProjectPath(this.projectId), 'episodes');
  }

  private getFilePath(id: string): string {
    return path.join(this.getEpisodesRoot(), id, this.fileName);
  }

  async find(query: Record<string, any>): Promise<any[]> {
    const items = await this.list();
    return items.filter((item) => matchesQuery(item as Record<string, any>, query));
  }

  async findById(id: string): Promise<any | null> {
    try {
      const content = await fs.promises.readFile(this.getFilePath(id), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async save(data: any): Promise<any> {
    const episodeId = data?.episodeId || data?.id;
    if (!episodeId) {
      throw new Error('Episode id is required');
    }
    const filePath = this.getFilePath(episodeId);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return data;
  }

  async delete(id: string): Promise<boolean> {
    try {
      await fs.promises.rm(this.getFilePath(id), { force: true });
      return true;
    } catch {
      return false;
    }
  }

  async list(): Promise<any[]> {
    const root = this.getEpisodesRoot();
    try {
      const dirs = await fs.promises.readdir(root);
      const result: any[] = [];
      for (const dir of dirs) {
        const doc = await this.findById(dir);
        if (doc) result.push(doc);
      }
      return result;
    } catch {
      return [];
    }
  }
}

interface WriteQueueItem {
  key: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer?: NodeJS.Timeout;
}

export class PersistenceService {
  private cache = new Map<string, unknown>();
  private writeQueue = new Map<string, WriteQueueItem>();

  private getProjectPath(projectId: string): string {
    return projectService.getProjectPath(projectId);
  }

  private getCacheKey(projectId: string, entity: PersistenceEntity): string {
    return `${projectId}:${entity}`;
  }

  private getRepository(projectId: string, entity: PersistenceEntity): Repository<any, any> {
    const projectPath = this.getProjectPath(projectId);

    if (entity === 'episode') {
      return new EpisodeRepository(projectId);
    }

    if (entity === 'episodeAnalysis') {
      return new EpisodeDocumentRepository(projectId, 'analysis.json');
    }

    if (entity === 'episodeTimeline') {
      return new EpisodeDocumentRepository(projectId, 'timeline.json');
    }

    if (entity === 'project' || entity === 'timeline') {
      return new JsonDocumentRepository<any>(() => path.join(projectPath, DOCUMENT_FILE_MAP[entity]));
    }

    const fileName = COLLECTION_FILE_MAP[entity as keyof typeof COLLECTION_FILE_MAP];

    if (entity === 'character') {
      return new JsonCollectionRepository<any>(() => path.join(projectPath, fileName), (items) => {
        let changed = false;
        const migrated = items.map((item) => {
          if (item?.prompt?.trim()) return item;
          const parts: string[] = [];
          if (item?.age) parts.push(`Age: ${item.age}`);
          if (item?.appearance) parts.push(item.appearance);
          if (item?.description) parts.push(item.description);
          if (item?.customPrompt) parts.push(item.customPrompt);
          const prompt = parts.join('\n');
          if (!prompt) return item;
          changed = true;
          return { ...item, prompt };
        });
        return { migrated, changed };
      });
    }

    if (entity === 'scene') {
      return new JsonCollectionRepository<any>(() => path.join(projectPath, fileName), (items) => {
        let changed = false;
        const migrated = items.map((item) => {
          if (item?.prompt?.trim()) return item;
          const parts: string[] = [];
          if (item?.location) parts.push(`Location: ${item.location}`);
          if (item?.time) parts.push(`Time: ${item.time}`);
          if (item?.mood) parts.push(`Mood: ${item.mood}`);
          if (item?.description) parts.push(item.description);
          if (item?.customPrompt) parts.push(item.customPrompt);
          const prompt = parts.join('\n');
          if (!prompt) return item;
          changed = true;
          return { ...item, prompt };
        });
        return { migrated, changed };
      });
    }

    return new JsonCollectionRepository<any>(() => path.join(projectPath, fileName));
  }

  clearProjectCache(projectId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${projectId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  async list(projectId: string, entity: PersistenceEntity): Promise<any[]> {
    const cacheKey = this.getCacheKey(projectId, entity);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return Array.isArray(cached) ? cached : [cached];
    }

    const repo = this.getRepository(projectId, entity);
    const data = await repo.list();
    this.cache.set(cacheKey, data);
    return data;
  }

  async find(projectId: string, entity: PersistenceEntity, query: Record<string, unknown>): Promise<any[]> {
    const repo = this.getRepository(projectId, entity);
    return repo.find(query || {});
  }

  async findById(projectId: string, entity: PersistenceEntity, id: string): Promise<any | null> {
    const repo = this.getRepository(projectId, entity);
    return repo.findById(id);
  }

  async loadDocument(projectId: string, entity: Extract<PersistenceEntity, 'project' | 'timeline'>): Promise<any | null> {
    const list = await this.list(projectId, entity);
    return list[0] || null;
  }

  async loadCollection(projectId: string, entity: Exclude<PersistenceEntity, 'project' | 'timeline' | 'episode'>): Promise<any[]> {
    const list = await this.list(projectId, entity);
    return Array.isArray(list) ? list : [];
  }

  private enqueueWrite<T>(key: string, execute: () => Promise<T>): Promise<T> {
    const existing = this.writeQueue.get(key);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    return new Promise<T>((resolve, reject) => {
      const item: WriteQueueItem = {
        key,
        execute,
        resolve,
        reject,
      };

      item.timer = setTimeout(async () => {
        try {
          this.writeQueue.delete(key);
          const result = await execute();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, 50);

      this.writeQueue.set(key, item);
    });
  }

  async saveDocument(projectId: string, entity: Extract<PersistenceEntity, 'project' | 'timeline'>, data: any): Promise<any> {
    const key = `${projectId}:${entity}:save`;
    const repo = this.getRepository(projectId, entity);
    const result = await this.enqueueWrite(key, async () => repo.save(data));
    this.cache.set(this.getCacheKey(projectId, entity), [result]);
    return result;
  }

  async saveCollection(projectId: string, entity: Exclude<PersistenceEntity, 'project' | 'timeline' | 'episode'>, items: any[]): Promise<any[]> {
    const key = `${projectId}:${entity}:saveAll`;
    const repo = this.getRepository(projectId, entity) as JsonCollectionRepository<any>;
    const result = await this.enqueueWrite(key, async () => repo.saveAll(items));
    this.cache.set(this.getCacheKey(projectId, entity), result);
    return result;
  }

  async saveEntity(projectId: string, entity: PersistenceEntity, item: any): Promise<any> {
    const key = `${projectId}:${entity}:save:${item?.id || 'document'}`;
    const repo = this.getRepository(projectId, entity);
    const result = await this.enqueueWrite(key, async () => repo.save(item));
    this.cache.delete(this.getCacheKey(projectId, entity));
    return result;
  }

  async deleteEntity(projectId: string, entity: PersistenceEntity, id: string): Promise<boolean> {
    const repo = this.getRepository(projectId, entity);
    const deleted = await repo.delete(id);
    this.cache.delete(this.getCacheKey(projectId, entity));
    return deleted;
  }

  async batchSave(
    projectId: string,
    operations: Array<{ entity: PersistenceEntity; data: any }>
  ): Promise<{ success: boolean }> {
    const snapshots = new Map<string, string | null>();

    try {
      for (const operation of operations) {
        const filePath = this.resolveRawFilePath(projectId, operation.entity, operation.data?.id);
        if (!filePath) continue;
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          snapshots.set(filePath, content);
        } catch {
          snapshots.set(filePath, null);
        }
      }

      for (const operation of operations) {
        const { entity, data } = operation;
        if (entity === 'project' || entity === 'timeline') {
          await this.saveDocument(projectId, entity, data);
        } else if (entity === 'episode') {
          await this.saveEntity(projectId, entity, data);
        } else if (Array.isArray(data)) {
          await this.saveCollection(projectId, entity as Exclude<PersistenceEntity, 'project' | 'timeline' | 'episode'>, data);
        } else {
          await this.saveEntity(projectId, entity, data);
        }
      }

      return { success: true };
    } catch (error) {
      for (const [filePath, content] of snapshots.entries()) {
        if (content === null) {
          await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
        } else {
          await fs.promises.mkdir(path.dirname(filePath), { recursive: true }).catch(() => undefined);
          await fs.promises.writeFile(filePath, content, 'utf-8').catch(() => undefined);
        }
      }
      throw error;
    }
  }

  private resolveRawFilePath(projectId: string, entity: PersistenceEntity, id?: string): string | null {
    const projectPath = this.getProjectPath(projectId);
    if (entity === 'project' || entity === 'timeline') {
      return path.join(projectPath, DOCUMENT_FILE_MAP[entity]);
    }
    if (entity === 'episode') {
      return id ? path.join(projectPath, 'episodes', id, 'meta.json') : null;
    }
    if (entity === 'episodeAnalysis') {
      return id ? path.join(projectPath, 'episodes', id, 'analysis.json') : null;
    }
    if (entity === 'episodeTimeline') {
      return id ? path.join(projectPath, 'episodes', id, 'timeline.json') : null;
    }
    const collectionFile = COLLECTION_FILE_MAP[entity as keyof typeof COLLECTION_FILE_MAP];
    return collectionFile ? path.join(projectPath, collectionFile) : null;
  }
}

export const persistenceService = new PersistenceService();
