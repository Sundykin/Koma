import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useStageNavigation } from './useStageNavigation';
import type { Stage } from '../types';

function Probe(props: {
  episodeData?: {
    novelText?: string;
    clips?: unknown[];
    storyboards?: unknown[];
    videos?: unknown[];
  };
  runtimeSignals?: {
    runningStages?: Stage[];
    errorStages?: Stage[];
  };
}) {
  const { stageNavItems } = useStageNavigation({
    episodeData: props.episodeData,
    runtimeSignals: props.runtimeSignals,
  });

  return (
    <div>
      {stageNavItems.map((item) => (
        <div
          key={item.id}
          data-testid={`stage-${item.id}`}
          data-semantic-status={item.semanticStatus}
          data-legacy-status={item.status}
        />
      ))}
    </div>
  );
}

describe('useStageNavigation', () => {
  it('marks video stage done when videos exist', () => {
    render(
      <Probe
        episodeData={{
          novelText: 'story',
          clips: [{ id: 'c1' }],
          storyboards: [{ id: 's1' }],
          videos: [{ id: 'v1' }],
        }}
      />
    );

    expect(screen.getByTestId('stage-video')).toHaveAttribute('data-semantic-status', 'done');
    expect(screen.getByTestId('stage-video')).toHaveAttribute('data-legacy-status', 'ready');
  });

  it('prioritizes runtime error and running over base status', () => {
    render(
      <Probe
        episodeData={{
          novelText: 'story',
          clips: [{ id: 'c1' }],
          storyboards: [{ id: 's1' }],
          videos: [{ id: 'v1' }],
        }}
        runtimeSignals={{
          runningStages: ['script'],
          errorStages: ['storyboard'],
        }}
      />
    );

    expect(screen.getByTestId('stage-script')).toHaveAttribute('data-semantic-status', 'running');
    expect(screen.getByTestId('stage-storyboard')).toHaveAttribute('data-semantic-status', 'error');
  });
});
