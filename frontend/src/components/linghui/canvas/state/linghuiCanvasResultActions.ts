import type {
  LinghuiMediaItem,
  LinghuiNodeResult,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import {
  getLinghuiResultDescriptionText,
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
  getLinghuiResultShots,
  getLinghuiResultText,
} from '../../../../types/linghui';

export type LinghuiCanvasResultCopyKind = 'text' | 'media' | 'taskId';

export interface LinghuiCanvasResultCopyState {
  textLabel: string;
  mediaLabel: string;
  taskIdLabel: string;
  canCopyText: boolean;
  canCopyMedia: boolean;
  canCopyTaskId: boolean;
}

export interface LinghuiCanvasResultCopyPayload {
  kind: LinghuiCanvasResultCopyKind;
  value: string;
  successMessage: string;
}

const EMPTY_COPY_STATE: LinghuiCanvasResultCopyState = {
  textLabel: '复制结果文本',
  mediaLabel: '复制媒体地址',
  taskIdLabel: '复制 TaskId',
  canCopyText: false,
  canCopyMedia: false,
  canCopyTaskId: false,
};

const TASK_ID_KEYS = [
  'taskId',
  'providerTaskId',
  'remoteTaskId',
  'generationTaskId',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueTexts(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function resolveMediaCopySource(media: LinghuiMediaItem): string {
  const metadata = isRecord(media.metadata) ? media.metadata : undefined;
  const persist = isRecord(metadata?.persist) ? metadata.persist : undefined;
  return normalizeText(persist?.remoteUrl)
    || normalizeText(media.source)
    || normalizeText(media.posterSource)
    || normalizeText(persist?.localPath);
}

function collectResultMedia(result?: LinghuiNodeResult): LinghuiMediaItem[] {
  const media: LinghuiMediaItem[] = [];
  const primary = getLinghuiResultPrimaryMedia(result);
  if (primary) {
    media.push(primary);
  }
  media.push(...getLinghuiResultItems(result));
  const shotImages = getLinghuiResultShots(result)
    .map(shot => shot.image)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  media.push(...shotImages);
  return media;
}

function resolveMediaLabel(media: LinghuiMediaItem[], copySourceCount: number): string {
  const uniqueKinds = uniqueTexts(media.map(item => item.kind));
  if (uniqueKinds.length !== 1) {
    return copySourceCount > 1 ? `复制 ${copySourceCount} 个媒体地址` : '复制媒体地址';
  }

  const labelByKind: Record<LinghuiMediaItem['kind'], string> = {
    image: copySourceCount > 1 ? `复制 ${copySourceCount} 个图片地址` : '复制图片地址',
    video: copySourceCount > 1 ? `复制 ${copySourceCount} 个视频地址` : '复制视频地址',
    audio: copySourceCount > 1 ? `复制 ${copySourceCount} 个音频地址` : '复制音频地址',
  };
  return labelByKind[uniqueKinds[0] as LinghuiMediaItem['kind']] ?? '复制媒体地址';
}

function findTaskIdInRecord(record: Record<string, unknown>, depth = 0): string {
  for (const key of TASK_ID_KEYS) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }

  if (depth >= 2) {
    return '';
  }

  for (const value of Object.values(record)) {
    if (!isRecord(value)) continue;
    const nested = findTaskIdInRecord(value, depth + 1);
    if (nested) return nested;
  }

  return '';
}

function resolveResultTaskId(result?: LinghuiNodeResult): string {
  const records: Record<string, unknown>[] = [];
  if (isRecord(result?.metadata)) {
    records.push(result.metadata);
  }
  for (const media of collectResultMedia(result)) {
    if (isRecord(media.metadata)) {
      records.push(media.metadata);
    }
  }

  for (const record of records) {
    const taskId = findTaskIdInRecord(record);
    if (taskId) return taskId;
  }

  return '';
}

function resolveResultCopyText(result?: LinghuiNodeResult): string {
  const primaryText = normalizeText(getLinghuiResultText(result));
  if (primaryText) return primaryText;

  const descriptionText = normalizeText(getLinghuiResultDescriptionText(result));
  if (descriptionText) return descriptionText;

  const shotLines = getLinghuiResultShots(result).map((shot, index) => {
    const title = normalizeText(shot.title) || `镜头 ${index + 1}`;
    const description = normalizeText(shot.description);
    return description ? `${title}: ${description}` : title;
  });

  return uniqueTexts(shotLines).join('\n');
}

function resolveResultMediaText(result?: LinghuiNodeResult): string {
  return uniqueTexts(collectResultMedia(result).map(resolveMediaCopySource)).join('\n');
}

export function resolveLinghuiCanvasResultCopyState(runState?: LinghuiNodeRunState): LinghuiCanvasResultCopyState {
  const result = runState?.result;
  if (!result) {
    return EMPTY_COPY_STATE;
  }

  const media = collectResultMedia(result).filter(item => resolveMediaCopySource(item));
  const mediaCopySourceCount = uniqueTexts(media.map(resolveMediaCopySource)).length;

  return {
    textLabel: '复制结果文本',
    mediaLabel: resolveMediaLabel(media, mediaCopySourceCount),
    taskIdLabel: '复制 TaskId',
    canCopyText: Boolean(resolveResultCopyText(result)),
    canCopyMedia: mediaCopySourceCount > 0,
    canCopyTaskId: Boolean(resolveResultTaskId(result)),
  };
}

export function resolveLinghuiCanvasResultCopyPayload(
  runState: LinghuiNodeRunState | undefined,
  kind: LinghuiCanvasResultCopyKind,
): LinghuiCanvasResultCopyPayload | null {
  const result = runState?.result;
  if (!result) {
    return null;
  }

  if (kind === 'text') {
    const value = resolveResultCopyText(result);
    return value ? {
      kind,
      value,
      successMessage: '已复制结果文本',
    } : null;
  }

  if (kind === 'media') {
    const value = resolveResultMediaText(result);
    return value ? {
      kind,
      value,
      successMessage: '已复制媒体地址',
    } : null;
  }

  const value = resolveResultTaskId(result);
  return value ? {
    kind,
    value,
    successMessage: '已复制 TaskId',
  } : null;
}
