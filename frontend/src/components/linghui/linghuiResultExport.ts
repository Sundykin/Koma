import type {
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiRFNodeSnapshot,
  LinghuiStoryboardFrame,
} from '../../types/linghui';
import { isBlobUri, isDataUri, isRemoteMediaUri } from '../../types';
import { electronService, fsWriteFileBuffer } from '../../services/electronService';

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

function sanitizeSegment(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || fallback;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatExportTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.replace(/\/+$/g, '') : part.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

function getFileExtensionFromPath(path: string, fallback: string): string {
  const normalized = path.split('?')[0].split('#')[0];
  const match = normalized.match(/\.([a-zA-Z0-9]{1,8})$/);
  return match?.[1]?.toLowerCase() || fallback;
}

function getFileExtensionFromMimeType(mimeType: string | undefined, fallback: string): string {
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
    case 'audio/flac':
      return 'flac';
    case 'audio/aac':
      return 'aac';
    case 'text/plain':
      return 'txt';
    case 'application/json':
      return 'json';
    default:
      return fallback;
  }
}

function getDefaultExtension(kind: LinghuiMediaItem['kind']): string {
  switch (kind) {
    case 'video':
      return 'mp4';
    case 'audio':
      return 'mp3';
    case 'image':
    default:
      return 'png';
  }
}

function inferExtension(source: string | undefined, mimeType: string | undefined, fallback: string): string {
  if (source) {
    if (isDataUri(source)) {
      const match = source.match(/^data:([^;,]+)[;,]/i);
      if (match?.[1]) {
        return getFileExtensionFromMimeType(match[1], fallback);
      }
      return fallback;
    }

    const decoded = decodeLinghuiSource(source);
    return getFileExtensionFromPath(decoded, getFileExtensionFromMimeType(mimeType, fallback));
  }

  return getFileExtensionFromMimeType(mimeType, fallback);
}

