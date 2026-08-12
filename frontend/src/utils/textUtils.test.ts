import { describe, expect, it } from 'vitest';
import { sanitizeCharacterAppearance } from './textUtils';

describe('sanitizeCharacterAppearance', () => {
  it('剔除纯身份 / 职业陈述', () => {
    const result = sanitizeCharacterAppearance('黑色短发，深棕色眼睛，年轻的调查员，靠接私活为生');
    expect(result).toContain('黑色短发');
    expect(result).toContain('深棕色眼睛');
    expect(result).not.toContain('调查员');
    expect(result).not.toContain('接私活');
  });

  it('剔除亲属关系与经历陈述', () => {
    const result = sanitizeCharacterAppearance('圆脸，浅肤色，养父多年前在火场遇难');
    expect(result).toContain('圆脸');
    expect(result).not.toContain('火场');
  });

  it('带身份词但在描述可见外观的短句要保留', () => {
    // 回归：旧实现按 '工作' 子串整句丢弃，"深蓝色工作服" 这类服装描述被误杀
    expect(sanitizeCharacterAppearance('穿着深蓝色棉质工作服')).toContain('工作服');
    expect(sanitizeCharacterAppearance('身上是护士的白色制服裙')).toContain('制服裙');
    expect(sanitizeCharacterAppearance('戴着老板样式的金丝眼镜')).toContain('金丝眼镜');
  });

  it('全是身份陈述时回落到 fallback', () => {
    expect(sanitizeCharacterAppearance('一个年轻的律师', '顾行')).toBe('顾行');
  });

  it('空输入回落到 fallback', () => {
    expect(sanitizeCharacterAppearance(undefined, '顾行')).toBe('顾行');
    expect(sanitizeCharacterAppearance('', '')).toBe('');
  });
});
