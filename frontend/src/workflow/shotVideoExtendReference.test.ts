import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shot } from '../types';

vi.mock('../services/mediaAssetResolver', () => ({
  resolveProviderAssetInput: vi.fn(),
}));

import {
  buildShotVideoExtendPlan,
  compileShotVideoExtendMentions,
} from './shotVideoExtendReference';
import { resolveProviderAssetInput } from '../services/mediaAssetResolver';

function createShot(partial: Partial<Shot>): Shot {
  return {
    id: 'shot',
    scriptLines: [],
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 10,
    characters: [],
    media: {},
    ...partial,
  } as Shot;
}

/** 上一镜：已出片 */
const PREVIOUS = createShot({
  id: 'shot-prev',
  duration: 12,
  media: {
    videos: [{ kind: 'video', localPath: '/tmp/prev.mp4', createdAt: 1 }],
    currentVideoIndex: 0,
  },
});

/** 本镜：手动选了延长承接 */
const EXTENDING = createShot({
  id: 'shot-current',
  videoReference: {
    mode: 'manual',
    usePreviousTailFrame: true,
    continuity: 'video-extend',
    sourceShotId: 'shot-prev',
  },
});

describe('buildShotVideoExtendPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveProviderAssetInput).mockResolvedValue({
      transport: 'remote-url',
      value: 'https://cdn.example.com/prev.mp4',
      mimeType: 'video/mp4',
    } as never);
  });

  it('把上一镜整段成片解析成视频参考，并生成延长声明', async () => {
    const plan = await buildShotVideoExtendPlan({
      shot: EXTENDING,
      allShots: [PREVIOUS, EXTENDING],
      durationSeconds: 8,
      promptProtocol: 'koma-jimeng',
    });

    expect(plan.reference?.value).toBe('https://cdn.example.com/prev.mp4');
    expect(plan.sourceShotId).toBe('shot-prev');
    expect(plan.promptPrefix).toContain('将 @video_file_1 延长 8 秒');
    expect(plan.promptPrefix).toContain('不要重新开场');
  });

  it('非延长模式的分镜不产生任何参考', async () => {
    const plan = await buildShotVideoExtendPlan({
      shot: createShot({
        id: 'shot-current',
        videoReference: { mode: 'manual', usePreviousTailFrame: true, continuity: 'tail-frame' },
      }),
      allShots: [PREVIOUS],
      durationSeconds: 8,
    });

    expect(plan.reference).toBeUndefined();
    expect(plan.promptPrefix).toBe('');
    expect(resolveProviderAssetInput).not.toHaveBeenCalled();
  });

  it('上一镜还没出片时降级为普通生成，不抛错', async () => {
    const plan = await buildShotVideoExtendPlan({
      shot: EXTENDING,
      allShots: [createShot({ id: 'shot-prev' }), EXTENDING],
      durationSeconds: 8,
    });

    expect(plan.reference).toBeUndefined();
    expect(plan.promptPrefix).toBe('');
  });

  it('素材解析失败时降级为普通生成，不抛错', async () => {
    vi.mocked(resolveProviderAssetInput).mockRejectedValue(new Error('上传失败'));

    const plan = await buildShotVideoExtendPlan({
      shot: EXTENDING,
      allShots: [PREVIOUS, EXTENDING],
      durationSeconds: 8,
    });

    expect(plan.reference).toBeUndefined();
  });
});

describe('compileShotVideoExtendMentions', () => {
  const plan = {
    reference: { transport: 'remote-url', value: 'https://cdn.example.com/prev.mp4' } as never,
    sourceShotId: 'shot-prev',
    promptPrefix: '',
  };

  it('把 @previous_video_clip 编译成协议占位符', () => {
    const { prompt } = compileShotVideoExtendMentions({
      prompt: '延长上一分镜视频：@previous_video_clip 上一分镜视频 —— 叶赎继续走向书架。',
      plan,
      promptProtocol: 'koma-jimeng',
    });

    expect(prompt).toBe('延长上一分镜视频：@video_file_1 —— 叶赎继续走向书架。');
  });

  it('默认协议下编译成 @Video N', () => {
    const { prompt } = compileShotVideoExtendMentions({
      prompt: '@previous_video_clip 继续。',
      plan,
    });

    expect(prompt).toBe('@Video 1 继续。');
  });

  it('没有可用素材时剥离映射符，保留可读文字', () => {
    const { prompt, stripped } = compileShotVideoExtendMentions({
      prompt: '延长：@previous_video_clip 上一分镜视频 —— 继续。',
      plan: { promptPrefix: '' },
    });

    expect(prompt).toBe('延长：上一镜画面 —— 继续。');
    expect(stripped).toBe(true);
  });
});
