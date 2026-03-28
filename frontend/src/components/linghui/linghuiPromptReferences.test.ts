import { describe, expect, it } from 'vitest';
import type { LinghuiNodeData } from '../../types/linghui';
import {
  buildLinghuiPromptReferenceItems,
  compileLinghuiPromptReferences,
  createLinghuiPromptReferenceString,
} from './linghuiPromptReferences';

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
      ttiConfigId: '',
      aspectRatio: '1:1',
      resolution: '1024x1024',
      gridType: 'none',
      batchCount: 1,
    },
  };
}

describe('linghuiPromptReferences', () => {
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
