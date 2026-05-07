import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { EditorState, Extension, Compartment, Prec, EditorSelection, RangeSetBuilder } from '@codemirror/state';
import {
  autocompletion,
  Completion,
  CompletionContext,
  CompletionInfo,
  CompletionResult,
  completionKeymap,
} from '@codemirror/autocomplete';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  highlightActiveLine,
  keymap,
  tooltips,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import {
  createLinghuiPromptReferenceString,
  parseLinghuiPromptReferences,
  type LinghuiPromptReferenceItem,
} from '../state/linghuiPromptReferences';
import { useTheme } from '../../../../theme/runtime';

interface LinghuiPromptEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  references?: LinghuiPromptReferenceItem[];
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  darkTheme?: boolean;
  surfaceStyle?: 'default' | 'fusion';
  className?: string;
}

interface LinghuiReferenceCompletion extends Completion {
  linghuiItem: LinghuiPromptReferenceItem;
}

function getReferenceKindLabel(kind: LinghuiPromptReferenceItem['kind']): string {
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

function getReferenceWidgetColor(kind: LinghuiPromptReferenceItem['kind']): { background: string; color: string } {
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

function isVisualReference(item: LinghuiPromptReferenceItem): boolean {
  return (item.kind === 'image' || item.kind === 'video') && Boolean(item.previewSource || item.source);
}

function toPreviewSource(source?: string): string | undefined {
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

function hideReferencePreviewTooltip(anchor?: HTMLElement) {
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

function showReferencePreviewTooltip(anchor: HTMLElement, item: LinghuiPromptReferenceItem, event: MouseEvent) {
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

function getReferenceCompletionItem(completion: Completion): LinghuiPromptReferenceItem | null {
  return (completion as LinghuiReferenceCompletion).linghuiItem ?? null;
}

function createCompletionInfoDom(item: LinghuiPromptReferenceItem): CompletionInfo {
  const wrap = document.createElement('div');
  wrap.className = 'linghuiCompletionInfoCard';

  const previewSource = toPreviewSource(item.previewSource);
  if (previewSource && (item.kind === 'image' || item.kind === 'video')) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'linghuiCompletionInfoImageWrap';

    const image = document.createElement('img');
    image.src = previewSource;
    image.alt = item.name;
    image.className = 'linghuiCompletionInfoImage';
    imageWrap.appendChild(image);

    if (item.kind === 'video') {
      const badge = document.createElement('span');
      badge.className = 'linghuiCompletionInfoVideoBadge';
      badge.textContent = 'VIDEO';
      imageWrap.appendChild(badge);
    }

    wrap.appendChild(imageWrap);
  }

  const title = document.createElement('div');
  title.className = 'linghuiCompletionInfoTitle';
  title.textContent = item.name || `${getReferenceKindLabel(item.kind)}参考`;
  wrap.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'linghuiCompletionInfoMeta';
  meta.textContent = getReferenceKindLabel(item.kind);
  wrap.appendChild(meta);

  if (item.description) {
    const desc = document.createElement('div');
    desc.className = 'linghuiCompletionInfoDescription';
    desc.textContent = item.description;
    wrap.appendChild(desc);
  }

  return wrap;
}

function renderCompletionLeading(completion: Completion): Node | null {
  const item = getReferenceCompletionItem(completion);
  if (!item) return null;

  const visual = isVisualReference(item);
  const wrap = document.createElement('span');
  wrap.className = `linghuiCompletionLeading ${visual ? 'isVisual' : 'isText'}`;

  if (visual) {
    const previewSource = toPreviewSource(item.previewSource);
    const thumb = document.createElement('span');
    thumb.className = 'linghuiCompletionThumb';

    if (previewSource) {
      const img = document.createElement('img');
      img.src = previewSource;
      img.alt = item.name;
      img.className = 'linghuiCompletionThumbImage';
      thumb.appendChild(img);
    } else {
      thumb.textContent = getReferenceKindLabel(item.kind).slice(0, 1);
      thumb.classList.add('isFallback');
    }

    if (item.kind === 'video') {
      const badge = document.createElement('span');
      badge.className = 'linghuiCompletionThumbBadge';
      badge.textContent = '▶';
      thumb.appendChild(badge);
    }

    wrap.appendChild(thumb);
    return wrap;
  }

  const badge = document.createElement('span');
  badge.className = 'linghuiCompletionKindBadge';
  badge.textContent = getReferenceKindLabel(item.kind);
  wrap.appendChild(badge);
  return wrap;
}

class LinghuiReferenceWidget extends WidgetType {
  constructor(readonly item: LinghuiPromptReferenceItem) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = `linghui-reference-widget linghui-reference-${this.item.kind}`;
    span.style.cssText = 'display: inline-flex; align-items: center; margin: 0 2px; vertical-align: middle;';

    if (isVisualReference(this.item)) {
      const previewSource = toPreviewSource(this.item.previewSource);
      const chip = document.createElement('span');
      chip.title = this.item.name || `${getReferenceKindLabel(this.item.kind)}参考`;
      chip.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        max-width: 240px;
        padding: 2px 8px;
        min-height: 28px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--token-bg-card) 82%, transparent);
        color: color-mix(in srgb, var(--token-accent-base) 24%, var(--token-text-primary));
        border: 1px solid color-mix(in srgb, var(--token-accent-base) 24%, transparent);
        box-shadow: inset 0 1px 0 color-mix(in srgb, var(--token-overlay-on-bg) 50%, transparent);
        vertical-align: middle;
      `;

      const thumb = document.createElement('span');
      thumb.style.cssText = `
        position: relative;
        width: 22px;
        height: 22px;
        border-radius: 7px;
        overflow: hidden;
        background: color-mix(in srgb, var(--token-bg-hover) 92%, transparent);
        flex: 0 0 22px;
      `;

      if (previewSource) {
        const img = document.createElement('img');
        img.src = previewSource;
        img.alt = this.item.name;
        img.style.cssText = 'display: block; width: 100%; height: 100%; object-fit: cover;';
        thumb.appendChild(img);
      }

      if (this.item.kind === 'video') {
        const badge = document.createElement('span');
        badge.textContent = '▶';
        badge.style.cssText = `
          position: absolute;
          right: 2px;
          bottom: 1px;
          font-size: 9px;
          line-height: 1;
          color: var(--token-text-primary);
          text-shadow: 0 1px 3px color-mix(in srgb, var(--token-bg-app) 50%, transparent);
        `;
        thumb.appendChild(badge);
      }

      chip.appendChild(thumb);

      const name = document.createElement('span');
      name.textContent = this.item.name || `${getReferenceKindLabel(this.item.kind)}参考`;
      name.style.cssText = `
        display: inline-flex;
        align-items: center;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.2;
        color: color-mix(in srgb, var(--token-accent-base) 12%, var(--token-text-primary));
      `;
      chip.appendChild(name);

      const moveTooltip = (event: MouseEvent) => {
        if (activeReferencePreview && activeReferencePreview.anchor === chip) {
          positionReferencePreviewTooltip(activeReferencePreview.tooltip, event);
        }
      };

      chip.addEventListener('mouseenter', event => showReferencePreviewTooltip(chip, this.item, event));
      chip.addEventListener('mousemove', moveTooltip);
      chip.addEventListener('mouseleave', () => hideReferencePreviewTooltip(chip));
      chip.addEventListener('pointerdown', () => hideReferencePreviewTooltip(chip));

      span.appendChild(chip);
      return span;
    }

    const colors = getReferenceWidgetColor(this.item.kind);
    span.textContent = `${getReferenceKindLabel(this.item.kind)} ${this.item.name}`;
    span.title = this.item.description || `${getReferenceKindLabel(this.item.kind)}参考`;
    span.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 8px;
      min-height: 28px;
      margin: 0 2px;
      border-radius: 999px;
      font-size: 0.9em;
      font-weight: 600;
      line-height: 1.2;
      background: ${colors.background};
      color: ${colors.color};
      border: 1px solid color-mix(in srgb, var(--token-border-base) 8%, transparent);
    `;
    return span;
  }

  eq(other: LinghuiReferenceWidget): boolean {
    return (
      other.item.id === this.item.id &&
      other.item.name === this.item.name &&
      other.item.kind === this.item.kind &&
      other.item.description === this.item.description &&
      other.item.previewSource === this.item.previewSource
    );
  }

  destroy(dom: HTMLElement): void {
    hideReferencePreviewTooltip(dom);
  }
}

function buildReferenceDecorations(
  view: EditorView,
  references: LinghuiPromptReferenceItem[],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = view.state.doc.toString();
  const referenceMap = new Map(references.map(item => [item.id, item]));

  for (const parsed of parseLinghuiPromptReferences(text)) {
    const item = referenceMap.get(parsed.id);
    if (!item) continue;

    builder.add(parsed.from, parsed.to, Decoration.replace({
      widget: new LinghuiReferenceWidget(item),
      inclusive: false,
    }));
  }

  return builder.finish();
}

function createReferencePlugin(references: LinghuiPromptReferenceItem[]) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildReferenceDecorations(view, references);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildReferenceDecorations(update.view, references);
      }
    }
  }, {
    decorations: plugin => plugin.decorations,
  });
}

