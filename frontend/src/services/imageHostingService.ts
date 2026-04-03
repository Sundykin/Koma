/**
 * Image hosting orchestrator (pluggable).
 *
 * This is a thin layer that:
 * - selects the active image-hosting channel (channelConfig)
 * - creates the provider instance via ProviderRegistry(kind='image-hosting')
 * - uploads bytes and returns a remote URL
 *
 * It intentionally does not know any provider-specific protocol (e.g. SCDN).
 */

import { createLogger } from '../store/logger';
import { electronService } from './electronService';
import { getDefaultChannelConfig, getChannelsByCapability } from '../store/globalStore';
import { createProviderInstance, getProjectImageHostingProvider, listProviders } from '../providers';
import type { ImageHostingProvider, ImageHostingUploadOptions, ImageHostingUploadResult } from '../providers/imageHosting/types';

const logger = createLogger('ImageHosting');
const IMAGE_HOSTING_UPLOAD_TIMEOUT_MS = 60_000;

let _recovering: Promise<void> | null = null;

import { base64ToBytes } from '../utils/encoding';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function getActiveImageHostingChannel() {
  return await getDefaultChannelConfig('image-hosting' as any)
    || (await getChannelsByCapability('image-hosting' as any))[0]
    || null;
}

async function tryCreateProviderFallback(channel: any): Promise<ImageHostingProvider | null> {
  if (!channel) return null;
  if (channel.providerType !== 'scdn-image-hosting' && !listProviders('image-hosting').some(p => p.type === channel.providerType)) {
    return null;
  }

  const defs = listProviders('image-hosting');
  const def = defs.find(d => d.type === channel.providerType);
  if (!def) return null;

  const pluginIdFromDef = def.pluginId;
  const pluginId = channel.pluginId || pluginIdFromDef;

  // Reconstruct plugin context locally (avoid depending on higher-level provider factory paths).
  let sandboxedFetch: typeof fetch = fetch;
  if (pluginId) {
    try {
      const { usePluginStore, waitForPluginStoreRehydration } = await import('../store/pluginStore');
      const { createSandboxedFetch } = await import('./plugin/PluginSandbox');
      await waitForPluginStoreRehydration();
      const plugin = usePluginStore.getState().getPlugin(pluginId);
      if (plugin) {
        sandboxedFetch = createSandboxedFetch(plugin);
      }
    } catch (err: unknown) {
      logger.warn('fallback 创建 provider：构建 sandboxedFetch 失败，降级使用全局 fetch', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    const provider = createProviderInstance<ImageHostingProvider>(
      'image-hosting',
      channel.providerType,
      channel.providerConfig || {},
      { sandboxedFetch, pluginId }
    );
    return provider;
  } catch (err: unknown) {
    logger.error('fallback 创建 provider 失败', {
      providerType: channel.providerType,
      pluginId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function recoverImageHostingProviderOnce(): Promise<void> {
  // Avoid dogpiling if multiple uploads happen concurrently.
  if (_recovering) return _recovering;

  _recovering = (async () => {
    try {
      const channel = await getActiveImageHostingChannel();
      if (!channel) return;

      // If this channel comes from a plugin, attempt to initialize that plugin.
      if (channel.source === 'plugin' && channel.pluginId) {
        // Lazy import to avoid module cycles.
        const { usePluginStore } = await import('../store/pluginStore');
        const { initializePlugin } = await import('./plugin/PluginInitializer');

        const plugin = usePluginStore.getState().getPlugin(channel.pluginId);
        if (plugin && plugin.isEnabled) {
          const ok = await initializePlugin(plugin);
          if (ok) return;
        }
      }

      // Fallback: re-run provider plugin initialization (best-effort).
      const { initializeProviderPlugins } = await import('./plugin/PluginInitializer');
      await initializeProviderPlugins();
    } catch (err: unknown) {
      logger.warn('尝试恢复 image-hosting provider 失败', { error: err instanceof Error ? err.message : String(err) });
    }
  })();

  try {
    await _recovering;
  } finally {
    _recovering = null;
  }
}

export async function getActiveImageHostingProvider(): Promise<ImageHostingProvider | null> {
  const channel = await getActiveImageHostingChannel();
  let provider = await getProjectImageHostingProvider();
  if (!provider) {
    const defs = listProviders('image-hosting').map(d => ({ type: d.type, pluginId: d.pluginId }));
    let pluginRuntimeState: any = null;
    if (channel?.source === 'plugin' && channel.pluginId) {
      const { usePluginStore } = await import('../store/pluginStore');
      pluginRuntimeState = usePluginStore.getState().runtimeStates?.[channel.pluginId] || null;
    }
    logger.warn('image-hosting provider 未就绪: before recover', {
      channel: channel
        ? {
            id: channel.id,
            providerType: channel.providerType,
            source: channel.source,
            pluginId: channel.pluginId,
            enabled: channel.enabled,
            providerConfigEnabled: Boolean((channel.providerConfig as any)?.enabled),
            providerConfigKeys: Object.keys((channel.providerConfig as any) || {}),
          }
        : null,
      registeredProviders: defs,
      pluginRuntimeState,
    });
    // Self-heal: plugin might be enabled and channel config exists, but provider definitions
    // were not registered in-memory yet (startup race / prior plugin load failure).
    await recoverImageHostingProviderOnce();
    provider = await getProjectImageHostingProvider();
  }
  if (!provider) {
    // Last-resort: we can see the provider definition exists in the registry but higher-level
    // factory paths still returned null. Try constructing the instance directly.
    const fallbackProvider = await tryCreateProviderFallback(channel);
    if (fallbackProvider) {
      logger.info('image-hosting provider recovered via fallback create', {
        providerType: channel?.providerType,
        pluginId: channel?.pluginId,
      });
      provider = fallbackProvider;
    }
  }
  if (!provider) {
    const defs = listProviders('image-hosting').map(d => ({ type: d.type, pluginId: d.pluginId }));
    logger.warn('image-hosting provider 未就绪: after recover', {
      channel: channel ? { id: channel.id, providerType: channel.providerType, pluginId: channel.pluginId } : null,
      registeredProviders: defs,
    });
  }
  if (!provider) return null;
  if (!provider.validate()) return null;
  return provider;
}

export async function isImageHostingEnabled(): Promise<boolean> {
  return Boolean(await getActiveImageHostingProvider());
}

export async function uploadBytesToImageHostingWithRetry(
  bytes: ArrayBuffer | Uint8Array,
  options?: ImageHostingUploadOptions,
  maxRetries: number = 3
): Promise<ImageHostingUploadResult> {
  const channel = await getActiveImageHostingChannel();
  if (!channel) {
    return { success: false, error: '未找到 image-hosting 渠道，请在插件设置中启用图床并创建渠道' };
  }

  // In Electron, plugin-based image hosting should prefer backend execution.
  // This avoids renderer CSP restrictions and keeps upload transport centralized.
  if (electronService.isElectron() && channel.source === 'plugin') {
    const payloadBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let lastBackendError = '';
    let backendProviderMissing = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info('图床后端 Provider 上传开始', {
          providerType: channel.providerType,
          attempt,
          bytes: payloadBytes.byteLength,
          filename: options?.filename,
        });
        const result = await withTimeout(
          electronService.ipc.invoke('controller/plugin/callProvider', {
            kind: 'image-hosting',
            type: channel.providerType,
            method: 'uploadImage',
            args: [channel.providerConfig || {}, payloadBytes, options],
          }),
          IMAGE_HOSTING_UPLOAD_TIMEOUT_MS,
          `图床上传超时（>${IMAGE_HOSTING_UPLOAD_TIMEOUT_MS / 1000} 秒）`,
        );

        const normalized = result as ImageHostingUploadResult | null;
        if (normalized?.success) {
          logger.info('图床后端 Provider 上传成功', {
            providerType: channel.providerType,
            attempt,
            url: normalized.url,
            filename: options?.filename,
          });
          return normalized;
        }
        if (normalized && typeof normalized === 'object') {
          lastBackendError = normalized.error || `未返回 success=true，原始结果: ${JSON.stringify(normalized)}`;
          logger.warn('图床后端 Provider 返回非成功结果', {
            providerType: channel.providerType,
            attempt,
            result: normalized,
          });
        } else {
          lastBackendError = `返回了不可识别结果: ${String(result)}`;
          logger.warn('图床后端 Provider 返回不可识别结果', {
            providerType: channel.providerType,
            attempt,
            result,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Backend provider may not exist (e.g. plugin only has frontend entry). Only then
        // should we fall back to renderer-side provider resolution.
        if (msg.includes('Provider "') && msg.includes('not found')) {
          backendProviderMissing = true;
          lastBackendError = '';
          logger.warn('图床后端 Provider 不存在，回退到前端 Provider', {
            providerType: channel.providerType,
          });
          break;
        }
        logger.error('图床后端 Provider 调用抛错', {
          providerType: channel.providerType,
          attempt,
          error: msg,
          stack: err instanceof Error ? err.stack : undefined,
        });
        lastBackendError = msg;
      }

      logger.warn(`图床上传失败 (后端 Provider 尝试 ${attempt}/${maxRetries}): ${lastBackendError}`);
      if (attempt < maxRetries) {
        const wait = 1000 * Math.pow(2, attempt - 1);
        await delay(wait);
      }
    }

    if (!backendProviderMissing) {
      return {
        success: false,
        error: `上传失败，已重试 ${maxRetries} 次: ${lastBackendError || '未知错误'}`,
      };
    }
  }

  const provider = await getActiveImageHostingProvider();
  if (!provider) {
    // Differentiate "provider not registered" vs "provider exists but config invalid/disabled".
    // This helps users fix the real issue without guesswork.
    const raw = await getProjectImageHostingProvider();
    if (raw && !raw.validate()) {
      return {
        success: false,
        error: `图床 Provider 已加载但未启用或配置不完整（${channel.providerType}）。请在插件设置中启用并保存配置后重试。`,
      };
    }

    return {
      success: false,
      error: `图床渠道已存在但 Provider 未就绪（${channel.providerType}）。请尝试重启应用或重新启用插件后再试。`,
    };
  }

  let lastError = '';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info('图床前端 Provider 上传开始', {
        providerType: provider.type,
        attempt,
        bytes: bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength,
        filename: options?.filename,
      });
      const result = await withTimeout(
        provider.uploadImage(bytes, options),
        IMAGE_HOSTING_UPLOAD_TIMEOUT_MS,
        `图床上传超时（>${IMAGE_HOSTING_UPLOAD_TIMEOUT_MS / 1000} 秒）`,
      );
      if (result.success) {
        logger.info('图床前端 Provider 上传成功', {
          providerType: provider.type,
          attempt,
          url: result.url,
          filename: options?.filename,
        });
        return result;
      }
      lastError = result.error || '未知错误';
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    logger.warn(`图床上传失败 (尝试 ${attempt}/${maxRetries}): ${lastError}`);
    if (attempt < maxRetries) {
      const wait = 1000 * Math.pow(2, attempt - 1);
      await delay(wait);
    }
  }

  return {
    success: false,
    error: `上传失败，已重试 ${maxRetries} 次: ${lastError}`,
  };
}

export async function uploadLocalFileToImageHosting(
  localPath: string,
  options?: ImageHostingUploadOptions
): Promise<ImageHostingUploadResult> {
  if (!electronService.isElectron()) {
    return { success: false, error: '不支持的环境（需要 Electron）' };
  }

  try {
    const base64 = await electronService.fs.readFileAsBase64(localPath);
    const bytes = base64ToBytes(base64);
    const filename = options?.filename || localPath.split(/[/\\]/).pop() || 'image.png';
    return uploadBytesToImageHostingWithRetry(bytes, { ...options, filename });
  } catch (err: unknown) {
    return { success: false, error: `读取文件失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}
