/**
 * 全景提示词编译器。
 *
 * 设计原则（参考 docs/linghui-panorama-and-3d-director-workbench-plan.md）：
 *  1. 不再用一段超长统一模板覆盖所有情况，而是按 projectionMode 拆出三档投影契约：
 *      - ar720-band：21:9 / 16:9 环境带，强调左右无缝、淡极区
 *      - equirectangular-2to1：真 2:1 经纬展开，强约束极区
 *      - flat-wide：宽幅平面，不做环绕承诺
 *  2. panoramaTemplate（auto / indoor / outdoor）作为「场景子类型」，不再是投影模式本身
 *  3. 编译顺序：projection contract + scene specialization + user prompt + safety + quality tail
 *
 * 旧 API（wrapWithPanoramaTemplate / PANORAMA_USER_PROMPT_PLACEHOLDER）保留以向后兼容，
 * 内部全部走新的 compilePanoramaPrompt。
 */

import type { LinghuiPanoramaProjectionMode } from '../../../types/linghui';

export type PanoramaTemplateKind = 'auto' | 'indoor' | 'outdoor';

export const PANORAMA_USER_PROMPT_PLACEHOLDER = '【用户自定义提示词】';

/**
 * LibTV 反编译出的全景 slash 默认值：
 * template_/libtv/0c7etgphqc14l.js → /tmp/libtv-panorama-0c7.beautified.js
 */
export const LIBTV_PANORAMA_WITH_PROMPT_SCENE = '720_panoramic_with_prompt';
export const LIBTV_PANORAMA_SLASH_SCENE = '720_panoramic';
export const LIBTV_PANORAMA_SLASH_LABEL = '720°全景图';
export const LIBTV_PANORAMA_SUBMIT_MODEL_KEY = 'lib-image-2';
export const LIBTV_PANORAMA_SLASH_QUALITY = 'medium';
export const LIBTV_PANORAMA_MODEL_KEYS = ['nebula-2-flash', 'lib-image-2'] as const;

export function getLibTVPanoramaRatioForModel(modelKey: unknown): '2:1' | '21:9' {
  return modelKey === LIBTV_PANORAMA_SUBMIT_MODEL_KEY ? '2:1' : '21:9';
}

const COMMON_PANORAMA_BASE = `Generate a stable ultra-wide panoramic environment plate for AR720 preview and surround-view scene planning. The image must depict one single continuous immersive environment, not a collage, not multiple panels, not multiple frames, and not multiple disconnected scenes. Compose it as a wraparound panoramic world with believable 360-degree continuity, even if the delivery format is a wide image instead of a true equirectangular output. Keep the horizon level and centered in the image, keep vertical structures calm and readable, and keep the overall camera height and world scale stable across the full width. The left and right edges are seam-critical panoramic boundaries and must connect naturally, without duplicated objects, abrupt geometry changes, broken perspective, mirrored artifacts, or lighting mismatch. Do not place unique focal subjects, faces, vehicles, dominant props, large signs, or critical architectural features directly across the far left and far right edges. Prioritize panoramic continuity over dramatic composition. Avoid poster-like hero framing, dutch angles, aggressive foreground close-ups, or exaggerated one-point perspective. The most important readable scene information should stay in the middle horizontal band. The upper and lower bands must be broader, calmer, and less dependent on sharp perspective detail. Treat the zenith and nadir as distortion-sensitive pole zones. They must remain simple, broad, continuous, and structurally safe for panorama remapping. Do not place important readable objects, faces, text, doors, windows, furniture silhouettes, vehicles, or critical structure joints at the extreme top or extreme bottom of the frame. Indoor ceilings should stay smooth and believable. Outdoor sky regions should stay continuous and clean. Ground and floor regions should stay coherent and should not melt, fold, spiral, or break into warped texture noise. Avoid strong pole distortion, tunnel-like stretching, radial twisting, collapsed ceilings, broken roofs, warped floors, or compositions that force major structures to converge into the top or bottom extremes. Use broad continuous shapes near the poles and avoid tiny repetitive details, dense decorations, hanging lamps, thin beams, railings, tiled micro-patterns, dense grass texture, or clutter that becomes unstable after panorama remapping. Keep the whole image anchored to one believable environment layout with readable foreground, midground, background, horizon logic, circulation paths, and directional landmarks, so the viewer can understand orientation inside the same scene. The composition must support surround-view reading, reverse-shot planning, and multi-direction camera extraction, instead of behaving like a single front-facing key art shot. Maintain one consistent art style, one consistent lighting setup, one consistent perspective logic, one consistent atmosphere, and one stable scene identity across the full panoramic strip. Avoid empty filler zones, disconnected scene fragments, dead texture-only areas, or visually meaningless side regions; the full width should remain readable and production-usable. Prefer softer edge transitions and continuation-friendly structures, with no hard narrative cut between the two horizontal ends. For indoor scenes, include believable doors, corridors, passages, openings, or exits so the space feels architecturally complete and traversable. For outdoor scenes, keep terrain layers, skyline logic, depth separation, and pathways coherent so the world feels continuous and orientation remains understandable. For indoor scenes, avoid large ceiling fixtures directly overhead and avoid floor patterns that become obviously stretched near the bottom edge. For outdoor scenes, keep sky, clouds, canopy, and ground transitions broad and continuous instead of noisy and fragmented. Do not include collage layouts, storyboard grids, comic panels, fisheye distortion, extreme wide-angle gimmicks, or strong shallow depth of field blur. Do not allow local style drift, local lighting drift, disconnected mini-scenes, or abrupt subject changes between different parts of the image. Use realistic environmental storytelling and high production quality, but keep the image usable as a panoramic environment plate rather than a single-shot poster.`;