function findReferenceAt(text: string, pos: number): { from: number; to: number } | null {
  for (const ref of parseLinghuiPromptReferences(text)) {
    if (pos >= ref.from && pos <= ref.to) {
      return { from: ref.from, to: ref.to };
    }
  }
  return null;
}

function createAtomicReferenceDelete() {
  const backspace = (view: EditorView): boolean => {
    if (!view.state.selection.main.empty) return false;

    const pos = view.state.selection.main.head;
    const text = view.state.doc.toString();
    let target = findReferenceAt(text, pos - 1);

    if (!target && pos > 0) {
      target = findReferenceAt(text, pos);
      if (target && target.to !== pos) {
        target = null;
      }
    }

    if (!target) return false;

    view.dispatch({
      changes: { from: target.from, to: target.to },
      selection: EditorSelection.cursor(target.from),
    });
    return true;
  };

  const del = (view: EditorView): boolean => {
    if (!view.state.selection.main.empty) return false;

    const target = findReferenceAt(view.state.doc.toString(), view.state.selection.main.head);
    if (!target) return false;

    view.dispatch({
      changes: { from: target.from, to: target.to },
      selection: EditorSelection.cursor(target.from),
    });
    return true;
  };

  return keymap.of([
    { key: 'Backspace', run: backspace },
    { key: 'Delete', run: del },
  ]);
}

