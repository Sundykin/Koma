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
  type LinghuiNodeData,
  type LinghuiRFEdgeSnapshot,
  type LinghuiRFGroupSnapshot,
  type LinghuiRFNodeSnapshot,
  type LinghuiViewportState,
  type LinghuiWorkspaceDocument,
  type LinghuiWorkspaceMeta,
} from '../types/linghui';
import { createNewNodeData } from '../components/linghui/linghuiNodeDefs';
import type { LinghuiNodeType } from '../types/linghui';

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
    linkCount: graphData?.edges?.length ?? 0,
    groupCount: graphData?.groups?.length ?? 0,
  };
}

// --- V1 (LiteGraph) to V2 (React Flow) migration ---

function isV1Graph(graphData: any): boolean {
  if (!graphData) return false;
  if (graphData.version === 2) return false;
  // V1 has `links` array instead of `edges`
  return Array.isArray(graphData.links) || !Array.isArray(graphData.edges);
}

// Maps old node types to new unified types
const OLD_TO_NEW_TYPE_MAP: Record<string, string> = {
  'linghui/reference-image': 'linghui/reference',
  'linghui/prompt': 'linghui/image',
  'linghui/image-to-image': 'linghui/image',
  'linghui/four-grid': 'linghui/image',
  'linghui/multi-angle': 'linghui/image',
  'linghui/image-to-video': 'linghui/video',
  'linghui-reference-image': 'linghui-reference',
  'linghui-prompt': 'linghui-image',
  'linghui-image-to-image': 'linghui-image',
  'linghui-four-grid': 'linghui-image',
  'linghui-multi-angle': 'linghui-image',
  'linghui-image-to-video': 'linghui-video',
};

function migrateNodeType(type: string): string {
  return OLD_TO_NEW_TYPE_MAP[type] ?? type;
}

