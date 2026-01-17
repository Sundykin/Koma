/**
 * 智能剧本编辑器组件
 * 基于 CodeMirror 6，支持 @mention 智能引用
 */
import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { createMentionPlugin, mentionTheme, type MentionClickHandler } from './mentionPlugin';
import { createMentionAutocomplete, type MentionDataSource } from './mentionAutocomplete';
import { createMentionTooltip, tooltipTheme } from './mentionTooltip';
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
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

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

  // 创建扩展
  const extensions = useMemo((): Extension[] => {
    const exts: Extension[] = [
      // 基础功能
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),

      // Mention 功能
      createMentionPlugin(mentionResolver, onMentionClick),
      createMentionAutocomplete(mentionDataSource),
      createMentionTooltip(mentionResolver),
      mentionTheme,
      tooltipTheme,

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
          border: '1px solid #ddd',
          borderRadius: '8px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '14px',
          lineHeight: '1.6',
        },
        '.cm-scroller': {
          overflow: 'auto',
        },
        '.cm-content': {
          padding: '12px',
        },
        '.cm-line': {
          padding: '0 4px',
        },
        '&.cm-focused': {
          outline: 'none',
          borderColor: '#1976d2',
          boxShadow: '0 0 0 2px rgba(25, 118, 210, 0.2)',
        },
        '.cm-gutters': {
          backgroundColor: '#f5f5f5',
          borderRight: '1px solid #ddd',
        },
      }),

      // 占位符
      EditorView.contentAttributes.of({
        'data-placeholder': placeholder,
      }),
    ];

    // 只读模式
    if (readOnly) {
      exts.push(EditorState.readOnly.of(true));
    }

    return exts;
  }, [mentionResolver, mentionDataSource, onMentionClick, minHeight, maxHeight, placeholder, readOnly]);

  // 初始化编辑器
  useEffect(() => {
    if (!containerRef.current) return;

    // 创建编辑器
    const state = EditorState.create({
      doc: value,
      extensions,
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

  // 更新扩展（当 mentionItems 变化时）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // 重新配置编辑器
    view.dispatch({
      effects: EditorView.reconfigure.of(extensions),
    });
  }, [extensions]);

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
  color: #999;
  pointer-events: none;
  position: absolute;
  white-space: pre-wrap;
}
`;
if (typeof document !== 'undefined') {
  document.head.appendChild(placeholderStyle);
}

export default ScriptEditor;
