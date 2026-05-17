import type {
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiRFNodeSnapshot,
  LinghuiStoryboardFrame,
} from '../../../../types/linghui';
import {
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
  getLinghuiResultShots,
  getLinghuiResultText,
  isLinghuiImageCollectionResult,
} from '../../../../types/linghui';
import { isBlobUri, isDataUri, isRemoteMediaUri } from '../../../../types';
import { getFileSystemPort } from '../../../../services/fileSystemPort';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';

export interface LinghuiResultExportTarget {
  node: LinghuiRFNodeSnapshot;
  runState?: LinghuiNodeRunState;
}

export interface LinghuiResultExportSummary {
  bundleDir: string;
  fileCount: number;
  nodeCount: number;
  skippedNodeIds: string[];
}

interface ExportedFileRecord {
  path: string;
  kind: 'image' | 'video' | 'audio' | 'text' | 'json';
  label?: string;
  source?: string;
}

interface ExportedNodeRecord {
  nodeId: string;
  label: string;
  nodeType: string;
  runStatus?: LinghuiNodeRunState['status'];
  resultKind?: string;
  exported: boolean;
  reason?: string;
  files: ExportedFileRecord[];
}

export async function exportLinghuiNodeResults(params: {
  workspaceName: string;
  targets: LinghuiResultExportTarget[];
}): Promise<LinghuiResultExportSummary | null> {
  const fileSystemPort = getFileSystemPort();
  if (!fileSystemPort.capabilities.directoryPicker) {
    throw new Error('当前文件系统实现不支持结果导出');
  }

  const exportDir = await fileSystemPort.pickDirectory();
  if (!exportDir) {
    return null;
  }

  const timestamp = Date.now();
  const bundleDir = joinPath(
    exportDir,
    `${sanitizeSegment(params.workspaceName, 'linghui')}-results-${formatExportTimestamp(timestamp)}`,
  );

  await fileSystemPort.mkdir(bundleDir);

  const exportedNodes: ExportedNodeRecord[] = [];
  const skippedNodeIds: string[] = [];
  let fileCount = 0;

  for (const [index, target] of params.targets.entries()) {
    const exportedNode = await exportNodeTarget(target, index, bundleDir);
    exportedNodes.push(exportedNode);
    fileCount += exportedNode.files.length;
    if (!exportedNode.exported) {
      skippedNodeIds.push(exportedNode.nodeId);
    }
  }

  await fileSystemPort.writeText(joinPath(bundleDir, 'manifest.json'), JSON.stringify({
    version: 1,
    workspaceName: params.workspaceName,
    exportedAt: timestamp,
    exportedNodeCount: exportedNodes.filter(item => item.exported).length,
    requestedNodeCount: params.targets.length,
    skippedNodeIds,
    nodes: exportedNodes,
  }, null, 2));

  return {
    bundleDir,
    fileCount: fileCount + 1,
    nodeCount: exportedNodes.filter(item => item.exported).length,
    skippedNodeIds,
  };
}
import { sanitizeSegment, formatExportTimestamp, joinPath, exportMediaFile, exportNodeTarget, resolveNodeLabel, resolveNodeTextValue, resolvePrimaryMedia, dedupeMediaItems, getDefaultExtension, inferExtension, getFileExtensionFromPath } from './linghuiResultExportUtils';
