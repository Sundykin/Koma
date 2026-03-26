import {
  DOMWidget,
  LGraphNode,
  LiteGraph,
  type INodeInputSlot,
  type INodeOutputSlot,
  type IPropertyInfo,
  type LGraphNodeConstructor,
  type PropertyLayout,
  type SlotLayout,
} from '@litegraph-ts/core';
import type {
  LinghuiNodeCatalogItem,
  LinghuiNodeResult,
  LinghuiNodeType,
  LinghuiSlotDataType,
} from '../../types/linghui';
import { electronService } from '../../services/electronService';

const MULTILINE_TEXT = {
  multiline: true,
} satisfies Partial<IPropertyInfo>;

type LinghuiNodeMeta = {
  type: LinghuiNodeType;
  title: string;
  desc: string;
  category: 'Linghui/Basic' | 'Linghui/Generation' | 'Linghui/Storyboard';
  catalogCategory: LinghuiNodeCatalogItem['category'];
  catalogLabel: string;
  catalogDescription: string;
  accent: string;
  background: string;
};

const NODE_META: Record<LinghuiNodeType, LinghuiNodeMeta> = {
  'linghui/reference-image': {
    type: 'linghui/reference-image',
    title: '参考图',
    desc: '上传或记录参考图路径，输出单张图片',
    category: 'Linghui/Basic',
    catalogCategory: 'basic',
    catalogLabel: '参考图节点',
    catalogDescription: '挂载参考图或记录图片地址',
    accent: '#38bdf8',
    background: '#13202f',
  },
  'linghui/prompt': {
    type: 'linghui/prompt',
    title: '提示词',
    desc: '编写创作用提示词，输出文本',
    category: 'Linghui/Basic',
    catalogCategory: 'basic',
    catalogLabel: '提示词节点',
    catalogDescription: '编辑通用提示词与风格标签',
    accent: '#f472b6',
    background: '#20161f',
  },
  'linghui/image-to-image': {
    type: 'linghui/image-to-image',
    title: '图生图',
    desc: '基于参考图和提示词生成新图',
    category: 'Linghui/Generation',
    catalogCategory: 'generation',
    catalogLabel: '图生图节点',
    catalogDescription: '以参考图 + 提示词生成图片',
    accent: '#4ade80',
    background: '#0f1720',
  },
  'linghui/image-to-video': {
    type: 'linghui/image-to-video',
    title: '图生视频',
    desc: '基于图片和提示词生成视频片段',
    category: 'Linghui/Generation',
    catalogCategory: 'generation',
    catalogLabel: '图生视频节点',
    catalogDescription: '以图片为起点生成视频片段',
    accent: '#22c55e',
    background: '#0f1720',
  },
  'linghui/four-grid': {
    type: 'linghui/four-grid',
    title: '4宫格',
    desc: '生成 4 宫格组合图',
    category: 'Linghui/Generation',
    catalogCategory: 'generation',
    catalogLabel: '4 宫格生成节点',
    catalogDescription: '输出 2x2 宫格组合图',
    accent: '#fb923c',
    background: '#0f1720',
  },
  'linghui/multi-angle': {
    type: 'linghui/multi-angle',
    title: '多角度',
    desc: '批量生成多角度图片',
    category: 'Linghui/Generation',
    catalogCategory: 'generation',
    catalogLabel: '多角度图片节点',
    catalogDescription: '输出多个预设视角的结果',
    accent: '#a78bfa',
    background: '#0f1720',
  },
  'linghui/storyboard-shot': {
    type: 'linghui/storyboard-shot',
    title: '分镜',
    desc: '管理单个分镜内容与时长',
    category: 'Linghui/Storyboard',
    catalogCategory: 'storyboard',
    catalogLabel: '分镜节点',
    catalogDescription: '描述单个镜头内容与时长',
    accent: '#2dd4bf',
    background: '#0f1720',
  },
  'linghui/storyboard-group': {
    type: 'linghui/storyboard-group',
    title: '分镜组',
    desc: '串联多个分镜形成序列',
    category: 'Linghui/Storyboard',
    catalogCategory: 'storyboard',
    catalogLabel: '分镜组节点',
    catalogDescription: '聚合多个分镜节点形成序列',
    accent: '#facc15',
    background: '#0f1720',
  },
};

const SLOT_TYPE_LABELS: Record<LinghuiSlotDataType, string> = {
  image: '图片',
  text: '文本',
  video: '视频',
  images: '多图',
  shot: '分镜',
  storyboard: '分镜序列',
};

function ensureTrailingStoryboardInput(node: LGraphNode) {
  const inputs = node.inputs ?? [];
  const hasEmptyInput = inputs.some(input => input.type === 'shot' && input.link == null);
  if (!hasEmptyInput) {
    node.addInput(`分镜 ${inputs.length + 1}`, 'shot');
  }
}

