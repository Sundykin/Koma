import { describe, expect, it } from 'vitest';
import { createNewNodeData, isLinghuiConnectionValid } from '../state/linghuiNodeDefs';
import type { LinghuiNodeData } from '../../../../types/linghui';

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

  it('允许图片连接到文本节点，由目标节点按自身输入能力过滤', () => {
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

    expect(result.valid).toBe(true);
  });

  it('允许图片连接到音频和脚本节点，由执行阶段过滤无关上游结果', () => {
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

    expect(audioResult.valid).toBe(true);
    expect(scriptResult.valid).toBe(true);
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

  it('为全景节点创建图片家族槽位和全景默认参数', () => {
    const data = createNewNodeData('linghui/panorama');

    expect(data.linghuiType).toBe('linghui/panorama');
    expect(data.inputs).toEqual([
      { name: '参考', dataType: 'image' },
      { name: '文本', dataType: 'text' },
    ]);
    expect(data.outputs).toEqual([{ name: 'image', dataType: 'image' }]);
    expect(data.properties).toEqual(expect.objectContaining({
      mode: 'generate',
      aspectRatio: '21:9',
      batchCount: 1,
      panoramaTemplate: 'auto',
    }));
  });

  it('为 image-generator 控制器节点创建无输出端口的默认属性', () => {
    const data = createNewNodeData('linghui/image-generator');

    expect(data.linghuiType).toBe('linghui/image-generator');
    // 控制器无输出：所有出图状态由派生的下游 image 节点承载
    expect(data.outputs).toEqual([]);
    expect(data.inputs).toEqual([
      { name: '参考', dataType: 'image' },
      { name: '文本', dataType: 'text' },
    ]);
    expect(data.properties).toEqual(expect.objectContaining({
      prompt: '',
      ttiSelection: '',
      aspectRatio: '3:4',
      resolution: 'auto',
      batchCount: 1,
      generatedImageNodeIds: [],
      generationCount: 0,
    }));
  });

  it('为 agent 节点创建文本输出和安全默认属性', () => {
    const data = createNewNodeData('linghui/agent');

    expect(data.linghuiType).toBe('linghui/agent');
    expect(data.outputs).toEqual([{ name: 'text', dataType: 'text' }]);
    expect(data.inputs).toEqual([
      { name: '图片参考', dataType: 'image' },
      { name: '文本输入', dataType: 'text' },
    ]);
    expect(data.properties).toEqual(expect.objectContaining({
      prompt: '',
      systemPrompt: '',
      llmSelection: '',
      enabledTools: [],
      maxIterations: 6,
    }));
  });
});
