/**
 * 模型预设管理
 * 通过 configBridge 访问后端
 */
import { configBridge } from '../../services/configBridge';

export interface ModelPreset {
  name: string;
  type: 'llm' | 'tti' | 'tts' | 'itv';
  config: any;
}

export async function loadPresets(): Promise<ModelPreset[]> {
  try {
    const remote = await configBridge.get<ModelPreset[]>('model-presets');
    if (remote && Array.isArray(remote)) return remote;
  } catch (err) {
    console.error('[loadPresets] configBridge error:', err);
  }
  return [];
}

async function saveAll(presets: ModelPreset[]): Promise<void> {
  await configBridge.set('model-presets', presets);
}

export async function savePreset(preset: ModelPreset): Promise<void> {
  const presets = await loadPresets();
  const filtered = presets.filter((p) => p.name !== preset.name);
  filtered.push(preset);
  await saveAll(filtered);
}

export async function deletePreset(presetName: string): Promise<void> {
  const presets = await loadPresets();
  const filtered = presets.filter((p) => p.name !== presetName);
  await saveAll(filtered);
}
