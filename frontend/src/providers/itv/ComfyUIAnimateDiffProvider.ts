/**
 * ComfyUI AnimateDiff ITV Provider
 * 本地部署的 ComfyUI + AnimateDiff 工作流
 */
import type {
  ITVConfig,
  ITVOptions,
  VideoResult,
  ProgressInfo,
} from '../../types';
import type { ITVProvider } from './types';

// AnimateDiff 工作流配置
interface AnimateDiffWorkflow {
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  seed: number;
  frames: number;
  fps: number;
  motion_module: string;
  image?: string; // base64 输入图片
}

export class ComfyUIAnimateDiffProvider implements ITVProvider {
  type = 'comfyui-animatediff' as const;
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.getBaseUrl();
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'http://127.0.0.1:8188';
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/system_stats`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 将图片转换为 base64
   */
  private async imageToBase64(imagePath: string): Promise<string> {
    const response = await fetch(imagePath);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 构建 AnimateDiff 工作流 JSON
   */
  private buildWorkflow(params: AnimateDiffWorkflow): object {
    // 简化的 AnimateDiff + img2vid 工作流结构
    return {
      "3": {
        "inputs": {
          "seed": params.seed,
          "steps": params.steps,
          "cfg": params.cfg_scale,
          "sampler_name": "euler",
          "scheduler": "normal",
          "denoise": 0.75,
          "model": ["4", 0],
          "positive": ["6", 0],
          "negative": ["7", 0],
          "latent_image": ["12", 0]
        },
        "class_type": "KSampler"
      },
      "4": {
        "inputs": {
          "ckpt_name": "sd15/realisticVisionV51_v51VAE.safetensors"
        },
        "class_type": "CheckpointLoaderSimple"
      },
      "5": {
        "inputs": {
          "model_name": params.motion_module
        },
        "class_type": "ADE_LoadAnimateDiffModel"
      },
      "6": {
        "inputs": {
          "text": params.prompt,
          "clip": ["4", 1]
        },
        "class_type": "CLIPTextEncode"
      },
      "7": {
        "inputs": {
          "text": params.negative_prompt || "bad quality, blurry, distorted",
          "clip": ["4", 1]
        },
        "class_type": "CLIPTextEncode"
      },
      "8": {
        "inputs": {
          "samples": ["3", 0],
          "vae": ["4", 2]
        },
        "class_type": "VAEDecode"
      },
      "9": {
        "inputs": {
          "frame_rate": params.fps,
          "images": ["8", 0]
        },
        "class_type": "VHS_VideoCombine"
      },
      "12": {
        "inputs": {
          "width": params.width,
          "height": params.height,
          "batch_size": params.frames
        },
        "class_type": "EmptyLatentImage"
      }
    };
  }

  async generate(
    imagePath: string,
    prompt: string,
    options?: ITVOptions
  ): Promise<string> {
    const baseUrl = this.getBaseUrl();

    // 构建工作流参数
    const duration = options?.duration || this.config.defaultDuration || 4;
    const fps = options?.fps || 8;
    const frames = duration * fps;

    const workflow = this.buildWorkflow({
      prompt,
      negative_prompt: options?.negativePrompt,
      width: options?.width || 512,
      height: options?.height || 512,
      steps: 20,
      cfg_scale: 7,
      seed: options?.seed || Math.floor(Math.random() * 1000000000),
      frames,
      fps,
      motion_module: 'mm_sd_v15_v2.ckpt',
      image: await this.imageToBase64(imagePath),
    });

    // 提交任务到 ComfyUI
    const response = await fetch(`${baseUrl}/prompt`, {
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
      const error = await response.text();
      throw new Error(`ComfyUI 提交失败: ${error}`);
    }

    const data = await response.json();
    return data.prompt_id;
  }

  async checkProgress(taskId: string): Promise<ProgressInfo> {
    const baseUrl = this.getBaseUrl();

    // 查询历史记录
    const response = await fetch(`${baseUrl}/history/${taskId}`);

    if (!response.ok) {
      return {
        status: 'processing',
        progress: 0,
      };
    }

    const data = await response.json();
    const result = data[taskId];

    if (!result) {
      return {
        status: 'queued',
        progress: 0,
      };
    }

    if (result.status?.completed) {
      // 获取输出视频路径
      const outputs = result.outputs;
      let videoUrl: string | undefined;

      // 查找视频输出节点
      for (const nodeId in outputs) {
        const nodeOutput = outputs[nodeId];
        if (nodeOutput.gifs?.[0]) {
          videoUrl = `${baseUrl}/view?filename=${nodeOutput.gifs[0].filename}&type=output`;
          break;
        }
        if (nodeOutput.videos?.[0]) {
          videoUrl = `${baseUrl}/view?filename=${nodeOutput.videos[0].filename}&type=output`;
          break;
        }
      }

      return {
        status: 'completed',
        progress: 100,
        resultUrl: videoUrl,
      };
    }

    if (result.status?.status_str === 'error') {
      return {
        status: 'failed',
        progress: 0,
        error: result.status.messages?.[0]?.[1] || '生成失败',
      };
    }

    // 计算进度
    const executing = result.status?.executing || false;
    const progress = executing ? 50 : 10;

    return {
      status: 'processing',
      progress,
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    const baseUrl = this.getBaseUrl();
    await fetch(`${baseUrl}/interrupt`, {
      method: 'POST',
    });
  }
}
