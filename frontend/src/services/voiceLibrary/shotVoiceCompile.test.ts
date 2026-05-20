import { describe, it, expect } from 'vitest';
import { prepareShotAudio } from './shotVoiceCompile';
import type { VoiceLibrarySnapshot, VoiceProfile } from '../../types/voice-library';

function p(id: string, providerVoiceId = id, name = id): VoiceProfile {
  return {
    id, categoryId: 'cat', name,
    source: 'custom-sample',
    providerVoiceId,
    createdAt: 0, updatedAt: 0,
  };
}

const EMPTY_LIB: VoiceLibrarySnapshot = { categories: [], profiles: [] };

describe('prepareShotAudio', () => {
  it('无 voice mention 时 voiceId 回退到 defaultVoiceId，text 原样', () => {
    const r = prepareShotAudio({
      dialogue: '你好世界',
      voiceLibrary: EMPTY_LIB,
      characters: [],
      defaultVoiceId: 'cherry',
    });
    expect(r.text).toBe('你好世界');
    expect(r.voiceId).toBe('cherry');
    expect(r.audioBindings).toEqual([]);
    expect(r.unresolvedMentions).toEqual([]);
  });

  it('@voice_xxx 命中音色库 → voiceId 取 providerVoiceId，@Audio N 占位符已剥离', () => {
    const lib: VoiceLibrarySnapshot = { categories: [], profiles: [p('voice-1', 'aiden', 'Aiden')] };
    const r = prepareShotAudio({
      dialogue: '@voice_voice-1 念道：今天天气真好',
      voiceLibrary: lib,
      characters: [],
      defaultVoiceId: 'cherry',
    });
    expect(r.text).toBe('念道：今天天气真好');
    expect(r.voiceId).toBe('aiden');
    expect(r.audioBindings).toHaveLength(1);
    expect(r.audioBindings[0].providerVoiceId).toBe('aiden');
  });

  it('@char_xxx-音色 通过 character.voiceId 解析', () => {
    const lib: VoiceLibrarySnapshot = { categories: [], profiles: [p('voice-A', 'bella')] };
    const r = prepareShotAudio({
      dialogue: '@char_char-1-音色 喊：站住！',
      voiceLibrary: lib,
      characters: [{ id: 'char-1', voiceId: 'voice-A' }],
      defaultVoiceId: 'cherry',
    });
    expect(r.text).toBe('喊：站住！');
    expect(r.voiceId).toBe('bella');
    expect(r.audioBindings[0].sourceCharacterId).toBe('char-1');
  });

  it('character 未绑音色时回退到 projectFallbackVoiceId', () => {
    const lib: VoiceLibrarySnapshot = { categories: [], profiles: [p('voice-default', 'cherry')] };
    const r = prepareShotAudio({
      dialogue: '@char_char-x-音色 说话',
      voiceLibrary: lib,
      characters: [],
      projectFallbackVoiceId: 'voice-default',
      defaultVoiceId: 'fallback-cherry',
    });
    expect(r.voiceId).toBe('cherry');
    expect(r.audioBindings[0].voiceProfileId).toBe('voice-default');
  });

  it('多个不同 voice mention 时只取 bindings[0] 的 voiceId（KomaTTS 单请求单音色限制）', () => {
    const lib: VoiceLibrarySnapshot = {
      categories: [],
      profiles: [p('voice-A', 'aiden'), p('voice-B', 'bella')],
    };
    const r = prepareShotAudio({
      dialogue: '@voice_voice-A 旁白；@voice_voice-B 反派',
      voiceLibrary: lib,
      characters: [],
    });
    expect(r.voiceId).toBe('aiden');
    expect(r.audioBindings).toHaveLength(2);
    expect(r.audioBindings.map((b) => b.providerVoiceId)).toEqual(['aiden', 'bella']);
    // 两个 @Audio N 占位符都被清掉，剩下的文本干净
    expect(r.text).toBe('旁白； 反派');
  });

  it('voice mention 解析失败 → 记入 unresolvedMentions，voiceId 回退默认', () => {
    const r = prepareShotAudio({
      dialogue: '@voice_unknown 念旁白',
      voiceLibrary: EMPTY_LIB,
      characters: [],
      defaultVoiceId: 'cherry',
    });
    expect(r.text).toBe('念旁白');
    expect(r.voiceId).toBe('cherry');
    expect(r.unresolvedMentions[0]).toEqual({ token: '@voice_unknown', reason: 'voice-not-found' });
  });

  it('普通 @char_xxx（无 -音色 后缀）不被本流程触碰，留给 image 编译器', () => {
    const r = prepareShotAudio({
      dialogue: '@char_hero 在屋里说：早上好',
      voiceLibrary: EMPTY_LIB,
      characters: [],
      defaultVoiceId: 'cherry',
    });
    // 注意：dialogue 走 TTS 时这里 @char_hero 应该被某层清理掉，但 prepareShotAudio
    // 自己不动它（保持与 image 编译器职责分离）。voiceId 回退默认。
    expect(r.text).toBe('@char_hero 在屋里说：早上好');
    expect(r.voiceId).toBe('cherry');
    expect(r.audioBindings).toEqual([]);
  });
});
