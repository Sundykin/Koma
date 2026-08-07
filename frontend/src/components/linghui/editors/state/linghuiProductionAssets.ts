import type {
  LinghuiProductionAsset,
  LinghuiProductionAssetKind,
  LinghuiProductionAssetReferenceVersion,
  LinghuiProductionAssetStatus,
} from '../../../../types/linghui';
import type { LinghuiStoryboardFrame } from '../../../../types/linghui';

interface AssetCandidate {
  kind: LinghuiProductionAssetKind;
  name: string;
  description: string;
  shotIds: string[];
  referenceImage?: string;
}

export interface LinghuiShotProductionAssetReference {
  asset: LinghuiProductionAsset;
  match: 'production-id' | 'source-shot' | 'name';
}

export interface LinghuiShotProductionAssetMissing {
  kind: LinghuiProductionAssetKind;
  name: string;
}

export interface LinghuiShotProductionAssetProjection {
  references: LinghuiShotProductionAssetReference[];
  missing: LinghuiShotProductionAssetMissing[];
}

export type LinghuiProductionConsistencyIssueCode =
  | 'missing-asset'
  | 'unapproved-asset'
  | 'missing-reference'
  | 'character-clothing-conflict'
  | 'scene-time-conflict'
  | 'prop-state-conflict'
  | 'style-conflict';

export interface LinghuiProductionConsistencyIssue {
  code: LinghuiProductionConsistencyIssueCode;
  severity: 'error' | 'warning';
  kind: LinghuiProductionAssetKind | 'project';
  name: string;
  assetId?: string;
  shotIds: string[];
  shotLabels: string[];
  /** 人类可读的确定性证据；没有明确证据时不创建语义问题。 */
  detail?: string;
}

export interface LinghuiProductionAssetDuplicateCandidate {
  id: string;
  kind: LinghuiProductionAssetKind;
  leftAssetId: string;
  rightAssetId: string;
  reason: 'same-name' | 'alias-match';
  detail: string;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s·•、，,。.!！？?：:；;「」『』（）()\[\]{}]/g, '');
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  values.forEach(value => {
    const label = normalizeText(value);
    const key = normalizeKey(label);
    if (!label || !key || seen.has(key)) return;
    seen.add(key);
    items.push(label);
  });
  return items;
}

function getProductionAssetIdentityKeys(asset: LinghuiProductionAsset): Set<string> {
  return new Set(
    [asset.name, ...normalizeStringList(asset.aliases)]
      .map(value => normalizeKey(normalizeText(value)))
      .filter(Boolean),
  );
}

function collectShotAssetNames(shot: LinghuiStoryboardFrame) {
  const entities: Array<{ kind: LinghuiProductionAssetKind; name: string }> = [];
  for (const character of shot.characters ?? []) {
    const name = normalizeText(character.characterName) || normalizeText(character.characterDescription);
    if (name) entities.push({ kind: 'character', name });
  }
  for (const scene of shot.scenes ?? []) {
    const name = normalizeText(scene.sceneName) || normalizeText(scene.sceneDescription);
    if (name) entities.push({ kind: 'scene', name });
  }
  if (!(shot.scenes?.length)) {
    const sceneTags = normalizeText(shot.sceneTags);
    if (sceneTags) entities.push({ kind: 'scene', name: sceneTags });
  }
  for (const prop of shot.props ?? []) {
    const name = normalizeText(prop.propName) || normalizeText(prop.propDescription);
    if (name) entities.push({ kind: 'prop', name });
  }
  return entities;
}

/**
 * 将一个镜头投影到生产资产关系上。
 *
 * 优先级：生成资产 frame 的稳定 id > 资产保存的来源镜头 id > 旧数据中的实体名称。
 * 名称只作为兼容回退，用户改名后仍由 sourceShotIds 保持关系。
 */
export function resolveLinghuiShotProductionAssetProjection(
  shot: LinghuiStoryboardFrame,
  assets: LinghuiProductionAsset[],
): LinghuiShotProductionAssetProjection {
  const entities = collectShotAssetNames(shot);
  const sourceMatches = assets.filter(asset => asset.sourceShotIds.includes(shot.id));
  const matched = new Map<string, LinghuiShotProductionAssetReference>();
  const setMatch = (asset: LinghuiProductionAsset, match: LinghuiShotProductionAssetReference['match']) => {
    const previous = matched.get(asset.id);
    const priority: Record<LinghuiShotProductionAssetReference['match'], number> = {
      name: 1,
      'source-shot': 2,
      'production-id': 3,
    };
    if (!previous || priority[match] > priority[previous.match]) {
      matched.set(asset.id, { asset, match });
    }
  };

  if (shot.productionAsset?.id) {
    const productionAsset = assets.find(asset => (
      asset.id === shot.productionAsset?.id
      || normalizeStringList(asset.mergedAssetIds).includes(shot.productionAsset?.id ?? '')
    ));
    if (productionAsset) setMatch(productionAsset, 'production-id');
  }
  sourceMatches.forEach(asset => setMatch(asset, 'source-shot'));

  const exactNameMatches = new Set<string>();
  for (const entity of entities) {
    const entityKey = `${entity.kind}:${normalizeKey(entity.name)}`;
    const asset = assets.find(candidate => (
      candidate.kind === entity.kind
      && getProductionAssetIdentityKeys(candidate).has(normalizeKey(entity.name))
    ));
    if (asset) {
      exactNameMatches.add(entityKey);
      setMatch(asset, 'name');
    }
  }

  const missing = entities.filter(entity => {
    const entityKey = `${entity.kind}:${normalizeKey(entity.name)}`;
    if (exactNameMatches.has(entityKey)) return false;
    const sameKindEntities = entities.filter(candidate => candidate.kind === entity.kind);
    const sameKindSourceMatches = sourceMatches.filter(asset => asset.kind === entity.kind);
    // 只有一个同类实体和一个来源资产时，可以安全地把它视为用户改名后的同一资产。
    if (sameKindEntities.length === 1 && sameKindSourceMatches.length === 1) return false;
    return true;
  });

  return {
    references: assets
      .filter(asset => matched.has(asset.id))
      .map(asset => matched.get(asset.id) as LinghuiShotProductionAssetReference),
    missing: missing.filter((entity, index, all) => all.findIndex(candidate => (
      candidate.kind === entity.kind && normalizeKey(candidate.name) === normalizeKey(entity.name)
    )) === index),
  };
}

