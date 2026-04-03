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
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import {
  createLinghuiPromptReferenceString,
  parseLinghuiPromptReferences,
  type LinghuiPromptReferenceItem,
} from '../state/linghuiPromptReferences';

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
  style?: React.CSSProperties;
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
      return { background: '#dcfce7', color: '#166534' };
    case 'video':
      return { background: '#dbeafe', color: '#1d4ed8' };
    case 'audio':
      return { background: '#fce7f3', color: '#be185d' };
    case 'text':
      return { background: '#fef3c7', color: '#b45309' };
    default:
      return { background: '#e4e4e7', color: '#3f3f46' };
  }
}

function isVisualReference(item: LinghuiPromptReferenceItem): boolean {
  return (item.kind === 'image' || item.kind === 'video') && Boolean(item.previewSource || item.source);
}

function toPreviewSource(source?: string): string | undefined {
  return toFileSystemDisplayUrl(source);
}

function removeReferencePreviewTooltip(anchor: HTMLElement) {
  const tooltip = (anchor as HTMLElement & { __linghuiPreviewTooltip?: HTMLElement }).__linghuiPreviewTooltip;
  if (tooltip) {
    tooltip.remove();
    delete (anchor as HTMLElement & { __linghuiPreviewTooltip?: HTMLElement }).__linghuiPreviewTooltip;
  }
}

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

