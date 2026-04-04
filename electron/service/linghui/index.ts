import * as fs from 'fs';
import * as path from 'path';
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
  LinghuiWorkflowTemplateRecord,
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
  LinghuiWorkspaceHistoryRecordResult,
} from '../../../frontend/src/store/linghuiStorage';
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

  importWorkspace(filePath: string): LinghuiWorkspaceDocument {
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

  exportWorkspace(doc: LinghuiWorkspaceDocument, destPath: string): string {
    const normalized = normalizeLinghuiWorkspaceDocument(doc);
    fs.writeFileSync(destPath, JSON.stringify(normalized, null, 2), 'utf-8');
    return destPath;
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
}

export const linghuiService = new LinghuiService();
