import { describe, expect, it } from 'vitest';
import { formatReferencePlaceholder, isImageIndexProtocol } from './imageIndexProtocol';
import { compileGrokITV, compileGrokTTI } from './grokImageIndexCompiler';
import { compilePromptReferences } from './promptReferenceCompiler';
import { resolveITVPrefersLocalAssets } from './videoRequestCompiler';

describe('isImageIndexProtocol', () => {
  it('recognizes index-based protocols only', () => {
    expect(isImageIndexProtocol('grok-image-index')).toBe(true);
    expect(isImageIndexProtocol('minimax-image-tag')).toBe(true);
    expect(isImageIndexProtocol('koma-jimeng')).toBe(false);
    expect(isImageIndexProtocol(undefined)).toBe(false);
  });
});

describe('formatReferencePlaceholder', () => {
  it('renders MiniMax H3 Chinese tags', () => {
    expect(formatReferencePlaceholder('minimax-image-tag', 'image', 1)).toBe('<图片 1>');
    expect(formatReferencePlaceholder('minimax-image-tag', 'video', 2)).toBe('<视频 2>');
    expect(formatReferencePlaceholder('minimax-image-tag', 'audio', 3)).toBe('<音频 3>');
  });

  it('falls back to grok style for other protocols', () => {
    expect(formatReferencePlaceholder('grok-image-index', 'image', 1)).toBe('@Image 1');
    expect(formatReferencePlaceholder(undefined, 'image', 2)).toBe('@Image 2');
  });
});

describe('compileGrokTTI with minimax-image-tag', () => {
  const selectedAssets = [
    { type: 'char' as const, assetId: 'char_xiaomi', name: '小米', source: 'https://cdn/a.png' },
    { type: 'prop' as const, assetId: 'prop_notice', name: '招募通知', source: 'https://cdn/b.png' },
  ];

  it('compiles @mentions into <图片 N> aligned with reference order', () => {
    const { compiledPrompt, compiledReferences, debug } = compileGrokTTI({
      prompt: '@char_xiaomi 手里拿着 @prop_notice',
      selectedAssets,
      protocol: 'minimax-image-tag',
    });

    expect(compiledPrompt).toBe('<图片 1> 手里拿着 <图片 2>');
    expect(compiledReferences).toEqual(['https://cdn/a.png', 'https://cdn/b.png']);
    expect(debug.protocol).toBe('minimax-image-tag');
    expect(debug.assetToImageIndex.map(x => x.image)).toEqual(['<图片 1>', '<图片 2>']);
  });

  it('keeps grok output unchanged when no protocol is passed', () => {
    const { compiledPrompt, debug } = compileGrokTTI({
      prompt: '@char_xiaomi 出场',
      selectedAssets,
    });
    expect(compiledPrompt).toBe('@Image 1 出场');
    expect(debug.protocol).toBe('grok-image-index');
  });
});

describe('compileGrokITV with minimax-image-tag', () => {
  it('reserves <图片 1> for the primary image', () => {
    const { compiledPrompt } = compileGrokITV({
      prompt: '@char_xiaomi 走进画面',
      primaryImage: 'https://cdn/primary.png',
      selectedAssets: [
        { type: 'char' as const, assetId: 'char_xiaomi', name: '小米', source: 'https://cdn/a.png' },
      ],
      protocol: 'minimax-image-tag',
    });
    // 第 1 张是 primaryImage，选中素材从第 2 张开始
    expect(compiledPrompt).toBe('<图片 2> 走进画面');
  });
});

describe('compilePromptReferences with minimax-image-tag', () => {
  it('replaces @ref_ mentions with Chinese tags per kind', () => {
    const result = compilePromptReferences({
      prompt: '参考 @ref_a 和 @ref_b，配乐用 @ref_c',
      references: [
        { id: 'a', name: '图A', kind: 'image', source: 'https://cdn/a.png' },
        { id: 'b', name: '图B', kind: 'image', source: 'https://cdn/b.png' },
        { id: 'c', name: '音频C', kind: 'audio', source: 'https://cdn/c.mp3' },
      ],
      replacementStrategy: 'minimax-image-tag',
    });

    expect(result.compiledPrompt).toBe('参考 <图片 1> 和 <图片 2>，配乐用 <音频 1>');
  });

  it('falls back to readable name for references without a source', () => {
    const result = compilePromptReferences({
      prompt: '参考 @ref_a',
      references: [{ id: 'a', name: '图A', kind: 'image' }],
      replacementStrategy: 'minimax-image-tag',
    });
    expect(result.compiledPrompt).toBe('参考 图A');
  });
});

describe('resolveITVPrefersLocalAssets', () => {
  it('honors the provider declaration', () => {
    expect(resolveITVPrefersLocalAssets({ prefersLocalAssets: true, config: {} })).toBe(true);
    expect(resolveITVPrefersLocalAssets({ prefersLocalAssets: false, config: {} })).toBe(false);
  });

  it('keeps the legacy seedance behaviour when undeclared', () => {
    expect(resolveITVPrefersLocalAssets({ config: { provider: 'seedance' } })).toBe(true);
    expect(resolveITVPrefersLocalAssets({ config: { provider: 'openai-video' } })).toBe(false);
    expect(resolveITVPrefersLocalAssets(undefined)).toBe(false);
  });

  it('makes byte-uploading providers prefer local files', async () => {
    // 这两个 provider 自己读字节上传，必须本地优先：远程 URL 常是过期即 403 的签名地址
    const { ComfyUIITVProvider } = await import('../../providers/itv/ComfyUIITVProvider');
    const { SuiheDirectITVProvider } = await import('../../providers/itv/SuiheDirectITVProvider');
    const cfg = { provider: 'x', name: 'x', baseUrl: 'https://x' } as any;
    expect(resolveITVPrefersLocalAssets(new ComfyUIITVProvider(cfg))).toBe(true);
    expect(resolveITVPrefersLocalAssets(new SuiheDirectITVProvider(cfg))).toBe(true);
  });
});