export function resolveLinghuiProductionAssetAffectedShots(
  asset: LinghuiProductionAsset,
  shots: LinghuiStoryboardFrame[],
): LinghuiStoryboardFrame[] {
  return shots.filter(shot => resolveLinghuiShotProductionAssetProjection(shot, [asset]).references.length > 0);
}

export function resolveLinghuiProductionAssetStatus(
  asset: Pick<LinghuiProductionAsset, 'confirmed' | 'status'>,
): LinghuiProductionAssetStatus {
  if (asset.status === 'locked') return 'locked';
  if (asset.status === 'approved') return 'approved';
  return asset.confirmed ? 'approved' : 'draft';
}

export function isLinghuiProductionAssetConfirmed(
  asset: Pick<LinghuiProductionAsset, 'confirmed' | 'status'>,
): boolean {
  return resolveLinghuiProductionAssetStatus(asset) !== 'draft';
}

interface SemanticDefinition {
  id: string;
  label: string;
  pattern: RegExp;
}

interface ClothingSignal {
  garmentIds: string[];
  colorIds: string[];
  label: string;
}

interface PropStateSignal {
  states: Array<{ dimension: string; value: string; label: string }>;
  label: string;
}

interface StyleSignal {
  ids: string[];
  label: string;
}

interface SemanticShotEntry<T> {
  shot: LinghuiStoryboardFrame;
  shotIndex: number;
  signal: T;
}

const CLOTHING_DEFINITIONS: SemanticDefinition[] = [
  { id: 'trench-coat', label: '风衣', pattern: /风衣|trench\s*coat/i },
  { id: 'coat', label: '大衣', pattern: /大衣|呢子大衣|overcoat/i },
  { id: 'jacket', label: '夹克', pattern: /夹克|jacket/i },
  { id: 'suit', label: '西装', pattern: /西装|西服|suit/i },
  { id: 'uniform', label: '制服', pattern: /制服|校服|军装|警服|uniform/i },
  { id: 'dress', label: '裙装', pattern: /连衣裙|长裙|短裙|裙装|dress/i },
  { id: 'shirt', label: '衬衫', pattern: /衬衫|shirt/i },
  { id: 't-shirt', label: 'T恤', pattern: /T\s*恤|t-?shirt/i },
  { id: 'sweater', label: '毛衣', pattern: /毛衣|针织衫|sweater/i },
  { id: 'robe', label: '长袍', pattern: /长袍|道袍|法袍|robe/i },
  { id: 'cloak', label: '斗篷', pattern: /斗篷|披风|cloak|cape/i },
  { id: 'armor', label: '盔甲', pattern: /盔甲|铠甲|战甲|armor/i },
  { id: 'sportswear', label: '运动服', pattern: /运动服|球衣|sportswear|jersey/i },
  { id: 'workwear', label: '工装', pattern: /工装|工作服|workwear|coveralls/i },
  { id: 'formalwear', label: '礼服', pattern: /礼服|晚礼服|formal\s*wear|gown/i },
  { id: 'casualwear', label: '便装', pattern: /便装|休闲装|casual\s*wear/i },
  { id: 'pajamas', label: '睡衣', pattern: /睡衣|pajamas?|pyjamas?/i },
];

const CLOTHING_COLOR_DEFINITIONS: SemanticDefinition[] = [
  { id: 'black', label: '黑色', pattern: /黑色|乌黑|black/i },
  { id: 'white', label: '白色', pattern: /白色|纯白|white/i },
  { id: 'red', label: '红色', pattern: /红色|深红|猩红|red|crimson/i },
  { id: 'blue', label: '蓝色', pattern: /蓝色|深蓝|藏蓝|blue|navy/i },
  { id: 'green', label: '绿色', pattern: /绿色|墨绿|green/i },
  { id: 'yellow', label: '黄色', pattern: /黄色|明黄|yellow/i },
  { id: 'purple', label: '紫色', pattern: /紫色|purple/i },
  { id: 'pink', label: '粉色', pattern: /粉色|pink/i },
  { id: 'gray', label: '灰色', pattern: /灰色|银灰|gray|grey/i },
  { id: 'brown', label: '棕色', pattern: /棕色|褐色|brown/i },
  { id: 'gold', label: '金色', pattern: /金色|gold(?:en)?/i },
  { id: 'silver', label: '银色', pattern: /银色|silver/i },
  { id: 'dark', label: '深色', pattern: /深色|dark-colored/i },
  { id: 'light', label: '浅色', pattern: /浅色|light-colored/i },
];

const SCENE_TIME_DEFINITIONS: SemanticDefinition[] = [
  { id: 'dawn', label: '清晨', pattern: /清晨|早晨|黎明|晨曦|破晓|\bdawn\b|\bmorning\b/i },
  { id: 'day', label: '白天', pattern: /白天|白昼|日间|上午|中午|正午|\bday(?:time|light)?\b|\bnoon\b/i },
  { id: 'dusk', label: '黄昏', pattern: /黄昏|傍晚|日落|夕阳|暮色|\bdusk\b|\bsunset\b|\bevening\b/i },
  { id: 'night', label: '夜晚', pattern: /夜晚|夜里|深夜|午夜|夜幕|雨夜|夜景|\bnight(?:time)?\b|\bmidnight\b/i },
];

