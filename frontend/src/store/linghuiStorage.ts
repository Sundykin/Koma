import { nanoid } from 'nanoid';
import { electronService } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from './storageConfig';
import { createLogger } from './logger';
import {
  EMPTY_LINGHUI_EXECUTION_LOGS,
  EMPTY_LINGHUI_NODE_RUNS,
  DEFAULT_LINGHUI_VIEWPORT,
  DEFAULT_LINGHUI_WORKSPACE_NAME,
  EMPTY_LINGHUI_GRAPH,
  getLinghuiResultItemCount,
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
  getLinghuiResultShots,
  getLinghuiResultText,
  isLinghuiAudioResult,
  isLinghuiAudioMediaItem,
  isLinghuiImageCollectionResult,
  isLinghuiImageMediaItem,
  isLinghuiImageResult,
  isLinghuiStoryboardResult,
  isLinghuiVideoMediaItem,
  isLinghuiVideoResult,
  type LinghuiMediaItem,
  type LinghuiNodeResult,
  type LinghuiGraphSnapshot,
  type LinghuiGraphStats,
  type LinghuiNodeData,
  type LinghuiNodeRunState,
  type LinghuiRFEdgeSnapshot,
  type LinghuiRFGroupSnapshot,
  type LinghuiRFNodeSnapshot,
  type LinghuiSubgraphSnapshot,
  type LinghuiViewportState,
  type LinghuiWorkspaceDocument,
  type LinghuiWorkspaceMeta,
} from '../types/linghui';
import { createNewNodeData } from '../components/linghui/library/state/linghuiNodeDefs';
import {
  listBuiltinLinghuiRecipeTemplates,
  type LinghuiRecipeTemplateKey,
} from '../components/linghui/library/state/linghuiRecipeTemplates';
import { resolveLinghuiWorkflowBlockLabel } from '../constants/linghuiWorkflowBlock';
import type { LinghuiNodeType } from '../types/linghui';

