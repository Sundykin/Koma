import { describe, expect, it } from 'vitest';
import { buildDialogueGuardNote } from './ShotPromptService';

describe('buildDialogueGuardNote', () => {
  it('treats third-person narration as non-spoken text', () => {
    const note = buildDialogueGuardNote(
      '沈鹿睁开眼，心里一沉。哪里不对。这不是她的卧室。',
      ['沈鹿'],
    );

    expect(note).toContain('本分镜显式口播台词（DIALOGUE）：无');
    expect(note).toContain('这不是她的卧室');
    expect(note).toContain('不得补写台词');
  });

  it('extracts explicit spoken dialogue from role-prefix lines', () => {
    const note = buildDialogueGuardNote(
      '沈鹿：这不是我的卧室。\n旁白：她瞬间清醒。',
      ['沈鹿'],
    );

    expect(note).toContain('本分镜显式口播台词（DIALOGUE）：');
    expect(note).toContain('- 这不是我的卧室。');
    expect(note).toContain('本分镜显式 OS/OV / 旁白（VOICEOVER');
    expect(note).toContain('- 她瞬间清醒。');
  });

  it('extracts explicit self-talk only when a speech cue exists', () => {
    const note = buildDialogueGuardNote(
      '沈鹿盯着天花板，低声说：\"哪里不对。\"',
      ['沈鹿'],
    );

    expect(note).toContain('- 哪里不对。');
  });

  it('treats social media comments / 弹幕 / 字幕 as COMMENTARY (not dialogue / not voiceover)', () => {
    const note = buildDialogueGuardNote(
      '沈鹿坐在床上发呆。\n网友评论：好惨啊\n弹幕："这剧情666"\n字幕：第三日',
      ['沈鹿'],
    );

    expect(note).toContain('本分镜显式口播台词（DIALOGUE）：无');
    expect(note).toContain('本分镜社交评论 / 弹幕 / 字幕 / 第三方文本（COMMENTARY');
    expect(note).toContain('- 好惨啊');
    expect(note).toContain('- 这剧情666');
    expect(note).toContain('- 第三日');
    expect(note).toContain('禁止改写为角色对白');
  });
});
