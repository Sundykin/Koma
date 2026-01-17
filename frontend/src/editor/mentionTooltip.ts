/**
 * CodeMirror Mention Tooltip
 * 悬浮显示 Mention 详情
 */
import { EditorView, hoverTooltip, Tooltip } from '@codemirror/view';
import type { MentionItem, MentionType } from './mentionTypes';
import { MENTION_REGEX } from './mentionTypes';

// Mention 解析器
export type MentionResolver = (type: MentionType, id: string) => MentionItem | undefined;

/**
 * 创建 Mention Tooltip 扩展
 */
export function createMentionTooltip(resolver: MentionResolver) {
  return hoverTooltip((view, pos, side) => {
    const doc = view.state.doc;
    const line = doc.lineAt(pos);
    const text = line.text;
    const lineStart = line.from;

    // 在当前行查找 Mention
    const regex = new RegExp(MENTION_REGEX.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const from = lineStart + match.index;
      const to = from + match[0].length;

      if (pos >= from && pos <= to) {
        const type = match[1] as MentionType;
        const id = match[2];
        const item = resolver(type, id);

        if (item) {
          return {
            pos: from,
            end: to,
            above: true,
            create: () => createTooltipDOM(item),
          };
        }
      }
    }

    return null;
  });
}

/**
 * 创建 Tooltip DOM
 */
function createTooltipDOM(item: MentionItem): { dom: HTMLElement } {
  const container = document.createElement('div');
  container.className = 'mention-tooltip';
  container.style.cssText = `
    padding: 12px;
    max-width: 300px;
    font-size: 14px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;

  // 头部：类型标签 + 名称
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  `;

  const typeTag = document.createElement('span');
  typeTag.textContent = getTypeLabel(item.type);
  typeTag.style.cssText = `
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    background-color: ${getTypeColor(item.type).bg};
    color: ${getTypeColor(item.type).text};
  `;

  const name = document.createElement('span');
  name.textContent = item.name;
  name.style.fontWeight = 'bold';

  header.appendChild(typeTag);
  header.appendChild(name);
  container.appendChild(header);

  // 预览图
  if (item.previewImage) {
    const img = document.createElement('img');
    img.src = item.previewImage;
    img.alt = item.name;
    img.style.cssText = `
      width: 100%;
      max-height: 150px;
      object-fit: cover;
      border-radius: 4px;
      margin-bottom: 8px;
    `;
    container.appendChild(img);
  }

  // 描述
  if (item.description) {
    const desc = document.createElement('div');
    desc.textContent = item.description;
    desc.style.cssText = `
      color: #666;
      font-size: 13px;
      line-height: 1.4;
    `;
    container.appendChild(desc);
  }

  // ID
  const idText = document.createElement('div');
  idText.textContent = `ID: ${item.type}_${item.id}`;
  idText.style.cssText = `
    margin-top: 8px;
    font-size: 11px;
    color: #999;
    font-family: monospace;
  `;
  container.appendChild(idText);

  return { dom: container };
}

function getTypeLabel(type: MentionType): string {
  switch (type) {
    case 'char':
      return '角色';
    case 'prop':
      return '道具';
    case 'scene':
      return '场景';
    default:
      return '';
  }
}

function getTypeColor(type: MentionType): { bg: string; text: string } {
  switch (type) {
    case 'char':
      return { bg: '#e3f2fd', text: '#1565c0' };
    case 'prop':
      return { bg: '#fff3e0', text: '#e65100' };
    case 'scene':
      return { bg: '#e8f5e9', text: '#2e7d32' };
    default:
      return { bg: '#f5f5f5', text: '#666' };
  }
}

/**
 * Tooltip 样式
 */
export const tooltipTheme = EditorView.baseTheme({
  '.cm-tooltip': {
    border: 'none',
  },
  '.mention-tooltip': {
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
});
