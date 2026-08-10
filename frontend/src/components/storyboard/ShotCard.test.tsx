import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { ShotCard } from './ShotCard';
import type { Shot } from '../../types';

vi.mock('../../theme/runtime', () => ({
  useTheme: () => ({ theme: { meta: { mode: 'light' } } }),
  cssVars: (value: Record<string, string>) => value,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../editor', () => ({
  ScriptEditor: ({ value, onChange, placeholder }: { value?: string; onChange?: (value: string) => void; placeholder?: string }) => (
    <textarea value={value || ''} placeholder={placeholder} onChange={event => onChange?.(event.target.value)} />
  ),
}));

vi.mock('../asset/ImageCardGrid', () => ({
  ImageCardGrid: () => <div data-testid="image-grid" />,
}));

vi.mock('../asset/VideoCardGrid', () => ({
  VideoCardGrid: () => <div data-testid="video-grid" />,
}));

vi.mock('./ShotDurationControl', () => ({
  ShotDurationControl: () => <span data-testid="duration-control" />,
}));

vi.mock('./ShotScriptLines', () => ({
  ShotScriptLines: () => <div data-testid="script-lines" />,
}));

vi.mock('./ShotScriptParagraph', () => ({
  ShotScriptParagraph: () => <div data-testid="script-paragraph" />,
}));

vi.mock('./components/AssetSelector', () => ({
  AssetSelector: () => <div data-testid="asset-selector" />,
}));

vi.mock('../video/StagePlayer', () => ({
  StagePlayer: () => <div data-testid="stage-player" />,
}));

vi.mock('./hooks/useShotGridSplit', () => ({
  useShotGridSplit: () => ({
    isSplittingGridImage: false,
    gridSplitModalOpen: false,
    gridSplitAsset: undefined,
    gridSize: 3,
    gridCellCount: 9,
    gridSplitAspectStyle: '1 / 1',
    gridSplitPreviewMeta: undefined,
    setGridSplitImageSize: vi.fn(),
    handleOpenGridSplitPreview: vi.fn(),
    handleCloseGridSplitPreview: vi.fn(),
    handleConfirmGridSplit: vi.fn(),
  }),
}));

vi.mock('../../services/mediaPersistenceService', () => ({ persistMediaAsset: vi.fn() }));
vi.mock('../../services/mediaRemoteUrlService', () => ({ ensureRemoteUrlForImageAsset: vi.fn() }));

function createShot(id: string, videoReference?: Shot['videoReference']): Shot {
  return {
    id,
    scriptLines: [{ id: `${id}-line`, text: `${id} 内容` }],
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 6,
    imagePrompt: '画面',
    videoPrompt: '运动',
    imageMode: 'normal',
    videoMode: 'multi-ref',
    characters: [],
    scenes: ['scene-1'],
    videoReference,
  };
}

