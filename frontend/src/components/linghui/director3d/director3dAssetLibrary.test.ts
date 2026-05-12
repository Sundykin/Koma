import { describe, expect, it } from 'vitest';
import {
  DIRECTOR3D_OPEN_MODEL_CATALOG,
  getDirector3DProceduralModelEntries,
} from './director3dOpenModelCatalog';
import {
  DIRECTOR3D_CHARACTER_PRESETS,
  DIRECTOR3D_PROP_CATEGORY_LABELS,
  DIRECTOR3D_PROP_LIBRARY,
  DIRECTOR3D_SCENE_TEMPLATES,
  createDirector3DCharacter,
} from './director3dScene';

describe('C-5A 内置资产库', () => {
  it('角色预设至少 8 个，主角 type 全为 mannequin，id 唯一', () => {
    expect(DIRECTOR3D_CHARACTER_PRESETS.length).toBeGreaterThanOrEqual(8);
    const ids = new Set<string>();
    for (const preset of DIRECTOR3D_CHARACTER_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.color).toBeTruthy();
      expect(preset.scale).toBeGreaterThan(0);
      expect(ids.has(preset.id)).toBe(false);
      ids.add(preset.id);
    }
  });

  it('createDirector3DCharacter 用预设的 color / scale / pose 创建主角 actor', () => {
    const preset = DIRECTOR3D_CHARACTER_PRESETS.find(p => p.id === 'char-bulky')!;
    const actor = createDirector3DCharacter(preset, { id: 'a1' });
    expect(actor.type).toBe('mannequin');
    expect(actor.scale).toBeCloseTo(preset.scale, 3);
    expect(actor.color).toBe(preset.color);
    expect(actor.posePreset).toBe(preset.posePreset);
  });

  it('createDirector3DCharacter overrides 优先于预设', () => {
    const preset = DIRECTOR3D_CHARACTER_PRESETS[0];
    const actor = createDirector3DCharacter(preset, { id: 'a2', scale: 2.0, color: 'crimson' });
    expect(actor.scale).toBe(2.0);
    expect(actor.color).toBe('crimson');
  });

  it('道具库 20+ 个，按 5 个 category 分类，id 唯一', () => {
    expect(DIRECTOR3D_PROP_LIBRARY.length).toBeGreaterThanOrEqual(20);
    const ids = new Set<string>();
    const cats = new Set<string>();
    for (const preset of DIRECTOR3D_PROP_LIBRARY) {
      expect(preset.id).toBeTruthy();
      expect(preset.category).toBeTruthy();
      expect(ids.has(preset.id)).toBe(false);
      ids.add(preset.id);
      cats.add(preset.category);
    }
    expect(cats.size).toBeGreaterThanOrEqual(5);
    expect(Object.keys(DIRECTOR3D_PROP_CATEGORY_LABELS).sort()).toEqual(['basic', 'furniture', 'gear', 'nature', 'vehicle']);
  });

  it('场景模板至少 12 个，每个 build() 返回合法 scene', () => {
    expect(DIRECTOR3D_SCENE_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    const ids = new Set<string>();
    for (const template of DIRECTOR3D_SCENE_TEMPLATES) {
      expect(ids.has(template.id)).toBe(false);
      ids.add(template.id);
      const scene = template.build();
      expect(scene.version).toBe(1);
      expect(scene.camera).toBeDefined();
      expect(Array.isArray(scene.actors)).toBe(true);
      expect(scene.actors.length).toBeGreaterThan(0);
    }
  });

  it('法庭模板包含法官 / 原告 / 被告 + 法官席道具', () => {
    const courtroom = DIRECTOR3D_SCENE_TEMPLATES.find(t => t.id === 'tpl-courtroom')!;
    const scene = courtroom.build();
    const labels = scene.actors.map(a => a.label);
    expect(labels).toContain('法官');
    expect(labels).toContain('原告');
    expect(labels).toContain('被告');
    // 至少有一个道具
    expect(scene.actors.some(a => a.type !== 'mannequin' && a.type !== 'mannequin-lite' && a.type !== 'formation')).toBe(true);
  });

  it('舞台演讲模板包含演讲者 + formation 类型观众席', () => {
    const stage = DIRECTOR3D_SCENE_TEMPLATES.find(t => t.id === 'tpl-stage')!;
    const scene = stage.build();
    expect(scene.actors.some(a => a.label === '演讲者')).toBe(true);
    expect(scene.actors.some(a => a.type === 'formation')).toBe(true);
  });

  it('玄幻场景模板存在且至少 5 个，含生物 actor', () => {
    const mysticIds = ['tpl-sword-duel', 'tpl-altar', 'tpl-dragon-confront', 'tpl-phoenix-rebirth', 'tpl-cloud-summit', 'tpl-mythical-battlefield'];
    for (const id of mysticIds) {
      const tpl = DIRECTOR3D_SCENE_TEMPLATES.find(t => t.id === id);
      expect(tpl).toBeDefined();
    }
    // 神龙降世模板含 dragon 生物
    const dragonTpl = DIRECTOR3D_SCENE_TEMPLATES.find(t => t.id === 'tpl-dragon-confront')!.build();
    expect(dragonTpl.actors.some(a => a.type === 'creature' && a.species === 'dragon')).toBe(true);
    // 凤凰涅槃含 phoenix
    const phoenixTpl = DIRECTOR3D_SCENE_TEMPLATES.find(t => t.id === 'tpl-phoenix-rebirth')!.build();
    expect(phoenixTpl.actors.some(a => a.type === 'creature' && a.species === 'phoenix')).toBe(true);
  });

  it('教室模板用 formation 装学生（坐姿）', () => {
    const classroom = DIRECTOR3D_SCENE_TEMPLATES.find(t => t.id === 'tpl-classroom')!;
    const scene = classroom.build();
    const students = scene.actors.find(a => a.type === 'formation');
    expect(students).toBeDefined();
    expect(students?.posePreset).toBe('sit');
  });

  it('开源模型目录记录来源 / 许可证 / 用途，且 id 唯一', () => {
    expect(DIRECTOR3D_OPEN_MODEL_CATALOG.length).toBeGreaterThanOrEqual(5);
    const ids = new Set<string>();
    for (const entry of DIRECTOR3D_OPEN_MODEL_CATALOG) {
      expect(entry.id).toBeTruthy();
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(entry.sourceUrl).toMatch(/^https?:\/\//);
      expect(entry.licenseUrl).toMatch(/^https?:\/\//);
      expect(entry.license).toBeTruthy();
      expect(entry.usage.length).toBeGreaterThan(10);
      expect(entry.rigNotes.length).toBeGreaterThan(10);
    }
    expect(DIRECTOR3D_OPEN_MODEL_CATALOG.some(entry => entry.license === 'CC0-1.0')).toBe(true);
    expect(DIRECTOR3D_OPEN_MODEL_CATALOG.some(entry => entry.license === 'per-asset-license')).toBe(true);
  });

  it('可程序化导入的开源来源都有 actor 默认值', () => {
    const proceduralEntries = getDirector3DProceduralModelEntries();
    expect(proceduralEntries.length).toBeGreaterThanOrEqual(2);
    for (const entry of proceduralEntries) {
      expect(entry.importStatus).toBe('procedural-ready');
      expect(entry.actorDefaults).toBeDefined();
      expect(entry.actorDefaults?.label).toBeTruthy();
      expect(entry.actorDefaults?.scale).toBeGreaterThan(0);
      expect(entry.actorDefaults?.posePreset).toBeTruthy();
    }
  });
});
