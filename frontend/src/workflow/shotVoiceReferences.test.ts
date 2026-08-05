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

import { buildShotVoiceReferencePlan } from './shotVoiceReferences';
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
