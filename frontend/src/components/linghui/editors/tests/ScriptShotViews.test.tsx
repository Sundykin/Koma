import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LinghuiProductionAsset, LinghuiStoryboardFrame } from '../../../../types/linghui';
import { ScriptShotCards, ScriptShotTable } from '../components/ScriptShotViews';

vi.mock('../../../../services/fileSystemPort', () => ({
  toFileSystemDisplayUrl: (source?: string) => source || '',
}));

function renderTable(shots: LinghuiStoryboardFrame[], options?: {
  editable?: boolean;
  onChangeShot?: (shotId: string, patch: Partial<LinghuiStoryboardFrame>) => void;
  productionAssets?: LinghuiProductionAsset[];
  onOpenProductionAsset?: (assetId: string) => void;
}) {
  return render(
    <ScriptShotTable
      shots={shots}
      selectedShotIds={shots.map(shot => shot.id)}
      onToggleShot={vi.fn()}
      editable={options?.editable}
      onChangeShot={options?.onChangeShot}
      productionAssets={options?.productionAssets}
      onOpenProductionAsset={options?.onOpenProductionAsset}
    />,
  );
}

describe('ScriptShotViews', () => {
  it('renders a LibTV-style dynamic shot table with image cells', () => {
    renderTable([
      {
        id: 'shot-1',
        title: '开场',
        description: '雨夜车站，主角望向空旷月台。',
        plotDescription: '主角抵达废弃车站。',
        visualDescription: '冷色雨夜，空旷月台，中景构图。',
        imageGenerationPrompt: '电影感雨夜车站，湿润地面反光，主角站在月台边缘。',
        videoMotionPrompt: '镜头缓慢横移，雨水落下，主角抬头望向远处灯光。',
        durationSec: 6,
        characters: [{
          characterName: '主角',
          characterDescription: '穿深色风衣，神情紧张',
          characterImageUrl: 'https://example.com/character.png',
        }],
        videoReference: {
          referenceFrameImage: 'https://example.com/video-reference.jpg',
        },
        image: {
          kind: 'image',
          source: 'https://example.com/storyboard.webp',
        },
      },
    ]);

    expect(screen.getByRole('columnheader', { name: '镜头' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '画面' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '剧情描述' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '角色' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '视频参考' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'storyboardImage' })).toHaveAttribute('src', 'https://example.com/storyboard.webp');
    expect(screen.getByRole('img', { name: 'videoReference' })).toHaveAttribute('src', 'https://example.com/video-reference.jpg');
    expect(screen.getByText('主角抵达废弃车站。')).toBeInTheDocument();
    expect(screen.getByText(/主角：穿深色风衣，神情紧张/)).toBeInTheDocument();
    expect(screen.getByText('冷色雨夜，空旷月台，中景构图。')).toBeInTheDocument();
    expect(screen.getByText('电影感雨夜车站，湿润地面反光，主角站在月台边缘。')).toBeInTheDocument();
    expect(screen.getByText('镜头缓慢横移，雨水落下，主角抬头望向远处灯光。')).toBeInTheDocument();
  });

  it('uses the LibTV empty table text when no rows are available', () => {
    renderTable([]);

    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('emits row patches from editable text cells', () => {
    const onChangeShot = vi.fn();
    renderTable([
      {
        id: 'shot-1',
        title: '开场',
        description: '旧剧情',
        plotDescription: '旧剧情',
        durationSec: 6,
      },
    ], { editable: true, onChangeShot });

    fireEvent.change(screen.getByLabelText('plotDescription'), {
      target: { value: '新剧情推进' },
    });
    fireEvent.change(screen.getByLabelText('durationSeconds'), {
      target: { value: '10' },
    });

    expect(onChangeShot).toHaveBeenCalledWith('shot-1', { plotDescription: '新剧情推进' });
    expect(onChangeShot).toHaveBeenCalledWith('shot-1', { durationSec: 10 });
  });

  it('在表格和卡片展示镜头资产，并可跳回对应资产', () => {
    const shot: LinghuiStoryboardFrame = {
      id: 'shot-1',
      title: '交换',
      description: '阿澈交出半枚硬币',
      durationSec: 6,
      characters: [{ characterName: '阿澈' }],
      props: [{ propName: '半枚硬币' }],
    };
    const assets: LinghuiProductionAsset[] = [{
      id: 'character-1',
      kind: 'character',
      name: '阿澈（雨夜造型）',
      description: '',
      sourceShotIds: ['shot-1'],
      confirmed: true,
    }];
    const onOpenProductionAsset = vi.fn();

    const table = renderTable([shot], { productionAssets: assets, onOpenProductionAsset });
    expect(screen.getByRole('columnheader', { name: '生产资产' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '跳回资产 阿澈（雨夜造型）' }));
    expect(onOpenProductionAsset).toHaveBeenCalledWith('character-1');
    expect(screen.getByTitle('未建立道具资产：半枚硬币')).toBeInTheDocument();
    table.unmount();

    render(
      <ScriptShotCards
        shots={[shot]}
        selectedShotIds={[]}
        onToggleShot={vi.fn()}
        productionAssets={assets}
        onOpenProductionAsset={onOpenProductionAsset}
      />,
    );
    expect(screen.getByLabelText('本镜头生产资产')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '跳回资产 阿澈（雨夜造型）' })).toBeInTheDocument();
  });
});
