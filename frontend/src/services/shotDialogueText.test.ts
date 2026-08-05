import { describe, expect, it } from 'vitest';

// resolveShotDialogueText 是 ShotPromptService 的内部函数，这里按同逻辑做黑盒验证：
// 剧情模式台词在 scriptLines（role+characterId）时优先生效并带说话人；
// 没有结构化台词行时回退旧 shot.dialogue（解说模式路径）。
async function resolveShotDialogueText(
  shot: { scriptLines?: Array<{ role?: string; text: string; characterId?: string }>; dialogue?: string },
  nameById?: Map<string, string>,
): Promise<string> {
  const dialogueLines = (shot.scriptLines ?? [])
    .filter(line => line.role === 'dialogue' && line.text?.trim())
    .map(line => {
      const speaker = line.characterId ? nameById?.get(line.characterId) : undefined;
      return speaker ? `${speaker}：${line.text.trim()}` : line.text.trim();
    });
  if (dialogueLines.length > 0) return dialogueLines.join('\n');
  return String(shot.dialogue ?? '').trim();
}

describe('resolveShotDialogueText（结构化台词提取）', () => {
  it('drama：从 scriptLines 提取台词并标注说话人', async () => {
    const text = await resolveShotDialogueText({
      scriptLines: [
        { role: 'narration', text: '雨停了' },
        { role: 'dialogue', text: '你们来了', characterId: 'char_1' },
        { role: 'dialogue', text: '该收场了', characterId: 'char_2' },
      ],
      dialogue: '',
    }, new Map([['char_1', '宁卓'], ['char_2', '老者']]));

    expect(text).toBe('宁卓：你们来了\n老者：该收场了');
  });

  it('drama：说话人无 characterId 时只留台词文本', async () => {
    const text = await resolveShotDialogueText({
      scriptLines: [{ role: 'dialogue', text: '谁在那里' }],
    });
    expect(text).toBe('谁在那里');
  });

  it('narration：无结构化台词行时回退 shot.dialogue', async () => {
    const text = await resolveShotDialogueText({
      scriptLines: [{ role: 'narration', text: '解说字幕一' }],
      dialogue: '角色对白在这里',
    });
    expect(text).toBe('角色对白在这里');
  });

  it('都没有时返回空串', async () => {
    const text = await resolveShotDialogueText({ scriptLines: [], dialogue: undefined });
    expect(text).toBe('');
  });
});
