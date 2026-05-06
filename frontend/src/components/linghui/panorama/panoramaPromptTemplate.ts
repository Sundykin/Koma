/**
 * AR720 全景环境板提示词模板（auto / indoor / outdoor 三档）。
 *
 * 每档模板都形如「长指令 + 【用户自定义提示词】占位 + 通用质量尾巴」，
 * 渲染时会把 `【用户自定义提示词】` 占位符替换成用户在节点里实际输入的内容；
 * 占位符本身不会出现在最终发给 TTI 的 prompt 里。
 *
 * 三档差异：
 *  - auto：通用全景，不强制室内/室外，适合不确定时
 *  - indoor：强制室内封闭空间（房间、走廊、殿宇内部……）
 *  - outdoor：强制开放外景（街景、地形、自然环境……）
 *
 * 内容由 `template_/{自动|室内|室外}全景.md` 同步过来；不要在文中加风格 / 主体描述
 *（这些由用户自定义提示词承担）。
 */

export type PanoramaTemplateKind = 'auto' | 'indoor' | 'outdoor';

export const PANORAMA_USER_PROMPT_PLACEHOLDER = '【用户自定义提示词】';

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

/** 取已确定档位的模板原文（含占位符），主要用于调试/预览。 */
export function getPanoramaTemplateBody(kind: PanoramaTemplateKind): string {
  return PANORAMA_TEMPLATE_BODIES[kind] ?? PANORAMA_TEMPLATE_BODIES.auto;
}

/**
 * 把用户输入与指定档位的全景模板拼装成最终发给 TTI 的 prompt。
 *
 * 关键行为：
 *  1. 用 `userPrompt` 替换模板里的 `【用户自定义提示词】` 占位符
 *  2. 若 `userPrompt` 为空（trim 后为空串），则把占位符整段移除（含两侧多余空格），
 *     避免最终 prompt 里出现「【用户自定义提示词】」这种字面量
 */
export function wrapWithPanoramaTemplate(userPrompt: string, kind: PanoramaTemplateKind = 'auto'): string {
  const trimmed = String(userPrompt || '').trim();
  const body = getPanoramaTemplateBody(kind);

  if (!trimmed) {
    // 占位符 + 两侧紧邻的空白塌缩：` 【...】 ` → ` `，避免遗留两个连续空格
    return body.replace(new RegExp(`\\s*${PANORAMA_USER_PROMPT_PLACEHOLDER}\\s*`, 'g'), ' ').replace(/\s+/g, ' ').trim();
  }

  return body.split(PANORAMA_USER_PROMPT_PLACEHOLDER).join(trimmed);
}

/** 兼容旧引用（可能仍有人 import 这个常量）。其他位置应改用 wrapWithPanoramaTemplate。 */
export const PANORAMA_SYSTEM_PROMPT = `${COMMON_PANORAMA_BASE} ${AUTO_SPECIALIZATION}`;
