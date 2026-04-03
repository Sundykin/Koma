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
              content: '{"shots":[{"title":"开场","description":"雨夜街头，镜头跟随主角前行","durationSec":3},{"title":"回望","description":"主角停下脚步回头看向灯光","durationSec":4}]}',
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
    expect(input.metadata).toEqual(expect.objectContaining({
      mode: 'manual',
      parseSource: 'json',
    }));
  });
});