const PROP_STATE_DEFINITIONS: Array<SemanticDefinition & { dimension: string; value: string }> = [
  { dimension: 'condition', value: 'intact', id: 'intact', label: '完好', pattern: /完好|完整无损|未损坏|完好无损|\bintact\b|\bundamaged\b/i },
  { dimension: 'condition', value: 'damaged', id: 'damaged', label: '破损', pattern: /破碎|破损|碎裂|断裂|损坏|\bbroken\b|\bcracked\b|\bshattered\b|\bdamaged\b/i },
  { dimension: 'access', value: 'open', id: 'open', label: '打开', pattern: /打开|开启|敞开|\bopen(?:ed)?\b/i },
  { dimension: 'access', value: 'closed', id: 'closed', label: '关闭', pattern: /关闭|关上|合上|锁住|上锁|\bclosed\b|\blocked\b/i },
  { dimension: 'moisture', value: 'wet', id: 'wet', label: '湿润', pattern: /湿润|潮湿|浸湿|淋湿|\bwet\b|\bsoaked\b/i },
  { dimension: 'moisture', value: 'dry', id: 'dry', label: '干燥', pattern: /干燥|擦干|\bdry\b/i },
  { dimension: 'fill', value: 'empty', id: 'empty', label: '空', pattern: /空瓶|空盒|空的|空置|\bempty\b/i },
  { dimension: 'fill', value: 'full', id: 'full', label: '装满', pattern: /装满|盛满|满的|\bfull\b|\bfilled\b/i },
  { dimension: 'light', value: 'lit', id: 'lit', label: '点燃', pattern: /点燃|燃烧|亮着|\blit\b|\bburning\b/i },
  { dimension: 'light', value: 'unlit', id: 'unlit', label: '熄灭', pattern: /熄灭|未点燃|灭着|\bunlit\b|\bextinguished\b/i },
  { dimension: 'cleanliness', value: 'clean', id: 'clean', label: '干净', pattern: /干净|洁净|\bclean\b/i },
  { dimension: 'cleanliness', value: 'dirty', id: 'dirty', label: '污损', pattern: /肮脏|污损|沾满泥|\bdirty\b|\bstained\b/i },
];

const STYLE_DEFINITIONS: SemanticDefinition[] = [
  { id: 'photoreal', label: '写实摄影', pattern: /写实|真人实拍|照片级|摄影质感|\bphotoreal(?:istic)?\b|\blive[ -]?action\b/i },
  { id: 'anime', label: '二次元动画', pattern: /二次元|动漫|日系动画|赛璐璐|\banime\b|\bcel[ -]?shad(?:ed|ing)\b/i },
  { id: 'comic', label: '漫画', pattern: /漫画风|美漫|国漫|\bcomic(?:s)?\b|\bmanga\b/i },
  { id: 'watercolor', label: '水彩', pattern: /水彩|\bwatercolou?r\b/i },
  { id: 'oil-painting', label: '油画', pattern: /油画|\boil[ -]?paint(?:ing)?\b/i },
  { id: 'ink', label: '水墨', pattern: /水墨|国画|\bink[ -]?wash\b/i },
  { id: 'pixel', label: '像素画', pattern: /像素画|像素风|\bpixel[ -]?art\b/i },
  { id: 'paper-cut', label: '剪纸', pattern: /剪纸|\bpaper[ -]?cut\b/i },
  { id: 'low-poly', label: '低多边形', pattern: /低多边形|\blow[ -]?poly\b/i },
];

function matchSemanticDefinitions(text: string, definitions: SemanticDefinition[]): SemanticDefinition[] {
  return definitions.filter(definition => definition.pattern.test(text));
}

function hasIntersection(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some(item => rightSet.has(item));
}

function extractClothingSignal(value: unknown): ClothingSignal | null {
  const text = normalizeText(value);
  if (!text) return null;
  const garments = matchSemanticDefinitions(text, CLOTHING_DEFINITIONS);
  if (garments.length === 0) return null;
  const colors = matchSemanticDefinitions(text, CLOTHING_COLOR_DEFINITIONS);
  return {
    garmentIds: garments.map(item => item.id),
    colorIds: colors.map(item => item.id),
    label: [...colors, ...garments].map(item => item.label).join(' + '),
  };
}

function clothingSignalsConflict(left: ClothingSignal, right: ClothingSignal): boolean {
  if (!hasIntersection(left.garmentIds, right.garmentIds)) return true;
  return left.colorIds.length > 0
    && right.colorIds.length > 0
    && !hasIntersection(left.colorIds, right.colorIds);
}

function extractSceneTimeSignal(value: unknown): SemanticDefinition | null {
  const matches = matchSemanticDefinitions(normalizeText(value), SCENE_TIME_DEFINITIONS);
  return matches.length === 1 ? matches[0] : null;
}

function extractPropStateSignal(value: unknown): PropStateSignal | null {
  const text = normalizeText(value);
  if (!text) return null;
  const matches = PROP_STATE_DEFINITIONS.filter(definition => definition.pattern.test(text));
  const states = Array.from(new Set(matches.map(item => item.dimension)))
    .map(dimension => {
      const dimensionMatches = matches.filter(item => item.dimension === dimension);
      const values = new Set(dimensionMatches.map(item => item.value));
      return values.size === 1 ? dimensionMatches[0] : null;
    })
    .filter((item): item is (typeof PROP_STATE_DEFINITIONS)[number] => Boolean(item))
    .map(item => ({ dimension: item.dimension, value: item.value, label: item.label }));
  if (states.length === 0) return null;
  return { states, label: states.map(item => item.label).join(' + ') };
}

function propStateSignalsConflict(left: PropStateSignal, right: PropStateSignal): boolean {
  return left.states.some(leftState => right.states.some(rightState => (
    leftState.dimension === rightState.dimension && leftState.value !== rightState.value
  )));
}

