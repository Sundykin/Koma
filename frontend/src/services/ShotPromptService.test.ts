import { describe, expect, it } from 'vitest';
import { buildDialogueGuardNote } from './ShotPromptService';

describe('buildDialogueGuardNote', () => {
  it('treats third-person narration as non-spoken text', () => {
    const note = buildDialogueGuardNote(
      '沈鹿睁开眼，心里一沉。哪里不对。这不是她的卧室。',
      ['沈鹿'],
    );

    expect(note).toContain('本分镜显式口播台词：无');
    expect(note).toContain('这不是她的卧室');
    expect(note).toContain('不得补写台词');
  });

  it('extracts explicit spoken dialogue from role-prefix lines', () => {
    const note = buildDialogueGuardNote(
      '沈鹿：这不是我的卧室。\n旁白：她瞬间清醒。',
      ['沈鹿'],
    );

    expect(note).toContain('本分镜显式口播台词：');
    expect(note).toContain('- 这不是我的卧室。');
    expect(note).toContain('本分镜显式 OS/OV / 旁白：');
    expect(note).toContain('- 她瞬间清醒。');
  });

  it('extracts explicit self-talk only when a speech cue exists', () => {
    const note = buildDialogueGuardNote(
      '沈鹿盯着天花板，低声说：\"哪里不对。\"',
      ['沈鹿'],
    );

    expect(note).toContain('- 哪里不对。');
  });
});
