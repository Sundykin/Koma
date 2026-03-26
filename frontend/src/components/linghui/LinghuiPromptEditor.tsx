import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { EditorState, Extension, Compartment, Prec, EditorSelection, RangeSetBuilder } from '@codemirror/state';
import { autocompletion, Completion, CompletionContext, CompletionResult, completionKeymap } from '@codemirror/autocomplete';
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
import { electronService } from '../../services/electronService';
import {
  createLinghuiPromptReferenceString,
  parseLinghuiPromptReferences,
  type LinghuiPromptReferenceItem,
} from './linghuiPromptReferences';

interface LinghuiPromptEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  references?: LinghuiPromptReferenceItem[];
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  darkTheme?: boolean;
  className?: string;
  style?: React.CSSProperties;
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

function toPreviewSource(source?: string): string | undefined {
  if (!source) return undefined;
  if (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('data:') ||
    source.startsWith('blob:') ||
    source.startsWith('koma-local://')
  ) {
    return source;
  }
  return electronService.fs.toLocalUrl(source);
}

class LinghuiReferenceWidget extends WidgetType {
  constructor(readonly item: LinghuiPromptReferenceItem) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    const colors = getReferenceWidgetColor(this.item.kind);
    span.className = `linghui-reference-widget linghui-reference-${this.item.kind}`;
    span.textContent = `@${this.item.name}`;
    span.title = this.item.description || `${getReferenceKindLabel(this.item.kind)}参考`;
    span.style.cssText = `
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      margin: 0 2px;
      border-radius: 999px;
      font-size: 0.9em;
      font-weight: 600;
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
      other.item.kind === this.item.kind
    );
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
          info: item.description,
          apply: (view, _completion, from, to) => {
            const mention = createLinghuiPromptReferenceString(item.id);
            view.dispatch({
              changes: { from, to, insert: `${mention} ` },
              selection: { anchor: from + mention.length + 1 },
            });
          },
          boost: item.kind === 'image' ? 2 : item.kind === 'video' ? 1 : 0,
        }));

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
    icons: true,
  });
}

const autocompleteTheme = EditorView.theme({
  '.cm-tooltip': {
    zIndex: '99999 !important',
  },
  '.cm-tooltip-autocomplete': {
    minWidth: '220px',
    maxWidth: '420px',
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
    padding: '8px 12px !important',
    color: '#e5e7eb !important',
  },
  '.cm-tooltip-autocomplete li[aria-selected]': {
    backgroundColor: '#10b981 !important',
    color: '#ffffff !important',
  },
  '.cm-completionLabel': {
    flex: '1',
    fontWeight: '500',
  },
  '.cm-completionDetail': {
    color: '#9ca3af',
    marginLeft: 'auto',
  },
  '.cm-tooltip-autocomplete li[aria-selected] .cm-completionDetail': {
    color: 'rgba(255, 255, 255, 0.82)',
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
          overflow: 'hidden',
          border: darkTheme ? '1px solid #3f3f46' : '1px solid #d4d4d8',
          borderRadius: '10px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '13px',
          lineHeight: '1.6',
          backgroundColor: darkTheme ? '#111827' : '#ffffff',
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
          borderColor: darkTheme ? '#10b981' : '#2563eb',
          boxShadow: darkTheme
            ? '0 0 0 2px rgba(16, 185, 129, 0.18)'
            : '0 0 0 2px rgba(37, 99, 235, 0.18)',
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
  }, [darkTheme, maxHeight, minHeight, placeholder, readOnly]);

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

  const previewRefs = references
    .map(item => ({
      ...item,
      previewSource: toPreviewSource(item.previewSource),
    }))
    .filter(item => item.previewSource)
    .slice(0, 4);

  return (
    <div className={className} style={style}>
      <div
        ref={containerRef}
        style={{ position: 'relative', cursor: 'text' }}
        onClick={handleContainerClick}
      />
      {previewRefs.length > 0 && (
        <div className="linghuiPromptEditorPreviewRow">
          {previewRefs.map(item => (
            <div key={item.id} className="linghuiPromptEditorPreviewItem" title={item.name}>
              <img src={item.previewSource} alt={item.name} />
              <span>{item.name}</span>
            </div>
          ))}
        </div>
      )}
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
