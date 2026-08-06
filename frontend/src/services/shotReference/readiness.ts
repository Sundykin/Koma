/**
 * 分镜资产就绪检查：找出"被目标分镜引用、但还没有可用图片"的角色/场景/道具。
 *
 * 判定口径与 builder.ts 的取图规则严格一致：
 *   角色 → media.costumePhoto（定妆照）
 *   场景 → media.previewImage（场景图）
 *   道具 → media.previewImage（道具图）
 * StoredMediaAsset 还需带可用源（localPath 或 remoteUrl）才算就绪。
 *
 * 用途：批量/单镜生成前的引导提示 —— 没有资产图的分镜将失去参考图，
 * 角色一致性问题大多源于此（剪映/CapCut 在导出前拦缺素材同理）。
 */
import type { Character, Prop, Scene, Shot, StoredMediaAsset } from '../../types';
import type { ShotScriptLine } from '../../types/scene-character';
import { extractDialoguesFromDescription } from '../../types/shot-script';

export type MissingAssetKind = 'character' | 'scene' | 'prop';

export interface MissingAssetImage {
  kind: MissingAssetKind;
  id: string;
  name: string;
}

export const MISSING_ASSET_KIND_LABELS: Record<MissingAssetKind, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
};

function hasUsableSource(asset: StoredMediaAsset | undefined): boolean {
  return Boolean(asset && (asset.localPath || asset.remoteUrl));
}

function assetHasImage(entity: Character | Scene | Prop, kind: MissingAssetKind): boolean {
  if (kind === 'character') {
    return hasUsableSource((entity as Character).media?.costumePhoto);
  }
  return hasUsableSource((entity as Scene | Prop).media?.previewImage);
}

/**
 * 汇总目标分镜集合引用到的缺图资产（按 id 去重，保持角色→场景→道具的稳定顺序）。
 */
export function findShotAssetsMissingImages(
  shots: Shot[],
  characters: Character[],
  scenes: Scene[],
  props: Prop[] = [],
): MissingAssetImage[] {
  const missing: MissingAssetImage[] = [];
  const seen = new Set<string>();

  const collect = <T extends { id: string; name?: string }>(
    ids: readonly string[],
    entities: T[],
    kind: MissingAssetKind,
  ) => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      const entity = entities.find(e => e.id === id);
      if (!entity) continue; // 引用了已删除的资产由其他链路处理，这里不管
      if (assetHasImage(entity as unknown as Character, kind)) continue;
      seen.add(id);
      missing.push({ kind, id, name: entity.name || '未命名' });
    }
  };

  for (const shot of shots) {
    collect(shot.characters ?? [], characters, 'character');
    collect(shot.scenes ?? [], scenes, 'scene');
    collect(shot.props ?? [], props, 'prop');
  }
  return missing;
}

/** 生成人读的提示文案（按类别分组列出名称） */
export function formatMissingAssetWarning(missing: MissingAssetImage[]): string {
  if (!missing.length) return '';
  const groups: MissingAssetKind[] = ['character', 'scene', 'prop'];
  const parts = groups
    .map(kind => {
      const names = missing.filter(m => m.kind === kind).map(m => m.name);
      return names.length ? `${MISSING_ASSET_KIND_LABELS[kind]}：${names.join('、')}` : '';
    })
    .filter(Boolean);
  return parts.join('；');
}

// ---------------------------------------------------------------------------
// 音色就绪（剧情模式：台词角色的音色作为音画同出模型的全能参考）
// ---------------------------------------------------------------------------

export interface MissingVoiceBinding {
  characterId: string;
  name: string;
}

/**
 * 找出"在目标分镜里有台词、但没绑定音色"的角色。
 * 台词行 = scriptLines 里 role='dialogue' 且带 characterId 的行。
 * 缺音色时视频模型只能即兴发挥，同一角色各镜声音不一致。
 */
export function findDialogueCharactersMissingVoice(
  shots: Shot[],
  characters: Character[],
): MissingVoiceBinding[] {
  const missing: MissingVoiceBinding[] = [];
  const seen = new Set<string>();

  const knownNames = characters.map(char => char.name).filter(Boolean);
  // 按名字定位角色（description 里提取的台词 speaker 是名字，需映射到 characterId）
  const findByName = (name: string): Character | undefined =>
    characters.find(char => char.name === name);

  for (const shot of shots) {
    for (const line of (shot.scriptLines ?? []) as ShotScriptLine[]) {
      if (line.role === 'dialogue' && line.characterId) {
        if (seen.has(line.characterId)) continue;
        seen.add(line.characterId);
        const character = characters.find(c => c.id === line.characterId);
        if (!character || character.voiceId) continue;
        missing.push({ characterId: character.id, name: character.name || '未命名' });
        continue;
      }
      // description：台词用引号包在段落里（剧情模式分镜脚本），提取 speaker 后按名字定位角色
      if (line.role === 'description') {
        for (const d of extractDialoguesFromDescription(line.text, knownNames)) {
          if (!d.speaker) continue;
          const character = findByName(d.speaker);
          if (!character || seen.has(character.id) || character.voiceId) continue;
          seen.add(character.id);
          missing.push({ characterId: character.id, name: character.name || '未命名' });
        }
      }
    }
  }
  return missing;
}
