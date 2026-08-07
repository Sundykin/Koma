import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData, LinghuiStoryboardFrame } from '../../../../types/linghui';
import { ScriptNodeEditor } from '../components/ScriptNodeEditor';

const {
  loadSettingsMock,
  listConfiguredModelSelectOptionsMock,
  updateNodeDataMock,
} = vi.hoisted(() => ({
  loadSettingsMock: vi.fn(),
  listConfiguredModelSelectOptionsMock: vi.fn(),
  updateNodeDataMock: vi.fn(),
}));

vi.mock('../../../../store/settings/core', () => ({
  loadSettings: (...args: unknown[]) => loadSettingsMock(...args),
}));

vi.mock('../../../../providers/channel/resolver', () => ({
  buildLLMConfigFromContext: vi.fn(),
  listConfiguredModelSelectOptions: (...args: unknown[]) => listConfiguredModelSelectOptionsMock(...args),
  resolveConfiguredChannelModel: vi.fn(),
}));

vi.mock('../../nodes/state/LinghuiNodeRunsContext', () => ({
  useLinghuiNodeMutation: () => ({
    updateNodeData: updateNodeDataMock,
  }),
}));

function createScriptNodeData(shots: LinghuiStoryboardFrame[]): LinghuiNodeData {
  return {
    linghuiType: 'linghui/script',
    label: '脚本节点',
    accent: '#818cf8',
    background: '#111827',
    active: true,
    inputs: [{ name: '文本', dataType: 'text' }],
    outputs: [{ name: '输出', dataType: 'text' }],
    properties: {
      mode: 'manual',
      content: JSON.stringify({ shots }),
      prompt: '',
      systemPrompt: '',
      llmSelection: '',
      viewMode: 'cards',
      productionStage: 'storyboard',
      productionAssets: [{
        id: 'character-1',
        kind: 'character',
        name: '阿澈',
        description: '',
        sourceShotIds: ['shot-2'],
        confirmed: false,
        status: 'draft',
      }],
    },
  };
}

describe('ScriptNodeEditor 受影响镜头选择范围', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSettingsMock.mockResolvedValue({});
    listConfiguredModelSelectOptionsMock.mockReturnValue([]);
  });

  it('从一致性问题选中范围后，只把受影响镜头交给图片和视频生成', async () => {
    const shots: LinghuiStoryboardFrame[] = [
      { id: 'shot-1', title: '空镜', description: '车站空镜', durationSec: 4 },
      {
        id: 'shot-2',
        title: '人物入场',
        description: '阿澈走入车站',
        durationSec: 5,
        characters: [{ characterName: '阿澈' }],
      },
    ];
    const onGenerateImages = vi.fn();
    const onGenerateVideos = vi.fn();

    render(
      <ScriptNodeEditor
        nodeId="script-node-1"
        nodeData={createScriptNodeData(shots)}
        onRun={vi.fn()}
        onDeriveShots={vi.fn()}
        onGenerateImages={onGenerateImages}
        onGenerateVideos={onGenerateVideos}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('当前已选 2 个镜头')).toHaveTextContent('已选 2/2 个镜头');
    });

    fireEvent.click(screen.getByRole('button', { name: '选中 1 个受影响镜头' }));
    expect(screen.getByLabelText('当前已选 1 个镜头')).toHaveTextContent('已选 1/2 个镜头');

    fireEvent.click(screen.getByRole('button', { name: '生成分镜图' }));
    fireEvent.click(screen.getByRole('button', { name: '生成视频流程' }));

    expect(onGenerateImages).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'shot-2', title: '人物入场' }),
    ]);
    expect(onGenerateVideos).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'shot-2', title: '人物入场' }),
    ]);
  });
});
