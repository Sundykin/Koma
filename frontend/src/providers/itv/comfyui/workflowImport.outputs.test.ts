import { describe, expect, it } from 'vitest';
import { analyzeComfyWorkflow, parseComfyWorkflowJson } from './workflowImport';
import type { ComfyWorkflow } from './types';

/**
 * 回归：输出节点识别原来只认 SaveImage / PreviewImage / SaveVideo / VHS_VideoCombine /
 * CreateVideo。用户从 ComfyUI 导出的 z-image 工作流用的是 SaveImageAdvanced，
 * 于是被判成 kind='unknown' 并报"未识别到输出节点"——实际运行时是按 history.outputs
 * 的 images 字段扫的，与类名无关，工作流其实能跑。误报会让用户以为工作流不可用。
 */

const OUTPUT_WARNING = '未识别到输出节点';

function workflowWith(outputClass: string): ComfyWorkflow {
  return {
    '1': { class_type: 'CLIPTextEncode', inputs: { text: 'hello', clip: ['2', 0] } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'x.safetensors' } },
    '3': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, model: ['2', 0], positive: ['1', 0] } },
    '4': { class_type: outputClass, inputs: { images: ['3', 0] } },
  } as unknown as ComfyWorkflow;
}

describe('输出节点识别', () => {
  it.each([
    'SaveImage',
    'PreviewImage',
    'SaveImageAdvanced',
    'SaveImageWebsocket',
    'SaveAnimatedWEBP',
    'Image Save',
  ])('把 %s 认成图像输出', (cls) => {
    const analysis = analyzeComfyWorkflow(workflowWith(cls));
    expect(analysis.kind).toBe('image');
    expect(analysis.warnings.some(w => w.includes(OUTPUT_WARNING))).toBe(false);
  });

  it.each([
    'SaveVideo',
    'VHS_VideoCombine',
    'CreateVideo',
    'SaveWEBM',
  ])('把 %s 认成视频输出', (cls) => {
    expect(analyzeComfyWorkflow(workflowWith(cls)).kind).toBe('video');
  });

  it('图像与视频保存节点并存时按视频算', () => {
    const workflow = {
      ...workflowWith('SaveImageAdvanced'),
      '5': { class_type: 'SaveVideo', inputs: { video: ['3', 0] } },
    } as unknown as ComfyWorkflow;
    expect(analyzeComfyWorkflow(workflow).kind).toBe('video');
  });

  it('SaveAudio 不算图像也不算视频', () => {
    const analysis = analyzeComfyWorkflow(workflowWith('SaveAudio'));
    expect(analysis.kind).toBe('unknown');
    expect(analysis.warnings.some(w => w.includes(OUTPUT_WARNING))).toBe(true);
  });

  it('确实没有保存节点时仍要报警告', () => {
    const workflow = {
      '1': { class_type: 'CLIPTextEncode', inputs: { text: 'hi' } },
    } as unknown as ComfyWorkflow;
    const analysis = analyzeComfyWorkflow(workflow);
    expect(analysis.kind).toBe('unknown');
    expect(analysis.warnings.some(w => w.includes(OUTPUT_WARNING))).toBe(true);
  });
});

describe('用户实际导出的工作流', () => {
  // z-image 文生图：ResolutionSelector + SaveImageAdvanced
  const zImage = JSON.stringify({
    '94': { class_type: 'ResolutionSelector', inputs: { aspect_ratio: '1:1 (Square)', megapixels: 1, multiple: 8 } },
    '95': { class_type: 'SaveImageAdvanced', inputs: { filename_prefix: 'Z_image_base', images: ['76:65', 0] } },
    '76:65': { class_type: 'VAEDecode', inputs: { samples: ['76:69', 0], vae: ['76:63', 0] } },
    '76:63': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    '76:62': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2' } },
    '76:67': { class_type: 'CLIPTextEncode', inputs: { text: 'a photo', clip: ['76:62', 0] } },
    '76:69': { class_type: 'KSampler', inputs: { seed: 443283751722008, steps: 25, cfg: 4, positive: ['76:67', 0] } },
  });

  it('解析通过且识别为图像工作流（不再误报缺输出节点）', () => {
    const parsed = parseComfyWorkflowJson(zImage);
    expect(parsed.ok).toBe(true);
    const analysis = analyzeComfyWorkflow(parsed.workflow!);
    expect(analysis.kind).toBe('image');
    expect(analysis.warnings.some(w => w.includes(OUTPUT_WARNING))).toBe(false);
  });
});
