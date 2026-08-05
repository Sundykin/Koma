import { describe, expect, it } from 'vitest';
import { createMiniMaxH3Workflow } from './minimaxH3Workflow';
import {
  applyComfyWorkflowParams,
  normalizeAspectRatioOption,
  normalizeMegapixels,
  resolveComfyBindings,
} from './workflowBinding';
import type { ComfyWorkflow } from './types';

describe('resolveComfyBindings', () => {
  it('resolves bindings from the MiniMax H3 template topology', () => {
    const bindings = resolveComfyBindings(createMiniMaxH3Workflow());

    expect(bindings.hostNodeId).toBe('136');
    expect(bindings.promptNodeId).toBe('138');
    expect(bindings.promptField).toBe('value');
    expect(bindings.resolutionNodeId).toBe('115');
    // 时长要穿过帧数换算节点 131 的 values.a 才拿到秒数节点 132
    expect(bindings.durationNodeId).toBe('132');
    expect(bindings.seedNodeId).toBe('129');
    expect(bindings.seedField).toBe('noise_seed');
    expect(bindings.stepsNodeId).toBe('124');
    // VideoHelperSuite 的帧率字段是 frame_rate，不是核心 CreateVideo 的 fps
    expect(bindings.fpsNodeId).toBe('141');
    expect(bindings.fpsField).toBe('frame_rate');
    // 模板只连了 2 个参考图槽位
    expect(bindings.referenceSlots.map(s => s.nodeId)).toEqual(['137', '139']);
  });

  it('binds fps to CreateVideo.fps for core-node workflows', () => {
    const bindings = resolveComfyBindings({
      '1': { class_type: 'CreateVideo', inputs: { fps: 24 } },
    });
    expect(bindings.fpsNodeId).toBe('1');
    expect(bindings.fpsField).toBe('fps');
  });

  it('honors explicit node binding overrides', () => {
    const bindings = resolveComfyBindings(createMiniMaxH3Workflow(), { promptNodeId: '999', promptField: 'text' });
    expect(bindings.promptNodeId).toBe('999');
    expect(bindings.promptField).toBe('text');
  });

  it('falls back to class scanning for workflows without a reference host', () => {
    const workflow: ComfyWorkflow = {
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
      '2': { class_type: 'LoadImage', inputs: { image: '' } },
      '3': { class_type: 'KSampler', inputs: { seed: 1, steps: 20 } },
    };
    const bindings = resolveComfyBindings(workflow);

    expect(bindings.hostNodeId).toBeUndefined();
    expect(bindings.promptNodeId).toBe('1');
    expect(bindings.promptField).toBe('text');
    expect(bindings.seedNodeId).toBe('3');
    expect(bindings.seedField).toBe('seed');
    expect(bindings.referenceSlots.map(s => s.nodeId)).toEqual(['2']);
  });
});

describe('normalizeAspectRatioOption', () => {
  it('maps short ratios to ComfyUI combo options', () => {
    expect(normalizeAspectRatioOption('16:9')).toBe('16:9 (Widescreen)');
    expect(normalizeAspectRatioOption('9:16')).toBe('9:16 (Portrait Widescreen)');
    expect(normalizeAspectRatioOption('1:1')).toBe('1:1 (Square)');
    expect(normalizeAspectRatioOption('21:9')).toBe('21:9 (Ultrawide)');
    expect(normalizeAspectRatioOption('portrait')).toBe('9:16 (Portrait Widescreen)');
  });

  it('passes through full combo values and rejects unknown ratios', () => {
    expect(normalizeAspectRatioOption('16:9 (Widescreen)')).toBe('16:9 (Widescreen)');
    expect(normalizeAspectRatioOption('7:5')).toBeUndefined();
    expect(normalizeAspectRatioOption('')).toBeUndefined();
  });
});

describe('normalizeMegapixels', () => {
  it('maps resolution tiers and pixel sizes', () => {
    expect(normalizeMegapixels('720p')).toBe(0.9);
    expect(normalizeMegapixels('1080p')).toBe(2.0);
    expect(normalizeMegapixels('1920x1080')).toBe(2.1);
    expect(normalizeMegapixels('unknown')).toBeUndefined();
  });

  it('clamps pixel sizes into the node range', () => {
    expect(normalizeMegapixels('64x64')).toBe(0.1);
    expect(normalizeMegapixels('8000x8000')).toBe(16);
  });
});

