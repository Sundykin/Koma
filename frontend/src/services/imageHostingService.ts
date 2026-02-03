/**
 * 图床服务 - 前端上传接口
 * 用于将本地图片上传到远程图床，获取可访问的 URL
 *
 * 注意：配置从插件系统的 channelConfig.providerConfig 读取
 */

// 定义类型（避免依赖 @komastudio/plugin-sdk）
export interface ImageHostingUploadOptions {
  filename?: string;
  outputFormat?: string;
  cdnDomain?: string;
}

export interface ImageHostingUploadResult {
  success: boolean;
  url?: string;
  data?: any;
  error?: string;
}

import { getChannelConfigs } from '../store/settings/channelConfig';

// SCDN 图床配置
export interface SCDNImageHostingConfig {
  apiEndpoint: string;
  outputFormat: 'auto' | 'jpeg' | 'png' | 'webp' | 'gif' | 'webp_animated';
  cdnDomain: string;
  enabled: boolean;
}

export const DEFAULT_SCDN_CONFIG: SCDNImageHostingConfig = {
  apiEndpoint: 'https://img.scdn.io/api/v1.php',
  outputFormat: 'webp',
  cdnDomain: '',
  enabled: true,  // 默认启用
};

// 支持的 CDN 域名
export const AVAILABLE_CDN_DOMAINS = [
  { name: '默认', domain: '' },
  { name: '失控的防御系统', domain: 'img.scdn.io' },
  { name: 'CloudFlare', domain: 'cloudflareimg.cdn.sn' },
  { name: 'EdgeOne', domain: 'edgeoneimg.cdn.sn' },
  { name: 'ESA', domain: 'esaimg.cdn1.vip' },
];

/**
 * 从插件系统获取图床配置
 */
export async function getImageHostingConfig(): Promise<SCDNImageHostingConfig | null> {
  try {
    const configs = await getChannelConfigs();

    // 查找 image-hosting 类型的渠道配置
    const imageHostingChannel = configs.find(
      c => c.providerType === 'scdn-image-hosting' ||
           (c.capabilities && c.capabilities.includes('image-hosting'))
    );

    if (imageHostingChannel) {
      const providerConfig = imageHostingChannel.providerConfig || {};
      return {
        ...DEFAULT_SCDN_CONFIG,
        ...providerConfig,
      } as SCDNImageHostingConfig;
    }

    return null;
  } catch (err) {
    console.error('[ImageHosting] 读取插件配置失败:', err);
    return null;
  }
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 上传图片到图床
 */
async function uploadImageToSCDN(
  imageData: Buffer | Blob | ArrayBuffer,
  config: SCDNImageHostingConfig,
  options?: ImageHostingUploadOptions
): Promise<ImageHostingUploadResult> {
  if (!config.enabled) {
    return {
      success: false,
      error: '图床未启用，请在插件设置中启用 SCDN 图床服务',
    };
  }

  try {
    // 转换数据为 Blob
    let blob: Blob;
    if (imageData instanceof Blob) {
      blob = imageData;
    } else if (imageData instanceof ArrayBuffer) {
      blob = new Blob([imageData]);
    } else {
      // Buffer (Node.js)
      blob = new Blob([imageData]);
    }

    // 构建 FormData
    const formData = new FormData();
    const filename = options?.filename || `image_${Date.now()}.png`;
    formData.append('image', blob, filename);

    // 输出格式
    const outputFormat = options?.outputFormat || config.outputFormat || 'auto';
    formData.append('outputFormat', outputFormat);

    // CDN 域名
    const cdnDomain = options?.cdnDomain || config.cdnDomain;
    if (cdnDomain) {
      formData.append('cdn_domain', cdnDomain);
    }

    // 发送请求
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      return {
        success: true,
        url: result.url,
        data: result.data,
      };
    } else {
      return {
        success: false,
        error: result.message || '上传失败',
      };
    }
  } catch (err: any) {
    console.error('[SCDN] Upload error:', err);
    return {
      success: false,
      error: err.message || '网络请求失败',
    };
  }
}

/**
 * 带重试的上传
 * @param imageData 图片数据
 * @param options 上传选项
 * @param maxRetries 最大重试次数，默认3次
 */
export async function uploadToImageHostingWithRetry(
  imageData: Buffer | Blob | ArrayBuffer,
  options?: ImageHostingUploadOptions,
  maxRetries: number = 3
): Promise<ImageHostingUploadResult> {
  // 从插件系统获取配置
  const config = await getImageHostingConfig();

  if (!config || !config.enabled) {
    return {
      success: false,
      error: '图床未配置或未启用，请在插件设置中启用 SCDN 图床服务',
    };
  }

  let lastError: string = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {

    const result = await uploadImageToSCDN(imageData, config, options);

    if (result.success) {
      return result;
    }

    lastError = result.error || '未知错误';
    console.warn(`[ImageHosting] 上传失败 (尝试 ${attempt}):`, lastError);

    // 如果不是最后一次尝试，等待后重试（指数退避）
    if (attempt < maxRetries) {
      const waitTime = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      await delay(waitTime);
    }
  }

  return {
    success: false,
    error: `上传失败，已重试 ${maxRetries} 次: ${lastError}`,
  };
}

/**
 * 从本地文件上传到图床
 * @param localPath 本地文件路径
 */
export async function uploadLocalFileToImageHosting(
  localPath: string
): Promise<ImageHostingUploadResult> {
  try {
    // 通过 Electron API 读取文件
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.fs?.readFile) {
      return {
        success: false,
        error: '不支持的环境（需要 Electron）',
      };
    }

    const fileData = await electronAPI.fs.readFile(localPath);
    const filename = localPath.split(/[/\\]/).pop() || 'image.png';

    return uploadToImageHostingWithRetry(fileData, { filename });
  } catch (err: any) {
    return {
      success: false,
      error: `读取文件失败: ${err.message}`,
    };
  }
}