function extractStyleSignal(value: unknown): StyleSignal | null {
  const matches = matchSemanticDefinitions(normalizeText(value), STYLE_DEFINITIONS);
  if (matches.length === 0) return null;
  return {
    ids: matches.map(item => item.id),
    label: matches.map(item => item.label).join(' + '),
  };
}

function styleSignalsConflict(left: StyleSignal, right: StyleSignal): boolean {
  return !hasIntersection(left.ids, right.ids);
}

function createSemanticIssue<T>(args: {
  code: Exclude<LinghuiProductionConsistencyIssueCode, 'missing-asset' | 'unapproved-asset' | 'missing-reference'>;
  kind: LinghuiProductionAssetKind | 'project';
  name: string;
  assetId?: string;
  entries: SemanticShotEntry<T>[];
  details: string[];
}): LinghuiProductionConsistencyIssue {
  const shotIds: string[] = [];
  const shotLabels: string[] = [];
  args.entries.forEach(({ shot, shotIndex }) => {
    const shotId = normalizeText(shot.id);
    const shotNumber = shot.shotNumber ?? shotIndex + 1;
    const shotLabel = `#${shotNumber} ${normalizeText(shot.title) || '未命名镜头'}`;
    if (shotId && !shotIds.includes(shotId)) shotIds.push(shotId);
    if (!shotLabels.includes(shotLabel)) shotLabels.push(shotLabel);
  });
  return {
    code: args.code,
    severity: 'warning',
    kind: args.kind,
    name: args.name,
    assetId: args.assetId,
    shotIds,
    shotLabels,
    detail: Array.from(new Set(args.details)).join(' / '),
  };
}

/**
 * 生成可持久化的一致性问题指纹。
 * 镜头范围或证据发生变化时指纹也会变化，避免用户确认旧问题后遮蔽新风险。
 */
export function getLinghuiProductionConsistencyIssueId(
  issue: LinghuiProductionConsistencyIssue,
): string {
  return [
    issue.code,
    issue.assetId || `${issue.kind}:${normalizeKey(issue.name)}`,
    issue.shotIds.join(','),
    normalizeKey(issue.detail || ''),
  ].join(':');
}

function findProductionAssetByName(
  assets: LinghuiProductionAsset[],
  kind: LinghuiProductionAssetKind,
  name: string,
): LinghuiProductionAsset | undefined {
  const key = normalizeKey(name);
  return assets.find(asset => asset.kind === kind && normalizeKey(asset.name) === key);
}

/**
 * 在引用/状态检查之上追加可解释的语义规则。
 *
 * 规则只在镜头或资产描述中出现明确服装、时段、道具状态或风格词时提示；
 * 缺少信号、信号含糊或只有一个版本时保持静默，避免把正常省略和有意转场误报为错误。
 */