describe('applyComfyWorkflowParams', () => {
  const template = createMiniMaxH3Workflow();
  const bindings = resolveComfyBindings(template);

  it('writes prompt, duration, ratio, seed and references without mutating the template', () => {
    const result = applyComfyWorkflowParams(template, bindings, {
      prompt: '一只猫在草地奔跑',
      referenceImages: ['a.png', 'b.png'],
      durationSec: 8,
      aspectRatio: '9:16',
      resolution: '720p',
      seed: 42,
      fps: 30,
      steps: 30,
    });

    expect(result['138'].inputs.value).toBe('一只猫在草地奔跑');
    expect(result['132'].inputs.value).toBe(8);
    expect(result['115'].inputs.aspect_ratio).toBe('9:16 (Portrait Widescreen)');
    expect(result['115'].inputs.megapixels).toBe(0.9);
    expect(result['129'].inputs.noise_seed).toBe(42);
    expect(result['124'].inputs.steps).toBe(30);
    expect(result['141'].inputs.frame_rate).toBe(30);
    expect(result['137'].inputs.image).toBe('a.png');
    expect(result['139'].inputs.image).toBe('b.png');

    // 模板本身不能被改动
    expect(template['138'].inputs.value).toBe('');
    expect(template['137'].inputs.image).toBe('');
  });

  it('prunes unused reference slots and orphan LoadImage nodes', () => {
    const result = applyComfyWorkflowParams(template, bindings, {
      prompt: 'x',
      referenceImages: ['only.png'],
    });

    expect(result['136'].inputs['ref_images.ref_image_0']).toEqual(['137', 0]);
    expect(result['136'].inputs['ref_images.ref_image_1']).toBeUndefined();
    // 未使用的 LoadImage 节点被删除，避免指向不存在的文件
    expect(result['139']).toBeUndefined();
    expect(result['137']).toBeTruthy();
  });

  it('drops every reference slot for text-to-video', () => {
    const result = applyComfyWorkflowParams(template, bindings, { prompt: 'x', referenceImages: [] });

    const refKeys = Object.keys(result['136'].inputs).filter(k => k.startsWith('ref_images.'));
    expect(refKeys).toEqual([]);
    expect(Object.values(result).filter(n => n.class_type === 'LoadImage')).toHaveLength(0);
    // 非参考图节点不受影响
    expect(result['136'].inputs.prompt).toEqual(['138', 0]);
  });

  /**
   * 核心诉求：模板只画了 2 个参考图槽位，但 ref_images 是 autogrow（max 9），
   * 所以不改工作流也要能喂满 9 张 —— 由这里的扩展逻辑在提交前补齐节点与连线。
   */
  it('grows the 2-slot template up to 9 references without editing the workflow', () => {
    const images = Array.from({ length: 9 }, (_, i) => `ref-${i}.png`);
    const result = applyComfyWorkflowParams(template, bindings, { prompt: 'x', referenceImages: images });

    const refKeys = Object.keys(result['136'].inputs).filter(k => k.startsWith('ref_images.'));
    expect(refKeys).toHaveLength(9);
    // 模板自带的两个槽位复用原节点
    expect(result['136'].inputs['ref_images.ref_image_0']).toEqual(['137', 0]);
    expect(result['136'].inputs['ref_images.ref_image_1']).toEqual(['139', 0]);
    expect(result['137'].inputs.image).toBe('ref-0.png');
    expect(result['139'].inputs.image).toBe('ref-1.png');
    // 第 3~9 张新建 LoadImage 节点并接上 autogrow 输入
    for (let i = 2; i < 9; i += 1) {
      expect(result['136'].inputs[`ref_images.ref_image_${i}`]).toEqual([`koma_ref_${i}`, 0]);
      expect(result[`koma_ref_${i}`].class_type).toBe('LoadImage');
      expect(result[`koma_ref_${i}`].inputs.image).toBe(`ref-${i}.png`);
    }
    // 索引必须连续无空洞，否则 ComfyUI 的 autogrow 会校验失败
    expect(refKeys.map(k => Number(k.replace('ref_images.ref_image_', ''))).sort((a, b) => a - b))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('caps references at maxReferenceImages', () => {
    const images = Array.from({ length: 12 }, (_, i) => `ref-${i}.png`);
    const result = applyComfyWorkflowParams(template, bindings, {
      prompt: 'x',
      referenceImages: images,
      maxReferenceImages: 9,
    });

    const refKeys = Object.keys(result['136'].inputs).filter(k => k.startsWith('ref_images.'));
    expect(refKeys).toHaveLength(9);
    expect(result['koma_ref_9']).toBeUndefined();
  });

  it('leaves aspect ratio untouched for unsupported ratios', () => {
    const result = applyComfyWorkflowParams(template, bindings, { prompt: 'x', aspectRatio: '7:5' });
    expect(result['115'].inputs.aspect_ratio).toBe('16:9 (Widescreen)');
  });
});