function createReferenceAutocomplete(references: LinghuiPromptReferenceItem[]) {
  return autocompletion({
    override: [((context: CompletionContext): CompletionResult | null => {
      const word = context.matchBefore(/@\w*/);
      if (!word) return null;

      const query = word.text.slice(1).toLowerCase();
      const options: Completion[] = references
        .filter(item => {
          if (!query) return true;
          return (
            item.name.toLowerCase().includes(query) ||
            getReferenceKindLabel(item.kind).includes(query) ||
            item.description?.toLowerCase().includes(query)
          );
        })
        .map(item => ({
          label: item.name,
          type: item.kind === 'text' ? 'text' : 'variable',
          detail: getReferenceKindLabel(item.kind),
          info: () => createCompletionInfoDom(item),
          apply: (view, _completion, from, to) => {
            const mention = createLinghuiPromptReferenceString(item.id);
            view.dispatch({
              changes: { from, to, insert: `${mention} ` },
              selection: { anchor: from + mention.length + 1 },
            });
          },
          boost: item.kind === 'image' ? 2 : item.kind === 'video' ? 1 : 0,
          linghuiItem: item,
        } as LinghuiReferenceCompletion));

      if (!options.length) {
        return null;
      }

      return {
        from: word.from,
        to: word.to,
        options,
        filter: false,
      };
    })],
    activateOnTyping: true,
    closeOnBlur: false,
    maxRenderedOptions: 24,
    icons: false,
    optionClass: completion => {
      const item = getReferenceCompletionItem(completion);
      return item ? `linghuiCompletionOption ${isVisualReference(item) ? 'hasVisual' : 'isText'}` : 'linghuiCompletionOption';
    },
    addToOptions: [{
      position: 30,
      render: completion => renderCompletionLeading(completion),
    }],
  });
}

