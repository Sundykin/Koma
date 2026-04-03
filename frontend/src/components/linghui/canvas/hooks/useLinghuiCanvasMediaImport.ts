import { useCallback } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiNodeType,
} from '../../../../types/linghui';
import { importLinghuiWorkspaceAsset } from '../../../../store/linghuiStorage';
import { openFileDialog } from '../../../../services/electronService';
import { createCanvasNode, readDroppedFileAsDataUrl } from '../state/linghuiCanvasShared';
import {
  createLinghuiImageAssetItemFromSource,
  createLinghuiImageImportProperties,
} from '../../editors/state/linghuiImageCollections';

interface UseLinghuiCanvasMediaImportParams {
  workspaceId: string | null | undefined;
  hostRef: RefObject<HTMLDivElement | null>;
  reactFlow: ReactFlowInstance;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEditorSelection: Dispatch<SetStateAction<import('../../../../types/linghui').LinghuiCanvasSelection>>;
  scheduleSnapshot: (options?: { recordHistory?: boolean; force?: boolean }) => void;
  clearPendingGroupFrame: () => void;
  closeContextMenu: () => void;
  closeQuickCreate: () => void;
  insertNodeAtScreenPosition: (type: LinghuiNodeType, screenX: number, screenY: number) => void;
  message: MessageInstance;
}

