/**
 * 文件上传插件
 */
import type { ChatPlugin, PluginContext } from './types';
import type { ContentPart, ImageContentPart, FileContentPart } from '../types';

export interface FileUploadOptions {
  maxFileSize?: number; // 最大文件大小（字节）
  allowedTypes?: string[]; // 允许的 MIME 类型
}

export class FileUploadPlugin implements ChatPlugin {
  name = 'file-upload';
  version = '1.0.0';

  private options: FileUploadOptions;

  constructor(options: FileUploadOptions = {}) {
    this.options = {
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 默认 10MB
      allowedTypes: options.allowedTypes || [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'text/markdown',
      ],
    };
  }

  /**
   * 从 File 对象创建内容部分
   */
  async fileToContentPart(file: File): Promise<ContentPart> {
    // 验证文件大小
    if (this.options.maxFileSize && file.size > this.options.maxFileSize) {
      throw new Error(`文件过大，最大允许 ${this.options.maxFileSize / 1024 / 1024}MB`);
    }

    // 验证文件类型
    if (this.options.allowedTypes && !this.options.allowedTypes.includes(file.type)) {
      throw new Error(`不支持的文件类型: ${file.type}`);
    }

    const base64 = await this.fileToBase64(file);

    // 图片类型
    if (file.type.startsWith('image/')) {
      return {
        type: 'image',
        imageBase64: base64,
        mimeType: file.type,
      } as ImageContentPart;
    }

    // 其他文件类型
    return {
      type: 'file',
      fileName: file.name,
      fileData: base64,
      mimeType: file.type,
    } as FileContentPart;
  }

  /**
   * 从 URL 加载图片
   */
  async imageUrlToContentPart(url: string): Promise<ImageContentPart> {
    return {
      type: 'image',
      imageUrl: url,
    };
  }

  /**
   * 从 base64 创建图片内容
   */
  base64ToImageContentPart(base64: string, mimeType: string = 'image/png'): ImageContentPart {
    return {
      type: 'image',
      imageBase64: base64,
      mimeType,
    };
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // 移除 data:xxx;base64, 前缀
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
