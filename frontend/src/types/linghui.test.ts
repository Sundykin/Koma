import { describe, expect, it } from 'vitest';
import type {
  LinghuiImageNodeProperties,
  LinghuiNodeResult,
  LinghuiTextNodeProperties,
  LinghuiVideoNodeProperties,
} from './linghui';
import {
  buildLinghuiImageCinematicPromptFragment,
  getLinghuiResultItemCount,
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
  getLinghuiResultShots,
  getLinghuiResultText,
  linghuiTypeToRFType,
  normalizeLinghuiImageCinematicConfig,
  resolveLinghuiImageNodeViewState,
  resolveLinghuiTextNodeViewState,
  resolveLinghuiVideoNodeViewState,
  rfTypeToLinghuiType,
} from './linghui';

describe('linghui type mapping', () => {
  it('uses explicit known mappings in both directions', () => {
    expect(linghuiTypeToRFType('linghui/video')).toBe('linghui-video');
    expect(linghuiTypeToRFType('linghui/script')).toBe('linghui-script');
    expect(linghuiTypeToRFType('linghui/panorama')).toBe('linghui-panorama');
    expect(linghuiTypeToRFType('linghui/director3d')).toBe('linghui-director3d');
    expect(rfTypeToLinghuiType('linghui-audio')).toBe('linghui/audio');
    expect(rfTypeToLinghuiType('linghui-text')).toBe('linghui/text');
    expect(rfTypeToLinghuiType('linghui-panorama')).toBe('linghui/panorama');
    expect(rfTypeToLinghuiType('linghui-director3d')).toBe('linghui/director3d');
  });

  it('returns a stable fallback for unknown rf node types', () => {
    expect(rfTypeToLinghuiType('linghui-video-extra')).toBe('linghui/text');
    expect(rfTypeToLinghuiType('custom-node')).toBe('linghui/text');
  });
});

describe('linghui result helpers', () => {
  const imageResult = {
    kind: 'image',
    primary: {
      kind: 'image',
      source: 'https://cdn.example.com/cover.png',
      width: 1280,
      height: 720,
    },
  } satisfies LinghuiNodeResult;

  const imageCollectionResult = {
    kind: 'images',
    primary: {
      kind: 'image',
      source: 'https://cdn.example.com/primary.png',
      label: '主图',
    },
    items: [
      {
        kind: 'image',
        source: 'https://cdn.example.com/primary.png',
        label: '主图',
      },
      {
        kind: 'image',
        source: 'https://cdn.example.com/detail.png',
        label: '细节',
      },
    ],
  } satisfies LinghuiNodeResult;

  const storyboardResult = {
    kind: 'storyboard',
    text: '1. 建立镜头\n2. 特写镜头',
    primary: {
      kind: 'image',
      source: 'https://cdn.example.com/storyboard-cover.png',
    },
    shots: [
      {
        id: 'shot-1',
        title: '建立镜头',
        description: '展示城市夜景',
        durationSec: 4,
      },
      {
        id: 'shot-2',
        title: '特写镜头',
        description: '人物抬头望向远处',
        durationSec: 3,
      },
    ],
  } satisfies LinghuiNodeResult;

  const audioResult = {
    kind: 'audio',
    primary: {
      kind: 'audio',
      source: 'https://cdn.example.com/voice.mp3',
      durationSec: 12,
    },
    text: '欢迎来到灵绘工作流',
  } satisfies LinghuiNodeResult;

  it('returns primary media for media and storyboard results', () => {
    expect(getLinghuiResultPrimaryMedia(imageResult)).toEqual(imageResult.primary);
    expect(getLinghuiResultPrimaryMedia(imageCollectionResult)).toEqual(imageCollectionResult.primary);
    expect(getLinghuiResultPrimaryMedia(storyboardResult)).toEqual(storyboardResult.primary);
    expect(getLinghuiResultPrimaryMedia({ kind: 'text', text: '纯文本结果' })).toBeUndefined();
  });

  it('returns items and item counts only for image collections', () => {
    expect(getLinghuiResultItems(imageCollectionResult)).toEqual(imageCollectionResult.items);
    expect(getLinghuiResultItemCount(imageCollectionResult)).toBe(2);
    expect(getLinghuiResultItems(imageResult)).toEqual([]);
    expect(getLinghuiResultItemCount(imageResult)).toBe(0);
  });

  it('returns storyboard shots only for storyboard results', () => {
    expect(getLinghuiResultShots(storyboardResult)).toEqual(storyboardResult.shots);
    expect(getLinghuiResultShots(imageCollectionResult)).toEqual([]);
  });

  it('returns text for text, storyboard, and audio results', () => {
    expect(getLinghuiResultText({ kind: 'text', text: '文案' })).toBe('文案');
    expect(getLinghuiResultText(storyboardResult)).toBe(storyboardResult.text);
    expect(getLinghuiResultText(audioResult)).toBe(audioResult.text);
    expect(getLinghuiResultText(imageResult)).toBeUndefined();
  });
});