const COMMON_PANORAMA_TAIL = `masterpiece, best quality, ultra detailed, panoramic environment plate, seam-safe edges, wraparound composition, centered horizon, stable verticals, coherent zenith and nadir, consistent exposure, physically based lighting, global illumination, realistic atmosphere, clean spatial composition`;

const AUTO_SPECIALIZATION = `Keep the panoramic world spatially coherent and readable in all directions, with stable horizon logic, stable camera height, and one believable continuous environment layout. Keep the zenith and nadir simple and calm, and avoid pushing important structures or fine repetitive details into the top or bottom pole-sensitive regions. Keep the environment spatially coherent. Enclosed scenes should include believable doors, corridors, passages, or exits; open scenes should maintain clear horizon and path logic.`;

const INDOOR_SPECIALIZATION = `This is an enclosed indoor panoramic environment. The space must feel architecturally complete, traversable, and enclosed within one coherent structure. Keep ceilings broad and simple near the zenith, avoid dense overhead fixtures, and avoid ceiling geometry that collapses, pinches, or twists toward the top pole. Keep floor and ground treatment continuous and readable near the nadir, avoiding stretched tiles, warped planks, broken perspective grids, or noisy micro-patterns near the bottom edge. Use stable room-scale perspective, readable wall-to-floor transitions, and believable openings such as doors, corridors, arches, passages, or exits. Avoid pushing furniture silhouettes, windows, door frames, columns, lamps, railings, or decorative trim into the extreme top or bottom bands where panorama remapping becomes unstable. This is an enclosed indoor environment. Keep the space coherent and include believable doors, corridors, passages, or exits.`;

const OUTDOOR_SPECIALIZATION = `This is an open outdoor panoramic environment. The world must feel continuous, navigable, and geographically coherent across the full width. Keep the skyline, terrain layering, and path logic stable and readable, with a clean horizon and believable depth separation across the full panoramic span. Keep the sky broad and continuous near the zenith, and keep the ground broad and coherent near the nadir, avoiding fragmented clouds, broken canopy shapes, melting terrain, or noisy vegetation texture at the poles. Use clear pathways, terrain transitions, street logic, or environmental landmarks so orientation remains understandable in all directions. Avoid placing trees, poles, signs, vehicles, facades, fences, or other thin high-contrast structures at the extreme top or bottom bands where they are likely to warp after panorama remapping. This is an open outdoor environment. Keep the horizon, terrain layers, and pathways coherent and immersive.`;

/**
 * 模板表：长指令、用户提示词占位、通用尾巴用单空格连接（与原 .md 模板保持一致）。
 * 占位符的含义是「这里插入用户自定义提示词」——渲染时会被实际输入替换，
 * 用户输入为空时会整段移除（连同两边的空格），不让占位符落到最终 prompt 里。
 */
