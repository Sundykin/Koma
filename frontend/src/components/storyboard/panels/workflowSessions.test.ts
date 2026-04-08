import { describe, expect, it } from 'vitest';
import {
  createDefaultWorkflowPanelSessions,
  describeWorkflowSession,
  ensureWorkflowPanelSessions,
  resolveStoryboardScope,
} from './workflowSessions';

describe('workflowSessions', () => {
  it('resolves selected shot scope from storyboard context', () => {
    const shots = [
      { id: 'shot-1', scriptContent: 'A', shotType: 'medium', cameraMovement: 'static', duration: 3, characters: [] },
      { id: 'shot-2', scriptContent: 'B', shotType: 'medium', cameraMovement: 'static', duration: 4, characters: [] },
    ];

    const resolved = resolveStoryboardScope(
      shots,
      {
        activeShotId: 'shot-1',
        selectedShotIds: ['shot-2'],
        shotCount: 2,
      },
      'selected-shots',
    );

    expect(resolved.label).toBe('选中分镜');
    expect(resolved.shotIds).toEqual(['shot-2']);
    expect(resolved.isEmpty).toBe(false);
  });

  it('merges default workflow sessions and describes script session progress', () => {
    const sessions = ensureWorkflowPanelSessions({
      script: {
        currentStep: 4,
        scriptText: '原始文本',
        splitResults: ['镜头一', '镜头二'],
        applyMode: 'replace',
      },
    });

    const descriptor = describeWorkflowSession('script', sessions);

    expect(descriptor?.stepText).toBe('5/5');
    expect(descriptor?.draftText).toContain('2 条分镜草稿');
    expect(descriptor?.scopeText).toContain('替换本集分镜');
  });

  it('creates usable default panel sessions', () => {
    const sessions = createDefaultWorkflowPanelSessions();

    expect(sessions.script.applyMode).toBe('append');
    expect(sessions.inference.scope).toBe('current-chapter');
    expect(sessions.export.config.scope).toBe('all-shots');
    expect(sessions.export.config.stillDurationSeconds).toBe(5);
    expect(sessions.export.config.videoResolution).toBe('1080p');
    expect(sessions.export.templates.some((template) => template.source === 'builtin')).toBe(true);
  });
});
