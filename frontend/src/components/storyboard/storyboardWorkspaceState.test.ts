import { beforeEach, describe, expect, it } from 'vitest';
import { getStoryboardWorkspaceKey } from '../../constants/storageKeys';
import {
  loadStoryboardWorkspaceState,
  saveStoryboardWorkspaceState,
} from './storyboardWorkspaceState';

describe('storyboardWorkspaceState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists and restores workspace state by project and episode', () => {
    saveStoryboardWorkspaceState('project-1', 'episode-1', {
      activePanel: 'script',
      workflowSessions: {
        export: {
          currentStep: 1,
          totalSteps: 2,
          activeExport: 'video',
          config: {
            scope: 'selected-shots',
            stillDurationSeconds: 6,
            imageFormat: 'png',
            superResolution: false,
            videoResolution: '1080p',
            videoFormat: 'mp4',
            includeAudio: false,
            includeSubtitles: true,
          },
          history: [],
          templates: [],
        },
      },
      context: {
        activeShotId: 'shot-2',
        selectedShotIds: ['shot-2', 'shot-4'],
      },
      updatedAt: 123,
    });

    expect(loadStoryboardWorkspaceState('project-1', 'episode-1')).toEqual({
      activePanel: 'script',
      workflowSessions: expect.objectContaining({
        export: expect.objectContaining({
          activeExport: 'video',
          config: expect.objectContaining({
            scope: 'selected-shots',
            stillDurationSeconds: 6,
          }),
        }),
      }),
      context: {
        activeShotId: 'shot-2',
        selectedShotIds: ['shot-2', 'shot-4'],
      },
      updatedAt: 123,
    });
  });

  it('returns null when stored state is invalid json', () => {
    window.localStorage.setItem(getStoryboardWorkspaceKey('project-1', 'episode-1'), '{broken');
    expect(loadStoryboardWorkspaceState('project-1', 'episode-1')).toBeNull();
  });
});
