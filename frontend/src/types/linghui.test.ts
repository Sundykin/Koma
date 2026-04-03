import { describe, expect, it } from 'vitest';
import type { LinghuiNodeResult } from './linghui';
import {
  getLinghuiResultItemCount,
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
  getLinghuiResultShots,
  getLinghuiResultText,
  linghuiTypeToRFType,
  rfTypeToLinghuiType,
} from './linghui';

describe('linghui type mapping', () => {
  it('uses explicit known mappings in both directions', () => {
    expect(linghuiTypeToRFType('linghui/video')).toBe('linghui-video');
    expect(linghuiTypeToRFType('linghui/script')).toBe('linghui-script');
    expect(rfTypeToLinghuiType('linghui-audio')).toBe('linghui/audio');
    expect(rfTypeToLinghuiType('linghui-text')).toBe('linghui/text');
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