const PANORAMA_TEMPLATE_BODIES: Record<PanoramaTemplateKind, string> = {
  auto: `${COMMON_PANORAMA_BASE} ${AUTO_SPECIALIZATION} ${PANORAMA_USER_PROMPT_PLACEHOLDER} ${COMMON_PANORAMA_TAIL}`,
  indoor: `${COMMON_PANORAMA_BASE} ${INDOOR_SPECIALIZATION} ${PANORAMA_USER_PROMPT_PLACEHOLDER} ${COMMON_PANORAMA_TAIL}`,
  outdoor: `${COMMON_PANORAMA_BASE} ${OUTDOOR_SPECIALIZATION} ${PANORAMA_USER_PROMPT_PLACEHOLDER} ${COMMON_PANORAMA_TAIL}`,
};

export const PANORAMA_TEMPLATE_OPTIONS: Array<{ value: PanoramaTemplateKind; label: string; hint: string }> = [
  { value: 'auto', label: '自动', hint: '通用，不强制室内/外' },
  { value: 'indoor', label: '室内', hint: '封闭空间：房间 / 走廊 / 殿堂' },
  { value: 'outdoor', label: '室外', hint: '开放外景：街景 / 自然 / 地形' },
];

/* ---------- 投影契约 prompt 片段 ---------- */

const AR720_BAND_CONTRACT = `Generate one continuous wraparound horizontal panoramic environment band suitable for AR720-style surround preview. Treat the image as an ultra-wide environment plate, not a true equirectangular sphere. Keep the horizon centered, keep verticals calm, keep camera height stable across the full width. The left and right edges are seam-critical wraparound boundaries: they must connect naturally with no duplicated objects, mirrored artifacts, broken perspective, or lighting mismatch. Do not place dominant subjects, faces, vehicles, signs, or critical structure at the extreme left/right. Treat the upper and lower bands as distortion-sensitive zones: keep them broad, calm, and free from important readable detail; avoid dense decorations, thin beams, hanging fixtures, or tiled micro-patterns near the top/bottom. Do not promise a true 360x180 sphere, do not write equirectangular, do not produce extreme top-down or bottom-up convergence.`;

const EQUIRECTANGULAR_2TO1_CONTRACT = `Generate a true 2:1 equirectangular panorama covering full 360 degrees horizontally and full 180 degrees vertically. The output must be a valid equirectangular projection plate where the left and right edges seamlessly wrap into a continuous sphere, the top edge represents the zenith pole and the bottom edge represents the nadir pole. Keep the horizon centered along the vertical midline of the image. Treat the zenith and nadir as pole-sensitive regions: keep them simple, broad, and structurally safe for sphere remapping; do not place readable subjects, faces, text, vehicles, or critical structure near the extreme top or bottom rows; ground and ceiling should remain coherent and should not melt, fold, spiral, or break into warped texture noise. The composition must support full surround viewing in any direction, not poster-style hero framing.`;

const FLAT_WIDE_CONTRACT = `Generate a single wide cinematic environment plate. Do not promise 360-degree wraparound. Do not promise equirectangular projection. Keep camera position stable and perspective consistent across the full width. Use believable foreground / midground / background depth and a coherent horizon line, but the image is read as one wide flat scene rather than a panoramic sphere.`;

/* ---------- 场景子类型 prompt 片段（精简版，给三种投影契约共用） ---------- */

const AUTO_SCENE = `Compose one believable continuous environment with stable horizon logic, stable camera height, and one coherent layout. Indoor enclosed scenes should include doors, corridors, passages or exits; outdoor open scenes should keep horizon, terrain layers and pathways coherent.`;

const INDOOR_SCENE = `This is an enclosed indoor environment. The space must feel architecturally complete and traversable. Use stable room-scale perspective, readable wall-to-floor transitions, and believable openings such as doors, corridors, arches, passages or exits. Keep ceilings broad and simple, avoid dense overhead fixtures. Keep floors coherent and avoid stretched tiles, warped planks or noisy micro-patterns near the lower edge.`;