function showReferencePreviewTooltip(anchor: HTMLElement, item: LinghuiPromptReferenceItem, event: MouseEvent) {
  removeReferencePreviewTooltip(anchor);

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
    background: rgba(3, 7, 18, 0.96);
    border: 1px solid rgba(16, 185, 129, 0.35);
    box-shadow: 0 20px 45px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(14px);
    pointer-events: none;
    color: #e5e7eb;
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
    background: rgba(15, 23, 42, 0.9);
  `;
  tooltip.appendChild(image);

  const title = document.createElement('div');
  title.textContent = item.name || `${getReferenceKindLabel(item.kind)}参考`;
  title.style.cssText = 'margin-top: 8px; font-size: 13px; font-weight: 700; color: #f8fafc;';
  tooltip.appendChild(title);

  const description = document.createElement('div');
  description.textContent = item.description || `${getReferenceKindLabel(item.kind)}参考`;
  description.style.cssText = 'margin-top: 4px; font-size: 12px; line-height: 1.5; color: #94a3b8;';
  tooltip.appendChild(description);

  document.body.appendChild(tooltip);
  (anchor as HTMLElement & { __linghuiPreviewTooltip?: HTMLElement }).__linghuiPreviewTooltip = tooltip;
  positionReferencePreviewTooltip(tooltip, event);
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
        background: rgba(15, 23, 42, 0.82);
        color: #d1fae5;
        border: 1px solid rgba(16, 185, 129, 0.24);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        vertical-align: middle;
      `;

      const thumb = document.createElement('span');
      thumb.style.cssText = `
        position: relative;
        width: 22px;
        height: 22px;
        border-radius: 7px;
        overflow: hidden;
        background: rgba(30, 41, 59, 0.92);
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
          color: white;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
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
        color: #ecfdf5;
      `;
      chip.appendChild(name);

      const moveTooltip = (event: MouseEvent) => {
        const tooltip = (chip as HTMLElement & { __linghuiPreviewTooltip?: HTMLElement }).__linghuiPreviewTooltip;
        if (tooltip) {
          positionReferencePreviewTooltip(tooltip, event);
        }
      };

      chip.addEventListener('mouseenter', event => showReferencePreviewTooltip(chip, this.item, event));
      chip.addEventListener('mousemove', moveTooltip);
      chip.addEventListener('mouseleave', () => removeReferencePreviewTooltip(chip));
      chip.addEventListener('pointerdown', () => removeReferencePreviewTooltip(chip));

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
      border: 1px solid rgba(15, 23, 42, 0.08);
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
    removeReferencePreviewTooltip(dom);
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
    background: '#111827 !important',
    border: '1px solid rgba(16, 185, 129, 0.7) !important',
    borderRadius: '10px',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.42)',
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
    color: '#e5e7eb !important',
  },
  '.cm-tooltip-autocomplete li[aria-selected]': {
    backgroundColor: '#10b981 !important',
    color: '#ffffff !important',
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
    color: '#9ca3af',
    marginLeft: 'auto',
    flex: '0 0 auto',
    alignSelf: 'center',
    fontSize: '11px',
    borderRadius: '999px',
    padding: '2px 8px',
    background: 'rgba(255,255,255,0.06)',
  },
  '.cm-tooltip-autocomplete li[aria-selected] .cm-completionDetail': {
    color: 'rgba(255, 255, 255, 0.82)',
    background: 'rgba(255,255,255,0.18)',
  },
  '.cm-tooltip.cm-completionInfo': {
    zIndex: '100000 !important',
    padding: '0',
    border: '1px solid rgba(16, 185, 129, 0.55)',
    borderRadius: '14px',
    background: 'rgba(3, 7, 18, 0.98)',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.42)',
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
    background: 'rgba(30, 41, 59, 0.88)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#cbd5e1',
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
    color: '#ffffff',
    textShadow: '0 1px 3px rgba(0,0,0,0.6)',
  },
  '.linghuiCompletionKindBadge': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '34px',
    height: '34px',
    padding: '0 8px',
    borderRadius: '10px',
    background: 'rgba(15, 23, 42, 0.82)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    color: '#cbd5e1',
    fontSize: '11px',
    fontWeight: '700',
  },
  '.linghuiCompletionInfoCard': {
    width: '240px',
    padding: '10px',
    color: '#e5e7eb',
  },
  '.linghuiCompletionInfoImageWrap': {
    position: 'relative',
    width: '100%',
    height: '144px',
    borderRadius: '10px',
    overflow: 'hidden',
    background: 'rgba(15, 23, 42, 0.9)',
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
    background: 'rgba(15, 23, 42, 0.8)',
    color: '#f8fafc',
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.04em',
  },
  '.linghuiCompletionInfoTitle': {
    marginTop: '8px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  '.linghuiCompletionInfoMeta': {
    marginTop: '4px',
    color: '#6ee7b7',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  '.linghuiCompletionInfoDescription': {
    marginTop: '6px',
    color: '#94a3b8',
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
  minHeight = '120px',
  maxHeight = '200px',
  darkTheme = true,
  surfaceStyle = 'default',
  className,
  style,
}) => {
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
          height: minHeight,
          maxHeight,
          overflow: 'visible',
          border: isFusionSurface
            ? (darkTheme ? '1px solid rgba(148, 163, 184, 0.16)' : '1px solid rgba(148, 163, 184, 0.22)')
            : (darkTheme ? '1px solid #3f3f46' : '1px solid #d4d4d8'),
          borderRadius: isFusionSurface ? '16px' : '10px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '13px',
          lineHeight: '1.6',
          backgroundColor: isFusionSurface
            ? (darkTheme ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.92)')
            : (darkTheme ? '#111827' : '#ffffff'),
        },
        '.cm-scroller': {
          overflow: 'auto',
          height: '100%',
          cursor: 'text',
        },
        '.cm-content': {
          padding: '12px',
          color: darkTheme ? '#e5e7eb' : '#111827',
          caretColor: darkTheme ? '#34d399' : '#2563eb',
        },
        '.cm-line': {
          padding: '2px 4px',
        },
        '&.cm-focused': {
          outline: 'none',
          borderColor: isFusionSurface
            ? (darkTheme ? 'rgba(52, 211, 153, 0.42)' : 'rgba(37, 99, 235, 0.42)')
            : (darkTheme ? '#10b981' : '#2563eb'),
          boxShadow: darkTheme
            ? (isFusionSurface ? '0 0 0 1px rgba(16, 185, 129, 0.14)' : '0 0 0 2px rgba(16, 185, 129, 0.18)')
            : (isFusionSurface ? '0 0 0 1px rgba(37, 99, 235, 0.14)' : '0 0 0 2px rgba(37, 99, 235, 0.18)'),
        },
        '.cm-activeLine': {
          backgroundColor: 'transparent',
        },
        '.cm-selectionBackground': {
          backgroundColor: darkTheme ? 'rgba(16, 185, 129, 0.2) !important' : 'rgba(37, 99, 235, 0.18) !important',
        },
        '&.cm-focused .cm-selectionBackground': {
          backgroundColor: darkTheme ? 'rgba(16, 185, 129, 0.28) !important' : 'rgba(37, 99, 235, 0.24) !important',
        },
        '.cm-cursor': {
          borderLeftColor: darkTheme ? '#34d399' : '#2563eb',
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
  }, [darkTheme, maxHeight, minHeight, placeholder, readOnly, surfaceStyle]);

  useEffect(() => {
    if (!containerRef.current) return;

    const compartment = extensionCompartmentRef.current;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          ...baseExtensions,
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
    <div className={className} style={style} data-surface-style={surfaceStyle}>
      <div
        ref={containerRef}
        style={{ position: 'relative', cursor: 'text' }}
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
      color: #6b7280;
      pointer-events: none;
      position: absolute;
      white-space: pre-wrap;
    }
  `;
  document.head.appendChild(style);
}

export default LinghuiPromptEditor;
