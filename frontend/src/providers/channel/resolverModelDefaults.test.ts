import { describe, expect, it } from 'vitest';
import { buildITVProviderConfigFromContext, buildTTIConfigFromContext } from './resolver';

/**
 * 回归：TTI 侧只把模型 defaults 平铺到 config 顶层，没有像 ITV 那样带上 modelDefaults；
 * 而 ComfyUI provider 读的是 config.modelDefaults —— 于是：
 *   - authMode 丢失   → 请求不带认证 → 反代返回 401（"ComfyUI 返回了非 JSON 响应 (HTTP 401)"）
 *   - workflowJson 丢失 → 静默退回内置工作流，跑的根本不是用户导入的那套模型
 * 两者都不报错，只是结果不对，属于最难查的一类问题。
 */

const WORKFLOW_JSON = JSON.stringify({ '1': { class_type: 'SaveImage', inputs: {} } });

function makeContext(defaults: Record<string, unknown>) {
  return {
    channelConfig: {
      id: 'chan-1',
      name: 'ComfyUI 远程',
      providerType: 'comfyui-tti',
      providerConfig: { baseUrl: 'https://example.ngrok-free.dev', hasApiKey: true },
      createdAt: 1,
      updatedAt: 2,
    },
    definition: { runtimeProviderType: 'comfyui-tti' },
    model: { id: 'z-image', providerModelName: 'Z-Image 文生图', defaults },
  } as unknown as Parameters<typeof buildTTIConfigFromContext>[0];
}

describe('buildTTIConfigFromContext 传递 modelDefaults', () => {
  it('结构化 defaults 整体带到 modelDefaults', () => {
    const config = buildTTIConfigFromContext(makeContext({
      authMode: 'basic',
      workflowId: 'z-image',
      workflowJson: WORKFLOW_JSON,
    }));
    expect(config.modelDefaults?.authMode).toBe('basic');
    expect(config.modelDefaults?.workflowId).toBe('z-image');
    expect(config.modelDefaults?.workflowJson).toBe(WORKFLOW_JSON);
  });

  it('同时保留历史的顶层平铺行为（defaultSize 等靠它）', () => {
    const config = buildTTIConfigFromContext(makeContext({ defaultSize: '1024x1024', authMode: 'basic' }));
    expect(config.defaultSize).toBe('1024x1024');
    expect((config as unknown as Record<string, unknown>).authMode).toBe('basic');
  });

  it('没有 defaults 时 modelDefaults 为 undefined，不造空对象', () => {
    const context = makeContext({});
    (context as unknown as { model: { defaults?: unknown } }).model.defaults = undefined;
    expect(buildTTIConfigFromContext(context).modelDefaults).toBeUndefined();
  });

  it('modelDefaults 是副本，改它不会污染渠道配置', () => {
    const defaults = { authMode: 'basic' };
    const config = buildTTIConfigFromContext(makeContext(defaults));
    (config.modelDefaults as Record<string, unknown>).authMode = 'bearer';
    expect(defaults.authMode).toBe('basic');
  });
});

describe('buildITVProviderConfigFromContext 保持一致口径', () => {
  it('ITV 侧同样带 modelDefaults', () => {
    const config = buildITVProviderConfigFromContext(makeContext({
      authMode: 'basic',
      workflowJson: WORKFLOW_JSON,
    }) as unknown as Parameters<typeof buildITVProviderConfigFromContext>[0]);
    expect(config.modelDefaults?.authMode).toBe('basic');
    expect(config.modelDefaults?.workflowJson).toBe(WORKFLOW_JSON);
  });
});
