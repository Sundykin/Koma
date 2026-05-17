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
import {
  isImageHostingEnabled,
  uploadLocalFileToImageHosting,
} from '../../../../services/imageHostingService';
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

  /**
   * 右键上传走"图床"OSS 优先链路：
   * - 配置了 image-hosting 渠道 → uploadLocalFileToImageHosting() 拿远端 URL，作为节点 source
   * - 未配置或上传失败 → 回退到 importLinghuiWorkspaceAsset()（koma-local://）；
   *   未拿到 workspaceId 时再退化为本地路径
   * 视频也复用同一管线：底层 provider.uploadImage(bytes) 与内容类型无关，可承载视频字节流。
   */
  const resolveUploadedFileSource = useCallback(async (
    filePath: string,
    filename: string,
    options: { ossEnabled: boolean; kind: 'image' | 'video' },
  ): Promise<{ source: string; via: 'oss' | 'workspace' | 'path'; ossError?: string }> => {
    if (options.ossEnabled) {
      const ossResult = await uploadLocalFileToImageHosting(filePath, { filename });
      if (ossResult.success && ossResult.url) {
        return { source: ossResult.url, via: 'oss' };
      }
      // OSS 失败：先记录原因，再走 workspace 兜底
      const ossError = ossResult.error || '图床上传失败';
      if (workspaceId) {
        const localSource = await importLinghuiWorkspaceAsset(workspaceId, filePath, filename);
        return { source: localSource, via: 'workspace', ossError };
      }
      return { source: filePath, via: 'path', ossError };
    }
    if (workspaceId) {
      const localSource = await importLinghuiWorkspaceAsset(workspaceId, filePath, filename);
      return { source: localSource, via: 'workspace' };
    }
    return { source: filePath, via: 'path' };
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

      if (result.canceled || result.filePaths.length === 0) return;

      const targetRect = hostRef.current?.getBoundingClientRect();
      const nextScreenX = screenX ?? (targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2);
      const nextScreenY = screenY ?? (targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight / 2);

      // 用户要求：先创建带"上传中"标记的节点，再异步走 OSS。这样选完文件立刻能在画布上看到进度反馈。
      const pendingItems = await Promise.all(result.filePaths.map(async filePath => {
        const filename = filePath.split(/[\\/]/).pop() || 'reference';
        // 占位 source = filePath，节点 UI 显示"上传中"蒙层，待 OSS 完成后切到远端 URL
        const item = await createLinghuiImageAssetItemFromSource({ source: filePath, filenameHint: filename });
        return { filePath, filename, item };
      }));

      // Step 1: 立即在画布上插入占位节点（带 _uploadPending 标志）。
      // ⚠ 关键：节点对象**在 setNodes 外面**预先生成。React Strict Mode 会双调用 setNodes updater，
      // 如果在 updater 内部 createCanvasNode，两次会生成不同的 nanoid，导致后续 insertedIds 与实际
      // 提交的节点 id 不匹配（异步上传完成时 setNodes 找不到目标节点，蒙层永远清不掉）。
      const basePosition = reactFlow.screenToFlowPosition({ x: nextScreenX, y: nextScreenY });
      const createdNodes = pendingItems.map((entry, index) => {
        const node = createUploadedImageNode(
          { x: basePosition.x + index * 36, y: basePosition.y + index * 28 },
          entry.item,
        );
        const nodeData = node.data as unknown as LinghuiNodeData;
        return {
          ...node,
          data: {
            ...nodeData,
            properties: {
              ...nodeData.properties,
              _uploadPending: true,
            },
          } as unknown as Record<string, unknown>,
        };
      });
      const insertedIds = createdNodes.map(node => node.id);
      setNodes(currentNodes => [...currentNodes, ...createdNodes]);
      setEditorSelection(null);
      clearPendingGroupFrame();
      scheduleSnapshot();

      // Step 2: 异步逐张上传，完成一张切一张，提供真实进度反馈。
      const ossEnabled = await isImageHostingEnabled();
      if (!ossEnabled) message.info('未配置图床渠道，已使用本地工作区资产作为备用。');

      let ossFailureCount = 0;
      await Promise.all(pendingItems.map(async (entry, index) => {
        const nodeId = insertedIds[index];
        try {
          const resolved = await resolveUploadedFileSource(entry.filePath, entry.filename, { ossEnabled, kind: 'image' });
          if (resolved.ossError) ossFailureCount += 1;
          const finalItem = await createLinghuiImageAssetItemFromSource({
            source: resolved.source,
            filenameHint: entry.filename,
          });
          setNodes(currentNodes => currentNodes.map(node => {
            if (node.id !== nodeId) return node;
            const nodeData = node.data as unknown as LinghuiNodeData;
            const props = nodeData.properties as unknown as LinghuiImageNodeProperties;
            const nextProps = createLinghuiImageImportProperties(props, [finalItem], finalItem.id);
            return {
              ...node,
              data: {
                ...nodeData,
                properties: {
                  ...nextProps,
                  _uploadPending: false,
                  _uploadError: undefined,
                } as unknown as Record<string, unknown>,
              } as unknown as Record<string, unknown>,
            };
          }));
          scheduleSnapshot();
        } catch (error: any) {
          // 单张上传失败：把节点标记为失败态（仍清除 pending，避免一直转圈）
          setNodes(currentNodes => currentNodes.map(node => {
            if (node.id !== nodeId) return node;
            const nodeData = node.data as unknown as LinghuiNodeData;
            return {
              ...node,
              data: {
                ...nodeData,
                properties: {
                  ...nodeData.properties,
                  _uploadPending: false,
                  _uploadError: error?.message || '上传失败',
                },
              } as unknown as Record<string, unknown>,
            };
          }));
        }
      }));

      if (ossEnabled && ossFailureCount > 0) {
        message.warning(`图床上传失败 ${ossFailureCount} 张，已回退到本地资产`);
      }
    } catch (error: any) {
      message.error(error?.message || '上传图片到画布失败');
    }
  }, [
    clearPendingGroupFrame,
    createUploadedImageNode,
    hostRef,
    message,
    reactFlow,
    resolveUploadedFileSource,
    scheduleSnapshot,
    setEditorSelection,
    setNodes,
  ]);

  const handleUploadVideosToCanvas = useCallback(async (screenX?: number, screenY?: number) => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '视频', extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv'] }],
        multiple: true,
        title: '选择视频发送到灵绘画布',
      });

      if (result.canceled || result.filePaths.length === 0) return;

      const targetRect = hostRef.current?.getBoundingClientRect();
      const nextScreenX = screenX ?? (targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2);
      const nextScreenY = screenY ?? (targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight / 2);

      const pendingItems = result.filePaths.map(filePath => ({
        filePath,
        filename: filePath.split(/[\\/]/).pop() || 'video',
      }));

      // Step 1: 立即用占位 source（filePath）插入节点 + _uploadPending 标志
      // ⚠ 与 image 上传同：节点对象在 setNodes 外预生成，避免 Strict Mode 双调用导致 id 不匹配
      const basePosition = reactFlow.screenToFlowPosition({ x: nextScreenX, y: nextScreenY });
      const createdNodes = pendingItems.map((entry, index) => {
        const node = createUploadedVideoNode(
          { x: basePosition.x + index * 36, y: basePosition.y + index * 28 },
          entry.filePath,
          entry.filename,
        );
        const nodeData = node.data as unknown as LinghuiNodeData;
        return {
          ...node,
          data: {
            ...nodeData,
            properties: { ...nodeData.properties, _uploadPending: true },
          } as unknown as Record<string, unknown>,
        };
      });
      const insertedIds = createdNodes.map(node => node.id);
      setNodes(currentNodes => [...currentNodes, ...createdNodes]);
      setEditorSelection(null);
      clearPendingGroupFrame();
      scheduleSnapshot();

      // Step 2: 异步逐个上传 + 完成切 source
      const ossEnabled = await isImageHostingEnabled();
      if (!ossEnabled) message.info('未配置图床渠道，视频已使用本地工作区资产作为备用。');

      let ossFailureCount = 0;
      await Promise.all(pendingItems.map(async (entry, index) => {
        const nodeId = insertedIds[index];
        try {
          const resolved = await resolveUploadedFileSource(entry.filePath, entry.filename, { ossEnabled, kind: 'video' });
          if (resolved.ossError) ossFailureCount += 1;
          setNodes(currentNodes => currentNodes.map(node => {
            if (node.id !== nodeId) return node;
            const nodeData = node.data as unknown as LinghuiNodeData;
            return {
              ...node,
              data: {
                ...nodeData,
                properties: {
                  ...nodeData.properties,
                  source: resolved.source,
                  posterSource: '',
                  // 显式清掉 _uploadPending / _uploadError 以撤销蒙层
                  _uploadPending: false,
                  _uploadError: undefined,
                } as Record<string, unknown>,
              } as unknown as Record<string, unknown>,
            };
          }));
          scheduleSnapshot();
        } catch (error: any) {
          setNodes(currentNodes => currentNodes.map(node => {
            if (node.id !== nodeId) return node;
            const nodeData = node.data as unknown as LinghuiNodeData;
            return {
              ...node,
              data: {
                ...nodeData,
                properties: {
                  ...nodeData.properties,
                  _uploadPending: false,
                  _uploadError: error?.message || '上传失败',
                },
              } as unknown as Record<string, unknown>,
            };
          }));
        }
      }));

      if (ossEnabled && ossFailureCount > 0) {
        message.warning(`图床上传失败 ${ossFailureCount} 个视频，已回退到本地资产`);
      }
    } catch (error: any) {
      message.error(error?.message || '上传视频到画布失败');
    }
  }, [
    clearPendingGroupFrame,
    createUploadedVideoNode,
    hostRef,
    message,
    reactFlow,
    resolveUploadedFileSource,
    scheduleSnapshot,
    setEditorSelection,
    setNodes,
  ]);

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