describe('linghui cinematic config', () => {
  it('falls back to auto on unknown or missing values', () => {
    expect(normalizeLinghuiImageCinematicConfig(undefined)).toEqual({
      lighting: 'auto',
      focalLength: 'auto',
      aperture: 'auto',
    });
    expect(normalizeLinghuiImageCinematicConfig({
      lighting: 'unknown' as never,
      focalLength: 'nope' as never,
      aperture: 'xyz' as never,
    })).toEqual({
      lighting: 'auto',
      focalLength: 'auto',
      aperture: 'auto',
    });
  });

  it('returns empty fragment when everything is auto', () => {
    expect(buildLinghuiImageCinematicPromptFragment(undefined)).toBe('');
    expect(buildLinghuiImageCinematicPromptFragment({})).toBe('');
  });

  it('builds english fragment for non-default cinematic values', () => {
    const fragment = buildLinghuiImageCinematicPromptFragment({
      lighting: 'rembrandt',
      focalLength: 'portrait-85mm',
      aperture: 'shallow-f14',
    });
    expect(fragment).toContain('rembrandt');
    expect(fragment).toContain('85mm');
    expect(fragment.toLowerCase()).toContain('f/1.4');
  });
});

describe('resolveLinghuiTextNodeViewState (对齐 LibTV 15gvxu:55066-55074)', () => {
  const baseProps: LinghuiTextNodeProperties = {
    mode: 'generate',
    content: '',
    prompt: '',
    systemPrompt: '',
    llmSelection: '',
  };

  it('running 任务 → generating（最高优先级）', () => {
    expect(resolveLinghuiTextNodeViewState({
      properties: { ...baseProps, mode: 'manual', content: '一段已有文本' },
      runStatus: 'running',
      hasIncomingEdge: false,
    })).toBe('generating');
  });

  it('failed 任务 → failed', () => {
    expect(resolveLinghuiTextNodeViewState({
      properties: { ...baseProps, content: '已生成' },
      runStatus: 'failed',
      hasIncomingEdge: false,
    })).toBe('failed');
  });

  it('manual 模式即使无 content 也走 resource（对齐 LibTV TEXT_RESOURCE 始终是 resource）', () => {
    expect(resolveLinghuiTextNodeViewState({
      properties: { ...baseProps, mode: 'manual' },
      hasIncomingEdge: false,
    })).toBe('resource');
  });

  it('generate 模式 + 已有 content → resource', () => {
    expect(resolveLinghuiTextNodeViewState({
      properties: { ...baseProps, content: '已生成结果' },
      hasIncomingEdge: false,
    })).toBe('resource');
  });

  it('generate 模式 + 上游已连入但还无 content → pending', () => {
    expect(resolveLinghuiTextNodeViewState({
      properties: baseProps,
      hasIncomingEdge: true,
    })).toBe('pending');
  });

  it('generate 模式 + 无 content + 无上游 → empty_generate（显示 4 actions）', () => {
    expect(resolveLinghuiTextNodeViewState({
      properties: baseProps,
      hasIncomingEdge: false,
    })).toBe('empty_generate');
  });

  it('result 文本也算 resource（运行成功 result 有 text 但 properties.content 暂未回写）', () => {
    expect(resolveLinghuiTextNodeViewState({
      properties: baseProps,
      result: { kind: 'text', text: 'LLM 生成结果' } as unknown as LinghuiNodeResult,
      hasIncomingEdge: false,
    })).toBe('resource');
  });
});

