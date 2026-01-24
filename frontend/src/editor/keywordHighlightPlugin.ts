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

// 运镜关键字 - 英文（紫色高亮）
export const CAMERA_KEYWORDS_EN = [
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

// 运镜关键字 - 中文（紫色高亮）
export const CAMERA_KEYWORDS_ZH = [
  '推镜头', '拉镜头', '摇镜头', '移镜头', '跟镜头', '升镜头', '降镜头', '甩镜头',
  '镜头推进', '镜头拉远', '镜头上摇', '镜头下摇', '镜头左摇', '镜头右摇',
  '横摇', '纵摇', '环绕', '跟拍', '手持', '稳定器',
  '推', '拉', '摇', '移', '跟', '升', '降', '甩',
  '缓推', '缓拉', '快推', '快拉',
];

// 合并运镜关键字
export const CAMERA_KEYWORDS = [...CAMERA_KEYWORDS_EN, ...CAMERA_KEYWORDS_ZH];

// 景别关键字 - 英文（蓝色高亮）
export const SHOT_TYPE_KEYWORDS_EN = [
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

// 景别关键字 - 中文（蓝色高亮）
export const SHOT_TYPE_KEYWORDS_ZH = [
  '特写', '大特写', '近景', '中近景', '中景', '中远景', '远景', '大远景',
  '全景', '半身', '全身', '过肩镜头', '双人镜头', '群戏',
  '俯视', '仰视', '平视', '鸟瞰', '低角度', '高角度',
  '主观镜头', '客观镜头', '空镜头',
];

// 合并景别关键字
export const SHOT_TYPE_KEYWORDS = [...SHOT_TYPE_KEYWORDS_EN, ...SHOT_TYPE_KEYWORDS_ZH];

// 构建正则表达式（支持中英文）
function buildKeywordRegex(keywords: string[]): RegExp {
  // 按长度降序排列，优先匹配长关键字
  const sorted = [...keywords].sort((a, b) => b.length - a.length);

  // 分离中文和英文关键字
  const zhKeywords: string[] = [];
  const enKeywords: string[] = [];

  for (const k of sorted) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 检测是否包含中文字符
    if (/[\u4e00-\u9fa5]/.test(k)) {
      zhKeywords.push(escaped);
    } else {
      enKeywords.push(escaped);
    }
  }

  const patterns: string[] = [];

  // 英文使用词边界
  if (enKeywords.length > 0) {
    patterns.push(`\\b(${enKeywords.join('|')})\\b`);
  }

  // 中文直接匹配（不需要词边界）
  if (zhKeywords.length > 0) {
    patterns.push(`(${zhKeywords.join('|')})`);
  }

  return new RegExp(patterns.join('|'), 'gi');
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
