/**
 * ComfyUI 生图工作流模板（API 格式）。
 *
 * 两份模板来自 comfyui/ 目录下用户导出的工作流，节点 id 与原文件一一对应：
 *   - krea2（参考风格生图）：提示词（可带参考图）→ TextGenerate(LLM 反推/润色提示词)
 *     → Krea2 采样 → SaveImage。参考图为可选输入（没有时摘除 LoadImage 与连线）。
 *   - z-image（文生图）：纯文生图（Z-Image Turbo）。
 *
 * 可变值（提示词/参考图/比例/清晰度/种子/张数）由 applyComfyTTIWorkflowParams 注入。
 */
import type { ComfyWorkflow } from '../../itv/comfyui/types';

export type ComfyTTIWorkflowId = 'krea2' | 'z-image';

export function createComfyTTIWorkflow(id: ComfyTTIWorkflowId): ComfyWorkflow {
  return id === 'z-image' ? createZImageWorkflow() : createKrea2Workflow();
}

function createKrea2Workflow(): ComfyWorkflow {
  return {
    '1': {
      inputs: {
        seed: 885311883761491,
        steps: 8,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
        model: ['8', 0],
        positive: ['10', 0],
        negative: ['2', 0],
        latent_image: ['7', 0],
      },
      class_type: 'KSampler',
      _meta: { title: 'K采样器' },
    },
    '2': {
      inputs: {
        text: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
        clip: ['9', 0],
      },
      class_type: 'CLIPTextEncode',
      _meta: { title: '负面提示词' },
    },
    '3': {
      inputs: { vae_name: 'qwen_image_vae.safetensors' },
      class_type: 'VAELoader',
      _meta: { title: '加载VAE' },
    },
    '4': {
      inputs: { samples: ['1', 0], vae: ['3', 0] },
      class_type: 'VAEDecode',
      _meta: { title: 'VAE解码' },
    },
    '6': {
      inputs: { aspect_ratio: '16:9 (Widescreen)', megapixels: 1, multiple: 8 },
      class_type: 'ResolutionSelector',
      _meta: { title: '分辨率' },
    },
    '7': {
      inputs: { width: ['6', 0], height: ['6', 1], batch_size: 1 },
      class_type: 'EmptyLatentImage',
      _meta: { title: '空Latent' },
    },
    '8': {
      inputs: { unet_name: 'krea2_turbo_bf16.safetensors', weight_dtype: 'default' },
      class_type: 'UNETLoader',
      _meta: { title: 'UNet加载器' },
    },
    '9': {
      inputs: { clip_name: 'qwen3vl_4b_bf16.safetensors', type: 'krea2', device: 'default' },
      class_type: 'CLIPLoader',
      _meta: { title: '加载CLIP' },
    },
    '10': {
      inputs: { text: ['19:11', 0], clip: ['9', 0] },
      class_type: 'CLIPTextEncode',
      _meta: { title: '正面提示词（TextGenerate 润色）' },
    },
    '13': {
      inputs: { image: '' },
      class_type: 'LoadImage',
      _meta: { title: '加载图像（参考图）' },
    },
    '14': {
      inputs: { value: '' },
      class_type: 'PrimitiveStringMultiline',
      _meta: { title: '提示词' },
    },
    '21': {
      inputs: { seed: 899980584136305 },
      class_type: 'SeedNode',
      _meta: { title: '种子' },
    },
    '22': {
      inputs: { filename_prefix: 'ref_create', images: ['4', 0] },
      class_type: 'SaveImage',
      _meta: { title: '保存图像' },
    },
    '19:15': {
      inputs: { string_a: ['19:16', 0], string_b: ['19:17', 0], delimiter: '' },
      class_type: 'StringConcatenate',
      _meta: { title: '系统提示词 + 用户输入' },
    },
    '19:16': {
      inputs: {
        value: '# 角色设定\n你是一位专业的 AI 绘图提示词工程师，精通 Midjourney / Stable Diffusion / Krea AI 等主流绘图模型的提示词撰写与优化。\n\n# 核心任务\n根据用户的输入内容，自动判断执行以下两种模式之一，**一次性输出完整结果，不追问用户任何问题**。\n\n---\n\n## 模式一：图像提示词反推模式（触发条件：用户上传了图片）\n当用户上传图片时，直接对图片进行深度分析，反推出可用于复现该图片风格和内容的完整中文提示词。\n\n### 输出格式：\n`[完整中文提示词]`\n\n### 反推原则：\n- 描述具体、可量化，包含主体、场景、光影、色彩、风格、画质等维度\n- 若用户同时输入了文字描述，将其作为补充参考纳入提示词生成\n- 只输出提示词本身，不输出任何分析过程、标题、标注或额外内容\n\n---\n\n## 模式二：文字提示词润色模式（触发条件：用户只输入文字）\n当用户只输入文字时，将用户的简短描述扩写为细节丰富、可直接用于生成的高质量中文提示词。\n\n### 输出格式：\n`[完整中文提示词]`\n\n### 润色原则：\n- 保留用户原意，只做合理扩充（主体、场景、光影、色彩、风格、画质）\n- 只输出提示词本身，不输出任何分析过程、标题、标注或额外内容',
      },
      class_type: 'PrimitiveStringMultiline',
      _meta: { title: 'TextGenerate 系统提示词' },
    },
    '19:17': {
      inputs: { string_a: '用户输入：', string_b: ['14', 0], delimiter: '，' },
      class_type: 'StringConcatenate',
      _meta: { title: '拼接用户输入' },
    },
    '19:12': {
      inputs: { clip_name: 'qwen3vl_8b_fp8_scaled.safetensors', type: 'krea2', device: 'default' },
      class_type: 'CLIPLoader',
      _meta: { title: '加载CLIP（TextGenerate）' },
    },
    '19:11': {
      inputs: {
        prompt: ['19:15', 0],
        max_length: 512,
        'sampling_mode': 'on',
        'sampling_mode.temperature': 0.7,
        'sampling_mode.top_k': 64,
        'sampling_mode.top_p': 0.95,
        'sampling_mode.min_p': 0.05,
        'sampling_mode.repetition_penalty': 1.05,
        'sampling_mode.seed': ['21', 0],
        'sampling_mode.presence_penalty': 0,
        thinking: false,
        use_default_template: false,
        clip: ['19:12', 0],
        image: ['13', 0],
      },
      class_type: 'TextGenerate',
      _meta: { title: '提示词反推/润色' },
    },
  };
}

