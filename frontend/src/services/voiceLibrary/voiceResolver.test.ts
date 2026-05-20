import { describe, it, expect } from 'vitest';
import type { VoiceLibrarySnapshot, VoiceProfile } from '../../types/voice-library';
import {
  resolveCharacterVoiceMention,
  resolveVoiceMention,
  type VoiceResolveContext,
} from './voiceResolver';

function makeProfile(id: string, providerVoiceId = id, name = id): VoiceProfile {
  return {
    id,
    categoryId: 'cat-a',
    name,
    source: 'custom-sample',
    providerVoiceId,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeSnapshot(profiles: VoiceProfile[]): VoiceLibrarySnapshot {
  return { categories: [], profiles };
}

describe('resolveVoiceMention', () => {
  it('命中显式 voiceProfile.id 时直接返回', () => {
    const lib = makeSnapshot([makeProfile('voice-1', 'cherry', 'Cherry')]);
    const ctx: VoiceResolveContext = { library: lib };
    const r = resolveVoiceMention('voice-1', ctx);
    expect(r).not.toBeNull();
    expect(r!.providerVoiceId).toBe('cherry');
    expect(r!.voiceName).toBe('Cherry');
  });

  it('未命中返回 null（显式 mention 不走兜底）', () => {
    const lib = makeSnapshot([makeProfile('voice-1')]);
    const ctx: VoiceResolveContext = {
      library: lib,
      projectFallbackVoiceId: 'voice-1',
    };
    expect(resolveVoiceMention('voice-unknown', ctx)).toBeNull();
  });

  it('legacy: voiceProfileId 直接是 Koma voice id 应归一', () => {
    // builtin Koma profile id 规则 = `builtin-koma-voice-<voiceId>`
    const lib = makeSnapshot([{
      id: 'builtin-koma-voice-cherry',
      categoryId: 'builtin-koma-common',
      name: 'Cherry / 芊悦',
      source: 'builtin',
      providerVoiceId: 'cherry',
      createdAt: 0,
      updatedAt: 0,
    }]);
    const r = resolveVoiceMention('cherry', { library: lib });
    expect(r).not.toBeNull();
    expect(r!.voiceProfileId).toBe('builtin-koma-voice-cherry');
    expect(r!.providerVoiceId).toBe('cherry');
  });
});

describe('resolveCharacterVoiceMention', () => {
  it('character.voiceId 命中时返回该 profile', () => {
    const lib = makeSnapshot([makeProfile('voice-A')]);
    const ctx: VoiceResolveContext = {
      library: lib,
      getCharacterVoiceId: (id) => (id === 'char-1' ? 'voice-A' : undefined),
    };
    expect(resolveCharacterVoiceMention('char-1', ctx)!.voiceProfileId).toBe('voice-A');
  });

  it('character 未绑音色时回退到 projectFallbackVoiceId', () => {
    const lib = makeSnapshot([makeProfile('voice-fallback')]);
    const ctx: VoiceResolveContext = {
      library: lib,
      projectFallbackVoiceId: 'voice-fallback',
      getCharacterVoiceId: () => undefined,
    };
    expect(resolveCharacterVoiceMention('char-1', ctx)!.voiceProfileId).toBe('voice-fallback');
  });

  it('character.voiceId 指向已删除的 profile 时落到项目兜底', () => {
    const lib = makeSnapshot([makeProfile('voice-fallback')]);
    const ctx: VoiceResolveContext = {
      library: lib,
      projectFallbackVoiceId: 'voice-fallback',
      getCharacterVoiceId: () => 'voice-dangling',
    };
    expect(resolveCharacterVoiceMention('char-1', ctx)!.voiceProfileId).toBe('voice-fallback');
  });

  it('全链断裂时返回 null', () => {
    const ctx: VoiceResolveContext = {
      library: makeSnapshot([]),
      getCharacterVoiceId: () => undefined,
    };
    expect(resolveCharacterVoiceMention('char-1', ctx)).toBeNull();
  });

  it('character.voiceId 是 legacy Koma voice id 时也能归一', () => {
    const lib = makeSnapshot([{
      id: 'builtin-koma-voice-aiden',
      categoryId: 'builtin-koma-common',
      name: 'Aiden / 艾登',
      source: 'builtin',
      providerVoiceId: 'aiden',
      createdAt: 0,
      updatedAt: 0,
    }]);
    const ctx: VoiceResolveContext = {
      library: lib,
      getCharacterVoiceId: () => 'aiden',
    };
    const r = resolveCharacterVoiceMention('char-1', ctx);
    expect(r!.voiceProfileId).toBe('builtin-koma-voice-aiden');
    expect(r!.providerVoiceId).toBe('aiden');
  });
});
