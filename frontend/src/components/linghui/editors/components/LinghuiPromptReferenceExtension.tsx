import { Prec, EditorSelection, RangeSetBuilder } from '@codemirror/state';
import {
  autocompletion,
  Completion,
  CompletionContext,
  CompletionInfo,
  CompletionResult,
} from '@codemirror/autocomplete';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  keymap,
} from '@codemirror/view';
import {
  createLinghuiPromptReferenceString,
  parseLinghuiPromptReferences,
  type LinghuiPromptReferenceItem,
} from '../state/linghuiPromptReferences';
import {
  getReferenceKindLabel,
  getReferenceWidgetColor,
  hideReferencePreviewTooltip,
  isVisualReference,
  moveReferencePreviewTooltip,
  showReferencePreviewTooltip,
  toPreviewSource,
} from './LinghuiPromptReferencePreview';
export { autocompleteTheme } from './LinghuiPromptAutocompleteTheme';

interface LinghuiReferenceCompletion extends Completion {
  linghuiItem: LinghuiPromptReferenceItem;
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
        moveReferencePreviewTooltip(chip, event);
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

export function createReferencePlugin(references: LinghuiPromptReferenceItem[]) {
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

export function createAtomicReferenceDelete() {
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

export function createReferenceAutocomplete(references: LinghuiPromptReferenceItem[]) {
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
