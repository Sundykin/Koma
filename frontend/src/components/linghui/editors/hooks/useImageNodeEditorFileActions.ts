import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { LinghuiImageNodeProperties, LinghuiNodeData } from '../../../../types/linghui';
import { openFileDialog } from '../../../../services/electronService';
import {
  createLinghuiImageAssetItemFromSource,
  createLinghuiImageImportProperties,
} from '../state/linghuiImageCollections';
import {
  getFileNameHint,
  resolveImageFileSource,
} from '../components/ImageNodeEditorFileImport';

export function useImageNodeEditorFileActions(params: {
  clearNodeRunState: (nodeId: string) => void;
  message: MessageInstance;
  nodeId: string;
  setRelightReferenceImage: (source: string | null) => void;
  updateNodeData: (
    nodeId: string,
    updater: (previous: LinghuiNodeData) => LinghuiNodeData,
    options?: { markStale?: boolean },
  ) => void;
  workspaceId: string | null;
}): {
  handleClearImage: () => void;
  handlePickRelightReferenceImage: () => Promise<void>;
  handleReplaceImage: () => Promise<void>;
} {
  const {
    clearNodeRunState,
    message,
    nodeId,
    setRelightReferenceImage,
    updateNodeData,
    workspaceId,
  } = params;

  const handleReplaceImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        multiple: false,
        title: '选择图片素材',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const resolvedSource = await resolveImageFileSource({ workspaceId, filePath });

        const newItem = await createLinghuiImageAssetItemFromSource({
          source: resolvedSource,
          filenameHint: getFileNameHint(filePath),
        });

        updateNodeData(nodeId, prev => {
          const previousProps = prev.properties as unknown as LinghuiImageNodeProperties;
          const nextProperties = createLinghuiImageImportProperties(previousProps, [newItem], newItem.id);
          const nextLabel = prev.label.startsWith('图片') && newItem.label
            ? newItem.label
            : prev.label;
          return {
            ...prev,
            label: nextLabel,
            properties: nextProperties as unknown as Record<string, unknown>,
          };
        }, { markStale: false });
        clearNodeRunState(nodeId);
      }
    } catch (error: any) {
      message.error(error?.message || '选择图片失败');
    }
  }, [clearNodeRunState, message, nodeId, updateNodeData, workspaceId]);

  const handleClearImage = useCallback(() => {
    updateNodeData(nodeId, prev => {
      const previousProps = prev.properties as unknown as LinghuiImageNodeProperties;
      const nextProperties = createLinghuiImageImportProperties(previousProps, [], '');
      return {
        ...prev,
        properties: nextProperties as unknown as Record<string, unknown>,
      };
    }, { markStale: false });
    clearNodeRunState(nodeId);
  }, [clearNodeRunState, nodeId, updateNodeData]);

  const handlePickRelightReferenceImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        multiple: false,
        title: '选择打光参考图',
      });
      if (result.canceled || result.filePaths.length === 0) return;
      const filePath = result.filePaths[0];
      const resolvedSource = await resolveImageFileSource({ workspaceId, filePath });
      setRelightReferenceImage(resolvedSource);
    } catch (error: any) {
      message.error(error?.message || '选择打光参考图失败');
    }
  }, [message, setRelightReferenceImage, workspaceId]);

  return {
    handleClearImage,
    handlePickRelightReferenceImage,
    handleReplaceImage,
  };
}
