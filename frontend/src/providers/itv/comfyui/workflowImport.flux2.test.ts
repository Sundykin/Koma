import { describe, expect, it } from 'vitest';
import { analyzeComfyWorkflow, applyComfyImageParams } from './workflowImport';
import type { ComfyWorkflow } from './types';

/**
 * 回归：空 latent 节点的类名各家模型不同（SD3 / Flux2 …），采样器也不止 KSampler。
 * 认不出来的后果是画面比例注入不进去——工作流照跑，但永远出模板里写死的尺寸，
 * 用户改项目比例完全不生效，且没有任何报错。
 */

/** Flux2 文生图骨架：SamplerCustomAdvanced + EmptyFlux2LatentImage + Flux2Scheduler */
function flux2TextToImage(): ComfyWorkflow {
  return {
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['13', 0] } },
    '13': {
      class_type: 'SamplerCustomAdvanced',
      inputs: { noise: ['25', 0], guider: ['22', 0], sigmas: ['48', 0], latent_image: ['47', 0] },
    },
    '47': { class_type: 'EmptyFlux2LatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    '48': { class_type: 'Flux2Scheduler', inputs: { steps: 20, width: 1024, height: 1024 } },
    '25': { class_type: 'RandomNoise', inputs: { noise_seed: 1 } },
    // 提示词识别依赖 conditioning 链路，fixture 要和真实文件一样接到 guider 上
    '22': { class_type: 'BasicGuider', inputs: { model: ['12', 0], conditioning: ['26', 0] } },
    '26': { class_type: 'FluxGuidance', inputs: { guidance: 4, conditioning: ['6', 0] } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: 'hello', clip: ['38', 0] } },
    '38': { class_type: 'CLIPLoader', inputs: { clip_name: 'mistral.safetensors', type: 'flux2' } },
    '12': { class_type: 'UNETLoader', inputs: { unet_name: 'flux2_dev_fp8mixed.safetensors' } },
  } as unknown as ComfyWorkflow;
}

describe('Flux2 文生图工作流', () => {
  it('识别为图像工作流并找到 EmptyFlux2LatentImage 作为尺寸节点', () => {
    const analysis = analyzeComfyWorkflow(flux2TextToImage());
    expect(analysis.kind).toBe('image');
    expect(analysis.sizeNode?.nodeId).toBe('47');
    expect(analysis.sizeDimsLinked).toBe(false);
  });

  it('注入比例时同时改 latent 与 Flux2Scheduler 的尺寸', () => {
    const workflow = flux2TextToImage();
    const analysis = analyzeComfyWorkflow(workflow);
    const next = applyComfyImageParams(workflow, analysis, { prompt: 'x', aspectRatio: '16:9' });

    const latent = next['47'].inputs;
    expect(latent.width).toBeGreaterThan(Number(latent.height));
    // 调度器按尺寸算 sigmas，不同步会用旧分辨率
    expect(next['48'].inputs.width).toBe(latent.width);
    expect(next['48'].inputs.height).toBe(latent.height);
    // 原对象不被修改
    expect(workflow['47'].inputs.width).toBe(1024);
  });

  it('提示词与种子照常注入', () => {
    const workflow = flux2TextToImage();
    const analysis = analyzeComfyWorkflow(workflow);
    const next = applyComfyImageParams(workflow, analysis, { prompt: '一只猫', seed: 42 });
    expect(next['6'].inputs.text).toBe('一只猫');
    expect(next['25'].inputs.noise_seed).toBe(42);
  });
});

describe('Flux2 参考图工作流（尺寸取自参考图）', () => {
  /** 宽高由 GetImageSize 连线过来，不该被比例覆盖 */
  function flux2RefToImage(): ComfyWorkflow {
    return {
      '9': { class_type: 'SaveImage', inputs: { images: ['8', 0] } },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['13', 0] } },
      '13': { class_type: 'SamplerCustomAdvanced', inputs: { guider: ['22', 0], latent_image: ['47', 0] } },
      '22': { class_type: 'BasicGuider', inputs: { conditioning: ['26', 0] } },
      '26': { class_type: 'FluxGuidance', inputs: { conditioning: ['6', 0] } },
      '47': { class_type: 'EmptyFlux2LatentImage', inputs: { width: ['66', 0], height: ['66', 1], batch_size: 1 } },
      '66': { class_type: 'GetImageSize', inputs: { image: ['45', 0] } },
      '45': { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['42', 0] } },
      '42': { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
      '46': { class_type: 'LoadImage', inputs: { image: 'ref2.png' } },
      '6': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    } as unknown as ComfyWorkflow;
  }

  it('宽高是连线时标记 sizeDimsLinked，且不被比例覆盖', () => {
    const workflow = flux2RefToImage();
    const analysis = analyzeComfyWorkflow(workflow);
    expect(analysis.sizeNode?.nodeId).toBe('47');
    expect(analysis.sizeDimsLinked).toBe(true);

    const next = applyComfyImageParams(workflow, analysis, { prompt: 'x', aspectRatio: '16:9' });
    // 尺寸继续跟着参考图走，不能被改成字面量
    expect(Array.isArray(next['47'].inputs.width)).toBe(true);
  });

  it('两个 LoadImage 都被识别为参考图槽位', () => {
    const analysis = analyzeComfyWorkflow(flux2RefToImage());
    expect(analysis.referenceImages.map(r => r.nodeId)).toEqual(['42', '46']);
  });
});
