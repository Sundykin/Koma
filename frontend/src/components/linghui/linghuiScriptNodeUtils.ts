import type {
  LinghuiMediaItem,
  LinghuiStoryboardFrame,
} from '../../types/linghui';

export interface LinghuiScriptParseResult {
  shots: LinghuiStoryboardFrame[];
  formattedText: string;
  source: 'json' | 'plain';
}

function toDurationSec(value: unknown, fallback = 3): number {
  const normalized = typeof value === 'string'
    ? Number(value.replace(/秒|s$/gi, '').trim())
    : Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizeMediaItem(value: unknown): LinghuiMediaItem | undefined {
  if (typeof value === 'string' && value.trim()) {
    return {
      kind: 'image',
      source: value.trim(),
    };
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const source = typeof record.source === 'string' ? record.source.trim() : '';
  if (!source) {
    return undefined;
  }

  return {
    kind: 'image',
    source,
    label: typeof record.label === 'string' ? record.label.trim() : undefined,
    mimeType: typeof record.mimeType === 'string' ? record.mimeType.trim() : undefined,
    width: Number.isFinite(Number(record.width)) ? Number(record.width) : undefined,
    height: Number.isFinite(Number(record.height)) ? Number(record.height) : undefined,
  };
}

function stripLeadingIndex(text: string): string {
  return text.replace(/^\s*(?:镜头|shot)?\s*[-#]?\s*\d+[\.\):：、-]?\s*/i, '').trim();
}

function normalizeShotRecord(value: unknown, index: number): LinghuiStoryboardFrame | null {
  if (typeof value === 'string') {
    const description = value.trim();
    if (!description) return null;
    return {
      id: `shot-${index + 1}`,
      title: `镜头 ${index + 1}`,
      description,
      durationSec: 3,
    };
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = String(
    record.title ??
    record.name ??
    record.scene ??
    record.shot ??
    `镜头 ${index + 1}`,
  ).trim() || `镜头 ${index + 1}`;
  const description = String(
    record.description ??
    record.prompt ??
    record.content ??
    record.summary ??
    '',
  ).trim();

  if (!title && !description) {
    return null;
  }

  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `shot-${index + 1}`,
    title,
    description: description || title,
    durationSec: toDurationSec(record.durationSec ?? record.duration ?? record.seconds, 3),
    image: normalizeMediaItem(record.image ?? record.referenceImage ?? record.thumbnail),
  };
}

function normalizeShots(payload: unknown): LinghuiStoryboardFrame[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item, index) => normalizeShotRecord(item, index))
      .filter(Boolean) as LinghuiStoryboardFrame[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.shots)) {
      return record.shots
        .map((item, index) => normalizeShotRecord(item, index))
        .filter(Boolean) as LinghuiStoryboardFrame[];
    }
  }

  return [];
}

function extractJsonCandidate(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  const trimmed = text.trim();
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    return trimmed;
  }

  return null;
}

function parsePlainBlock(block: string, index: number): LinghuiStoryboardFrame | null {
  const normalizedBlock = block.trim();
  if (!normalizedBlock) return null;

  const pipeParts = normalizedBlock.split('|').map(part => part.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    const [rawTitle, rawDescription, rawDuration] = pipeParts;
    return {
      id: `shot-${index + 1}`,
      title: stripLeadingIndex(rawTitle) || `镜头 ${index + 1}`,
      description: rawDescription || stripLeadingIndex(rawTitle) || `镜头 ${index + 1}`,
      durationSec: toDurationSec(rawDuration, 3),
    };
  }

  const lines = normalizedBlock
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return null;
  }

  const durationLineIndex = lines.findIndex(line => /^(?:时长|duration)\s*[:：]/i.test(line));
  const durationSec = durationLineIndex >= 0
    ? toDurationSec(lines[durationLineIndex].split(/[:：]/).slice(1).join(' '), 3)
    : 3;
  const contentLines = durationLineIndex >= 0
    ? lines.filter((_, lineIndex) => lineIndex !== durationLineIndex)
    : lines;
  const firstLine = stripLeadingIndex(contentLines[0] ?? '');
  const remaining = contentLines.slice(1).join(' ').trim();

  if (remaining) {
    return {
      id: `shot-${index + 1}`,
      title: firstLine || `镜头 ${index + 1}`,
      description: remaining,
      durationSec,
    };
  }

  return {
    id: `shot-${index + 1}`,
    title: `镜头 ${index + 1}`,
    description: firstLine || normalizedBlock,
    durationSec,
  };
}

function isLikelyStandaloneShotLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) return false;
  return normalized.includes('|') || /^\s*(?:镜头|shot)?\s*[-#]?\s*\d+[\.\):：、-]/i.test(normalized);
}

function parsePlainTextToShots(text: string): LinghuiStoryboardFrame[] {
  const blocks = text
    .split(/\n\s*\n+/)
    .map(block => block.trim())
    .filter(Boolean);

  if (blocks.length > 1) {
    return blocks
      .map((block, index) => parsePlainBlock(block, index))
      .filter(Boolean) as LinghuiStoryboardFrame[];
  }

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length > 1 && lines.every(isLikelyStandaloneShotLine)) {
    return lines
      .map((line, index) => parsePlainBlock(line, index))
      .filter(Boolean) as LinghuiStoryboardFrame[];
  }

  return parsePlainBlock(text, 0) ? [parsePlainBlock(text, 0)!] : [];
}

export function formatLinghuiScriptShots(shots: LinghuiStoryboardFrame[]): string {
  return shots
    .map((shot, index) => {
      const title = shot.title?.trim() || `镜头 ${index + 1}`;
      const description = shot.description?.trim() || title;
      return `${index + 1}. ${title}\n画面：${description}\n时长：${toDurationSec(shot.durationSec, 3)} 秒`;
    })
    .join('\n\n');
}

export function parseLinghuiScriptContent(rawContent: string): LinghuiScriptParseResult {
  const text = String(rawContent ?? '').trim();
  if (!text) {
    return {
      shots: [],
      formattedText: '',
      source: 'plain',
    };
  }

  const jsonCandidate = extractJsonCandidate(text);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      const shots = normalizeShots(parsed);
      if (shots.length > 0) {
        return {
          shots,
          formattedText: formatLinghuiScriptShots(shots),
          source: 'json',
        };
      }
    } catch {
      // fall through to plain-text parsing
    }
  }

  const shots = parsePlainTextToShots(text);
  return {
    shots,
    formattedText: formatLinghuiScriptShots(shots),
    source: 'plain',
  };
}
