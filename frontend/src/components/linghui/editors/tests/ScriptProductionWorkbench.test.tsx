import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScriptProductionWorkbench } from '../components/ScriptProductionWorkbench';

describe('ScriptProductionWorkbench', () => {
  it('在同一制作台切换阶段、编辑并生成确认资产', () => {
    const onStageChange = vi.fn();
    const onAssetsChange = vi.fn();
    const onGenerateAssets = vi.fn();
    const assets = [{
      id: 'asset-1',
      kind: 'character' as const,
      name: '阿澈',
      description: '黑色风衣',
      sourceShotIds: ['shot-1'],
      confirmed: true,
    }];

    render(
      <ScriptProductionWorkbench
        stage="assets"
        shotCount={6}
        assets={assets}
        onStageChange={onStageChange}
        onAssetsChange={onAssetsChange}
        onRefreshAssets={vi.fn()}
        onGenerateAssets={onGenerateAssets}
      />,
    );

    expect(screen.getByLabelText('一体化制作流程')).toBeInTheDocument();
    expect(screen.getByText('6 个镜头')).toBeInTheDocument();
    expect(screen.getByText('1 角色')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('角色名称'), { target: { value: '阿澈（雨夜造型）' } });
    expect(onAssetsChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: '阿澈（雨夜造型）' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: '生成 1 个资产参考图' }));
    expect(onGenerateAssets).toHaveBeenCalledWith(assets);

    fireEvent.click(screen.getByRole('button', { name: '3 分镜' }));
    expect(onStageChange).toHaveBeenCalledWith('storyboard');
  });

  it('锁定资产不可编辑或删除，但可以显式解锁', () => {
    const onAssetsChange = vi.fn();
    const lockedAsset = {
      id: 'asset-locked',
      kind: 'character' as const,
      name: '阿澈',
      description: '固定设定',
      sourceShotIds: ['shot-1'],
      confirmed: true,
      status: 'locked' as const,
    };

    render(
      <ScriptProductionWorkbench
        stage="assets"
        shotCount={1}
        assets={[lockedAsset]}
        onStageChange={vi.fn()}
        onAssetsChange={onAssetsChange}
        onRefreshAssets={vi.fn()}
        onGenerateAssets={vi.fn()}
      />,
    );

    expect(screen.getByText('已锁定')).toBeInTheDocument();
    expect(screen.getByLabelText('角色名称')).toBeDisabled();
    expect(screen.getByLabelText('删除资产 阿澈')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('解锁资产 阿澈'));
    expect(onAssetsChange).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'approved', confirmed: true }),
    ]);
  });

  it('展示参考图候选版本，并能采用旧版本或一键回退', () => {
    const onAssetsChange = vi.fn();
    render(
      <ScriptProductionWorkbench
        stage="assets"
        shotCount={1}
        assets={[{
          id: 'asset-versioned',
          kind: 'character',
          name: '林夏',
          description: '青年侦探',
          sourceShotIds: ['shot-1'],
          referenceImage: 'https://cdn.example.com/new.png',
          currentReferenceImageId: 'version-2',
          referenceImageVersions: [
            { id: 'version-1', source: 'https://cdn.example.com/old.png', createdAt: 100, label: '初版' },
            { id: 'version-2', source: 'https://cdn.example.com/new.png', createdAt: 200, label: '生成结果 2' },
          ],
          confirmed: true,
          status: 'approved',
        }]}
        onStageChange={vi.fn()}
        onAssetsChange={onAssetsChange}
        onRefreshAssets={vi.fn()}
        onGenerateAssets={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('参考图版本 林夏')).toBeInTheDocument();
    expect(screen.getByText('当前版本 V2')).toBeInTheDocument();
    expect(screen.getByText('2 个候选 · 生成结果 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '采用参考图版本 林夏 V1' }));
    expect(onAssetsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        referenceImage: 'https://cdn.example.com/old.png',
        currentReferenceImageId: 'version-1',
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: '回退参考图 林夏' }));
    expect(onAssetsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ currentReferenceImageId: 'version-1' }),
    ]);
  });

  it('删除被镜头引用的资产前显示影响范围，并定位从镜头跳回的资产', () => {
    const onAssetsChange = vi.fn();
    const asset = {
      id: 'asset-1',
      kind: 'character' as const,
      name: '阿澈',
      description: '黑色风衣',
      sourceShotIds: ['shot-1'],
      confirmed: true,
    };

    const { container } = render(
      <ScriptProductionWorkbench
        stage="assets"
        shotCount={1}
        shots={[{
          id: 'shot-1',
          title: '雨夜抵达',
          description: '阿澈抵达车站',
          durationSec: 6,
          characters: [{ characterName: '阿澈' }],
        }]}
        assets={[asset]}
        focusedAssetId="asset-1"
        onStageChange={vi.fn()}
        onAssetsChange={onAssetsChange}
        onRefreshAssets={vi.fn()}
        onGenerateAssets={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-production-asset-id="asset-1"]')).toHaveClass('isFocused');
    expect(screen.getByText(/用于 #1 雨夜抵达/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('删除资产 阿澈'));
    expect(onAssetsChange).not.toHaveBeenCalled();
    expect(screen.getByText('删除会影响 1 个镜头')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '仍然删除' }));
    expect(onAssetsChange).toHaveBeenCalledWith([]);
  });

  it('在分镜阶段显示一致性问题，并能定位已有资产或提取缺失资产', () => {
    const onFocusAsset = vi.fn();
    const onRefreshAssets = vi.fn();
    const onStageChange = vi.fn();
    const onSelectShots = vi.fn();
    render(
      <ScriptProductionWorkbench
        stage="storyboard"
        shotCount={2}
        shots={[
          { id: 'shot-1', title: '抵达', description: '', durationSec: 5, characters: [{ characterName: '阿澈' }] },
          { id: 'shot-2', title: '交换', description: '', durationSec: 5, characters: [{ characterName: '阿澈' }], props: [{ propName: '硬币' }] },
        ]}
        assets={[{
          id: 'character-1',
          kind: 'character',
          name: '阿澈',
          description: '',
          sourceShotIds: ['shot-1', 'shot-2'],
          confirmed: false,
          status: 'draft',
        }]}
        selectedShotIds={['shot-1']}
        onStageChange={onStageChange}
        onAssetsChange={vi.fn()}
        onRefreshAssets={onRefreshAssets}
        onGenerateAssets={vi.fn()}
        onFocusAsset={onFocusAsset}
        onSelectShots={onSelectShots}
      />,
    );

    expect(screen.getByLabelText('分镜一致性检查')).toBeInTheDocument();
    expect(screen.getByText('2 项影响一致性')).toBeInTheDocument();
    expect(screen.getByLabelText('当前已选 1 个镜头')).toHaveTextContent('已选 1/2 个镜头');
    expect(screen.getByText('角色资产未确认 · 阿澈')).toBeInTheDocument();
    expect(screen.getByText('影响 #1 抵达、#2 交换')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '选中 2 个受影响镜头' }));
    expect(onSelectShots).toHaveBeenCalledWith(['shot-1', 'shot-2']);
    fireEvent.click(screen.getByRole('button', { name: '打开资产' }));
    expect(onFocusAsset).toHaveBeenCalledWith('character-1');

    fireEvent.click(screen.getByRole('button', { name: '提取缺失资产' }));
    expect(onRefreshAssets).toHaveBeenCalledTimes(1);
    expect(onStageChange).toHaveBeenCalledWith('assets');
  });

  it('旧工作区没有生产资产时只显示建立资产提示，不展开缺失实体列表', () => {
    const onRefreshAssets = vi.fn();
    const onStageChange = vi.fn();
    render(
      <ScriptProductionWorkbench
        stage="storyboard"
        shotCount={1}
        shots={[{ id: 'shot-1', title: '抵达', description: '', durationSec: 5, characters: [{ characterName: '阿澈' }] }]}
        assets={[]}
        onStageChange={onStageChange}
        onAssetsChange={vi.fn()}
        onRefreshAssets={onRefreshAssets}
        onGenerateAssets={vi.fn()}
      />,
    );

    expect(screen.getByText('尚未建立资产')).toBeInTheDocument();
    expect(screen.getByText('当前工作区还没有作品资产，先从镜头提取一次即可建立检查清单。')).toBeInTheDocument();
    expect(screen.queryByText(/缺少角色资产/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /受影响镜头/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '从镜头提取资产' }));
    expect(onRefreshAssets).toHaveBeenCalledTimes(1);
    expect(onStageChange).toHaveBeenCalledWith('assets');
  });

  it('所有引用资产已确认且有参考图时显示可生成状态', () => {
    render(
      <ScriptProductionWorkbench
        stage="storyboard"
        shotCount={1}
        shots={[{ id: 'shot-1', title: '抵达', description: '', durationSec: 5, characters: [{ characterName: '阿澈' }] }]}
        assets={[{
          id: 'character-1',
          kind: 'character',
          name: '阿澈',
          description: '',
          sourceShotIds: ['shot-1'],
          referenceImage: 'asset://a-che.png',
          confirmed: true,
          status: 'approved',
        }]}
        onStageChange={vi.fn()}
        onAssetsChange={vi.fn()}
        onRefreshAssets={vi.fn()}
        onGenerateAssets={vi.fn()}
      />,
    );

    expect(screen.getByText('可生成')).toBeInTheDocument();
    expect(screen.getByText('角色、场景和道具引用完整，可以继续生成分镜。')).toBeInTheDocument();
  });

  it('展示可解释的语义一致性风险，并继续复用受影响镜头选择范围', () => {
    const onSelectShots = vi.fn();
    const onFocusAsset = vi.fn();
    const onAcknowledgedConsistencyIssueIdsChange = vi.fn();
    const shots = [
      {
        id: 'shot-1', title: '入场', description: '', durationSec: 5,
        characters: [{ characterName: '林夏', characterDescription: '黑色风衣' }],
      },
      {
        id: 'shot-2', title: '追逐', description: '', durationSec: 5,
        characters: [{ characterName: '林夏', characterDescription: '红色校服' }],
      },
    ];
    const assets = [{
      id: 'character-1',
      kind: 'character' as const,
      name: '林夏',
      description: '青年侦探',
      sourceShotIds: ['shot-1', 'shot-2'],
      referenceImage: 'asset://lin-xia.png',
      confirmed: true,
      status: 'approved' as const,
    }];
    const { rerender } = render(
      <ScriptProductionWorkbench
        stage="storyboard"
        shotCount={2}
        shots={shots}
        assets={assets}
        selectedShotIds={['shot-1']}
        onStageChange={vi.fn()}
        onAssetsChange={vi.fn()}
        onRefreshAssets={vi.fn()}
        onGenerateAssets={vi.fn()}
        onFocusAsset={onFocusAsset}
        onSelectShots={onSelectShots}
        onAcknowledgedConsistencyIssueIdsChange={onAcknowledgedConsistencyIssueIdsChange}
      />,
    );

    expect(screen.getByText('可生成 · 1 项风险')).toBeInTheDocument();
    expect(screen.getByText('角色服装冲突 · 林夏')).toBeInTheDocument();
    expect(screen.getByText('证据：黑色 + 风衣 / 红色 + 制服')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '选中 2 个受影响镜头' }));
    expect(onSelectShots).toHaveBeenCalledWith(['shot-1', 'shot-2']);
    fireEvent.click(screen.getByRole('button', { name: '打开资产' }));
    expect(onFocusAsset).toHaveBeenCalledWith('character-1');
    fireEvent.click(screen.getByRole('button', { name: '确认有意变化' }));
    const acknowledgedIssueId = onAcknowledgedConsistencyIssueIdsChange.mock.calls[0][0][0] as string;
    expect(acknowledgedIssueId).toContain('character-clothing-conflict:character-1');

    rerender(
      <ScriptProductionWorkbench
        stage="storyboard"
        shotCount={2}
        shots={shots}
        assets={assets}
        selectedShotIds={['shot-1', 'shot-2']}
        acknowledgedConsistencyIssueIds={[acknowledgedIssueId]}
        onStageChange={vi.fn()}
        onAssetsChange={vi.fn()}
        onRefreshAssets={vi.fn()}
        onGenerateAssets={vi.fn()}
        onFocusAsset={onFocusAsset}
        onSelectShots={onSelectShots}
        onAcknowledgedConsistencyIssueIdsChange={onAcknowledgedConsistencyIssueIdsChange}
      />,
    );

    expect(screen.queryByText('角色服装冲突 · 林夏')).not.toBeInTheDocument();
    expect(screen.getByText('可生成')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新检查已确认变化' }));
    expect(onAcknowledgedConsistencyIssueIdsChange).toHaveBeenLastCalledWith([]);
  });
});
