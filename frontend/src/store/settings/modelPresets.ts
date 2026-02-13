/**
 * 模型预设管理
 * 优先通过 configBridge 访问后端，fallback 旧逻辑
 */
import { electronService } from '../../services/electronService';
import { configBridge } from '../../services/configBridge';
import { getGlobalPath } from './core';

export interface ModelPreset {
  name: string;
  type: 'llm' | 'tti' | 'tts' | 'itv';
  config: any;
}

// 旧逻辑加载
async function loadLegacy(): Promise<ModelPreset[]> {
  if (!electronService.isElectron()) {
    try {
      const data = localStorage.getItem('koma_presets');
      if (data) return JSON.parse(data);
    } catch { /* ignore */ }
    return [];
  }
  try {
    const presetsDir = await getGlobalPath('model-presets');
    const exists = await electronService.fs.exists(presetsDir);
    if (!exists) return [];
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

export async function loadPresets(): Promise<ModelPreset[]> {
  try {
    const remote = await configBridge.get<ModelPreset[]>('model-presets');
    if (remote && Array.isArray(remote) && remote.length > 0) return remote;
  } catch { /* fallback */ }
  const legacy = await loadLegacy();
  if (legacy.length > 0) {
    configBridge.set('model-presets', legacy).catch(() => {});
  }
  return legacy;
}

async function saveAll(presets: ModelPreset[]): Promise<void> {
  configBridge.set('model-presets', presets).catch(() => {});
  if (!electronService.isElectron()) {
    localStorage.setItem('koma_presets', JSON.stringify(presets));
    return;
  }
  const presetsDir = await getGlobalPath('model-presets');
  await electronService.fs.mkdir(presetsDir);
  // 旧逻辑：每个预设一个文件
  for (const preset of presets) {
    const path = `${presetsDir}/${preset.name}.json`;
    await electronService.fs.writeFile(path, JSON.stringify(preset, null, 2));
  }
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
  // 旧逻辑：删除文件
  if (electronService.isElectron()) {
    const presetsDir = await getGlobalPath('model-presets');
    const path = `${presetsDir}/${presetName}.json`;
    await electronService.fs.remove(path).catch(() => {});
  }
}
