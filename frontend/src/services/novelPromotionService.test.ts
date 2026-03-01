import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();

describe('novelPromotionService workflowAPI', () => {
  beforeEach(() => {
    vi.resetModules();
    mockInvoke.mockReset();
    (window as any).electronAPI = {
      ipc: {
        invoke: mockInvoke,
      },
    };
  });

  it('submits story-to-script via workflow channel', async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { taskId: 'task_story_1' } });
    const { workflowAPI } = await import('./novelPromotionService');

    const payload = {
      projectId: 'project-1',
      episodeId: 'episode-1',
      novelText: 'test novel text',
      theme: 'modern',
      videoRatio: '16:9',
    };

    const result = await workflowAPI.storyToScript(payload);

    expect(result).toEqual({ taskId: 'task_story_1' });
    expect(mockInvoke).toHaveBeenCalledWith('novel-promotion:workflow:story-to-script', payload);
  });

  it('submits script-to-storyboard via workflow channel', async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { taskId: 'task_storyboard_1' } });
    const { workflowAPI } = await import('./novelPromotionService');

    const payload = {
      projectId: 'project-1',
      episodeId: 'episode-1',
      clipId: 'clip-1',
      clipContent: 'clip content',
      characters: [{ name: 'A', description: 'desc' }],
      location: 'room',
    };

    const result = await workflowAPI.scriptToStoryboard(payload);

    expect(result).toEqual({ taskId: 'task_storyboard_1' });
    expect(mockInvoke).toHaveBeenCalledWith('novel-promotion:workflow:script-to-storyboard', payload);
  });

  it('throws normalized error when workflow channel fails', async () => {
    mockInvoke.mockResolvedValue({
      ok: false,
      error: {
        code: 'WORKFLOW_STORY_TO_SCRIPT_ERROR',
        message: 'workflow failed',
      },
    });

    const { workflowAPI } = await import('./novelPromotionService');

    await expect(
      workflowAPI.storyToScript({
        projectId: 'project-1',
        episodeId: 'episode-1',
        novelText: 'bad payload',
      })
    ).rejects.toThrow('workflow failed');
  });
});
