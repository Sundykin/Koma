import {
  buildLinghuiImageCinematicPromptFragment,
  normalizeLinghuiImageCinematicConfig,
  type LinghuiImageFocusRegion,
  type LinghuiImageMarkPoint,
} from '../../../../types/linghui';

function buildImageFocusInstruction(region: LinghuiImageFocusRegion): string {
  const left = Math.round(region.x * 100);
  const top = Math.round(region.y * 100);
  const right = Math.round((region.x + region.width) * 100);
  const bottom = Math.round((region.y + region.height) * 100);
  const label = region.label ? ` (${region.label})` : '';

  return [
    `LibTV-style focus region${label}: prioritize local completion and repaint inside the marked box.`,
    `Focus box normalized coordinates: left ${left}%, top ${top}%, right ${right}%, bottom ${bottom}%.`,
    'Preserve the original image outside this box as much as possible: keep composition, identity, pose, lighting direction, camera angle, and style stable.',
    'Only repair, refine, or regenerate details inside the focus box unless the user prompt explicitly asks for a larger change.',
    'Avoid adding extra subjects, duplicate faces, collage panels, borders, captions, or UI marks.',
  ].join('\n');
}

export function appendImageFocusInstruction(
  prompt: string,
  region: LinghuiImageFocusRegion | null,
): string {
  if (!region?.enabled) {
    return prompt;
  }

  const instruction = buildImageFocusInstruction(region);
  const normalizedPrompt = String(prompt).trim();
  if (!normalizedPrompt) {
    return instruction;
  }
  if (normalizedPrompt.includes('LibTV-style focus region')) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt}\n\n${instruction}`;
}

function buildImageMarkInstruction(points: LinghuiImageMarkPoint[]): string {
  const enabledPoints = points.filter(point => point.enabled);
  if (!enabledPoints.length) {
    return '';
  }

  return [
    'LibTV-style mark points: use these image coordinates as explicit visual anchors.',
    ...enabledPoints.map((point, index) => {
      const x = Math.round(point.x * 100);
      const y = Math.round(point.y * 100);
      const label = point.label || `mark ${index + 1}`;
      const prompt = point.prompt ? ` ${point.prompt}` : '';
      return `Mark ${index + 1} (${label}) at x ${x}%, y ${y}%.${prompt}`;
    }),
    'Preserve the relationship between marked subjects/details and the surrounding scene; do not render visible UI pins, numbers, captions, or marker graphics.',
  ].join('\n');
}

export function appendImageMarkInstruction(prompt: string, points: LinghuiImageMarkPoint[]): string {
  const instruction = buildImageMarkInstruction(points);
  if (!instruction) {
    return prompt;
  }

  const normalizedPrompt = String(prompt).trim();
  if (!normalizedPrompt) {
    return instruction;
  }
  if (normalizedPrompt.includes('LibTV-style mark points')) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt}\n\n${instruction}`;
}

export function appendImageCinematicInstruction(
  prompt: string,
  cinematic: ReturnType<typeof normalizeLinghuiImageCinematicConfig>,
): string {
  const fragment = buildLinghuiImageCinematicPromptFragment(cinematic);
  if (!fragment) {
    return prompt;
  }
  const normalizedPrompt = String(prompt).trim();
  // 标签前缀让模型识别这是导演级控制语句，避免被当成主体描述。
  const block = `Cinematic directive: ${fragment}.`;
  if (!normalizedPrompt) {
    return block;
  }
  if (normalizedPrompt.includes('Cinematic directive:')) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt}\n\n${block}`;
}
