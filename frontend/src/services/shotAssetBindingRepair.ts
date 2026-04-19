import type { Character, Prop, Scene, Shot } from '../types';

export interface RepairShotAssetBindingsResult {
  shots: Shot[];
  changedShotCount: number;
  repairedReferenceCount: number;
}

interface AssetWithName {
  id: string;
  name: string;
}

interface AssetIndex<T extends AssetWithName> {
  assets: T[];
  canonicalIds: Set<string>;
  legacyIdToCanonical: Map<string, string>;
}

function normalizeRef(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function fuzzyMatchAsset<T extends AssetWithName>(name: string, assets: T[]): T | undefined {
  const trimmed = normalizeRef(name);
  if (!trimmed) {
    return undefined;
  }

  return assets.find((asset) => asset.name === trimmed)
    || assets.find((asset) => trimmed.includes(asset.name))
    || assets.find((asset) => asset.name.includes(trimmed));
}

function buildAssetIndex<T extends AssetWithName>(
  assets: T[],
  getLegacyId?: (asset: T) => string | undefined,
): AssetIndex<T> {
  const canonicalIds = new Set<string>();
  const legacyIdToCanonical = new Map<string, string>();

  for (const asset of assets) {
    canonicalIds.add(asset.id);
    const legacyId = normalizeRef(getLegacyId?.(asset));
    if (legacyId && legacyId !== asset.id) {
      legacyIdToCanonical.set(legacyId, asset.id);
    }
  }

  return {
    assets,
    canonicalIds,
    legacyIdToCanonical,
  };
}

function repairRefs<T extends AssetWithName>(
  refs: string[] | undefined,
  index: AssetIndex<T>,
): { ids: string[]; changed: boolean; repairedCount: number } {
  const ids: string[] = [];
  let changed = false;
  let repairedCount = 0;

  for (const rawRef of refs || []) {
    const ref = normalizeRef(rawRef);
    if (!ref) {
      if (rawRef) {
        changed = true;
        repairedCount += 1;
      }
      continue;
    }

    if (index.canonicalIds.has(ref)) {
      ids.push(ref);
      continue;
    }

    const canonicalId = index.legacyIdToCanonical.get(ref);
    if (canonicalId) {
      ids.push(canonicalId);
      changed = true;
      repairedCount += 1;
      continue;
    }

    const match = fuzzyMatchAsset(ref, index.assets);
    if (match) {
      ids.push(match.id);
      changed = true;
      repairedCount += 1;
      continue;
    }

    changed = true;
    repairedCount += 1;
  }

  return {
    ids,
    changed,
    repairedCount,
  };
}

/**
 * 参考旧版 Storyboard 加载逻辑，把分镜里遗留的名称引用或旧 Provider ID
 * 统一修复回当前项目资产 ID。
 */
export function repairShotAssetBindings(
  shots: Shot[],
  assets: {
    characters: Character[];
    scenes: Scene[];
    props: Prop[];
  },
): RepairShotAssetBindingsResult {
  const characterIndex = buildAssetIndex(assets.characters, (character) => character.sora2CharacterId);
  const sceneIndex = buildAssetIndex(assets.scenes);
  const propIndex = buildAssetIndex(assets.props, (prop) => prop.sora2PropId);

  let changedShotCount = 0;
  let repairedReferenceCount = 0;

  const repairedShots = shots.map((shot) => {
    const repairedCharacters = repairRefs(shot.characters, characterIndex);
    const repairedScenes = repairRefs(shot.scenes, sceneIndex);
    const repairedProps = repairRefs(shot.props, propIndex);
    const changed = repairedCharacters.changed || repairedScenes.changed || repairedProps.changed;

    if (!changed) {
      return shot;
    }

    changedShotCount += 1;
    repairedReferenceCount += repairedCharacters.repairedCount + repairedScenes.repairedCount + repairedProps.repairedCount;

    return {
      ...shot,
      characters: repairedCharacters.ids,
      scenes: repairedScenes.ids,
      props: repairedProps.ids,
    };
  });

  return {
    shots: repairedShots,
    changedShotCount,
    repairedReferenceCount,
  };
}