function trimStoryboardInputs(node: LGraphNode) {
  const inputs = node.inputs ?? [];
  let trailingEmptyCount = 0;

  for (let index = inputs.length - 1; index >= 0; index -= 1) {
    const input = inputs[index];
    if (input.type !== 'shot') continue;
    if (input.link == null) {
      trailingEmptyCount += 1;
      continue;
    }
    break;
  }

  while ((node.inputs?.length ?? 0) > 1 && trailingEmptyCount > 1) {
    node.removeInput((node.inputs?.length ?? 1) - 1);
    trailingEmptyCount -= 1;
  }
}

function relabelStoryboardInputs(node: LGraphNode) {
  for (const [index, input] of (node.inputs ?? []).entries()) {
    if (input.type === 'shot') {
      input.name = `分镜 ${index + 1}`;
    }
  }
}

function validateSlotCompatibility(
  outputType: INodeOutputSlot['type'],
  inputType: INodeInputSlot['type'],
): boolean {
  if (!outputType || !inputType) return true;
  return LiteGraph.isValidConnection(outputType, inputType);
}

export interface LinghuiConnectionValidationResult {
  valid: boolean;
  message?: string;
}

export function validateLinghuiConnection(options: {
  outputNodeType?: string | null;
  outputSlot?: INodeOutputSlot | null;
  inputNodeType?: string | null;
  inputSlot?: INodeInputSlot | null;
}): LinghuiConnectionValidationResult {
  const {
    outputNodeType,
    outputSlot,
    inputNodeType,
    inputSlot,
  } = options;

  if (!outputSlot || !inputSlot) {
    return { valid: false, message: '连接端口不存在，无法建立连线。' };
  }

  if (validateSlotCompatibility(outputSlot.type, inputSlot.type)) {
    return { valid: true };
  }

  const outputNodeLabel = outputNodeType && outputNodeType in NODE_META
    ? NODE_META[outputNodeType as LinghuiNodeType].title
    : '当前节点';
  const inputNodeLabel = inputNodeType && inputNodeType in NODE_META
    ? NODE_META[inputNodeType as LinghuiNodeType].title
    : '目标节点';
  const outputTypeLabel = SLOT_TYPE_LABELS[String(outputSlot.type) as LinghuiSlotDataType] ?? String(outputSlot.type ?? '数据');
  const inputTypeLabel = SLOT_TYPE_LABELS[String(inputSlot.type) as LinghuiSlotDataType] ?? String(inputSlot.type ?? '数据');

  return {
    valid: false,
    message: `${outputNodeLabel} 的 ${outputTypeLabel} 输出不能连接到 ${inputNodeLabel} 的 ${inputTypeLabel} 输入。`,
  };
}

export function getLinghuiNodeMeta(type?: string | null): LinghuiNodeMeta | null {
  if (!type || !(type in NODE_META)) return null;
  return NODE_META[type as LinghuiNodeType];
}

export function getLinghuiNodeAccent(type?: string | null): string {
  return getLinghuiNodeMeta(type)?.accent ?? '#4ade80';
}

export function setLinghuiNodeActive(node: LGraphNode, active: boolean): void {
  (node as LinghuiWidgetNode).__linghuiActive = active;
  const computed = node.computeSize();
  node.size[0] = Math.max(computed[0], 200);
  node.size[1] = Math.max(computed[1], 60);
}

type LinghuiWidgetNode = LGraphNode & {
  __linghuiPreviewSignature?: string;
  __linghuiActive?: boolean;
  __linghuiRunState?: {
    status?: string;
    progress?: number;
    message?: string;
    error?: string;
    result?: LinghuiNodeResult;
  };
};

function isNodeActive(node: LGraphNode): boolean {
  return (node as LinghuiWidgetNode).__linghuiActive === true;
}

function stopWidgetHotkeys(element: HTMLElement) {
  for (const eventName of ['keydown', 'keyup', 'keypress', 'mousedown', 'pointerdown']) {
    element.addEventListener(eventName, event => {
      event.stopPropagation();
    });
  }
}