function renderCard(shot: Shot, previousShot?: Shot, overrides: Partial<React.ComponentProps<typeof ShotCard>> = {}) {
  const defaults: React.ComponentProps<typeof ShotCard> = {
    projectId: 'project-1',
    shot,
    index: previousShot ? 1 : 0,
    totalCount: previousShot ? 2 : 1,
    characters: [],
    scenes: [],
    props: [],
    mentionItems: [],
    isSelected: false,
    isGeneratingImagePrompt: false,
    isGeneratingVideoPrompt: false,
    isGeneratingImage: false,
    isGeneratingVideo: false,
    onSelectChange: vi.fn(),
    onScriptLinesChange: vi.fn(),
    onImagePromptChange: vi.fn(),
    onVideoPromptChange: vi.fn(),
    onImageModeChange: vi.fn(),
    onCharactersChange: vi.fn(),
    onImagesChange: vi.fn(),
    onVideosChange: vi.fn(),
    onGenerateImagePrompt: vi.fn(),
    onGenerateVideoPrompt: vi.fn(),
    onOptimizeImagePrompt: vi.fn(),
    onOptimizeVideoPrompt: vi.fn(),
    onGenerateImage: vi.fn(),
    onGenerateVideo: vi.fn(),
    onDelete: vi.fn(),
    onMergeUp: vi.fn(),
    onMergeDown: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onInsertAbove: vi.fn(),
    onInsertBelow: vi.fn(),
    previousShot,
    onVideoReferenceModeChange: vi.fn(),
    onCapturePreviousTailFrame: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return render(<AntApp><ShotCard {...defaults} /></AntApp>);
}

describe('ShotCard video continuity controls', () => {
  it('shows the automatic decision, source and tail-frame preview as icons', () => {
    const previous = {
      ...createShot('shot-prev'),
      currentVersion: 1,
      media: {
        videos: [{ kind: 'video' as const, remoteUrl: 'https://example.com/prev.mp4', createdAt: 1 }],
        currentVideoIndex: 0,
      },
    };
    const shot = createShot('shot-next', {
      mode: 'auto',
      usePreviousTailFrame: true,
      autoUsePreviousTailFrame: true,
      continuityReason: '同一场景动作延续',
      sourceShotId: 'shot-prev',
      sourceVideoKey: 'shot-prev:v1:1:https://example.com/prev.mp4',
      referenceFrame: { kind: 'image', remoteUrl: 'https://example.com/tail.jpg', createdAt: 2 },
    });

    renderCard(shot, previous);

    const group = screen.getByTestId('shot-video-continuity');
    // 自动模式选中，且不渲染任何文字标签
    expect(group.querySelector('.ant-segmented-item-selected')?.textContent).not.toMatch(/自动|继承|独立/);
    expect(screen.getByTestId('continuity-opt-auto').closest('.ant-segmented-item')).toHaveClass('ant-segmented-item-selected');
    expect(screen.getByAltText('上一镜尾帧')).toHaveAttribute('src', 'https://example.com/tail.jpg');
    expect(screen.getByTestId('continuity-capture')).toBeInTheDocument();
  });

  it('supports manual independent, restore automatic and re-capture actions', async () => {
    const onMode = vi.fn().mockResolvedValue(undefined);
    const onCapture = vi.fn().mockResolvedValue(undefined);
    const previous = {
      ...createShot('shot-prev'),
      media: { videos: [{ kind: 'video' as const, remoteUrl: 'https://example.com/prev.mp4', createdAt: 1 }] },
    };
    const shot = createShot('shot-next', {
      mode: 'manual',
      usePreviousTailFrame: true,
      autoUsePreviousTailFrame: true,
      continuityReason: '同一场景动作延续',
      sourceShotId: 'shot-prev',
      referenceFrame: { kind: 'image', remoteUrl: 'https://example.com/tail.jpg', createdAt: 2 },
    });

    renderCard(shot, previous, {
      onVideoReferenceModeChange: onMode,
      onCapturePreviousTailFrame: onCapture,
    });

    fireEvent.click(screen.getByTestId('continuity-opt-independent'));
    await waitFor(() => expect(onMode).toHaveBeenCalledWith('shot-next', 'manual', false));
    fireEvent.click(screen.getByTestId('continuity-opt-auto'));
    await waitFor(() => expect(onMode).toHaveBeenCalledWith('shot-next', 'auto', true));
    fireEvent.click(screen.getByTestId('continuity-capture'));
    await waitFor(() => expect(onCapture).toHaveBeenCalledWith('shot-next', true));
  });

  it('disables capture and warns when predecessor has no real video', () => {
    const previous = createShot('shot-prev');
    const shot = createShot('shot-next', {
      mode: 'auto',
      usePreviousTailFrame: true,
      autoUsePreviousTailFrame: true,
      continuityReason: '同一场景动作延续',
      sourceShotId: 'shot-prev',
    });

    renderCard(shot, previous);

    expect(screen.getByTestId('continuity-capture')).toBeDisabled();
    expect(screen.getByTestId('continuity-warn')).toBeInTheDocument();
  });
});