export function useLinghuiCanvasMediaImport({
  workspaceId,
  hostRef,
  reactFlow,
  setNodes,
  setEditorSelection,
  scheduleSnapshot,
  clearPendingGroupFrame,
  closeContextMenu,
  closeQuickCreate,
  insertNodeAtScreenPosition,
  message,
}: UseLinghuiCanvasMediaImportParams) {
  const createUploadedImageNode = useCallback((
    position: Node['position'],
    item: LinghuiImageAssetItem,
  ): Node => {
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
  }, []);

  const createUploadedVideoNode = useCallback((
    position: Node['position'],
    source: string,
    filename: string,
  ): Node => {
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
  }, []);

  const createUploadedAudioNode = useCallback((
    position: Node['position'],
    source: string,
    filename: string,
  ): Node => {
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
  }, []);

  const resolveDroppedFileSource = useCallback(async (file: File): Promise<string> => {
    const filePath = (file as File & { path?: string }).path;
    if (filePath) {
      if (workspaceId) {
        return importLinghuiWorkspaceAsset(workspaceId, filePath, file.name);
      }
      return filePath;
    }
    return readDroppedFileAsDataUrl(file);
  }, [workspaceId]);

  const addImageNodesAtScreenPosition = useCallback((
    items: LinghuiImageAssetItem[],
    screenX: number,
    screenY: number,
  ) => {
    if (!items.length) return;

    const basePosition = reactFlow.screenToFlowPosition({ x: screenX, y: screenY });
    setNodes(currentNodes => [
      ...currentNodes,
      ...items.map((item, index) => createUploadedImageNode(
        {
          x: basePosition.x + index * 36,
          y: basePosition.y + index * 28,
        },
        item,
      )),
    ]);
    setEditorSelection(null);
    clearPendingGroupFrame();
    scheduleSnapshot();
  }, [clearPendingGroupFrame, createUploadedImageNode, reactFlow, scheduleSnapshot, setEditorSelection, setNodes]);

  const addVideoNodesAtScreenPosition = useCallback((
    items: Array<{ source: string; filename: string }>,
    screenX: number,
    screenY: number,
  ) => {
    if (!items.length) return;

    const basePosition = reactFlow.screenToFlowPosition({ x: screenX, y: screenY });
    setNodes(currentNodes => [
      ...currentNodes,
      ...items.map((item, index) => createUploadedVideoNode(
        {
          x: basePosition.x + index * 36,
          y: basePosition.y + index * 28,
        },
        item.source,
        item.filename,
      )),
    ]);
    setEditorSelection(null);
    clearPendingGroupFrame();
    scheduleSnapshot();
  }, [clearPendingGroupFrame, createUploadedVideoNode, reactFlow, scheduleSnapshot, setEditorSelection, setNodes]);

  const addAudioNodesAtScreenPosition = useCallback((
    items: Array<{ source: string; filename: string }>,
    screenX: number,
    screenY: number,
  ) => {
    if (!items.length) return;

    const basePosition = reactFlow.screenToFlowPosition({ x: screenX, y: screenY });
    setNodes(currentNodes => [
      ...currentNodes,
      ...items.map((item, index) => createUploadedAudioNode(
        {
          x: basePosition.x + index * 36,
          y: basePosition.y + index * 28,
        },
        item.source,
        item.filename,
      )),
    ]);
    setEditorSelection(null);
    clearPendingGroupFrame();
    scheduleSnapshot();
  }, [clearPendingGroupFrame, createUploadedAudioNode, reactFlow, scheduleSnapshot, setEditorSelection, setNodes]);

  const handleUploadImagesToCanvas = useCallback(async (screenX?: number, screenY?: number) => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        multiple: true,
        title: '选择图片发送到灵绘画布',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      const targetRect = hostRef.current?.getBoundingClientRect();
      const nextScreenX = screenX ?? (targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2);
      const nextScreenY = screenY ?? (targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight / 2);
      const items = await Promise.all(result.filePaths.map(async filePath => {
        const filename = filePath.split(/[\\/]/).pop() || 'reference';
        const source = workspaceId
          ? await importLinghuiWorkspaceAsset(workspaceId, filePath, filename)
          : filePath;
        return createLinghuiImageAssetItemFromSource({
          source,
          filenameHint: filename,
        });
      }));

      addImageNodesAtScreenPosition(items, nextScreenX, nextScreenY);
    } catch (error: any) {
      message.error(error?.message || '上传图片到画布失败');
    }
  }, [addImageNodesAtScreenPosition, hostRef, message, workspaceId]);

  const handleUploadVideosToCanvas = useCallback(async (screenX?: number, screenY?: number) => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '视频', extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv'] }],
        multiple: true,
        title: '选择视频发送到灵绘画布',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      const targetRect = hostRef.current?.getBoundingClientRect();
      const nextScreenX = screenX ?? (targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2);
      const nextScreenY = screenY ?? (targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight / 2);
      const items = await Promise.all(result.filePaths.map(async filePath => ({
        filename: filePath.split(/[\\/]/).pop() || 'video',
        source: workspaceId
          ? await importLinghuiWorkspaceAsset(workspaceId, filePath, filePath.split(/[\\/]/).pop())
          : filePath,
      })));

      addVideoNodesAtScreenPosition(items, nextScreenX, nextScreenY);
    } catch (error: any) {
      message.error(error?.message || '上传视频到画布失败');
    }
  }, [addVideoNodesAtScreenPosition, hostRef, message, workspaceId]);

  const handleUploadAudiosToCanvas = useCallback(async (screenX?: number, screenY?: number) => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }],
        multiple: true,
        title: '选择音频发送到灵绘画布',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      const targetRect = hostRef.current?.getBoundingClientRect();
      const nextScreenX = screenX ?? (targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2);
      const nextScreenY = screenY ?? (targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight / 2);
      const items = await Promise.all(result.filePaths.map(async filePath => ({
        filename: filePath.split(/[\\/]/).pop() || 'audio',
        source: workspaceId
          ? await importLinghuiWorkspaceAsset(workspaceId, filePath, filePath.split(/[\\/]/).pop())
          : filePath,
      })));

      addAudioNodesAtScreenPosition(items, nextScreenX, nextScreenY);
    } catch (error: any) {
      message.error(error?.message || '上传音频到画布失败');
    }
  }, [addAudioNodesAtScreenPosition, hostRef, message, workspaceId]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    const dragTypes = Array.from(event.dataTransfer.types);
    if (dragTypes.includes('application/x-linghui-node-type')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      return;
    }

    const hasFile = Array.from(event.dataTransfer.items ?? []).some(item => item.kind === 'file');
    if (hasFile) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    const nodeType = event.dataTransfer.getData('application/x-linghui-node-type') as LinghuiNodeType | '';
    if (nodeType) {
      event.preventDefault();
      insertNodeAtScreenPosition(nodeType, event.clientX, event.clientY);
      return;
    }

    const files = Array.from(event.dataTransfer.files ?? []);
    if (!files.length) return;

    event.preventDefault();
    closeContextMenu();
    closeQuickCreate();

    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    const videoFiles = files.filter(file => file.type.startsWith('video/'));
    const audioFiles = files.filter(file => file.type.startsWith('audio/'));
    const unsupportedFiles = files.filter(file => (
      !file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/')
    ));

    if (!imageFiles.length && !videoFiles.length && !audioFiles.length) {
      message.warning('当前画布支持拖入图片、视频和音频文件。');
      return;
    }

    void (async () => {
      try {
        const resolvedImages = await Promise.all(imageFiles.map(async file => (
          createLinghuiImageAssetItemFromSource({
            source: await resolveDroppedFileSource(file),
            filenameHint: file.name,
          })
        )));
        const resolvedVideos = await Promise.all(videoFiles.map(async file => ({
          filename: file.name,
          source: await resolveDroppedFileSource(file),
        })));
        const resolvedAudios = await Promise.all(audioFiles.map(async file => ({
          filename: file.name,
          source: await resolveDroppedFileSource(file),
        })));

        addImageNodesAtScreenPosition(resolvedImages, event.clientX, event.clientY);
        addVideoNodesAtScreenPosition(
          resolvedVideos,
          event.clientX + (resolvedImages.length ? 72 : 0),
          event.clientY + (resolvedImages.length ? 36 : 0),
        );
        addAudioNodesAtScreenPosition(
          resolvedAudios,
          event.clientX + (resolvedImages.length || resolvedVideos.length ? 144 : 0),
          event.clientY + ((resolvedImages.length || resolvedVideos.length) ? 72 : 0),
        );

        if (unsupportedFiles.length > 0) {
          message.info('已导入可识别的图片、视频和音频文件，其余文件类型暂未处理。');
        }
      } catch (error: any) {
        message.error(error?.message || '导入拖入文件失败');
      }
    })();
  }, [
    addAudioNodesAtScreenPosition,
    addImageNodesAtScreenPosition,
    addVideoNodesAtScreenPosition,
    closeContextMenu,
    closeQuickCreate,
    insertNodeAtScreenPosition,
    message,
    resolveDroppedFileSource,
  ]);

  return {
    handleUploadImagesToCanvas,
    handleUploadVideosToCanvas,
    handleUploadAudiosToCanvas,
    handleDragOver,
    handleDrop,
  };
}
