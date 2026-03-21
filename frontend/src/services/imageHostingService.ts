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
import { getProjectImageHostingProvider } from '../providers';
import type { ImageHostingProvider, ImageHostingUploadOptions, ImageHostingUploadResult } from '../providers/imageHosting/types';

const logger = createLogger('ImageHosting');

let _recovering: Promise<void> | null = null;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function getActiveImageHostingChannel() {
  return await getDefaultChannelConfig('image-hosting' as any)
    || (await getChannelsByCapability('image-hosting' as any))[0]
    || null;
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
  let provider = await getProjectImageHostingProvider();
  if (!provider) {
    // Self-heal: plugin might be enabled and channel config exists, but provider definitions
    // were not registered in-memory yet (startup race / prior plugin load failure).
    await recoverImageHostingProviderOnce();
    provider = await getProjectImageHostingProvider();
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
  const provider = await getActiveImageHostingProvider();
  if (!provider) {
    const channel = await getActiveImageHostingChannel();
    if (!channel) {
      return { success: false, error: '未找到 image-hosting 渠道，请在插件设置中启用图床并创建渠道' };
    }

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
      const result = await provider.uploadImage(bytes, options);
      if (result.success) {
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
    const bytes = base64ToUint8Array(base64);
    const filename = options?.filename || localPath.split(/[/\\]/).pop() || 'image.png';
    return uploadBytesToImageHostingWithRetry(bytes, { ...options, filename });
  } catch (err: unknown) {
    return { success: false, error: `读取文件失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}