function getPreviewSource(source?: string) {
  if (!source) return '';
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

function requestNodeMutation(node: LGraphNode) {
  const graph = node.graph as any;
  graph?.list_of_graphcanvas?.[0]?.setDirty(true, true);
  if (typeof graph?._linghuiNotifyNodeMutation === 'function') {
    graph._linghuiNotifyNodeMutation(String(node.id));
    return;
  }
  graph?.afterChange?.();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

async function applyReferenceFile(node: LGraphNode, file: File) {
  if (!file.type.startsWith('image/')) {
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  node.setProperty('source', dataUrl);

  if (!String(node.properties?.note ?? '').trim()) {
    node.setProperty('note', file.name);
  }

  requestNodeMutation(node);
}

function createWidgetShell(label: string, extraClassName?: string) {
  const root = document.createElement('div');
  root.className = ['linghuiNodeWidget', extraClassName].filter(Boolean).join(' ');

  const title = document.createElement('div');
  title.className = 'linghuiNodeWidgetLabel';
  title.textContent = label;
  root.appendChild(title);

  return { root, title };
}

function createTextareaWidget(options: {
  node: LGraphNode;
  property: string;
  label: string;
  placeholder: string;
  height: number;
}) {
  const { node, property, label, placeholder, height } = options;
  const { root } = createWidgetShell(label, 'linghuiNodeEditorWidget');
  const textarea = document.createElement('textarea');
  textarea.className = 'linghuiNodeTextarea';
  textarea.placeholder = placeholder;
  textarea.value = String(node.properties?.[property] ?? '');
  stopWidgetHotkeys(textarea);
  textarea.addEventListener('input', () => {
    node.setProperty(property, textarea.value);
    requestNodeMutation(node);
  });
  root.appendChild(textarea);

  return new DOMWidget({
    name: `${property}_editor`,
    element: root,
    node,
    options: {
      selectOn: ['click'],
      hideOnZoom: true,
      enableDomClipping: true,
      getHeight: () => isNodeActive(node) ? height : 0,
      onDraw: () => {
        if (!isNodeActive(node)) {
          root.style.display = 'none';
          return;
        }
        root.style.display = '';
        const nextValue = String(node.properties?.[property] ?? '');
        if (textarea.value !== nextValue) {
          textarea.value = nextValue;
        }
      },
    },
  });
}

function createTextInputWidget(options: {
  node: LGraphNode;
  property: string;
  label: string;
  placeholder: string;
  height?: number;
}) {
  const { node, property, label, placeholder, height = 76 } = options;
  const { root } = createWidgetShell(label, 'linghuiNodeEditorWidget');
  const input = document.createElement('input');
  input.className = 'linghuiNodeInput';
  input.placeholder = placeholder;
  input.value = String(node.properties?.[property] ?? '');
  stopWidgetHotkeys(input);
  input.addEventListener('input', () => {
    node.setProperty(property, input.value);
    requestNodeMutation(node);
  });
  root.appendChild(input);

  return new DOMWidget({
    name: `${property}_input`,
    element: root,
    node,
    options: {
      selectOn: ['click'],
      hideOnZoom: true,
      enableDomClipping: true,
      getHeight: () => isNodeActive(node) ? height : 0,
      onDraw: () => {
        if (!isNodeActive(node)) {
          root.style.display = 'none';
          return;
        }
        root.style.display = '';
        const nextValue = String(node.properties?.[property] ?? '');
        if (input.value !== nextValue) {
          input.value = nextValue;
        }
      },
    },
  });
}

function createReferenceWidget(node: LGraphNode) {
  const { root } = createWidgetShell('参考图', 'linghuiNodeReferenceWidget');
  const frame = document.createElement('div');
  frame.className = 'linghuiNodeMediaFrame linghuiNodeDropZone';

  const image = document.createElement('img');
  image.className = 'linghuiNodeMediaPreview';
  image.alt = 'reference-preview';

  const placeholder = document.createElement('div');
  placeholder.className = 'linghuiNodeMediaPlaceholder';
  placeholder.innerHTML = '拖拽图片到节点上传<br/>或点击选择文件';

  const footer = document.createElement('div');
  footer.className = 'linghuiNodeWidgetHint';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.hidden = true;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      void applyReferenceFile(node, file);
    }
    fileInput.value = '';
  });

  frame.append(image, placeholder);
  root.append(frame, footer, fileInput);

  stopWidgetHotkeys(frame);
  frame.addEventListener('click', () => fileInput.click());
  frame.addEventListener('dragover', event => {
    event.preventDefault();
    frame.classList.add('is-dragover');
  });
  frame.addEventListener('dragleave', () => {
    frame.classList.remove('is-dragover');
  });
  frame.addEventListener('drop', event => {
    event.preventDefault();
    frame.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void applyReferenceFile(node, file);
    }
  });

  return new DOMWidget({
    name: 'reference_media',
    element: root,
    node,
    options: {
      selectOn: ['click'],
      hideOnZoom: true,
      enableDomClipping: true,
      getHeight: () => isNodeActive(node) ? 208 : 0,
      onDraw: () => {
        if (!isNodeActive(node)) {
          root.style.display = 'none';
          return;
        }
        root.style.display = '';
        const source = getPreviewSource(String(node.properties?.source ?? '').trim());
        const note = String(node.properties?.note ?? '').trim();
        const hasSource = Boolean(source);

        frame.classList.toggle('hasPreview', hasSource);
        placeholder.hidden = hasSource;
        image.hidden = !hasSource;
        footer.textContent = hasSource
          ? (note || '参考图已挂载，可继续连线或直接执行。')
          : '支持本地拖拽上传，也可以在悬浮面板中替换 URL。';

        if (hasSource && image.src !== source) {
          image.src = source;
        }
      },
    },
  });
}

