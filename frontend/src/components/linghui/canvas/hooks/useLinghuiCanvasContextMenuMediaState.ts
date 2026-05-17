import { useMemo } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import {
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
} from '../../../../types/linghui';
import { resolveLinghuiImageCollection } from '../../editors/state/linghuiImageCollections';
import { resolveLinghuiCanvasResultCopyState } from '../state/linghuiCanvasResultActions';
import type { LinghuiCanvasMenuState } from '../state/linghuiCanvasShared';
import {
  collectVideoItemsFromResult,
  imageMediaToAssetItem,
  uniqueVideoItems,
} from './linghuiCanvasOverlayMediaHelpers';

export function useLinghuiCanvasContextMenuMediaState({
  contextMenu,
  nodeRuns,
  reactFlow,
}: {
  contextMenu: LinghuiCanvasMenuState | null;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  reactFlow: ReactFlowInstance;
}) {
  const contextMenuNode = useMemo(() => {
    if (!contextMenu?.nodeId) {
      return null;
    }
    return reactFlow.getNode(contextMenu.nodeId) ?? null;
  }, [contextMenu, reactFlow]);

  const contextMenuNodeRun = contextMenu?.nodeId ? nodeRuns[contextMenu.nodeId] : undefined;

  const contextMenuResultCopyState = useMemo(
    () => resolveLinghuiCanvasResultCopyState(contextMenuNodeRun),
    [contextMenuNodeRun],
  );

  const contextMenuMediaActionState = useMemo(() => {
    if (!contextMenuNode || contextMenuNode.type === 'group') {
      return {
        imageItems: [] as LinghuiImageAssetItem[],
        primaryImage: null as LinghuiImageAssetItem | null,
        videoItems: [] as LinghuiMediaItem[],
      };
    }

    const nodeData = contextMenuNode.data as unknown as LinghuiNodeData;
    const imageItems = (() => {
      if (nodeData.linghuiType === 'linghui/image' || nodeData.linghuiType === 'linghui/panorama') {
        const collection = resolveLinghuiImageCollection(
          nodeData.properties as unknown as LinghuiImageNodeProperties,
          contextMenuNodeRun?.result,
        );
        return {
          items: collection.items
            .map((item, index) => imageMediaToAssetItem(item, index))
            .filter((item): item is LinghuiImageAssetItem => Boolean(item)),
          primary: collection.primary ? imageMediaToAssetItem(collection.primary, 0) : null,
        };
      }

      const primary = getLinghuiResultPrimaryMedia(contextMenuNodeRun?.result);
      const resultItems = [
        ...(primary?.kind === 'image' ? [primary] : []),
        ...getLinghuiResultItems(contextMenuNodeRun?.result).filter(item => item.kind === 'image'),
      ];
      const items = resultItems
        .map((item, index) => imageMediaToAssetItem(item, index))
        .filter((item): item is LinghuiImageAssetItem => Boolean(item));
      return { items, primary: items[0] ?? null };
    })();

    const propertyVideoItems = (() => {
      if (nodeData.linghuiType !== 'linghui/video') {
        return [] as LinghuiMediaItem[];
      }
      const props = nodeData.properties as unknown as LinghuiVideoNodeProperties;
      const source = String(props.source ?? '').trim();
      const posterSource = String(props.posterSource ?? '').trim();
      if (!source && !posterSource) {
        return [] as LinghuiMediaItem[];
      }
      return [{
        kind: 'video',
        source,
        posterSource,
        label: nodeData.label,
      } satisfies LinghuiMediaItem];
    })();

    const generatorNodeId = (() => {
      if (nodeData.linghuiType !== 'linghui/image') return null;
      // image-generator 控制器节点已废弃；统一图片节点没有"回控制器"流程，永远返回 null。
      // 历史 generatedFromNodeId 字段保留作为派生关系记录，但 UI 不再暴露"返回生成节点"。
      return null;
    })();

    return {
      imageItems: imageItems.items,
      primaryImage: imageItems.primary ?? imageItems.items[0] ?? null,
      videoItems: uniqueVideoItems([
        ...propertyVideoItems,
        ...collectVideoItemsFromResult(contextMenuNodeRun),
      ]),
      generatorNodeId,
    };
  }, [contextMenuNode, contextMenuNodeRun]);

  return {
    contextMenuNode,
    contextMenuNodeRun,
    contextMenuResultCopyState,
    contextMenuMediaActionState,
  };
}
