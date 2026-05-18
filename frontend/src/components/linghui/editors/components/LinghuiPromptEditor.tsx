import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { EditorState, Extension, Compartment, Prec } from '@codemirror/state';
import { completionKeymap } from '@codemirror/autocomplete';
import {
  EditorView,
  highlightActiveLine,
  keymap,
  tooltips,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { useTheme } from '../../../../theme/runtime';
import { createAtomicReferenceDelete, createReferenceAutocomplete, createReferencePlugin, autocompleteTheme } from './LinghuiPromptReferenceExtension';

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
  const isComposingRef = useRef(false);

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
        if (isComposingRef.current) {
          return;
        }
        onChangeRef.current(update.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        compositionstart() {
          isComposingRef.current = true;
        },
        compositionend(_event, view) {
          isComposingRef.current = false;
          onChangeRef.current?.(view.state.doc.toString());
        },
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
    if (!view || view.hasFocus || isComposingRef.current) return;

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