function decodeLinghuiSource(source: string): string {
  if (!source.startsWith('koma-local://')) {
    return source;
  }

  const decoded = decodeURIComponent(source.replace(/^koma-local:\/\//, ''));
  return decoded.replace(/^\/([A-Za-z]:\/)/, '$1');
}

async function writeBinarySource(source: string, targetPath: string): Promise<void> {
  const normalized = decodeLinghuiSource(source);

  if (isRemoteMediaUri(normalized)) {
    await electronService.fs.downloadFile(normalized, targetPath);
    return;
  }

  if (isDataUri(normalized) || isBlobUri(normalized)) {
    const response = await fetch(normalized);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await fsWriteFileBuffer(targetPath, bytes);
    return;
  }

  await electronService.fs.copy(normalized, targetPath);
}

function resolveNodeLabel(node: LinghuiRFNodeSnapshot, fallbackIndex: number): string {
  return sanitizeSegment(String(node.data.label || `节点-${fallbackIndex + 1}`), `node-${fallbackIndex + 1}`);
}

function resolveNodeTextValue(nodeData: LinghuiNodeData, runState?: LinghuiNodeRunState): string {
  const properties = nodeData.properties as Record<string, unknown>;

  if (typeof runState?.result?.text === 'string' && runState.result.text.trim()) {
    return runState.result.text.trim();
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

function resolvePrimaryMedia(nodeData: LinghuiNodeData, runState?: LinghuiNodeRunState): LinghuiMediaItem | undefined {
  if (runState?.result?.primary?.source || runState?.result?.primary?.posterSource) {
    return runState.result.primary;
  }

  const properties = nodeData.properties as Record<string, unknown>;
  const source = typeof properties.source === 'string' ? properties.source.trim() : '';
  const posterSource = typeof properties.posterSource === 'string' ? properties.posterSource.trim() : '';

  if (!source && !posterSource) {
    return undefined;
  }

  const kind = nodeData.linghuiType === 'linghui/video'
    ? 'video'
    : nodeData.linghuiType === 'linghui/audio'
      ? 'audio'
      : 'image';

  return {
    kind,
    source: source || undefined,
    posterSource: posterSource || undefined,
    label: nodeData.label,
  };
}

function dedupeMediaItems(items: LinghuiMediaItem[]): LinghuiMediaItem[] {
  const seen = new Set<string>();
  const result: LinghuiMediaItem[] = [];

  for (const item of items) {
    const key = `${item.kind}:${item.source ?? ''}:${item.posterSource ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

async function exportMediaFile(params: {
  nodeDir: string;
  nodeDirName: string;
  baseName: string;
  media: LinghuiMediaItem;
  label?: string;
  source?: string;
}): Promise<ExportedFileRecord | null> {
  const source = params.source ?? params.media.source;
  if (!source) {
    return null;
  }

  const extension = inferExtension(source, params.media.mimeType, getDefaultExtension(params.media.kind));
  const fileName = `${params.baseName}.${extension}`;
  const targetPath = joinPath(params.nodeDir, fileName);
  await writeBinarySource(source, targetPath);

  return {
    path: joinPath(params.nodeDirName, fileName),
    kind: params.media.kind,
    label: params.label ?? params.media.label,
    source,
  };
}

async function exportTextFile(params: {
  nodeDir: string;
  nodeDirName: string;
  fileName: string;
  content: string;
}): Promise<ExportedFileRecord | null> {
  if (!params.content.trim()) {
    return null;
  }

  const targetPath = joinPath(params.nodeDir, params.fileName);
  await electronService.fs.writeFile(targetPath, params.content);

  return {
    path: joinPath(params.nodeDirName, params.fileName),
    kind: 'text',
  };
}

async function exportJsonFile(params: {
  nodeDir: string;
  nodeDirName: string;
  fileName: string;
  content: unknown;
}): Promise<ExportedFileRecord> {
  const targetPath = joinPath(params.nodeDir, params.fileName);
  await electronService.fs.writeFile(targetPath, JSON.stringify(params.content, null, 2));

  return {
    path: joinPath(params.nodeDirName, params.fileName),
    kind: 'json',
  };
}

async function exportStoryboardFrames(params: {
  nodeDir: string;
  nodeDirName: string;
  shots: LinghuiStoryboardFrame[];
}): Promise<ExportedFileRecord[]> {
  const files: ExportedFileRecord[] = [];
  const shotsDir = joinPath(params.nodeDir, 'shots');
  await electronService.fs.mkdir(shotsDir);

  for (const [index, shot] of params.shots.entries()) {
    if (!shot.image?.source) {
      continue;
    }

    const shotLabel = sanitizeSegment(shot.title || `shot-${index + 1}`, `shot-${index + 1}`);
    const file = await exportMediaFile({
      nodeDir: shotsDir,
      nodeDirName: joinPath(params.nodeDirName, 'shots'),
      baseName: `${pad(index + 1)}-${shotLabel}`,
      media: shot.image,
      label: shot.title,
    });
    if (file) {
      files.push(file);
    }
  }

  return files;
}

async function exportNodeTarget(
  target: LinghuiResultExportTarget,
  index: number,
  bundleDir: string,
): Promise<ExportedNodeRecord> {
  const label = String(target.node.data.label || `节点 ${index + 1}`);
  const nodeDirName = `${pad(index + 1)}-${resolveNodeLabel(target.node, index)}`;
  const nodeDir = joinPath(bundleDir, nodeDirName);
  const files: ExportedFileRecord[] = [];
  const nodeData = target.node.data;
  const runResult = target.runState?.result;
  const textValue = resolveNodeTextValue(nodeData, target.runState);
  const primaryMedia = resolvePrimaryMedia(nodeData, target.runState);

  const ensureNodeDir = async (): Promise<void> => {
    await electronService.fs.mkdir(nodeDir);
  };

  const pushTextFile = async (fileName: string, content: string): Promise<void> => {
    if (!content.trim()) {
      return;
    }
    await ensureNodeDir();
    const file = await exportTextFile({
      nodeDir,
      nodeDirName,
      fileName,
      content,
    });
    if (file) {
      files.push(file);
    }
  };

  const pushJsonFile = async (fileName: string, content: unknown): Promise<void> => {
    await ensureNodeDir();
    files.push(await exportJsonFile({
      nodeDir,
      nodeDirName,
      fileName,
      content,
    }));
  };

  const pushMediaFile = async (
    baseName: string,
    media: LinghuiMediaItem,
    options?: { label?: string; source?: string },
  ): Promise<void> => {
    await ensureNodeDir();
    const file = await exportMediaFile({
      nodeDir,
      nodeDirName,
      baseName,
      media,
      label: options?.label,
      source: options?.source,
    });
    if (file) {
      files.push(file);
    }
  };

  if (runResult?.kind === 'grid' || runResult?.kind === 'images') {
    const mediaItems = dedupeMediaItems([
      ...(runResult.items ?? []),
      ...(runResult.primary ? [runResult.primary] : []),
    ]);

    for (const [itemIndex, item] of mediaItems.entries()) {
      await pushMediaFile(
        `${pad(itemIndex + 1)}-${sanitizeSegment(item.label || `image-${itemIndex + 1}`, `image-${itemIndex + 1}`)}`,
        item,
        { label: item.label },
      );
    }
  } else if (runResult?.kind === 'storyboard') {
    await pushTextFile('script.txt', runResult.text ?? textValue);

    if (runResult.shots?.length) {
      await pushJsonFile('shots.json', runResult.shots);
      await ensureNodeDir();
      files.push(...await exportStoryboardFrames({
        nodeDir,
        nodeDirName,
        shots: runResult.shots,
      }));
    }
  } else if (runResult?.kind === 'text') {
    await pushTextFile('content.txt', runResult.text ?? textValue);
  } else if (runResult?.kind === 'video' && runResult.primary) {
    await pushMediaFile('video', runResult.primary);
    if (runResult.primary.posterSource) {
      await pushMediaFile('poster', { ...runResult.primary, kind: 'image' }, { source: runResult.primary.posterSource });
    }
    if (textValue) {
      await pushTextFile('notes.txt', textValue);
    }
  } else if (runResult?.kind === 'audio' && runResult.primary) {
    await pushMediaFile('audio', runResult.primary);
    if (textValue) {
      await pushTextFile('transcript.txt', textValue);
    }
  } else if (runResult?.primary) {
    await pushMediaFile('result', runResult.primary);
    if (runResult.primary.posterSource) {
      await pushMediaFile('poster', { ...runResult.primary, kind: 'image' }, { source: runResult.primary.posterSource });
    }
    if (textValue && runResult.kind !== 'image') {
      await pushTextFile('notes.txt', textValue);
    }
  } else {
    switch (nodeData.linghuiType) {
      case 'linghui/text':
        await pushTextFile('content.txt', textValue);
        break;
      case 'linghui/script':
        await pushTextFile('script.txt', textValue);
        break;
      case 'linghui/image':
        if (primaryMedia) {
          await pushMediaFile('result', { ...primaryMedia, kind: 'image' });
        }
        break;
      case 'linghui/video':
        if (primaryMedia) {
          await pushMediaFile('video', { ...primaryMedia, kind: 'video' });
          if (primaryMedia.posterSource) {
            await pushMediaFile('poster', { ...primaryMedia, kind: 'image' }, { source: primaryMedia.posterSource });
          }
        }
        break;
      case 'linghui/audio':
        if (primaryMedia) {
          await pushMediaFile('audio', { ...primaryMedia, kind: 'audio' });
        }
        if (textValue) {
          await pushTextFile('transcript.txt', textValue);
        }
        break;
      default:
        break;
    }
  }

  if (!files.length) {
    return {
      nodeId: target.node.id,
      label,
      nodeType: nodeData.linghuiType,
      runStatus: target.runState?.status,
      resultKind: runResult?.kind,
      exported: false,
      reason: '当前节点还没有可导出的结果',
      files,
    };
  }

  return {
    nodeId: target.node.id,
    label,
    nodeType: nodeData.linghuiType,
    runStatus: target.runState?.status,
    resultKind: runResult?.kind,
    exported: true,
    files,
  };
}

export async function exportLinghuiNodeResults(params: {
  workspaceName: string;
  targets: LinghuiResultExportTarget[];
}): Promise<LinghuiResultExportSummary | null> {
  if (!electronService.isElectron()) {
    throw new Error('灵绘结果导出仅支持 Electron 环境');
  }

  const exportDirResult = await electronService.dialog.openDirectory();
  if (exportDirResult.canceled || !exportDirResult.filePaths.length) {
    return null;
  }

  const timestamp = Date.now();
  const bundleDir = joinPath(
    exportDirResult.filePaths[0],
    `${sanitizeSegment(params.workspaceName, 'linghui')}-results-${formatExportTimestamp(timestamp)}`,
  );

  await electronService.fs.mkdir(bundleDir);

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

  await electronService.fs.writeFile(joinPath(bundleDir, 'manifest.json'), JSON.stringify({
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