const OUTDOOR_SCENE = `This is an open outdoor environment. The world must feel continuous and geographically coherent. Keep the skyline, terrain layering and pathways stable and readable with believable depth separation. Keep the sky broad and continuous in the upper region, the ground broad and coherent in the lower region. Avoid placing trees, poles, signs or thin high-contrast structures at the extreme top/bottom where they warp under panorama remapping.`;

/* ---------- 通用安全规则 + 质量尾巴 ---------- */

const SEAM_SAFETY = `Edge policy: keep the left and right boundaries naturally continuous, no hard cut between scene halves, no important subjects parked across the extreme edges, no visually different mini-scenes glued together.`;

const ZENITH_NADIR_SAFETY = `Pole policy: keep top and bottom regions simple and broad, no important faces / text / signs / critical structures near the extreme top or extreme bottom; avoid radial twisting, tunnel-like stretching, collapsed ceilings, melted floors, or spiral artifacts in the pole zones.`;

const COMMON_QUALITY_TAIL = `masterpiece, best quality, ultra detailed, panoramic environment plate, seam-safe edges, wraparound composition, centered horizon, stable verticals, coherent zenith and nadir, consistent exposure, physically based lighting, global illumination, realistic atmosphere, clean spatial composition`;

/* ---------- 公共 API ---------- */

export interface CompilePanoramaPromptOptions {
  /** 投影契约：决定整体 prompt 风格。缺省 ar720-band。 */
  projectionMode?: LinghuiPanoramaProjectionMode;
  /** 场景子类型：auto / indoor / outdoor。缺省 auto。 */
  templateKind?: PanoramaTemplateKind;
}

function resolveProjectionContract(mode: LinghuiPanoramaProjectionMode): string {
  if (mode === 'equirectangular-2to1') return EQUIRECTANGULAR_2TO1_CONTRACT;
  if (mode === 'flat-wide') return FLAT_WIDE_CONTRACT;
  return AR720_BAND_CONTRACT;
}

function resolveSceneSpecialization(kind: PanoramaTemplateKind): string {
  if (kind === 'indoor') return INDOOR_SCENE;
  if (kind === 'outdoor') return OUTDOOR_SCENE;
  return AUTO_SCENE;
}

/**
 * 新版编译入口：按 projection contract + scene + user prompt + safety + quality tail 拼装。
 *
 *  - userPrompt 为空时，整段 user prompt 占位会被跳过
 *  - flat-wide 模式不输出 zenith/nadir / seam 安全规则（它根本不是球面）
 */
export function compilePanoramaPrompt(
  userPrompt: string,
  options: CompilePanoramaPromptOptions = {},
): string {
  const projectionMode = options.projectionMode ?? 'ar720-band';
  const templateKind = options.templateKind ?? 'auto';
  const userTail = String(userPrompt || '').trim();
  const segments: string[] = [resolveProjectionContract(projectionMode), resolveSceneSpecialization(templateKind)];
  if (userTail) segments.push(userTail);
  if (projectionMode !== 'flat-wide') {
    segments.push(SEAM_SAFETY);
    segments.push(ZENITH_NADIR_SAFETY);
  }
  segments.push(COMMON_QUALITY_TAIL);
  return segments
    .map(s => s.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 取已确定档位的模板原文（用旧 auto/indoor/outdoor 模板，主要用于调试/预览）。 */
export function getPanoramaTemplateBody(kind: PanoramaTemplateKind): string {
  return PANORAMA_TEMPLATE_BODIES[kind] ?? PANORAMA_TEMPLATE_BODIES.auto;
}

/**
 * 旧 API：把用户输入与指定档位拼装成最终 prompt。
 *
 * 现在内部走 compilePanoramaPrompt（projection contract = ar720-band），
 * 行为跟旧版整体一致但更紧凑、按模式更精确。保留接口避免下游同步改动。
 */
export function wrapWithPanoramaTemplate(userPrompt: string, kind: PanoramaTemplateKind = 'auto'): string {
  return compilePanoramaPrompt(userPrompt, { templateKind: kind, projectionMode: 'ar720-band' });
}

/** 兼容旧引用。新代码请使用 compilePanoramaPrompt({ projectionMode, templateKind })。 */
export const PANORAMA_SYSTEM_PROMPT = `${AR720_BAND_CONTRACT} ${AUTO_SCENE}`;
