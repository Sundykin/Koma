import type { LinghuiNodeType } from '../../../../types/linghui';

export const PANEL_GAP = 8;
export const TOOLBAR_STANDOFF = 6;

export function getNodeTypeLabel(nodeType: LinghuiNodeType): string {
  switch (nodeType) {
    case 'linghui/image':
      return '图片节点';
    case 'linghui/panorama':
      return '全景节点';
    case 'linghui/agent':
      return 'Agent 节点';
    case 'linghui/video':
      return '视频节点';
    case 'linghui/audio':
      return '音频节点';
    case 'linghui/script':
      return '脚本节点';
    case 'linghui/storyboard':
      return '故事板节点';
    case 'linghui/text':
      return '文本节点';
    case 'linghui/director3d':
      return '3D 导演工作台';
    default:
      return '节点编辑';
  }
}

export function getPanelWidth(nodeType: LinghuiNodeType): number {
  if (nodeType === 'linghui/script') return 760;
  if (nodeType === 'linghui/storyboard') return 760;
  if (nodeType === 'linghui/audio') return 540;
  if (nodeType === 'linghui/agent') return 620;
  if (nodeType === 'linghui/director3d') return 1080;
  return 560;
}

export function getPanelMaxHeight(nodeType: LinghuiNodeType): number {
  if (nodeType === 'linghui/script') return 760;
  if (nodeType === 'linghui/storyboard') return 760;
  if (nodeType === 'linghui/agent') return 640;
  if (nodeType === 'linghui/text') return 520;
  if (nodeType === 'linghui/director3d') return 720;
  return 620;
}

export function getViewportBoundWidth(width: number): string {
  return `min(${width}px, calc(100vw - 48px))`;
}

export function getViewportBoundHeight(height: number): string {
  return `min(${height}px, calc(100vh - 112px))`;
}
