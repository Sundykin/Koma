import { describe, expect, it } from 'vitest';
import {
  getPreferredLinghuiEditorMode,
  resolveLinghuiNodeViewMode,
} from '../state/linghuiNodeViewMode';

describe('linghuiNodeViewMode', () => {
  it('未配置时回退到 light', () => {
    expect(resolveLinghuiNodeViewMode(undefined)).toBe('light');
    expect(resolveLinghuiNodeViewMode('')).toBe('light');
  });

  it('仅在沉浸式时默认打开沉浸编辑', () => {
    expect(getPreferredLinghuiEditorMode({ viewMode: 'immersive' })).toBe('immersive');
    expect(getPreferredLinghuiEditorMode({ viewMode: 'collapsed' })).toBe('light');
    expect(getPreferredLinghuiEditorMode({ viewMode: 'light' })).toBe('light');
  });
});
