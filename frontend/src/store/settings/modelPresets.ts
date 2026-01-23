/**
 * 模型预设管理
 */
import { electronService } from '../../services/electronService';
import { getGlobalPath } from './core';

export interface ModelPreset {
  name: string;
  type: 'llm' | 'tti' | 'tts' | 'itv';
  config: any;
}

export async function loadPresets(): Promise<ModelPreset[]> {
  if (!electronService.isElectron()) {
    try {
      const data = localStorage.getItem('koma_presets');
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // ignore
    }
    return [];
  }

  try {
    const presetsDir = await getGlobalPath('model-presets');
    const exists = await electronService.fs.exists(presetsDir);
    if (!exists) {
      return [];
    }

    const files = await electronService.fs.readdir(presetsDir);
    const presets: ModelPreset[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = await electronService.fs.readFile(`${presetsDir}/${file}`);
        presets.push(JSON.parse(data));
      }
    }

    return presets;
  } catch {
    return [];
  }
}

export async function savePreset(preset: ModelPreset): Promise<void> {
  if (!electronService.isElectron()) {
    const presets = await loadPresets();
    const filtered = presets.filter((p) => p.name !== preset.name);
    filtered.push(preset);
    localStorage.setItem('koma_presets', JSON.stringify(filtered));
    return;
  }

  const presetsDir = await getGlobalPath('model-presets');
  await electronService.fs.mkdir(presetsDir);
  const path = `${presetsDir}/${preset.name}.json`;
  await electronService.fs.writeFile(path, JSON.stringify(preset, null, 2));
}

export async function deletePreset(presetName: string): Promise<void> {
  if (!electronService.isElectron()) {
    const presets = await loadPresets();
    const filtered = presets.filter((p) => p.name !== presetName);
    localStorage.setItem('koma_presets', JSON.stringify(filtered));
    return;
  }

  const presetsDir = await getGlobalPath('model-presets');
  const path = `${presetsDir}/${presetName}.json`;
  await electronService.fs.remove(path);
}
