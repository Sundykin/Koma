import { describe, expect, it } from 'vitest';
import type { LinghuiNodeData, LinghuiNodeResult } from '../../../../types/linghui';
import { buildLinghuiReferenceMediaBuckets } from '../state/linghuiReferenceMedia';

function createNodeData(id: string, type: LinghuiNodeData['linghuiType']): LinghuiNodeData {
  return {
    linghuiType: type,
    label: id,
    accent: '#38bdf8',
    background: '#0f1720',
    properties: {},
    inputs: [],
    outputs: [],
    active: false,
  };
}

describe('buildLinghuiReferenceMediaBuckets', () => {
  it('统一端口上游统计按媒体类型分桶，不把全部上游重复计入图片/视频/音频', () => {
    const upstreamNodeIds = ['image-1', 'image-2', 'image-3', 'image-4', 'video-1', 'video-2'];
    const nodeDataMap = new Map<string, LinghuiNodeData>([
      ['image-1', createNodeData('图片 1', 'linghui/image')],
      ['image-2', createNodeData('图片 2', 'linghui/image')],
      ['image-3', createNodeData('图片 3', 'linghui/image')],
      ['image-4', createNodeData('图片 4', 'linghui/image')],
      ['video-1', createNodeData('视频 1', 'linghui/video')],
      ['video-2', createNodeData('视频 2', 'linghui/video')],
    ]);
    const results: Record<string, LinghuiNodeResult> = {
      'image-1': { kind: 'image', primary: { kind: 'image', source: '/tmp/1.png' } },
      'image-2': { kind: 'image', primary: { kind: 'image', source: '/tmp/2.png' } },
      'image-3': { kind: 'image', primary: { kind: 'image', source: '/tmp/3.png' } },
      'image-4': { kind: 'image', primary: { kind: 'image', source: '/tmp/4.png' } },
      'video-1': { kind: 'video', primary: { kind: 'video', source: '/tmp/1.mp4', posterSource: '/tmp/1.jpg' } },
      'video-2': { kind: 'video', primary: { kind: 'video', source: '/tmp/2.mp4', posterSource: '/tmp/2.jpg' } },
    };

    const buckets = buildLinghuiReferenceMediaBuckets({
      upstreamNodeIds,
      nodeDataMap,
      getNodeResult: nodeId => results[nodeId],
    });

    expect(buckets.images.map(item => item.source)).toEqual([
      '/tmp/1.png',
      '/tmp/2.png',
      '/tmp/3.png',
      '/tmp/4.png',
    ]);
    expect(buckets.videos.map(item => item.source)).toEqual([
      '/tmp/1.mp4',
      '/tmp/2.mp4',
    ]);
    expect(buckets.audios).toEqual([]);
  });
});