function getRunStatusMeta(node: LinghuiWidgetNode) {
  const status = node.__linghuiRunState?.status ?? 'idle';
  const progress = node.__linghuiRunState?.progress;

  switch (status) {
    case 'running':
      return {
        label: progress != null ? `执行中 ${Math.round(progress)}%` : '执行中',
        className: 'is-running',
      };
    case 'succeeded':
      return { label: '已完成', className: 'is-success' };
    case 'failed':
      return { label: '失败', className: 'is-error' };
    case 'stale':
      return { label: '待重跑', className: 'is-warning' };
    default:
      return { label: '未运行', className: 'is-idle' };
  }
}

function appendPreviewPlaceholder(container: HTMLElement, text: string, tone: 'muted' | 'error' = 'muted') {
  const placeholder = document.createElement('div');
  placeholder.className = `linghuiNodePreviewPlaceholder ${tone === 'error' ? 'is-error' : ''}`;
  placeholder.textContent = text;
  container.appendChild(placeholder);
}

function appendImagePreview(container: HTMLElement, source?: string, alt = 'preview') {
  if (!source) {
    appendPreviewPlaceholder(container, '暂无图片预览');
    return;
  }

  const image = document.createElement('img');
  image.className = 'linghuiNodePreviewImage';
  image.src = source;
  image.alt = alt;
  container.appendChild(image);
}

function appendVideoPreview(container: HTMLElement, source?: string, posterSource?: string) {
  if (source) {
    const video = document.createElement('video');
    video.className = 'linghuiNodePreviewVideo';
    video.src = source;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    if (posterSource) {
      video.poster = posterSource;
    }
    container.appendChild(video);
    return;
  }

  if (posterSource) {
    appendImagePreview(container, posterSource, 'video-poster');
    return;
  }

  appendPreviewPlaceholder(container, '暂无视频预览');
}

function appendTextPreview(container: HTMLElement, text: string) {
  const block = document.createElement('div');
  block.className = 'linghuiNodePreviewText';
  block.textContent = text;
  container.appendChild(block);
}

function appendImageGrid(container: HTMLElement, items: Array<{ source?: string; label?: string }>) {
  const grid = document.createElement('div');
  grid.className = 'linghuiNodePreviewGrid';

  for (const item of items.slice(0, 4)) {
    const tile = document.createElement('figure');
    tile.className = 'linghuiNodePreviewTile';
    const source = getPreviewSource(item.source);
    if (source) {
      const image = document.createElement('img');
      image.src = source;
      image.alt = item.label || 'preview-item';
      tile.appendChild(image);
    } else {
      const empty = document.createElement('div');
      empty.className = 'linghuiNodePreviewPlaceholder';
      empty.textContent = '无预览';
      tile.appendChild(empty);
    }

    const caption = document.createElement('figcaption');
    caption.textContent = item.label || '结果';
    tile.appendChild(caption);
    grid.appendChild(tile);
  }

  container.appendChild(grid);
}

function appendStoryboardPreview(container: HTMLElement, result: LinghuiNodeResult) {
  const list = document.createElement('div');
  list.className = 'linghuiNodeStoryboardList';

  for (const shot of result.shots?.slice(0, 3) ?? []) {
    const item = document.createElement('div');
    item.className = 'linghuiNodeStoryboardItem';

    const source = getPreviewSource(shot.image?.source);
    const thumb = document.createElement('div');
    thumb.className = 'linghuiNodeStoryboardThumb';
    if (source) {
      const image = document.createElement('img');
      image.src = source;
      image.alt = shot.title;
      thumb.appendChild(image);
    } else {
      thumb.textContent = '无图';
    }

    const meta = document.createElement('div');
    meta.className = 'linghuiNodeStoryboardMeta';
    const title = document.createElement('div');
    title.className = 'linghuiNodeStoryboardTitle';
    title.textContent = shot.title;
    const detail = document.createElement('div');
    detail.className = 'linghuiNodeStoryboardDetail';
    detail.textContent = `${shot.durationSec} 秒`;
    meta.append(title, detail);

    item.append(thumb, meta);
    list.appendChild(item);
  }

  container.appendChild(list);
}