export function auditLinghuiProductionSemanticConsistency(
  shots: LinghuiStoryboardFrame[],
  assets: LinghuiProductionAsset[],
): LinghuiProductionConsistencyIssue[] {
  const issues: LinghuiProductionConsistencyIssue[] = [];

  const clothingGroups = new Map<string, {
    name: string;
    entries: SemanticShotEntry<ClothingSignal>[];
  }>();
  shots.forEach((shot, shotIndex) => {
    (shot.characters ?? []).forEach(character => {
      const name = normalizeText(character.characterName);
      const signal = extractClothingSignal(character.characterDescription);
      if (!name || !signal) return;
      const key = normalizeKey(name);
      const group = clothingGroups.get(key) ?? { name, entries: [] };
      group.entries.push({ shot, shotIndex, signal });
      clothingGroups.set(key, group);
    });
  });
  clothingGroups.forEach(group => {
    const asset = findProductionAssetByName(assets, 'character', group.name);
    const expected = extractClothingSignal(asset?.description);
    const conflicting = new Set<SemanticShotEntry<ClothingSignal>>();
    group.entries.forEach((entry, index) => {
      if (expected && clothingSignalsConflict(expected, entry.signal)) conflicting.add(entry);
      const candidate = group.entries[index + 1];
      if (candidate && candidate.shotIndex - entry.shotIndex <= 1) {
        if (!clothingSignalsConflict(entry.signal, candidate.signal)) return;
        conflicting.add(entry);
        conflicting.add(candidate);
      }
    });
    if (conflicting.size === 0) return;
    const entries = Array.from(conflicting);
    issues.push(createSemanticIssue({
      code: 'character-clothing-conflict',
      kind: 'character',
      name: group.name,
      assetId: asset?.id,
      entries,
      details: [expected?.label, ...entries.map(entry => entry.signal.label)].filter(Boolean) as string[],
    }));
  });

  const sceneGroups = new Map<string, {
    name: string;
    entries: SemanticShotEntry<SemanticDefinition>[];
  }>();
  shots.forEach((shot, shotIndex) => {
    const projectionScenes = resolveLinghuiShotProductionAssetProjection(shot, assets).references
      .filter(reference => reference.asset.kind === 'scene')
      .map(reference => ({ sceneName: reference.asset.name, sceneDescription: '' }));
    const scenes = shot.scenes?.length ? shot.scenes : projectionScenes;
    scenes.forEach(scene => {
      const name = normalizeText(scene.sceneName);
      const signal = extractSceneTimeSignal([
        scene.sceneDescription,
        shot.sceneTags,
        shot.lightingAndAtmosphere,
      ].map(normalizeText).filter(Boolean).join('，'));
      if (!name || !signal) return;
      const key = normalizeKey(name);
      const group = sceneGroups.get(key) ?? { name, entries: [] };
      group.entries.push({ shot, shotIndex, signal });
      sceneGroups.set(key, group);
    });
  });
  sceneGroups.forEach(group => {
    const asset = findProductionAssetByName(assets, 'scene', group.name);
    const expected = extractSceneTimeSignal(asset?.description);
    const conflicting = new Set<SemanticShotEntry<SemanticDefinition>>();
    group.entries.forEach((entry, index) => {
      if (expected && expected.id !== entry.signal.id) conflicting.add(entry);
      const candidate = group.entries[index + 1];
      if (candidate && candidate.shotIndex - entry.shotIndex <= 1) {
        if (entry.signal.id === candidate.signal.id) return;
        conflicting.add(entry);
        conflicting.add(candidate);
      }
    });
    if (conflicting.size === 0) return;
    const entries = Array.from(conflicting);
    issues.push(createSemanticIssue({
      code: 'scene-time-conflict',
      kind: 'scene',
      name: group.name,
      assetId: asset?.id,
      entries,
      details: [expected?.label, ...entries.map(entry => entry.signal.label)].filter(Boolean) as string[],
    }));
  });

  const propGroups = new Map<string, {
    name: string;
    entries: SemanticShotEntry<PropStateSignal>[];
  }>();
  shots.forEach((shot, shotIndex) => {
    (shot.props ?? []).forEach(prop => {
      const name = normalizeText(prop.propName);
      const signal = extractPropStateSignal(prop.propDescription);
      if (!name || !signal) return;
      const key = normalizeKey(name);
      const group = propGroups.get(key) ?? { name, entries: [] };
      group.entries.push({ shot, shotIndex, signal });
      propGroups.set(key, group);
    });
  });
  propGroups.forEach(group => {
    const asset = findProductionAssetByName(assets, 'prop', group.name);
    const expected = extractPropStateSignal(asset?.description);
    const conflicting = new Set<SemanticShotEntry<PropStateSignal>>();
    group.entries.forEach((entry, index) => {
      if (expected && propStateSignalsConflict(expected, entry.signal)) conflicting.add(entry);
      const candidate = group.entries[index + 1];
      if (candidate && candidate.shotIndex - entry.shotIndex <= 1) {
        if (!propStateSignalsConflict(entry.signal, candidate.signal)) return;
        conflicting.add(entry);
        conflicting.add(candidate);
      }
    });
    if (conflicting.size === 0) return;
    const entries = Array.from(conflicting);
    issues.push(createSemanticIssue({
      code: 'prop-state-conflict',
      kind: 'prop',
      name: group.name,
      assetId: asset?.id,
      entries,
      details: [expected?.label, ...entries.map(entry => entry.signal.label)].filter(Boolean) as string[],
    }));
  });

  const styleEntries = shots.map((shot, shotIndex) => {
    const signal = extractStyleSignal([
      shot.visualDescription,
      shot.imageGenerationPrompt,
      shot.videoMotionPrompt,
    ].map(normalizeText).filter(Boolean).join('，'));
    return signal ? { shot, shotIndex, signal } : null;
  }).filter((entry): entry is SemanticShotEntry<StyleSignal> => Boolean(entry));
  const conflictingStyleEntries = new Set<SemanticShotEntry<StyleSignal>>();
  styleEntries.forEach((entry, index) => {
    const candidate = styleEntries[index + 1];
    if (!candidate || !styleSignalsConflict(entry.signal, candidate.signal)) return;
    conflictingStyleEntries.add(entry);
    conflictingStyleEntries.add(candidate);
  });
  if (conflictingStyleEntries.size > 0) {
    const entries = Array.from(conflictingStyleEntries);
    issues.push(createSemanticIssue({
      code: 'style-conflict',
      kind: 'project',
      name: '全片画面风格',
      entries,
      details: entries.map(entry => entry.signal.label),
    }));
  }

  return issues;
}

/**
 * 在分镜生成前审计镜头引用的生产资产。
 *
 * 同一个资产可能出现在多个镜头中，问题按资产聚合，避免制作台为每个镜头重复显示一遍。
 * 缺失资产和草稿资产是会影响一致性的错误；已确认但没有参考图只是风险提示，仍允许继续生成。
 */
export function auditLinghuiProductionConsistency(
  shots: LinghuiStoryboardFrame[],
  assets: LinghuiProductionAsset[],
): LinghuiProductionConsistencyIssue[] {
  const issues = new Map<string, LinghuiProductionConsistencyIssue>();

  const addIssue = (issue: Omit<LinghuiProductionConsistencyIssue, 'shotIds' | 'shotLabels'>, shot: LinghuiStoryboardFrame, shotIndex: number) => {
    const shotId = normalizeText(shot.id);
    const shotNumber = shot.shotNumber ?? shotIndex + 1;
    const shotLabel = `#${shotNumber} ${normalizeText(shot.title) || '未命名镜头'}`;
    const key = `${issue.code}:${issue.assetId || `${issue.kind}:${normalizeKey(issue.name)}`}`;
    const existing = issues.get(key);
    if (existing) {
      if (shotId && !existing.shotIds.includes(shotId)) existing.shotIds.push(shotId);
      if (!existing.shotLabels.includes(shotLabel)) existing.shotLabels.push(shotLabel);
      return;
    }
    issues.set(key, {
      ...issue,
      shotIds: shotId ? [shotId] : [],
      shotLabels: [shotLabel],
    });
  };

  shots.forEach((shot, shotIndex) => {
    const projection = resolveLinghuiShotProductionAssetProjection(shot, assets);
    projection.missing.forEach(missing => addIssue({
      code: 'missing-asset',
      severity: 'error',
      kind: missing.kind,
      name: missing.name,
    }, shot, shotIndex));
    projection.references.forEach(({ asset }) => {
      const status = resolveLinghuiProductionAssetStatus(asset);
      if (status === 'draft') {
        addIssue({
          code: 'unapproved-asset',
          severity: 'error',
          kind: asset.kind,
          name: asset.name,
          assetId: asset.id,
        }, shot, shotIndex);
        return;
      }
      if (!normalizeText(asset.referenceImage)) {
        addIssue({
          code: 'missing-reference',
          severity: 'warning',
          kind: asset.kind,
          name: asset.name,
          assetId: asset.id,
        }, shot, shotIndex);
      }
    });
  });

  auditLinghuiProductionSemanticConsistency(shots, assets).forEach(issue => {
    const key = `${issue.code}:${issue.assetId || `${issue.kind}:${normalizeKey(issue.name)}`}`;
    issues.set(key, issue);
  });

  return Array.from(issues.values());
}

