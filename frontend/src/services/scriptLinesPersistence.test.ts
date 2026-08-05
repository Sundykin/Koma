/**
 * scriptLines 的 SQLite 序列化/反序列化回归测试。
 * 背景：剧情拆解产物的 description 行曾被 parseScriptLines 错误归一为 narration
 * （只认 dialogue），导致分镜描述行被误当旁白进配音/字幕。
 */
import { describe, expect, it } from 'vitest';
import { parseScriptLines } from '../../../electron/service/storage/projectPersistenceHelpers';

describe('parseScriptLines（script_lines_json 反序列化）', () => {
  it('保留 description / dialogue / narration 三种 role 及 characterId', () => {
    const raw = JSON.stringify([
      { id: 'l1', text: '戏台全景，雨夜', role: 'description' },
      { id: 'l2', text: '雨声渐弱', role: 'narration' },
      { id: 'l3', text: '你们来了', role: 'dialogue', characterId: 'char_1' },
    ]);
    const lines = parseScriptLines(raw);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ id: 'l1', text: '戏台全景，雨夜', role: 'description', characterId: undefined });
    expect(lines[1]).toMatchObject({ id: 'l2', role: 'narration' });
    expect(lines[2]).toMatchObject({ id: 'l3', role: 'dialogue', characterId: 'char_1' });
  });

  it('无 role 的旧数据按旁白处理（向后兼容）', () => {
    const lines = parseScriptLines(JSON.stringify([{ id: 'l1', text: '旧格式行' }]));
    expect(lines[0].role).toBe('narration');
  });

  it('非法 JSON 时回退到 fallbackText 逐行拆分', () => {
    const lines = parseScriptLines('not-json', '第一行\n第二行');
    expect(lines.map(l => l.text)).toEqual(['第一行', '第二行']);
    expect(lines.every(l => l.role === 'narration')).toBe(true);
  });

  it('未知 role 值归一为 narration', () => {
    const lines = parseScriptLines(JSON.stringify([{ id: 'l1', text: 'x', role: 'weird' }]));
    expect(lines[0].role).toBe('narration');
  });
});
