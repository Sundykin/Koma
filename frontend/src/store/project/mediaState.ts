import type {
  Character,
  Prop,
  Scene,
  Shot,
  ShotVersion,
  StoredMediaAsset,
} from '../../types';
import { getMediaAssetSource } from '../../types';

function ensureCreatedAt(asset: StoredMediaAsset): StoredMediaAsset {
  if (asset.createdAt) return asset;
  return { ...asset, createdAt: Date.now() };
}

function compactAsset(asset?: StoredMediaAsset): StoredMediaAsset | undefined {
  if (!asset) return undefined;
  const source = getMediaAssetSource(asset);
  if (!source) return undefined;
  return ensureCreatedAt(asset);
}

function compactAssets(assets?: StoredMediaAsset[]): StoredMediaAsset[] | undefined {
  if (!assets?.length) return undefined;
  const compacted = assets.map(compactAsset).filter(Boolean) as StoredMediaAsset[];
  return compacted.length ? compacted : undefined;
}

function mergeLegacyGridImage(
  images: StoredMediaAsset[] | undefined,
  legacyGridImage?: StoredMediaAsset
): StoredMediaAsset[] | undefined {
  if (!legacyGridImage) return images;
  const next = images ? [...images] : [];
  const legacySource = getMediaAssetSource(legacyGridImage);
  const exists = next.some(asset => getMediaAssetSource(asset) === legacySource);
  if (!exists) {
    next.unshift(legacyGridImage);
  }
  return next.length ? next : undefined;
}

function clampIndex(index: number | undefined, length: number): number | undefined {
  if (!length) return undefined;
  if (index == null || Number.isNaN(index)) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

/**
 * 历史上 Character / Scene / Prop 同时存了多份冗余文本字段：
 *   - Character 有 prompt / description / appearance 三份；UI 只能编辑 prompt，
 *     description / appearance 是首次剧本分析时 LLM 抽出的旧文本，永远没人写回 →
 *     生成时优先读旧字段就会让 UI 改动失效（用户曾汇报"改成绿色流仙裙仍出大红嫁衣"）。
 *   - Scene / Prop 各自的 description 同理。
 *
 * 清理策略：prompt 是唯一来源；老数据 load 时把残留的 appearance / description
 * 折叠进 prompt（仅当 prompt 为空），然后从对象上彻底剥掉。这样 type 上看不到这两个字段，
 * 下游任何残留的 `c.appearance` / `c.description` 读取在 TS 编译期就会报错。
 */
function foldLegacyTextIntoPrompt<T extends { prompt: string }>(record: T, legacyKeys: ReadonlyArray<string>): T {
  const indexed = record as unknown as Record<string, unknown>;
  const existingPrompt = String(indexed.prompt ?? '').trim();
  const cleaned: Record<string, unknown> = { ...indexed };
  const folded: string[] = [];
  if (!existingPrompt) {
    for (const key of legacyKeys) {
      const value = String(indexed[key] ?? '').trim();
      if (value) folded.push(value);
    }
  }
  for (const key of legacyKeys) {
    delete cleaned[key];
  }
  if (!existingPrompt && folded.length > 0) {
    // 把 appearance 和 description 合并：appearance 一般在前（视觉描述），description 是补充小传。
    cleaned.prompt = folded.join('\n');
  }
  return cleaned as T;
}

export function normalizeCharacterMediaState(character: Character): Character {
  const folded = foldLegacyTextIntoPrompt(character, ['appearance', 'description']);
  const costumePhoto = compactAsset(folded.media?.costumePhoto);
  const previewVideo = compactAsset(folded.media?.previewVideo);
  const media = (costumePhoto || previewVideo)
    ? { costumePhoto, previewVideo }
    : undefined;
  return { ...folded, media };
}

export function normalizeSceneMediaState(scene: Scene): Scene {
  const folded = foldLegacyTextIntoPrompt(scene, ['description']);
  const previewImage = compactAsset(folded.media?.previewImage);
  const media = previewImage ? { previewImage } : undefined;
  return { ...folded, media };
}

export function normalizePropMediaState(prop: Prop): Prop {
  const folded = foldLegacyTextIntoPrompt(prop, ['description']);
  const previewImage = compactAsset(folded.media?.previewImage);
  const previewVideo = compactAsset(folded.media?.previewVideo);
  const media = (previewImage || previewVideo)
    ? { previewImage, previewVideo }
    : undefined;
  return { ...folded, media };
}

export function normalizeShotVersionMediaState(version: ShotVersion): ShotVersion {
  const image = compactAsset(version.media?.image);
  const video = compactAsset(version.media?.video);
  const audio = compactAsset(version.media?.audio);
  const media = (image || video || audio) ? { image, video, audio } : undefined;
  return { ...version, media };
}

export function normalizeShotMediaState(shot: Shot): Shot {
  const references = compactAssets(shot.media?.references);
  const legacyGridImage = compactAsset(shot.media?.gridImage);
  const images = mergeLegacyGridImage(compactAssets(shot.media?.images), legacyGridImage);
  const videos = compactAssets(shot.media?.videos);
  // 修 bug: 这里之前漏处理 audios → saveEpisodeShots → normalize 把内存里的配音
  // 给抹掉了 → DB 覆盖 → 切回分镜后语音消失，最终剪辑也读不到音频资源。
  const audios = compactAssets(shot.media?.audios);

  const selectedReferenceIndex = clampIndex(
    shot.media?.selectedReferenceIndex,
    references?.length || 0
  );
  const currentImageIndex = clampIndex(
    shot.media?.currentImageIndex,
    images?.length || 0
  );
  const currentVideoIndex = clampIndex(
    shot.media?.currentVideoIndex,
    videos?.length || 0
  );
  const currentAudioIndex = clampIndex(
    shot.media?.currentAudioIndex,
    audios?.length || 0
  );

  const media = (references || images || videos || audios)
    ? {
      references,
      images,
      videos,
      audios,
      selectedReferenceIndex,
      currentImageIndex,
      currentVideoIndex,
      currentAudioIndex,
    }
    : undefined;

  return { ...shot, media };
}

export function normalizeCharactersMediaState(characters: Character[]): Character[] {
  return characters.map(normalizeCharacterMediaState);
}

export function normalizeScenesMediaState(scenes: Scene[]): Scene[] {
  return scenes.map(normalizeSceneMediaState);
}

export function normalizePropsMediaState(props: Prop[]): Prop[] {
  return props.map(normalizePropMediaState);
}

export function normalizeShotsMediaState(shots: Shot[]): Shot[] {
  return shots.map(normalizeShotMediaState);
}

export function normalizeShotVersionsMediaState(versions: ShotVersion[]): ShotVersion[] {
  return versions.map(normalizeShotVersionMediaState);
}