function renderPreviewContent(node: LinghuiWidgetNode, container: HTMLElement) {
  const result = node.__linghuiRunState?.result;
  const message = node.__linghuiRunState?.error || node.__linghuiRunState?.message || '运行后结果会显示在这里';

  container.replaceChildren();

  if (!result) {
    appendPreviewPlaceholder(container, message, node.__linghuiRunState?.status === 'failed' ? 'error' : 'muted');
    return;
  }

  if (result.kind === 'text') {
    appendTextPreview(container, result.text || '暂无文本输出');
    return;
  }

  if (result.kind === 'video') {
    appendVideoPreview(
      container,
      getPreviewSource(result.primary?.source),
      getPreviewSource(result.primary?.posterSource),
    );
    return;
  }

  if (result.kind === 'grid') {
    appendImagePreview(container, getPreviewSource(result.primary?.source), 'grid-preview');
    if (result.items?.length) {
      appendImageGrid(container, result.items);
    }
    return;
  }

  if (result.kind === 'image' || result.kind === 'shot') {
    appendImagePreview(container, getPreviewSource(result.primary?.source));
    return;
  }

  if (result.kind === 'images') {
    appendImageGrid(container, result.items ?? []);
    return;
  }

  if (result.kind === 'storyboard') {
    appendStoryboardPreview(container, result);
    return;
  }

  appendPreviewPlaceholder(container, '暂无可展示的结果');
}

function getPreviewSignature(node: LinghuiWidgetNode) {
  const runState = node.__linghuiRunState;
  const result = runState?.result;

  return JSON.stringify({
    status: runState?.status,
    progress: runState?.progress,
    message: runState?.message,
    error: runState?.error,
    kind: result?.kind,
    text: result?.text?.slice(0, 160),
    primary: result?.primary?.source,
    poster: result?.primary?.posterSource,
    items: result?.items?.slice(0, 4).map(item => `${item.label || ''}:${item.source || ''}`),
    shots: result?.shots?.slice(0, 3).map(shot => `${shot.id}:${shot.image?.source || ''}:${shot.durationSec}`),
  });
}

function getResultThumbnailSource(result: LinghuiNodeResult): string {
  if (result.kind === 'video') {
    return getPreviewSource(result.primary?.posterSource) || getPreviewSource(result.primary?.source) || '';
  }
  if (result.kind === 'image' || result.kind === 'shot' || result.kind === 'grid') {
    return getPreviewSource(result.primary?.source) || '';
  }
  if (result.kind === 'images' && result.items?.length) {
    return getPreviewSource(result.items[0]?.source) || '';
  }
  if (result.kind === 'storyboard' && result.shots?.length) {
    return getPreviewSource(result.shots[0]?.image?.source) || '';
  }
  return '';
}

function renderCompactThumbnail(node: LinghuiWidgetNode, container: HTMLElement) {
  container.replaceChildren();
  const result = node.__linghuiRunState?.result;
  if (!result) return;

  if (result.kind === 'text') {
    const block = document.createElement('div');
    block.className = 'linghuiNodeThumbText';
    block.textContent = (result.text || '').slice(0, 80);
    container.appendChild(block);
    return;
  }

  const source = getResultThumbnailSource(result);
  if (source) {
    const img = document.createElement('img');
    img.className = 'linghuiNodeThumbImage';
    img.src = source;
    img.alt = 'thumbnail';
    container.appendChild(img);
  }
}

const COLLAPSED_BADGE_HEIGHT = 56;
const COLLAPSED_THUMB_HEIGHT = 128;

function createResultPreviewWidget(node: LGraphNode, expandedHeight = 170) {
  const widgetNode = node as LinghuiWidgetNode;
  const root = document.createElement('div');
  root.className = 'linghuiNodeWidget linghuiNodePreviewWidget';

  const labelEl = document.createElement('div');
  labelEl.className = 'linghuiNodeWidgetLabel';
  labelEl.textContent = '结果展示';

  const header = document.createElement('div');
  header.className = 'linghuiNodeWidgetHeader';
  const hint = document.createElement('span');
  hint.className = 'linghuiNodeWidgetHint';
  hint.textContent = '直接在节点上查看输出';
  const badge = document.createElement('span');
  badge.className = 'linghuiNodeStatusBadge is-idle';
  header.append(hint, badge);

  const thumbContainer = document.createElement('div');
  thumbContainer.className = 'linghuiNodeThumbContainer';

  const content = document.createElement('div');
  content.className = 'linghuiNodePreviewBody';

  root.append(labelEl, header, thumbContainer, content);

  return new DOMWidget({
    name: 'result_preview',
    element: root,
    node,
    options: {
      selectOn: ['click'],
      hideOnZoom: true,
      enableDomClipping: true,
      getHeight: () => {
        if (isNodeActive(node)) return expandedHeight;
        const hasResult = !!widgetNode.__linghuiRunState?.result;
        return hasResult ? COLLAPSED_THUMB_HEIGHT : COLLAPSED_BADGE_HEIGHT;
      },
      onDraw: () => {
        const active = isNodeActive(node);
        const signature = getPreviewSignature(widgetNode);
        const fullSig = `${active ? 'a' : 'c'}:${signature}`;

        const statusMeta = getRunStatusMeta(widgetNode);
        badge.className = `linghuiNodeStatusBadge ${statusMeta.className}`;
        badge.textContent = statusMeta.label;

        labelEl.style.display = active ? '' : 'none';
        hint.textContent = active ? '直接在节点上查看输出' : '';
        content.style.display = active ? '' : 'none';
        thumbContainer.style.display = active ? 'none' : '';
        root.classList.toggle('isCollapsed', !active);

        if (widgetNode.__linghuiPreviewSignature === fullSig) return;
        widgetNode.__linghuiPreviewSignature = fullSig;

        if (active) {
          renderPreviewContent(widgetNode, content);
        } else {
          renderCompactThumbnail(widgetNode, thumbContainer);
        }
      },
    },
  });
}

