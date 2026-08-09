import React from 'react';
import { App } from 'antd';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectProductionReadiness } from '../../services/projectProductionReadiness';
import { ProjectProductionReadinessPanel } from './ProjectProductionReadinessPanel';

function readiness(overrides: Partial<ProjectProductionReadiness> = {}): ProjectProductionReadiness {
  return {
    analysisComplete: true,
    missingAssets: { characters: [], scenes: ['scene-1'], props: [] },
    missingAssetCount: 1,
    shotCount: 0,
    stages: {
      script: { key: 'script', status: 'ready', done: 1, total: 1, label: '剧本已解析', detail: '角色、场景、道具已提取' },
      assets: { key: 'assets', status: 'incomplete', done: 2, total: 3, label: '1 个素材待补图', detail: '角色 0 · 场景 1 · 道具 0' },
      storyboard: { key: 'storyboard', status: 'incomplete', done: 0, total: 1, label: '待生成分镜', detail: '可先补齐素材' },
    },
    nextAction: { type: 'open-assets', label: '处理 1 个缺失素材', reason: '进入项目资产子视图', disabled: false },
    ...overrides,
  };
}

function renderPanel(value: ProjectProductionReadiness, callbacks: {
  onAction?: ReturnType<typeof vi.fn>;
  onOpenAssets?: ReturnType<typeof vi.fn>;
  onOpenStoryboard?: ReturnType<typeof vi.fn>;
} = {}) {
  const onAction = callbacks.onAction || vi.fn();
  const onOpenAssets = callbacks.onOpenAssets || vi.fn();
  const onOpenStoryboard = callbacks.onOpenStoryboard || vi.fn();
  render(
    <App>
      <ProjectProductionReadinessPanel
        readiness={value}
        onAction={onAction}
        onOpenAssets={onOpenAssets}
        onOpenStoryboard={onOpenStoryboard}
      />
    </App>,
  );
  return { onAction, onOpenAssets, onOpenStoryboard };
}

describe('ProjectProductionReadinessPanel', () => {
  it('renders three real production stages and routes missing assets to the legacy editor subview', () => {
    const { onOpenAssets } = renderPanel(readiness());

    expect(screen.getByLabelText('项目生产进度')).toBeInTheDocument();
    expect(screen.getByText('剧本已解析')).toBeInTheDocument();
    expect(screen.getByText('1 个素材待补图')).toBeInTheDocument();
    expect(screen.getByText('待生成分镜')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /打\s*开/ }));
    expect(onOpenAssets).toHaveBeenCalledTimes(1);
  });

  it('executes an in-place analysis action and disables it while busy', () => {
    const onAction = vi.fn();
    const value = readiness({
      nextAction: { type: 'analyze-script', label: '重试解析剧本', reason: '模型超时', disabled: false },
    });
    const { rerender } = render(
      <App>
        <ProjectProductionReadinessPanel
          readiness={value}
          onAction={onAction}
          onOpenAssets={vi.fn()}
          onOpenStoryboard={vi.fn()}
        />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /执行/ }));
    expect(onAction).toHaveBeenCalledWith('analyze-script');

    rerender(
      <App>
        <ProjectProductionReadinessPanel
          readiness={value}
          onAction={onAction}
          onOpenAssets={vi.fn()}
          onOpenStoryboard={vi.fn()}
          busy
        />
      </App>,
    );
    expect(screen.getByRole('button', { name: /执行/ })).toBeDisabled();
  });

  it('opens storyboard only after real shots exist', () => {
    const onOpenStoryboard = vi.fn();
    renderPanel(readiness({
      shotCount: 3,
      stages: {
        ...readiness().stages,
        storyboard: { key: 'storyboard', status: 'ready', done: 3, total: 3, label: '已生成 3 镜', detail: '可进入分镜' },
      },
      nextAction: { type: 'open-storyboard', label: '打开 3 个分镜', reason: '继续制作', disabled: false },
    }), { onOpenStoryboard });

    fireEvent.click(screen.getByRole('button', { name: /打\s*开/ }));
    expect(onOpenStoryboard).toHaveBeenCalledTimes(1);
  });
});
