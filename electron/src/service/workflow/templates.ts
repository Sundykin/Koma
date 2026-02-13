/**
 * 漫剧生产流水线模板
 * 定义标准的 DAG 工作流：剧本分析 → 分镜 → 资产 → 渲染
 */
import type { WorkflowDefinition } from './types';

/** 标准漫剧生产流水线 */
export function createMangaProductionWorkflow(
  overrides?: Partial<WorkflowDefinition>
): WorkflowDefinition {
  return {
    id: 'manga-production',
    name: '漫剧生产流水线',
    description: '剧本分析 → 分镜生成 → 资产生成 → 渲染',
    nodes: [
      {
        id: 'script-analysis',
        label: '剧本分析',
        type: 'task',
        handler: 'script-analysis',
        params: {},
      },
      {
        id: 'shot-breakdown',
        label: '分镜拆解',
        type: 'task',
        handler: 'shot-breakdown',
        params: {},
      },
      {
        id: 'shot-review',
        label: '分镜审核',
        type: 'gate',
        handler: 'noop',
        requireApproval: true,
      },
      {
        id: 'scene-assets',
        label: '场景资产生成',
        type: 'task',
        handler: 'scene-assets',
        params: {},
      },
      {
        id: 'character-assets',
        label: '角色资产生成',
        type: 'task',
        handler: 'character-assets',
        params: {},
      },
      {
        id: 'shot-render',
        label: '分镜渲染',
        type: 'task',
        handler: 'shot-render',
        params: {},
      },
    ],
    connections: [
      { id: 'c1', source: 'script-analysis', target: 'shot-breakdown' },
      { id: 'c2', source: 'shot-breakdown', target: 'shot-review' },
      { id: 'c3', source: 'shot-review', target: 'scene-assets' },
      { id: 'c4', source: 'shot-review', target: 'character-assets' },
      { id: 'c5', source: 'scene-assets', target: 'shot-render' },
      { id: 'c6', source: 'character-assets', target: 'shot-render' },
    ],
    startNodeId: 'script-analysis',
    ...overrides,
  };
}

/** 注册内置 noop 处理器（用于 gate 节点） */
export function registerBuiltinHandlers(
  register: (name: string, handler: any) => void
): void {
  register('noop', async () => ({ ok: true }));
}