abstract class LinghuiBaseNode extends LGraphNode {
  onNodeCreated() {
    this.size = [280, 180];
    this.color = '#172026';
    this.bgcolor = '#0f1720';
    this.boxcolor = '#4ade80';
    this.clip_area = true;
    this.serialize_widgets = false;
  }

  protected applyMeta(type: LinghuiNodeType) {
    const meta = NODE_META[type];
    this.title = meta.title;
    this.bgcolor = meta.background;
    this.boxcolor = meta.accent;
  }

  protected validateConnection(
    ownSlot: INodeInputSlot | INodeOutputSlot,
    otherSlot: INodeInputSlot | INodeOutputSlot,
    otherNode: LGraphNode,
  ): boolean {
    const result = validateLinghuiConnection({
      outputNodeType: 'links' in ownSlot ? this.type : otherNode.type,
      outputSlot: ('links' in ownSlot ? ownSlot : otherSlot) as INodeOutputSlot,
      inputNodeType: 'link' in ownSlot ? this.type : otherNode.type,
      inputSlot: ('link' in ownSlot ? ownSlot : otherSlot) as INodeInputSlot,
    });

    if (!result.valid) {
      this.graph?.setDirtyCanvas(false, true);
      (this.graph as any)._linghuiConnectionError = result.message;
      (this.graph as any)._linghuiConnectionErrorAt = Date.now();
    }

    return result.valid;
  }

  protected attachTextarea(property: string, label: string, placeholder: string, height = 120) {
    this.addCustomWidget(createTextareaWidget({
      node: this,
      property,
      label,
      placeholder,
      height,
    }));
  }

  protected attachInput(property: string, label: string, placeholder: string, height?: number) {
    this.addCustomWidget(createTextInputWidget({
      node: this,
      property,
      label,
      placeholder,
      height,
    }));
  }

  protected attachReferenceUploader() {
    this.addCustomWidget(createReferenceWidget(this));
  }

  protected attachResultPreview(height?: number) {
    this.addCustomWidget(createResultPreviewWidget(this, height));
  }

  protected finalizeLayout(_minWidth = 280, _minHeight = 220) {
    const computed = this.computeSize();
    this.size[0] = Math.max(computed[0], 200);
    this.size[1] = Math.max(computed[1], 60);
  }

  override onConnectInput(
    inputIndex: number,
    _outputType: INodeOutputSlot['type'],
    outputSlot: INodeOutputSlot,
    outputNode: LGraphNode,
  ): boolean {
    const inputSlot = this.inputs?.[inputIndex];
    if (!inputSlot) return false;
    return this.validateConnection(inputSlot, outputSlot, outputNode);
  }

  override onConnectOutput(
    outputIndex: number,
    _inputType: INodeInputSlot['type'],
    inputSlot: INodeInputSlot,
    inputNode: LGraphNode,
  ): boolean {
    const outputSlot = this.outputs?.[outputIndex];
    if (!outputSlot) return false;
    return this.validateConnection(outputSlot, inputSlot, inputNode);
  }
}

class ReferenceImageNode extends LinghuiBaseNode {
  static title = NODE_META['linghui/reference-image'].title;
  static type = 'linghui/reference-image';
  static slotLayout: SlotLayout = {
    outputs: [{ name: 'image', type: 'image' }],
  };
  static propertyLayout: PropertyLayout = [
    { name: 'source', defaultValue: '', type: 'string', options: { label: '图片路径 / URL' } },
    { name: 'note', defaultValue: '', type: 'string', options: { label: '备注', ...MULTILINE_TEXT } },
  ];

