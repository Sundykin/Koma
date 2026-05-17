import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type {
  LinghuiDirector3DNodeProperties,
  LinghuiDirector3DRenderMode,
  LinghuiNodeData,
} from '../../../../types/linghui';
import { compileDirector3DPromptFragment } from '../../director3d/director3dScene';
import type { Director3DViewportHandle } from '../../director3d/Director3DViewport';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { persistMediaAsset } from '../../../../services/mediaPersistenceService';
import { DIRECTOR3D_RENDER_MODE_LABELS, resolveDirector3DScene } from '../components/Director3DNodeEditorState';

interface Director3DLineartExportParams {
  message: MessageInstance;
  nodeId: string;
  renderModeForExport: LinghuiDirector3DRenderMode;
  updateNodeData: (
    nodeId: string,
    updater: (prev: LinghuiNodeData) => LinghuiNodeData,
  ) => void;
  viewportRef: React.RefObject<Director3DViewportHandle | null>;
}

export function useDirector3DLineartExport({
  message,
  nodeId,
  renderModeForExport,
  updateNodeData,
  viewportRef,
}: Director3DLineartExportParams): () => Promise<void> {
  return useCallback(async () => {
    const currentCamera = viewportRef.current?.getCurrentCamera();
    const dataUrl = await viewportRef.current?.captureCurrentView({ width: 1280, renderMode: renderModeForExport });
    if (!dataUrl) {
      message.warning('导出失败，请重试');
      return;
    }
    const modeLabel = DIRECTOR3D_RENDER_MODE_LABELS[renderModeForExport];

    let persistedSource = dataUrl;
    try {
      const stored = await persistMediaAsset({
        projectId: 'linghui',
        kind: 'image',
        source: dataUrl,
        mimeType: 'image/png',
        provider: 'director3d-local',
        metadata: { nodeId, slot: 'lineart', origin: 'director3d-capture', renderMode: renderModeForExport },
      });
      if (stored.localPath) {
        persistedSource = toFileSystemDisplayUrl(stored.localPath) ?? stored.localPath;
      }
    } catch (error) {
      message.warning('线稿落盘失败，下游可能无法直接引用，请尝试运行节点');
      // eslint-disable-next-line no-console
      console.warn('[Director3D] 线稿落盘失败', error);
    }

    updateNodeData(nodeId, prev => {
      const props = prev.properties as Partial<LinghuiDirector3DNodeProperties>;
      const currentScene = resolveDirector3DScene(prev.properties);
      const nextScene = {
        ...currentScene,
        camera: currentCamera ?? currentScene.camera,
        render: {
          ...currentScene.render,
          mode: renderModeForExport,
        },
      };
      const fragment = compileDirector3DPromptFragment(nextScene);
      return {
        ...prev,
        properties: {
          ...prev.properties,
          scene: nextScene,
          prompt: props.prompt ?? '',
          lineartDataUrl: persistedSource,
          directorPromptFragment: fragment,
          exportRenderMode: renderModeForExport,
        },
      };
    });
    message.success(`${modeLabel}已生成，可在下游图片节点引用`);
  }, [message, nodeId, renderModeForExport, updateNodeData, viewportRef]);
}
