import { describe, expect, it } from 'vitest';
import {
  buildLinghuiGroupCountLabel,
  createNextLinghuiWorkflowBlockLabel,
  isAutoLinghuiGroupCountLabel,
} from '../../../../constants/linghuiWorkflowBlock';

describe('linghui workflow block labels', () => {
  it('keeps legacy workflow block numbering compatible', () => {
    expect(createNextLinghuiWorkflowBlockLabel(['工作流块', '工作流块 3'])).toBe('工作流块 4');
  });

  it('detects LibTV-style auto group count labels', () => {
    expect(isAutoLinghuiGroupCountLabel('分组 3 个节点')).toBe(true);
    expect(isAutoLinghuiGroupCountLabel('分镜组 9 个节点')).toBe(true);
    expect(isAutoLinghuiGroupCountLabel('视频组 · 第一幕')).toBe(false);
  });

  it('builds group and storyboard group count labels', () => {
    expect(buildLinghuiGroupCountLabel(4)).toBe('分组 4 个节点');
    expect(buildLinghuiGroupCountLabel(12, true)).toBe('分镜组 12 个节点');
  });
});