  override onNodeCreated() {
    super.onNodeCreated();
    this.applyMeta('linghui/reference-image');
    this.attachReferenceUploader();
    this.attachTextarea('note', '参考备注', '记录来源、构图或风格说明', 96);
    this.attachResultPreview(172);
    this.finalizeLayout(300, 440);
  }

  override onDropFile(file: File): void {
    void applyReferenceFile(this, file);
  }
}

class PromptNode extends LinghuiBaseNode {
  static title = NODE_META['linghui/prompt'].title;
  static type = 'linghui/prompt';
  static slotLayout: SlotLayout = {
    outputs: [{ name: 'prompt', type: 'text' }],
  };
  static propertyLayout: PropertyLayout = [
    { name: 'prompt', defaultValue: '', type: 'string', options: { label: '内容', ...MULTILINE_TEXT } },
    { name: 'style', defaultValue: 'cinematic', type: 'string', options: { label: '风格标签' } },
  ];

  override onNodeCreated() {
    super.onNodeCreated();
    this.applyMeta('linghui/prompt');
    this.attachTextarea('prompt', '提示词', '在节点内直接输入主提示词', 140);
    this.attachInput('style', '风格标签', '例如 cinematic / anime');
    this.attachResultPreview(130);
    this.finalizeLayout(320, 380);
  }
}

class ImageToImageNode extends LinghuiBaseNode {
  static title = NODE_META['linghui/image-to-image'].title;
  static type = 'linghui/image-to-image';
  static slotLayout: SlotLayout = {
    inputs: [
      { name: 'image', type: 'image' },
      { name: 'prompt', type: 'text' },
    ],
    outputs: [{ name: 'image', type: 'image' }],
  };
  static propertyLayout: PropertyLayout = [
    { name: 'model', defaultValue: 'default-tti', type: 'string', options: { label: '模型' } },
    { name: 'strength', defaultValue: 0.65, type: 'number', options: { label: '重绘强度' } },
    { name: 'steps', defaultValue: 28, type: 'number', options: { label: '采样步数' } },
  ];

  override onNodeCreated() {
    super.onNodeCreated();
    this.applyMeta('linghui/image-to-image');
    this.attachResultPreview(204);
    this.finalizeLayout(300, 290);
  }
}

class ImageToVideoNode extends LinghuiBaseNode {
  static title = NODE_META['linghui/image-to-video'].title;
  static type = 'linghui/image-to-video';
  static slotLayout: SlotLayout = {
    inputs: [
      { name: 'image', type: 'image' },
      { name: 'prompt', type: 'text' },
    ],
    outputs: [{ name: 'video', type: 'video' }],
  };
  static propertyLayout: PropertyLayout = [
    { name: 'duration', defaultValue: 4, type: 'number', options: { label: '时长（秒）' } },
    { name: 'motion', defaultValue: 'medium', type: 'string', options: { label: '运动强度', values: ['low', 'medium', 'high'] } },
    { name: 'aspectRatio', defaultValue: '16:9', type: 'string', options: { label: '画幅', values: ['16:9', '9:16', '1:1'] } },
  ];

  override onNodeCreated() {
    super.onNodeCreated();
    this.applyMeta('linghui/image-to-video');
    this.attachResultPreview(216);
    this.finalizeLayout(300, 300);
  }
}

class FourGridNode extends LinghuiBaseNode {
  static title = NODE_META['linghui/four-grid'].title;
  static type = 'linghui/four-grid';
  static slotLayout: SlotLayout = {
    inputs: [
      { name: 'image', type: 'image' },
      { name: 'prompt', type: 'text' },
    ],
    outputs: [{ name: 'grid', type: 'image' }],
  };
  static propertyLayout: PropertyLayout = [
    { name: 'layout', defaultValue: '2x2', type: 'string', options: { label: '布局', values: ['2x2'] } },
    { name: 'styleMode', defaultValue: 'unified', type: 'string', options: { label: '风格', values: ['unified', 'varied'] } },
    { name: 'tilePrompt', defaultValue: '', type: 'string', options: { label: '局部提示词', ...MULTILINE_TEXT } },
  ];

  override onNodeCreated() {
    super.onNodeCreated();
    this.applyMeta('linghui/four-grid');
    this.attachTextarea('tilePrompt', '单图补充提示', '为宫格补充局部变化描述', 110);
    this.attachResultPreview(222);
    this.finalizeLayout(320, 404);
  }
}

class MultiAngleNode extends LinghuiBaseNode {
  static title = NODE_META['linghui/multi-angle'].title;
  static type = 'linghui/multi-angle';
  static slotLayout: SlotLayout = {
    inputs: [
      { name: 'image', type: 'image' },
      { name: 'prompt', type: 'text' },
    ],
    outputs: [{ name: 'images', type: 'images' }],
  };
  static propertyLayout: PropertyLayout = [
    {
      name: 'angles',
      defaultValue: 'front,left,right,top,back',
      type: 'string',
      options: { label: '预设角度', ...MULTILINE_TEXT },
    },
    { name: 'consistency', defaultValue: true, type: 'boolean', options: { label: '保持主体一致' } },
  ];

