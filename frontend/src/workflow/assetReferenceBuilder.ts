/**
 * 从分镜关联资产（角色/场景/道具）构建参考图列表和编译资产列表。
 * 被 shotImageWorkflow 和 shotRenderWorkflow 共用。
 */
import type { Character, Scene, Prop, Shot, StoredMediaAsset } from '../types';
import { getMediaAssetDisplaySource } from '../types';
import type { PromptCompilationAsset } from '../services/promptCompilation/types';

export interface AssetReferenceResult {
  /** StoredMediaAsset 引用（用于 TTI） */
  mediaReferences: StoredMediaAsset[];
  /** 显示源 URL 字符串（用于 ITV additionalReferences） */
  displaySourceUrls: string[];
  /** 编译用资产描述 */
  compilationAssets: PromptCompilationAsset[];
}

/**
 * 从 shot 关联的角色/场景/道具构建统一的资产引用。
 */
export function buildShotAssetReferences(
  shot: Shot,
  characters: Character[],
  scenes: Scene[],
  props: Prop[],
): AssetReferenceResult {
  const mediaReferences: StoredMediaAsset[] = [];
  const displaySourceUrls: string[] = [];
  const compilationAssets: PromptCompilationAsset[] = [];

  // 角色
  for (const charId of shot.characters || []) {
    const char = characters.find(c => c.id === charId);
    if (!char) continue;
    const photo = char.media?.costumePhoto;
    if (photo) {
      mediaReferences.push(photo);
      const src = getMediaAssetDisplaySource(photo);
      if (src) displaySourceUrls.push(src);
    }
    compilationAssets.push({
      type: 'char',
      assetId: char.id,
      altIds: char.sora2CharacterId ? [char.sora2CharacterId] : undefined,
      source: photo,
    });
  }

  // 场景
  for (const sceneId of shot.scenes || []) {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) continue;
    const preview = scene.media?.previewImage;
    if (preview) {
      mediaReferences.push(preview);
      const src = getMediaAssetDisplaySource(preview);
      if (src) displaySourceUrls.push(src);
    }
    compilationAssets.push({
      type: 'scene',
      assetId: scene.id,
      source: preview,
    });
  }

  // 道具
  for (const propId of shot.props || []) {
    const prop = props.find(p => p.id === propId);
    if (!prop) continue;
    const preview = prop.media?.previewImage;
    if (preview) {
      mediaReferences.push(preview);
      const src = getMediaAssetDisplaySource(preview);
      if (src) displaySourceUrls.push(src);
    }
    compilationAssets.push({
      type: 'prop',
      assetId: prop.id,
      altIds: (prop as any).sora2PropId ? [(prop as any).sora2PropId] : undefined,
      source: preview,
    });
  }

  return { mediaReferences, displaySourceUrls, compilationAssets };
}
