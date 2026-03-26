import { nanoid } from 'nanoid';
import { electronService } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from './storageConfig';
import {
  EMPTY_LINGHUI_EXECUTION_LOGS,
  EMPTY_LINGHUI_NODE_RUNS,
  DEFAULT_LINGHUI_VIEWPORT,
  DEFAULT_LINGHUI_WORKSPACE_NAME,
  EMPTY_LINGHUI_GRAPH,
  type LinghuiGraphSnapshot,
  type LinghuiGraphStats,
  type LinghuiWorkspaceDocument,
  type LinghuiWorkspaceMeta,
} from '../types/linghui';

const LINGHUI_INDEX_KEY = 'koma.linghui.index.v1';
const LINGHUI_DOC_KEY_PREFIX = 'koma.linghui.doc.';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeWorkspaceName(name?: string): string {
  const trimmed = name?.trim();
  return trimmed || DEFAULT_LINGHUI_WORKSPACE_NAME;
}

function buildStats(graphData?: LinghuiGraphSnapshot): LinghuiGraphStats {
  return {
    nodeCount: graphData?.nodes?.length ?? 0,
    linkCount: graphData?.links?.length ?? 0,
    groupCount: graphData?.groups?.length ?? 0,
  };
}

function withNormalizedDocument(
  input: Partial<LinghuiWorkspaceDocument> & Pick<LinghuiWorkspaceDocument, 'id' | 'name'>,
): LinghuiWorkspaceDocument {
  const now = Date.now();
  const graphData = clone(input.graphData ?? EMPTY_LINGHUI_GRAPH);
  const stats = buildStats(graphData);

  return {
    id: input.id,
    name: sanitizeWorkspaceName(input.name),
    description: input.description ?? '',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    lastOpenedAt: input.lastOpenedAt ?? now,
    viewport: clone(input.viewport ?? DEFAULT_LINGHUI_VIEWPORT),
    graphData,
    nodeRuns: clone(input.nodeRuns ?? EMPTY_LINGHUI_NODE_RUNS),
    executionLogs: clone(input.executionLogs ?? EMPTY_LINGHUI_EXECUTION_LOGS),
    nodeCount: input.nodeCount ?? stats.nodeCount,
    linkCount: input.linkCount ?? stats.linkCount,
    groupCount: input.groupCount ?? stats.groupCount,
  };
}

function toMeta(doc: LinghuiWorkspaceDocument): LinghuiWorkspaceMeta {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastOpenedAt: doc.lastOpenedAt,
    nodeCount: doc.nodeCount,
    linkCount: doc.linkCount,
    groupCount: doc.groupCount,
  };
}

