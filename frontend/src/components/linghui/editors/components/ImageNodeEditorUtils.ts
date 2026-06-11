import type {
  LinghuiImageFocusRegion,
  LinghuiImageMarkPoint,
  LinghuiImageNodeMode,
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
  LinghuiRelightDirection,
} from '../../../../types/linghui';
import {
  DEFAULT_LINGHUI_IMAGE_FOCUS_REGION,
  normalizeLinghuiImageFocusRegion,
} from '../../../../types/linghui';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import type { LibTVMultiAnglePreset } from './ImageNodeEditorAngleRelightPanels';

export interface ProviderOption {
  value: string;
  label: string;
  channelLabel?: string;
  modelLabel?: string;
}

export const GENERIC_TOOL_KEYS = ['erase', 'remove-bg', 'crop', 'mockup', 'edit-elements', 'edit-texts'] as const;

export type GenericToolKey = typeof GENERIC_TOOL_KEYS[number];

export function isGenericTool(key: LinghuiImageToolKey | null): key is GenericToolKey {
  return !!key && (GENERIC_TOOL_KEYS as readonly string[]).includes(key);
}

export function getPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

export function resolveImageNodeMode(props: LinghuiImageNodeProperties): LinghuiImageNodeMode {
  if (props.mode === 'import' || props.mode === 'generate') {
    return props.mode;
  }
  return String(props.source ?? '').trim() ? 'import' : 'generate';
}

export function mergePromptSnippet(currentPrompt: string, snippet: string): string {
  const normalizedCurrent = currentPrompt.trim();
  const normalizedSnippet = snippet.trim();
  if (!normalizedSnippet) return normalizedCurrent;
  if (normalizedCurrent.includes(normalizedSnippet)) return normalizedCurrent;
  return normalizedCurrent ? `${normalizedCurrent}\n${normalizedSnippet}` : normalizedSnippet;
}

export function buildFocusRegionPatch(
  previous: LinghuiImageFocusRegion | null,
  patch: Partial<LinghuiImageFocusRegion>,
  source: string,
): LinghuiImageFocusRegion {
  return normalizeLinghuiImageFocusRegion({
    ...DEFAULT_LINGHUI_IMAGE_FOCUS_REGION,
    ...(previous ?? {}),
    ...patch,
    enabled: patch.enabled ?? previous?.enabled ?? true,
    source: source || previous?.source,
    updatedAt: Date.now(),
  }) ?? {
    ...DEFAULT_LINGHUI_IMAGE_FOCUS_REGION,
    enabled: true,
    source,
    updatedAt: Date.now(),
  };
}

export const LIBTV_MULTI_ANGLE_PRESETS: LibTVMultiAnglePreset[] = [
  { key: 'custom', label: '自定义', values: { rotation: 0, tilt: 0, scale: 33 }, prompt: '' },
  { key: 'fisheye', label: '鱼眼视角', values: { rotation: 0, tilt: 0, scale: 0 }, isWideAngle: true, prompt: '鱼眼广角镜头，画面带有强烈的桶形畸变与边缘弯曲，呈现广视野效果' },
  { key: 'tilted', label: '倾斜视角', values: { rotation: 30, tilt: 25, scale: 33 }, prompt: '荷兰角倾斜构图，带有 25° 上仰与 30° 侧偏，营造戏剧张力' },
  { key: 'front-down', label: '正面俯拍', values: { rotation: 0, tilt: 45, scale: 33 }, prompt: '正面俯视镜头，相机略高于主体俯拍 45°' },
  { key: 'front-up', label: '正面仰拍', values: { rotation: 0, tilt: -35, scale: 33 }, prompt: '正面仰视镜头，相机略低于主体仰拍 35°' },
  { key: 'panoramic-down', label: '全景俯拍', values: { rotation: 0, tilt: 75, scale: 17 }, prompt: '高空全景俯拍，相机几乎垂直向下覆盖全景' },
  { key: 'back', label: '背面视角', values: { rotation: 180, tilt: 0, scale: 33 }, prompt: '主体背面视角，相机位于正后方平视' },
];

export const LIBTV_RELIGHT_MAIN_DIRECTIONS: Array<{ value: LinghuiRelightDirection; label: string }> = [
  { value: 'left', label: '左侧' },
  { value: 'top', label: '顶部' },
  { value: 'right', label: '右侧' },
  { value: 'front', label: '前方' },
  { value: 'bottom', label: '底部' },
  { value: 'back', label: '后方' },
];

export const LIBTV_RELIGHT_BACK_DIRECTIONS: ReadonlySet<LinghuiRelightDirection> = new Set([
  'back-left',
  'back',
  'back-right',
  'high-back-left',
  'high-back',
  'high-back-right',
  'low-back-left',
  'low-back',
  'low-back-right',
]);

export const LIBTV_RELIGHT_BRIGHTNESS_STEPS = [10, 25, 50, 75, 100] as const;

export function createLinghuiImageMarkPoint(params: {
  x: number;
  y: number;
  source: string;
  index: number;
}): LinghuiImageMarkPoint {
  const pointIndex = params.index + 1;
  return {
    id: `mark-${Date.now().toString(36)}-${pointIndex}`,
    enabled: true,
    x: Math.max(0, Math.min(1, params.x)),
    y: Math.max(0, Math.min(1, params.y)),
    source: params.source,
    label: `标记 ${pointIndex}`,
    prompt: `请重点关注标记 ${pointIndex} 附近的主体、动作或细节，并保持画面其它区域稳定。`,
    updatedAt: Date.now(),
  };
}
