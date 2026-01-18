/**
 * 智能剧本编辑器组件
 * 基于 CodeMirror 6，支持 @mention 智能引用
 */
import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { EditorState, Extension, Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, tooltips } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { completionKeymap } from '@codemirror/autocomplete';
import { createMentionPlugin, createMentionAtomicDelete, mentionTheme, type MentionClickHandler } from './mentionPlugin';
import { createMentionAutocomplete, autocompleteTheme, type MentionDataSource } from './mentionAutocomplete';
import { createMentionTooltip, tooltipTheme } from './mentionTooltip';
import { createKeywordHighlightPlugin, keywordHighlightTheme } from './keywordHighlightPlugin';
import type { MentionItem, MentionType } from './mentionTypes';

export interface ScriptEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  // Mention 相关
  mentionItems?: MentionItem[];
  onMentionClick?: MentionClickHandler;
  // 关键字高亮（运镜/景别）
  enableKeywordHighlight?: boolean;
  // 样式选项
  showLineNumbers?: boolean;
  darkTheme?: boolean;
  // 样式
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 智能剧本编辑器
 */
export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  value,
  onChange,
  placeholder = '开始编写剧本...\n使用 @ 可以引用角色、道具或场景',
  readOnly = false,
  minHeight = '200px',
  maxHeight = '400px',
  mentionItems = [],
  onMentionClick,
  enableKeywordHighlight = false,
  showLineNumbers = true,
  darkTheme = false,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  // 用于动态更新 mention 相关扩展的 Compartment
  const mentionCompartmentRef = useRef(new Compartment());

  // 更新 onChange 引用
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Mention 解析器
  const mentionResolver = useCallback(
    (type: MentionType, id: string): MentionItem | undefined => {
      return mentionItems.find(
        (item) => item.type === type && item.id === id
      );
    },
    [mentionItems]
  );

  // Mention 数据源
  const mentionDataSource: MentionDataSource = useCallback(() => {
    return mentionItems;
  }, [mentionItems]);

  // 创建 mention 扩展（可动态更新）
  const mentionExtensions = useMemo((): Extension[] => {
    const exts: Extension[] = [
      createMentionPlugin(mentionResolver, onMentionClick),
      createMentionAutocomplete(mentionDataSource),
      createMentionTooltip(mentionResolver),
      Prec.highest(createMentionAtomicDelete()),  // 最高优先级，确保在 defaultKeymap 之前处理
      mentionTheme,
      tooltipTheme,
      autocompleteTheme,
    ];

    // 关键字高亮（运镜/景别）
    if (enableKeywordHighlight) {
      exts.push(createKeywordHighlightPlugin());
      exts.push(keywordHighlightTheme);
    }

    return exts;
  }, [mentionResolver, mentionDataSource, onMentionClick, enableKeywordHighlight]);

  // 创建基础扩展（不变的部分）
  const baseExtensions = useMemo((): Extension[] => {
    const exts: Extension[] = [
      // 基础功能
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
      // 自动换行
      EditorView.lineWrapping,

      // tooltip 渲染到 body，避免被 overflow 裁剪
      tooltips({ parent: document.body }),

      // 文档变更监听
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChangeRef.current) {
          const newValue = update.state.doc.toString();
          onChangeRef.current(newValue);
        }
      }),

      // 编辑器样式
      EditorView.theme({
        '&': {
          minHeight,
          maxHeight,
          overflow: 'auto',
          border: darkTheme ? '1px solid #3f3f46' : '1px solid #ddd',
          borderRadius: '8px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '13px',
          lineHeight: '1.6',
          backgroundColor: darkTheme ? '#1a1a1a' : '#fff',
        },
        '.cm-scroller': {
          overflow: 'auto',
        },
        '.cm-content': {
          padding: '12px',
          color: darkTheme ? '#e4e4e7' : '#333',
          caretColor: darkTheme ? '#10b981' : '#1976d2',
        },
        '.cm-line': {
          padding: '2px 4px',
        },
        '&.cm-focused': {
          outline: 'none',
          borderColor: darkTheme ? '#10b981' : '#1976d2',
          boxShadow: darkTheme
            ? '0 0 0 2px rgba(16, 185, 129, 0.2)'
            : '0 0 0 2px rgba(25, 118, 210, 0.2)',
        },
        '.cm-gutters': {
          backgroundColor: darkTheme ? '#141414' : '#f5f5f5',
          borderRight: darkTheme ? '1px solid #27272a' : '1px solid #ddd',
          color: darkTheme ? '#52525b' : '#999',
        },
        '.cm-activeLineGutter': {
          backgroundColor: darkTheme ? '#1f1f1f' : '#e8e8e8',
        },
        '.cm-activeLine': {
          backgroundColor: darkTheme ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
        },
        '.cm-selectionBackground': {
          backgroundColor: darkTheme ? 'rgba(16, 185, 129, 0.2) !important' : 'rgba(25, 118, 210, 0.2) !important',
        },
        '&.cm-focused .cm-selectionBackground': {
          backgroundColor: darkTheme ? 'rgba(16, 185, 129, 0.3) !important' : 'rgba(25, 118, 210, 0.3) !important',
        },
        '.cm-cursor': {
          borderLeftColor: darkTheme ? '#10b981' : '#1976d2',
        },
      }),

      // 占位符
      EditorView.contentAttributes.of({
        'data-placeholder': placeholder,
      }),
    ];

    // 行号
    if (showLineNumbers) {
      exts.unshift(lineNumbers());
    }

    // 只读模式
    if (readOnly) {
      exts.push(EditorState.readOnly.of(true));
    }

    return exts;
  }, [minHeight, maxHeight, placeholder, readOnly, showLineNumbers, darkTheme]);

  // 初始化编辑器
  useEffect(() => {
    if (!containerRef.current) return;

    const mentionCompartment = mentionCompartmentRef.current;

    // 创建编辑器
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...baseExtensions,
        mentionCompartment.of(mentionExtensions),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // 只在挂载时创建

  // 同步外部 value 变化（外部控制）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  // 更新 mention 扩展（当 mentionItems 变化时）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const mentionCompartment = mentionCompartmentRef.current;
    view.dispatch({
      effects: mentionCompartment.reconfigure(mentionExtensions),
    });
  }, [mentionExtensions]);

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
    />
  );
};

// 添加占位符样式
const placeholderStyle = document.createElement('style');
placeholderStyle.textContent = `
.cm-content[data-placeholder]:empty::before {
  content: attr(data-placeholder);
  color: #71717a;
  pointer-events: none;
  position: absolute;
  white-space: pre-wrap;
}
`;
if (typeof document !== 'undefined') {
  document.head.appendChild(placeholderStyle);
}

export default ScriptEditor;
