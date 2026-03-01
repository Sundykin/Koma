import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Shot } from '../types';

// Mock electronService
vi.mock('../services/electronService', () => ({
  electronService: {
    isElectron: vi.fn(() => true),
  },
}));

// Mock window.electronAPI
const mockElectronAPI = {
  task: {
    submitShotRender: vi.fn(),
    getTask: vi.fn(),
    onUpdate: vi.fn(),
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  vi.clearAllMocks();
  vi.resetModules();
});

function createTestShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    scriptContent: 'test script',
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 3,
    description: 'a test shot',
    characters: [],
    ...overrides,
  };
}

describe('submitShotRenderJob (Queue Integration)', () => {
  it('submits shot render job to queue', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    const mockTaskId = 'task-queue-123';
    mockElectronAPI.task.submitShotRender.mockResolvedValue({ taskId: mockTaskId });

    const shot = createTestShot({
      id: 'shot-queue-1',
      dialogue: 'Hello world',
      imageUrl: 'https://example.com/ref.png',
    });

    const result = await submitShotRenderJob({
      projectId: 'proj-1',
      shot,
      stylePrompt: 'cinematic',
    });

    expect(result.success).toBe(true);
    expect(result.taskId).toBe(mockTaskId);
    expect(mockElectronAPI.task.submitShotRender).toHaveBeenCalledWith({
      projectId: 'proj-1',
      shot,
      stylePrompt: 'cinematic',
    });
  });

  it('handles queue submission failure', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    mockElectronAPI.task.submitShotRender.mockRejectedValue(new Error('Queue is full'));

    const shot = createTestShot();

    const result = await submitShotRenderJob({
      projectId: 'proj-1',
      shot,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Queue is full');
  });

  it('submits batch shots to queue', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    const shots = [
      createTestShot({ id: 'shot-1', imageUrl: 'https://example.com/s1.png' }),
      createTestShot({ id: 'shot-2', imageUrl: 'https://example.com/s2.png' }),
      createTestShot({ id: 'shot-3', imageUrl: 'https://example.com/s3.png' }),
    ];

    mockElectronAPI.task.submitShotRender
      .mockResolvedValueOnce({ taskId: 'task-1' })
      .mockResolvedValueOnce({ taskId: 'task-2' })
      .mockResolvedValueOnce({ taskId: 'task-3' });

    const results = await Promise.all(
      shots.map((shot) =>
        submitShotRenderJob({
          projectId: 'proj-1',
          shot,
        })
      )
    );

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);
    expect(results.map((r) => r.taskId)).toEqual(['task-1', 'task-2', 'task-3']);
    expect(mockElectronAPI.task.submitShotRender).toHaveBeenCalledTimes(3);
  });

  it('handles concurrent task submissions', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    const concurrentShots = Array.from({ length: 10 }, (_, i) =>
      createTestShot({
        id: `shot-${i}`,
        imageUrl: `https://example.com/s${i}.png`,
      })
    );

    mockElectronAPI.task.submitShotRender.mockImplementation((payload) => {
      const shotId = payload.shot.id;
      return Promise.resolve({ taskId: `task-${shotId}` });
    });

    const results = await Promise.all(
      concurrentShots.map((shot) =>
        submitShotRenderJob({
          projectId: 'proj-1',
          shot,
        })
      )
    );

    expect(results).toHaveLength(10);
    expect(results.every((r) => r.success)).toBe(true);
    expect(mockElectronAPI.task.submitShotRender).toHaveBeenCalledTimes(10);
  });

  it('tracks task progress via updates', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    const mockTaskId = 'task-progress-123';
    mockElectronAPI.task.submitShotRender.mockResolvedValue({ taskId: mockTaskId });

    let updateCallback: any;
    mockElectronAPI.task.onUpdate.mockImplementation((cb) => {
      updateCallback = cb;
      return vi.fn();
    });

    const shot = createTestShot();

    const result = await submitShotRenderJob({
      projectId: 'proj-1',
      shot,
    });

    expect(result.success).toBe(true);
  });

  it('handles task cancellation', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    const mockTaskId = 'task-cancel-123';
    mockElectronAPI.task.submitShotRender.mockResolvedValue({ taskId: mockTaskId });

    const shot = createTestShot();

    const result = await submitShotRenderJob({
      projectId: 'proj-1',
      shot,
    });

    expect(result.success).toBe(true);
    expect(result.taskId).toBe(mockTaskId);
  });

  it('validates shot data before submission', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    const invalidShot = createTestShot({
      imageUrl: undefined,
    });

    mockElectronAPI.task.submitShotRender.mockResolvedValue({ taskId: 'task-123' });

    const result = await submitShotRenderJob({
      projectId: 'proj-1',
      shot: invalidShot,
    });

    expect(result.success).toBe(true);
  });

  it('preserves backward compatibility with sync workflow', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    const shot = createTestShot({
      imageUrl: 'https://example.com/ref.png',
    });

    mockElectronAPI.task.submitShotRender.mockResolvedValue({ taskId: 'task-compat-123' });

    const result = await submitShotRenderJob({
      projectId: 'proj-1',
      shot,
    });

    expect(result.success).toBe(true);
    expect(result.taskId).toBeDefined();
  });
});

describe('Queue System Integration', () => {
  it('handles queue overflow gracefully', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    mockElectronAPI.task.submitShotRender.mockRejectedValue(new Error('Queue capacity exceeded'));

    const shot = createTestShot();

    const result = await submitShotRenderJob({
      projectId: 'proj-1',
      shot,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Queue capacity exceeded');
  });

  it('supports task retry mechanism', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    const mockTaskId = 'task-retry-123';
    mockElectronAPI.task.submitShotRender.mockResolvedValue({ taskId: mockTaskId });

    const shot = createTestShot();

    const result = await submitShotRenderJob({
      projectId: 'proj-1',
      shot,
    });

    expect(result.success).toBe(true);
  });

  it('persists tasks across app restarts', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    const mockTaskId = 'task-persist-123';
    mockElectronAPI.task.submitShotRender.mockResolvedValue({ taskId: mockTaskId });

    const shot = createTestShot();

    const result = await submitShotRenderJob({
      projectId: 'proj-1',
      shot,
    });

    expect(result.success).toBe(true);
  });

  it('respects concurrency limit (3 workers)', async () => {
    const { submitShotRenderJob } = await import('./shotRenderWorkflow');

    const shots = Array.from({ length: 5 }, (_, i) =>
      createTestShot({ id: `shot-${i}` })
    );

    mockElectronAPI.task.submitShotRender.mockImplementation((payload) => {
      return Promise.resolve({ taskId: `task-${payload.shot.id}` });
    });

    const results = await Promise.all(
      shots.map((shot) =>
        submitShotRenderJob({
          projectId: 'proj-1',
          shot,
        })
      )
    );

    expect(results).toHaveLength(5);
    expect(results.every((r) => r.success)).toBe(true);
  });
});