export function canEditLinghuiProductionAsset(
  asset: Pick<LinghuiProductionAsset, 'confirmed' | 'status'>,
): boolean {
  return resolveLinghuiProductionAssetStatus(asset) !== 'locked';
}

export function canDeleteLinghuiProductionAsset(
  asset: Pick<LinghuiProductionAsset, 'confirmed' | 'status'>,
): boolean {
  return canEditLinghuiProductionAsset(asset);
}

function normalizeReferenceVersion(
  value: unknown,
  index: number,
): LinghuiProductionAssetReferenceVersion | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<LinghuiProductionAssetReferenceVersion>;
  const source = normalizeText(record.source);
  if (!source) return null;
  return {
    id: normalizeText(record.id) || `reference-version-${index + 1}`,
    source,
    createdAt: Number.isFinite(Number(record.createdAt)) ? Number(record.createdAt) : 0,
    label: normalizeText(record.label) || undefined,
  };
}

/**
 * 读取资产参考图版本。旧工作区只有 referenceImage 时补一个稳定的兼容版本，
 * 但不主动改写数据，直到用户新增或切换版本。
 */
export function listLinghuiProductionAssetReferenceVersions(
  asset: LinghuiProductionAsset,
): LinghuiProductionAssetReferenceVersion[] {
  const versions = (Array.isArray(asset.referenceImageVersions) ? asset.referenceImageVersions : [])
    .map(normalizeReferenceVersion)
    .filter((version): version is LinghuiProductionAssetReferenceVersion => Boolean(version));
  const deduped = versions.filter((version, index, all) => all.findIndex(candidate => (
    candidate.id === version.id || candidate.source === version.source
  )) === index);
  const legacySource = normalizeText(asset.referenceImage);
  if (legacySource && !deduped.some(version => version.source === legacySource)) {
    deduped.unshift({
      id: `${asset.id}-legacy-reference`,
      source: legacySource,
      createdAt: 0,
      label: '现有参考图',
    });
  }
  return deduped;
}

export function resolveLinghuiProductionAssetCurrentReferenceVersion(
  asset: LinghuiProductionAsset,
): LinghuiProductionAssetReferenceVersion | undefined {
  const versions = listLinghuiProductionAssetReferenceVersions(asset);
  const currentId = normalizeText(asset.currentReferenceImageId);
  const currentSource = normalizeText(asset.referenceImage);
  return versions.find(version => currentId && version.id === currentId)
    ?? versions.find(version => currentSource && version.source === currentSource)
    ?? versions[versions.length - 1];
}

interface AddReferenceVersionOptions {
  id?: string;
  label?: string;
  createdAt?: number;
}

function areReferenceVersionsEqual(
  left: LinghuiProductionAssetReferenceVersion[] | undefined,
  right: LinghuiProductionAssetReferenceVersion[],
): boolean {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return left.every((version, index) => (
    version.id === right[index].id
    && version.source === right[index].source
    && version.createdAt === right[index].createdAt
    && version.label === right[index].label
  ));
}

/** 新增候选并采用为当前参考图；相同 source 已存在时只切换当前版本。 */
export function addLinghuiProductionAssetReferenceVersion(
  assets: LinghuiProductionAsset[],
  assetId: string,
  referenceImage: string,
  options: AddReferenceVersionOptions = {},
): LinghuiProductionAsset[] {
  const normalizedReference = normalizeText(referenceImage);
  if (!normalizedReference) return assets;
  return assets.map(asset => {
    if (asset.id !== assetId || !canEditLinghuiProductionAsset(asset)) return asset;
    const versions = listLinghuiProductionAssetReferenceVersions(asset);
    const existing = versions.find(version => version.source === normalizedReference);
    const createdAt = Number.isFinite(Number(options.createdAt)) ? Number(options.createdAt) : Date.now();
    const version = existing ?? {
      id: normalizeText(options.id) || `${asset.id}-reference-${createdAt}-${versions.length + 1}`,
      source: normalizedReference,
      createdAt,
      label: normalizeText(options.label) || undefined,
    };
    const nextVersions = existing ? versions : [...versions, version];
    if (
      asset.referenceImage === normalizedReference
      && asset.currentReferenceImageId === version.id
      && areReferenceVersionsEqual(asset.referenceImageVersions, nextVersions)
    ) return asset;
    return {
      ...asset,
      referenceImage: normalizedReference,
      currentReferenceImageId: version.id,
      referenceImageVersions: nextVersions,
    };
  });
}

export function selectLinghuiProductionAssetReferenceVersion(
  assets: LinghuiProductionAsset[],
  assetId: string,
  versionId: string,
): LinghuiProductionAsset[] {
  return assets.map(asset => {
    if (asset.id !== assetId || !canEditLinghuiProductionAsset(asset)) return asset;
    const versions = listLinghuiProductionAssetReferenceVersions(asset);
    const version = versions.find(candidate => candidate.id === versionId);
    if (!version) return asset;
    if (
      asset.referenceImage === version.source
      && asset.currentReferenceImageId === version.id
      && areReferenceVersionsEqual(asset.referenceImageVersions, versions)
    ) return asset;
    return {
      ...asset,
      referenceImage: version.source,
      currentReferenceImageId: version.id,
      referenceImageVersions: versions,
    };
  });
}

