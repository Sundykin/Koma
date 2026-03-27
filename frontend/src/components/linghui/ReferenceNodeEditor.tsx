import React, { useCallback } from 'react';
import { App, Button, Input } from 'antd';
import { ArrowUp, ImagePlus, Trash2, UploadCloud } from 'lucide-react';
import type { LinghuiNodeData, LinghuiReferenceNodeProperties } from '../../types/linghui';
import { electronService, openFileDialog } from '../../services/electronService';
import { importLinghuiWorkspaceAsset } from '../../store/linghuiStorage';
import { useLinghuiNodeMutation } from './nodes/LinghuiNodeRunsContext';

function getPreviewSource(source?: string): string {
  if (!source) return '';
  if (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('data:') ||
    source.startsWith('blob:') ||
    source.startsWith('koma-local://')
  ) {
    return source;
  }
  return electronService.fs.toLocalUrl(source);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取参考图失败'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

interface ReferenceNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  workspaceId: string | null;
  onRun: () => void;
}

export const ReferenceNodeEditor: React.FC<ReferenceNodeEditorProps> = ({
  nodeId,
  nodeData,
  workspaceId,
  onRun,
}) => {
  const { message } = App.useApp();
  const { clearNodeRunState, updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiReferenceNodeProperties;
  const source = String(props.source ?? '').trim();
  const note = String(props.note ?? '').trim();
  const previewSource = getPreviewSource(source);

  const applyReference = useCallback(async (nextSource: string, filenameHint?: string) => {
    let resolvedSource = nextSource;

    if (
      workspaceId &&
      electronService.isElectron() &&
      nextSource &&
      !nextSource.startsWith('http://') &&
      !nextSource.startsWith('https://') &&
      !nextSource.startsWith('data:') &&
      !nextSource.startsWith('blob:')
    ) {
      resolvedSource = await importLinghuiWorkspaceAsset(workspaceId, nextSource, filenameHint);
    }

    updateNodeData(nodeId, prev => {
      const currentProps = prev.properties as unknown as LinghuiReferenceNodeProperties;
      return {
        ...prev,
        properties: {
          ...currentProps,
          source: resolvedSource,
          note: currentProps.note || filenameHint || '',
        },
      };
    });
  }, [nodeId, updateNodeData, workspaceId]);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        multiple: false,
        title: '选择参考图',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const filename = filePath.split(/[\\/]/).pop();
        await applyReference(filePath, filename);
      }
    } catch (error: any) {
      message.error(error?.message || '选择参考图失败');
    }
  }, [applyReference, message]);

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      message.warning('请拖入图片文件');
      return;
    }

    try {
      const filePath = (file as File & { path?: string }).path;
      if (filePath) {
        await applyReference(filePath, file.name);
        return;
      }

      const dataUrl = await readFileAsDataUrl(file);
      await applyReference(dataUrl, file.name);
    } catch (error: any) {
      message.error(error?.message || '导入参考图失败');
    }
  }, [applyReference, message]);

  const handleClear = useCallback(() => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...(prev.properties as unknown as LinghuiReferenceNodeProperties),
        source: '',
        note: '',
      },
    }));
    clearNodeRunState(nodeId);
  }, [clearNodeRunState, nodeId, updateNodeData]);

  return (
    <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">参考图节点</div>
          <div className="linghuiEditorSubtitle">支持拖拽导入或手动上传，作为上游图片输入输出</div>
        </div>
      </div>

      <div
        className={`linghuiReferenceDropzone ${previewSource ? 'hasPreview' : ''}`}
        onDragOver={event => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={handleDrop}
        onClick={handleSelectFile}
        role="button"
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void handleSelectFile();
          }
        }}
      >
        {previewSource ? (
          <img className="linghuiReferencePreview" src={previewSource} alt={note || '参考图'} />
        ) : (
          <div className="linghuiReferencePlaceholder">
            <ImagePlus size={28} />
            <div>拖入图片到这里</div>
            <div className="linghuiReferencePlaceholderHint">或点击选择本地参考图</div>
          </div>
        )}
      </div>

      <div className="linghuiEditorPrompt">
        <Input
          value={note}
          placeholder="给这张参考图起个名字"
          onChange={event => {
            const nextValue = event.target.value;
            updateNodeData(nodeId, prev => ({
              ...prev,
              properties: {
                ...(prev.properties as unknown as LinghuiReferenceNodeProperties),
                note: nextValue,
              },
            }));
          }}
        />
        <div className="linghuiEditorPromptHint">
          {source ? '已保存到当前灵绘工作区，连接到图片/视频节点后会自动参与执行。' : '建议先上传一张角色、场景或物件图，再继续往下游连线。'}
        </div>
      </div>

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarLeft">
          <Button size="small" icon={<UploadCloud size={14} />} onClick={handleSelectFile}>
            上传图片
          </Button>
          <Button size="small" icon={<Trash2 size={14} />} danger disabled={!source} onClick={handleClear}>
            清空
          </Button>
        </div>

        <div className="linghuiEditorToolbarRight">
          <Button
            type="primary"
            size="small"
            shape="circle"
            icon={<ArrowUp size={16} />}
            disabled={!source}
            onClick={onRun}
          />
        </div>
      </div>
    </div>
  );
};
