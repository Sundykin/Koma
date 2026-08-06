/**
 * 剧情模式分段配音编排（generateShotAudioWithSegments）的单元测试。
 * mock 掉 generateAudio / ffmpeg / fs / persist，验证编排逻辑：
 * 单段直通、多段分别配音后拼接、空段抛错、拼接失败回退第一段。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaGenerationService } from './MediaGenerationService';

vi.mock('./ffmpegManager', () => ({
  ffmpegManager: { concatAudioClips: vi.fn() },
}));
vi.mock('./electronService', () => ({
  electronService: { fs: { mkdir: vi.fn().mockResolvedValue(undefined) } },
}));
vi.mock('./mediaPersistenceService', () => ({
  persistMediaAsset: vi.fn(),
}));
vi.mock('./mediaTaskBindingService', () => ({
  bindOwnerRefMedia: vi.fn(),
}));
vi.mock('../store/projectStore', () => ({
  getProjectPath: vi.fn().mockResolvedValue('/proj'),
}));
vi.mock('../store/globalStore', () => ({
  loadSettings: vi.fn().mockResolvedValue({ channelConfigs: [] }),
}));

import { ffmpegManager } from './ffmpegManager';
import { persistMediaAsset } from './mediaPersistenceService';
import { bindOwnerRefMedia } from './mediaTaskBindingService';

const OWNER = { projectId: 'p1', ownerType: 'shot' as const, ownerId: 'shot_1', episodeId: 'e1', slot: 'audio' as const };

function makeAsset(id: string): any {
  return { id, localPath: `/proj/audio/${id}.mp3`, kind: 'audio' };
}

describe('generateShotAudioWithSegments', () => {
  let service: MediaGenerationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MediaGenerationService();
  });

  it('空段直接抛错', async () => {
    await expect(
      service.generateShotAudioWithSegments({ projectId: 'p1', ownerRef: OWNER, segments: [{ text: '  ', voiceId: 'v' }] }),
    ).rejects.toThrow('没有可配音的文本段');
  });

  it('单段直通 generateAudio（不拼接）', async () => {
    const asset = makeAsset('single');
    const generateAudioSpy = vi.spyOn(service, 'generateAudio').mockResolvedValue(asset);

    const result = await service.generateShotAudioWithSegments({
      projectId: 'p1',
      ownerRef: OWNER,
      segments: [{ text: '旁白内容', voiceId: 'voice-project' }],
      options: { rate: 1.5 },
    });

    expect(result).toBe(asset);
    expect(generateAudioSpy).toHaveBeenCalledTimes(1);
    expect(generateAudioSpy.mock.calls[0][0].request).toMatchObject({
      text: '旁白内容',
      voiceId: 'voice-project',
      options: { rate: 1.5 },
    });
    expect(ffmpegManager.concatAudioClips).not.toHaveBeenCalled();
  });

  it('多段分别配音后按序拼接，成品绑定 owner', async () => {
    const parts = [makeAsset('p1'), makeAsset('p2'), makeAsset('p3')];
    const generateAudioSpy = vi.spyOn(service, 'generateAudio')
      .mockResolvedValueOnce(parts[0])
      .mockResolvedValueOnce(parts[1])
      .mockResolvedValueOnce(parts[2]);
    (ffmpegManager.concatAudioClips as any).mockResolvedValue('/proj/shots/shot_1/voice-merged.mp3');
    const merged = makeAsset('merged');
    (persistMediaAsset as any).mockResolvedValue(merged);

    const result = await service.generateShotAudioWithSegments({
      projectId: 'p1',
      ownerRef: OWNER,
      segments: [
        { text: '旁白一句', voiceId: 'voice-project' },
        { text: '宁卓说：你们来了', voiceId: 'voice-hero' },
        { text: '老者说：该收场了', voiceId: 'voice-elder' },
      ],
    });

    // 三段各调一次 generateAudio，voiceId 各按其段
    expect(generateAudioSpy).toHaveBeenCalledTimes(3);
    expect(generateAudioSpy.mock.calls.map(c => c[0].request.voiceId)).toEqual([
      'voice-project', 'voice-hero', 'voice-elder',
    ]);
    // 按序拼接
    expect(ffmpegManager.concatAudioClips).toHaveBeenCalledWith(
      [parts[0].localPath, parts[1].localPath, parts[2].localPath],
      expect.stringContaining('shot_1'),
    );
    // 成品持久化并绑定 owner
    expect(persistMediaAsset).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'audio',
      source: expect.stringContaining('shot_1'),
    }));
    expect(bindOwnerRefMedia).toHaveBeenCalledWith('p1', OWNER, merged);
    expect(result).toBe(merged);
  });

  it('拼接失败回退用第一段（不整段失败）', async () => {
    const parts = [makeAsset('p1'), makeAsset('p2')];
    vi.spyOn(service, 'generateAudio')
      .mockResolvedValueOnce(parts[0])
      .mockResolvedValueOnce(parts[1]);
    (ffmpegManager.concatAudioClips as any).mockRejectedValue(new Error('ffmpeg boom'));

    const result = await service.generateShotAudioWithSegments({
      projectId: 'p1',
      ownerRef: OWNER,
      segments: [
        { text: '旁白', voiceId: 'voice-project' },
        { text: '台词', voiceId: 'voice-hero' },
      ],
    });

    expect(result).toBe(parts[0]);
    expect(persistMediaAsset).not.toHaveBeenCalled();
  });
});
