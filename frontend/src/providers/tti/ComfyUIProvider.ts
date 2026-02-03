/**
 * ComfyUI TTI Provider
 */
import type { TTIModelConfig, ProgressInfo } from '../../types';
import type { TTIProvider, ImageResult, TTIOptions } from './types';

interface ComfyUIHistoryResponse {
  [taskId: string]: {
    status?: {
      completed?: boolean;
      status_str?: string;
      executing?: boolean;
      messages?: Array<[string, string]>;
    };
    outputs?: Record<string, any>;
  };
}

interface ComfyUIUploadResponse {
  name: string;
  subfolder?: string;
  type?: string;
}

export class ComfyUIProvider implements TTIProvider {
  type = 'comfyui' as const;
  config: TTIModelConfig;

  constructor(config: TTIModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.baseUrl;
  }

  private getBaseUrl(): string {
    return (this.config.baseUrl || 'http://127.0.0.1:8188').replace(/\/+$/, '');
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.getBaseUrl()}/system_stats`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private parseSize(value?: string): { width: number; height: number } | null {
    if (!value) return null;
    const match = value.match(/(\d+)\s*x\s*(\d+)/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  private resolveSize(options?: TTIOptions): { width: number; height: number } {
    const fromOptions = options?.width && options?.height
      ? { width: options.width, height: options.height }
      : null;
    if (fromOptions) return fromOptions;

    const fromConfig = this.parseSize(this.config.defaultSize);
    if (fromConfig) return fromConfig;

    return { width: 512, height: 512 };
  }

  private buildWorkflow(params: {
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    seed: number;
    modelName: string;
    imageName?: string;
  }): Record<string, any> {
    const {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      seed,
      modelName,
      imageName,
    } = params;

    const workflow: Record<string, any> = {
      "4": {
        inputs: {
          ckpt_name: modelName,
        },
        class_type: 'CheckpointLoaderSimple',
      },
      "6": {
        inputs: {
          text: prompt,
          clip: ["4", 1],
        },
        class_type: 'CLIPTextEncode',
      },
      "7": {
        inputs: {
          text: negativePrompt || 'bad quality, blurry, distorted',
          clip: ["4", 1],
        },
        class_type: 'CLIPTextEncode',
      },
      "3": {
        inputs: {
          seed,
          steps,
          cfg: cfgScale,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: imageName ? 0.75 : 1,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: imageName ? ["11", 0] : ["5", 0],
        },
        class_type: 'KSampler',
      },
      "8": {
        inputs: {
          samples: ["3", 0],
          vae: ["4", 2],
        },
        class_type: 'VAEDecode',
      },
      "9": {
        inputs: {
          images: ["8", 0],
        },
        class_type: 'SaveImage',
      },
    };

    if (imageName) {
      workflow["10"] = {
        inputs: {
          image: imageName,
        },
        class_type: 'LoadImage',
      };
      workflow["11"] = {
        inputs: {
          pixels: ["10", 0],
          vae: ["4", 2],
        },
        class_type: 'VAEEncode',
      };
    } else {
      workflow["5"] = {
        inputs: {
          width,
          height,
          batch_size: 1,
        },
        class_type: 'EmptyLatentImage',
      };
    }

    return workflow;
  }

  private async uploadImage(imageUrl: string): Promise<ComfyUIUploadResponse> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error('下载参考图失败');
    }
    const blob = await response.blob();

    const formData = new FormData();
    formData.append('image', blob, 'input.png');
    formData.append('type', 'input');

    const uploadResponse = await fetch(`${this.getBaseUrl()}/upload/image`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`上传参考图失败: ${errorText}`);
    }

    return uploadResponse.json();
  }

  private buildImageName(upload: ComfyUIUploadResponse): string {
    if (upload.subfolder) {
      return `${upload.subfolder}/${upload.name}`;
    }
    return upload.name;
  }

  async checkProgress(taskId: string): Promise<ProgressInfo> {
    const response = await fetch(`${this.getBaseUrl()}/history/${taskId}`);

    if (!response.ok) {
      return {
        taskId,
        status: 'processing',
        progress: 0,
      };
    }

    const data: ComfyUIHistoryResponse = await response.json();
    const result = data[taskId];

    if (!result) {
      return {
        taskId,
        status: 'queued',
        progress: 0,
      };
    }

    if (result.status?.completed) {
      const outputs = result.outputs || {};
      let imageUrl: string | undefined;

      for (const nodeId in outputs) {
        const nodeOutput = outputs[nodeId];
        const image = nodeOutput?.images?.[0];
        if (image?.filename) {
          const params = new URLSearchParams({
            filename: image.filename,
            type: image.type || 'output',
          });
          if (image.subfolder) {
            params.set('subfolder', image.subfolder);
          }
          imageUrl = `${this.getBaseUrl()}/view?${params.toString()}`;
          break;
        }
      }

      return {
        taskId,
        status: 'completed',
        progress: 100,
        resultUrl: imageUrl,
      };
    }

    if (result.status?.status_str === 'error') {
      return {
        taskId,
        status: 'failed',
        progress: 0,
        error: result.status?.messages?.[0]?.[1] || '生成失败',
      };
    }

    const progress = result.status?.executing ? 50 : 10;
    return {
      taskId,
      status: 'processing',
      progress,
    };
  }

  async generateImage(
    prompt: string,
    options?: TTIOptions
  ): Promise<ImageResult> {
    if (!this.validate()) {
      throw new Error('ComfyUI 地址未配置');
    }

    const size = this.resolveSize(options);
    const steps = options?.steps || this.config.defaultSteps || 20;
    const cfgScale = options?.cfgScale || 7;
    const seed = options?.seed ?? Math.floor(Math.random() * 1000000000);
    const modelName = this.config.modelName || 'sd_xl_base_1.0.safetensors';

    const imageUrl = options?.imageUrls?.[0];
    const upload = imageUrl ? await this.uploadImage(imageUrl) : undefined;
    const imageName = upload ? this.buildImageName(upload) : undefined;

    const workflow = this.buildWorkflow({
      prompt,
      negativePrompt: options?.negativePrompt,
      width: size.width,
      height: size.height,
      steps,
      cfgScale,
      seed,
      modelName,
      imageName,
    });

    const response = await fetch(`${this.getBaseUrl()}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: workflow,
        client_id: `koma_${Date.now()}`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ComfyUI 提交失败: ${errorText}`);
    }

    const data = await response.json();
    const taskId = data.prompt_id || data.id;

    if (!taskId) {
      throw new Error('ComfyUI 任务ID获取失败');
    }

    const pollingConfig = this.polling;
    const startTime = Date.now();

    if (pollingConfig.initialDelay) {
      await this.delay(pollingConfig.initialDelay);
    }

    while (Date.now() - startTime < pollingConfig.maxDuration) {
      const progress = await this.checkProgress(taskId);

      if (progress.status === 'completed' && progress.resultUrl) {
        return {
          path: progress.resultUrl,
          width: size.width,
          height: size.height,
          seed,
        };
      }

      if (progress.status === 'failed') {
        throw new Error(progress.error || '图片生成失败');
      }

      await this.delay(pollingConfig.interval);
    }

    throw new Error('图片生成超时');
  }

  get polling() {
    return {
      interval: 2000,
      maxDuration: 300000,
      initialDelay: 1000,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ComfyUIProvider;