const autocompleteTheme = EditorView.theme({
  '.cm-tooltip': {
    zIndex: '99999 !important',
  },
  '.cm-tooltip-autocomplete': {
    minWidth: '280px',
    maxWidth: '460px',
    zIndex: '99999 !important',
    background: 'var(--token-bg-surface) !important',
    border: '1px solid color-mix(in srgb, var(--token-accent-base) 70%, transparent) !important',
    borderRadius: '10px',
    boxShadow: '0 18px 40px color-mix(in srgb, var(--token-bg-app) 42%, transparent)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete ul': {
    maxHeight: '320px',
    padding: '4px 0',
    margin: '0',
    listStyle: 'none',
  },
  '.cm-tooltip-autocomplete li': {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minHeight: '50px',
    padding: '8px 12px !important',
    color: 'var(--token-text-secondary) !important',
  },
  '.cm-tooltip-autocomplete li[aria-selected]': {
    backgroundColor: 'var(--token-accent-base) !important',
    color: 'var(--token-text-primary) !important',
  },
  '.cm-completionLabel': {
    flex: '1',
    minWidth: '0',
    display: 'flex',
    alignItems: 'center',
    fontWeight: '500',
    minHeight: '34px',
    lineHeight: '1.35',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '.cm-completionDetail': {
    color: 'var(--token-text-muted)',
    marginLeft: 'auto',
    flex: '0 0 auto',
    alignSelf: 'center',
    fontSize: '11px',
    borderRadius: '999px',
    padding: '2px 8px',
    background: 'color-mix(in srgb, var(--token-overlay-on-bg) 75%, transparent)',
  },
  '.cm-tooltip-autocomplete li[aria-selected] .cm-completionDetail': {
    color: 'var(--token-text-primary)',
    background: 'color-mix(in srgb, var(--token-overlay-on-bg) 100%, transparent)',
  },
  '.cm-tooltip.cm-completionInfo': {
    zIndex: '100000 !important',
    padding: '0',
    border: '1px solid color-mix(in srgb, var(--token-accent-base) 55%, transparent)',
    borderRadius: '14px',
    background: 'color-mix(in srgb, var(--token-bg-app) 98%, transparent)',
    boxShadow: '0 24px 48px color-mix(in srgb, var(--token-bg-app) 42%, transparent)',
    overflow: 'hidden',
  },
  '.linghuiCompletionLeading': {
    display: 'inline-flex',
    alignItems: 'center',
    flex: '0 0 auto',
  },
  '.linghuiCompletionThumb': {
    position: 'relative',
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    overflow: 'hidden',
    background: 'color-mix(in srgb, var(--token-bg-hover) 88%, transparent)',
    border: '1px solid color-mix(in srgb, var(--token-text-tertiary) 22%, transparent)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--token-text-secondary)',
    fontSize: '11px',
    fontWeight: '700',
  },
  '.linghuiCompletionThumbImage': {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  '.linghuiCompletionThumbBadge': {
    position: 'absolute',
    right: '3px',
    bottom: '2px',
    fontSize: '10px',
    lineHeight: '1',
    color: 'var(--token-text-primary)',
    textShadow: '0 1px 3px color-mix(in srgb, var(--token-bg-app) 60%, transparent)',
  },
  '.linghuiCompletionKindBadge': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '34px',
    height: '34px',
    padding: '0 8px',
    borderRadius: '10px',
    background: 'color-mix(in srgb, var(--token-bg-card) 82%, transparent)',
    border: '1px solid color-mix(in srgb, var(--token-text-tertiary) 22%, transparent)',
    color: 'var(--token-text-secondary)',
    fontSize: '11px',
    fontWeight: '700',
  },
  '.linghuiCompletionInfoCard': {
    width: '240px',
    padding: '10px',
    color: 'var(--token-text-secondary)',
  },
  '.linghuiCompletionInfoImageWrap': {
    position: 'relative',
    width: '100%',
    height: '144px',
    borderRadius: '10px',
    overflow: 'hidden',
    background: 'color-mix(in srgb, var(--token-bg-card) 90%, transparent)',
  },
  '.linghuiCompletionInfoImage': {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  '.linghuiCompletionInfoVideoBadge': {
    position: 'absolute',
    top: '8px',
    right: '8px',
    padding: '2px 6px',
    borderRadius: '999px',
    background: 'color-mix(in srgb, var(--token-bg-card) 80%, transparent)',
    color: 'var(--token-text-primary)',
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.04em',
  },
  '.linghuiCompletionInfoTitle': {
    marginTop: '8px',
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--token-text-primary)',
  },
  '.linghuiCompletionInfoMeta': {
    marginTop: '4px',
    color: 'color-mix(in srgb, var(--token-accent-base) 66%, var(--token-text-primary))',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  '.linghuiCompletionInfoDescription': {
    marginTop: '6px',
    color: 'var(--token-text-tertiary)',
    fontSize: '12px',
    lineHeight: '1.5',
  },
});

export const LinghuiPromptEditor: React.FC<LinghuiPromptEditorProps> = ({
  value,
  onChange,
  placeholder = '输入提示词，使用 @ 引用上游图片、视频封面或文本产物',
  references = [],
  readOnly = false,
  minHeight = '76px',
  maxHeight = '176px',
  darkTheme,
  surfaceStyle = 'default',
  className,
}) => {
  const { theme } = useTheme();
  const isDarkTheme = darkTheme ?? theme.meta.mode === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const extensionCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const isSyncingExternalRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const referenceExtension = useMemo<Extension[]>(() => [
    createReferencePlugin(references),
    Prec.highest(createAtomicReferenceDelete()),
    createReferenceAutocomplete(references),
    autocompleteTheme,
  ], [references]);

  const baseExtensions = useMemo<Extension[]>(() => {
    const isFusionSurface = surfaceStyle === 'fusion';
    const extensions: Extension[] = [
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
      EditorView.lineWrapping,
      EditorView.updateListener.of(update => {
        if (!update.docChanged || !onChangeRef.current || isSyncingExternalRef.current) {
          return;
        }
        onChangeRef.current(update.state.doc.toString());
      }),
      EditorView.theme({
        '&': {
          minHeight,
          height: 'auto',
          overflow: 'visible',
          border: 'none',
          borderRadius: isFusionSurface ? '16px' : '14px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '13px',
          lineHeight: '1.6',
          backgroundColor: isFusionSurface
            ? 'transparent'
            : (isDarkTheme ? 'color-mix(in srgb, var(--token-overlay-on-bg) 38%, transparent)' : 'color-mix(in srgb, var(--token-bg-card) 92%, transparent)'),
          boxShadow: isDarkTheme
            ? 'inset 0 0 0 1px color-mix(in srgb, var(--token-text-tertiary) 10%, transparent)'
            : 'inset 0 0 0 1px color-mix(in srgb, var(--token-text-tertiary) 16%, transparent)',
        },
        '.cm-scroller': {
          overflow: 'auto',
          minHeight,
          maxHeight,
          cursor: 'text',
        },
        '.cm-content': {
          padding: '12px',
          color: isDarkTheme ? 'var(--token-text-secondary)' : 'var(--token-text-primary)',
          caretColor: isDarkTheme ? 'var(--token-border-focus)' : 'var(--token-status-info)',
        },
        '.cm-line': {
          padding: '2px 4px',
        },
        '&.cm-focused': {
          outline: 'none',
          boxShadow: isDarkTheme
            ? 'inset 0 0 0 1px color-mix(in srgb, var(--token-border-focus) 28%, transparent), 0 0 0 3px color-mix(in srgb, var(--token-accent-base) 10%, transparent)'
            : 'inset 0 0 0 1px color-mix(in srgb, var(--token-status-info) 24%, transparent), 0 0 0 3px color-mix(in srgb, var(--token-status-info) 10%, transparent)',
        },
        '.cm-activeLine': {
          backgroundColor: 'transparent',
        },
        '.cm-selectionBackground': {
          backgroundColor: isDarkTheme ? 'color-mix(in srgb, var(--token-accent-base) 20%, transparent) !important' : 'color-mix(in srgb, var(--token-status-info) 18%, transparent) !important',
        },
        '&.cm-focused .cm-selectionBackground': {
          backgroundColor: isDarkTheme ? 'color-mix(in srgb, var(--token-accent-base) 28%, transparent) !important' : 'color-mix(in srgb, var(--token-status-info) 24%, transparent) !important',
        },
        '.cm-cursor': {
          borderLeftColor: isDarkTheme ? 'var(--token-border-focus)' : 'var(--token-status-info)',
        },
      }),
      EditorView.contentAttributes.of({
        'data-placeholder': placeholder,
      }),
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    return extensions;
  }, [isDarkTheme, maxHeight, minHeight, placeholder, readOnly, surfaceStyle]);

  useEffect(() => {
    if (!containerRef.current) return;

    const compartment = extensionCompartmentRef.current;
    const tooltipParent = containerRef.current.ownerDocument.body;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          ...baseExtensions,
          tooltips({ parent: tooltipParent, position: 'fixed' }),
          compartment.of(referenceExtension),
        ],
      }),
      parent: containerRef.current,
    });

    editorRef.current = view;
    return () => {
      view.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = editorRef.current;
    if (!view || view.hasFocus) return;

    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    isSyncingExternalRef.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    });
    isSyncingExternalRef.current = false;
  }, [value]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    view.dispatch({
      effects: extensionCompartmentRef.current.reconfigure(referenceExtension),
    });
  }, [referenceExtension]);

  const handleContainerClick = useCallback((event: React.MouseEvent) => {
    const view = editorRef.current;
    if (!view) return;

    if (event.target === containerRef.current) {
      view.focus();
      view.dispatch({
        selection: { anchor: view.state.doc.length },
      });
    }
  }, []);

  return (
    <div className={className} data-surface-style={surfaceStyle}>
      <div
        ref={containerRef}
        className="linghuiPromptEditorHost"
        onClick={handleContainerClick}
      />
    </div>
  );
};

const placeholderStyleId = 'linghui-prompt-editor-placeholder-style';
if (typeof document !== 'undefined' && !document.getElementById(placeholderStyleId)) {
  const style = document.createElement('style');
  style.id = placeholderStyleId;
  style.textContent = `
    .cm-content[data-placeholder]:empty::before {
      content: attr(data-placeholder);
      color: var(--token-text-muted);
      pointer-events: none;
      position: absolute;
      white-space: pre-wrap;
    }
  `;
  document.head.appendChild(style);
}

export default LinghuiPromptEditor;
