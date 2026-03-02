import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigStage } from './index';
import type { Episode } from '../types';

function buildEpisode(overrides: Partial<Episode>): Episode {
  return {
    id: 'ep1',
    projectId: 'p1',
    name: '第一集',
    novelText: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('ConfigStage', () => {
  it('syncs textarea content when switching episode', () => {
    const onEpisodeUpdate = vi.fn(async () => {});
    const onGenerateScript = vi.fn(async () => {});

    const { rerender } = render(
      <ConfigStage
        projectId="p1"
        episode={buildEpisode({ id: 'ep1', novelText: '旧内容' })}
        onEpisodeUpdate={onEpisodeUpdate}
        onGenerateScript={onGenerateScript}
      />
    );

    const textarea = screen.getByPlaceholderText(/在此输入小说文本/) as HTMLTextAreaElement;
    expect(textarea.value).toBe('旧内容');

    rerender(
      <ConfigStage
        projectId="p1"
        episode={buildEpisode({ id: 'ep2', novelText: '新内容' })}
        onEpisodeUpdate={onEpisodeUpdate}
        onGenerateScript={onGenerateScript}
      />
    );

    expect((screen.getByPlaceholderText(/在此输入小说文本/) as HTMLTextAreaElement).value).toBe('新内容');
  });

  it('clears previous validation error after switching episode', () => {
    const onEpisodeUpdate = vi.fn(async () => {});
    const onGenerateScript = vi.fn(async () => {});

    const { rerender } = render(
      <ConfigStage
        projectId="p1"
        episode={null}
        onEpisodeUpdate={onEpisodeUpdate}
        onGenerateScript={onGenerateScript}
      />
    );

    const textarea = screen.getByPlaceholderText(/在此输入小说文本/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '临时文本' } });
    fireEvent.click(screen.getByRole('button', { name: /生成剧本/ }));
    expect(screen.getByText('请先选择一个 Episode')).toBeInTheDocument();

    rerender(
      <ConfigStage
        projectId="p1"
        episode={buildEpisode({ id: 'ep2', novelText: '切换后的内容' })}
        onEpisodeUpdate={onEpisodeUpdate}
        onGenerateScript={onGenerateScript}
      />
    );

    expect(screen.queryByText('请先选择一个 Episode')).not.toBeInTheDocument();
    expect((screen.getByPlaceholderText(/在此输入小说文本/) as HTMLTextAreaElement).value).toBe('切换后的内容');
  });
});
