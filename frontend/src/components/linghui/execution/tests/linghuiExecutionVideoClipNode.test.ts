import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';
import type { LinghuiNodeResult } from '../../../../types/linghui';

vi.mock('../../../../services/ffmpegManager', () => ({
  ffmpegManager: {
    getCacheDir: vi.fn().mockResolvedValue('/tmp/koma-ffmpeg/linghui-video-clip'),
    concatMediaClips: vi.fn().mockResolvedValue('/tmp/koma-ffmpeg/linghui-video-clip/out.mp4'),
  },
}));

function createVideoClipNode(params?: {
  clips?: Record<string, unknown>[];
  slot0?: LinghuiNodeResult[];
  slot1?: LinghuiNodeResult[];
  slot2?: LinghuiNodeResult[];
}): ExecutionNodeView {
  const slot0 = params?.slot0 ?? [];
  const slot1 = params?.slot1 ?? [];
  const slot2 = params?.slot2 ?? [];
  return {
    id: 'video-clip-1',
    type: 'linghui/video-clip',
    title: '视频合成',
    properties: {
      clips: params?.clips ?? [],
      resolution: '1080p',
      fps: 30,
      imageDurationSec: 3,
      source: '',
      posterSource: '',
      status: 'idle',
    },
    getAllInputResults(slot) {
      if (slot === 0) return slot0;
      if (slot === 1) return slot1;
      if (slot === 2) return slot2;
      return [];
    },
    getAllInputImages() {
      return slot1;
    },
    getInputResult() {
      return undefined;
    },
    getPromptReferences() {
      return [];
    },
  };
}

describe('executeVideoClipNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses explicit clips and calls FFmpeg concat', async () => {
    const { executeVideoClipNode } = await import('../state/linghuiExecutionNodeExecutors');
    const { ffmpegManager } = await import('../../../../services/ffmpegManager');

    const result = await executeVideoClipNode(createVideoClipNode({
      clips: [
        { id: 'v1', kind: 'video', source: 'koma-local://files/tmp/a.mp4', label: 'A' },
        { id: 'i1', kind: 'image', source: 'koma-local://files/tmp/b.png', label: 'B' },
      ],
    }));

    expect(ffmpegManager.concatMediaClips).toHaveBeenCalledWith(expect.objectContaining({
      clips: [
        { kind: 'video', source: '/tmp/a.mp4', durationSec: undefined, label: 'A' },
        { kind: 'image', source: '/tmp/b.png', durationSec: 3, label: 'B' },
      ],
      outputPath: expect.stringMatching(/video-clip-1-.*\.mp4$/),
      width: 1920,
      height: 1080,
      fps: 30,
      imageDurationSec: 3,
    }));
    expect(result.kind).toBe('video');
    if (result.kind !== 'video') {
      throw new Error('Expected video result');
    }
    expect(result.primary.source).toBe('/tmp/koma-ffmpeg/linghui-video-clip/out.mp4');
  });

  it('falls back to upstream video and image inputs', async () => {
    const { executeVideoClipNode } = await import('../state/linghuiExecutionNodeExecutors');
    const { ffmpegManager } = await import('../../../../services/ffmpegManager');

    await executeVideoClipNode(createVideoClipNode({
      slot0: [{ kind: 'video', primary: { kind: 'video', source: '/tmp/upstream.mp4', label: '上游视频' } }],
      slot1: [{ kind: 'image', primary: { kind: 'image', source: '/tmp/still.png', label: '上游图片' } }],
    }));

    expect(ffmpegManager.concatMediaClips).toHaveBeenCalledWith(expect.objectContaining({
      clips: [
        { kind: 'video', source: '/tmp/upstream.mp4', durationSec: undefined, label: '上游视频' },
        { kind: 'image', source: '/tmp/still.png', durationSec: 3, label: '上游图片' },
      ],
    }));
  });

  it('allows one video plus one audio input like LibTV', async () => {
    const { executeVideoClipNode } = await import('../state/linghuiExecutionNodeExecutors');
    const { ffmpegManager } = await import('../../../../services/ffmpegManager');

    await executeVideoClipNode(createVideoClipNode({
      slot0: [{ kind: 'video', primary: { kind: 'video', source: '/tmp/upstream.mp4', label: '上游视频' } }],
      slot2: [{ kind: 'audio', primary: { kind: 'audio', source: '/tmp/music.mp3', label: '配乐' } }],
    }));

    expect(ffmpegManager.concatMediaClips).toHaveBeenCalledWith(expect.objectContaining({
      clips: [
        { kind: 'video', source: '/tmp/upstream.mp4', durationSec: undefined, label: '上游视频' },
        { kind: 'audio', source: '/tmp/music.mp3', durationSec: undefined, label: '配乐' },
      ],
    }));
  });

  it('rejects when fewer than two clips are available', async () => {
    const { executeVideoClipNode } = await import('../state/linghuiExecutionNodeExecutors');

    await expect(executeVideoClipNode(createVideoClipNode({
      clips: [{ id: 'v1', kind: 'video', source: '/tmp/a.mp4' }],
    }))).rejects.toThrow('请连接2个及以上的视频/音频后操作');
  });
});
