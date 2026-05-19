import { useCallback } from 'react';
import { App } from 'antd';
import { electronService, openFileDialog } from '../../../../services/electronService';
import { importLinghuiWorkspaceAsset } from '../../../../store/linghuiStorage';
import type { LinghuiAudioNodeProperties } from '../../../../types/linghui';
import {
  useLinghuiNodeEditorApi,
  useLinghuiNodeMutation,
} from './LinghuiNodeRunsContext';

interface UseLinghuiAudioNodeUploadResult {
  trigger: () => Promise<void>;
}

export function useLinghuiAudioNodeUpload(nodeId: string): UseLinghuiAudioNodeUploadResult {
  const { message } = App.useApp();
  const { workspaceId } = useLinghuiNodeEditorApi();
  const { clearNodeRunState, updateNodeData } = useLinghuiNodeMutation();

  const trigger = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }],
        multiple: false,
        title: '选择音频素材',
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
        const previousProps = prev.properties as unknown as LinghuiAudioNodeProperties;
        const filename = filePath.split(/[\\/]/).pop();
        const nextLabel = prev.label.startsWith('音频') && filename
          ? filename.replace(/\.[^.]+$/, '')
          : prev.label;
        return {
          ...prev,
          label: nextLabel,
          properties: {
            ...previousProps,
            source: resolvedSource,
            mode: 'import',
          } as unknown as Record<string, unknown>,
        };
      }, { markStale: false });
      clearNodeRunState(nodeId);
    } catch (error: any) {
      message.error(error?.message || '选择音频失败');
    }
  }, [clearNodeRunState, message, nodeId, updateNodeData, workspaceId]);

  return { trigger };
}
