/**
 * PropDetailModal 状态与逻辑 hook
 * 从 PropDetailModal.tsx 拆分
 */
import { useState, useCallback, useEffect } from 'react';
import { Form } from 'antd';
import type { Prop } from '../../types';
import {
  generatePropImage,
  generatePropPreviewVideo,
} from '../../workflow/scenePropAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveProps, loadProps } from '../../store/projectStore';
import { toUserMessage } from '../../utils/errorMessages';

export type GeneratingType = 'image' | 'video' | 'extract' | null;

export interface PropDetailModalProps {
  open: boolean;
  prop: Prop | null;
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  onClose: () => void;
  onUpdate: (prop: Prop) => void;
  onDelete: (propId: string) => void;
}

export function usePropDetailState(props: PropDetailModalProps, message: any) {
  const { prop, open, projectId, theme, stylePrompt, ttiConfigId, itvConfigId, onUpdate, onDelete, onClose } = props;
  const [form] = Form.useForm();

  const [editedProp, setEditedProp] = useState<Prop | null>(null);
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generating, setGenerating] = useState<GeneratingType>(null);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (prop && open) {
      setEditedProp({ ...prop });
      form.setFieldsValue({ name: prop.name, type: prop.type, description: prop.description });
      setCustomPrompt(prop.customPrompt || '');
      setIsPromptEditing(false);
    }
  }, [prop, open, form]);

  const getAssetPath = useCallback(async (subPath: string) => {
    if (!editedProp) return '';
    const config = getStorageConfig() || (await initStorageConfig());
    const basePath = `${config.rootPath}/projects/${projectId}/assets/props/${editedProp.id}`;
    const fullPath = `${basePath}/${subPath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (!(await fsExists(dir))) await fsMkdir(dir);
    return fullPath;
  }, [projectId, editedProp?.id]);

  const handleSave = useCallback(async () => {
    if (!editedProp) return;
    try {
      const values = await form.validateFields();
      const updatedProp: Prop = { ...editedProp, ...values, customPrompt: customPrompt || undefined };
      const allProps = await loadProps(projectId);
      const index = allProps.findIndex(p => p.id === editedProp.id);
      if (index !== -1) { allProps[index] = updatedProp; await saveProps(projectId, allProps); }
      setEditedProp(updatedProp); onUpdate(updatedProp); message.success('保存成功');
    } catch (err: any) { message.error(toUserMessage(err) || '保存失败'); }
  }, [editedProp, form, customPrompt, projectId, onUpdate, message]);

  const handleGenerateImage = useCallback(async () => {
    if (!editedProp) return;
    setGenerating('image'); setProgress(0);
    try {
      const result = await generatePropImage({
        projectId, prop: { ...editedProp, customPrompt: customPrompt || undefined }, theme, stylePrompt, ttiConfigId,
        onProgress: (p: number, step: string) => { setProgress(p); setProgressStep(step); },
      });
      if (result.success && result.path) {
        const updated = { ...editedProp, imagePath: result.path, imageUrl: (result as any).url };
        setEditedProp(updated); onUpdate(updated); message.success('道具图片生成完成');
      } else { message.error(result.error || '生成失败'); }
    } catch (err: any) { message.error(toUserMessage(err) || '生成失败'); }
    finally { setGenerating(null); }
  }, [editedProp, projectId, theme, stylePrompt, ttiConfigId, customPrompt, onUpdate, message]);

  const handleUploadImage = useCallback(async () => {
    if (!editedProp) return;
    try {
      const result = await openFileDialog({ filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], title: '选择道具图片' });
      if (result.canceled || !result.filePaths[0]) return;
      const destPath = await getAssetPath('reference.png');
      await fsCopy(result.filePaths[0], destPath);
      const updated = { ...editedProp, imagePath: destPath };
      setEditedProp(updated); onUpdate(updated);
      const allProps = await loadProps(projectId);
      const index = allProps.findIndex(p => p.id === editedProp.id);
      if (index !== -1) { allProps[index] = updated; await saveProps(projectId, allProps); }
      message.success('上传成功');
    } catch (err: any) { message.error(`上传失败: ${toUserMessage(err)}`); }
  }, [editedProp, getAssetPath, projectId, onUpdate, message]);

  const handleGenerateVideo = useCallback(async () => {
    if (!editedProp) return;
    if (!editedProp.imagePath) { message.warning('请先生成或上传道具图片'); return; }
    setGenerating('video'); setProgress(0);
    try {
      const result = await generatePropPreviewVideo({
        projectId, prop: editedProp, itvConfigId,
        onProgress: (p: number, step: string) => { setProgress(p); setProgressStep(step); },
      });
      if (result.success && result.path) {
        const updated = { ...editedProp, previewVideoPath: result.path, previewVideoTaskId: result.taskId };
        setEditedProp(updated); onUpdate(updated); message.success('预览视频生成完成');
      } else { message.error(result.error || '生成失败'); }
    } catch (err: any) { message.error(toUserMessage(err) || '生成失败'); }
    finally { setGenerating(null); }
  }, [editedProp, projectId, itvConfigId, onUpdate, message]);

  const handleUploadVideo = useCallback(async () => {
    if (!editedProp) return;
    try {
      const result = await openFileDialog({ filters: [{ name: '视频', extensions: ['mp4', 'webm', 'mov'] }], title: '选择预览视频' });
      if (result.canceled || !result.filePaths[0]) return;
      const destPath = await getAssetPath('preview.mp4');
      await fsCopy(result.filePaths[0], destPath);
      const updated = { ...editedProp, previewVideoPath: destPath };
      setEditedProp(updated); onUpdate(updated);
      const allProps = await loadProps(projectId);
      const index = allProps.findIndex(p => p.id === editedProp.id);
      if (index !== -1) { allProps[index] = updated; await saveProps(projectId, allProps); }
      message.success('上传成功');
    } catch (err: any) { message.error(`上传失败: ${toUserMessage(err)}`); }
  }, [editedProp, getAssetPath, projectId, onUpdate, message]);

  const handleExtractProp = useCallback(async () => {
    message.info('道具提取功能已移除');
  }, [message]);

  const handleDelete = useCallback(async () => {
    if (!editedProp) return;
    onDelete(editedProp.id); onClose();
  }, [editedProp, onDelete, onClose]);

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  return {
    form, editedProp, setEditedProp,
    isPromptEditing, setIsPromptEditing, customPrompt, setCustomPrompt,
    generating, progress, progressStep,
    previewImage, setPreviewImage,
    handleSave, handleGenerateImage, handleUploadImage,
    handleGenerateVideo, handleUploadVideo,
    handleExtractProp, handleDelete, toLocalUrl,
  };
}
