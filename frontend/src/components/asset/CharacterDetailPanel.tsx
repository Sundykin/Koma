/**
 * 角色详情面板 - Creator Layout
 * 左侧输入控制区 + 右侧画布预览区
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '../../store/logger';
import {
  Form,
  Input,
  Select,
  Button,
  Space,
  Progress,
  App,
  Row,
  Col,
  Typography,
  Popconfirm,
  Modal,
  Segmented,
  Tooltip,
  Tag,
} from 'antd';
import {
  UserOutlined,
  SaveOutlined,
  DeleteOutlined,
  UploadOutlined,
  ThunderboltOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  LinkOutlined,
  ExpandOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Character, CharacterGender, ProjectStyleSnapshot } from '../../types';
import { isRemoteMediaUri } from '../../types';
import {
  generateCostumePhoto,
  generateCharacterFaceCandidate,
  generateCharacterPreviewVideo,
  extractAndBindCharacter,
} from '../../workflow/characterAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists, fsRemove } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveCharacters, loadCharacters } from '../../store/projectStore';
import { useActiveConfig } from '../../hooks/useActiveConfig';
import { uploadLocalFileToImageHosting, isImageHostingEnabled } from '../../services/imageHostingService';
import { ensureRemoteUrlForImageAsset } from '../../services/mediaRemoteUrlService';
import { createStoredMediaAsset, updateCharacterMedia } from '../../utils/mediaAssets';
import { mergeEpisodeRefs } from './assetEpisodeRefs';
import {
  getCharacterCostumePhotoSource,
  getCharacterPreviewVideoSource,
} from '../../utils/mediaSelectors';
import AssetImageDrawModal, {
  cleanupImageDrawCandidates,
  createImageDrawSessionId,
  generateImageDrawCandidates,
  getImageDrawVariation,
  isImageDrawCandidateForOwner,
  IMAGE_DRAW_CANDIDATE_COUNT,
  type AssetImageDrawCandidate,
} from './AssetImageDrawModal';
import type { ModelCapability } from '../../providers/channel/types';

const logger = createLogger('CharacterDetailPanel');

const { TextArea } = Input;
const { Text } = Typography;

interface CharacterDetailPanelProps {
  character: Character;
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  ttiSelection?: string;
  itvSelection?: string;
  onUpdate: (character: Character) => void;
  onDelete: (characterId: string) => void;
}

type GeneratingType = 'costume' | 'video' | 'extract' | null;
type ViewMode = 'costume' | 'video';

function buildSelectedFaceCandidateMetadata(
  candidate: AssetImageDrawCandidate,
  assetRole: 'faceReference' | 'costumePhoto',
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    assetRole,
    drawSessionId: candidate.sessionId,
    selectedCandidateId: candidate.id,
    sourceCandidateKind: 'characterIdentityDirection',
  };

  if (assetRole === 'costumePhoto') {
    metadata.generatedFrom = 'selectedFaceCandidate';
    metadata.faceReferenceSource = 'selectedFaceCandidate';
  } else {
    metadata.referenceSource = 'selectedFaceCandidate';
  }

  if (candidate.seed !== undefined) {
    metadata.faceCandidateSeed = candidate.seed;
  }
  if (candidate.variationLabel) {
    metadata.variationLabel = candidate.variationLabel;
  }
  if (candidate.variationPrompt) {
    metadata.variationPrompt = candidate.variationPrompt;
  }
  if (candidate.identityDirection) {
    metadata.identityDirection = candidate.identityDirection;
  }
  if (candidate.identitySpec) {
    metadata.identitySpec = candidate.identitySpec;
  }
  if (candidate.metadata) {
    metadata.candidateMetadata = candidate.metadata;
  }

  return metadata;
}

export const CharacterDetailPanel: React.FC<CharacterDetailPanelProps> = ({
  character,
  projectId,
  theme,
  stylePrompt,
  styleSnapshot,
  ttiSelection,
  itvSelection,
  onUpdate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  
  const { config: activeTTI, activeModel: activeTTIModel } = useActiveConfig('tti', ttiSelection);
  const { config: activeITV, activeModel: activeITVModel } = useActiveConfig('itv', itvSelection);

  const [editedCharacter, setEditedCharacter] = useState<Character>(character);
  const [viewMode, setViewMode] = useState<ViewMode>('costume');
  const [generating, setGenerating] = useState<GeneratingType>(null);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageDrawOpen, setImageDrawOpen] = useState(false);
  const [imageDrawCandidates, setImageDrawCandidates] = useState<AssetImageDrawCandidate[]>([]);
  const [imageDrawApplying, setImageDrawApplying] = useState(false);
  const imageDrawCandidatesRef = useRef<AssetImageDrawCandidate[]>([]);
  const activeImageDrawSessionRef = useRef<string | null>(null);
  const runningImageDrawSessionRef = useRef<string | null>(null);
  const currentCharacterIdRef = useRef(character.id);
  currentCharacterIdRef.current = character.id;

  const setImageDrawCandidateList = useCallback((candidates: AssetImageDrawCandidate[]) => {
    imageDrawCandidatesRef.current = candidates;
    setImageDrawCandidates(candidates);
  }, []);

  const supportsCapability = useCallback((capabilities: ModelCapability[] | undefined, capability: ModelCapability) => (
    capabilities?.includes(capability) ?? false
  ), []);
  const supportsTextToImage = supportsCapability(activeTTIModel?.capabilities, 'image.text-to-image');
  const supportsImageToVideo = supportsCapability(activeITVModel?.capabilities, 'video.image-to-video');

  // 初始化
  useEffect(() => {
    const initialPrompt = character.prompt || '';
    setEditedCharacter({ ...character, prompt: initialPrompt });
    form.setFieldsValue({
      name: character.name,
      role: character.role,
      age: character.age,
      gender: character.gender || 'unknown',
      prompt: initialPrompt,
    });
  }, [character, form]);

  useEffect(() => {
    const staleCandidates = imageDrawCandidatesRef.current;
    activeImageDrawSessionRef.current = null;
    runningImageDrawSessionRef.current = null;
    setImageDrawOpen(false);
    setImageDrawCandidateList([]);
    setImageDrawApplying(false);
    setGenerating((current) => (current === 'costume' ? null : current));
    if (staleCandidates.length > 0) {
      void cleanupImageDrawCandidates(staleCandidates);
    }

    return () => {
      const unmountedCandidates = imageDrawCandidatesRef.current;
      activeImageDrawSessionRef.current = null;
      runningImageDrawSessionRef.current = null;
      imageDrawCandidatesRef.current = [];
      if (unmountedCandidates.length > 0) {
        void cleanupImageDrawCandidates(unmountedCandidates);
      }
    };
  }, [character.id, setImageDrawCandidateList]);

  // 自动切换视图模式
  useEffect(() => {
    if (generating === 'costume') setViewMode('costume');
    else if (generating === 'video') setViewMode('video');
  }, [generating]);

  const getAssetPath = useCallback(async (subPath: string) => {
    const config = getStorageConfig() || (await initStorageConfig());
    const basePath = `${config.rootPath}/projects/${projectId}/assets/characters/${editedCharacter.id}`;
    const fullPath = `${basePath}/${subPath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (!(await fsExists(dir))) {
      await fsMkdir(dir);
    }
    return fullPath;
  }, [projectId, editedCharacter.id]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index === -1) {
        throw new Error(t('asset.saveFailed'));
      }

      const storedCharacter = characters[index];
      const updatedCharacter: Character = {
        ...storedCharacter,
        ...editedCharacter,
        ...values,
        prompt: values.prompt,
        media: storedCharacter.media ?? editedCharacter.media,
        episodeRefs: mergeEpisodeRefs(storedCharacter.episodeRefs, editedCharacter.episodeRefs),
      };

      characters[index] = updatedCharacter;
      await saveCharacters(projectId, characters);

      setEditedCharacter(updatedCharacter);
      onUpdate(updatedCharacter);
      message.success(t('asset.saveSuccess'));
    } catch (err: any) {
      message.error(err.message || t('asset.saveFailed'));
    }
  }, [editedCharacter, form, projectId, onUpdate, message, t]);

  const formatDrawProgressStep = useCallback((index: number, step?: string) => {
    const drawStep = t('asset.drawGenerating', {
      current: index + 1,
      total: IMAGE_DRAW_CANDIDATE_COUNT,
    });
    return step ? `${drawStep} · ${step}` : drawStep;
  }, [t]);

  const runCostumeImageDraw = useCallback(async (
    previousCandidates: AssetImageDrawCandidate[] = imageDrawCandidatesRef.current,
  ) => {
    const ownerType = 'character' as const;
    const ownerId = editedCharacter.id;
    const previousSessionId = activeImageDrawSessionRef.current;
    const reusablePrevious = previousSessionId
      ? previousCandidates.filter((candidate) => isImageDrawCandidateForOwner(candidate, {
          projectId,
          ownerType,
          ownerId,
          sessionId: previousSessionId,
        }))
      : [];
    const reusableIds = new Set(reusablePrevious.map((candidate) => candidate.id));
    const stalePrevious = previousCandidates.filter((candidate) => !reusableIds.has(candidate.id));

    if (stalePrevious.length > 0) {
      await cleanupImageDrawCandidates(stalePrevious);
    }

    if (reusablePrevious.length > 0) {
      setImageDrawCandidateList(reusablePrevious);
      setImageDrawOpen(true);
    } else {
      activeImageDrawSessionRef.current = null;
      setImageDrawCandidateList([]);
      setImageDrawOpen(false);
    }

    const sessionId = createImageDrawSessionId({ ownerType, ownerId });
    runningImageDrawSessionRef.current = sessionId;
    setGenerating('costume');
    setProgress(0);
    setProgressStep(formatDrawProgressStep(0));

    const isCurrentSession = () => (
      runningImageDrawSessionRef.current === sessionId &&
      currentCharacterIdRef.current === ownerId
    );

    try {
      const currentValues = await form.getFieldsValue();
      const charWithPrompt = { ...editedCharacter, ...currentValues };

      const result = await generateImageDrawCandidates({
        count: IMAGE_DRAW_CANDIDATE_COUNT,
        sessionId,
        projectId,
        ownerType,
        ownerId,
        shouldContinue: isCurrentSession,
        getVariation: (index) => getImageDrawVariation(ownerType, index),
        getCandidatePath: (seed, index) => getAssetPath(`draw/face-${sessionId}-${index + 1}-${seed}.png`),
        generate: (seed, index, destPath, variation) => generateCharacterFaceCandidate({
          projectId,
          character: charWithPrompt,
          theme,
          stylePrompt,
          styleSnapshot,
          ttiSelection,
          seed,
          ...(variation?.prompt ? { variationPrompt: variation.prompt } : {}),
          destPath,
          bindOwner: false,
          normalizeRemoteUrl: false,
          onProgress: (p, step) => {
            if (!isCurrentSession()) return;
            setProgress(((index + p / 100) / IMAGE_DRAW_CANDIDATE_COUNT) * 100);
            setProgressStep(formatDrawProgressStep(index, step));
          },
        }),
        onCandidateProgress: (p, index, step) => {
          if (!isCurrentSession()) return;
          setProgress(p);
          setProgressStep(formatDrawProgressStep(index, step));
        },
      });

      if (!isCurrentSession()) {
        await cleanupImageDrawCandidates(result.candidates);
        return;
      }

      if (result.candidates.length > 0) {
        if (reusablePrevious.length > 0) {
          await cleanupImageDrawCandidates(reusablePrevious);
        }
        activeImageDrawSessionRef.current = sessionId;
        setImageDrawCandidateList(result.candidates);
        setImageDrawOpen(true);
        if (result.failed > 0) {
          message.warning(t('asset.imageDrawPartialFailed', {
            failed: result.failed,
            total: IMAGE_DRAW_CANDIDATE_COUNT,
          }));
        }
      } else {
        if (previousSessionId && reusablePrevious.length > 0) {
          activeImageDrawSessionRef.current = previousSessionId;
          setImageDrawCandidateList(reusablePrevious);
          setImageDrawOpen(true);
          message.error(result.errors[0] ? `${t('asset.imageDrawFailedKeepingPrevious')}: ${result.errors[0]}` : t('asset.imageDrawFailedKeepingPrevious'));
        } else {
          activeImageDrawSessionRef.current = null;
          setImageDrawCandidateList([]);
          setImageDrawOpen(false);
          message.error(result.errors[0] || t('asset.generateFailed'));
        }
      }
    } catch (err: any) {
      if (!isCurrentSession()) return;
      if (previousSessionId && reusablePrevious.length > 0) {
        activeImageDrawSessionRef.current = previousSessionId;
        setImageDrawCandidateList(reusablePrevious);
        setImageDrawOpen(true);
        message.error(err.message ? `${t('asset.imageDrawFailedKeepingPrevious')}: ${err.message}` : t('asset.imageDrawFailedKeepingPrevious'));
      } else {
        activeImageDrawSessionRef.current = null;
        setImageDrawCandidateList([]);
        setImageDrawOpen(false);
        message.error(err.message || t('asset.generateFailed'));
      }
    } finally {
      if (runningImageDrawSessionRef.current === sessionId) {
        runningImageDrawSessionRef.current = null;
        setGenerating(null);
      }
    }
  }, [editedCharacter, form, formatDrawProgressStep, getAssetPath, message, projectId, setImageDrawCandidateList, stylePrompt, styleSnapshot, theme, t, ttiSelection]);

  const handleGenerateCostume = useCallback(async () => {
    await runCostumeImageDraw(imageDrawCandidatesRef.current);
  }, [runCostumeImageDraw]);

  const handleRedrawImageDraw = useCallback(async () => {
    await runCostumeImageDraw(imageDrawCandidatesRef.current);
  }, [runCostumeImageDraw]);

  const handleCancelImageDraw = useCallback(async () => {
    const staleCandidates = imageDrawCandidatesRef.current;
    activeImageDrawSessionRef.current = null;
    runningImageDrawSessionRef.current = null;
    setImageDrawOpen(false);
    setImageDrawCandidateList([]);
    setImageDrawApplying(false);
    await cleanupImageDrawCandidates(staleCandidates);
    message.info(t('asset.imageCandidatesDiscarded'));
  }, [message, setImageDrawCandidateList, t]);

  const handleUseSelectedImageDraw = useCallback(async (candidate: AssetImageDrawCandidate) => {
    if (imageDrawApplying) return;

    const activeSessionId = activeImageDrawSessionRef.current;
    const currentCandidates = imageDrawCandidatesRef.current;
    const selectedCandidate = currentCandidates.find((item) => item.id === candidate.id);
    const owner = {
      projectId,
      ownerType: 'character' as const,
      ownerId: currentCharacterIdRef.current,
      sessionId: activeSessionId,
    };
    const isSelectedCandidateStillValid = () => Boolean(
      activeSessionId &&
      selectedCandidate &&
      activeImageDrawSessionRef.current === activeSessionId &&
      currentCharacterIdRef.current === selectedCandidate.ownerId &&
      isImageDrawCandidateForOwner(selectedCandidate, {
        projectId,
        ownerType: 'character',
        ownerId: currentCharacterIdRef.current,
        sessionId: activeSessionId,
      })
    );

    if (
      !activeSessionId ||
      !selectedCandidate ||
      !isImageDrawCandidateForOwner(selectedCandidate, owner)
    ) {
      activeImageDrawSessionRef.current = null;
      setImageDrawOpen(false);
      setImageDrawCandidateList([]);
      await cleanupImageDrawCandidates(currentCandidates);
      message.warning(t('asset.imageDrawCandidateExpired'));
      return;
    }

    if (!selectedCandidate.localPath && !selectedCandidate.remoteUrl) {
      message.warning(t('asset.pleaseSelectImageCandidate'));
      return;
    }

    setImageDrawApplying(true);
    setGenerating('costume');
    setProgress(0);
    setProgressStep(t('asset.generatingCostumeFromSelectedFace'));
    try {
      const currentValues = await form.getFieldsValue();
      const charWithPrompt = {
        ...editedCharacter,
        ...currentValues,
      };
      let faceReference = createStoredMediaAsset('image', {
        localPath: selectedCandidate.localPath,
        remoteUrl: selectedCandidate.remoteUrl,
        metadata: buildSelectedFaceCandidateMetadata(selectedCandidate, 'faceReference'),
      });
      try {
        faceReference = await ensureRemoteUrlForImageAsset({
          projectId,
          asset: faceReference,
          policy: 'best-effort',
          filenameHint: `${charWithPrompt.id}-selected-face.png`,
        });
      } catch (error) {
        logger.warn('抽卡选中角色方向 remoteUrl 归一化失败，将尝试使用本地引用', { error: error instanceof Error ? error.message : String(error) });
      }

      if (!isSelectedCandidateStillValid()) {
        activeImageDrawSessionRef.current = null;
        setImageDrawOpen(false);
        setImageDrawCandidateList([]);
        await cleanupImageDrawCandidates(currentCandidates);
        message.warning(t('asset.imageDrawCandidateExpired'));
        return;
      }

      const result = await generateCostumePhoto({
        projectId,
        character: charWithPrompt,
        theme,
        stylePrompt,
        styleSnapshot,
        ttiSelection,
        destPath: await getAssetPath('costume.png'),
        bindOwner: false,
        normalizeRemoteUrl: true,
        faceReference,
        onProgress: (p, step) => {
          if (!isSelectedCandidateStillValid()) return;
          setProgress(p);
          setProgressStep(step ? `${t('asset.generatingCostumeFromSelectedFace')} · ${step}` : t('asset.generatingCostumeFromSelectedFace'));
        },
      });

      if (!result.success || (!result.path && !result.url)) {
        message.error(result.error || t('asset.generateFailed'));
        return;
      }

      if (!isSelectedCandidateStillValid()) {
        activeImageDrawSessionRef.current = null;
        setImageDrawOpen(false);
        setImageDrawCandidateList([]);
        await cleanupImageDrawCandidates(currentCandidates);
        message.warning(t('asset.imageDrawCandidateExpired'));
        return;
      }

      const costumePhoto = createStoredMediaAsset('image', {
        localPath: result.path,
        remoteUrl: result.url,
        metadata: buildSelectedFaceCandidateMetadata(selectedCandidate, 'costumePhoto'),
      });
      const updated = updateCharacterMedia(charWithPrompt, { costumePhoto });
      setEditedCharacter(updated);
      onUpdate(updated);
      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === updated.id);
      if (index !== -1) {
        characters[index] = updated;
        await saveCharacters(projectId, characters);
      }

      await cleanupImageDrawCandidates(currentCandidates);
      activeImageDrawSessionRef.current = null;
      setImageDrawCandidateList([]);
      setImageDrawOpen(false);
      message.success(t('asset.costumeGenerated'));
    } catch (err: any) {
      message.error(err.message || t('asset.generateFailed'));
    } finally {
      setImageDrawApplying(false);
      setGenerating(null);
    }
  }, [editedCharacter, form, getAssetPath, imageDrawApplying, message, onUpdate, projectId, setImageDrawCandidateList, stylePrompt, styleSnapshot, theme, t, ttiSelection]);

  const handleUploadCostume = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('storyboard.image'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: t('asset.selectCostumePhoto'),
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('costume.png');
      await fsCopy(result.filePaths[0], destPath);

      let updated: Character = updateCharacterMedia(editedCharacter, {
        costumePhoto: createStoredMediaAsset('image', { localPath: destPath }),
      });

      // 检测图床配置，自动上传
      const hostingEnabled = await isImageHostingEnabled();
      if (hostingEnabled) {
        message.loading({ content: t('asset.uploadToHosting'), key: 'imageHosting' });
        const uploadResult = await uploadLocalFileToImageHosting(destPath);
        if (uploadResult.success && uploadResult.url) {
          updated = updateCharacterMedia(updated, {
            costumePhoto: createStoredMediaAsset('image', {
              localPath: destPath,
              remoteUrl: uploadResult.url,
              createdAt: updated.media?.costumePhoto?.createdAt,
            }),
          });
          message.success({ content: t('asset.uploadHostingSuccess'), key: 'imageHosting' });
        } else {
          logger.warn('图床上传失败:', uploadResult.error);
          message.warning({ content: `${t('asset.uploadHostingFailed')}: ${uploadResult.error}`, key: 'imageHosting' });
        }
      }

      setEditedCharacter(updated);
      onUpdate(updated);

      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index !== -1) {
        characters[index] = updated;
        await saveCharacters(projectId, characters);
      }

      message.success(t('asset.uploadSuccess'));
    } catch (err: any) {
      message.error(`${t('asset.uploadFailed')}: ${err.message}`);
    }
  }, [editedCharacter, getAssetPath, projectId, onUpdate, message, t]);

  const handleRemoveCostumePhoto = useCallback(async () => {
    try {
      const costumePhoto = editedCharacter.media?.costumePhoto;
      const localPath = costumePhoto?.localPath;
      const shouldDeleteLocalFile = Boolean(localPath && !isRemoteMediaUri(localPath));

      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index === -1) {
        throw new Error(t('asset.saveFailed'));
      }

      if (shouldDeleteLocalFile && localPath) {
        await fsRemove(localPath);
      }

      const updated = updateCharacterMedia(editedCharacter, { costumePhoto: undefined });
      characters[index] = updated;
      await saveCharacters(projectId, characters);

      setEditedCharacter(updated);
      onUpdate(updated);
      setPreviewImage(null);

      if (shouldDeleteLocalFile) {
        message.success(t('asset.imageDeleted'));
      } else {
        message.warning(t('asset.remoteImageReferenceRemoved'));
      }
    } catch (err: any) {
      message.error(err.message || t('asset.saveFailed'));
    }
  }, [editedCharacter, projectId, onUpdate, message, t]);

  const handleGenerateVideo = useCallback(async () => {
    if (!getCharacterCostumePhotoSource(editedCharacter)) {
      message.warning(t('asset.pleaseGenerateCostumeFirst'));
      return;
    }

    setGenerating('video');
    setProgress(0);

    try {
      const currentValues = await form.getFieldsValue();
      const characterForVideo = {
        ...editedCharacter,
        ...currentValues,
        prompt: currentValues.prompt || '',
      };
      const result = await generateCharacterPreviewVideo({
        projectId,
        character: characterForVideo,
        theme,
        stylePrompt,
        styleSnapshot,
        itvSelection,
        onProgress: (p, step) => {
          setProgress(p);
          setProgressStep(step);
        },
      });

      if (result.success && result.path) {
        const updated = updateCharacterMedia(characterForVideo, {
          previewVideo: createStoredMediaAsset('video', {
            localPath: result.path,
            providerTaskId: result.taskId,
          }),
        });
        setEditedCharacter(updated);
        onUpdate(updated);
        const characters = await loadCharacters(projectId);
        const index = characters.findIndex(c => c.id === updated.id);
        if (index !== -1) {
          characters[index] = updated;
          await saveCharacters(projectId, characters);
        }
        message.success(t('asset.videoGenerated'));
      } else {
        message.error(result.error || t('asset.generateFailed'));
      }
    } catch (err: any) {
      message.error(err.message || t('asset.generateFailed'));
    } finally {
      setGenerating(null);
    }
  }, [editedCharacter, form, projectId, theme, stylePrompt, styleSnapshot, itvSelection, onUpdate, message, t]);

  const handleUploadVideo = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('video.title'), extensions: ['mp4', 'webm', 'mov'] }],
        title: t('asset.selectPreviewVideo'),
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('preview.mp4');
      await fsCopy(result.filePaths[0], destPath);

      const updated = updateCharacterMedia(editedCharacter, {
        previewVideo: createStoredMediaAsset('video', { localPath: destPath }),
      });
      setEditedCharacter(updated);
      onUpdate(updated);

      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index !== -1) {
        characters[index] = updated;
        await saveCharacters(projectId, characters);
      }

      message.success(t('asset.uploadSuccess'));
    } catch (err: any) {
      message.error(`${t('asset.uploadFailed')}: ${err.message}`);
    }
  }, [editedCharacter, getAssetPath, projectId, onUpdate, message, t]);

  const handleExtractCharacter = useCallback(async () => {
    if (!getCharacterPreviewVideoSource(editedCharacter)) {
      message.warning(t('asset.pleaseGenerateVideoFirst'));
      return;
    }

    setGenerating('extract');
    setProgress(0);
    setProgressStep(t('asset.extractingCharacter'));

    try {
      const result = await extractAndBindCharacter(
        projectId,
        editedCharacter,
        itvSelection,
        (p, step) => {
          setProgress(p);
          setProgressStep(step);
        }
      );

      if (result.success && result.characterId) {
        const updated = { ...editedCharacter, sora2CharacterId: result.characterId };
        setEditedCharacter(updated);
        onUpdate(updated);

        const characters = await loadCharacters(projectId);
        const index = characters.findIndex(c => c.id === editedCharacter.id);
        if (index !== -1) {
          characters[index] = updated;
          await saveCharacters(projectId, characters);
        }

        message.success(t('asset.characterExtracted'));
      } else {
        message.error(result.error || t('asset.extractFailed'));
      }
    } catch (err: any) {
      message.error(err.message || t('asset.extractFailed'));
    } finally {
      setGenerating(null);
    }
  }, [editedCharacter, projectId, itvSelection, onUpdate, message, t]);

  const handleDelete = useCallback(async () => {
    onDelete(editedCharacter.id);
  }, [editedCharacter.id, onDelete]);

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  const roleOptions = [
    { value: 'protagonist', label: t('asset.protagonist') },
    { value: 'antagonist', label: t('asset.antagonist') },
    { value: 'supporting', label: t('asset.supporting') },
  ];
  const genderOptions: Array<{ value: CharacterGender; label: string }> = [
    { value: 'male', label: '男' },
    { value: 'female', label: '女' },
    { value: 'neutral', label: '中性' },
    { value: 'unknown', label: '未知' },
  ];

  return (
    <div className="assetDetailPanel">
      {/* 左侧 Sidebar */}
      <div className="creatorSidebar">
        <div className="creatorSidebarHeader">
          <Space>
            <UserOutlined />
            <Text strong style={{ fontSize: 16 }}>{editedCharacter.name}</Text>
          </Space>
          <Space>
            <Tooltip title={t('common.save')}>
              <Button type="text" size="small" icon={<SaveOutlined />} onClick={handleSave} />
            </Tooltip>
            <Popconfirm
              title={t('asset.confirmRemoveCharacterFromEpisode')}
              description={t('asset.removeFromEpisodeDescription')}
              onConfirm={handleDelete}
              okButtonProps={{ danger: true }}
            >
              <Tooltip title={t('asset.removeFromEpisode')}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        </div>

        <div className="creatorSidebarContent">
          <Form form={form} layout="vertical" size="small">
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="name" label={t('asset.name')} rules={[{ required: true, message: t('asset.pleaseEnterName') }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="role" label={t('asset.type')}>
                  <Select options={roleOptions} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="age" label="年龄">
                  <Input placeholder="如：28岁" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="gender" label="性别">
                  <Select options={genderOptions} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="prompt" label={t('asset.visualPrompt')}>
              <TextArea
                autoSize={{ minRows: 10, maxRows: 18 }}
                placeholder={t('asset.characterPromptPlaceholder')}
              />
            </Form.Item>
          </Form>

          {/* 生成操作区 */}
          <div className="creatorSidebarActions">
            {generating && (
              <div className="creatorProgress">
                <div className="creatorProgressHeader">
                  <Space>
                    <LoadingOutlined />
                    <Text style={{ fontSize: 12 }}>{progressStep}</Text>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>{Math.round(progress)}%</Text>
                </div>
                <Progress percent={Math.round(progress)} strokeColor="#52c41a" size="small" showInfo={false} />
              </div>
            )}

            <Tooltip title={
              generating !== null ? t('asset.generatingPleaseWait') :
              !activeTTI ? t('asset.noGenerateService') :
              !supportsTextToImage ? '当前模型不支持文生图能力' :
              `${t('asset.useService')}: ${activeTTIModel?.channelLabel || activeTTI.name} / ${activeTTIModel?.modelLabel || activeTTI.modelName || ''}`
            }>
              <Button
                type={!getCharacterCostumePhotoSource(editedCharacter) ? 'primary' : 'default'}
                block
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateCostume}
                loading={generating === 'costume'}
                disabled={generating !== null || !supportsTextToImage}
              >
                {getCharacterCostumePhotoSource(editedCharacter) ? t('asset.redrawCostumePhotoCandidates') : t('asset.drawCostumePhotoCandidates')}
              </Button>
            </Tooltip>

            <Tooltip title={
              generating !== null ? t('asset.generatingPleaseWait') :
              !getCharacterCostumePhotoSource(editedCharacter) ? t('asset.needCostumePhotoFirst') :
              !activeITV ? t('asset.noVideoService') :
              !supportsImageToVideo ? '当前视频模型不支持图生视频能力' :
              `${t('asset.useService')}: ${activeITVModel?.channelLabel || activeITV.name} / ${activeITVModel?.modelLabel || activeITV.modelName || ''}`
            }>
              <Button
                type={getCharacterCostumePhotoSource(editedCharacter) && !getCharacterPreviewVideoSource(editedCharacter) ? 'primary' : 'default'}
                block
                icon={<PlayCircleOutlined />}
                onClick={handleGenerateVideo}
                loading={generating === 'video'}
                disabled={generating !== null || !getCharacterCostumePhotoSource(editedCharacter) || !supportsImageToVideo}
              >
                {t('asset.generatePreviewVideo')}
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* 右侧 Canvas */}
      <div className="creatorCanvas">
        <div className="creatorCanvasToolbar">
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as ViewMode)}
            options={[
              { label: t('asset.costumePhoto'), value: 'costume', icon: <UserOutlined /> },
              { label: t('asset.previewVideo'), value: 'video', icon: <PlayCircleOutlined /> },
            ]}
          />

          <Space>
            {editedCharacter.sora2CharacterId ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                {t('asset.boundTo')}: {editedCharacter.sora2CharacterId.substring(0, 8)}...
              </Tag>
            ) : (
              <Tooltip title={
                generating !== null ? t('asset.generatingPleaseWait') :
                !getCharacterPreviewVideoSource(editedCharacter) ? t('asset.needPreviewVideoFirst') :
                t('asset.extractAndBindCharacter')
              }>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<LinkOutlined />}
                  loading={generating === 'extract'}
                  onClick={handleExtractCharacter}
                  disabled={!getCharacterPreviewVideoSource(editedCharacter) || generating !== null}
                >
                  {t('asset.extractAndBindCharacter')}
                </Button>
              </Tooltip>
            )}

            <div className="toolbarDivider" />

            <Tooltip title={viewMode === 'costume' ? t('asset.uploadCostumePhoto') : t('asset.uploadVideo')}>
              <Button
                type="text"
                icon={<UploadOutlined />}
                onClick={viewMode === 'costume' ? handleUploadCostume : handleUploadVideo}
                aria-label={viewMode === 'costume' ? t('asset.uploadCostumePhoto') : t('asset.uploadVideo')}
              />
            </Tooltip>
            {viewMode === 'costume' && getCharacterCostumePhotoSource(editedCharacter) && (
              <Popconfirm
                title={t('asset.removeCostumePhoto')}
                description={t('asset.removeImageOnlyDescription')}
                onConfirm={handleRemoveCostumePhoto}
                okButtonProps={{ danger: true }}
              >
                <Tooltip title={t('asset.removeCostumePhoto')}>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={t('asset.removeCostumePhoto')}
                  />
                </Tooltip>
              </Popconfirm>
            )}
            <Tooltip title={
              viewMode === 'video' ? t('asset.switchToCostumeMode') :
              !getCharacterCostumePhotoSource(editedCharacter) ? t('asset.noCostumePhoto') :
              t('asset.enlargePreview')
            }>
              <Button
                type="text"
                icon={<ExpandOutlined />}
                onClick={() => {
                  const costumePhotoSource = getCharacterCostumePhotoSource(editedCharacter);
                  if (viewMode === 'costume' && costumePhotoSource) {
                    setPreviewImage(toLocalUrl(costumePhotoSource));
                  }
                }}
                disabled={viewMode === 'video' || !getCharacterCostumePhotoSource(editedCharacter)}
                aria-label={t('asset.enlargePreview')}
              />
            </Tooltip>
          </Space>
        </div>

        <div className="creatorCanvasBody">
          {viewMode === 'costume' ? (
            <div className="creatorMediaViewer">
              {getCharacterCostumePhotoSource(editedCharacter) ? (
                <img
                  src={toLocalUrl(getCharacterCostumePhotoSource(editedCharacter))}
                  alt={t('asset.costumePhoto')}
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={() => setPreviewImage(toLocalUrl(getCharacterCostumePhotoSource(editedCharacter)))}
                />
              ) : (
                <div className="creatorMediaPlaceholder">
                  <UserOutlined />
                  <div>{t('asset.noCostumePhoto')}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="creatorMediaViewer">
              {getCharacterPreviewVideoSource(editedCharacter) ? (
                <video src={toLocalUrl(getCharacterPreviewVideoSource(editedCharacter))} controls autoPlay loop />
              ) : (
                <div className="creatorMediaPlaceholder">
                  <PlayCircleOutlined />
                  <div>{t('asset.noPreviewVideo')}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AssetImageDrawModal
        open={imageDrawOpen}
        title={t('asset.faceImageDrawTitle')}
        hint={t('asset.faceImageDrawHint')}
        useLabel={t('asset.useFaceForCostume')}
        redrawLabel={t('asset.redrawFaceCandidates')}
        applyingLabel={t('asset.generatingCostumeFromSelectedFace')}
        candidates={imageDrawCandidates}
        ownerType="character"
        generating={generating === 'costume'}
        progress={progress}
        progressStep={progressStep}
        applying={imageDrawApplying}
        onCancel={handleCancelImageDraw}
        onRedraw={handleRedrawImageDraw}
        onUseSelected={handleUseSelectedImageDraw}
      />

      {/* 大图预览 Modal */}
      <Modal
        open={!!previewImage}
        onCancel={() => setPreviewImage(null)}
        footer={null}
        centered
        width="auto"
        styles={{ body: { padding: 0, background: 'transparent' } }}
        className="transparent-modal"
        closeIcon={null}
      >
        {previewImage && (
          <img
            src={previewImage}
            alt="Preview"
            style={{ maxWidth: '95vw', maxHeight: '95vh', cursor: 'pointer' }}
            onClick={() => setPreviewImage(null)}
          />
        )}
      </Modal>
    </div>
  );
};

export default CharacterDetailPanel;
