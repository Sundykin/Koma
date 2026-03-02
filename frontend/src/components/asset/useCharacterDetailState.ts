/**
 * CharacterDetailModal 状态与逻辑 hook
 * 从 CharacterDetailModal.tsx 拆分
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Form } from 'antd';
import type { Character } from '../../types';
import {
  generateCostumePhoto,
  generateCharacterPreviewVideo,
  getCharacterPrompt,
} from '../../workflow/characterAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveCharacters, loadCharacters } from '../../store/projectStore';
import { toUserMessage } from '../../utils/errorMessages';

export type GeneratingType = 'costume' | 'video' | 'extract' | null;

export interface CharacterDetailModalProps {
  open: boolean;
  character: Character | null;
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  onClose: () => void;
  onUpdate: (character: Character) => void;
  onDelete: (characterId: string) => void;
}

export function useCharacterDetailState(props: CharacterDetailModalProps, message: any) {
  const { character, open, projectId, theme, stylePrompt, ttiConfigId, itvConfigId, onUpdate, onDelete, onClose } = props;
  const [form] = Form.useForm();

  const [editedCharacter, setEditedCharacter] = useState<Character | null>(null);
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generating, setGenerating] = useState<GeneratingType>(null);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (character && open) {
      setEditedCharacter({ ...character });
      form.setFieldsValue({ name: character.name, role: character.role, age: character.age, description: character.description, appearance: character.appearance });
      setCustomPrompt(character.customPrompt || '');
      setIsPromptEditing(false);
    }
  }, [character, open, form]);

  const autoPrompt = useMemo(() => {
    if (!editedCharacter) return '';
    return getCharacterPrompt({ ...editedCharacter, customPrompt: undefined }, theme, stylePrompt);
  }, [editedCharacter, theme, stylePrompt]);

  const currentPrompt = customPrompt || autoPrompt;

  const getAssetPath = useCallback(async (subPath: string) => {
    if (!editedCharacter) return '';
    const config = getStorageConfig() || (await initStorageConfig());
    const basePath = `${config.rootPath}/projects/${projectId}/assets/characters/${editedCharacter.id}`;
    const fullPath = `${basePath}/${subPath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (!(await fsExists(dir))) await fsMkdir(dir);
    return fullPath;
  }, [projectId, editedCharacter?.id]);

  const handleSave = useCallback(async () => {
    if (!editedCharacter) return;
    try {
      const values = await form.validateFields();
      const updatedCharacter: Character = { ...editedCharacter, ...values, customPrompt: customPrompt || undefined };
      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index !== -1) { characters[index] = updatedCharacter; await saveCharacters(projectId, characters); }
      setEditedCharacter(updatedCharacter);
      onUpdate(updatedCharacter);
      message.success('保存成功');
    } catch (err: any) { message.error(toUserMessage(err) || '保存失败'); }
  }, [editedCharacter, form, customPrompt, projectId, onUpdate, message]);

  const handleGenerateCostume = useCallback(async () => {
    if (!editedCharacter) return;
    setGenerating('costume'); setProgress(0);
    try {
      const charWithPrompt = { ...editedCharacter, customPrompt: customPrompt || undefined };
      const result = await generateCostumePhoto({
        projectId, character: charWithPrompt, theme, stylePrompt, ttiConfigId,
        onProgress: (p: number, step: string) => { setProgress(p); setProgressStep(step); },
      });
      if (result.success && result.path) {
        const updated = { ...editedCharacter, costumePhotoPath: result.path, costumePhotoUrl: result.url };
        setEditedCharacter(updated); onUpdate(updated); message.success('定妆照生成完成');
      } else { message.error(toUserMessage(result.error)); }
    } catch (err: any) { message.error(toUserMessage(err)); }
    finally { setGenerating(null); }
  }, [editedCharacter, projectId, theme, stylePrompt, ttiConfigId, customPrompt, onUpdate, message]);

  const handleUploadCostume = useCallback(async () => {
    if (!editedCharacter) return;
    try {
      const result = await openFileDialog({ filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], title: '选择定妆照' });
      if (result.canceled || !result.filePaths[0]) return;
      const destPath = await getAssetPath('costume.png');
      await fsCopy(result.filePaths[0], destPath);
      const updated = { ...editedCharacter, costumePhotoPath: destPath };
      setEditedCharacter(updated); onUpdate(updated);
      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index !== -1) { characters[index] = updated; await saveCharacters(projectId, characters); }
      message.success('上传成功');
    } catch (err: any) { message.error(`上传失败: ${toUserMessage(err)}`); }
  }, [editedCharacter, getAssetPath, projectId, onUpdate, message]);

  const handleGenerateVideo = useCallback(async () => {
    if (!editedCharacter) return;
    if (!editedCharacter.costumePhotoPath) { message.warning('请先生成或上传定妆照'); return; }
    setGenerating('video'); setProgress(0);
    try {
      const result = await generateCharacterPreviewVideo({
        projectId, character: editedCharacter, itvConfigId,
        onProgress: (p: number, step: string) => { setProgress(p); setProgressStep(step); },
      });
      if (result.success && result.path) {
        const updated = { ...editedCharacter, previewVideoPath: result.path, previewVideoTaskId: result.taskId };
        setEditedCharacter(updated); onUpdate(updated); message.success('预览视频生成完成');
      } else { message.error(toUserMessage(result.error)); }
    } catch (err: any) { message.error(toUserMessage(err)); }
    finally { setGenerating(null); }
  }, [editedCharacter, projectId, itvConfigId, onUpdate, message]);

  const handleUploadVideo = useCallback(async () => {
    if (!editedCharacter) return;
    try {
      const result = await openFileDialog({ filters: [{ name: '视频', extensions: ['mp4', 'webm', 'mov'] }], title: '选择预览视频' });
      if (result.canceled || !result.filePaths[0]) return;
      const destPath = await getAssetPath('preview.mp4');
      await fsCopy(result.filePaths[0], destPath);
      const updated = { ...editedCharacter, previewVideoPath: destPath };
      setEditedCharacter(updated); onUpdate(updated);
      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index !== -1) { characters[index] = updated; await saveCharacters(projectId, characters); }
      message.success('上传成功');
    } catch (err: any) { message.error(`上传失败: ${toUserMessage(err)}`); }
  }, [editedCharacter, getAssetPath, projectId, onUpdate, message]);

  const handleExtractCharacter = useCallback(async () => {
    message.info('角色提取功能已移除');
  }, [message]);

  const handleDelete = useCallback(async () => {
    if (!editedCharacter) return;
    onDelete(editedCharacter.id); onClose();
  }, [editedCharacter, onDelete, onClose]);

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  return {
    form, editedCharacter, setEditedCharacter,
    isPromptEditing, setIsPromptEditing, customPrompt, setCustomPrompt,
    generating, progress, progressStep,
    previewImage, setPreviewImage,
    autoPrompt, currentPrompt,
    handleSave, handleGenerateCostume, handleUploadCostume,
    handleGenerateVideo, handleUploadVideo,
    handleExtractCharacter, handleDelete, toLocalUrl,
  };
}
