import { nanoid } from 'nanoid';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { DEFAULT_THEME_ID, getThemeById } from '../../../../theme/themes';
import type {
  LinghuiExecutionLogEntry,
  LinghuiMediaItem,
} from '../../../../types/linghui';

export const EXECUTION_PROJECT_ID = 'linghui';

const placeholderThemeTokens = getThemeById(DEFAULT_THEME_ID).tokens;
const PLACEHOLDER_COLORS = {
  accent: placeholderThemeTokens.status.success,
  backgroundStart: placeholderThemeTokens.bg.surface,
  backgroundEnd: placeholderThemeTokens.bg.app,
  title: placeholderThemeTokens.text.primary,
  subtitle: placeholderThemeTokens.text.secondary,
} as const;

export class LinghuiExecutionCancelledError extends Error {
  constructor(message = '执行已取消') {
    super(message);
    this.name = 'LinghuiExecutionCancelledError';
  }
}

export function isLinghuiExecutionCancelledError(error: unknown): error is LinghuiExecutionCancelledError {
  return error instanceof LinghuiExecutionCancelledError;
}

export function throwIfExecutionAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = typeof signal.reason === 'string' && signal.reason.trim()
    ? signal.reason
    : '执行已取消';
  throw new LinghuiExecutionCancelledError(reason);
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfExecutionAborted(signal);

  return new Promise((resolve, reject) => {
    const timerId = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      window.clearTimeout(timerId);
      signal?.removeEventListener('abort', handleAbort);
      reject(new LinghuiExecutionCancelledError(
        typeof signal?.reason === 'string' && signal.reason.trim()
          ? signal.reason
          : '执行已取消',
      ));
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export function toPreviewSource(source?: string): string | undefined {
  return toFileSystemDisplayUrl(source);
}

function escapeSvgText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function createPlaceholderImage(params: {
  title: string;
  subtitle?: string;
  accent?: string;
  background?: string;
}): string {
  const { title, subtitle, accent = PLACEHOLDER_COLORS.accent, background = PLACEHOLDER_COLORS.backgroundStart } = params;
  const lines = [escapeSvgText(title), escapeSvgText(subtitle ?? '')].filter(Boolean);
  const subtitleSvg = lines[1] ? `<text x="40" y="178" font-size="18" fill="${PLACEHOLDER_COLORS.subtitle}" opacity="0.9">${lines[1]}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
    <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${background}" /><stop offset="100%" stop-color="${PLACEHOLDER_COLORS.backgroundEnd}" /></linearGradient></defs>
    <rect width="960" height="640" rx="36" fill="url(#bg)" />
    <circle cx="760" cy="120" r="150" fill="${accent}" opacity="0.18" />
    <rect x="40" y="40" width="880" height="560" rx="28" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="4" />
    <text x="40" y="132" font-size="34" font-weight="700" fill="${PLACEHOLDER_COLORS.title}">${lines[0] ?? ''}</text>
    ${subtitleSvg}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildMediaItem<TKind extends LinghuiMediaItem['kind']>(
  params: Partial<LinghuiMediaItem> & { kind: TKind },
): LinghuiMediaItem & { kind: TKind } {
  return {
    ...params,
    source: toPreviewSource(params.source),
    posterSource: toPreviewSource(params.posterSource),
  } as LinghuiMediaItem & { kind: TKind };
}

export function createLog(level: LinghuiExecutionLogEntry['level'], message: string, nodeId?: string): LinghuiExecutionLogEntry {
  return { id: nanoid(10), level, message, nodeId, createdAt: Date.now() };
}
