import {
  LINGHUI_MULTI_ANGLE_AZIMUTHS,
  LINGHUI_MULTI_ANGLE_DISTANCES,
  LINGHUI_MULTI_ANGLE_ELEVATIONS,
  normalizeLinghuiMultiAngleConfig,
  type LinghuiMultiAngleConfig,
} from '../../types/linghui';

export interface MultiAnglePromptCompileResult {
  compiledPrompt: string;
  anglePrompt: string;
  summary: string;
  tokens: {
    azimuth: string;
    elevation: string;
    distance: string;
  };
}

function joinPromptLines(lines: string[]): string {
  return lines
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

export function compileLinghuiMultiAnglePrompt(params: {
  prompt: string;
  config: Partial<LinghuiMultiAngleConfig> | null | undefined;
}): MultiAnglePromptCompileResult {
  const config = normalizeLinghuiMultiAngleConfig(params.config);
  const azimuth = LINGHUI_MULTI_ANGLE_AZIMUTHS.find(item => item.value === config.azimuth) ?? LINGHUI_MULTI_ANGLE_AZIMUTHS[0];
  const elevation = LINGHUI_MULTI_ANGLE_ELEVATIONS.find(item => item.value === config.elevation) ?? LINGHUI_MULTI_ANGLE_ELEVATIONS[1];
  const distance = LINGHUI_MULTI_ANGLE_DISTANCES.find(item => item.value === config.distance) ?? LINGHUI_MULTI_ANGLE_DISTANCES[1];

  const anglePrompt = config.promptProtocol === 'descriptor-only-v1'
    ? `${azimuth.prompt} ${elevation.prompt} ${distance.prompt}`
    : `<sks> ${azimuth.prompt} ${elevation.prompt} ${distance.prompt}`;
  const customPrompt = config.promptEnabled ? config.prompt.trim() : '';
  const compiledAnglePrompt = joinPromptLines([
    anglePrompt,
    config.isWideAngle ? 'wide-angle lens' : '',
    customPrompt,
  ]);

  return {
    compiledPrompt: joinPromptLines([params.prompt, compiledAnglePrompt]),
    anglePrompt: compiledAnglePrompt,
    summary: `${azimuth.label} / ${elevation.label} / ${distance.label}`,
    tokens: {
      azimuth: azimuth.prompt,
      elevation: elevation.prompt,
      distance: distance.prompt,
    },
  };
}
