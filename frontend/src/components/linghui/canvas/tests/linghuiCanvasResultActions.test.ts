import { describe, expect, it } from 'vitest';
import type { LinghuiNodeRunState } from '../../../../types/linghui';
import {
  resolveLinghuiCanvasResultCopyPayload,
  resolveLinghuiCanvasResultCopyState,
} from '../state/linghuiCanvasResultActions';

describe('linghuiCanvasResultActions', () => {
  it('copies text results from node run state', () => {
    const runState: LinghuiNodeRunState = {
      status: 'succeeded',
      result: {
        kind: 'text',
        text: '成片脚本',
      },
    };

    expect(resolveLinghuiCanvasResultCopyState(runState)).toEqual(expect.objectContaining({
      canCopyText: true,
      canCopyMedia: false,
      canCopyTaskId: false,
    }));
    expect(resolveLinghuiCanvasResultCopyPayload(runState, 'text')).toEqual(expect.objectContaining({
      value: '成片脚本',
      successMessage: '已复制结果文本',
    }));
  });

  it('copies media sources with remote URLs preferred over local paths', () => {
    const runState: LinghuiNodeRunState = {
      status: 'succeeded',
      result: {
        kind: 'images',
        primary: {
          kind: 'image',
          source: '/local/a.png',
          metadata: {
            persist: {
              remoteUrl: 'https://cdn.example.com/a.png',
              localPath: '/local/a.png',
            },
          },
        },
        items: [
          {
            kind: 'image',
            source: '/local/a.png',
            metadata: {
              persist: {
                remoteUrl: 'https://cdn.example.com/a.png',
              },
            },
          },
          {
            kind: 'image',
            source: '/local/b.png',
          },
        ],
      },
    };

    expect(resolveLinghuiCanvasResultCopyState(runState)).toEqual(expect.objectContaining({
      canCopyMedia: true,
      mediaLabel: '复制 2 个图片地址',
    }));
    expect(resolveLinghuiCanvasResultCopyPayload(runState, 'media')?.value).toBe([
      'https://cdn.example.com/a.png',
      '/local/b.png',
    ].join('\n'));
  });

  it('finds task ids from result metadata', () => {
    const runState: LinghuiNodeRunState = {
      status: 'succeeded',
      result: {
        kind: 'video',
        primary: {
          kind: 'video',
          source: '/local/result.mp4',
        },
        metadata: {
          providerTaskId: 'task-video-1',
        },
      },
    };

    expect(resolveLinghuiCanvasResultCopyState(runState).canCopyTaskId).toBe(true);
    expect(resolveLinghuiCanvasResultCopyPayload(runState, 'taskId')?.value).toBe('task-video-1');
  });

  it('falls back to storyboard shot text when no direct text exists', () => {
    const runState: LinghuiNodeRunState = {
      status: 'succeeded',
      result: {
        kind: 'storyboard',
        text: '',
        shots: [
          {
            id: 'shot-1',
            title: '开场',
            description: '主角推门进入',
            durationSec: 3,
          },
        ],
      },
    };

    expect(resolveLinghuiCanvasResultCopyPayload(runState, 'text')?.value).toBe('开场: 主角推门进入');
  });
});
