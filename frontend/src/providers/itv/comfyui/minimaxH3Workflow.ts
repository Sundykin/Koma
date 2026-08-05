/**
 * ComfyUI 内置工作流模板：MiniMax H3 多图参考生视频
 *
 * 来源：comfyui/MiniMax_H3_多图参考生视频.json（ComfyUI「导出（API）」格式），
 * 节点 id 与原文件一一对应，方便在 ComfyUI 画布上对照排查。模板里的可变值
 * （提示词、参考图文件名、时长、比例、随机种子）都会在 start() 时由
 * workflowBinding 覆盖，这里留占位值。
 *
 * 工作流结构：
 *   138 提示词(PrimitiveStringMultiline) ┐
 *   137/139 参考图(LoadImage) ───────────┤
 *   115 分辨率(ResolutionSelector) ──────├→ 136 MiniMaxH3ReferenceToVideo → 125 采样
 *   132 时长(PrimitiveFloat) → 131 帧数换算(ComfyMathExpression) ┘        ↓
 *   → 122 VAE解码(画面) + 121 VAE解码(音频) → 141 VHS_VideoCombine(合并为视频)
 *
 * 关键约束（取自实例 /object_info）：
 *   - ref_images 是 COMFY_AUTOGROW_V3 动态输入（prefix `ref_image_`，最多 9 张）。
 *     模板只连了 2 张，**无需改工作流**：提交时由 applyComfyWorkflowParams 按需
 *     追加 ref_images.ref_image_N 与配套 LoadImage 节点，最多扩到 9 张。
 *   - length 是 24fps 下的帧数，min 5 / step 17，训练区间 ~124-362（≈5-15s），
 *     由 131 的表达式从秒数换算，故只需设置 132 的秒数。
 *   - 成片由 VHS_VideoCombine 输出，history 里挂在 outputs[141].gifs 下。
 */
import type { ComfyWorkflow } from './types';

export const MINIMAX_H3_WORKFLOW_ID = 'minimax-h3-reference-to-video';

export function createMiniMaxH3Workflow(): ComfyWorkflow {
  return {
    '115': {
      inputs: {
        aspect_ratio: '16:9 (Widescreen)',
        megapixels: 0.8,
        multiple: 32,
      },
      class_type: 'ResolutionSelector',
      _meta: { title: 'Resolution Selector (Size)' },
    },
    '119': {
      inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' },
      class_type: 'VAELoader',
      _meta: { title: '加载VAE' },
    },
    '120': {
      inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' },
      class_type: 'VAELoader',
      _meta: { title: '加载VAE' },
    },
    '121': {
      inputs: { samples: ['125', 0], vae: ['120', 0] },
      class_type: 'VAEDecodeAudio',
      _meta: { title: 'VAE解码（音频）' },
    },
    '122': {
      inputs: { samples: ['125', 0], vae: ['119', 0] },
      class_type: 'VAEDecode',
      _meta: { title: 'VAE解码' },
    },
    '123': {
      inputs: { sampler_name: 'res_multistep' },
      class_type: 'KSamplerSelect',
      _meta: { title: 'K采样器选择' },
    },
    '124': {
      inputs: {
        scheduler: 'simple',
        steps: 20,
        denoise: 1,
        model: ['127', 0],
      },
      class_type: 'BasicScheduler',
      _meta: { title: '基本调度器' },
    },
    '125': {
      inputs: {
        noise: ['129', 0],
        guider: ['126', 0],
        sampler: ['123', 0],
        sigmas: ['124', 0],
        latent_image: ['136', 1],
      },
      class_type: 'SamplerCustomAdvanced',
      _meta: { title: '自定义采样器（高级）' },
    },
    '126': {
      inputs: { model: ['127', 0], conditioning: ['136', 0] },
      class_type: 'BasicGuider',
      _meta: { title: '基本引导器' },
    },
    '127': {
      inputs: {
        unet_name: 'minimax_h3_ref2va_int8_convrot.safetensors',
        weight_dtype: 'default',
      },
      class_type: 'UNETLoader',
      _meta: { title: 'UNet加载器' },
    },
    '128': {
      inputs: {
        clip_name: 'qwen3vl_32b_minimax_h3_int8_convrot.safetensors',
        type: 'minimax',
        device: 'default',
      },
      class_type: 'CLIPLoader',
      _meta: { title: '加载CLIP' },
    },
    '129': {
      inputs: { noise_seed: 118726426138455 },
      class_type: 'RandomNoise',
      _meta: { title: '随机噪波' },
    },
    '131': {
      inputs: {
        expression: 'max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17',
        'values.a': ['132', 0],
      },
      class_type: 'ComfyMathExpression',
      _meta: { title: '数学表达式' },
    },
    '132': {
      inputs: { value: 6 },
      class_type: 'PrimitiveFloat',
      _meta: { title: 'Float (Duration)' },
    },
    '136': {
      inputs: {
        prompt: ['138', 0],
        width: ['115', 0],
        height: ['115', 1],
        length: ['131', 1],
        ref_image_size: 'match',
        clip: ['128', 0],
        vae: ['119', 0],
        audio_vae: ['120', 0],
        'ref_images.ref_image_0': ['137', 0],
        'ref_images.ref_image_1': ['139', 0],
      },
      class_type: 'MiniMaxH3ReferenceToVideo',
      _meta: { title: 'MiniMax H3 Reference to Video' },
    },
    '137': {
      inputs: { image: '' },
      class_type: 'LoadImage',
      _meta: { title: '加载图像' },
    },
    '138': {
      inputs: { value: '' },
      class_type: 'PrimitiveStringMultiline',
      _meta: { title: 'Input Text (Prompt)' },
    },
    '139': {
      inputs: { image: '' },
      class_type: 'LoadImage',
      _meta: { title: '加载图像' },
    },
    '141': {
      inputs: {
        frame_rate: 24,
        loop_count: 0,
        filename_prefix: 'mm_h3_r2v',
        format: 'video/h264-mp4',
        pix_fmt: 'yuv420p',
        crf: 19,
        save_metadata: true,
        trim_to_audio: false,
        pingpong: false,
        save_output: true,
        images: ['122', 0],
        audio: ['121', 0],
      },
      class_type: 'VHS_VideoCombine',
      _meta: { title: '合并为视频' },
    },
  };
}
