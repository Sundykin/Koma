import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceLibrarySnapshot } from '../types/voice-library';

vi.mock('../services/voiceLibrary/voiceLibraryService', () => ({
  loadVoiceLibrary: vi.fn(),
  findVoiceProfile: vi.fn((id: string | undefined, snap: VoiceLibrarySnapshot) =>
    snap.profiles.find(p => p.id === id)),
  resolveVoiceSampleUrl: vi.fn(),
}));

vi.mock('../services/mediaAssetResolver', () => ({
  resolveProviderAssetInput: vi.fn(),
}));

import { buildShotVoiceReferencePlan, compileShotVoiceMentions } from './shotVoiceReferences';
import {
  loadVoiceLibrary,
  resolveVoiceSampleUrl,
} from '../services/voiceLibrary/voiceLibraryService';
import { resolveProviderAssetInput } from '../services/mediaAssetResolver';

const SNAPSHOT: VoiceLibrarySnapshot = {
  categories: [],
  profiles: [
    { id: 'builtin-koma-voice-cherry', name: 'Cherry', sampleFile: 'builtin-cherry.wav' } as any,
    { id: 'builtin-koma-voice-aiden', name: 'Aiden', sampleFile: 'builtin-aiden.wav' } as any,
    { id: 'builtin-koma-voice-nosample', name: 'NoSample' } as any,
  ],
};

describe('buildShotVoiceReferencePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (loadVoiceLibrary as any).mockResolvedValue(SNAPSHOT);
    (resolveVoiceSampleUrl as any).mockImplementation(async (f: string) => `koma-local://${f}`);
    (resolveProviderAssetInput as any).mockImplementation(async (url: string) => ({
      transport: 'data-url',
      value: `data:audio/wav;base64,${url === 'koma-local://builtin-cherry.wav' ? 'Q0hFUlJZ' : 'QUlERU4='}`,
      mimeType: 'audio/wav',
    }));
  });

  it('为绑定音色的角色生成音色参考与协议占位行（koma-jimeng）', async () => {
    const plan = await buildShotVoiceReferencePlan({
      shotCharacters: ['char_1'],
      characters: [{ id: 'char_1', name: '宁卓', voiceId: 'builtin-koma-voice-cherry' }],
      promptProtocol: 'koma-jimeng',
    });

    expect(plan.references).toHaveLength(1);
    expect(plan.references[0].characterName).toBe('宁卓');
    expect(plan.references[0].asset.value).toBe('data:audio/wav;base64,Q0hFUlJZ');
    expect(plan.promptSuffix).toBe('【音色参考】\n宁卓的台词使用 @audio_file_1 的音色');
  });

  it('minimax 协议下占位符为 <音频 N>', async () => {
    const plan = await buildShotVoiceReferencePlan({
      shotCharacters: ['char_1'],
      characters: [{ id: 'char_1', name: '宁卓', voiceId: 'builtin-koma-voice-cherry' }],
      promptProtocol: 'minimax-image-tag',
    });
    expect(plan.promptSuffix).toContain('<音频 1>');
  });

  it('按 shot.characters 顺序编号，每类从 1 开始，最多 3 个', async () => {
    const characters = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `角色${i + 1}`,
      voiceId: i % 2 === 0 ? 'builtin-koma-voice-cherry' : 'builtin-koma-voice-aiden',
    }));
    const plan = await buildShotVoiceReferencePlan({
      shotCharacters: ['a', 'b', 'c', 'd'],
      characters,
      promptProtocol: 'minimax-image-tag',
    });

    expect(plan.references).toHaveLength(3);
    const lines = plan.promptSuffix.split('\n').slice(1);
    expect(lines[0]).toContain('<音频 1>');
    expect(lines[1]).toContain('<音频 2>');
    expect(lines[2]).toContain('<音频 3>');
  });

  it('音色无示例音频的角色被跳过', async () => {
    const plan = await buildShotVoiceReferencePlan({
      shotCharacters: ['char_1'],
      characters: [{ id: 'char_1', name: '宁卓', voiceId: 'builtin-koma-voice-nosample' }],
    });
    expect(plan.references).toHaveLength(0);
    expect(plan.promptSuffix).toBe('');
  });

  it('未绑定音色的角色不产生参考', async () => {
    const plan = await buildShotVoiceReferencePlan({
      shotCharacters: ['char_1'],
      characters: [{ id: 'char_1', name: '宁卓' }],
    });
    expect(plan.references).toHaveLength(0);
    expect(loadVoiceLibrary).not.toHaveBeenCalled();
  });
});

describe('compileShotVoiceMentions', () => {
  const plan = {
    references: [
      { characterId: 'char_1', characterName: '宁卓', asset: {} as any },
      { characterId: 'char_2', characterName: '叶赎', asset: {} as any },
    ],
    promptSuffix: '',
  };

  it('按音色参考顺序把 @char_<id>-音色 编译成协议占位符', () => {
    const { prompt } = compileShotVoiceMentions({
      prompt: '角色提示词：@char_1 宁卓 音色 @char_1-音色，@char_2 叶赎 音色 @char_2-音色。',
      plan,
      promptProtocol: 'minimax-image-tag',
    });

    expect(prompt).toBe('角色提示词：@char_1 宁卓 音色 <音频 1>，@char_2 叶赎 音色 <音频 2>。');
  });

  it('默认协议下编译成 @Audio N', () => {
    const { prompt } = compileShotVoiceMentions({
      prompt: '@char_2 叶赎 音色 @char_2-音色 开口。',
      plan,
    });

    expect(prompt).toBe('@char_2 叶赎 音色 @Audio 2 开口。');
  });

  it('没有对应音频参考的角色音色映射符连同"音色"标签一起剥离', () => {
    const { prompt, unresolvedMentions } = compileShotVoiceMentions({
      prompt: '@char_9 路人 音色 @char_9-音色 开口。',
      plan,
    });

    expect(prompt).toBe('@char_9 路人 开口。');
    expect(unresolvedMentions).toEqual(['@char_9-音色']);
  });

  it('不误伤普通角色映射符', () => {
    const { prompt } = compileShotVoiceMentions({
      prompt: '@char_1 宁卓 抬头，@char_11 另一人 走过。',
      plan,
    });

    expect(prompt).toBe('@char_1 宁卓 抬头，@char_11 另一人 走过。');
  });
});