describe('resolveLinghuiVideoNodeViewState (对齐 LibTV 15gvxu:191642-191652)', () => {
  const baseProps: LinghuiVideoNodeProperties = {
    prompt: '',
    itvSelection: '',
    source: '',
    posterSource: '',
    videoCapability: 'video.text-to-video',
    aspectRatio: '16:9',
    resolution: '720p',
    duration: 5,
    mode: 'generate',
  };

  it('running 任务 → generating（最高优先级，即使有 source）', () => {
    expect(resolveLinghuiVideoNodeViewState({
      properties: { ...baseProps, source: 'https://cdn.example.com/v.mp4' },
      runStatus: 'running',
      hasIncomingEdge: false,
    })).toBe('generating');
  });

  it('failed 任务 → failed', () => {
    expect(resolveLinghuiVideoNodeViewState({
      properties: { ...baseProps, source: 'https://cdn.example.com/v.mp4' },
      runStatus: 'failed',
      hasIncomingEdge: false,
    })).toBe('failed');
  });

  it('import 模式即使无 source 也走 resource（对齐 LibTV VIDEO_RESOURCE）', () => {
    expect(resolveLinghuiVideoNodeViewState({
      properties: { ...baseProps, mode: 'import' },
      hasIncomingEdge: false,
    })).toBe('resource');
  });

  it('generate 模式 + 已有 source → resource', () => {
    expect(resolveLinghuiVideoNodeViewState({
      properties: { ...baseProps, source: 'https://cdn.example.com/v.mp4' },
      hasIncomingEdge: false,
    })).toBe('resource');
  });

  it('generate 模式 + 上游已连入但无 source → pending', () => {
    expect(resolveLinghuiVideoNodeViewState({
      properties: baseProps,
      hasIncomingEdge: true,
    })).toBe('pending');
  });

  it('generate 模式 + 无 source + 无上游 → empty_generate（显示 2 actions）', () => {
    expect(resolveLinghuiVideoNodeViewState({
      properties: baseProps,
      hasIncomingEdge: false,
    })).toBe('empty_generate');
  });

  it('result 的视频媒体也算 resource', () => {
    expect(resolveLinghuiVideoNodeViewState({
      properties: baseProps,
      result: {
        kind: 'video',
        primary: { kind: 'video', source: 'https://cdn.example.com/result.mp4' },
      } as unknown as LinghuiNodeResult,
      hasIncomingEdge: false,
    })).toBe('resource');
  });
});

describe('resolveLinghuiImageNodeViewState (对齐 LibTV ImageNode 状态机)', () => {
  const baseProps: LinghuiImageNodeProperties = {
    mode: 'generate',
    source: '',
    items: [],
    primaryAssetId: '',
    primaryResultSource: '',
    prompt: '',
    ttiSelection: '',
    aspectRatio: '3:4',
    resolution: 'auto',
    gridType: 'none',
    batchCount: 1,
    focusRegion: null,
    markPoints: [],
  } as unknown as LinghuiImageNodeProperties;

  it('running → generating（最高优先级）', () => {
    expect(resolveLinghuiImageNodeViewState({
      properties: { ...baseProps, source: 'https://cdn.example.com/x.png' },
      runStatus: 'running',
      hasIncomingEdge: false,
      hasCollectionItems: true,
    })).toBe('generating');
  });

  it('failed → failed', () => {
    expect(resolveLinghuiImageNodeViewState({
      properties: { ...baseProps, source: 'https://cdn.example.com/x.png' },
      runStatus: 'failed',
      hasIncomingEdge: false,
    })).toBe('failed');
  });

  it('import 模式即使无图也走 resource（纯素材节点）', () => {
    expect(resolveLinghuiImageNodeViewState({
      properties: { ...baseProps, mode: 'import' },
      hasIncomingEdge: false,
    })).toBe('resource');
  });

  it('generate + 有 source → resource', () => {
    expect(resolveLinghuiImageNodeViewState({
      properties: { ...baseProps, source: 'https://cdn.example.com/x.png' },
      hasIncomingEdge: false,
    })).toBe('resource');
  });

  it('generate + collection 非空 → resource（即使 properties.source 为空）', () => {
    expect(resolveLinghuiImageNodeViewState({
      properties: baseProps,
      hasIncomingEdge: false,
      hasCollectionItems: true,
    })).toBe('resource');
  });

  it('generate + 无图 + 上游已连入 → pending', () => {
    expect(resolveLinghuiImageNodeViewState({
      properties: baseProps,
      hasIncomingEdge: true,
    })).toBe('pending');
  });

  it('generate + 无图 + 无上游 → empty_generate', () => {
    expect(resolveLinghuiImageNodeViewState({
      properties: baseProps,
      hasIncomingEdge: false,
    })).toBe('empty_generate');
  });

  it('result 的主图也算 resource', () => {
    expect(resolveLinghuiImageNodeViewState({
      properties: baseProps,
      result: {
        kind: 'image',
        primary: { kind: 'image', source: 'https://cdn.example.com/result.png' },
      } as unknown as LinghuiNodeResult,
      hasIncomingEdge: false,
    })).toBe('resource');
  });
});
