import { describe, expect, it } from 'vitest';
import { extractDialoguesFromDescription, buildShotVoiceSegments } from './shot-script';
import type { ShotScriptLine } from './scene-character';

const line = (text: string, role?: ShotScriptLine['role'], characterId?: string): ShotScriptLine => ({
  id: `l-${Math.random().toString(36)}`,
  text,
  role,
  characterId,
});

describe('extractDialoguesFromDescription', () => {
  it('提取中英文引号台词，去掉引号；无角色名表时不瞎猜说话人', () => {
    // 无 knownSpeakers：台词文本提取出来，speaker 留空（走默认音色，安全不误绑）
    const d = extractDialoguesFromDescription('叶赎抬眼："你们来了。"');
    expect(d).toEqual([{ text: '你们来了。', speaker: undefined }]);
  });

  it('传入角色名表后从引号前文本识别说话人（覆盖 2/3 字名）', () => {
    expect(extractDialoguesFromDescription('叶赎抬眼："你们来了。"', ['叶赎'])[0].speaker).toBe('叶赎');
    expect(extractDialoguesFromDescription('小白跺脚道："我说的都是真的。"', ['小白'])[0].speaker).toBe('小白');
    expect(extractDialoguesFromDescription('宁无双冷冷开口："走吧。"', ['宁无双'])[0].speaker).toBe('宁无双');
  });

  it('前缀整体就是主语+冒号/动词（无动作描述）时启发式识别', () => {
    expect(extractDialoguesFromDescription('叶赎："你们来了。"')[0].speaker).toBe('叶赎');
    expect(extractDialoguesFromDescription('苏晓说："走吧。"')[0].speaker).toBe('苏晓');
  });

  it('冒号前是内容词尾（的话/声音）不误判为说话人', () => {
    const d = extractDialoguesFromDescription('叶赎复述她方才的话："所以你要相信。"');
    expect(d).toHaveLength(1);
    expect(d[0].text).toBe('所以你要相信。');
    expect(d[0].speaker).toBeUndefined();
  });

  it('无引号台词返回空；多句台词全提取', () => {
    expect(extractDialoguesFromDescription('纯画面：雨夜，小木屋内。')).toEqual([]);
    const d = extractDialoguesFromDescription('甲："第一句。" 乙："第二句。"');
    expect(d).toHaveLength(2);
    expect(d[0].text).toBe('第一句。');
    expect(d[1].text).toBe('第二句。');
  });
});

describe('buildShotVoiceSegments 从 description 提取台词', () => {
  it('纯 description（含引号台词）→ 提取为 dialogue 段', () => {
    const segments = buildShotVoiceSegments({
      scriptLines: [line('叶赎抬眼："你们来了。"', 'description')],
    });
    expect(segments).toHaveLength(1);
    expect(segments[0].role).toBe('dialogue');
    expect(segments[0].text).toBe('你们来了。');
  });

  it('speaker 映射到 characterId（注入映射函数）', () => {
    const speakerToId = (speaker: string) => (speaker === '叶赎' ? 'char-1' : undefined);
    const segments = buildShotVoiceSegments(
      { scriptLines: [line('叶赎："你们来了。"', 'description')] },
      { speakerToCharacterId: speakerToId, knownSpeakers: ['叶赎'] },
    );
    expect(segments[0].characterId).toBe('char-1');
  });

  it('无台词的 description 不入配音；既有 dialogue 行照常', () => {
    const segments = buildShotVoiceSegments({
      scriptLines: [
        line('雨夜，小木屋，一盏油灯。', 'description'),
        line('画外音旁白', 'narration'),
        line('台词行', 'dialogue', 'char-9'),
      ],
    });
    // description 无台词 → 跳过；narration + dialogue 两段
    expect(segments).toHaveLength(2);
    expect(segments[0].role).toBe('narration');
    expect(segments[1]).toEqual({ text: '台词行', role: 'dialogue', characterId: 'char-9' });
  });

  it('相邻同类型合并（既有行为不回归）', () => {
    const segments = buildShotVoiceSegments({
      scriptLines: [
        line('旁白一', 'narration'),
        line('旁白二', 'narration'),
      ],
    });
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('旁白一\n旁白二');
  });
});
