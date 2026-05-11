import { describe, expect, it, vi } from 'vitest';
import type { LinghuiExecutionContext } from '../../../../types/linghui';

vi.mock('../../services/electronService', () => ({
  electronService: {
    fs: {
      toLocalUrl: (value?: string) => value,
    },
  },
}));

describe('createNodeView', () => {
  it('把导入态全景节点按图片节点家族静态解析给下游消费', async () => {
    const { createNodeView } = await import('../state/linghuiExecutionShared');

    const context: LinghuiExecutionContext = {
      nodes: [
        {
          id: 'panorama-node',
          type: 'linghui-panorama',
          position: { x: 0, y: 0 },
          data: {
            linghuiType: 'linghui/panorama',
            label: '全景环境',
            accent: '#22c55e',
            background: '#0f1720',
            properties: {
              mode: 'import',
              source: 'koma-local://workspace/panorama.png',
              prompt: '',
              ttiSelection: '',
              aspectRatio: '21:9',
              resolution: 'auto',
              gridType: 'none',
              batchCount: 1,
              panoramaTemplate: 'auto',
            },
            inputs: [
              { name: '参考', dataType: 'image' },
              { name: '文本', dataType: 'text' },
            ],
            outputs: [{ name: 'image', dataType: 'image' }],
            active: false,
          },
        },
        {
          id: 'video-node',
          type: 'linghui-video',
          position: { x: 320, y: 0 },
          data: {
            linghuiType: 'linghui/video',
            label: '漫游视频',
            accent: '#22c55e',
            background: '#0f1720',
            properties: {
              prompt: '',
              itvSelection: '',
              source: '',
              posterSource: '',
              videoCapability: 'video.image-to-video',
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
        },
      ],
      edges: [
        {
          id: 'edge-panorama-video',
          source: 'panorama-node',
          target: 'video-node',
          sourceHandle: 'output-0',
          targetHandle: 'input-0',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'image',
            targetSlotType: 'image',
          },
        },
      ],
      nodeOutputs: {},
    };

    const targetNode = context.nodes[1];
    const nodeView = createNodeView(context, targetNode);
    const input = nodeView.getInputResult(0);

    expect(input?.kind).toBe('image');
    if (!input || input.kind !== 'image') {
      throw new Error('expected image result');
    }
    expect(input.primary.source).toBe('koma-local://workspace/panorama.png');
    expect(input.metadata).toEqual(expect.objectContaining({
      mode: 'import',
      itemCount: 1,
    }));
  });

  it('统一端口连接下会向下游传递全链路上游结果，并按目标 slot 类型过滤', async () => {
    const { createNodeView } = await import('../state/linghuiExecutionShared');

    const context: LinghuiExecutionContext = {
      nodes: [
        {
          id: 'image-source',
          type: 'linghui-image',
          position: { x: 0, y: 0 },
          data: {
            linghuiType: 'linghui/image',
            label: '角色参考',
            accent: '#22c55e',
            background: '#0f1720',
            properties: {
              mode: 'import',
              source: 'koma-local://workspace/character.png',
              prompt: '',
              ttiSelection: '',
              aspectRatio: '3:4',
              resolution: 'auto',
              gridType: 'none',
              batchCount: 1,
            },
            inputs: [
              { name: '参考', dataType: 'image' },
              { name: '文本', dataType: 'text' },
            ],
            outputs: [{ name: 'image', dataType: 'image' }],
            active: false,
          },
        },
        {
          id: 'text-source',
          type: 'linghui-text',
          position: { x: 320, y: 0 },
          data: {
            linghuiType: 'linghui/text',
            label: '动作说明',
            accent: '#f59e0b',
            background: '#0f1720',
            properties: {
              mode: 'manual',
              content: '角色从左向右奔跑，镜头低角度跟拍。',
              prompt: '',
              systemPrompt: '',
              llmSelection: '',
            },
            inputs: [
              { name: '图片参考', dataType: 'image' },
              { name: '文本输入', dataType: 'text' },
              { name: '视频参考', dataType: 'video' },
              { name: '音频参考', dataType: 'audio' },
            ],
            outputs: [{ name: 'text', dataType: 'text' }],
            active: false,
          },
        },
        {
          id: 'video-target',
          type: 'linghui-video',
          position: { x: 640, y: 0 },
          data: {
            linghuiType: 'linghui/video',
            label: '最终视频',
            accent: '#38bdf8',
            background: '#0f1720',
            properties: {
              prompt: '',
              itvSelection: '',
              source: '',
              posterSource: '',
              videoCapability: 'video.image-to-video',
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
        },
      ],
      edges: [
        {
          id: 'edge-image-text',
          source: 'image-source',
          target: 'text-source',
          sourceHandle: 'output-0',
          targetHandle: 'input-0',
          type: 'linghui-edge',
        },
        {
          id: 'edge-text-video',
          source: 'text-source',
          target: 'video-target',
          sourceHandle: 'output-0',
          targetHandle: 'input-0',
          type: 'linghui-edge',
        },
      ],
      nodeOutputs: {},
    };

    const nodeView = createNodeView(context, context.nodes[2]);

    expect(nodeView.getAllInputResults(0).map(result => result.kind)).toEqual(['image']);
    expect(nodeView.getAllInputResults(1).map(result => result.kind)).toEqual(['text']);
    expect(nodeView.getAllInputImages().map(result => result.kind)).toEqual(['image']);
    expect(nodeView.getInputResult(0)?.kind).toBe('image');
    expect(nodeView.getInputResult(1)?.kind).toBe('text');
  });

  it('静态解析手动脚本节点时会输出格式化文本和结构化 shots', async () => {
    const { createNodeView } = await import('../state/linghuiExecutionShared');

    const context: LinghuiExecutionContext = {
      nodes: [
        {
          id: 'script-node',
          type: 'linghui-script',
          position: { x: 0, y: 0 },
          data: {
            linghuiType: 'linghui/script',
            label: '脚本',
            accent: '#a78bfa',
            background: '#0f1720',
            properties: {
              mode: 'manual',
              content: '{"shots":[{"title":"开场","description":"雨夜街头，镜头跟随主角前行","durationSec":6},{"title":"回望","description":"主角停下脚步回头看向灯光","durationSec":10}]}',
              prompt: '',
              systemPrompt: '',
              llmSelection: '',
              viewMode: 'cards',
            },
            inputs: [
              { name: '图片参考', dataType: 'image' },
              { name: '文本设定', dataType: 'text' },
              { name: '视频参考', dataType: 'video' },
            ],
            outputs: [
              { name: 'script', dataType: 'text' },
              { name: 'storyboard', dataType: 'storyboard' },
            ],
            active: false,
          },
        },
        {
          id: 'text-node',
          type: 'linghui-text',
          position: { x: 320, y: 0 },
          data: {
            linghuiType: 'linghui/text',
            label: '文本',
            accent: '#f59e0b',
            background: '#0f1720',
            properties: {
              mode: 'generate',
              content: '',
              prompt: '',
              systemPrompt: '',
              llmSelection: '',
            },
            inputs: [
              { name: '图片参考', dataType: 'image' },
              { name: '文本输入', dataType: 'text' },
              { name: '视频参考', dataType: 'video' },
              { name: '音频参考', dataType: 'audio' },
            ],
            outputs: [{ name: 'text', dataType: 'text' }],
            active: false,
          },
        },
      ],
      edges: [
        {
          id: 'edge-script-text',
          source: 'script-node',
          target: 'text-node',
          sourceHandle: 'output-1',
          targetHandle: 'input-1',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'storyboard',
            targetSlotType: 'text',
          },
        },
      ],
      nodeOutputs: {},
    };

    const targetNode = context.nodes[1];
    const nodeView = createNodeView(context, targetNode);
    const input = nodeView.getInputResult(1);

    expect(input?.kind).toBe('storyboard');
    if (!input || input.kind !== 'storyboard') {
      throw new Error('expected storyboard result');
    }
    expect(input.shots).toHaveLength(2);
    expect(input.text).toContain('1. 开场');
    expect(input.text).toContain('2. 回望');
    expect(input.shots.map(shot => shot.durationSec)).toEqual([6, 10]);
    expect(input.metadata).toEqual(expect.objectContaining({
      mode: 'manual',
      parseSource: 'json',
    }));
  });
});
