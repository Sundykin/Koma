import { describe, expect, it } from 'vitest';
import { getBuiltInChannelDefinition, listBuiltInChannelDefinitions } from './catalog';

describe('channel catalog (itv)', () => {
  it('does not hardcode upstream model lists for built-in ITV channels (models live in settings)', () => {
    const itvChannels = listBuiltInChannelDefinitions('itv');
    expect(itvChannels.length).toBeGreaterThan(0);
    expect(itvChannels.every(channel => channel.models.length === 0)).toBe(true);
  });

  it('declares provider template metadata for koma-suihe-itv channel', () => {
    const channel = getBuiltInChannelDefinition('koma-suihe-itv');
    expect(channel).toBeTruthy();
    expect(channel?.category).toBe('itv');
    expect(channel?.id).toBe('koma-suihe-itv');
    expect(channel?.models.length).toBe(0);
  });

  it('exposes the Koma 官方 ITV providers + suihe-itv + comfyui-itv（grok2api-imagine-itv / openai-video / runway / kling / pika / sora2 / seedance / vidu / comfyui-animatediff / custom 已下线）', () => {
    const itvChannels = listBuiltInChannelDefinitions('itv');
    const ids = itvChannels.map((c) => c.id).sort();
    expect(ids).toEqual(['comfyui-itv', 'koma-suihe-itv', 'minimax-h3-itv', 'suihe-itv']);
  });

  it('declares provider template metadata for comfyui-itv channel', () => {
    const channel = getBuiltInChannelDefinition('comfyui-itv');
    expect(channel).toBeTruthy();
    expect(channel?.category).toBe('itv');
    expect(channel?.models.length).toBe(0);
    // ComfyUI 原生无鉴权：服务地址必填、apiKey 不必填
    const required = (channel?.configSchema as { required?: string[] } | undefined)?.required;
    expect(required).toContain('baseUrl');
    expect(required).not.toContain('apiKey');
  });

  it('declares provider template metadata for suihe-itv channel', () => {
    const channel = getBuiltInChannelDefinition('suihe-itv');
    expect(channel).toBeTruthy();
    expect(channel?.category).toBe('itv');
    expect(channel?.id).toBe('suihe-itv');
    expect(channel?.models.length).toBe(0);
    // 穗禾直连有官方默认上游，baseUrl 预填 https://www.suihemedia.cloud
    //（文档的 api. 域证书/路由均未就绪，www 才是实际 API 网关；主进程对 *.suihemedia.cloud 设有证书校验例外）
    expect((channel?.configSchema as { properties?: Record<string, { default?: unknown }> } | undefined)
      ?.properties?.baseUrl?.default).toBe('https://www.suihemedia.cloud');
  });

});
