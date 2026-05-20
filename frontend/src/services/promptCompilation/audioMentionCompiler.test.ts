import { describe, it, expect } from 'vitest';
import { compileAudioMentions } from './audioMentionCompiler';
import type { VoiceLibrarySnapshot, VoiceProfile } from '../../types/voice-library';
import type { VoiceResolveContext } from '../voiceLibrary/voiceResolver';

function makeProfile(id: string, providerVoiceId = id, name = id): VoiceProfile {
  return {
    id,
    categoryId: 'cat',
    name,
    source: 'custom-sample',
    providerVoiceId,
    createdAt: 0,
    updatedAt: 0,
  };
}

function buildCtx(profiles: VoiceProfile[], charVoice?: Record<string, string>): VoiceResolveContext {
  const lib: VoiceLibrarySnapshot = { categories: [], profiles };
  return {
    library: lib,
    getCharacterVoiceId: charVoice ? (id) => charVoice[id] : undefined,
  };
}

describe('compileAudioMentions', () => {
  it('无 voice 上下文时不动 prompt（向后兼容用：compileShotPromptToBundle 不传 voiceContext）', () => {
    // 注：这个场景实际上由调用方守门（不传 voiceContext 就不调本函数），
    // 这里只测：传了空库 + 有 voice mention，token 会被剥离
    const ctx = buildCtx([]);
    const r = compileAudioMentions({ prompt: '台词 @voice_x 念', ctx });
    expect(r.audioBindings).toEqual([]);
    expect(r.compiledPrompt).toBe('台词 念');
    expect(r.unresolvedMentions).toEqual([
      { token: '@voice_x', reason: 'voice-not-found' },
    ]);
  });

  it('单个 @voice_xxx → @Audio 1 + 一条 binding', () => {
    const ctx = buildCtx([makeProfile('voice-1', 'cherry', 'Cherry')]);
    const r = compileAudioMentions({ prompt: '由 @voice_voice-1 朗读', ctx });
    expect(r.compiledPrompt).toBe('由 @Audio 1 朗读');
    expect(r.audioBindings).toEqual([
      {
        index: 1,
        voiceProfileId: 'voice-1',
        providerVoiceId: 'cherry',
        voiceName: 'Cherry',
        sourceCharacterId: undefined,
        originTokens: ['@voice_voice-1'],
      },
    ]);
  });

  it('@char_xxx-音色 通过 character.voiceId 解析 → @Audio N + sourceCharacterId 记录', () => {
    const ctx = buildCtx(
      [makeProfile('voice-A', 'aiden', 'Aiden')],
      { 'char-1': 'voice-A' },
    );
    const r = compileAudioMentions({ prompt: '@char_char-1-音色：你好', ctx });
    expect(r.compiledPrompt).toBe('@Audio 1：你好');
    expect(r.audioBindings[0]).toMatchObject({
      index: 1,
      voiceProfileId: 'voice-A',
      providerVoiceId: 'aiden',
      sourceCharacterId: 'char-1',
    });
  });

  it('同一 voiceProfile 多次出现 → 复用同一 @Audio N', () => {
    const ctx = buildCtx([makeProfile('voice-A', 'aiden')]);
    const r = compileAudioMentions({
      prompt: '@voice_voice-A 说"你好" 然后 @voice_voice-A 再说"再见"',
      ctx,
    });
    expect(r.audioBindings).toHaveLength(1);
    // 两次都替换成 @Audio 1
    expect(r.compiledPrompt).toBe('@Audio 1 说"你好" 然后 @Audio 1 再说"再见"');
    expect(r.audioBindings[0].originTokens).toEqual(['@voice_voice-A', '@voice_voice-A']);
  });

  it('多个不同音色 → 按出现顺序编号', () => {
    const ctx = buildCtx([
      makeProfile('voice-A', 'aiden'),
      makeProfile('voice-B', 'bella'),
    ]);
    const r = compileAudioMentions({
      prompt: '@voice_voice-A 旁白；@voice_voice-B 反派',
      ctx,
    });
    expect(r.compiledPrompt).toBe('@Audio 1 旁白；@Audio 2 反派');
    expect(r.audioBindings.map((b) => b.providerVoiceId)).toEqual(['aiden', 'bella']);
  });

  it('@voice_xxx 与 @char_xxx-音色 混排 + 同一 profile 复用编号', () => {
    const ctx = buildCtx(
      [makeProfile('voice-A', 'aiden')],
      { 'char-1': 'voice-A' },
    );
    const r = compileAudioMentions({
      prompt: '@voice_voice-A 念，然后 @char_char-1-音色 接：',
      ctx,
    });
    // 两个 mention 都指向 voice-A → 共享 @Audio 1
    expect(r.audioBindings).toHaveLength(1);
    expect(r.compiledPrompt).toBe('@Audio 1 念，然后 @Audio 1 接：');
    // sourceCharacterId 在 binding 上记录的是首个进入桶的来源（这里第一个是 @voice_，无 char）
    expect(r.audioBindings[0].sourceCharacterId).toBeUndefined();
  });

  it('@voice_xxx 未在库里 → 剥离 token + unresolved 列表登记', () => {
    const ctx = buildCtx([]);
    const r = compileAudioMentions({ prompt: '@voice_unknown 念旁白', ctx });
    // 剥离 token 后保留它原位的单个空白（与现有 compileShotPromptToBundle 一致：
    // 不主动 trim 行首/行尾，避免吞掉用户有意写的换行/缩进）。
    expect(r.compiledPrompt).toBe(' 念旁白');
    expect(r.audioBindings).toEqual([]);
    expect(r.unresolvedMentions).toEqual([
      { token: '@voice_unknown', reason: 'voice-not-found' },
    ]);
  });

  it('@char_xxx-音色 character 没绑音色且无项目兜底 → 剥离 + unresolved 登记', () => {
    const ctx = buildCtx([], { 'char-1': undefined as any });
    const r = compileAudioMentions({ prompt: '台词 @char_char-1-音色 说', ctx });
    expect(r.compiledPrompt).toBe('台词 说');
    expect(r.unresolvedMentions[0]).toEqual({
      token: '@char_char-1-音色',
      reason: 'character-voice-missing',
    });
  });

  it('普通 @char_xxx（无 -音色 后缀）不被本编译器触碰', () => {
    const ctx = buildCtx([makeProfile('voice-1')]);
    const r = compileAudioMentions({ prompt: '@char_hero 在屋里', ctx });
    expect(r.compiledPrompt).toBe('@char_hero 在屋里');
    expect(r.audioBindings).toEqual([]);
  });

  it('character-音色 兜底到项目默认 voiceId', () => {
    const ctx: VoiceResolveContext = {
      library: { categories: [], profiles: [makeProfile('voice-default')] },
      projectFallbackVoiceId: 'voice-default',
      getCharacterVoiceId: () => undefined,
    };
    const r = compileAudioMentions({ prompt: '@char_anyone-音色 念', ctx });
    expect(r.audioBindings[0].voiceProfileId).toBe('voice-default');
    expect(r.compiledPrompt).toBe('@Audio 1 念');
  });
});