function linghuiTypeToRFTypeKey(type: string): string {
  const migrated = migrateNodeType(type);
  return migrated.replace(/\//g, '-');
}

function migrateLinghuiGraphV1ToV2(v1: any): LinghuiGraphSnapshot {
  const v1Nodes: any[] = v1.nodes ?? [];
  const v1Links: any[] = v1.links ?? [];
  const v1Groups: any[] = v1.groups ?? [];

  const nodes: LinghuiRFNodeSnapshot[] = v1Nodes.map((n: any) => {
    const linghuiType = String(n.type ?? '') as LinghuiNodeType;
    const rfType = linghuiTypeToRFTypeKey(linghuiType);

    let nodeData: LinghuiNodeData;
    try {
      nodeData = createNewNodeData(linghuiType);
      // Merge saved properties
      if (n.properties) {
        nodeData.properties = { ...nodeData.properties, ...n.properties };
      }
    } catch {
      // Unknown node type - create minimal data
      nodeData = {
        linghuiType,
        label: String(n.title ?? linghuiType),
        accent: '#4ade80',
        background: '#0f1720',
        properties: n.properties ?? {},
        inputs: [],
        outputs: [],
        active: false,
      };
    }

    return {
      id: String(n.id),
      type: rfType,
      position: {
        x: Array.isArray(n.pos) ? n.pos[0] : 0,
        y: Array.isArray(n.pos) ? n.pos[1] : 0,
      },
      data: nodeData,
      width: Array.isArray(n.size) ? n.size[0] : undefined,
      height: Array.isArray(n.size) ? n.size[1] : undefined,
    };
  });

  const edges: LinghuiRFEdgeSnapshot[] = v1Links
    .filter((link: any) => link != null)
    .map((link: any) => {
      // LiteGraph link format: [linkId, originId, originSlot, targetId, targetSlot, type]
      // or object { id, origin_id, origin_slot, target_id, target_slot, type }
      let linkId: string, sourceId: string, sourceSlot: number, targetId: string, targetSlot: number;

      if (Array.isArray(link)) {
        linkId = String(link[0]);
        sourceId = String(link[1]);
        sourceSlot = Number(link[2] ?? 0);
        targetId = String(link[3]);
        targetSlot = Number(link[4] ?? 0);
      } else {
        linkId = String(link.id ?? link.link_id ?? '');
        sourceId = String(link.origin_id ?? '');
        sourceSlot = Number(link.origin_slot ?? 0);
        targetId = String(link.target_id ?? '');
        targetSlot = Number(link.target_slot ?? 0);
      }

      return {
        id: `e-${linkId}`,
        source: sourceId,
        target: targetId,
        sourceHandle: `output-${sourceSlot}`,
        targetHandle: `input-${targetSlot}`,
        type: 'linghui-edge',
      };
    });

  const groups: LinghuiRFGroupSnapshot[] = v1Groups.map((g: any, index: number) => ({
    id: `group-${index}`,
    position: {
      x: Array.isArray(g.pos) ? g.pos[0] : 0,
      y: Array.isArray(g.pos) ? g.pos[1] : 0,
    },
    data: {
      label: String(g.title ?? '分组'),
      color: String(g.color ?? '#2563eb'),
    },
    style: {
      width: Array.isArray(g.size) ? g.size[0] : 300,
      height: Array.isArray(g.size) ? g.size[1] : 200,
    },
  }));

  return { version: 2, nodes, edges, groups };
}

function migrateViewportV1ToV2(viewport: any): LinghuiViewportState {
  if (!viewport) return DEFAULT_LINGHUI_VIEWPORT;
  // V1: { offset: [x, y], scale }
  // V2: { x, y, zoom }
  if (Array.isArray(viewport.offset)) {
    return {
      x: viewport.offset[0] ?? 0,
      y: viewport.offset[1] ?? 0,
      zoom: viewport.scale ?? 1,
    };
  }
  // Already V2 format
  if (typeof viewport.x === 'number') {
    return { x: viewport.x, y: viewport.y ?? 0, zoom: viewport.zoom ?? 1 };
  }
  return DEFAULT_LINGHUI_VIEWPORT;
}

function migrateV2NodeTypes(graphData: LinghuiGraphSnapshot): LinghuiGraphSnapshot {
  const hasOldTypes = graphData.nodes.some(n => n.type in OLD_TO_NEW_TYPE_MAP);
  if (!hasOldTypes) return graphData;

  return {
    ...graphData,
    nodes: graphData.nodes
      .filter(n => {
        // Remove standalone prompt nodes (they have no equivalent)
        const oldType = n.data?.linghuiType as string;
        return oldType !== 'linghui/prompt';
      })
      .map(n => {
        const newRfType = migrateNodeType(n.type);
        if (newRfType === n.type) return n;

        const newLinghuiType = migrateNodeType(n.data?.linghuiType ?? '') as LinghuiNodeType;
        let newData: LinghuiNodeData;
        try {
          newData = createNewNodeData(newLinghuiType);
          // Merge old properties
          if (n.data?.properties) {
            // Map old prompt property
            const oldProps = n.data.properties;
            if (oldProps.prompt) newData.properties.prompt = oldProps.prompt;
            if (oldProps.source) newData.properties.prompt = String(oldProps.note ?? '');
          }
        } catch {
          newData = { ...n.data, linghuiType: newLinghuiType } as any;
        }

        return { ...n, type: newRfType, data: newData };
      }),
  };
}

function migrateDocumentIfNeeded(doc: LinghuiWorkspaceDocument): LinghuiWorkspaceDocument {
  let result = doc;

  if (isV1Graph(result.graphData)) {
    result = {
      ...result,
      graphData: migrateLinghuiGraphV1ToV2(result.graphData),
      viewport: migrateViewportV1ToV2(result.viewport),
    };
  }

  // Migrate old node types to new unified types
  result = {
    ...result,
    graphData: migrateV2NodeTypes(result.graphData),
  };

  return result;
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
    return migrateDocumentIfNeeded(withNormalizedDocument(JSON.parse(raw) as LinghuiWorkspaceDocument));
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
  return doc ? migrateDocumentIfNeeded(withNormalizedDocument(doc)) : null;
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

function sanitizeAssetSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'asset';
}

function getExtensionFromPath(path: string, fallback = 'png'): string {
  const match = path.match(/\.([a-zA-Z0-9]+)(?:$|\?)/);
  return match?.[1]?.toLowerCase() || fallback;
}

export async function importLinghuiWorkspaceAsset(
  workspaceId: string,
  sourcePath: string,
  filenameHint?: string,
): Promise<string> {
  if (!electronService.isElectron()) {
    return sourcePath;
  }

  const ext = getExtensionFromPath(filenameHint || sourcePath);
  const fileBase = sanitizeAssetSegment((filenameHint || sourcePath).split(/[\\/]/).pop() || 'reference');
  const assetDir = `${await getWorkspaceDir(workspaceId)}/assets/references`;
  const targetPath = `${assetDir}/${Date.now()}-${fileBase}.${ext}`;

  await electronService.fs.mkdir(assetDir);
  await electronService.fs.copy(sourcePath, targetPath);
  return targetPath;
}
