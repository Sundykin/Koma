/**
 * CodeMirror Mention 装饰器插件
 * 将 @type_id 格式的文本替换为可读的名称标签
 */
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type { MentionItem, MentionType, ParsedMention } from './mentionTypes';
import { parseMentions } from './mentionTypes';

// Mention 数据解析器类型
export type MentionResolver = (type: MentionType, id: string) => MentionItem | undefined;

// Mention 点击回调
export type MentionClickHandler = (mention: MentionItem) => void;

/**
 * Mention Widget - 显示为可点击的标签
 */
class MentionWidget extends WidgetType {
  constructor(
    readonly mention: MentionItem,
    readonly onClick?: MentionClickHandler
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = `mention-widget mention-${this.mention.type}`;
    span.textContent = `@${this.mention.name}`;
    span.title = this.mention.description || this.mention.name;

    // 样式
    span.style.cssText = `
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      margin: 0 2px;
      border-radius: 4px;
      font-size: 0.9em;
      cursor: pointer;
      transition: background-color 0.2s;
    `;

    // 根据类型设置颜色
    const colors: Record<MentionType, { bg: string; text: string }> = {
      char: { bg: '#e3f2fd', text: '#1565c0' },
      prop: { bg: '#fff3e0', text: '#e65100' },
      scene: { bg: '#e8f5e9', text: '#2e7d32' },
    };

    const color = colors[this.mention.type];
    span.style.backgroundColor = color.bg;
    span.style.color = color.text;

    // 悬浮效果
    span.addEventListener('mouseenter', () => {
      span.style.filter = 'brightness(0.95)';
    });
    span.addEventListener('mouseleave', () => {
      span.style.filter = 'none';
    });

    // 点击事件
    if (this.onClick) {
      span.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onClick?.(this.mention);
      });
    }

    return span;
  }

  eq(other: MentionWidget): boolean {
    return (
      other.mention.id === this.mention.id &&
      other.mention.type === this.mention.type &&
      other.mention.name === this.mention.name
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 创建 Mention 装饰器
 */
function buildDecorations(
  view: EditorView,
  resolver: MentionResolver,
  onClick?: MentionClickHandler
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const text = doc.toString();
  const mentions = parseMentions(text);

  for (const parsed of mentions) {
    const item = resolver(parsed.type, parsed.id);
    if (item) {
      const widget = Decoration.replace({
        widget: new MentionWidget(item, onClick),
        inclusive: false,
      });
      builder.add(parsed.from, parsed.to, widget);
    }
  }

  return builder.finish();
}

/**
 * 创建 Mention 视图插件
 */
export function createMentionPlugin(
  resolver: MentionResolver,
  onClick?: MentionClickHandler
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, resolver, onClick);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, resolver, onClick);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

/**
 * 创建 Mention 主题样式
 */
export const mentionTheme = EditorView.baseTheme({
  '.mention-widget': {
    fontFamily: 'inherit',
  },
  '.mention-char': {
    backgroundColor: '#e3f2fd',
    color: '#1565c0',
  },
  '.mention-prop': {
    backgroundColor: '#fff3e0',
    color: '#e65100',
  },
  '.mention-scene': {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
  },
});
