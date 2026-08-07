import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import archiver from 'archiver';
import extract from 'extract-zip';
import type Database from 'better-sqlite3';
import { baseDB } from '../storage';
import { copyLinghuiWorkspaceAsset, materializeLinghuiSource } from './media';
import { normalizeLinghuiWorkspaceDocument } from './document';
import type {
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiRFEdgeSnapshot,
  LinghuiRFGroupSnapshot,
  LinghuiRFNodeSnapshot,
  LinghuiWorkspaceDocument,
  LinghuiWorkspaceMeta,
} from '../../../frontend/src/types/linghui';
import type {
  LinghuiProductionAssetSyncResult,
  LinghuiWorkflowTemplateRecord,
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
  LinghuiWorkspaceHistoryRecordResult,
} from '../../../frontend/src/store/linghuiStorage';
import {
  buildLinghuiProductionAssetRecordId,
  buildLinghuiProductionReferenceFingerprint,
  listStaleLinghuiProductionAssetRecordIds,
  normalizeLinghuiProductionAssetSyncItems,
  resolveLinghuiProductionAssetRecordMetadata,
} from './productionAssets';
import {
  assignLinghuiResultPrimary,
  buildLinghuiGraphStats,
  buildLinghuiLibrarySnapshotKey,
  buildLinghuiTemplateSnapshotKey,
  edgeRowToSnapshot,
  getLinghuiResultItemCount,
  getLinghuiResultItems,
  getLinghuiResultShots,
  getNodeAssetTextValue,
  getPrimaryAssetMedia,
  groupRowToSnapshot,
  libraryRowToAssetRecord,
  libraryRowToHistoryRecord,
  logRowToEntry,
  nodeRowToSnapshot,
  parseLinghuiJson,
  randomLinghuiId,
  resolveLinghuiLibraryRecordKind,
  rowToWorkspaceMeta,
  runRowToState,
  sanitizeLinghuiAssetSegment,
  sanitizeLinghuiWorkspaceName,
  stringifyLinghuiJson,
  type LinghuiGraphEdgeRow,
  type LinghuiGraphGroupRow,
  type LinghuiGraphNodeRow,
  type LinghuiLibraryRecordRow,
  type LinghuiWorkflowTemplateRow,
  type LinghuiWorkspaceExecutionLogRow,
  type LinghuiWorkspaceNodeRunRow,
  type LinghuiWorkspaceRow,
} from './persistenceHelpers';

interface LinghuiWorkspaceExportResource {
  source: string;
  archivePath: string;
  size: number;
}

interface LinghuiWorkspaceExportResourceEntry extends LinghuiWorkspaceExportResource {
  localPath: string;
}

interface LinghuiWorkspaceExportManifest {
  format: 'koma-linghui-workspace';
  version: 1;
  exportedAt: string;
  workspaceId: string;
  workspaceName: string;
  resources: LinghuiWorkspaceExportResource[];
}

interface LinghuiWorkspaceExportRecords {
  workflowTemplates: LinghuiWorkflowTemplateRecord[];
  assets: LinghuiWorkspaceAssetRecord[];
  history: LinghuiWorkspaceHistoryRecord[];
}

const LINGHUI_EXPORT_FORMAT = 'koma-linghui-workspace';
const LINGHUI_ARCHIVE_RESOURCE_PREFIX = 'koma-archive://';

function ensureLinghuiZipPath(destPath: string): string {
  const raw = String(destPath || '').trim();
  if (!raw) {
    throw new Error('导出路径不能为空');
  }
  const resolved = path.resolve(raw);
  if (!resolved) {
    throw new Error('导出路径不能为空');
  }
  if (resolved.toLowerCase().endsWith('.linghui.zip') || resolved.toLowerCase().endsWith('.zip')) {
    return resolved;
  }
  return `${resolved}.linghui.zip`;
}

function normalizeArchivePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function decodeKomaLocalSource(source: string): string {
  if (!source.startsWith('koma-local://files/')) return source;
  const tail = source.slice('koma-local://files'.length);
  let decoded: string;
  try {
    decoded = decodeURIComponent(tail);
  } catch {
    decoded = tail;
  }
  if (/^\/[a-zA-Z]:\//.test(decoded)) return decoded.slice(1);
  return decoded;
}

function isSkippableResourceSource(source: string): boolean {
  return (
    !source ||
    source.startsWith(LINGHUI_ARCHIVE_RESOURCE_PREFIX) ||
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('data:') ||
    source.startsWith('blob:') ||
    source.startsWith('sqlite://') ||
    source.startsWith('builtin://')
  );
}

function resolveExistingLocalFile(source: string): string | null {
  const rawSource = decodeKomaLocalSource(source.trim());
  if (isSkippableResourceSource(rawSource)) {
    return null;
  }
  if (!path.isAbsolute(rawSource)) {
    return null;
  }
  try {
    const resolved = path.resolve(rawSource);
    const stat = fs.statSync(resolved);
    return stat.isFile() ? resolved : null;
  } catch {
    return null;
  }
}

function sanitizeArchiveSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'resource';
}

function cloneLinghuiValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPathInside(parent: string, child: string): boolean {
  const relativePath = path.relative(path.resolve(parent), path.resolve(child));
  return relativePath === '' || (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function makeUniqueArchivePath(archivePath: string, usedArchivePaths: Set<string>): string {
  const normalized = normalizeArchivePath(archivePath).replace(/^\/+/, '');
  if (!usedArchivePaths.has(normalized)) {
    usedArchivePaths.add(normalized);
    return normalized;
  }

  const extension = path.posix.extname(normalized);
  const basename = normalized.slice(0, normalized.length - extension.length);
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${basename}-${index}${extension}`;
    if (!usedArchivePaths.has(candidate)) {
      usedArchivePaths.add(candidate);
      return candidate;
    }
  }
  throw new Error(`无法为资源生成唯一导出路径: ${archivePath}`);
}

function buildArchivePathForLocalFile(localPath: string, workspaceDir: string, usedArchivePaths: Set<string>): string {
  const resolvedFile = path.resolve(localPath);
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  if (isPathInside(resolvedWorkspaceDir, resolvedFile)) {
    const relativePath = normalizeArchivePath(path.relative(resolvedWorkspaceDir, resolvedFile));
    if (
      relativePath.startsWith('assets/') ||
      relativePath.startsWith('history/') ||
      relativePath.startsWith('resources/')
    ) {
      return makeUniqueArchivePath(relativePath, usedArchivePaths);
    }
  }

  const extension = path.extname(resolvedFile);
  const basename = sanitizeArchiveSegment(path.basename(resolvedFile, extension));
  const hash = createHash('sha1').update(resolvedFile).digest('hex').slice(0, 12);
  return makeUniqueArchivePath(`resources/${hash}-${basename}${extension}`, usedArchivePaths);
}

function createLinghuiResourceCollector(workspaceDir: string): {
  resources: LinghuiWorkspaceExportResourceEntry[];
  rewriteSource: (source: string) => string | null;
} {
  const resources: LinghuiWorkspaceExportResourceEntry[] = [];
  const usedArchivePaths = new Set<string>();
  const resourceByLocalPath = new Map<string, LinghuiWorkspaceExportResourceEntry>();

  return {
    resources,
    rewriteSource(source: string): string | null {
      let localPath = resolveExistingLocalFile(source);
      if (!localPath) {
        const rawSource = decodeKomaLocalSource(source.trim());
        const normalizedRelativeSource = normalizeArchivePath(rawSource);
        if (
          !isSkippableResourceSource(rawSource) &&
          !path.isAbsolute(rawSource) &&
          (
            normalizedRelativeSource.startsWith('assets/') ||
            normalizedRelativeSource.startsWith('history/') ||
            normalizedRelativeSource.startsWith('resources/')
          )
        ) {
          localPath = resolveExistingLocalFile(path.join(workspaceDir, rawSource));
        }
      }
      if (!localPath) {
        return null;
      }

      const resolvedLocalPath = path.resolve(localPath);
      const existing = resourceByLocalPath.get(resolvedLocalPath);
      if (existing) {
        return `${LINGHUI_ARCHIVE_RESOURCE_PREFIX}${existing.archivePath}`;
      }

      const stat = fs.statSync(resolvedLocalPath);
      const resource: LinghuiWorkspaceExportResourceEntry = {
        source,
        localPath: resolvedLocalPath,
        archivePath: buildArchivePathForLocalFile(resolvedLocalPath, workspaceDir, usedArchivePaths),
        size: stat.size,
      };
      resourceByLocalPath.set(resolvedLocalPath, resource);
      resources.push(resource);
      return `${LINGHUI_ARCHIVE_RESOURCE_PREFIX}${resource.archivePath}`;
    },
  };
}

function rewriteLinghuiLocalResourceReferences<T>(
  value: T,
  rewriteSource: (source: string) => string | null,
): T {
  if (typeof value === 'string') {
    return (rewriteSource(value) ?? value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => rewriteLinghuiLocalResourceReferences(item, rewriteSource)) as T;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      next[key] = rewriteLinghuiLocalResourceReferences(item, rewriteSource);
    });
    return next as T;
  }
  return value;
}

function normalizeArchiveEntryPath(archivePath: string): string {
  const normalized = normalizeArchivePath(String(archivePath || '').trim()).replace(/^\/+/, '');
  if (
    !normalized ||
    normalized.split('/').some(segment => !segment || segment === '.' || segment === '..') ||
    path.isAbsolute(normalized)
  ) {
    throw new Error(`灵绘导入包包含非法资源路径: ${archivePath}`);
  }
  return normalized;
}

function resolveArchiveEntry(rootDir: string, archivePath: string): string {
  const normalized = normalizeArchiveEntryPath(archivePath);
  const resolved = path.resolve(rootDir, ...normalized.split('/'));
  if (!isPathInside(rootDir, resolved)) {
    throw new Error(`灵绘导入包资源路径越界: ${archivePath}`);
  }
  return resolved;
}

function collectLinghuiArchiveReferences(value: unknown, archivePaths: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith(LINGHUI_ARCHIVE_RESOURCE_PREFIX)) {
      archivePaths.add(normalizeArchiveEntryPath(value.slice(LINGHUI_ARCHIVE_RESOURCE_PREFIX.length)));
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectLinghuiArchiveReferences(item, archivePaths));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectLinghuiArchiveReferences(item, archivePaths));
  }
}

function rewriteLinghuiArchiveResourceReferences<T>(value: T, workspaceDir: string): T {
  if (typeof value === 'string') {
    if (!value.startsWith(LINGHUI_ARCHIVE_RESOURCE_PREFIX)) {
      return value as T;
    }
    const archivePath = normalizeArchiveEntryPath(value.slice(LINGHUI_ARCHIVE_RESOURCE_PREFIX.length));
    return path.join(workspaceDir, ...archivePath.split('/')) as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => rewriteLinghuiArchiveResourceReferences(item, workspaceDir)) as T;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      next[key] = rewriteLinghuiArchiveResourceReferences(item, workspaceDir);
    });
    return next as T;
  }
  return value;
}

function mapLinghuiId(id: string | undefined, idMap: Map<string, string>): string | undefined {
  if (!id) return id;
  return idMap.get(id) ?? id;
}

function remapLinghuiSubgraphSnapshot<T extends {
  nodes: LinghuiRFNodeSnapshot[];
  edges: LinghuiRFEdgeSnapshot[];
  groups: LinghuiRFGroupSnapshot[];
}>(snapshot: T): {
  snapshot: T;
  nodeIds: Map<string, string>;
  groupIds: Map<string, string>;
} {
  const nodeIds = new Map(snapshot.nodes.map(node => [node.id, randomLinghuiId()]));
  const groupIds = new Map(snapshot.groups.map(group => [group.id, randomLinghuiId()]));
  const edgeIds = new Map(snapshot.edges.map(edge => [edge.id, randomLinghuiId()]));
  const nodeIdKeys = Array.from(nodeIds.keys()).sort((left, right) => right.length - left.length);
  const replaceIdInString = (value: string): string => {
    let next = value;
    for (const originalId of nodeIdKeys) {
      const replacement = nodeIds.get(originalId);
      if (replacement) {
        next = next.split(originalId).join(replacement);
      }
    }
    return next;
  };
  const rewriteNodeReferences = <Value>(value: Value): Value => {
    if (typeof value === 'string') {
      return replaceIdInString(value) as Value;
    }
    if (Array.isArray(value)) {
      return value.map(item => rewriteNodeReferences(item)) as Value;
    }
    if (value && typeof value === 'object') {
      const next: Record<string, unknown> = {};
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        next[key] = rewriteNodeReferences(item);
      });
      return next as Value;
    }
    return value;
  };

  return {
    nodeIds,
    groupIds,
    snapshot: {
      ...snapshot,
      nodes: snapshot.nodes.map(node => ({
        ...node,
        id: nodeIds.get(node.id) ?? node.id,
        parentId: mapLinghuiId(node.parentId, groupIds),
        data: rewriteNodeReferences(node.data),
      })),
      edges: snapshot.edges.map(edge => ({
        ...edge,
        id: edgeIds.get(edge.id) ?? edge.id,
        source: nodeIds.get(edge.source) ?? edge.source,
        target: nodeIds.get(edge.target) ?? edge.target,
      })),
      groups: snapshot.groups.map(group => ({
        ...group,
        id: groupIds.get(group.id) ?? group.id,
      })),
    },
  };
}

function remapLinghuiImportedDocument(doc: LinghuiWorkspaceDocument): {
  doc: LinghuiWorkspaceDocument;
  nodeIds: Map<string, string>;
  groupIds: Map<string, string>;
} {
  const graphData = doc.graphData
    ? remapLinghuiSubgraphSnapshot(doc.graphData)
    : null;
  const nodeIds = graphData?.nodeIds ?? new Map<string, string>();
  const groupIds = graphData?.groupIds ?? new Map<string, string>();
  const nextNodeRuns: Record<string, LinghuiNodeRunState> = {};

  Object.entries(doc.nodeRuns || {}).forEach(([nodeId, run]) => {
    const nextNodeId = nodeIds.get(nodeId) ?? nodeId;
    nextNodeRuns[nextNodeId] = {
      ...run,
      upstreamIds: Array.isArray(run.upstreamIds)
        ? run.upstreamIds.map(id => nodeIds.get(id) ?? id)
        : run.upstreamIds,
    };
  });

  // 导入工作区时把 split-view 预览绑定的 nodeId 也重映射，避免 dangling
  const nextBindings: Record<string, string> = {};
  if (doc.directorPreviewBindings) {
    for (const [directorId, previewId] of Object.entries(doc.directorPreviewBindings)) {
      if (typeof directorId !== 'string' || typeof previewId !== 'string') continue;
      const nextDirectorId = nodeIds.get(directorId) ?? directorId;
      const nextPreviewId = nodeIds.get(previewId) ?? previewId;
      nextBindings[nextDirectorId] = nextPreviewId;
    }
  }

  return {
    nodeIds,
    groupIds,
    doc: {
      ...doc,
      graphData: graphData?.snapshot ?? doc.graphData,
      nodeRuns: nextNodeRuns,
      executionLogs: (doc.executionLogs || []).map(entry => ({
        ...entry,
        id: randomLinghuiId(),
        nodeId: mapLinghuiId(entry.nodeId, nodeIds),
      })),
      directorPreviewBindings: nextBindings,
    },
  };
}

function retargetLinghuiWorkspaceRecords(
  records: LinghuiWorkspaceExportRecords,
  workspaceId: string,
  importedIds: {
    nodeIds?: Map<string, string>;
    groupIds?: Map<string, string>;
  } = {},
): LinghuiWorkspaceExportRecords {
  return {
    workflowTemplates: records.workflowTemplates.map(record => {
      const id = randomLinghuiId();
      const remappedSnapshot = remapLinghuiSubgraphSnapshot(record.snapshot);
      const sourceGroupId = record.sourceGroupId
        ? (remappedSnapshot.groupIds.get(record.sourceGroupId)
          ?? importedIds.groupIds?.get(record.sourceGroupId)
          ?? record.sourceGroupId)
        : undefined;
      return {
        ...record,
        id,
        workspaceId,
        sourceGroupId,
        snapshotPath: buildLinghuiTemplateSnapshotKey(workspaceId, id),
        snapshot: remappedSnapshot.snapshot,
      };
    }),
    assets: records.assets.map(record => {
      const id = randomLinghuiId();
      return {
        ...record,
        id,
        workspaceId,
        nodeId: importedIds?.nodeIds?.get(record.nodeId) ?? record.nodeId,
        snapshotPath: buildLinghuiLibrarySnapshotKey(workspaceId, 'assets', id),
      };
    }),
    history: records.history.map(record => {
      const id = randomLinghuiId();
      return {
        ...record,
        id,
        workspaceId,
        nodeId: importedIds?.nodeIds?.get(record.nodeId) ?? record.nodeId,
        snapshotPath: buildLinghuiLibrarySnapshotKey(workspaceId, 'history', id),
      };
    }),
  };
}

async function copyLinghuiArchiveResources(params: {
  tempDir: string;
  workspaceDir: string;
  archivePaths: Set<string>;
}): Promise<void> {
  for (const archivePath of params.archivePaths) {
    const sourcePath = resolveArchiveEntry(params.tempDir, archivePath);
    const targetPath = resolveArchiveEntry(params.workspaceDir, archivePath);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const stat = await fs.promises.stat(sourcePath);
    if (!stat.isFile()) {
      continue;
    }
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.copyFile(sourcePath, targetPath);
  }
}

export class LinghuiService {
  private storageRoot = '';

  init(storageRoot: string): void {
    this.storageRoot = storageRoot;
    fs.mkdirSync(this.getLinghuiRoot(), { recursive: true });
  }

  private getDb(): Database.Database {
    return baseDB.getDb();
  }

  private getLinghuiRoot(): string {
    return path.join(this.storageRoot, 'linghui-workspaces');
  }

  getWorkspaceDir(workspaceId: string): string {
    return path.join(this.getLinghuiRoot(), workspaceId);
  }

  listWorkspaces(): LinghuiWorkspaceMeta[] {
    const rows = this.getDb().prepare('SELECT * FROM linghui_workspaces ORDER BY updated_at DESC').all() as LinghuiWorkspaceRow[];
    return rows.map(rowToWorkspaceMeta);
  }

  loadWorkspace(workspaceId: string): LinghuiWorkspaceDocument | null {
    const row = this.getDb().prepare('SELECT * FROM linghui_workspaces WHERE id = ?').get(workspaceId) as LinghuiWorkspaceRow | undefined;
    if (!row) return null;

    const groups = this.getDb().prepare(
      'SELECT * FROM linghui_workspace_groups WHERE workspace_id = ? ORDER BY sort_order'
    ).all(workspaceId) as LinghuiGraphGroupRow[];
    const nodes = this.getDb().prepare(
      'SELECT * FROM linghui_workspace_nodes WHERE workspace_id = ? ORDER BY sort_order'
    ).all(workspaceId) as LinghuiGraphNodeRow[];
    const edges = this.getDb().prepare(
      'SELECT * FROM linghui_workspace_edges WHERE workspace_id = ? ORDER BY sort_order'
    ).all(workspaceId) as LinghuiGraphEdgeRow[];
    const runs = this.getDb().prepare(
      'SELECT * FROM linghui_workspace_node_runs WHERE workspace_id = ?'
    ).all(workspaceId) as LinghuiWorkspaceNodeRunRow[];
    const logs = this.getDb().prepare(
      'SELECT * FROM linghui_workspace_execution_logs WHERE workspace_id = ? ORDER BY sort_order'
    ).all(workspaceId) as LinghuiWorkspaceExecutionLogRow[];

    const document: LinghuiWorkspaceDocument = {
      ...rowToWorkspaceMeta(row),
      viewport: {
        x: row.viewport_x,
        y: row.viewport_y,
        zoom: row.viewport_zoom,
      },
      graphData: {
        version: row.graph_version,
        nodes: nodes.map(nodeRowToSnapshot),
        edges: edges.map(edgeRowToSnapshot),
        groups: groups.map(groupRowToSnapshot),
      },
      nodeRuns: Object.fromEntries(runs.map(run => [run.node_id, runRowToState(run)])),
      executionLogs: logs.map(logRowToEntry),
    };

    return document;
  }

  saveWorkspace(doc: LinghuiWorkspaceDocument): LinghuiWorkspaceDocument {
    const normalized = normalizeLinghuiWorkspaceDocument({
      ...doc,
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
    });
    const stats = buildLinghuiGraphStats(normalized.graphData);
    const workspaceDir = this.getWorkspaceDir(normalized.id);
    fs.mkdirSync(workspaceDir, { recursive: true });

    baseDB.transaction(() => {
      this.getDb().prepare(`
        INSERT OR REPLACE INTO linghui_workspaces (
          id, name, description, created_at, updated_at, last_opened_at,
          node_count, link_count, group_count, viewport_x, viewport_y, viewport_zoom, graph_version
        ) VALUES (
          @id, @name, @description, @created_at, @updated_at, @last_opened_at,
          @node_count, @link_count, @group_count, @viewport_x, @viewport_y, @viewport_zoom, @graph_version
        )
      `).run({
        id: normalized.id,
        name: normalized.name,
        description: normalized.description || null,
        created_at: normalized.createdAt,
        updated_at: normalized.updatedAt,
        last_opened_at: normalized.lastOpenedAt,
        node_count: stats.nodeCount,
        link_count: stats.linkCount,
        group_count: stats.groupCount,
        viewport_x: normalized.viewport.x,
        viewport_y: normalized.viewport.y,
        viewport_zoom: normalized.viewport.zoom,
        graph_version: normalized.graphData.version,
      });

      this.getDb().prepare('DELETE FROM linghui_workspace_groups WHERE workspace_id = ?').run(normalized.id);
      this.getDb().prepare('DELETE FROM linghui_workspace_nodes WHERE workspace_id = ?').run(normalized.id);
      this.getDb().prepare('DELETE FROM linghui_workspace_edges WHERE workspace_id = ?').run(normalized.id);
      this.getDb().prepare('DELETE FROM linghui_workspace_node_runs WHERE workspace_id = ?').run(normalized.id);
      this.getDb().prepare('DELETE FROM linghui_workspace_execution_logs WHERE workspace_id = ?').run(normalized.id);

      const insertGroup = this.getDb().prepare(`
        INSERT INTO linghui_workspace_groups (
          id, workspace_id, position_x, position_y, label, color, collapsed, width, height, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      normalized.graphData.groups.forEach((group, index) => {
        insertGroup.run(
          group.id,
          normalized.id,
          group.position.x,
          group.position.y,
          group.data.label,
          group.data.color,
          group.data.collapsed ? 1 : 0,
          group.style.width,
          group.style.height,
          index,
        );
      });

      const insertNode = this.getDb().prepare(`
        INSERT INTO linghui_workspace_nodes (
          id, workspace_id, type, position_x, position_y, width, height, parent_group_id,
          label, accent, background, view_mode, active, properties_json, inputs_json, outputs_json, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      normalized.graphData.nodes.forEach((node, index) => {
        insertNode.run(
          node.id,
          normalized.id,
          node.type,
          node.position.x,
          node.position.y,
          node.width ?? null,
          node.height ?? null,
          node.parentId ?? null,
          node.data.label,
          node.data.accent,
          node.data.background,
          node.data.viewMode ?? null,
          node.data.active ? 1 : 0,
          stringifyLinghuiJson(node.data.properties ?? {}),
          stringifyLinghuiJson(node.data.inputs ?? []),
          stringifyLinghuiJson(node.data.outputs ?? []),
          index,
        );
      });

      const insertEdge = this.getDb().prepare(`
        INSERT INTO linghui_workspace_edges (
          id, workspace_id, source_node_id, target_node_id, source_handle, target_handle, edge_type, data_json, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      normalized.graphData.edges.forEach((edge, index) => {
        insertEdge.run(
          edge.id,
          normalized.id,
          edge.source,
          edge.target,
          edge.sourceHandle,
          edge.targetHandle,
          edge.type ?? null,
          edge.data ? stringifyLinghuiJson(edge.data) : null,
          index,
        );
      });

      const insertRun = this.getDb().prepare(`
        INSERT INTO linghui_workspace_node_runs (
          workspace_id, node_id, status, message, error, progress, started_at, updated_at, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      Object.entries(normalized.nodeRuns || {}).forEach(([nodeId, run]) => {
        insertRun.run(
          normalized.id,
          nodeId,
          run.status,
          run.message ?? null,
          run.error ?? null,
          typeof run.progress === 'number' ? run.progress : null,
          run.startedAt ?? null,
          run.updatedAt ?? null,
          run.result ? stringifyLinghuiJson(run.result) : null,
        );
      });

      const insertLog = this.getDb().prepare(`
        INSERT INTO linghui_workspace_execution_logs (
          id, workspace_id, level, message, node_id, created_at, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      normalized.executionLogs.forEach((entry, index) => {
        insertLog.run(
          entry.id,
          normalized.id,
          entry.level,
          entry.message,
          entry.nodeId ?? null,
          entry.createdAt,
          index,
        );
      });
    });

    return {
      ...normalized,
      nodeCount: stats.nodeCount,
      linkCount: stats.linkCount,
      groupCount: stats.groupCount,
    };
  }

  createWorkspace(name: string): LinghuiWorkspaceDocument {
    const doc = normalizeLinghuiWorkspaceDocument({
      id: randomLinghuiId(),
      name,
    } as LinghuiWorkspaceDocument);
    return this.saveWorkspace(doc);
  }

  saveWorkspaceAs(doc: LinghuiWorkspaceDocument, name?: string): LinghuiWorkspaceDocument {
    const cloned = normalizeLinghuiWorkspaceDocument({
      ...JSON.parse(JSON.stringify(doc)),
      id: randomLinghuiId(),
      name: name ?? `${sanitizeLinghuiWorkspaceName(doc.name)} 副本`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
    } as LinghuiWorkspaceDocument);
    return this.saveWorkspace(cloned);
  }

  deleteWorkspace(workspaceId: string): void {
    baseDB.transaction(() => {
      this.getDb().prepare('DELETE FROM linghui_workspaces WHERE id = ?').run(workspaceId);
      this.getDb().prepare('DELETE FROM linghui_workflow_templates WHERE workspace_id = ?').run(workspaceId);
      this.getDb().prepare('DELETE FROM linghui_workspace_assets WHERE workspace_id = ?').run(workspaceId);
      this.getDb().prepare('DELETE FROM linghui_workspace_history_records WHERE workspace_id = ?').run(workspaceId);
    });
    fs.rmSync(this.getWorkspaceDir(workspaceId), { recursive: true, force: true });
  }

  async importWorkspace(filePath: string): Promise<LinghuiWorkspaceDocument> {
    const lowerFilePath = filePath.toLowerCase();
    if (lowerFilePath.endsWith('.zip') || lowerFilePath.endsWith('.linghui')) {
      return this.importWorkspacePackage(filePath);
    }
    return this.importWorkspaceJson(filePath);
  }

  exportWorkspace(doc: LinghuiWorkspaceDocument, destPath: string): Promise<string> {
    if (String(destPath || '').trim().toLowerCase().endsWith('.json')) {
      return Promise.resolve(this.exportWorkspaceJson(doc, destPath));
    }
    return this.exportWorkspacePackage(doc, destPath);
  }

  private importWorkspaceJson(filePath: string): LinghuiWorkspaceDocument {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<LinghuiWorkspaceDocument>;
    const imported = normalizeLinghuiWorkspaceDocument({
      ...raw,
      id: randomLinghuiId(),
      name: sanitizeLinghuiWorkspaceName(raw.name ?? path.basename(filePath).replace(/\.linghui\.json$/i, '').replace(/\.json$/i, '')),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
    } as LinghuiWorkspaceDocument);
    return this.saveWorkspace(imported);
  }

  private exportWorkspaceJson(doc: LinghuiWorkspaceDocument, destPath: string): string {
    const normalized = normalizeLinghuiWorkspaceDocument(doc);
    fs.writeFileSync(destPath, JSON.stringify(normalized, null, 2), 'utf-8');
    return destPath;
  }

  private async exportWorkspacePackage(doc: LinghuiWorkspaceDocument, destPath: string): Promise<string> {
    const zipPath = ensureLinghuiZipPath(destPath);
    await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });

    const normalized = normalizeLinghuiWorkspaceDocument(doc);
    const workspaceDir = this.getWorkspaceDir(normalized.id);
    const collector = createLinghuiResourceCollector(workspaceDir);
    const records: LinghuiWorkspaceExportRecords = {
      workflowTemplates: this.listWorkflowTemplates(normalized.id),
      assets: this.listWorkspaceAssets(normalized.id),
      history: this.listWorkspaceHistoryRecords(normalized.id),
    };
    const exportDoc = rewriteLinghuiLocalResourceReferences(cloneLinghuiValue(normalized), collector.rewriteSource);
    const exportRecords = rewriteLinghuiLocalResourceReferences(cloneLinghuiValue(records), collector.rewriteSource);
    const manifest: LinghuiWorkspaceExportManifest = {
      format: LINGHUI_EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaceId: normalized.id,
      workspaceName: normalized.name,
      resources: collector.resources.map(({ source, archivePath, size }) => ({ source, archivePath, size })),
    };

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', () => resolve(zipPath));
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);

      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      archive.append(JSON.stringify(exportDoc, null, 2), { name: 'workspace.json' });
      archive.append(JSON.stringify(exportRecords.workflowTemplates, null, 2), { name: 'records/workflowTemplates.json' });
      archive.append(JSON.stringify(exportRecords.assets, null, 2), { name: 'records/assets.json' });
      archive.append(JSON.stringify(exportRecords.history, null, 2), { name: 'records/history.json' });
      for (const resource of collector.resources) {
        archive.file(resource.localPath, { name: resource.archivePath });
      }
      archive.finalize();
    });
  }

  private async importWorkspacePackage(filePath: string): Promise<LinghuiWorkspaceDocument> {
    const tempDir = path.join(os.tmpdir(), `koma-linghui-import-${Date.now()}-${randomLinghuiId(6)}`);

    try {
      await fs.promises.mkdir(tempDir, { recursive: true });
      await extract(filePath, { dir: tempDir });

      const manifestPath = path.join(tempDir, 'manifest.json');
      const workspacePath = path.join(tempDir, 'workspace.json');
      if (!fs.existsSync(manifestPath) || !fs.existsSync(workspacePath)) {
        throw new Error('灵绘导入包缺少 manifest.json 或 workspace.json');
      }

      const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8')) as Partial<LinghuiWorkspaceExportManifest>;
      if (manifest.format !== LINGHUI_EXPORT_FORMAT) {
        throw new Error('不是有效的灵绘工作区导出包');
      }

      const rawDoc = JSON.parse(await fs.promises.readFile(workspacePath, 'utf-8')) as Partial<LinghuiWorkspaceDocument>;
      const readRecordFile = async <T>(relativePath: string, fallback: T): Promise<T> => {
        const target = resolveArchiveEntry(tempDir, relativePath);
        if (!fs.existsSync(target)) {
          return fallback;
        }
        return JSON.parse(await fs.promises.readFile(target, 'utf-8')) as T;
      };
      const rawRecords: LinghuiWorkspaceExportRecords = {
        workflowTemplates: await readRecordFile('records/workflowTemplates.json', []),
        assets: await readRecordFile('records/assets.json', []),
        history: await readRecordFile('records/history.json', []),
      };

      const importedId = randomLinghuiId();
      const importedWorkspaceDir = this.getWorkspaceDir(importedId);
      const archivePaths = new Set<string>();
      collectLinghuiArchiveReferences(rawDoc, archivePaths);
      collectLinghuiArchiveReferences(rawRecords, archivePaths);
      if (Array.isArray(manifest.resources)) {
        manifest.resources.forEach(resource => {
          if (resource?.archivePath) {
            archivePaths.add(normalizeArchiveEntryPath(resource.archivePath));
          }
        });
      }
      await copyLinghuiArchiveResources({
        tempDir,
        workspaceDir: importedWorkspaceDir,
        archivePaths,
      });

      const now = Date.now();
      const importedDoc = normalizeLinghuiWorkspaceDocument(rewriteLinghuiArchiveResourceReferences({
        ...rawDoc,
        id: importedId,
        name: sanitizeLinghuiWorkspaceName(rawDoc.name ?? manifest.workspaceName ?? path.basename(filePath).replace(/\.linghui\.zip$/i, '').replace(/\.zip$/i, '')),
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      } as LinghuiWorkspaceDocument, importedWorkspaceDir));
      const remappedDocument = remapLinghuiImportedDocument(importedDoc);
      const importedRecords = retargetLinghuiWorkspaceRecords(
        rewriteLinghuiArchiveResourceReferences(rawRecords, importedWorkspaceDir),
        importedId,
        {
          nodeIds: remappedDocument.nodeIds,
          groupIds: remappedDocument.groupIds,
        },
      );

      const saved = this.saveWorkspace(remappedDocument.doc);
      this.replaceWorkspaceExportRecords(importedId, importedRecords);
      return saved;
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  listWorkflowTemplates(workspaceId: string): LinghuiWorkflowTemplateRecord[] {
    const templateRows = this.getDb().prepare(
      'SELECT * FROM linghui_workflow_templates WHERE workspace_id = ? ORDER BY updated_at DESC'
    ).all(workspaceId) as LinghuiWorkflowTemplateRow[];

    const listTemplateGroups = this.getDb().prepare(
      'SELECT * FROM linghui_workflow_template_groups WHERE template_id = ? ORDER BY sort_order'
    );
    const listTemplateNodes = this.getDb().prepare(
      'SELECT * FROM linghui_workflow_template_nodes WHERE template_id = ? ORDER BY sort_order'
    );
    const listTemplateEdges = this.getDb().prepare(
      'SELECT * FROM linghui_workflow_template_edges WHERE template_id = ? ORDER BY sort_order'
    );

    return templateRows.map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      description: row.description ?? undefined,
      source: 'workspace',
      kind: 'saved-workflow',
      recipeKey: undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceGroupId: row.source_group_id ?? undefined,
      nodeCount: row.node_count,
      linkCount: row.link_count,
      groupCount: row.group_count,
      sampleNodeLabels: parseLinghuiJson<string[]>(row.sample_node_labels_json, []),
      snapshotPath: buildLinghuiTemplateSnapshotKey(row.workspace_id, row.id),
      snapshot: {
        nodes: (listTemplateNodes.all(row.id) as LinghuiGraphNodeRow[]).map(nodeRowToSnapshot),
        edges: (listTemplateEdges.all(row.id) as LinghuiGraphEdgeRow[]).map(edgeRowToSnapshot),
        groups: (listTemplateGroups.all(row.id) as LinghuiGraphGroupRow[]).map(groupRowToSnapshot),
      },
    }));
  }

  private replaceWorkspaceExportRecords(workspaceId: string, records: LinghuiWorkspaceExportRecords): void {
    baseDB.transaction(() => {
      this.getDb().prepare('DELETE FROM linghui_workflow_templates WHERE workspace_id = ?').run(workspaceId);
      this.getDb().prepare('DELETE FROM linghui_workspace_assets WHERE workspace_id = ?').run(workspaceId);
      this.getDb().prepare('DELETE FROM linghui_workspace_history_records WHERE workspace_id = ?').run(workspaceId);

      records.workflowTemplates.forEach(template => {
        this.insertWorkflowTemplateRecord({
          ...template,
          workspaceId,
          source: 'workspace',
          kind: 'saved-workflow',
        });
      });
      records.assets.forEach(record => this.insertWorkspaceAssetRecord({
        ...record,
        workspaceId,
      }));
      records.history.forEach(record => this.insertWorkspaceHistoryRecord({
        ...record,
        workspaceId,
      }));
    });
  }

  private insertWorkflowTemplateRecord(record: LinghuiWorkflowTemplateRecord): void {
    const stats = buildLinghuiGraphStats({
      version: 2,
      nodes: record.snapshot.nodes,
      edges: record.snapshot.edges,
      groups: record.snapshot.groups,
    });
    const sampleNodeLabels = record.sampleNodeLabels?.length
      ? record.sampleNodeLabels
      : record.snapshot.nodes
          .map(node => node.data?.label?.trim())
          .filter((label): label is string => Boolean(label))
          .slice(0, 4);

    this.getDb().prepare(`
      INSERT OR REPLACE INTO linghui_workflow_templates (
        id, workspace_id, name, description, source, kind, recipe_key,
        created_at, updated_at, source_group_id, node_count, link_count, group_count, sample_node_labels_json
      ) VALUES (?, ?, ?, ?, 'workspace', 'saved-workflow', NULL, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.workspaceId,
      record.name?.trim() || '未命名工作流',
      record.description?.trim() || null,
      record.createdAt || Date.now(),
      record.updatedAt || record.createdAt || Date.now(),
      record.sourceGroupId ?? null,
      stats.nodeCount,
      stats.linkCount,
      stats.groupCount,
      stringifyLinghuiJson(sampleNodeLabels),
    );

    this.getDb().prepare('DELETE FROM linghui_workflow_template_groups WHERE template_id = ?').run(record.id);
    this.getDb().prepare('DELETE FROM linghui_workflow_template_nodes WHERE template_id = ?').run(record.id);
    this.getDb().prepare('DELETE FROM linghui_workflow_template_edges WHERE template_id = ?').run(record.id);

    const insertGroup = this.getDb().prepare(`
      INSERT INTO linghui_workflow_template_groups (
        id, template_id, position_x, position_y, label, color, collapsed, width, height, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    record.snapshot.groups.forEach((group, index) => {
      insertGroup.run(
        group.id,
        record.id,
        group.position.x,
        group.position.y,
        group.data.label,
        group.data.color,
        group.data.collapsed ? 1 : 0,
        group.style.width,
        group.style.height,
        index,
      );
    });

    const insertNode = this.getDb().prepare(`
      INSERT INTO linghui_workflow_template_nodes (
        id, template_id, type, position_x, position_y, width, height, parent_group_id,
        label, accent, background, view_mode, active, properties_json, inputs_json, outputs_json, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    record.snapshot.nodes.forEach((node, index) => {
      insertNode.run(
        node.id,
        record.id,
        node.type,
        node.position.x,
        node.position.y,
        node.width ?? null,
        node.height ?? null,
        node.parentId ?? null,
        node.data.label,
        node.data.accent,
        node.data.background,
        node.data.viewMode ?? null,
        node.data.active ? 1 : 0,
        stringifyLinghuiJson(node.data.properties ?? {}),
        stringifyLinghuiJson(node.data.inputs ?? []),
        stringifyLinghuiJson(node.data.outputs ?? []),
        index,
      );
    });

    const insertEdge = this.getDb().prepare(`
      INSERT INTO linghui_workflow_template_edges (
        id, template_id, source_node_id, target_node_id, source_handle, target_handle, edge_type, data_json, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    record.snapshot.edges.forEach((edge, index) => {
      insertEdge.run(
        edge.id,
        record.id,
        edge.source,
        edge.target,
        edge.sourceHandle,
        edge.targetHandle,
        edge.type ?? null,
        edge.data ? stringifyLinghuiJson(edge.data) : null,
        index,
      );
    });
  }

  private insertWorkspaceAssetRecord(record: LinghuiWorkspaceAssetRecord): void {
    this.getDb().prepare(`
      INSERT OR REPLACE INTO linghui_workspace_assets (
        id, workspace_id, node_id, node_type, kind, name, created_at,
        source, preview_source, poster_source, text, snapshot_path, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.workspaceId,
      record.nodeId,
      record.nodeType,
      record.kind,
      record.name || '未命名资产',
      record.createdAt || Date.now(),
      record.source ?? null,
      record.previewSource ?? null,
      record.posterSource ?? null,
      record.text ?? null,
      record.snapshotPath ?? buildLinghuiLibrarySnapshotKey(record.workspaceId, 'assets', record.id),
      stringifyLinghuiJson(record.metadata ?? {}),
    );
  }

  private insertWorkspaceHistoryRecord(record: LinghuiWorkspaceHistoryRecord): void {
    this.getDb().prepare(`
      INSERT OR REPLACE INTO linghui_workspace_history_records (
        id, workspace_id, node_id, node_type, kind, name, created_at,
        source, preview_source, poster_source, text, snapshot_path, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.workspaceId,
      record.nodeId,
      record.nodeType,
      record.kind,
      record.name || '未命名结果',
      record.createdAt || Date.now(),
      record.source ?? null,
      record.previewSource ?? null,
      record.posterSource ?? null,
      record.text ?? null,
      record.snapshotPath ?? buildLinghuiLibrarySnapshotKey(record.workspaceId, 'history', record.id),
      stringifyLinghuiJson(record.metadata ?? {}),
    );
  }

  createWorkflowTemplate(params: {
    workspaceId: string;
    name: string;
    description?: string;
    snapshot: {
      nodes: LinghuiRFNodeSnapshot[];
      edges: LinghuiRFEdgeSnapshot[];
      groups: LinghuiRFGroupSnapshot[];
    };
    sourceGroupId?: string;
  }): LinghuiWorkflowTemplateRecord {
    const createdAt = Date.now();
    const updatedAt = createdAt;
    const id = randomLinghuiId();
    const name = params.name?.trim() || '未命名工作流';
    const stats = buildLinghuiGraphStats({
      version: 2,
      nodes: params.snapshot.nodes,
      edges: params.snapshot.edges,
      groups: params.snapshot.groups,
    });
    const sampleNodeLabels = params.snapshot.nodes
      .map(node => node.data?.label?.trim())
      .filter((label): label is string => Boolean(label))
      .slice(0, 4);

    baseDB.transaction(() => {
      this.getDb().prepare(`
        INSERT OR REPLACE INTO linghui_workflow_templates (
          id, workspace_id, name, description, source, kind, recipe_key,
          created_at, updated_at, source_group_id, node_count, link_count, group_count, sample_node_labels_json
        ) VALUES (?, ?, ?, ?, 'workspace', 'saved-workflow', NULL, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        params.workspaceId,
        name,
        params.description?.trim() || null,
        createdAt,
        updatedAt,
        params.sourceGroupId ?? null,
        stats.nodeCount,
        stats.linkCount,
        stats.groupCount,
        stringifyLinghuiJson(sampleNodeLabels),
      );

      this.getDb().prepare('DELETE FROM linghui_workflow_template_groups WHERE template_id = ?').run(id);
      this.getDb().prepare('DELETE FROM linghui_workflow_template_nodes WHERE template_id = ?').run(id);
      this.getDb().prepare('DELETE FROM linghui_workflow_template_edges WHERE template_id = ?').run(id);

      const insertGroup = this.getDb().prepare(`
        INSERT INTO linghui_workflow_template_groups (
          id, template_id, position_x, position_y, label, color, collapsed, width, height, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      params.snapshot.groups.forEach((group, index) => {
        insertGroup.run(
          group.id,
          id,
          group.position.x,
          group.position.y,
          group.data.label,
          group.data.color,
          group.data.collapsed ? 1 : 0,
          group.style.width,
          group.style.height,
          index,
        );
      });

      const insertNode = this.getDb().prepare(`
        INSERT INTO linghui_workflow_template_nodes (
          id, template_id, type, position_x, position_y, width, height, parent_group_id,
          label, accent, background, view_mode, active, properties_json, inputs_json, outputs_json, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      params.snapshot.nodes.forEach((node, index) => {
        insertNode.run(
          node.id,
          id,
          node.type,
          node.position.x,
          node.position.y,
          node.width ?? null,
          node.height ?? null,
          node.parentId ?? null,
          node.data.label,
          node.data.accent,
          node.data.background,
          node.data.viewMode ?? null,
          node.data.active ? 1 : 0,
          stringifyLinghuiJson(node.data.properties ?? {}),
          stringifyLinghuiJson(node.data.inputs ?? []),
          stringifyLinghuiJson(node.data.outputs ?? []),
          index,
        );
      });

      const insertEdge = this.getDb().prepare(`
        INSERT INTO linghui_workflow_template_edges (
          id, template_id, source_node_id, target_node_id, source_handle, target_handle, edge_type, data_json, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      params.snapshot.edges.forEach((edge, index) => {
        insertEdge.run(
          edge.id,
          id,
          edge.source,
          edge.target,
          edge.sourceHandle,
          edge.targetHandle,
          edge.type ?? null,
          edge.data ? stringifyLinghuiJson(edge.data) : null,
          index,
        );
      });
    });

    return {
      id,
      workspaceId: params.workspaceId,
      name,
      description: params.description?.trim() || undefined,
      source: 'workspace',
      kind: 'saved-workflow',
      createdAt,
      updatedAt,
      sourceGroupId: params.sourceGroupId,
      nodeCount: stats.nodeCount,
      linkCount: stats.linkCount,
      groupCount: stats.groupCount,
      sampleNodeLabels,
      snapshotPath: buildLinghuiTemplateSnapshotKey(params.workspaceId, id),
      snapshot: {
        nodes: params.snapshot.nodes,
        edges: params.snapshot.edges,
        groups: params.snapshot.groups,
      },
    };
  }

  listWorkspaceAssets(workspaceId: string): LinghuiWorkspaceAssetRecord[] {
    const rows = this.getDb().prepare(
      'SELECT * FROM linghui_workspace_assets WHERE workspace_id = ? ORDER BY created_at DESC'
    ).all(workspaceId) as LinghuiLibraryRecordRow[];
    return rows.map(libraryRowToAssetRecord);
  }

  listWorkspaceHistoryRecords(workspaceId: string): LinghuiWorkspaceHistoryRecord[] {
    const rows = this.getDb().prepare(
      'SELECT * FROM linghui_workspace_history_records WHERE workspace_id = ? ORDER BY created_at DESC'
    ).all(workspaceId) as LinghuiLibraryRecordRow[];
    return rows.map(libraryRowToHistoryRecord);
  }

  async createWorkspaceAsset(params: {
    workspaceId: string;
    nodeId: string;
    nodeData: LinghuiNodeData;
    nodeRun?: LinghuiNodeRunState;
  }): Promise<LinghuiWorkspaceAssetRecord> {
    const createdAt = Date.now();
    const assetId = randomLinghuiId();
    const assetName = params.nodeData.label?.trim() || '未命名资产';
    const kind = resolveLinghuiLibraryRecordKind(params.nodeData, params.nodeRun);
    const textValue = getNodeAssetTextValue(params.nodeData, params.nodeRun);
    const media = getPrimaryAssetMedia(params.nodeData, params.nodeRun);

    if (!textValue && !media?.source) {
      throw new Error('当前节点还没有可保存为资产的内容，请先输入内容或先运行节点');
    }

    const assetDir = path.join(
      this.getWorkspaceDir(params.workspaceId),
      'assets',
      'library',
      kind,
      `${createdAt}-${sanitizeLinghuiAssetSegment(assetName)}`,
    );

    let persistedSource: string | undefined;
    let persistedPosterSource: string | undefined;

    if (kind === 'text') {
      const textPath = path.join(assetDir, 'content.txt');
      await fs.promises.mkdir(assetDir, { recursive: true });
      await fs.promises.writeFile(textPath, textValue, 'utf-8');
      persistedSource = textPath;
    } else {
      persistedSource = await materializeLinghuiSource({
        assetDir,
        filename: kind,
        source: media?.source,
        fallbackExt: kind === 'audio' ? 'mp3' : kind === 'video' ? 'mp4' : 'png',
        mimeType: media?.mimeType,
      });
      if (kind === 'video') {
        persistedPosterSource = await materializeLinghuiSource({
          assetDir,
          filename: 'poster',
          source: media?.posterSource,
          fallbackExt: 'png',
        });
      }
    }

    const record: LinghuiWorkspaceAssetRecord = {
      id: assetId,
      workspaceId: params.workspaceId,
      nodeId: params.nodeId,
      nodeType: params.nodeData.linghuiType,
      kind,
      name: assetName,
      createdAt,
      source: persistedSource,
      previewSource: kind === 'video' ? (persistedPosterSource || persistedSource) : persistedSource,
      posterSource: persistedPosterSource,
      text: textValue || undefined,
      snapshotPath: buildLinghuiLibrarySnapshotKey(params.workspaceId, 'assets', assetId),
      metadata: {
        nodeLabel: params.nodeData.label,
        resultKind: params.nodeRun?.result?.kind,
        itemCount: getLinghuiResultItemCount(params.nodeRun?.result),
        hasRunResult: Boolean(params.nodeRun?.result),
        width: typeof media?.width === 'number' ? media.width : undefined,
        height: typeof media?.height === 'number' ? media.height : undefined,
        aspectRatio: typeof media?.metadata?.aspectRatio === 'string' ? media.metadata.aspectRatio : undefined,
        prompt: typeof (params.nodeData.properties as Record<string, unknown>).prompt === 'string'
          ? (params.nodeData.properties as Record<string, unknown>).prompt
          : undefined,
      },
    };

    this.getDb().prepare(`
      INSERT OR REPLACE INTO linghui_workspace_assets (
        id, workspace_id, node_id, node_type, kind, name, created_at,
        source, preview_source, poster_source, text, snapshot_path, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.workspaceId,
      record.nodeId,
      record.nodeType,
      record.kind,
      record.name,
      record.createdAt,
      record.source ?? null,
      record.previewSource ?? null,
      record.posterSource ?? null,
      record.text ?? null,
      record.snapshotPath,
      stringifyLinghuiJson(record.metadata ?? {}),
    );

    return record;
  }

  async syncProductionAssets(params: {
    workspaceId: string;
    nodeId: string;
    nodeType: LinghuiNodeData['linghuiType'];
    assets: Array<{
      id: string;
      kind: 'character' | 'scene' | 'prop';
      name: string;
      description: string;
      sourceShotIds: string[];
      referenceImage?: string;
      aliases?: string[];
      mergedAssetIds?: string[];
      confirmed: boolean;
      status?: 'draft' | 'approved' | 'locked';
    }>;
  }): Promise<LinghuiProductionAssetSyncResult> {
    const workspaceId = String(params.workspaceId ?? '').trim();
    const nodeId = String(params.nodeId ?? '').trim();
    if (!workspaceId || !nodeId) {
      throw new Error('同步生产资产需要有效的工作区和来源节点');
    }

    const existingRecords = this.listWorkspaceAssets(workspaceId);
    const existingById = new Map(existingRecords.map(record => [record.id, record]));
    const normalizedAssets = normalizeLinghuiProductionAssetSyncItems(params.assets);
    const records: LinghuiWorkspaceAssetRecord[] = [];

    for (const asset of normalizedAssets) {
      const recordId = buildLinghuiProductionAssetRecordId(workspaceId, nodeId, asset.id);
      const existing = existingById.get(recordId);
      const existingMetadata = existing
        ? resolveLinghuiProductionAssetRecordMetadata(existing)
        : null;
      const referenceFingerprint = buildLinghuiProductionReferenceFingerprint(asset.referenceImage);
      let persistedSource: string | undefined;

      if (asset.referenceImage) {
        if (
          existing?.source
          && existingMetadata?.sourceReferenceFingerprint === referenceFingerprint
        ) {
          persistedSource = existing.source;
        } else {
          persistedSource = await materializeLinghuiSource({
            assetDir: path.join(
              this.getWorkspaceDir(workspaceId),
              'assets',
              'library',
              'production',
              asset.kind,
              recordId,
            ),
            filename: 'reference',
            source: asset.referenceImage,
            fallbackExt: 'png',
          });
        }
      }

      const kind = persistedSource ? 'image' : 'text';
      const record: LinghuiWorkspaceAssetRecord = {
        id: recordId,
        workspaceId,
        nodeId,
        nodeType: params.nodeType,
        kind,
        name: asset.name,
        createdAt: existing?.createdAt ?? Date.now(),
        source: persistedSource,
        previewSource: persistedSource,
        text: asset.description || undefined,
        snapshotPath: buildLinghuiLibrarySnapshotKey(workspaceId, 'assets', recordId),
        metadata: {
          recordType: 'production-asset',
          sourceNodeId: nodeId,
          productionAssetId: asset.id,
          productionAssetKind: asset.kind,
          productionAssetName: asset.name,
          sourceShotIds: asset.sourceShotIds,
          sourceReferenceImage: asset.referenceImage
            && asset.referenceImage.length <= 2048
            && !asset.referenceImage.startsWith('data:')
            && !asset.referenceImage.startsWith('blob:')
              ? asset.referenceImage
              : undefined,
          sourceReferenceFingerprint: referenceFingerprint,
          productionAssetAliases: asset.aliases,
          mergedProductionAssetIds: asset.mergedAssetIds,
          confirmed: true,
          productionAssetStatus: asset.status,
        },
      };
      records.push(record);
    }

    const desiredRecordIds = new Set(records.map(record => record.id));
    const removedIds = listStaleLinghuiProductionAssetRecordIds({
      existingRecords,
      nodeId,
      desiredRecordIds,
    });

    baseDB.transaction(() => {
      records.forEach(record => this.insertWorkspaceAssetRecord(record));
      const deleteRecord = this.getDb().prepare(
        'DELETE FROM linghui_workspace_assets WHERE workspace_id = ? AND id = ?',
      );
      removedIds.forEach(id => deleteRecord.run(workspaceId, id));
    });

    return { records, removedIds };
  }

  async createWorkspaceHistoryRecord(params: {
    workspaceId: string;
    nodeId: string;
    nodeData: LinghuiNodeData;
    nodeRun?: LinghuiNodeRunState;
  }): Promise<LinghuiWorkspaceHistoryRecordResult> {
    const createdAt = params.nodeRun?.updatedAt ?? Date.now();
    const historyId = randomLinghuiId();
    const historyName = params.nodeData.label?.trim() || '未命名结果';
    const kind = resolveLinghuiLibraryRecordKind(params.nodeData, params.nodeRun);
    const textValue = getNodeAssetTextValue(params.nodeData, params.nodeRun);
    const media = getPrimaryAssetMedia(params.nodeData, params.nodeRun);
    const materializedRun = params.nodeRun ? JSON.parse(JSON.stringify(params.nodeRun)) as LinghuiNodeRunState : undefined;

    if (!textValue && !media?.source) {
      throw new Error('当前节点还没有可记录的执行结果');
    }

    const historyDir = path.join(
      this.getWorkspaceDir(params.workspaceId),
      'history',
      'results',
      kind,
      `${createdAt}-${sanitizeLinghuiAssetSegment(historyName)}-${historyId}`,
    );

    let persistedSource: string | undefined;
    let persistedPosterSource: string | undefined;

    const materializeMediaItem = async (item: LinghuiMediaItem, options: { filename: string; posterFilename?: string }) => {
      const fallbackExt = item.kind === 'audio' ? 'mp3' : item.kind === 'video' ? 'mp4' : 'png';
      const nextSource = await materializeLinghuiSource({
        assetDir: historyDir,
        filename: options.filename,
        source: item.source,
        fallbackExt,
        mimeType: item.mimeType,
      });
      const nextPosterSource = item.kind === 'video'
        ? await materializeLinghuiSource({
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
      };
    };

    if (kind === 'text') {
      await fs.promises.mkdir(historyDir, { recursive: true });
      const textPath = path.join(historyDir, 'content.txt');
      await fs.promises.writeFile(textPath, textValue, 'utf-8');
      persistedSource = textPath;
    } else {
      const resultPrimary = materializedRun?.result ? (materializedRun.result as any).primary as LinghuiMediaItem | undefined : undefined;
      if (materializedRun?.result && resultPrimary) {
        const nextPrimary = await materializeMediaItem(resultPrimary, {
          filename: kind,
          posterFilename: kind === 'video' ? 'poster' : undefined,
        });
        assignLinghuiResultPrimary(materializedRun.result, nextPrimary);
        persistedSource = nextPrimary.source;
        persistedPosterSource = kind === 'video' ? nextPrimary.posterSource : undefined;
      } else if (media) {
        persistedSource = await materializeLinghuiSource({
          assetDir: historyDir,
          filename: kind,
          source: media.source,
          fallbackExt: kind === 'audio' ? 'mp3' : kind === 'video' ? 'mp4' : 'png',
          mimeType: media.mimeType,
        });
        if (kind === 'video') {
          persistedPosterSource = await materializeLinghuiSource({
            assetDir: historyDir,
            filename: 'poster',
            source: media.posterSource,
            fallbackExt: 'png',
          });
        }
      }

      if (materializedRun?.result && !(materializedRun.result as any).primary && persistedSource) {
        assignLinghuiResultPrimary(materializedRun.result, {
          kind: kind as LinghuiMediaItem['kind'],
          label: historyName,
          source: persistedSource,
          posterSource: persistedPosterSource,
        });
      }

      if (materializedRun?.result && getLinghuiResultItems(materializedRun.result).length) {
        (materializedRun.result as any).items = await Promise.all(
          getLinghuiResultItems(materializedRun.result).map((item, index) => materializeMediaItem(item, { filename: `item-${index + 1}` })),
        );
      }

      if (materializedRun?.result && getLinghuiResultShots(materializedRun.result).length) {
        (materializedRun.result as any).shots = await Promise.all(
          getLinghuiResultShots(materializedRun.result).map(async (shot, index) => {
            if (!shot?.image) return shot;
            return {
              ...shot,
              image: await materializeMediaItem(shot.image, { filename: `shot-${index + 1}` }),
            };
          }),
        );
      }
    }

    const record: LinghuiWorkspaceHistoryRecord = {
      id: historyId,
      workspaceId: params.workspaceId,
      nodeId: params.nodeId,
      nodeType: params.nodeData.linghuiType,
      kind,
      name: historyName,
      createdAt,
      source: persistedSource,
      previewSource: kind === 'video' ? (persistedPosterSource || persistedSource) : persistedSource,
      posterSource: persistedPosterSource,
      text: textValue || undefined,
      snapshotPath: buildLinghuiLibrarySnapshotKey(params.workspaceId, 'history', historyId),
      metadata: {
        nodeLabel: params.nodeData.label,
        resultKind: params.nodeRun?.result?.kind,
        upstreamIds: params.nodeRun?.upstreamIds ?? [],
        itemCount: getLinghuiResultItemCount(params.nodeRun?.result),
        width: typeof media?.width === 'number' ? media.width : undefined,
        height: typeof media?.height === 'number' ? media.height : undefined,
        aspectRatio: typeof media?.metadata?.aspectRatio === 'string' ? media.metadata.aspectRatio : undefined,
        prompt: typeof (params.nodeData.properties as Record<string, unknown>).prompt === 'string'
          ? (params.nodeData.properties as Record<string, unknown>).prompt
          : undefined,
      },
    };

    this.getDb().prepare(`
      INSERT OR REPLACE INTO linghui_workspace_history_records (
        id, workspace_id, node_id, node_type, kind, name, created_at,
        source, preview_source, poster_source, text, snapshot_path, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.workspaceId,
      record.nodeId,
      record.nodeType,
      record.kind,
      record.name,
      record.createdAt,
      record.source ?? null,
      record.previewSource ?? null,
      record.posterSource ?? null,
      record.text ?? null,
      record.snapshotPath,
      stringifyLinghuiJson(record.metadata ?? {}),
    );

    return {
      record,
      materializedRun,
    };
  }

  async importWorkspaceAsset(workspaceId: string, sourcePath: string, filenameHint?: string): Promise<string> {
    return copyLinghuiWorkspaceAsset({
      workspaceDir: this.getWorkspaceDir(workspaceId),
      sourcePath,
      filenameHint,
    });
  }

  /* ============================================================================
   * 全局资产库（C-5B）：用户自定义的角色 / 道具，跨 workspace 共享。
   * 内置预设（DIRECTOR3D_CHARACTER_PRESETS / DIRECTOR3D_PROP_LIBRARY）在前端，
   * 这里只存"用户保存的"自定义条目。
   * ============================================================================ */

  listGlobalAssets(kind?: 'character' | 'prop'): LinghuiGlobalAssetRecord[] {
    const sql = kind
      ? 'SELECT * FROM linghui_global_assets WHERE kind = ? ORDER BY favorite DESC, updated_at DESC'
      : 'SELECT * FROM linghui_global_assets ORDER BY favorite DESC, updated_at DESC';
    const rows = kind
      ? this.getDb().prepare(sql).all(kind) as LinghuiGlobalAssetRow[]
      : this.getDb().prepare(sql).all() as LinghuiGlobalAssetRow[];
    return rows.map(rowToGlobalAsset);
  }

  upsertGlobalAsset(input: LinghuiGlobalAssetInput): LinghuiGlobalAssetRecord {
    const now = Date.now();
    const id = input.id ?? `gasset_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const existing = this.getDb()
      .prepare('SELECT created_at FROM linghui_global_assets WHERE id = ?')
      .get(id) as { created_at: number } | undefined;
    const createdAt = existing?.created_at ?? now;

    // reference_images_json：JSON 数组存 koma-local URL；undefined / 空数组都序列化成 NULL
    const referenceImagesJson = Array.isArray(input.referenceImages) && input.referenceImages.length > 0
      ? JSON.stringify(input.referenceImages.filter(item => typeof item === 'string' && item.trim()))
      : null;

    this.getDb().prepare(`
      INSERT OR REPLACE INTO linghui_global_assets (
        id, kind, label, hint, prompt_hint, color, scale, pose_preset,
        prop_type, category, favorite, reference_images_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.kind,
      input.label,
      input.hint ?? null,
      input.promptHint ?? null,
      input.color ?? null,
      typeof input.scale === 'number' ? input.scale : null,
      input.posePreset ?? null,
      input.propType ?? null,
      input.category ?? null,
      input.favorite ? 1 : 0,
      referenceImagesJson,
      createdAt,
      now,
    );

    return rowToGlobalAsset(
      this.getDb().prepare('SELECT * FROM linghui_global_assets WHERE id = ?').get(id) as LinghuiGlobalAssetRow,
    );
  }

  deleteGlobalAsset(id: string): boolean {
    const info = this.getDb().prepare('DELETE FROM linghui_global_assets WHERE id = ?').run(id);
    return (info?.changes ?? 0) > 0;
  }
}

interface LinghuiGlobalAssetRow {
  id: string;
  kind: 'character' | 'prop';
  label: string;
  hint: string | null;
  prompt_hint: string | null;
  color: string | null;
  scale: number | null;
  pose_preset: string | null;
  prop_type: string | null;
  category: string | null;
  favorite: number;
  reference_images_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface LinghuiGlobalAssetRecord {
  id: string;
  kind: 'character' | 'prop';
  label: string;
  hint?: string;
  promptHint?: string;
  color?: string;
  scale?: number;
  posePreset?: string;
  propType?: string;
  category?: string;
  favorite: boolean;
  /** 参考图（koma-local URL 数组）；character 用作脸部 / 服装参考，prop 用作样式图 */
  referenceImages?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface LinghuiGlobalAssetInput {
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
}

function parseReferenceImages(json: string | null): string[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return undefined;
    const cleaned = parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  } catch {
    return undefined;
  }
}

function rowToGlobalAsset(row: LinghuiGlobalAssetRow): LinghuiGlobalAssetRecord {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    hint: row.hint ?? undefined,
    promptHint: row.prompt_hint ?? undefined,
    color: row.color ?? undefined,
    scale: row.scale ?? undefined,
    posePreset: row.pose_preset ?? undefined,
    propType: row.prop_type ?? undefined,
    category: row.category ?? undefined,
    favorite: row.favorite === 1,
    referenceImages: parseReferenceImages(row.reference_images_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const linghuiService = new LinghuiService();
