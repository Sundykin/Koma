import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NovelPromotionWorkspace } from './NovelPromotionWorkspace';

const mockHandleStageChange = vi.fn();
const mockUseEpisodeData = vi.fn();
const mockScriptToStoryboard = vi.fn();
const mockRefetch = vi.fn();
const mockSubscribe = vi.fn();

vi.mock('./hooks/useStageNavigation', () => ({
  useStageNavigation: () => ({
    currentStage: 'script',
    stageNavItems: [],
    handleStageChange: mockHandleStageChange,
  }),
}));

vi.mock('./hooks/useEpisodeData', () => ({
  useEpisodeData: (...args: any[]) => mockUseEpisodeData(...args),
}));

vi.mock('./components/StageNavigation', () => ({
  StageNavigation: () => <div data-testid="stage-nav" />,
}));

vi.mock('./components/EpisodeManager', () => ({
  EpisodeManager: (props: any) => {
    React.useEffect(() => {
      if (props.episodes?.[0]?.id) {
        props.onEpisodeSelect(props.episodes[0].id);
      }
    }, [props.episodes, props.onEpisodeSelect]);

    return <div data-testid="episode-manager" />;
  },
}));

vi.mock('./ScriptStage', () => ({
  ScriptStage: (props: any) => (
    <button
      data-testid="trigger-generate-storyboard"
      onClick={() => {
        void props.onGenerateStoryboard?.().catch(() => {});
      }}
    >
      触发分镜生成
    </button>
  ),
}));

vi.mock('./ConfigStage', () => ({ ConfigStage: () => <div data-testid="config-stage" /> }));
vi.mock('./StoryboardStage', () => ({ StoryboardStage: () => <div data-testid="storyboard-stage" /> }));
vi.mock('./VideoStage', () => ({ VideoStage: () => <div data-testid="video-stage" /> }));
vi.mock('./AssetLibrary', () => ({ AssetLibrary: () => <div data-testid="asset-library" /> }));

vi.mock('../../services/novelPromotionService', () => ({
  episodeAPI: {
    list: vi.fn(async () => [
      {
        id: 'ep1',
        projectId: 'p1',
        name: '第一集',
        novelText: 'n',
        createdAt: 1,
        updatedAt: 1,
      },
    ]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  characterAPI: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  locationAPI: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  workflowAPI: {
    storyToScript: vi.fn(),
    scriptToStoryboard: (...args: any[]) => mockScriptToStoryboard(...args),
  },
}));

vi.mock('../../services/taskQueueService', () => ({
  taskQueueService: {
    subscribe: (...args: any[]) => mockSubscribe(...args),
  },
}));

describe('NovelPromotionWorkspace PR-3 flow', () => {
  let dataFixture: any;

  beforeEach(() => {
    mockHandleStageChange.mockReset();
    mockScriptToStoryboard.mockReset();
    mockRefetch.mockReset();
    mockSubscribe.mockReset();

    dataFixture = {
      clips: [],
      storyboards: [],
      characters: [],
      locations: [],
      loading: false,
      error: null,
      refetch: mockRefetch,
    };

    mockUseEpisodeData.mockImplementation((_projectId: string, episodeId: string | null) => ({
      episode: episodeId
        ? {
            id: episodeId,
            projectId: 'p1',
            name: '第一集',
            novelText: '小说正文',
            createdAt: 1,
            updatedAt: 1,
          }
        : null,
      clips: dataFixture.clips,
      storyboards: dataFixture.storyboards,
      characters: dataFixture.characters,
      locations: dataFixture.locations,
      loading: dataFixture.loading,
      error: dataFixture.error,
      refetch: dataFixture.refetch,
    }));

    mockScriptToStoryboard.mockImplementation(async ({ clipId }: any) => ({ taskId: `task-${clipId}` }));
    mockSubscribe.mockImplementation((_taskId: string, cb: any) => {
      void cb({ status: 'completed' });
      return vi.fn();
    });
  });

  it('generates storyboard sequentially for all clips', async () => {
    dataFixture.clips = [
      {
        id: 'clip-1',
        content: '片段一内容',
        characters: ['悟空'],
        location: '花果山',
      },
      {
        id: 'clip-2',
        content: '片段二内容',
        characters: ['八戒', '不存在角色'],
        location: null,
      },
    ];
    dataFixture.characters = [
      { id: 'c1', name: '悟空', description: '主角' },
      { id: 'c2', name: '八戒', description: '搭档' },
    ];

    render(<NovelPromotionWorkspace projectId="p1" />);

    await waitFor(() => {
      expect(screen.getByTestId('trigger-generate-storyboard')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('trigger-generate-storyboard'));

    await waitFor(() => {
      expect(mockScriptToStoryboard).toHaveBeenCalledTimes(2);
    });

    expect(mockScriptToStoryboard).toHaveBeenNthCalledWith(1, {
      projectId: 'p1',
      episodeId: 'ep1',
      clipId: 'clip-1',
      clipContent: '片段一内容',
      characters: [{ name: '悟空', description: '主角' }],
      location: '花果山',
    });

    expect(mockScriptToStoryboard).toHaveBeenNthCalledWith(2, {
      projectId: 'p1',
      episodeId: 'ep1',
      clipId: 'clip-2',
      clipContent: '片段二内容',
      characters: [{ name: '八戒', description: '搭档' }],
      location: '',
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(mockHandleStageChange).toHaveBeenCalledWith('storyboard');
  });

  it('stops remaining clips when one storyboard task fails', async () => {
    dataFixture.clips = [
      {
        id: 'clip-1',
        content: '片段一内容',
        characters: [],
        location: null,
      },
      {
        id: 'clip-2',
        content: '片段二内容',
        characters: [],
        location: null,
      },
    ];

    mockSubscribe.mockImplementation((_taskId: string, cb: any) => {
      void cb({ status: 'failed', error: '分镜失败' });
      return vi.fn();
    });

    render(<NovelPromotionWorkspace projectId="p1" />);

    await waitFor(() => {
      expect(screen.getByTestId('trigger-generate-storyboard')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('trigger-generate-storyboard'));

    await waitFor(() => {
      expect(mockScriptToStoryboard).toHaveBeenCalledTimes(1);
    });

    expect(mockRefetch).not.toHaveBeenCalled();
    expect(mockHandleStageChange).not.toHaveBeenCalledWith('storyboard');
  });
});
