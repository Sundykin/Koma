import { useCallback } from 'react';
import { App } from 'antd';
import { electronService, openFileDialog } from '../../../../services/electronService';
import { importLinghuiWorkspaceAsset } from '../../../../store/linghuiStorage';
import type { LinghuiVideoNodeProperties } from '../../../../types/linghui';
import {
  useLinghuiNodeEditorApi,
  useLinghuiNodeMutation,
} from './LinghuiNodeRunsContext';

interface UseLinghuiVideoNodeUploadResult {
  /** 触发文件选择 + 写回视频节点 source，对齐 image 节点上传 hook 行为。 */
  trigger: () => Promise<void>;
}

/**
 * 视频节点版"上传" hook，结构与 useLinghuiImageNodeUpload 一致：
 * 选 mp4/mov/webm 等本地视频 → 必要时复制到 workspace assets → 写回 properties.source → 清运行态。
 */
export function useLinghuiVideoNodeUpload(nodeId: string): UseLinghuiVideoNodeUploadResult {
  const { message } = App.useApp();
  const { workspaceId } = useLinghuiNodeEditorApi();
  const { clearNodeRunState, updateNodeData } = useLinghuiNodeMutation();

  const trigger = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '视频', extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv'] }],
        multiple: false,
        title: '选择视频素材',
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

      updateNodeData(nodeId, (prev) => {
        const previousProps = prev.properties as unknown as LinghuiVideoNodeProperties;
        const nextLabel = prev.label.startsWith('视频') && filePath
          ? (filePath.split(/[\\/]/).pop() ?? prev.label)
          : prev.label;
        return {
          ...prev,
          label: nextLabel,
          properties: {
            ...previousProps,
            source: resolvedSource,
            // 视频参考节点：上传 = 切到 mode='import'，避免之后又被识别成 generate 触发生成。
            mode: 'import',
          } as unknown as Record<string, unknown>,
        };
      }, { markStale: false });
      clearNodeRunState(nodeId);
    } catch (error: any) {
      message.error(error?.message || '选择视频失败');
    }
  }, [clearNodeRunState, message, nodeId, updateNodeData, workspaceId]);

  return { trigger };
}