function createZImageWorkflow(): ComfyWorkflow {
  return {
    '9': {
      inputs: { filename_prefix: 'ComfyUI', images: ['65', 0] },
      class_type: 'SaveImage',
      _meta: { title: '保存图像' },
    },
    '62': {
      inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' },
      class_type: 'CLIPLoader',
      _meta: { title: '加载CLIP' },
    },
    '63': {
      inputs: { vae_name: 'ae.safetensors' },
      class_type: 'VAELoader',
      _meta: { title: '加载VAE' },
    },
    '65': {
      inputs: { samples: ['70', 0], vae: ['63', 0] },
      class_type: 'VAEDecode',
      _meta: { title: 'VAE解码' },
    },
    '66': {
      inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' },
      class_type: 'UNETLoader',
      _meta: { title: 'UNet加载器' },
    },
    '67': {
      inputs: { text: '', clip: ['62', 0] },
      class_type: 'CLIPTextEncode',
      _meta: { title: '正面提示词' },
    },
    '68': {
      inputs: { width: 1024, height: 1024, batch_size: 1 },
      class_type: 'EmptySD3LatentImage',
      _meta: { title: '空Latent（SD3）' },
    },
    '69': {
      inputs: { shift: 3, model: ['66', 0] },
      class_type: 'ModelSamplingAuraFlow',
      _meta: { title: 'AuraFlow 采样偏移' },
    },
    '70': {
      inputs: {
        seed: 42,
        steps: 8,
        cfg: 1,
        sampler_name: 'res_multistep',
        scheduler: 'simple',
        denoise: 1,
        model: ['69', 0],
        positive: ['67', 0],
        negative: ['71', 0],
        latent_image: ['68', 0],
      },
      class_type: 'KSampler',
      _meta: { title: 'K采样器' },
    },
    '71': {
      inputs: { text: 'low quality, bad anatomy, extra digits, missing digits, extra limbs, missing limbs', clip: ['62', 0] },
      class_type: 'CLIPTextEncode',
      _meta: { title: '负面提示词' },
    },
  };
}

/** 通过模型名/配置推断工作流：modelDefaults.workflowId 优先，其次按 modelName 匹配 */
export function resolveComfyTTIWorkflowId(modelName?: string, workflowIdOverride?: string): ComfyTTIWorkflowId {
  const override = String(workflowIdOverride || '').trim().toLowerCase();
  if (override === 'z-image' || override === 'zimage' || override === 'z_image') return 'z-image';
  if (override === 'krea2' || override === 'krea') return 'krea2';
  const name = String(modelName || '').toLowerCase();
  if (name.includes('z-image') || name.includes('z_image') || name.includes('zimage')) return 'z-image';
  return 'krea2';
}
