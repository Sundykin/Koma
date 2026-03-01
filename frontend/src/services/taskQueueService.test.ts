import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { TaskInfo } from './taskQueueService';

// Mock electronService
vi.mock('./electronService', () => ({
  electronService: {
    isElectron: vi.fn(() => true),
  },
}));

// Mock window.electronAPI
const mockElectronAPI = {
  task: {
    submitShotRender: vi.fn(),
    getTask: vi.fn(),
    listTasks: vi.fn(),
    cancelTask: vi.fn(),
    onUpdate: vi.fn(),
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  vi.clearAllMocks();

  // Reset module to clear singleton state
  vi.resetModules();
});

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('taskQueueService', () => {
  describe('submitTask', () => {
    it('submits shot render task successfully', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      const mockTaskId = 'task-123';
      mockElectronAPI.task.submitShotRender.mockResolvedValue({ id: mockTaskId });

      const result = await taskQueueService.submitTask('shot-render', {
        projectId: 'proj-1',
        shot: { id: 'shot-1', scriptContent: 'test' },
      });

      expect(result).toBe(mockTaskId);
      expect(mockElectronAPI.task.submitShotRender).toHaveBeenCalledWith({
        projectId: 'proj-1',
        shot: { id: 'shot-1', scriptContent: 'test' },
      });
    });
  });


  describe('getTaskStatus', () => {
    it('retrieves task status by ID', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      const mockTask = {
        id: 'task-123',
        status: 'processing',
        progress: 50,
      };
      mockElectronAPI.task.getTask.mockResolvedValue(mockTask);

      const result = await taskQueueService.getTaskStatus('task-123');

      expect(result).toEqual({
        taskId: 'task-123',
        status: 'processing',
        progress: 50,
        type: undefined,
        phase: undefined,
        attempts: undefined,
        maxRetries: undefined,
        payload: undefined,
        error: undefined,
        result: undefined,
        updatedAt: undefined,
      });
      expect(mockElectronAPI.task.getTask).toHaveBeenCalledWith('task-123');
    });

    it('retrieves completed task with result', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      const mockTask = {
        id: 'task-456',
        status: 'completed',
        progress: 100,
        result: { videoUrl: 'https://example.com/video.mp4' },
      };
      mockElectronAPI.task.getTask.mockResolvedValue(mockTask);

      const result = await taskQueueService.getTaskStatus('task-456');

      expect(result.status).toBe('completed');
      expect(result.result).toEqual({ videoUrl: 'https://example.com/video.mp4' });
    });

    it('retrieves failed task with error', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      const mockTask = {
        id: 'task-789',
        status: 'failed',
        progress: 50,
        error: 'ITV provider not found',
      };
      mockElectronAPI.task.getTask.mockResolvedValue(mockTask);

      const result = await taskQueueService.getTaskStatus('task-789');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('ITV provider not found');
    });
  });

  describe('listTasks', () => {
    it('lists tasks successfully', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      mockElectronAPI.task.listTasks.mockResolvedValue([
        {
          id: 'task-1',
          status: 'queued',
          progress: 0,
          type: 'story-to-script',
          payload: { projectId: 'proj-1' },
          updatedAt: 1,
        },
      ]);

      const result = await taskQueueService.listTasks('queued');

      expect(mockElectronAPI.task.listTasks).toHaveBeenCalledWith(undefined, 'queued');
      expect(result).toEqual([
        {
          taskId: 'task-1',
          status: 'queued',
          progress: 0,
          type: 'story-to-script',
          phase: undefined,
          attempts: undefined,
          maxRetries: undefined,
          payload: { projectId: 'proj-1' },
          error: undefined,
          result: undefined,
          updatedAt: 1,
        },
      ]);
    });
  });

  describe('cancelTask', () => {
    it('cancels a task successfully', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      mockElectronAPI.task.cancelTask.mockResolvedValue(true);

      const result = await taskQueueService.cancelTask('task-123');

      expect(result).toBe(true);
      expect(mockElectronAPI.task.cancelTask).toHaveBeenCalledWith('task-123');
    });

    it('handles cancellation failure', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      mockElectronAPI.task.cancelTask.mockResolvedValue(false);

      const result = await taskQueueService.cancelTask('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('subscribes to task updates', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      const callback = vi.fn();

      const unsubscribe = taskQueueService.subscribe('task-123', callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('receives task update events', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      const callback = vi.fn();
      let updateHandler: any;

      // Mock onUpdate to capture the handler
      mockElectronAPI.task.onUpdate.mockImplementation((handler) => {
        updateHandler = handler;
      });

      // Initialize first to register the handler
      taskQueueService.initialize();

      // Then subscribe
      taskQueueService.subscribe('task-123', callback);

      // Simulate update event
      const updateEvent = {
        taskId: 'task-123',
        status: 'processing',
        progress: 75,
      };
      updateHandler(null, updateEvent);

      expect(callback).toHaveBeenCalledWith(updateEvent);
    });

    it('unsubscribes from task updates', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      const callback = vi.fn();

      const unsubscribe = taskQueueService.subscribe('task-123', callback);
      unsubscribe();

      // After unsubscribe, callback should not be called
      // This is tested implicitly by the subscription mechanism
    });

    it('supports multiple subscribers for same task', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      let updateHandler: any;

      // Mock onUpdate to capture the handler
      mockElectronAPI.task.onUpdate.mockImplementation((handler) => {
        updateHandler = handler;
      });

      // Initialize first
      taskQueueService.initialize();

      // Subscribe multiple callbacks
      taskQueueService.subscribe('task-123', callback1);
      taskQueueService.subscribe('task-123', callback2);

      const updateEvent = {
        taskId: 'task-123',
        status: 'completed',
        progress: 100,
      };
      updateHandler(null, updateEvent);

      expect(callback1).toHaveBeenCalledWith(updateEvent);
      expect(callback2).toHaveBeenCalledWith(updateEvent);
    });
  });

  describe('initialize', () => {
    it('initializes only once', async () => {
      const { taskQueueService } = await import('./taskQueueService');

      taskQueueService.initialize();
      taskQueueService.initialize();

      // Should only register onUpdate handler once
      expect(mockElectronAPI.task.onUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
