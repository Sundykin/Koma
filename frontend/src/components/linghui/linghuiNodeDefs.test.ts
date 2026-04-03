import { describe, expect, it } from 'vitest';
import { isLinghuiConnectionValid } from './linghuiNodeDefs';
import type { LinghuiNodeData } from '../../types/linghui';

function createNode(id: string, data: LinghuiNodeData) {
  return { id, data };
}

describe('isLinghuiConnectionValid', () => {
  const imageNode = createNode('image-node', {
    linghuiType: 'linghui/image',
    label: '图片',
    accent: '#4ade80',
    background: '#0f1720',
    properties: {},
    inputs: [
      { name: '参考', dataType: 'image' },
      { name: '文本', dataType: 'text' },
    ],
    outputs: [{ name: 'image', dataType: 'image' }],
    active: false,
  });

  it('阻止图片连接到文本节点的无效图片槽位', () => {
    const textNode = createNode('text-node', {
      linghuiType: 'linghui/text',
      label: '文本',
      accent: '#f59e0b',
      background: '#0f1720',
      properties: {},
      inputs: [
        { name: '图片参考', dataType: 'image' },
        { name: '文本输入', dataType: 'text' },
        { name: '视频参考', dataType: 'video' },
        { name: '音频参考', dataType: 'audio' },
      ],
      outputs: [{ name: 'text', dataType: 'text' }],
      active: false,
    });

    const result = isLinghuiConnectionValid({
      source: 'image-node',
      target: 'text-node',
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
    }, [imageNode, textNode]);

    expect(result.valid).toBe(false);
    expect(result.message).toContain('文本节点当前不会消费图片输入');
  });

  it('阻止图片连接到音频和脚本节点的无效图片槽位', () => {
    const audioNode = createNode('audio-node', {
      linghuiType: 'linghui/audio',
      label: '音频',
      accent: '#f97316',
      background: '#0f1720',
      properties: {},
      inputs: [
        { name: '图片参考', dataType: 'image' },
        { name: '文本输入', dataType: 'text' },
        { name: '视频参考', dataType: 'video' },
        { name: '音频参考', dataType: 'audio' },
      ],
      outputs: [{ name: 'audio', dataType: 'audio' }],
      active: false,
    });

    const scriptNode = createNode('script-node', {
      linghuiType: 'linghui/script',
      label: '脚本',
      accent: '#a78bfa',
      background: '#0f1720',
      properties: {},
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
    });

    const audioResult = isLinghuiConnectionValid({
      source: 'image-node',
      target: 'audio-node',
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
    }, [imageNode, audioNode]);
    const scriptResult = isLinghuiConnectionValid({
      source: 'image-node',
      target: 'script-node',
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
    }, [imageNode, scriptNode]);

    expect(audioResult.valid).toBe(false);
    expect(scriptResult.valid).toBe(false);
  });

  it('保留图片到视频节点主参考输入的合法连接', () => {
    const videoNode = createNode('video-node', {
      linghuiType: 'linghui/video',
      label: '视频',
      accent: '#22c55e',
      background: '#0f1720',
      properties: {},
      inputs: [
        { name: '参考', dataType: 'image' },
        { name: '文本', dataType: 'text' },
        { name: '音频', dataType: 'audio' },
        { name: '视频', dataType: 'video' },
      ],
      outputs: [{ name: 'video', dataType: 'video' }],
      active: false,
    });

    const result = isLinghuiConnectionValid({
      source: 'image-node',
      target: 'video-node',
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
    }, [imageNode, videoNode]);

    expect(result.valid).toBe(true);
  });
});
