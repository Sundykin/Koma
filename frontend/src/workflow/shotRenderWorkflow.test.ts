import { describe, expect, it, vi } from 'vitest';
import { batchRenderShots, getSelectedImageUrl, shotRenderWorkflow } from './shotRenderWorkflow';
import type { Character, Prop, Shot } from '../types';

function createBaseShot(overrides: Partial<Shot> = {}): Shot {
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

describe('shotRenderWorkflow', () => {
  it('prefers selected remote image path', () => {
    const shot = createBaseShot({
      imagePaths: ['file:///tmp/a.png', 'https://img.example.com/selected.png'],
      currentImageIndex: 1,
      imageUrl: 'https://img.example.com/fallback.png',
    });

    expect(getSelectedImageUrl(shot)).toBe('https://img.example.com/selected.png');
  });

  it('falls back to imageUrl when imagePaths is not remote', () => {
    const shot = createBaseShot({
      imagePaths: ['/local/path.png'],
      currentImageIndex: 0,
      imageUrl: 'https://img.example.com/fallback.png',
    });

    expect(getSelectedImageUrl(shot)).toBe('https://img.example.com/fallback.png');
  });

  it('returns failure when provider missing before task creation', async () => {
    const shot = createBaseShot();

    const markTaskFailed = vi.fn().mockResolvedValue({});
    const createTask = vi.fn().mockResolvedValue({ id: 'task-1' });
    const result = await shotRenderWorkflow(
      { projectId: 'p1', shot },
      () => {},
      {
        loadCharacters: vi.fn().mockResolvedValue([] as Character[]),
        loadProps: vi.fn().mockResolvedValue([] as Prop[]),
        getProjectTTSProvider: vi.fn().mockResolvedValue(null),
        getProjectITVProvider: vi.fn().mockResolvedValue(null),
        createTask,
        markTaskCompleted: vi.fn(),
        markTaskFailed,
        saveShotVersion: vi.fn(),
        getPromptTemplate: vi.fn().mockResolvedValue({ template: '{{description}}' }),
        fillTemplate: vi.fn().mockReturnValue('video prompt'),
        getThemeStylePrefixAsync: vi.fn().mockResolvedValue(''),
        parseMentions: vi.fn().mockReturnValue([]),
        logITVCall: vi.fn(),
        logTTSCall: vi.fn(),
        random: () => 0.123,
      }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('未配置 ITV 服务');
    expect(createTask).not.toHaveBeenCalled();
    expect(markTaskFailed).not.toHaveBeenCalled();
  });

  it('renders a shot successfully with dependency injection', async () => {
    const shot = createBaseShot({
      id: 'shot-success',
      dialogue: 'hello',
      videoPrompt: 'hero @char1 appears with @prop1',
      imageUrl: 'https://img.example.com/ref.png',
    });

    const saveShotVersion = vi.fn().mockResolvedValue({
      version: 2,
      videoPath: 'https://video.example.com/final.mp4',
      imagePath: 'https://img.example.com/ref.png',
      prompt: 'styled prompt',
      seed: 123,
      model: 'mock-itv',
      createdAt: Date.now(),
    });

    const markTaskCompleted = vi.fn().mockResolvedValue({});

    const result = await shotRenderWorkflow(
      { projectId: 'project-1', shot, stylePrompt: 'cinematic' },
      () => {},
      {
        loadCharacters: vi.fn().mockResolvedValue([
          { id: 'char1', name: 'Hero', role: 'protagonist', prompt: 'main hero', costumePhotoUrl: 'https://img.example.com/hero.png' },
        ] as Character[]),
        loadProps: vi.fn().mockResolvedValue([
          { id: 'prop1', name: 'Sword', prompt: 'silver sword', imageUrl: 'https://img.example.com/sword.png' },
        ] as Prop[]),
        getProjectTTSProvider: vi.fn().mockResolvedValue({
          config: { name: 'mock-tts' },
          listVoices: vi.fn().mockResolvedValue([{ id: 'voice-a' }]),
          synthesize: vi.fn().mockResolvedValue({ path: '/tmp/audio.wav' }),
        }),
        getProjectITVProvider: vi.fn().mockResolvedValue({
          config: { name: 'mock-itv-name', provider: 'mock-itv' },
          generateVideo: vi.fn().mockResolvedValue({ url: 'https://video.example.com/final.mp4', taskId: 'remote-1' }),
        }),
        createTask: vi.fn().mockResolvedValue({ id: 'task-2' }),
        markTaskCompleted,
        markTaskFailed: vi.fn(),
        saveShotVersion,
        getPromptTemplate: vi.fn(),
        fillTemplate: vi.fn(),
        getThemeStylePrefixAsync: vi.fn().mockResolvedValue('styled '),
        parseMentions: vi.fn().mockReturnValue([
          { type: 'char', id: 'char1', from: 5, to: 11 },
          { type: 'prop', id: 'prop1', from: 25, to: 31 },
        ]),
        logITVCall: vi.fn(),
        logTTSCall: vi.fn(),
        random: () => 0.555,
      }
    );

    expect(result.success).toBe(true);
    expect(result.shotId).toBe('shot-success');
    expect(markTaskCompleted).toHaveBeenCalledWith('project-1', 'task-2', 'https://video.example.com/final.mp4', 'https://video.example.com/final.mp4');
    expect(saveShotVersion).toHaveBeenCalled();
  });

  it('aggregates batch results', async () => {
    const shots = [
      createBaseShot({ id: 's1', imageUrl: 'https://img.example.com/s1.png' }),
      createBaseShot({ id: 's2', imageUrl: 'https://img.example.com/s2.png' }),
    ];

    const result = await batchRenderShots(
      { projectId: 'p2', shots },
      () => {},
      {
        loadCharacters: vi.fn().mockResolvedValue([] as Character[]),
        loadProps: vi.fn().mockResolvedValue([] as Prop[]),
        getProjectTTSProvider: vi.fn().mockResolvedValue(null),
        getProjectITVProvider: vi.fn().mockResolvedValue({
          config: { name: 'mock-itv', provider: 'mock-itv' },
          generateVideo: vi.fn().mockResolvedValue({ url: 'https://video.example.com/final.mp4' }),
        }),
        createTask: vi.fn().mockResolvedValue({ id: 'task-b' }),
        markTaskCompleted: vi.fn().mockResolvedValue({}),
        markTaskFailed: vi.fn().mockResolvedValue({}),
        saveShotVersion: vi.fn().mockResolvedValue({ version: 1 }),
        getPromptTemplate: vi.fn().mockResolvedValue({ template: '{{description}}' }),
        fillTemplate: vi.fn().mockReturnValue('prompt'),
        getThemeStylePrefixAsync: vi.fn().mockResolvedValue(''),
        parseMentions: vi.fn().mockReturnValue([]),
        logITVCall: vi.fn(),
        logTTSCall: vi.fn(),
        random: () => 0.111,
      }
    );

    expect(result.total).toBe(2);
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(2);
  });
});