export function rollbackLinghuiProductionAssetReferenceVersion(
  assets: LinghuiProductionAsset[],
  assetId: string,
): LinghuiProductionAsset[] {
  const asset = assets.find(candidate => candidate.id === assetId);
  if (!asset || !canEditLinghuiProductionAsset(asset)) return assets;
  const versions = listLinghuiProductionAssetReferenceVersions(asset);
  const current = resolveLinghuiProductionAssetCurrentReferenceVersion(asset);
  const currentIndex = current ? versions.findIndex(version => version.id === current.id) : -1;
  if (currentIndex <= 0) return assets;
  return selectLinghuiProductionAssetReferenceVersion(assets, assetId, versions[currentIndex - 1].id);
}

export function updateLinghuiProductionAssetReference(
  assets: LinghuiProductionAsset[],
  assetId: string,
  referenceImage?: string,
): LinghuiProductionAsset[] {
  const normalizedReference = normalizeText(referenceImage) || undefined;
  if (normalizedReference) {
    return addLinghuiProductionAssetReferenceVersion(assets, assetId, normalizedReference);
  }
  return assets.map(asset => {
    if (asset.id !== assetId || !canEditLinghuiProductionAsset(asset)) return asset;
    if (asset.referenceImage === normalizedReference) return asset;
    return { ...asset, referenceImage: normalizedReference, currentReferenceImageId: undefined };
  });
}

export function findLinghuiProductionAssetDuplicateCandidates(
  assets: LinghuiProductionAsset[],
): LinghuiProductionAssetDuplicateCandidate[] {
  const candidates: LinghuiProductionAssetDuplicateCandidate[] = [];
  for (let leftIndex = 0; leftIndex < assets.length; leftIndex += 1) {
    const left = assets[leftIndex];
    const leftNameKey = normalizeKey(normalizeText(left.name));
    const leftKeys = getProductionAssetIdentityKeys(left);
    for (let rightIndex = leftIndex + 1; rightIndex < assets.length; rightIndex += 1) {
      const right = assets[rightIndex];
      if (left.kind !== right.kind) continue;
      const rightNameKey = normalizeKey(normalizeText(right.name));
      const rightKeys = getProductionAssetIdentityKeys(right);
      const sharedKeys = [...leftKeys].filter(key => rightKeys.has(key));
      if (sharedKeys.length === 0) continue;
      const sameName = Boolean(leftNameKey && leftNameKey === rightNameKey);
      candidates.push({
        id: [left.id, right.id].sort().join('::'),
        kind: left.kind,
        leftAssetId: left.id,
        rightAssetId: right.id,
        reason: sameName ? 'same-name' : 'alias-match',
        detail: sameName
          ? `名称规范化后相同：${left.name} / ${right.name}`
          : `名称或别名重合：${left.name} / ${right.name}`,
      });
    }
  }
  return candidates;
}

export function canMergeLinghuiProductionAssets(
  primary: LinghuiProductionAsset,
  duplicate: LinghuiProductionAsset,
): boolean {
  if (primary.id === duplicate.id || primary.kind !== duplicate.kind) return false;
  if (resolveLinghuiProductionAssetStatus(duplicate) === 'locked') return false;
  return true;
}

function mergeProductionAssetDescriptions(primary: string, duplicate: string): string {
  const first = normalizeText(primary);
  const second = normalizeText(duplicate);
  if (!first) return second;
  if (!second || normalizeKey(first) === normalizeKey(second)) return first;
  return `${first}\n${second}`;
}

export function mergeLinghuiProductionAssets(
  assets: LinghuiProductionAsset[],
  primaryAssetId: string,
  duplicateAssetId: string,
): LinghuiProductionAsset[] {
  const primary = assets.find(asset => asset.id === primaryAssetId);
  const duplicate = assets.find(asset => asset.id === duplicateAssetId);
  if (!primary || !duplicate || !canMergeLinghuiProductionAssets(primary, duplicate)) return assets;

  const primaryVersions = listLinghuiProductionAssetReferenceVersions(primary);
  const duplicateVersions = listLinghuiProductionAssetReferenceVersions(duplicate);
  const versions = [...primaryVersions];
  const versionSources = new Set(versions.map(version => version.source));
  duplicateVersions.forEach(version => {
    if (versionSources.has(version.source)) return;
    versionSources.add(version.source);
    versions.push(version);
  });
  const currentVersion = resolveLinghuiProductionAssetCurrentReferenceVersion(primary)
    ?? resolveLinghuiProductionAssetCurrentReferenceVersion(duplicate)
    ?? versions[0];
  const primaryStatus = resolveLinghuiProductionAssetStatus(primary);
  const duplicateStatus = resolveLinghuiProductionAssetStatus(duplicate);
  const nextStatus: LinghuiProductionAssetStatus = primaryStatus === 'locked'
    ? 'locked'
    : primaryStatus === 'approved' || duplicateStatus === 'approved'
      ? 'approved'
      : 'draft';
  const primaryNameKey = normalizeKey(primary.name);
  const aliases = normalizeStringList([
    ...normalizeStringList(primary.aliases),
    duplicate.name,
    ...normalizeStringList(duplicate.aliases),
  ]).filter(alias => normalizeKey(alias) !== primaryNameKey);
  const mergedAssetIds = normalizeStringList([
    ...normalizeStringList(primary.mergedAssetIds),
    duplicate.id,
    ...normalizeStringList(duplicate.mergedAssetIds),
  ]).filter(id => id !== primary.id);
  const merged: LinghuiProductionAsset = {
    ...primary,
    description: mergeProductionAssetDescriptions(primary.description, duplicate.description),
    sourceShotIds: Array.from(new Set([
      ...primary.sourceShotIds,
      ...duplicate.sourceShotIds,
    ].map(normalizeText).filter(Boolean))),
    aliases,
    mergedAssetIds,
    referenceImage: currentVersion?.source,
    currentReferenceImageId: currentVersion?.id,
    referenceImageVersions: versions.length > 0 ? versions : undefined,
    confirmed: nextStatus !== 'draft',
    status: nextStatus,
  };

  return assets.flatMap(asset => {
    if (asset.id === primary.id) return [merged];
    if (asset.id === duplicate.id) return [];
    return [asset];
  });
}

