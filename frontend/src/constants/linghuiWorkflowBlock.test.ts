import { describe, expect, it } from 'vitest';
import {
  createNextLinghuiWorkflowBlockLabel,
  LINGHUI_WORKFLOW_BLOCK_LABEL,
  resolveLinghuiWorkflowBlockLabel,
} from './linghuiWorkflowBlock';

describe('linghuiWorkflowBlock', () => {
  it('为空标签回退到工作流块默认名称', () => {
    expect(resolveLinghuiWorkflowBlockLabel('')).toBe(LINGHUI_WORKFLOW_BLOCK_LABEL);
    expect(resolveLinghuiWorkflowBlockLabel('   ')).toBe(LINGHUI_WORKFLOW_BLOCK_LABEL);
    expect(resolveLinghuiWorkflowBlockLabel(undefined)).toBe(LINGHUI_WORKFLOW_BLOCK_LABEL);
  });

  it('创建下一个工作流块名称时沿用递增序号', () => {
    expect(createNextLinghuiWorkflowBlockLabel([])).toBe('工作流块 1');
    expect(createNextLinghuiWorkflowBlockLabel(['工作流块', '工作流块 2', '自定义块'])).toBe('工作流块 3');
    expect(createNextLinghuiWorkflowBlockLabel(['新工作流块'])).toBe('工作流块 2');
  });
});