function sortMetas(items: LinghuiWorkspaceMeta[]): LinghuiWorkspaceMeta[] {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function getLinghuiRoot(): Promise<string> {
  const config = getStorageConfig() || await initStorageConfig();
  const root = `${config.rootPath}/linghui-workspaces`;
  if (electronService.isElectron()) {
    await electronService.fs.mkdir(root);
  }
  return root;
}

async function getWorkspaceDir(workspaceId: string): Promise<string> {
  return `${await getLinghuiRoot()}/${workspaceId}`;
}

async function getWorkspacePath(workspaceId: string): Promise<string> {
  return `${await getWorkspaceDir(workspaceId)}/workspace.json`;
}

async function getMetaPath(workspaceId: string): Promise<string> {
  return `${await getWorkspaceDir(workspaceId)}/meta.json`;
}

async function getIndexPath(): Promise<string> {
  const config = getStorageConfig() || await initStorageConfig();
  return `${config.rootPath}/linghui-workspaces-index.json`;
}

async function readElectronJson<T>(path: string): Promise<T | null> {
  const exists = await electronService.fs.exists(path);
  if (!exists) return null;

  const raw = await electronService.fs.readFile(path);
  return JSON.parse(raw) as T;
}

async function writeElectronJson(path: string, payload: unknown): Promise<void> {
  await electronService.fs.writeFile(path, JSON.stringify(payload, null, 2));
}

function readBrowserIndex(): LinghuiWorkspaceMeta[] {
  try {
    const raw = localStorage.getItem(LINGHUI_INDEX_KEY);
    if (!raw) return [];
    return sortMetas(JSON.parse(raw) as LinghuiWorkspaceMeta[]);
  } catch {
    return [];
  }
}

function writeBrowserIndex(items: LinghuiWorkspaceMeta[]): void {
  localStorage.setItem(LINGHUI_INDEX_KEY, JSON.stringify(sortMetas(items)));
}

function readBrowserWorkspace(workspaceId: string): LinghuiWorkspaceDocument | null {
  try {
    const raw = localStorage.getItem(`${LINGHUI_DOC_KEY_PREFIX}${workspaceId}`);
    if (!raw) return null;
    return withNormalizedDocument(JSON.parse(raw) as LinghuiWorkspaceDocument);
  } catch {
    return null;
  }
}

function writeBrowserWorkspace(doc: LinghuiWorkspaceDocument): void {
  localStorage.setItem(`${LINGHUI_DOC_KEY_PREFIX}${doc.id}`, JSON.stringify(doc));
}

async function readIndex(): Promise<LinghuiWorkspaceMeta[]> {
  if (!electronService.isElectron()) {
    return readBrowserIndex();
  }

  const indexPath = await getIndexPath();
  const index = await readElectronJson<LinghuiWorkspaceMeta[]>(indexPath);
  return sortMetas(index ?? []);
}

async function writeIndex(items: LinghuiWorkspaceMeta[]): Promise<void> {
  if (!electronService.isElectron()) {
    writeBrowserIndex(items);
    return;
  }

  const indexPath = await getIndexPath();
  await writeElectronJson(indexPath, sortMetas(items));
}

export async function listLinghuiWorkspaces(): Promise<LinghuiWorkspaceMeta[]> {
  return readIndex();
}

export async function loadLinghuiWorkspace(workspaceId: string): Promise<LinghuiWorkspaceDocument | null> {
  if (!electronService.isElectron()) {
    return readBrowserWorkspace(workspaceId);
  }

  const workspacePath = await getWorkspacePath(workspaceId);
  const doc = await readElectronJson<LinghuiWorkspaceDocument>(workspacePath);
  return doc ? withNormalizedDocument(doc) : null;
}

export async function saveLinghuiWorkspace(
  doc: LinghuiWorkspaceDocument,
): Promise<LinghuiWorkspaceDocument> {
  const normalized = withNormalizedDocument({
    ...doc,
    updatedAt: Date.now(),
    lastOpenedAt: Date.now(),
  });

  if (!electronService.isElectron()) {
    writeBrowserWorkspace(normalized);
    const items = await readIndex();
    const next = sortMetas([
      ...items.filter(item => item.id !== normalized.id),
      toMeta(normalized),
    ]);
    writeBrowserIndex(next);
    return normalized;
  }

  const workspaceDir = await getWorkspaceDir(normalized.id);
  await electronService.fs.mkdir(workspaceDir);
  await writeElectronJson(await getWorkspacePath(normalized.id), normalized);
  await writeElectronJson(await getMetaPath(normalized.id), toMeta(normalized));

  const items = await readIndex();
  const next = sortMetas([
    ...items.filter(item => item.id !== normalized.id),
    toMeta(normalized),
  ]);
  await writeIndex(next);

  return normalized;
}

export async function createLinghuiWorkspace(
  name: string = DEFAULT_LINGHUI_WORKSPACE_NAME,
): Promise<LinghuiWorkspaceDocument> {
  const doc = withNormalizedDocument({
    id: nanoid(12),
    name,
    graphData: EMPTY_LINGHUI_GRAPH,
    viewport: DEFAULT_LINGHUI_VIEWPORT,
    nodeRuns: EMPTY_LINGHUI_NODE_RUNS,
    executionLogs: EMPTY_LINGHUI_EXECUTION_LOGS,
  });

  return saveLinghuiWorkspace(doc);
}

export async function exportLinghuiWorkspace(
  doc: LinghuiWorkspaceDocument,
): Promise<string | null> {
  const normalized = withNormalizedDocument(doc);
  const filename = `${sanitizeWorkspaceName(normalized.name).replace(/[\\/:*?"<>|]/g, '-')}.linghui.json`;

  if (!electronService.isElectron()) {
    const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return filename;
  }

  const result = await electronService.dialog.saveFile({
    title: '导出灵绘工作区',
    defaultPath: filename,
    filters: [{ name: 'Linghui Workspace', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await electronService.fs.writeFile(result.filePath, JSON.stringify(normalized, null, 2));
  return result.filePath;
}