function addCandidate(
  candidates: Map<string, AssetCandidate>,
  candidate: AssetCandidate,
) {
  const name = normalizeText(candidate.name);
  if (!name) return;
  const key = `${candidate.kind}:${normalizeKey(name)}`;
  const existing = candidates.get(key);
  if (existing) {
    existing.shotIds = Array.from(new Set([...existing.shotIds, ...candidate.shotIds].filter(Boolean)));
    if (!existing.description && candidate.description) existing.description = candidate.description;
    if (!existing.referenceImage && candidate.referenceImage) existing.referenceImage = candidate.referenceImage;
    return;
  }
  candidates.set(key, { ...candidate, name });
}

export function extractLinghuiProductionAssets(
  shots: LinghuiStoryboardFrame[],
  existingAssets: LinghuiProductionAsset[] = [],
): LinghuiProductionAsset[] {
  const candidates = new Map<string, AssetCandidate>();

  for (const shot of shots) {
    const shotId = normalizeText(shot.id);
    for (const character of shot.characters ?? []) {
      addCandidate(candidates, {
        kind: 'character',
        name: normalizeText(character.characterName) || normalizeText(character.characterDescription),
        description: normalizeText(character.characterDescription),
        shotIds: shotId ? [shotId] : [],
        referenceImage: normalizeText(character.characterImageUrl) || undefined,
      });
    }
    for (const scene of shot.scenes ?? []) {
      addCandidate(candidates, {
        kind: 'scene',
        name: normalizeText(scene.sceneName) || normalizeText(scene.sceneDescription),
        description: normalizeText(scene.sceneDescription),
        shotIds: shotId ? [shotId] : [],
        referenceImage: normalizeText(scene.sceneImageUrl) || undefined,
      });
    }
    const sceneTags = normalizeText(shot.sceneTags);
    if (sceneTags && !(shot.scenes?.length)) {
      addCandidate(candidates, {
        kind: 'scene',
        name: sceneTags,
        description: normalizeText(shot.visualDescription) || normalizeText(shot.description),
        shotIds: shotId ? [shotId] : [],
      });
    }
    for (const prop of shot.props ?? []) {
      addCandidate(candidates, {
        kind: 'prop',
        name: normalizeText(prop.propName) || normalizeText(prop.propDescription),
        description: normalizeText(prop.propDescription),
        shotIds: shotId ? [shotId] : [],
        referenceImage: normalizeText(prop.propImageUrl) || undefined,
      });
    }
  }

  const existingByKey = new Map<string, LinghuiProductionAsset>();
  existingAssets.forEach(asset => {
    getProductionAssetIdentityKeys(asset).forEach(identityKey => {
      existingByKey.set(`${asset.kind}:${identityKey}`, asset);
    });
  });
  const matchedExistingIds = new Set<string>();
  const next: LinghuiProductionAsset[] = [...candidates.entries()].map(([key, candidate], index) => {
    const previous = existingByKey.get(key);
    if (previous) matchedExistingIds.add(previous.id);
    if (previous && resolveLinghuiProductionAssetStatus(previous) === 'locked') {
      return previous;
    }
    return {
      id: previous?.id || `production-${candidate.kind}-${index + 1}`,
      kind: candidate.kind,
      name: previous?.name || candidate.name,
      description: previous?.description || candidate.description,
      sourceShotIds: Array.from(new Set([
        ...(previous?.sourceShotIds ?? []),
        ...candidate.shotIds,
      ].filter(Boolean))),
      referenceImage: previous?.referenceImage || candidate.referenceImage,
      referenceImageVersions: previous?.referenceImageVersions,
      currentReferenceImageId: previous?.currentReferenceImageId,
      aliases: previous?.aliases,
      mergedAssetIds: previous?.mergedAssetIds,
      confirmed: previous ? isLinghuiProductionAssetConfirmed(previous) : false,
      status: previous ? resolveLinghuiProductionAssetStatus(previous) : 'draft',
    } satisfies LinghuiProductionAsset;
  });

  // 保留用户已经确认但本轮模型没有重新输出的资产，避免重跑剧本误删手工修订。
  for (const previous of existingAssets) {
    if (!isLinghuiProductionAssetConfirmed(previous)) continue;
    if (!matchedExistingIds.has(previous.id)) next.push(previous);
  }

  return next;
}

export function buildLinghuiProductionAssetFrames(
  assets: LinghuiProductionAsset[],
): LinghuiStoryboardFrame[] {
  return assets
    .filter(asset => isLinghuiProductionAssetConfirmed(asset) && normalizeText(asset.name))
    .map((asset, index) => {
      const kindLabel = asset.kind === 'character' ? '角色' : asset.kind === 'scene' ? '场景' : '道具';
      const description = normalizeText(asset.description) || `${asset.name}的视觉设定参考`;
      const prompt = `${kindLabel}资产设定图：${asset.name}。${description}。保持设计一致、轮廓清晰、适合作为后续分镜参考。`;
      return {
        id: `production-asset-shot-${asset.id}`,
        title: `${kindLabel} · ${asset.name}`,
        description,
        durationSec: 10,
        image: asset.referenceImage
          ? { kind: 'image' as const, source: asset.referenceImage, label: asset.name }
          : undefined,
        imageGenerationPrompt: prompt,
        plotDescription: description,
        visualDescription: prompt,
        productionAsset: {
          id: asset.id,
          kind: asset.kind,
          name: asset.name,
        },
        shotNumber: index + 1,
      } satisfies LinghuiStoryboardFrame;
    });
}

export function countLinghuiProductionAssetsByKind(assets: LinghuiProductionAsset[]) {
  return {
    character: assets.filter(asset => asset.kind === 'character').length,
    scene: assets.filter(asset => asset.kind === 'scene').length,
    prop: assets.filter(asset => asset.kind === 'prop').length,
  };
}
