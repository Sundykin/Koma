import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RendererDelegateRequest } from '../../../electron/src/queue/types';

// Mock window.electronAPI
const mockElectronAPI = {
  onDelegateRequest: vi.fn(),
  sendDelegateResponse: vi.fn(),
};

const mockDeps = {
  getProjectTTSProvider: vi.fn(),
  getProjectITVProvider: vi.fn(),
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  vi.clearAllMocks();
});

describe('setupDelegateHandler', () => {
  it('registers delegate request handler', async () => {
    const { setupDelegateHandler } = await import('./delegateHandler');

    setupDelegateHandler(mockDeps);

    expect(mockElectronAPI.onDelegateRequest).toHaveBeenCalled();
  });

  describe('TTS delegation', () => {
    it('handles TTS request successfully', async () => {
      const { setupDelegateHandler } = await import('./delegateHandler');

      let requestHandler: any;
      mockElectronAPI.onDelegateRequest.mockImplementation((handler) => {
        requestHandler = handler;
      });

      const mockTTSProvider = {
        config: { name: 'mock-tts' },
        synthesize: vi.fn().mockResolvedValue({ path: '/tmp/audio.wav' }),
      };
      mockDeps.getProjectTTSProvider.mockResolvedValue(mockTTSProvider);

      setupDelegateHandler(mockDeps);

      const request: RendererDelegateRequest = {
        requestId: 'req-1',
        taskId: 'task-1',
        type: 'tts',
        payload: {
          projectId: 'proj-1',
          text: 'Hello world',
          voiceId: 'voice-1',
        },
      };

      await requestHandler(request);

      expect(mockDeps.getProjectTTSProvider).toHaveBeenCalledWith('proj-1');
      expect(mockTTSProvider.synthesize).toHaveBeenCalledWith('Hello world', 'voice-1');
      expect(mockElectronAPI.sendDelegateResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        taskId: 'task-1',
        success: true,
        result: { path: '/tmp/audio.wav' },
      });
    });

    it('handles TTS provider not found', async () => {
      let requestHandler: any;
      mockElectronAPI.onDelegateRequest.mockImplementation((handler) => {
        requestHandler = handler;
      });

      mockDeps.getProjectTTSProvider.mockResolvedValue(null);

      setupDelegateHandler(mockDeps);

      const request: RendererDelegateRequest = {
        requestId: 'req-2',
        taskId: 'task-2',
        type: 'tts',
        payload: {
          projectId: 'proj-1',
          text: 'Hello',
          voiceId: 'voice-1',
        },
      };

      await requestHandler(request);

      expect(mockElectronAPI.sendDelegateResponse).toHaveBeenCalledWith({
        requestId: 'req-2',
        taskId: 'task-2',
        success: false,
        error: 'TTS provider not found for project proj-1',
      });
    });

    it('handles TTS synthesis error', async () => {
      let requestHandler: any;
      mockElectronAPI.onDelegateRequest.mockImplementation((handler) => {
        requestHandler = handler;
      });

      const mockTTSProvider = {
        config: { name: 'mock-tts' },
        synthesize: vi.fn().mockRejectedValue(new Error('Synthesis failed')),
      };
      mockDeps.getProjectTTSProvider.mockResolvedValue(mockTTSProvider);

      setupDelegateHandler(mockDeps);

      const request: RendererDelegateRequest = {
        requestId: 'req-3',
        taskId: 'task-3',
        type: 'tts',
        payload: {
          projectId: 'proj-1',
          text: 'Hello',
          voiceId: 'voice-1',
        },
      };

      await requestHandler(request);

      expect(mockElectronAPI.sendDelegateResponse).toHaveBeenCalledWith({
        requestId: 'req-3',
        taskId: 'task-3',
        success: false,
        error: 'Synthesis failed',
      });
    });
  });

  describe('ITV delegation', () => {
    it('handles ITV request successfully', async () => {
      let requestHandler: any;
      mockElectronAPI.onDelegateRequest.mockImplementation((handler) => {
        requestHandler = handler;
      });

      const mockITVProvider = {
        config: { name: 'mock-itv', provider: 'mock' },
        generateVideo: vi.fn().mockResolvedValue({
          url: 'https://example.com/video.mp4',
          taskId: 'remote-1',
        }),
      };
      mockDeps.getProjectITVProvider.mockResolvedValue(mockITVProvider);

      setupDelegateHandler(mockDeps);

      const request: RendererDelegateRequest = {
        requestId: 'req-4',
        taskId: 'task-4',
        type: 'itv',
        payload: {
          projectId: 'proj-1',
          prompt: 'A hero appears',
          imageUrl: 'https://example.com/ref.png',
          seed: 123,
        },
      };

      await requestHandler(request);

      expect(mockDeps.getProjectITVProvider).toHaveBeenCalledWith('proj-1');
      expect(mockITVProvider.generateVideo).toHaveBeenCalledWith(
        'A hero appears',
        'https://example.com/ref.png',
        123
      );
      expect(mockElectronAPI.sendDelegateResponse).toHaveBeenCalledWith({
        requestId: 'req-4',
        taskId: 'task-4',
        success: true,
        result: {
          url: 'https://example.com/video.mp4',
          taskId: 'remote-1',
        },
      });
    });

    it('handles ITV provider not found', async () => {
      let requestHandler: any;
      mockElectronAPI.onDelegateRequest.mockImplementation((handler) => {
        requestHandler = handler;
      });

      mockDeps.getProjectITVProvider.mockResolvedValue(null);

      setupDelegateHandler(mockDeps);

      const request: RendererDelegateRequest = {
        requestId: 'req-5',
        taskId: 'task-5',
        type: 'itv',
        payload: {
          projectId: 'proj-1',
          prompt: 'A hero appears',
          imageUrl: 'https://example.com/ref.png',
          seed: 123,
        },
      };

      await requestHandler(request);

      expect(mockElectronAPI.sendDelegateResponse).toHaveBeenCalledWith({
        requestId: 'req-5',
        taskId: 'task-5',
        success: false,
        error: 'ITV provider not found for project proj-1',
      });
    });

    it('handles ITV generation error', async () => {
      let requestHandler: any;
      mockElectronAPI.onDelegateRequest.mockImplementation((handler) => {
        requestHandler = handler;
      });

      const mockITVProvider = {
        config: { name: 'mock-itv', provider: 'mock' },
        generateVideo: vi.fn().mockRejectedValue(new Error('Generation failed')),
      };
      mockDeps.getProjectITVProvider.mockResolvedValue(mockITVProvider);

      setupDelegateHandler(mockDeps);

      const request: RendererDelegateRequest = {
        requestId: 'req-6',
        taskId: 'task-6',
        type: 'itv',
        payload: {
          projectId: 'proj-1',
          prompt: 'A hero appears',
          imageUrl: 'https://example.com/ref.png',
          seed: 123,
        },
      };

      await requestHandler(request);

      expect(mockElectronAPI.sendDelegateResponse).toHaveBeenCalledWith({
        requestId: 'req-6',
        taskId: 'task-6',
        success: false,
        error: 'Generation failed',
      });
    });
  });

  describe('Unknown delegation type', () => {
    it('handles unknown delegation type', async () => {
      let requestHandler: any;
      mockElectronAPI.onDelegateRequest.mockImplementation((handler) => {
        requestHandler = handler;
      });

      setupDelegateHandler(mockDeps);

      const request: any = {
        requestId: 'req-7',
        taskId: 'task-7',
        type: 'unknown',
        payload: {},
      };

      await requestHandler(request);

      expect(mockElectronAPI.sendDelegateResponse).toHaveBeenCalledWith({
        requestId: 'req-7',
        taskId: 'task-7',
        success: false,
        error: 'Unknown delegate type: unknown',
      });
    });
  });
});
