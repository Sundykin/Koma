import { electronService } from '../services/electronService';
import {
  DEFAULT_LINGHUI_WORKSPACE_NAME,
  getLinghuiResultItemCount,
  type LinghuiGraphStats,
  type LinghuiNodeData,
  type LinghuiNodeRunState,
  type LinghuiNodeType,
  type LinghuiSubgraphSnapshot,
  type LinghuiWorkspaceDocument,
  type LinghuiWorkspaceMeta,
} from '../types/linghui';
import {
  listBuiltinLinghuiRecipeTemplates,
  type LinghuiRecipeTemplateKey,
} from '../components/linghui/library/state/linghuiRecipeTemplates';

function assertLinghuiBackend() {
  if (!electronService.isElectron()) {
    throw new Error('灵绘存储仅支持 Electron 环境');
  }
  return electronService.linghui;
}

function buildSubgraphStats(snapshot: LinghuiSubgraphSnapshot): LinghuiGraphStats {
  return {
    nodeCount: snapshot.nodes.length,
    linkCount: snapshot.edges.length,
    groupCount: snapshot.groups.length,
  };
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

function normalizeLinghuiWorkflowTemplateRecord(
  record: LinghuiWorkflowTemplateRecord,
): LinghuiWorkflowTemplateRecord {
  return {
    ...record,
    source: record.source === 'system' ? 'system' : 'workspace',
    kind: record.kind === 'recipe' ? 'recipe' : 'saved-workflow',
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
      snapshot: JSON.parse(JSON.stringify(template.snapshot)),
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

export async function listLinghuiWorkspaces(): Promise<LinghuiWorkspaceMeta[]> {
  return assertLinghuiBackend().listWorkspaces();
}

export async function loadLinghuiWorkspace(workspaceId: string): Promise<LinghuiWorkspaceDocument | null> {
  return assertLinghuiBackend().loadWorkspace(workspaceId);
}

export async function saveLinghuiWorkspace(doc: LinghuiWorkspaceDocument): Promise<LinghuiWorkspaceDocument> {
  return assertLinghuiBackend().saveWorkspace(doc);
}

export async function createLinghuiWorkspace(
  name: string = DEFAULT_LINGHUI_WORKSPACE_NAME,
): Promise<LinghuiWorkspaceDocument> {
  return assertLinghuiBackend().createWorkspace(name);
}

export async function saveLinghuiWorkspaceAs(
  doc: LinghuiWorkspaceDocument,
  name?: string,
): Promise<LinghuiWorkspaceDocument> {
  return assertLinghuiBackend().saveWorkspaceAs(doc, name);
}

export async function deleteLinghuiWorkspace(workspaceId: string): Promise<void> {
  await assertLinghuiBackend().deleteWorkspace(workspaceId);
}

export async function getLinghuiWorkspaceDir(workspaceId: string): Promise<string> {
  return assertLinghuiBackend().getWorkspaceDir(workspaceId);
}

export async function importLinghuiWorkspace(filePath: string): Promise<LinghuiWorkspaceDocument> {
  return assertLinghuiBackend().importWorkspace(filePath);
}

export async function exportLinghuiWorkspace(
  doc: LinghuiWorkspaceDocument,
): Promise<string | null> {
  const result = await electronService.dialog.saveFile({
    title: '导出灵绘工作区',
    defaultPath: `${(doc.name || DEFAULT_LINGHUI_WORKSPACE_NAME).replace(/[\\/:*?"<>|]/g, '-')}.linghui.json`,
    filters: [{ name: 'Linghui Workspace', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await assertLinghuiBackend().exportWorkspace(doc, result.filePath);
  return result.filePath;
}

export async function listLinghuiWorkflowTemplates(workspaceId: string): Promise<LinghuiWorkflowTemplateRecord[]> {
  if (!workspaceId) return [];
  const workspaceTemplates = await assertLinghuiBackend().listWorkflowTemplates(workspaceId);
  return [
    ...createBuiltinLinghuiWorkflowTemplateRecords(workspaceId),
    ...workspaceTemplates.map(normalizeLinghuiWorkflowTemplateRecord),
  ].sort(compareLinghuiWorkflowTemplateRecords);
}

export async function createLinghuiWorkflowTemplate(params: {
  workspaceId: string;
  name: string;
  description?: string;
  snapshot: LinghuiSubgraphSnapshot;
  sourceGroupId?: string;
}): Promise<LinghuiWorkflowTemplateRecord> {
  return assertLinghuiBackend().createWorkflowTemplate(params);
}

export async function listLinghuiWorkspaceAssets(workspaceId: string): Promise<LinghuiWorkspaceAssetRecord[]> {
  if (!workspaceId) return [];
  return assertLinghuiBackend().listWorkspaceAssets(workspaceId);
}

export async function createLinghuiWorkspaceAsset(params: {
  workspaceId: string;
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
}): Promise<LinghuiWorkspaceAssetRecord> {
  return assertLinghuiBackend().createWorkspaceAsset(params);
}

export async function listLinghuiWorkspaceHistoryRecords(workspaceId: string): Promise<LinghuiWorkspaceHistoryRecord[]> {
  if (!workspaceId) return [];
  return assertLinghuiBackend().listWorkspaceHistoryRecords(workspaceId);
}

export async function createLinghuiWorkspaceHistoryRecord(params: {
  workspaceId: string;
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
}): Promise<LinghuiWorkspaceHistoryRecordResult> {
  return assertLinghuiBackend().createWorkspaceHistoryRecord(params);
}

export async function importLinghuiWorkspaceAsset(
  workspaceId: string,
  sourcePath: string,
  filenameHint?: string,
): Promise<string> {
  return assertLinghuiBackend().importWorkspaceAsset(workspaceId, sourcePath, filenameHint);
}

export { getLinghuiResultItemCount };