const LINGHUI_INDEX_KEY = 'koma.linghui.index.v1';
const LINGHUI_DOC_KEY_PREFIX = 'koma.linghui.doc.';
const logger = createLogger('LinghuiStorage');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function assignLinghuiResultPrimary(result: LinghuiNodeResult, primary: LinghuiMediaItem): void {
  if ((isLinghuiImageResult(result) || isLinghuiImageCollectionResult(result) || isLinghuiStoryboardResult(result)) && isLinghuiImageMediaItem(primary)) {
    result.primary = primary;
    return;
  }

  if (isLinghuiVideoResult(result) && isLinghuiVideoMediaItem(primary)) {
    result.primary = primary;
    return;
  }

  if (isLinghuiAudioResult(result) && isLinghuiAudioMediaItem(primary)) {
    result.primary = primary;
  }
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

// Maps deprecated V1 generation node types to the current core node model.
const OLD_TO_NEW_TYPE_MAP: Record<string, string> = {
  'linghui/reference-image': 'linghui/image',
  'linghui/prompt': 'linghui/image',
  'linghui/image-to-image': 'linghui/image',
  'linghui/four-grid': 'linghui/image',
  'linghui/multi-angle': 'linghui/image',
  'linghui/image-to-video': 'linghui/video',
  'linghui-reference-image': 'linghui-image',
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
    const linghuiType = migrateNodeType(String(n.type ?? '')) as LinghuiNodeType;
    const rfType = linghuiTypeToRFTypeKey(linghuiType);

    let nodeData: LinghuiNodeData;
    try {
      nodeData = createNewNodeData(linghuiType);
      // Merge saved properties
      if (n.properties) {
        nodeData.properties = { ...nodeData.properties, ...n.properties };
        if (linghuiType === 'linghui/image' && n.type === 'linghui/reference-image') {
          nodeData.properties = {
            ...nodeData.properties,
            mode: 'import',
            source: String(n.properties.source ?? ''),
          };
        }
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
      label: resolveLinghuiWorkflowBlockLabel(typeof g.title === 'string' ? g.title : undefined),
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
            const oldProps = n.data.properties;
            if (oldProps.prompt) {
              newData.properties.prompt = oldProps.prompt;
            }
            if (newLinghuiType === 'linghui/image' && oldProps.source) {
              newData.properties = {
                ...newData.properties,
                mode: 'import',
                source: String(oldProps.source),
              };
            }
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

  // Normalize deprecated V1 generation node types into the current core node model.
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

export async function getLinghuiWorkspaceDir(workspaceId: string): Promise<string> {
  return getWorkspaceDir(workspaceId);
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

export async function saveLinghuiWorkspaceAs(
  doc: LinghuiWorkspaceDocument,
  name?: string,
): Promise<LinghuiWorkspaceDocument> {
  const cloned = withNormalizedDocument({
    ...clone(doc),
    id: nanoid(12),
    name: name ?? `${sanitizeWorkspaceName(doc.name)} 副本`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastOpenedAt: Date.now(),
  });

  return saveLinghuiWorkspace(cloned);
}

export async function deleteLinghuiWorkspace(workspaceId: string): Promise<void> {
  if (!workspaceId) return;

  if (!electronService.isElectron()) {
    window.localStorage.removeItem(`${LINGHUI_DOC_KEY_PREFIX}${workspaceId}`);
    window.localStorage.removeItem(`${LINGHUI_DOC_KEY_PREFIX}workflow-index.${workspaceId}`);
    window.localStorage.removeItem(`${LINGHUI_DOC_KEY_PREFIX}history-index.${workspaceId}`);
    window.localStorage.removeItem(`${LINGHUI_DOC_KEY_PREFIX}asset-index.${workspaceId}`);
    writeBrowserIndex(readBrowserIndex().filter(item => item.id !== workspaceId));
    return;
  }

  await electronService.fs.remove(await getWorkspaceDir(workspaceId));
  await writeIndex((await readIndex()).filter(item => item.id !== workspaceId));
}

function getWorkspaceNameFromFilePath(filePath: string): string {
  const filename = filePath.split(/[\\/]/).pop() ?? DEFAULT_LINGHUI_WORKSPACE_NAME;
  return sanitizeWorkspaceName(
    filename
      .replace(/\.linghui\.json$/i, '')
      .replace(/\.json$/i, ''),
  );
}

export async function importLinghuiWorkspace(filePath: string): Promise<LinghuiWorkspaceDocument> {
  const raw = await electronService.fs.readFile(filePath);
  const parsed = JSON.parse(raw) as Partial<LinghuiWorkspaceDocument>;
  const imported = migrateDocumentIfNeeded(withNormalizedDocument({
    ...parsed,
    id: nanoid(12),
    name: sanitizeWorkspaceName(parsed.name ?? getWorkspaceNameFromFilePath(filePath)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastOpenedAt: Date.now(),
  }));

  return saveLinghuiWorkspace(imported);
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

function getExtensionFromMimeType(mimeType: string | undefined, fallback = 'bin'): string {
  switch ((mimeType || '').toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
      return 'webm';
    case 'video/quicktime':
      return 'mov';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
      return 'wav';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/aac':
      return 'aac';
    case 'audio/flac':
      return 'flac';
    case 'text/plain':
      return 'txt';
    case 'application/json':
      return 'json';
    default:
      return fallback;
  }
}

function decodeKomaLocalSource(source: string): string {
  if (!source.startsWith('koma-local://')) return source;
  const decoded = decodeURIComponent(source.replace(/^koma-local:\/\//, ''));
  return decoded.replace(/^\/([A-Za-z]:\/)/, '$1');
}

function getRawAssetSource(source?: string): string {
  if (!source) return '';
  if (source.startsWith('koma-local://')) {
    return decodeKomaLocalSource(source);
  }
  return source;
}

function getNodeAssetTextValue(nodeData: LinghuiNodeData, nodeRun?: LinghuiNodeRunState): string {
  const properties = nodeData.properties as Record<string, unknown>;
  const resultText = getLinghuiResultText(nodeRun?.result);

  if (typeof resultText === 'string' && resultText.trim()) {
    return resultText.trim();
  }
  if (typeof properties.content === 'string' && properties.content.trim()) {
    return properties.content.trim();
  }
  if (typeof properties.prompt === 'string' && properties.prompt.trim()) {
    return properties.prompt.trim();
  }
  if (typeof properties.note === 'string' && properties.note.trim()) {
    return properties.note.trim();
  }
  return '';
}

function getPrimaryAssetMedia(nodeData: LinghuiNodeData, nodeRun?: LinghuiNodeRunState): LinghuiMediaItem | undefined {
  const properties = nodeData.properties as Record<string, unknown>;
  const primary = getLinghuiResultPrimaryMedia(nodeRun?.result);
  if (primary?.source || primary?.posterSource) {
    return primary;
  }

  const source = typeof properties.source === 'string' ? properties.source.trim() : '';
  const posterSource = typeof properties.posterSource === 'string' ? properties.posterSource.trim() : '';
  if (!source && !posterSource) {
    return undefined;
  }

  const inferredKind = nodeData.linghuiType === 'linghui/video'
    ? 'video'
    : nodeData.linghuiType === 'linghui/audio'
      ? 'audio'
      : 'image';

  let width: number | undefined;
  let height: number | undefined;
  let aspectRatio: string | undefined;

  if (inferredKind === 'image' && Array.isArray(properties.items)) {
    const primaryAssetId = typeof properties.primaryAssetId === 'string' ? properties.primaryAssetId : '';
    const matchedItem = properties.items.find(item => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Record<string, unknown>;
      if (primaryAssetId && record.id === primaryAssetId) {
        return true;
      }
      return typeof record.source === 'string' && record.source === source;
    }) as Record<string, unknown> | undefined;

    width = typeof matchedItem?.width === 'number' ? matchedItem.width : undefined;
    height = typeof matchedItem?.height === 'number' ? matchedItem.height : undefined;
    aspectRatio = typeof matchedItem?.aspectRatio === 'string' ? matchedItem.aspectRatio : undefined;
  }

  return {
    kind: inferredKind,
    source: source || undefined,
    posterSource: posterSource || undefined,
    label: nodeData.label,
    width,
    height,
    metadata: aspectRatio ? { aspectRatio } : undefined,
  };
}

async function materializeWorkspaceAssetSource(params: {
  assetDir: string;
  filename: string;
  source?: string;
  fallbackExt: string;
  mimeType?: string;
}): Promise<string | undefined> {
  const rawSource = getRawAssetSource(String(params.source ?? '').trim());
  if (!rawSource) return undefined;

  if (!electronService.isElectron()) {
    return rawSource;
  }

  if (rawSource.startsWith('data:')) {
    const match = rawSource.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return rawSource;
    }

    const ext = getExtensionFromMimeType(match[1], params.fallbackExt);
    const targetPath = `${params.assetDir}/${params.filename}.${ext}`;
    await electronService.fs.writeFile(targetPath, match[2], true);
    return targetPath;
  }

  if (
    rawSource.startsWith('http://') ||
    rawSource.startsWith('https://')
  ) {
    const ext = getExtensionFromPath(rawSource, getExtensionFromMimeType(params.mimeType, params.fallbackExt));
    const targetPath = `${params.assetDir}/${params.filename}.${ext}`;

    logger.info('下载远程媒体到灵绘工作区', {
      url: rawSource,
      targetPath,
    });

    await electronService.fs.downloadFile(rawSource, targetPath);
    return targetPath;
  }

  if (rawSource.startsWith('blob:')) {
    return rawSource;
  }

  const ext = getExtensionFromPath(rawSource, getExtensionFromMimeType(params.mimeType, params.fallbackExt));
  const targetPath = `${params.assetDir}/${params.filename}.${ext}`;
  await electronService.fs.copy(rawSource, targetPath);
  return targetPath;
}

export async function materializeLinghuiWorkspaceAssetSource(params: {
  workspaceId: string;
  source?: string;
  filename: string;
  fallbackExt: string;
  mimeType?: string;
  subDir?: string;
}): Promise<string | undefined> {
  const assetDir = `${await getWorkspaceDir(params.workspaceId)}/${params.subDir ?? 'assets/references'}`;
  if (electronService.isElectron()) {
    await electronService.fs.mkdir(assetDir);
  }

  return materializeWorkspaceAssetSource({
    assetDir,
    filename: params.filename,
    source: params.source,
    fallbackExt: params.fallbackExt,
    mimeType: params.mimeType,
  });
}

type LinghuiLibraryRecordKind = 'image' | 'video' | 'audio' | 'text';

function resolveLinghuiLibraryRecordKind(
  nodeData: LinghuiNodeData,
  nodeRun?: LinghuiNodeRunState,
): LinghuiLibraryRecordKind {
  const textValue = getNodeAssetTextValue(nodeData, nodeRun);
  const media = getPrimaryAssetMedia(nodeData, nodeRun);

  if (nodeData.linghuiType === 'linghui/text') {
    return 'text';
  }
  if (media?.kind === 'video') {
    return 'video';
  }
  if (media?.kind === 'audio') {
    return 'audio';
  }
  if (textValue && !media) {
    return 'text';
  }
  return 'image';
}

function buildSubgraphStats(snapshot: LinghuiSubgraphSnapshot): LinghuiGraphStats {
  return {
    nodeCount: snapshot.nodes.length,
    linkCount: snapshot.edges.length,
    groupCount: snapshot.groups.length,
  };
}

function dedupeAndLimitById<T extends { id: string }>(items: T[], limit = 400): T[] {
  const seen = new Set<string>();
  const next: T[] = [];

  for (const item of items) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
    if (next.length >= limit) break;
  }

  return next;
}

async function readWorkspaceIndexCollection<T>(params: {
  electronIndexPath: string;
  browserStorageKey: string;
}): Promise<T[]> {
  if (electronService.isElectron()) {
    return (await readElectronJson<T[]>(params.electronIndexPath) ?? []).filter(Boolean);
  }

  try {
    const raw = window.localStorage.getItem(params.browserStorageKey);
    return (raw ? JSON.parse(raw) as T[] : []).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeWorkspaceIndexCollection<T extends { id: string }>(params: {
  records: T[];
  electronIndexPath: string;
  browserStorageKey: string;
}): Promise<void> {
  const nextRecords = dedupeAndLimitById(params.records);

  if (electronService.isElectron()) {
    await writeElectronJson(params.electronIndexPath, nextRecords);
    return;
  }

  window.localStorage.setItem(params.browserStorageKey, JSON.stringify(nextRecords));
}

export interface LinghuiWorkflowTemplateRecord {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  source: LinghuiWorkflowTemplateSource;
  kind: LinghuiWorkflowTemplateKind;
  recipeKey?: LinghuiRecipeTemplateKey;
  createdAt: number;
  updatedAt: number;
  sourceGroupId?: string;
  nodeCount: number;
  linkCount: number;
  groupCount: number;
  sampleNodeLabels: string[];
  snapshotPath: string;
  snapshot: LinghuiSubgraphSnapshot;
}

export type LinghuiWorkflowTemplateSource = 'system' | 'workspace';
export type LinghuiWorkflowTemplateKind = 'recipe' | 'saved-workflow';

export interface LinghuiWorkspaceHistoryRecord {
  id: string;
  workspaceId: string;
  nodeId: string;
  nodeType: LinghuiNodeType;
  kind: LinghuiLibraryRecordKind;
  name: string;
  createdAt: number;
  source?: string;
  previewSource?: string;
  posterSource?: string;
  text?: string;
  snapshotPath: string;
  metadata?: Record<string, unknown>;
}

export interface LinghuiWorkspaceHistoryRecordResult {
  record: LinghuiWorkspaceHistoryRecord;
  materializedRun?: LinghuiNodeRunState;
}

export interface LinghuiWorkspaceAssetRecord {
  id: string;
  workspaceId: string;
  nodeId: string;
  nodeType: LinghuiNodeType;
  kind: 'image' | 'video' | 'audio' | 'text';
  name: string;
  createdAt: number;
  source?: string;
  previewSource?: string;
  posterSource?: string;
  text?: string;
  snapshotPath: string;
  metadata?: Record<string, unknown>;
}

function isLinghuiRecipeTemplateKey(value: unknown): value is LinghuiRecipeTemplateKey {
  return value === 'character-design-flow'
    || value === 'storyboard-creation-flow'
    || value === 'voiceover-workflow';
}

function normalizeLinghuiWorkflowTemplateRecord(
  record: Omit<LinghuiWorkflowTemplateRecord, 'source' | 'kind' | 'recipeKey'> & Partial<Pick<LinghuiWorkflowTemplateRecord, 'source' | 'kind' | 'recipeKey'>>,
): LinghuiWorkflowTemplateRecord {
  return {
    ...record,
    source: record.source === 'system' ? 'system' : 'workspace',
    kind: record.kind === 'recipe' ? 'recipe' : 'saved-workflow',
    recipeKey: isLinghuiRecipeTemplateKey(record.recipeKey) ? record.recipeKey : undefined,
  };
}

function createBuiltinLinghuiWorkflowTemplateRecords(workspaceId: string): LinghuiWorkflowTemplateRecord[] {
  return listBuiltinLinghuiRecipeTemplates().map(template => {
    const stats = buildSubgraphStats(template.snapshot);
    return {
      id: template.id,
      workspaceId,
      name: template.name,
      description: template.description,
      source: 'system',
      kind: 'recipe',
      recipeKey: template.recipeKey,
      createdAt: template.sortOrder,
      updatedAt: template.sortOrder,
      nodeCount: stats.nodeCount,
      linkCount: stats.linkCount,
      groupCount: stats.groupCount,
      sampleNodeLabels: template.snapshot.nodes
        .map(node => node.data?.label?.trim())
        .filter((label): label is string => Boolean(label))
        .slice(0, 4),
      snapshotPath: `builtin://linghui-recipes/${template.recipeKey}`,
      snapshot: clone(template.snapshot),
    };
  });
}

function compareLinghuiWorkflowTemplateRecords(
  left: LinghuiWorkflowTemplateRecord,
  right: LinghuiWorkflowTemplateRecord,
): number {
  if (left.source !== right.source) {
    return left.source === 'system' ? -1 : 1;
  }
  return right.updatedAt - left.updatedAt;
}

export async function listLinghuiWorkflowTemplates(workspaceId: string): Promise<LinghuiWorkflowTemplateRecord[]> {
  if (!workspaceId) return [];

  const templateRoot = `${await getWorkspaceDir(workspaceId)}/workflows/templates`;
  const indexPath = `${templateRoot}/index.json`;
  const storageKey = `${LINGHUI_DOC_KEY_PREFIX}workflow-index.${workspaceId}`;
  const items = await readWorkspaceIndexCollection<LinghuiWorkflowTemplateRecord>({
    electronIndexPath: indexPath,
    browserStorageKey: storageKey,
  });
  const builtinTemplates = createBuiltinLinghuiWorkflowTemplateRecords(workspaceId);
  const workspaceTemplates = items.map(item => normalizeLinghuiWorkflowTemplateRecord({
    ...item,
    workspaceId: item.workspaceId || workspaceId,
  }));

  return dedupeAndLimitById([...builtinTemplates, ...workspaceTemplates], 400)
    .filter(Boolean)
    .sort(compareLinghuiWorkflowTemplateRecords);
}

export async function createLinghuiWorkflowTemplate(params: {
  workspaceId: string;
  name: string;
  description?: string;
  snapshot: LinghuiSubgraphSnapshot;
  sourceGroupId?: string;
}): Promise<LinghuiWorkflowTemplateRecord> {
  const createdAt = Date.now();
  const templateId = nanoid(12);
  const templateName = params.name?.trim() || '未命名工作流';
  const stats = buildSubgraphStats(params.snapshot);
  const workflowRoot = `${await getWorkspaceDir(params.workspaceId)}/workflows`;
  const templateRoot = `${workflowRoot}/templates`;
  const templateDir = `${templateRoot}/${createdAt}-${sanitizeAssetSegment(templateName)}-${templateId}`;
  const indexPath = `${templateRoot}/index.json`;
  const storageKey = `${LINGHUI_DOC_KEY_PREFIX}workflow-index.${params.workspaceId}`;

  if (electronService.isElectron()) {
    await electronService.fs.mkdir(workflowRoot);
    await electronService.fs.mkdir(templateRoot);
    await electronService.fs.mkdir(templateDir);
  }

  const record: LinghuiWorkflowTemplateRecord = {
    id: templateId,
    workspaceId: params.workspaceId,
    name: templateName,
    description: params.description?.trim() || undefined,
    source: 'workspace',
    kind: 'saved-workflow',
    createdAt,
    updatedAt: createdAt,
    sourceGroupId: params.sourceGroupId,
    nodeCount: stats.nodeCount,
    linkCount: stats.linkCount,
    groupCount: stats.groupCount,
    sampleNodeLabels: params.snapshot.nodes
      .map(node => node.data?.label?.trim())
      .filter((label): label is string => Boolean(label))
      .slice(0, 4),
    snapshotPath: `${templateDir}/workflow.json`,
    snapshot: clone(params.snapshot),
  };

  if (electronService.isElectron()) {
    await writeElectronJson(record.snapshotPath, record);
  }

  const existingIndex = await readWorkspaceIndexCollection<LinghuiWorkflowTemplateRecord>({
    electronIndexPath: indexPath,
    browserStorageKey: storageKey,
  });

  await writeWorkspaceIndexCollection({
    records: [record, ...existingIndex.filter(item => item.id !== record.id)],
    electronIndexPath: indexPath,
    browserStorageKey: storageKey,
  });

  return record;
}

export async function listLinghuiWorkspaceHistoryRecords(workspaceId: string): Promise<LinghuiWorkspaceHistoryRecord[]> {
  if (!workspaceId) return [];

  const historyRoot = `${await getWorkspaceDir(workspaceId)}/history/results`;
  const indexPath = `${historyRoot}/index.json`;
  const storageKey = `${LINGHUI_DOC_KEY_PREFIX}history-index.${workspaceId}`;
  const items = await readWorkspaceIndexCollection<LinghuiWorkspaceHistoryRecord>({
    electronIndexPath: indexPath,
    browserStorageKey: storageKey,
  });

  return items
    .filter(Boolean)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function listLinghuiWorkspaceAssets(workspaceId: string): Promise<LinghuiWorkspaceAssetRecord[]> {
  if (!workspaceId) return [];

  if (electronService.isElectron()) {
    const assetRoot = `${await getWorkspaceDir(workspaceId)}/assets/library`;
    const indexPath = `${assetRoot}/index.json`;
    return (await readElectronJson<LinghuiWorkspaceAssetRecord[]>(indexPath) ?? [])
      .filter(Boolean)
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  const storageKey = `${LINGHUI_DOC_KEY_PREFIX}asset-index.${workspaceId}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const items = raw ? JSON.parse(raw) as LinghuiWorkspaceAssetRecord[] : [];
    return items.filter(Boolean).sort((left, right) => right.createdAt - left.createdAt);
  } catch {
    return [];
  }
}

export async function createLinghuiWorkspaceAsset(params: {
  workspaceId: string;
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
}): Promise<LinghuiWorkspaceAssetRecord> {
  const { workspaceId, nodeId, nodeData, nodeRun } = params;
  const createdAt = Date.now();
  const assetId = nanoid(12);
  const assetName = nodeData.label?.trim() || '未命名资产';
  const nodeType = nodeData.linghuiType;
  const textValue = getNodeAssetTextValue(nodeData, nodeRun);
  const media = getPrimaryAssetMedia(nodeData, nodeRun);

  const kind = nodeType === 'linghui/text'
    ? 'text'
    : media?.kind === 'video'
      ? 'video'
      : media?.kind === 'audio'
        ? 'audio'
        : textValue && !media
          ? 'text'
          : 'image';

  if (!textValue && !media?.source) {
    throw new Error('当前节点还没有可保存为资产的内容，请先输入内容或先运行节点');
  }

  const assetRoot = `${await getWorkspaceDir(workspaceId)}/assets/library`;
  const assetDirName = `${createdAt}-${sanitizeAssetSegment(assetName)}`;
  const assetDir = `${assetRoot}/${kind}/${assetDirName}`;
  const indexPath = `${assetRoot}/index.json`;

  if (electronService.isElectron()) {
    await electronService.fs.mkdir(assetRoot);
    await electronService.fs.mkdir(`${assetRoot}/${kind}`);
    await electronService.fs.mkdir(assetDir);
  }

  let persistedSource: string | undefined;
  let persistedPosterSource: string | undefined;
  let persistedText = textValue || undefined;

  if (kind === 'text') {
    if (!persistedText) {
      throw new Error('当前文本节点没有可保存的文本内容');
    }

    if (electronService.isElectron()) {
      const textPath = `${assetDir}/content.txt`;
      await electronService.fs.writeFile(textPath, persistedText);
      persistedSource = textPath;
    }
  } else {
    persistedSource = await materializeWorkspaceAssetSource({
      assetDir,
      filename: kind,
      source: media?.source,
      fallbackExt: kind === 'audio' ? 'mp3' : kind === 'video' ? 'mp4' : 'png',
      mimeType: media?.mimeType,
    });

    if (kind === 'video') {
      persistedPosterSource = await materializeWorkspaceAssetSource({
        assetDir,
        filename: 'poster',
        source: media?.posterSource,
        fallbackExt: 'png',
      });
    }
  }

  const record: LinghuiWorkspaceAssetRecord = {
    id: assetId,
    workspaceId,
    nodeId,
    nodeType,
    kind,
    name: assetName,
    createdAt,
    source: persistedSource,
    previewSource: kind === 'video'
      ? (persistedPosterSource || persistedSource)
      : persistedSource,
    posterSource: persistedPosterSource,
    text: persistedText,
    snapshotPath: `${assetDir}/asset.json`,
    metadata: {
      nodeLabel: nodeData.label,
      resultKind: nodeRun?.result?.kind,
      itemCount: getLinghuiResultItemCount(nodeRun?.result),
      hasRunResult: Boolean(nodeRun?.result),
      width: typeof media?.width === 'number' ? media.width : undefined,
      height: typeof media?.height === 'number' ? media.height : undefined,
      aspectRatio: typeof media?.metadata?.aspectRatio === 'string' ? media.metadata.aspectRatio : undefined,
      prompt: typeof (nodeData.properties as Record<string, unknown>).prompt === 'string'
        ? (nodeData.properties as Record<string, unknown>).prompt
        : undefined,
    },
  };

  const snapshotPayload = {
    asset: record,
    node: {
      id: nodeId,
      data: clone(nodeData),
    },
    run: nodeRun ? clone(nodeRun) : null,
  };

  if (electronService.isElectron()) {
    await writeElectronJson(record.snapshotPath, snapshotPayload);
    const existingIndex = await readElectronJson<LinghuiWorkspaceAssetRecord[]>(indexPath) ?? [];
    await writeElectronJson(
      indexPath,
      [record, ...existingIndex.filter(item => item.id !== record.id)].slice(0, 400),
    );
  } else {
    const storageKey = `${LINGHUI_DOC_KEY_PREFIX}asset-index.${workspaceId}`;
    const existingIndex = (() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) as LinghuiWorkspaceAssetRecord[] : [];
      } catch {
        return [];
      }
    })();
    window.localStorage.setItem(
      storageKey,
      JSON.stringify([record, ...existingIndex.filter(item => item.id !== record.id)].slice(0, 400)),
    );
  }

  return record;
}

export async function createLinghuiWorkspaceHistoryRecord(params: {
  workspaceId: string;
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
}): Promise<LinghuiWorkspaceHistoryRecordResult> {
  const { workspaceId, nodeId, nodeData, nodeRun } = params;
  const createdAt = nodeRun?.updatedAt ?? Date.now();
  const historyId = nanoid(12);
  const historyName = nodeData.label?.trim() || '未命名结果';
  const textValue = getNodeAssetTextValue(nodeData, nodeRun);
  const media = getPrimaryAssetMedia(nodeData, nodeRun);
  const kind = resolveLinghuiLibraryRecordKind(nodeData, nodeRun);
  const materializedRun: LinghuiNodeRunState | undefined = nodeRun ? clone(nodeRun) : undefined;

  if (!textValue && !media?.source) {
    throw new Error('当前节点还没有可记录的执行结果');
  }

  const historyRoot = `${await getWorkspaceDir(workspaceId)}/history/results`;
  const historyDir = `${historyRoot}/${kind}/${createdAt}-${sanitizeAssetSegment(historyName)}-${historyId}`;
  const indexPath = `${historyRoot}/index.json`;
  const storageKey = `${LINGHUI_DOC_KEY_PREFIX}history-index.${workspaceId}`;

  if (electronService.isElectron()) {
    await electronService.fs.mkdir(`${await getWorkspaceDir(workspaceId)}/history`);
    await electronService.fs.mkdir(historyRoot);
    await electronService.fs.mkdir(`${historyRoot}/${kind}`);
    await electronService.fs.mkdir(historyDir);
  }

  let persistedSource: string | undefined;
  let persistedPosterSource: string | undefined;
  let persistedText = textValue || undefined;

  const materializeMediaItem = async <TMedia extends LinghuiMediaItem>(
    item: TMedia,
    options: { filename: string; posterFilename?: string },
  ): Promise<TMedia> => {
    const fallbackExt = item.kind === 'audio' ? 'mp3' : item.kind === 'video' ? 'mp4' : 'png';
    const nextSource = await materializeWorkspaceAssetSource({
      assetDir: historyDir,
      filename: options.filename,
      source: item.source,
      fallbackExt,
      mimeType: item.mimeType,
    });

    const nextPosterSource = item.kind === 'video'
      ? await materializeWorkspaceAssetSource({
          assetDir: historyDir,
          filename: options.posterFilename || `${options.filename}-poster`,
          source: item.posterSource,
          fallbackExt: 'png',
        })
      : undefined;

    return {
      ...item,
      source: nextSource ?? item.source,
      posterSource: nextPosterSource ?? item.posterSource,
    } as TMedia;
  };

  if (kind === 'text') {
    if (persistedText && electronService.isElectron()) {
      const textPath = `${historyDir}/content.txt`;
      await electronService.fs.writeFile(textPath, persistedText);
      persistedSource = textPath;
    }
  } else {
    const resultPrimary = getLinghuiResultPrimaryMedia(materializedRun?.result);
    if (materializedRun?.result && resultPrimary) {
      const nextPrimary = await materializeMediaItem(resultPrimary, {
        filename: kind,
        posterFilename: kind === 'video' ? 'poster' : undefined,
      });

      assignLinghuiResultPrimary(materializedRun.result, nextPrimary);

      persistedSource = nextPrimary.source;
      persistedPosterSource = kind === 'video' ? nextPrimary.posterSource : undefined;
    } else if (media) {
      persistedSource = await materializeWorkspaceAssetSource({
        assetDir: historyDir,
        filename: kind,
        source: media.source,
        fallbackExt: kind === 'audio' ? 'mp3' : kind === 'video' ? 'mp4' : 'png',
        mimeType: media.mimeType,
      });

      if (kind === 'video') {
        persistedPosterSource = await materializeWorkspaceAssetSource({
          assetDir: historyDir,
          filename: 'poster',
          source: media.posterSource,
          fallbackExt: 'png',
        });
      }
    }

    if (materializedRun?.result && !getLinghuiResultPrimaryMedia(materializedRun.result) && persistedSource) {
      const fallbackPrimary = {
        kind: kind as 'image' | 'video' | 'audio',
        label: historyName,
        source: persistedSource,
        posterSource: persistedPosterSource,
      };

      assignLinghuiResultPrimary(materializedRun.result, fallbackPrimary);
    }

    if (materializedRun?.result && isLinghuiImageCollectionResult(materializedRun.result) && getLinghuiResultItems(materializedRun.result).length) {
      materializedRun.result.items = await Promise.all(
        materializedRun.result.items.map(async (item, index) => {
          if (!item) return item;
          return materializeMediaItem(item, { filename: `item-${index + 1}` });
        }),
      );
    }

    if (materializedRun?.result && isLinghuiStoryboardResult(materializedRun.result) && getLinghuiResultShots(materializedRun.result).length) {
      materializedRun.result.shots = await Promise.all(
        materializedRun.result.shots.map(async (shot, index) => {
          if (!shot || !shot.image) return shot;
          const nextImage = await materializeMediaItem(shot.image, { filename: `shot-${index + 1}` });
          return { ...shot, image: nextImage };
        }),
      );
    }
  }

  const record: LinghuiWorkspaceHistoryRecord = {
    id: historyId,
    workspaceId,
    nodeId,
    nodeType: nodeData.linghuiType,
    kind,
    name: historyName,
    createdAt,
    source: persistedSource,
    previewSource: kind === 'video'
      ? (persistedPosterSource || persistedSource)
      : persistedSource,
    posterSource: persistedPosterSource,
    text: persistedText,
    snapshotPath: `${historyDir}/history.json`,
    metadata: {
      nodeLabel: nodeData.label,
      resultKind: nodeRun?.result?.kind,
      upstreamIds: nodeRun?.upstreamIds ?? [],
      itemCount: getLinghuiResultItemCount(nodeRun?.result),
      width: typeof media?.width === 'number' ? media.width : undefined,
      height: typeof media?.height === 'number' ? media.height : undefined,
      aspectRatio: typeof media?.metadata?.aspectRatio === 'string' ? media.metadata.aspectRatio : undefined,
      prompt: typeof (nodeData.properties as Record<string, unknown>).prompt === 'string'
        ? (nodeData.properties as Record<string, unknown>).prompt
        : undefined,
    },
  };

  const snapshotPayload = {
    history: record,
    node: {
      id: nodeId,
      data: clone(nodeData),
    },
    run: materializedRun ?? null,
  };

  if (electronService.isElectron()) {
    await writeElectronJson(record.snapshotPath, snapshotPayload);
  }

  const existingIndex = await readWorkspaceIndexCollection<LinghuiWorkspaceHistoryRecord>({
    electronIndexPath: indexPath,
    browserStorageKey: storageKey,
  });

  await writeWorkspaceIndexCollection({
    records: [record, ...existingIndex.filter(item => item.id !== record.id)],
    electronIndexPath: indexPath,
    browserStorageKey: storageKey,
  });

  return { record, materializedRun };
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
