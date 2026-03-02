import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EpisodeManager } from './EpisodeManager';

const mockProjectEpisodeManager = vi.fn((props: any) => (
  <div data-testid="project-episode-manager">
    <button data-testid="trigger-select" onClick={() => props.onEpisodeSelect({ id: 'ep1' })}>select</button>
    <button
      data-testid="trigger-create"
      onClick={() => props.onCreateEpisode({ number: 2, title: '新 Episode', status: 'draft' })}
    >
      create
    </button>
    <button data-testid="trigger-rename" onClick={() => props.onUpdateEpisode('ep1', { title: '重命名后' })}>
      rename
    </button>
    <button data-testid="trigger-delete" onClick={() => props.onDeleteEpisode('ep1')}>
      delete
    </button>
  </div>
));

vi.mock('../../../components/project/EpisodeManager', () => ({
  EpisodeManager: (props: any) => mockProjectEpisodeManager(props),
}));

describe('NovelPromotion EpisodeManager adapter', () => {
  beforeEach(() => {
    mockProjectEpisodeManager.mockClear();
  });

  it('maps episodes and controlled props to project EpisodeManager', () => {
    render(
      <EpisodeManager
        projectId="p1"
        episodes={[
          {
            id: 'ep1',
            projectId: 'p1',
            name: '第一集',
            novelText: '内容A',
            createdAt: 1,
            updatedAt: 2,
          },
        ]}
        currentEpisodeId="ep1"
        onEpisodeSelect={vi.fn()}
        onEpisodeCreate={vi.fn(async () => {})}
        onEpisodeRename={vi.fn(async () => {})}
        onEpisodeDelete={vi.fn(async () => {})}
      />
    );

    expect(screen.getByTestId('project-episode-manager')).toBeInTheDocument();

    const props = mockProjectEpisodeManager.mock.calls[0][0];
    expect(props.projectId).toBe('p1');
    expect(props.selectedEpisodeId).toBe('ep1');
    expect(props.compactMode).toBe(true);
    expect(props.createWithInput).toBe(true);
    expect(props.showScriptEditor).toBe(false);
    expect(props.episodes).toEqual([
      expect.objectContaining({
        id: 'ep1',
        projectId: 'p1',
        number: 1,
        title: '第一集',
        scriptText: '内容A',
        status: 'script',
      }),
    ]);
  });

  it('forwards callback payloads through adapter', async () => {
    const onEpisodeSelect = vi.fn();
    const onEpisodeCreate = vi.fn(async () => {});
    const onEpisodeRename = vi.fn(async () => {});
    const onEpisodeDelete = vi.fn(async () => {});

    render(
      <EpisodeManager
        projectId="p1"
        episodes={[
          {
            id: 'ep1',
            projectId: 'p1',
            name: '第一集',
            novelText: '',
            createdAt: 1,
            updatedAt: 2,
          },
        ]}
        currentEpisodeId="ep1"
        onEpisodeSelect={onEpisodeSelect}
        onEpisodeCreate={onEpisodeCreate}
        onEpisodeRename={onEpisodeRename}
        onEpisodeDelete={onEpisodeDelete}
      />
    );

    fireEvent.click(screen.getByTestId('trigger-select'));
    fireEvent.click(screen.getByTestId('trigger-create'));
    fireEvent.click(screen.getByTestId('trigger-rename'));
    fireEvent.click(screen.getByTestId('trigger-delete'));

    expect(onEpisodeSelect).toHaveBeenCalledWith('ep1');
    expect(onEpisodeCreate).toHaveBeenCalledWith('新 Episode');
    expect(onEpisodeRename).toHaveBeenCalledWith('ep1', '重命名后');
    expect(onEpisodeDelete).toHaveBeenCalledWith('ep1');
  });
});
