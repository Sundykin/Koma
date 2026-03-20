import type {
  Character,
  Prop,
  Scene,
  Shot,
  ShotVersion,
  StoredMediaAsset,
} from '../types';
import { getMediaAssetSource } from '../types';

export function getAssetDisplaySource(asset?: StoredMediaAsset): string | undefined {
  return getMediaAssetSource(asset);
}

export function getCharacterCostumePhotoSource(character?: Character): string | undefined {
  return getMediaAssetSource(character?.media?.costumePhoto);
}

export function getCharacterPreviewVideoSource(character?: Character): string | undefined {
  return getMediaAssetSource(character?.media?.previewVideo);
}

export function getCharacterPreviewVideoTaskId(character?: Character): string | undefined {
  return character?.media?.previewVideo?.providerTaskId;
}

export function getScenePreviewImageSource(scene?: Scene): string | undefined {
  return getMediaAssetSource(scene?.media?.previewImage);
}

export function getPropPreviewImageSource(prop?: Prop): string | undefined {
  return getMediaAssetSource(prop?.media?.previewImage);
}

export function getPropPreviewVideoSource(prop?: Prop): string | undefined {
  return getMediaAssetSource(prop?.media?.previewVideo);
}

export function getPropPreviewVideoTaskId(prop?: Prop): string | undefined {
  return prop?.media?.previewVideo?.providerTaskId;
}

export function getShotReferenceAssets(shot?: Shot): StoredMediaAsset[] {
  return shot?.media?.references || [];
}

export function getShotImageAssets(shot?: Shot): StoredMediaAsset[] {
  return shot?.media?.images || [];
}

export function getShotVideoAssets(shot?: Shot): StoredMediaAsset[] {
  return shot?.media?.videos || [];
}

export function getShotCurrentImageAsset(shot?: Shot): StoredMediaAsset | undefined {
  const images = getShotImageAssets(shot);
  const index = shot?.media?.currentImageIndex ?? 0;
  return images[index];
}

export function getShotCurrentVideoAsset(shot?: Shot): StoredMediaAsset | undefined {
  const videos = getShotVideoAssets(shot);
  const index = shot?.media?.currentVideoIndex ?? 0;
  return videos[index];
}

export function getShotCurrentImageSource(shot?: Shot): string | undefined {
  return getMediaAssetSource(getShotCurrentImageAsset(shot));
}

export function getShotCurrentVideoSource(shot?: Shot): string | undefined {
  return getMediaAssetSource(getShotCurrentVideoAsset(shot));
}

export function getShotVersionImageSource(version?: ShotVersion): string | undefined {
  return getMediaAssetSource(version?.media?.image);
}

export function getShotVersionVideoSource(version?: ShotVersion): string | undefined {
  return getMediaAssetSource(version?.media?.video);
}

export function getShotVersionAudioSource(version?: ShotVersion): string | undefined {
  return getMediaAssetSource(version?.media?.audio);
}

