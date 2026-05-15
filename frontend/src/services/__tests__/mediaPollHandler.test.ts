import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { delegateToRendererMock, registerHandlerMock } = vi.hoisted(() => ({
  delegateToRendererMock: vi.fn(),
  registerHandlerMock: vi.fn(),
}));

vi.mock('../../../../electron/service/tasks/delegate', () => ({
  delegateToRenderer: delegateToRendererMock,
}));

vi.mock('../../../../electron/service/tasks/TaskRunner', () => ({
  taskRunner: {
    registerHandler: registerHandlerMock,
  },
}));

import {
  __createMediaPollHandlerForTesting,
  __mediaPollConstantsForTesting,
} from '../../../../electron/service/tasks/handlers/mediaPoll';

function createContext() {
  const controller = new AbortController();
  return {
    taskId: 'task-local-1',
    input: {
      kind: 'video',
      remoteTaskId: 'remote-task-1',
      rendererHandlerType: 'itv',
      projectId: 'project-1',
    },
    scope: 'project:project-1',
    targetKind: 'shot',
    targetId: 'shot-1',
    signal: controller.signal,
    onProgress: vi.fn(),
    patch: vi.fn(),
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('media poll handler snapshot resilience', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delegateToRendererMock.mockReset();
    registerHandlerMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    delegateToRendererMock.mockReset();
    registerHandlerMock.mockReset();
  });

  it('retries transient delegate snapshot timeouts instead of failing the media task', async () => {
    const handler = __createMediaPollHandlerForTesting('itv');
    let snapshotCalls = 0;
    delegateToRendererMock.mockImplementation(async (request: { type: string }) => {
      if (request.type === 'media:snapshot') {
        snapshotCalls += 1;
        if (snapshotCalls === 1) {
          throw new Error('delegateToRenderer timeout (120000ms) for type "media:snapshot"');
        }
        return {
          state: 'succeeded',
          progress: 100,
          output: { source: 'https://cdn.example.com/result.mp4' },
        };
      }
      return { asset: { kind: 'video', localPath: '/tmp/result.mp4' } };
    });

    const resultPromise = handler.run(createContext() as any);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(resultPromise).resolves.toEqual({ kind: 'video', localPath: '/tmp/result.mp4' });
    expect(snapshotCalls).toBe(2);
    expect(delegateToRendererMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      type: 'media:snapshot',
      timeoutMs: __mediaPollConstantsForTesting.SNAPSHOT_TIMEOUT_MS,
    }));
  });

  it('retries transient HTTP 5xx snapshot failures returned by the provider', async () => {
    const handler = __createMediaPollHandlerForTesting('itv');
    let snapshotCalls = 0;
    delegateToRendererMock.mockImplementation(async (request: { type: string }) => {
      if (request.type === 'media:snapshot') {
        snapshotCalls += 1;
        if (snapshotCalls === 1) {
          return { state: 'failed', progress: 0, error: '查询失败 HTTP 502' };
        }
        return {
          state: 'succeeded',
          progress: 100,
          output: { source: 'https://cdn.example.com/result.mp4' },
        };
      }
      return { asset: { kind: 'video', localPath: '/tmp/result.mp4' } };
    });

    const resultPromise = handler.run(createContext() as any);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(resultPromise).resolves.toEqual({ kind: 'video', localPath: '/tmp/result.mp4' });
    expect(snapshotCalls).toBe(2);
  });

  it('still fails immediately for explicit provider failures', async () => {
    const handler = __createMediaPollHandlerForTesting('itv');
    delegateToRendererMock.mockResolvedValueOnce({
      state: 'failed',
      progress: 100,
      error: '内容审核失败',
    });

    await expect(handler.run(createContext() as any)).rejects.toThrow('内容审核失败');
  });
});
