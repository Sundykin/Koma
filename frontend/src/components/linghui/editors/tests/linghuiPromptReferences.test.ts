import { describe, expect, it } from 'vitest';
import type { LinghuiNodeData } from '../../../../types/linghui';
import {
  buildLinghuiPromptReferenceItems,
  compileLinghuiPromptReferences,
  createLinghuiPromptReferenceString,
} from '../state/linghuiPromptReferences';

function createImageNodeData(label: string, source: string): LinghuiNodeData {
  return {
    linghuiType: 'linghui/image',
    label,
    accent: '#2563eb',
    background: '#0f172a',
    active: false,
    inputs: [],
    outputs: [],
    properties: {
      mode: 'import',
      source,
      prompt: '',
      ttiSelection: '',
      aspectRatio: '1:1',
      resolution: '1024x1024',
      gridType: 'none',
      batchCount: 1,
    },
  };
}

describe('linghuiPromptReferences', () => {
  it('全景结果引用会复用图片主图选择', () => {
    const references = buildLinghuiPromptReferenceItems({
      nodeId: 'target',
      nodes: [
        {
          id: 'panorama-node',
          data: {
            ...createImageNodeData('全景环境', ''),
            linghuiType: 'linghui/panorama',
            properties: {
              ...createImageNodeData('全景环境', '').properties,
              primaryResultSource: '/tmp/right-panorama.png',
              aspectRatio: '21:9',
              panoramaTemplate: 'outdoor',
            },
          },
        },
        { id: 'target', data: createImageNodeData('目标图片', '') },
      ],
      edges: [
        { source: 'panorama-node', target: 'target', sourceHandle: 'output-0', targetHandle: 'input-0' },
      ],
      getNodeResult: () => ({
        kind: 'images',
        primary: { kind: 'image', source: '/tmp/left-panorama.png' },
        items: [
          { kind: 'image', source: '/tmp/left-panorama.png' },
          { kind: 'image', source: '/tmp/right-panorama.png' },
        ],
      }),
    });

    expect(references[0]).toEqual(expect.objectContaining({
      kind: 'image',
      source: '/tmp/right-panorama.png',
      previewSource: '/tmp/right-panorama.png',
    }));
  });

  it('图片引用编号顺序应与上游输入槽顺序一致', () => {
    const references = buildLinghuiPromptReferenceItems({
      nodeId: 'target',
      nodes: [
        { id: 'node-1', data: createImageNodeData('图片 1', '/tmp/1.png') },
        { id: 'node-2', data: createImageNodeData('图片 2', '/tmp/2.png') },
        { id: 'node-3', data: createImageNodeData('图片 3', '/tmp/3.png') },
        { id: 'target', data: createImageNodeData('目标图片', '') },
      ],
      edges: [
        { source: 'node-1', target: 'target', sourceHandle: 'output-0', targetHandle: 'input-2' },
        { source: 'node-3', target: 'target', sourceHandle: 'output-0', targetHandle: 'input-0' },
        { source: 'node-2', target: 'target', sourceHandle: 'output-0', targetHandle: 'input-1' },
      ],
    });

    expect(references.map(item => item.nodeId)).toEqual(['node-3', 'node-2', 'node-1']);

    const compiled = compileLinghuiPromptReferences({
      prompt: [
        createLinghuiPromptReferenceString('node-1'),
        createLinghuiPromptReferenceString('node-3'),
        createLinghuiPromptReferenceString('node-2'),
      ].join(' '),
      references,
      replacementStrategy: 'image-index',
    });

    expect(compiled.compiledPrompt).toBe('@Image 3 @Image 1 @Image 2');
    expect(compiled.compiledReferences).toEqual(['/tmp/3.png', '/tmp/2.png', '/tmp/1.png']);
    expect(compiled.unresolvedMentions).toEqual([]);
  });
});
