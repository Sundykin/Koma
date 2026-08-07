import { describe, expect, it } from 'vitest';
import type { LinghuiStoryboardFrame } from '../../../../types/linghui';
import {
  addLinghuiProductionAssetReferenceVersion,
  buildLinghuiProductionAssetFrames,
  auditLinghuiProductionConsistency,
  auditLinghuiProductionSemanticConsistency,
  canEditLinghuiProductionAsset,
  extractLinghuiProductionAssets,
  listLinghuiProductionAssetReferenceVersions,
  resolveLinghuiProductionAssetCurrentReferenceVersion,
  resolveLinghuiProductionAssetStatus,
  resolveLinghuiProductionAssetAffectedShots,
  resolveLinghuiShotProductionAssetProjection,
  rollbackLinghuiProductionAssetReferenceVersion,
  selectLinghuiProductionAssetReferenceVersion,
  updateLinghuiProductionAssetReference,
} from '../state/linghuiProductionAssets';

describe('linghuiProductionAssets', () => {
  it('从分镜归并角色、场景和道具并保留来源镜头', () => {
    const shots: LinghuiStoryboardFrame[] = [
      {
        id: 'shot-1',
        title: '抵达',
        description: '阿澈抵达雨夜车站。',
        durationSec: 10,
        characters: [{ characterName: '阿澈', characterDescription: '黑色风衣，银色耳钉' }],
        scenes: [{ sceneName: '雨夜车站', sceneDescription: '湿润月台，冷色灯光' }],
        props: [{ propName: '半枚硬币', propDescription: '旧银币，边缘有缺口' }],
      },
      {
        id: 'shot-2',
        title: '交换',
        description: '阿澈接过半枚硬币。',
        durationSec: 10,
        characters: [{ characterName: '阿澈', characterDescription: '黑色风衣' }],
        props: [{ propName: '半枚硬币', propDescription: '旧银币' }],
      },
    ];

    const assets = extractLinghuiProductionAssets(shots);

    expect(assets).toHaveLength(3);
    expect(assets.find(asset => asset.name === '阿澈')).toMatchObject({
      kind: 'character',
      sourceShotIds: ['shot-1', 'shot-2'],
      confirmed: false,
    });
    expect(assets.find(asset => asset.name === '雨夜车站')?.kind).toBe('scene');
    expect(assets.find(asset => asset.name === '半枚硬币')?.kind).toBe('prop');
  });

  it('把已确认资产映射为可直接运行的图片节点 frame', () => {
    const frames = buildLinghuiProductionAssetFrames([
      {
        id: 'character-a-che',
        kind: 'character',
        name: '阿澈',
        description: '黑色风衣，银色耳钉',
        sourceShotIds: ['shot-1'],
        confirmed: true,
      },
      {
        id: 'draft-scene',
        kind: 'scene',
        name: '雨夜车站',
        description: '',
        sourceShotIds: ['shot-1'],
        confirmed: false,
      },
    ]);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      title: '角色 · 阿澈',
      productionAsset: {
        id: 'character-a-che',
        kind: 'character',
        name: '阿澈',
      },
    });
    expect(frames[0].imageGenerationPrompt).toContain('角色资产设定图：阿澈');
  });

  it('兼容旧 confirmed 数据并阻止锁定资产被重新提取覆盖', () => {
    const locked = {
      id: 'character-a-che',
      kind: 'character' as const,
      name: '阿澈',
      description: '已批准的角色设定',
      sourceShotIds: ['shot-1'],
      referenceImage: 'asset://locked-reference.png',
      confirmed: true,
      status: 'locked' as const,
    };
    const extracted = extractLinghuiProductionAssets([
      {
        id: 'shot-1',
        title: '更新',
        description: '阿澈出现',
        durationSec: 10,
        characters: [{ characterName: '阿澈', characterDescription: '模型新描述' }],
      },
    ], [locked]);

    expect(resolveLinghuiProductionAssetStatus({ confirmed: true })).toBe('approved');
    expect(extracted).toContainEqual(locked);
    expect(canEditLinghuiProductionAsset(locked)).toBe(false);
  });

  it('只允许未锁定资产回写参考图', () => {
    const assets = [{
      id: 'character-1',
      kind: 'character' as const,
      name: '林夏',
      description: '侦探',
      sourceShotIds: [],
      confirmed: true,
      status: 'approved' as const,
    }, {
      id: 'character-2',
      kind: 'character' as const,
      name: '锁定角色',
      description: '不可覆盖',
      sourceShotIds: [],
      referenceImage: 'old.png',
      confirmed: true,
      status: 'locked' as const,
    }];

    const next = updateLinghuiProductionAssetReference(assets, 'character-1', 'new.png');
    expect(next[0].referenceImage).toBe('new.png');
    expect(updateLinghuiProductionAssetReference(next, 'character-2', 'overwrite.png')[1].referenceImage)
      .toBe('old.png');
  });

  it('兼容旧单图资产，并支持新增、切换和回退参考图版本', () => {
    const assets = [{
      id: 'character-1',
      kind: 'character' as const,
      name: '林夏',
      description: '青年侦探',
      sourceShotIds: ['shot-1'],
      referenceImage: 'old.png',
      confirmed: true,
      status: 'approved' as const,
    }];

    expect(listLinghuiProductionAssetReferenceVersions(assets[0])).toEqual([
      expect.objectContaining({ id: 'character-1-legacy-reference', source: 'old.png' }),
    ]);

    const withCandidate = addLinghuiProductionAssetReferenceVersion(
      assets,
      'character-1',
      'new.png',
      { id: 'version-2', label: '生成结果 2', createdAt: 200 },
    );
    expect(withCandidate[0]).toMatchObject({
      referenceImage: 'new.png',
      currentReferenceImageId: 'version-2',
    });
    expect(withCandidate[0].referenceImageVersions).toHaveLength(2);
    expect(resolveLinghuiProductionAssetCurrentReferenceVersion(withCandidate[0]))
      .toMatchObject({ id: 'version-2', source: 'new.png' });
    expect(addLinghuiProductionAssetReferenceVersion(withCandidate, 'character-1', 'new.png')[0])
      .toBe(withCandidate[0]);

    const rolledBack = rollbackLinghuiProductionAssetReferenceVersion(withCandidate, 'character-1');
    expect(rolledBack[0]).toMatchObject({
      referenceImage: 'old.png',
      currentReferenceImageId: 'character-1-legacy-reference',
    });

    const selectedAgain = selectLinghuiProductionAssetReferenceVersion(
      rolledBack,
      'character-1',
      'version-2',
    );
    expect(selectedAgain[0].referenceImage).toBe('new.png');
  });

  it('重新提取会保留参考图版本，锁定资产不能切换或追加版本', () => {
    const versionedAsset = {
      id: 'character-1',
      kind: 'character' as const,
      name: '林夏',
      description: '青年侦探',
      sourceShotIds: ['shot-1'],
      referenceImage: 'new.png',
      currentReferenceImageId: 'version-2',
      referenceImageVersions: [
        { id: 'version-1', source: 'old.png', createdAt: 100 },
        { id: 'version-2', source: 'new.png', createdAt: 200 },
      ],
      confirmed: true,
      status: 'approved' as const,
    };
    const extracted = extractLinghuiProductionAssets([{
      id: 'shot-1',
      title: '抵达',
      description: '林夏抵达',
      durationSec: 5,
      characters: [{ characterName: '林夏' }],
    }], [versionedAsset]);
    expect(extracted[0]).toMatchObject({
      currentReferenceImageId: 'version-2',
      referenceImageVersions: versionedAsset.referenceImageVersions,
    });

    const locked = [{ ...versionedAsset, status: 'locked' as const }];
    expect(addLinghuiProductionAssetReferenceVersion(locked, 'character-1', 'third.png')[0])
      .toBe(locked[0]);
    expect(selectLinghuiProductionAssetReferenceVersion(locked, 'character-1', 'version-1')[0])
      .toBe(locked[0]);
  });

  it('优先按来源镜头追踪资产，改名后仍保留关系，并为旧数据回退名称匹配', () => {
    const shot: LinghuiStoryboardFrame = {
      id: 'shot-1',
      title: '抵达',
      description: '阿澈抵达车站',
      durationSec: 6,
      characters: [{ characterName: '阿澈' }],
      scenes: [{ sceneName: '雨夜车站' }],
      props: [{ propName: '半枚硬币' }],
    };
    const assets = [
      {
        id: 'character-1', kind: 'character' as const, name: '阿澈（锁定造型）', description: '',
        sourceShotIds: ['shot-1'], confirmed: true, status: 'locked' as const,
      },
      {
        id: 'scene-1', kind: 'scene' as const, name: '雨夜车站', description: '',
        sourceShotIds: [], confirmed: true,
      },
    ];

    const projection = resolveLinghuiShotProductionAssetProjection(shot, assets);

    expect(projection.references).toEqual([
      expect.objectContaining({ asset: expect.objectContaining({ id: 'character-1' }), match: 'source-shot' }),
      expect.objectContaining({ asset: expect.objectContaining({ id: 'scene-1' }), match: 'name' }),
    ]);
    expect(projection.missing).toEqual([{ kind: 'prop', name: '半枚硬币' }]);
  });

  it('可以根据同一投影给删除前列出受影响镜头', () => {
    const asset = {
      id: 'character-1', kind: 'character' as const, name: '阿澈', description: '',
      sourceShotIds: ['shot-1'], confirmed: true,
    };
    const shots: LinghuiStoryboardFrame[] = [
      { id: 'shot-1', title: '抵达', description: '', durationSec: 4 },
      { id: 'shot-2', title: '离开', description: '', durationSec: 4, characters: [{ characterName: '阿澈' }] },
    ];

    expect(resolveLinghuiProductionAssetAffectedShots(asset, shots).map(shot => shot.id))
      .toEqual(['shot-1', 'shot-2']);
  });

  it('按资产聚合缺失、未确认和缺参考图问题，并列出受影响镜头', () => {
    const shots: LinghuiStoryboardFrame[] = [
      {
        id: 'shot-1',
        title: '抵达',
        description: '阿澈抵达车站',
        durationSec: 6,
        characters: [{ characterName: '阿澈' }],
        scenes: [{ sceneName: '雨夜车站' }],
        props: [{ propName: '半枚硬币' }],
      },
      {
        id: 'shot-2',
        title: '交换',
        description: '阿澈交换硬币',
        durationSec: 6,
        characters: [{ characterName: '阿澈' }],
        scenes: [{ sceneName: '雨夜车站' }],
        props: [{ propName: '半枚硬币' }],
      },
    ];
    const issues = auditLinghuiProductionConsistency(shots, [
      {
        id: 'character-1',
        kind: 'character',
        name: '阿澈',
        description: '',
        sourceShotIds: ['shot-1', 'shot-2'],
        confirmed: false,
        status: 'draft',
      },
      {
        id: 'scene-1',
        kind: 'scene',
        name: '雨夜车站',
        description: '',
        sourceShotIds: [],
        confirmed: true,
        status: 'approved',
      },
    ]);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'unapproved-asset',
        assetId: 'character-1',
        shotIds: ['shot-1', 'shot-2'],
        shotLabels: ['#1 抵达', '#2 交换'],
      }),
      expect.objectContaining({
        code: 'missing-reference',
        assetId: 'scene-1',
        shotIds: ['shot-1', 'shot-2'],
      }),
      expect.objectContaining({
        code: 'missing-asset',
        kind: 'prop',
        name: '半枚硬币',
        shotIds: ['shot-1', 'shot-2'],
      }),
    ]));
    expect(issues).toHaveLength(3);
  });

  it('完整确认且有参考图时可以直接生成分镜', () => {
    const shots: LinghuiStoryboardFrame[] = [{
      id: 'shot-1',
      title: '抵达',
      description: '',
      durationSec: 5,
      characters: [{ characterName: '阿澈' }],
    }];
    expect(auditLinghuiProductionConsistency(shots, [{
      id: 'character-1',
      kind: 'character',
      name: '阿澈',
      description: '',
      sourceShotIds: ['shot-1'],
      referenceImage: 'asset://a-che.png',
      confirmed: true,
      status: 'approved',
    }])).toEqual([]);
  });

  it('只在有明确证据时聚合服装、时段、道具状态和画面风格冲突', () => {
    const shots: LinghuiStoryboardFrame[] = [
      {
        id: 'shot-1',
        title: '清晨抵达',
        description: '林夏抵达车站',
        durationSec: 5,
        characters: [{ characterName: '林夏', characterDescription: '黑色风衣' }],
        scenes: [{ sceneName: '中央车站', sceneDescription: '清晨的空旷月台' }],
        props: [{ propName: '怀表', propDescription: '表盖完好，指针走动' }],
        imageGenerationPrompt: '写实摄影质感，电影构图',
      },
      {
        id: 'shot-2',
        title: '深夜追逐',
        description: '林夏穿过车站',
        durationSec: 5,
        characters: [{ characterName: '林夏', characterDescription: '红色校服' }],
        scenes: [{ sceneName: '中央车站', sceneDescription: '深夜的空旷月台' }],
        props: [{ propName: '怀表', propDescription: '表盖破碎，指针停住' }],
        imageGenerationPrompt: '赛璐璐动漫风格，夸张速度线',
      },
    ];
    const assets = [
      { id: 'character-1', kind: 'character' as const, name: '林夏', description: '青年侦探', sourceShotIds: ['shot-1', 'shot-2'], referenceImage: 'character.png', confirmed: true, status: 'approved' as const },
      { id: 'scene-1', kind: 'scene' as const, name: '中央车站', description: '大型交通枢纽', sourceShotIds: ['shot-1', 'shot-2'], referenceImage: 'scene.png', confirmed: true, status: 'approved' as const },
      { id: 'prop-1', kind: 'prop' as const, name: '怀表', description: '旧式黄铜怀表', sourceShotIds: ['shot-1', 'shot-2'], referenceImage: 'prop.png', confirmed: true, status: 'approved' as const },
    ];

    const issues = auditLinghuiProductionSemanticConsistency(shots, assets);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'character-clothing-conflict',
        assetId: 'character-1',
        shotIds: ['shot-1', 'shot-2'],
        detail: '黑色 + 风衣 / 红色 + 制服',
      }),
      expect.objectContaining({
        code: 'scene-time-conflict',
        assetId: 'scene-1',
        shotIds: ['shot-1', 'shot-2'],
        detail: '清晨 / 夜晚',
      }),
      expect.objectContaining({
        code: 'prop-state-conflict',
        assetId: 'prop-1',
        shotIds: ['shot-1', 'shot-2'],
        detail: '完好 / 破损',
      }),
      expect.objectContaining({
        code: 'style-conflict',
        kind: 'project',
        shotIds: ['shot-1', 'shot-2'],
        detail: '写实摄影 / 二次元动画',
      }),
    ]));
    expect(issues).toHaveLength(4);
  });

  it('服装颜色省略、同一时段、未描述道具状态和共享风格不会误报', () => {
    const shots: LinghuiStoryboardFrame[] = [
      {
        id: 'shot-1', title: '跟拍', description: '', durationSec: 4,
        characters: [{ characterName: '林夏', characterDescription: '黑色风衣' }],
        scenes: [{ sceneName: '车站', sceneDescription: '夜晚月台' }],
        props: [{ propName: '怀表', propDescription: '表盖完好' }],
        imageGenerationPrompt: '水彩质感的二次元动漫画面',
      },
      {
        id: 'shot-2', title: '特写', description: '', durationSec: 4,
        characters: [{ characterName: '林夏', characterDescription: '风衣' }],
        scenes: [{ sceneName: '车站', sceneDescription: '深夜月台' }],
        props: [{ propName: '怀表', propDescription: '黄铜表盘特写' }],
        imageGenerationPrompt: '二次元动漫画面',
      },
    ];

    expect(auditLinghuiProductionSemanticConsistency(shots, [])).toEqual([]);
  });
});
