import { describe, expect, it } from 'vitest';
import {
  LINGHUI_NODE_CATALOG,
  createNewNodeData,
  isLinghuiConnectionValid,
  isLinghuiSlotDataTypeCompatible,
  resolveLinghuiCompatibleInputSlot,
} from '../state/linghuiNodeDefs';
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

  it('按语义槽位判断兼容关系，而不是只看统一物理端口', () => {
    expect(isLinghuiSlotDataTypeCompatible({
      sourceDataType: 'text',
      targetDataType: 'image',
    })).toBe(false);
    expect(resolveLinghuiCompatibleInputSlot('linghui/image', 'text')).toEqual({
      slot: { name: '文本', dataType: 'text' },
      index: 1,
    });
    // image 节点的 inputs 只有 image / text，audio 永远不兼容。
    expect(resolveLinghuiCompatibleInputSlot('linghui/image', 'audio')).toBeNull();
  });

  it('为图片节点创建聚焦区域兼容默认属性', () => {
    const data = createNewNodeData('linghui/image');

    expect(data.linghuiType).toBe('linghui/image');
    expect(data.inputs).toEqual([
      { name: '参考', dataType: 'image' },
      { name: '文本', dataType: 'text' },
    ]);
    expect(data.outputs).toEqual([{ name: 'image', dataType: 'image' }]);
    expect(data.properties).toEqual(expect.objectContaining({
      mode: 'generate',
      focusRegion: null,
      markPoints: [],
      aspectRatio: '3:4',
      batchCount: 1,
    }));
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
      focusRegion: null,
      markPoints: [],
      aspectRatio: '2:1',
      batchCount: 1,
      panoramaTemplate: 'auto',
      projectionMode: 'equirectangular-2to1',
      panoramaSlashScene: '720_panoramic',
      panoramaWithPromptScene: '720_panoramic_with_prompt',
      panoramaSlashLabel: '720°全景图',
      panoramaModelKey: 'lib-image-2',
      panoramaQuality: 'medium',
    }));
  });

  it('在节点目录中暴露全景节点和 3D 导演工作台', () => {
    expect(LINGHUI_NODE_CATALOG).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'linghui/panorama',
        label: '全景节点',
        category: 'spatial',
        description: '生成或导入全景环境图，并在画布中预览空间关系',
      }),
      expect.objectContaining({
        type: 'linghui/director3d',
        label: '3D 导演工作台',
        category: 'spatial',
      }),
    ]));
  });

  // LibTV 1:1：linghui/image-generator 已删除，所有"生成图片"都用统一 linghui/image 节点（mode='generate'）。
  // 旧持久化的 linghui-image-generator type 会被 RF type 迁移层折叠为 linghui-image。

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
