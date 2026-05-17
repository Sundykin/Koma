import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';

export function getReferenceKindLabel(kind: LinghuiPromptReferenceItem['kind']): string {
  switch (kind) {
    case 'image':
      return '图片';
    case 'video':
      return '视频';
    case 'audio':
      return '音频';
    case 'text':
      return '文本';
    default:
      return '参考';
  }
}

export function getReferenceWidgetColor(kind: LinghuiPromptReferenceItem['kind']): { background: string; color: string } {
  switch (kind) {
    case 'image':
      return { background: 'color-mix(in srgb, var(--token-status-success) 18%, var(--token-bg-card))', color: 'var(--token-status-success)' };
    case 'video':
      return { background: 'color-mix(in srgb, var(--token-status-info) 18%, var(--token-bg-card))', color: 'var(--token-status-info)' };
    case 'audio':
      return { background: 'color-mix(in srgb, var(--token-status-error) 12%, var(--token-bg-card))', color: 'var(--token-status-error)' };
    case 'text':
      return { background: 'color-mix(in srgb, var(--token-status-warning) 18%, var(--token-bg-card))', color: 'var(--token-status-warning)' };
    default:
      return { background: 'var(--token-text-secondary)', color: 'var(--token-text-secondary)' };
  }
}

export function isVisualReference(item: LinghuiPromptReferenceItem): boolean {
  return (item.kind === 'image' || item.kind === 'video') && Boolean(item.previewSource || item.source);
}

export function toPreviewSource(source?: string): string | undefined {
  return toFileSystemDisplayUrl(source);
}

let activeReferencePreview: {
  anchor: HTMLElement;
  tooltip: HTMLElement;
  watchdogId: number | null;
} | null = null;

function positionReferencePreviewTooltip(tooltip: HTMLElement, event: MouseEvent) {
  const rect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const offset = 16;

  let left = event.clientX + offset;
  let top = event.clientY + offset;

  if (left + rect.width > viewportWidth - 12) {
    left = event.clientX - rect.width - offset;
  }
  if (top + rect.height > viewportHeight - 12) {
    top = event.clientY - rect.height - offset;
  }

  tooltip.style.left = `${Math.max(12, left)}px`;
  tooltip.style.top = `${Math.max(12, top)}px`;
}

export function hideReferencePreviewTooltip(anchor?: HTMLElement) {
  if (!activeReferencePreview) return;
  if (anchor && activeReferencePreview.anchor !== anchor && !anchor.contains(activeReferencePreview.anchor)) {
    return;
  }
  activeReferencePreview.tooltip.remove();
  if (activeReferencePreview.watchdogId !== null) {
    cancelAnimationFrame(activeReferencePreview.watchdogId);
  }
  activeReferencePreview = null;
}

function watchReferencePreviewAnchor() {
  if (!activeReferencePreview) return;
  const { anchor } = activeReferencePreview;
  if (!anchor.isConnected || !anchor.matches(':hover')) {
    hideReferencePreviewTooltip();
    return;
  }
  activeReferencePreview.watchdogId = requestAnimationFrame(watchReferencePreviewAnchor);
}

export function moveReferencePreviewTooltip(anchor: HTMLElement, event: MouseEvent) {
  if (activeReferencePreview && activeReferencePreview.anchor === anchor) {
    positionReferencePreviewTooltip(activeReferencePreview.tooltip, event);
  }
}

export function showReferencePreviewTooltip(anchor: HTMLElement, item: LinghuiPromptReferenceItem, event: MouseEvent) {
  hideReferencePreviewTooltip();

  const previewSource = toPreviewSource(item.previewSource);
  if (!previewSource) return;

  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    z-index: 100001;
    width: 220px;
    padding: 10px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--token-bg-app) 96%, transparent);
    border: 1px solid color-mix(in srgb, var(--token-accent-base) 35%, transparent);
    box-shadow: 0 20px 45px color-mix(in srgb, var(--token-bg-app) 42%, transparent);
    backdrop-filter: blur(14px);
    pointer-events: none;
    color: var(--token-text-secondary);
  `;

  const image = document.createElement('img');
  image.src = previewSource;
  image.alt = item.name;
  image.style.cssText = `
    display: block;
    width: 100%;
    height: 136px;
    object-fit: cover;
    border-radius: 10px;
    background: color-mix(in srgb, var(--token-bg-card) 90%, transparent);
  `;
  tooltip.appendChild(image);

  const title = document.createElement('div');
  title.textContent = item.name || `${getReferenceKindLabel(item.kind)}参考`;
  title.style.cssText = 'margin-top: 8px; font-size: 13px; font-weight: 700; color: var(--token-text-primary);';
  tooltip.appendChild(title);

  const description = document.createElement('div');
  description.textContent = item.description || `${getReferenceKindLabel(item.kind)}参考`;
  description.style.cssText = 'margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--token-text-tertiary);';
  tooltip.appendChild(description);

  document.body.appendChild(tooltip);
  positionReferencePreviewTooltip(tooltip, event);
  activeReferencePreview = {
    anchor,
    tooltip,
    watchdogId: requestAnimationFrame(watchReferencePreviewAnchor),
  };
}
