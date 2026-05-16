import { useCallback } from 'react';
import { App } from 'antd';
import { electronService, openFileDialog } from '../../../../services/electronService';
import { importLinghuiWorkspaceAsset } from '../../../../store/linghuiStorage';
import type { LinghuiImageNodeProperties } from '../../../../types/linghui';
import {
  createLinghuiImageAssetItemFromSource,
  createLinghuiImageImportProperties,
} from '../../editors/state/linghuiImageCollections';
import {
  useLinghuiNodeEditorApi,
  useLinghuiNodeMutation,
} from './LinghuiNodeRunsContext';

interface UseLinghuiImageNodeUploadResult {
  /** 触发文件选择 + 写回节点 source，复用 ImageNodeEditor "替换图片" 同一条链路。 */
  trigger: () => Promise<void>;
}

/**
 * 抽自 ImageNodeEditor `handleReplaceImage`，让"节点上方浮按钮" / "未生成态占位" / "编辑器替换图片"
 * 三处入口走同一条上传链路：选文件 → 必要时导入到 workspace asset → 写回 properties → 清运行态。
 */
export function useLinghuiImageNodeUpload(nodeId: string): UseLinghuiImageNodeUploadResult {
  const { message } = App.useApp();
  const { workspaceId } = useLinghuiNodeEditorApi();
  const { clearNodeRunState, updateNodeData } = useLinghuiNodeMutation();

  const trigger = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        multiple: false,
        title: '选择图片素材',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      const filePath = result.filePaths[0];
      let resolvedSource = filePath;
      if (
        workspaceId
        && electronService.isElectron()
        && filePath
        && !filePath.startsWith('http://')
        && !filePath.startsWith('https://')
        && !filePath.startsWith('data:')
        && !filePath.startsWith('blob:')
      ) {
        resolvedSource = await importLinghuiWorkspaceAsset(
          workspaceId,
          filePath,
          filePath.split(/[\\/]/).pop(),
        );
      }

      const newItem = await createLinghuiImageAssetItemFromSource({
        source: resolvedSource,
        filenameHint: filePath.split(/[\\/]/).pop(),
      });

      updateNodeData(nodeId, (prev) => {
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
    } catch (error: any) {
      message.error(error?.message || '选择图片失败');
    }
  }, [clearNodeRunState, message, nodeId, updateNodeData, workspaceId]);

  return { trigger };
}
