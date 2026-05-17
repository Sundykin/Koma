import { useCallback, useState } from 'react';
import { App } from 'antd';
import type { LinghuiDirector3DActor, LinghuiDirector3DScene } from '../../../../types/linghui';
import { createDirector3DActor } from '../../director3d/director3dScene';
import { pickReferenceImagesAndPersist } from '../../director3d/director3dReferenceImageUpload';
import {
  useLinghuiGlobalAssets,
  type LinghuiGlobalAsset,
  type LinghuiGlobalAssetCategory,
  type LinghuiGlobalAssetPropType,
} from '../../../../store/linghuiGlobalAssets';
import type { Director3DSelection } from '../components/Director3DNodeEditorState';

interface Director3DGlobalAssetsParams {
  selectedActor: LinghuiDirector3DActor | null;
  selectionKind: Director3DSelection['kind'];
  updateScene: (updater: (prev: LinghuiDirector3DScene) => LinghuiDirector3DScene) => void;
}

export function useDirector3DGlobalAssets({
  selectedActor,
  selectionKind,
  updateScene,
}: Director3DGlobalAssetsParams) {
  const { message } = App.useApp();
  const characterStore = useLinghuiGlobalAssets({ kind: 'character' });
  const propStore = useLinghuiGlobalAssets({ kind: 'prop' });
  const [pendingReferenceImages, setPendingReferenceImages] = useState<string[]>([]);
  const [saveAssetPopoverOpen, setSaveAssetPopoverOpen] = useState(false);

  const handlePickReferenceImages = useCallback(async () => {
    if (!selectedActor) return;
    try {
      const urls = await pickReferenceImagesAndPersist({
        assetIdHint: selectedActor.id,
        maxCount: 3 - pendingReferenceImages.length,
      });
      if (urls.length > 0) {
        setPendingReferenceImages(prev => [...prev, ...urls].slice(0, 3));
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '上传参考图失败');
    }
  }, [message, pendingReferenceImages.length, selectedActor]);

  const handleSaveSelectedAsGlobalAsset = useCallback(async () => {
    if (selectionKind !== 'actor' || !selectedActor) {
      message.info('请先选中一个角色 / 道具再保存到全局库');
      return;
    }
    if (selectedActor.type === 'formation' || selectedActor.type === 'mannequin-lite') {
      message.warning('方阵 / 群演不支持保存到全局库');
      return;
    }
    const isProp = selectedActor.type.startsWith('prop-');
    try {
      const mergedReferences = Array.from(new Set([
        ...(selectedActor.referenceImages ?? []),
        ...pendingReferenceImages,
      ])).slice(0, 3);

      const saved = isProp
        ? await propStore.save({
            kind: 'prop',
            label: selectedActor.label,
            color: selectedActor.color,
            scale: selectedActor.scale,
            propType: selectedActor.type as LinghuiGlobalAssetPropType,
            category: 'gear',
            referenceImages: mergedReferences.length > 0 ? mergedReferences : undefined,
          })
        : await characterStore.save({
            kind: 'character',
            label: selectedActor.label,
            color: selectedActor.color,
            scale: selectedActor.scale,
            posePreset: selectedActor.posePreset,
            referenceImages: mergedReferences.length > 0 ? mergedReferences : undefined,
          });
      message.success(`已保存到全局库：${saved.label}（${mergedReferences.length} 张参考图）`);
      setPendingReferenceImages([]);
      setSaveAssetPopoverOpen(false);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '保存到全局库失败');
    }
  }, [characterStore, message, pendingReferenceImages, propStore, selectedActor, selectionKind]);

  const handleAddGlobalAsset = useCallback((asset: LinghuiGlobalAsset) => {
    const referenceImagesSnapshot = Array.isArray(asset.referenceImages) && asset.referenceImages.length > 0
      ? [...asset.referenceImages]
      : undefined;
    if (asset.kind === 'character') {
      updateScene(prev => {
        const seq = prev.actors.filter(actor => actor.type === 'mannequin').length + 1;
        const offsetX = (seq % 2 === 1 ? 1 : -1) * 0.7 * Math.ceil(seq / 2);
        const actor = createDirector3DActor({
          id: `char_${asset.id}_${Date.now().toString(36)}`,
          type: 'mannequin',
          label: asset.label,
          color: asset.color,
          scale: asset.scale ?? 1,
          posePreset: asset.posePreset ?? 'idle',
          position: [Number(offsetX.toFixed(2)), 0, 0],
          referenceImages: referenceImagesSnapshot,
          sourceGlobalAssetId: asset.id,
        });
        return { ...prev, actors: [...prev.actors, actor] };
      });
    } else {
      updateScene(prev => {
        const propsInScene = prev.actors.filter(actor => actor.type === asset.propType).length;
        const actor = createDirector3DActor({
          id: `prop_${asset.id}_${Date.now().toString(36)}`,
          type: asset.propType ?? 'prop-box',
          label: asset.label,
          color: asset.color,
          scale: asset.scale ?? 1,
          position: [
            (propsInScene % 2 === 0 ? 1 : -1) * 0.8 * (Math.floor(propsInScene / 2) + 1),
            0,
            -1.2,
          ],
          referenceImages: referenceImagesSnapshot,
          sourceGlobalAssetId: asset.id,
        });
        return { ...prev, actors: [...prev.actors, actor] };
      });
    }
  }, [updateScene]);

  const handleToggleAssetFavorite = useCallback(async (asset: LinghuiGlobalAsset) => {
    const target = asset.kind === 'character' ? characterStore : propStore;
    await target.save({
      id: asset.id,
      kind: asset.kind,
      label: asset.label,
      color: asset.color,
      scale: asset.scale,
      posePreset: asset.posePreset,
      propType: asset.propType,
      category: asset.category as LinghuiGlobalAssetCategory | undefined,
      favorite: !asset.favorite,
    });
  }, [characterStore, propStore]);

  const handleDeleteGlobalAsset = useCallback(async (asset: LinghuiGlobalAsset) => {
    const target = asset.kind === 'character' ? characterStore : propStore;
    const ok = await target.remove(asset.id);
    if (ok) message.success(`已从全局库删除：${asset.label}`);
  }, [characterStore, message, propStore]);

  return {
    characterAssets: characterStore.assets,
    propAssets: propStore.assets,
    pendingReferenceImages,
    saveAssetPopoverOpen,
    setPendingReferenceImages,
    setSaveAssetPopoverOpen,
    handleAddGlobalAsset,
    handleDeleteGlobalAsset,
    handlePickReferenceImages,
    handleSaveSelectedAsGlobalAsset,
    handleToggleAssetFavorite,
  };
}
