import { describe, expect, it } from 'vitest';
import type { LinghuiExecutionContext, LinghuiNodeRunState } from '../../../../types/linghui';
import { buildLinghuiExecutionPlan } from '../state/linghuiExecutionPlan';

function createTextNode(id: string, label: string, x: number): LinghuiExecutionContext['nodes'][number] {
  return {
    id,
    type: 'linghui-text',
    position: { x, y: 0 },
    data: {
      linghuiType: 'linghui/text',
      label,
      accent: '#f59e0b',
      background: '#0f1720',
      properties: {
        mode: 'generate',
        content: '',
        prompt: '',
        systemPrompt: '',
        llmSelection: '',
      },
      inputs: [],
      outputs: [{ name: 'text', dataType: 'text' }],
      active: false,
    },
  };
}

function createVideoNode(id: string, label: string, x: number): LinghuiExecutionContext['nodes'][number] {
  return {
    id,
    type: 'linghui-video',
    position: { x, y: 0 },
    data: {
      linghuiType: 'linghui/video',
      label,
      accent: '#22c55e',
      background: '#0f1720',
      properties: {
        prompt: '',
        itvSelection: '',
        source: '',
        posterSource: '',
        videoCapability: 'video.text-to-video',
        aspectRatio: '16:9',
        resolution: '720p',
        duration: 5,
      },
      inputs: [
        { name: '参考', dataType: 'image' },
        { name: '文本', dataType: 'text' },
        { name: '音频', dataType: 'audio' },
        { name: '视频', dataType: 'video' },
      ],
      outputs: [{ name: 'video', dataType: 'video' }],
      active: false,
    },
  };
}

describe('buildLinghuiExecutionPlan', () => {
  it('includes required dependencies and summarizes waves, parallelism, and bottlenecks', () => {
    const context: LinghuiExecutionContext = {
      nodes: [
        createTextNode('node-a', '文本 A', 0),
        createTextNode('node-b', '文本 B', 300),
        createTextNode('node-c', '文本 C', 300),
        createVideoNode('node-d', '视频 D', 620),
      ],
      edges: [
        {
          id: 'edge-a-b',
          source: 'node-a',
          target: 'node-b',
          sourceHandle: 'output-0',
          targetHandle: 'input-0',
          type: 'linghui-edge',
          data: { sourceSlotType: 'text', targetSlotType: 'text' },
        },
        {
          id: 'edge-a-c',
          source: 'node-a',
          target: 'node-c',
          sourceHandle: 'output-0',
          targetHandle: 'input-0',
          type: 'linghui-edge',
          data: { sourceSlotType: 'text', targetSlotType: 'text' },
        },
        {
          id: 'edge-c-d',
          source: 'node-c',
          target: 'node-d',
          sourceHandle: 'output-0',
          targetHandle: 'input-1',
          type: 'linghui-edge',
          data: { sourceSlotType: 'text', targetSlotType: 'text' },
        },
      ],
      nodeOutputs: {},
    };

    const previousRuns: Record<string, LinghuiNodeRunState> = {
      'node-a': {
        status: 'succeeded',
        startedAt: 1000,
        updatedAt: 5000,
      },
      'node-c': {
        status: 'succeeded',
        startedAt: 1000,
        updatedAt: 13000,
      },
    };

    const plan = buildLinghuiExecutionPlan({
      context,
      targetNodeIds: ['node-b', 'node-d'],
      previousRuns,
    });

    expect(plan.targetNodeIds).toEqual(['node-b', 'node-d']);
    expect(plan.requiredNodeIds).toEqual(expect.arrayContaining(['node-a', 'node-b', 'node-c', 'node-d']));
    expect(plan.totalNodes).toBe(4);
    expect(plan.dependencyNodeCount).toBe(2);
    expect(plan.waveCount).toBe(3);
    expect(plan.maxParallelism).toBe(2);
    expect(plan.estimatedTotalDurationSec).toBe(61);
    expect(plan.estimatedCostStatus).toBe('unavailable');
    expect(plan.bottleneckNodeIds).toEqual(['node-a', 'node-c', 'node-d']);
    expect(plan.waves).toEqual([
      expect.objectContaining({
        index: 0,
        nodeIds: ['node-a'],
        parallelism: 1,
        estimatedDurationSec: 4,
      }),
      expect.objectContaining({
        index: 1,
        nodeIds: ['node-b', 'node-c'],
        parallelism: 2,
        estimatedDurationSec: 12,
        bottleneckNodeIds: ['node-c'],
      }),
      expect.objectContaining({
        index: 2,
        nodeIds: ['node-d'],
        parallelism: 1,
        estimatedDurationSec: 45,
      }),
    ]);
  });

  it('uses heuristic estimates when no history is available', () => {
    const context: LinghuiExecutionContext = {
      nodes: [createTextNode('text-node', '文案', 0)],
      edges: [],
      nodeOutputs: {},
    };

    const plan = buildLinghuiExecutionPlan({ context, targetNodeIds: ['text-node'] });
    expect(plan.estimatedTotalDurationSec).toBe(10);
    expect(plan.nodes[0]).toEqual(expect.objectContaining({
      nodeId: 'text-node',
      estimateSource: 'heuristic',
      estimatedDurationSec: 10,
    }));
  });
});
