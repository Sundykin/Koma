/**
 * 关键字高亮装饰器插件
 * 用于高亮提示词中的运镜和景别关键字
 */
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

// 运镜关键字（紫色高亮）
export const CAMERA_KEYWORDS = [
  'static shot',
  'pan left',
  'pan right',
  'pan',
  'tilt up',
  'tilt down',
  'tilt',
  'zoom in',
  'zoom out',
  'zoom',
  'tracking shot',
  'tracking',
  'dolly shot',
  'dolly',
  'crane shot',
  'crane',
  'handheld',
  'push in',
  'pull out',
  'steadicam',
];

// 景别关键字（蓝色高亮）
export const SHOT_TYPE_KEYWORDS = [
  'extreme close-up',
  'close-up',
  'medium close-up',
  'medium shot',
  'medium wide shot',
  'wide shot',
  'extreme wide shot',
  'establishing shot',
  'full shot',
  'over-the-shoulder shot',
  'over the shoulder',
  'two-shot',
  'point of view',
  'pov shot',
  'aerial shot',
  'birds eye view',
  'low angle',
  'high angle',
];

// 构建正则表达式（忽略大小写）
function buildKeywordRegex(keywords: string[]): RegExp {
  // 按长度降序排列，优先匹配长关键字
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  const pattern = sorted.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`\\b(${pattern})\\b`, 'gi');
}

const cameraRegex = buildKeywordRegex(CAMERA_KEYWORDS);
const shotTypeRegex = buildKeywordRegex(SHOT_TYPE_KEYWORDS);

// 装饰样式
const cameraDecoration = Decoration.mark({
  class: 'keyword-camera',
  attributes: {
    style: 'background-color: rgba(147, 51, 234, 0.2); color: #a78bfa; border-radius: 2px; padding: 0 2px;',
  },
});

const shotTypeDecoration = Decoration.mark({
  class: 'keyword-shot-type',
  attributes: {
    style: 'background-color: rgba(59, 130, 246, 0.2); color: #60a5fa; border-radius: 2px; padding: 0 2px;',
  },
});

/**
 * 构建关键字装饰
 */
function buildKeywordDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const text = doc.toString();

  // 收集所有匹配
  interface Match {
    from: number;
    to: number;
    decoration: Decoration;
  }
  const matches: Match[] = [];

  // 匹配运镜关键字
  let match;
  cameraRegex.lastIndex = 0;
  while ((match = cameraRegex.exec(text)) !== null) {
    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      decoration: cameraDecoration,
    });
  }

  // 匹配景别关键字
  shotTypeRegex.lastIndex = 0;
  while ((match = shotTypeRegex.exec(text)) !== null) {
    // 检查是否与已有匹配重叠
    const overlaps = matches.some(
      m => (match!.index >= m.from && match!.index < m.to) ||
           (match!.index + match![0].length > m.from && match!.index + match![0].length <= m.to)
    );
    if (!overlaps) {
      matches.push({
        from: match.index,
        to: match.index + match[0].length,
        decoration: shotTypeDecoration,
      });
    }
  }

  // 按位置排序
  matches.sort((a, b) => a.from - b.from);

  // 添加装饰
  for (const m of matches) {
    builder.add(m.from, m.to, m.decoration);
  }

  return builder.finish();
}

/**
 * 创建关键字高亮视图插件
 */
export function createKeywordHighlightPlugin() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildKeywordDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildKeywordDecorations(update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

/**
 * 关键字高亮主题样式
 */
export const keywordHighlightTheme = EditorView.baseTheme({
  '.keyword-camera': {
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
    color: '#a78bfa',
    borderRadius: '2px',
    padding: '0 2px',
  },
  '.keyword-shot-type': {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    color: '#60a5fa',
    borderRadius: '2px',
    padding: '0 2px',
  },
});
