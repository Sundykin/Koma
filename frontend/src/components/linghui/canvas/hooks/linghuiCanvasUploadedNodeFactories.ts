import type { Node } from '@xyflow/react';
import type {
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
} from '../../../../types/linghui';
import { createLinghuiImageImportProperties } from '../../editors/state/linghuiImageCollections';
import { createCanvasNode } from '../state/linghuiCanvasShared';

export function createUploadedImageNode(
  position: Node['position'],
  item: LinghuiImageAssetItem,
): Node {
  const label = item.label?.trim() || '图片';
  const node = createCanvasNode('linghui/image', position, []);
  const nodeData = node.data as unknown as LinghuiNodeData;
  const nodeProps = nodeData.properties as unknown as LinghuiImageNodeProperties;
  return {
    ...node,
    data: {
      ...nodeData,
      label,
      properties: {
        ...createLinghuiImageImportProperties(nodeProps, [item], item.id),
      },
    } as unknown as Record<string, unknown>,
  };
}

export function createUploadedVideoNode(
  position: Node['position'],
  source: string,
  filename: string,
): Node {
  const label = filename.replace(/\.[^.]+$/, '').trim() || '视频';
  const node = createCanvasNode('linghui/video', position, []);
  const nodeData = node.data as unknown as LinghuiNodeData;

  return {
    ...node,
    data: {
      ...nodeData,
      label,
      properties: {
        ...nodeData.properties,
        source,
        posterSource: '',
      },
    } as unknown as Record<string, unknown>,
  };
}

export function createUploadedAudioNode(
  position: Node['position'],
  source: string,
  filename: string,
): Node {
  const label = filename.replace(/\.[^.]+$/, '').trim() || '音频';
  const node = createCanvasNode('linghui/audio', position, []);
  const nodeData = node.data as unknown as LinghuiNodeData;

  return {
    ...node,
    data: {
      ...nodeData,
      label,
      properties: {
        ...nodeData.properties,
        source,
      },
    } as unknown as Record<string, unknown>,
  };
}