  override onNodeCreated() {
    super.onNodeCreated();
    this.applyMeta('linghui/multi-angle');
    this.attachTextarea('angles', '角度列表', 'front\nleft\nright\ntop\nback', 118);
    this.attachResultPreview(212);
    this.finalizeLayout(320, 398);
  }
}

class StoryboardShotNode extends LinghuiBaseNode {
  static title = NODE_META['linghui/storyboard-shot'].title;
  static type = 'linghui/storyboard-shot';
  static slotLayout: SlotLayout = {
    inputs: [
      { name: 'image', type: 'image' },
      { name: 'prompt', type: 'text' },
    ],
    outputs: [{ name: 'shot', type: 'shot' }],
  };
  static propertyLayout: PropertyLayout = [
    { name: 'description', defaultValue: '', type: 'string', options: { label: '画面描述', ...MULTILINE_TEXT } },
    { name: 'duration', defaultValue: 3, type: 'number', options: { label: '时长（秒）' } },
  ];

  override onNodeCreated() {
    super.onNodeCreated();
    this.applyMeta('linghui/storyboard-shot');
    this.attachTextarea('description', '分镜描述', '直接描述画面、动作与节奏', 132);
    this.attachResultPreview(184);
    this.finalizeLayout(320, 386);
  }
}

class StoryboardGroupNode extends LinghuiBaseNode {
  static title = NODE_META['linghui/storyboard-group'].title;
  static type = 'linghui/storyboard-group';
  static slotLayout: SlotLayout = {
    inputs: [{ name: '分镜 1', type: 'shot' }],
    outputs: [{ name: 'sequence', type: 'storyboard' }],
  };
  static propertyLayout: PropertyLayout = [
    { name: 'title', defaultValue: '场景序列', type: 'string', options: { label: '分镜组名称' } },
    { name: 'notes', defaultValue: '', type: 'string', options: { label: '备注', ...MULTILINE_TEXT } },
  ];

  override onNodeCreated() {
    super.onNodeCreated();
    this.applyMeta('linghui/storyboard-group');
    ensureTrailingStoryboardInput(this);
    relabelStoryboardInputs(this);
    this.attachInput('title', '分镜组名称', '给这一组镜头命名');
    this.attachTextarea('notes', '备注', '写下镜头组说明或导演提示', 96);
    this.attachResultPreview(188);
    this.finalizeLayout(320, 380);
  }

  override onBeforeConnectInput(_inputIndex: number): number {
    ensureTrailingStoryboardInput(this);
    const firstEmptyIndex = this.inputs?.findIndex(input => input.type === 'shot' && input.link == null) ?? -1;
    return firstEmptyIndex >= 0 ? firstEmptyIndex : 0;
  }

  override onConnectionsChange(): void {
    trimStoryboardInputs(this);
    ensureTrailingStoryboardInput(this);
    relabelStoryboardInputs(this);
  }
}

const NODE_DEFINITIONS: Array<Omit<LGraphNodeConstructor, 'name'> & { class: typeof LGraphNode }> = [
  ...Object.values(NODE_META).map(meta => {
    const classes: Record<LinghuiNodeType, typeof LGraphNode> = {
      'linghui/reference-image': ReferenceImageNode,
      'linghui/prompt': PromptNode,
      'linghui/image-to-image': ImageToImageNode,
      'linghui/image-to-video': ImageToVideoNode,
      'linghui/four-grid': FourGridNode,
      'linghui/multi-angle': MultiAngleNode,
      'linghui/storyboard-shot': StoryboardShotNode,
      'linghui/storyboard-group': StoryboardGroupNode,
    };

    return {
      type: meta.type,
      class: classes[meta.type],
      title: meta.title,
      desc: meta.desc,
      category: meta.category,
    };
  }),
];

export const LINGHUI_NODE_CATALOG: LinghuiNodeCatalogItem[] = Object.values(NODE_META).map(meta => ({
  type: meta.type,
  label: meta.catalogLabel,
  description: meta.catalogDescription,
  category: meta.catalogCategory,
  accent: meta.accent,
}));

let nodesRegistered = false;

export function registerLinghuiNodes(): void {
  if (nodesRegistered) return;

  for (const config of NODE_DEFINITIONS) {
    LiteGraph.registerNodeType(config);
  }

  nodesRegistered = true;
}

export function createLinghuiGraphNode(type: LinghuiNodeType) {
  registerLinghuiNodes();
  return LiteGraph.createNode(type);
}
