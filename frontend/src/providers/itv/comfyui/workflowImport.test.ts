import { describe, expect, it } from 'vitest';
import {
  parseComfyWorkflowJson,
  analyzeComfyWorkflow,
  applyComfyImageParams,
} from './workflowImport';
import { createComfyTTIWorkflow } from '../../tti/comfyui/workflows';
import { createMiniMaxH3Workflow } from './minimaxH3Workflow';

describe('parseComfyWorkflowJson', () => {
  it('解析合法 API 格式 JSON', () => {
    const text = JSON.stringify({ '1': { class_type: 'SaveImage', inputs: { images: ['2', 0] } } });
    const result = parseComfyWorkflowJson(text);
    expect(result.ok).toBe(true);
    expect(result.workflow?.['1'].class_type).toBe('SaveImage');
  });

  it('拒绝非 JSON / 界面格式（无 class_type）', () => {
    expect(parseComfyWorkflowJson('not json').ok).toBe(false);
    expect(parseComfyWorkflowJson('{}').ok).toBe(false);
    // 界面格式：nodes 是数组
    expect(parseComfyWorkflowJson('{"nodes": []}').ok).toBe(false);
    const uiFormat = JSON.stringify({ '1': { type: 'SaveImage', widgets_values: [] } });
    const result = parseComfyWorkflowJson(uiFormat);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('API 格式');
  });
});

describe('analyzeComfyWorkflow - krea2 参考风格生图', () => {
  const workflow = createComfyTTIWorkflow('krea2');
  const analysis = analyzeComfyWorkflow(workflow);

  it('识别为图片输出，输出节点为 SaveImage 22', () => {
    expect(analysis.kind).toBe('image');
    expect(analysis.outputNodeIds).toContain('22');
  });

  it('提示词：穿透 TextGenerate 润色链定位到用户输入节点 14', () => {
    expect(analysis.prompt?.nodeId).toBe('14');
    expect(analysis.prompt?.field).toBe('value');
    // 不能误选系统提示词节点 19:16
    expect(analysis.prompt?.nodeId).not.toBe('19:16');
  });

  it('负面提示词：CLIPTextEncode 2（挂在 sampler negative）', () => {
    expect(analysis.negativePrompt?.nodeId).toBe('2');
  });

  it('种子：KSampler 1 与 SeedNode 21 都识别', () => {
    const seedIds = analysis.seeds.map(s => s.nodeId);
    expect(seedIds).toContain('1');
    expect(seedIds).toContain('21');
  });

  it('尺寸：EmptyLatentImage 7（宽高为连线）+ ResolutionSelector 6', () => {
    expect(analysis.sizeNode?.nodeId).toBe('7');
    expect(analysis.sizeDimsLinked).toBe(true);
    expect(analysis.aspectNode?.nodeId).toBe('6');
  });

  it('参考图：LoadImage 13', () => {
    expect(analysis.referenceImages.map(r => r.nodeId)).toEqual(['13']);
  });
});

describe('analyzeComfyWorkflow - Z-Image 文生图', () => {
  const analysis = analyzeComfyWorkflow(createComfyTTIWorkflow('z-image'));

  it('提示词直接落在 CLIPTextEncode 67', () => {
    expect(analysis.prompt?.nodeId).toBe('67');
    expect(analysis.prompt?.field).toBe('text');
  });

  it('尺寸节点 68（宽高直连）且无 ResolutionSelector', () => {
    expect(analysis.sizeNode?.nodeId).toBe('68');
    expect(analysis.sizeDimsLinked).toBe(false);
    expect(analysis.aspectNode).toBeUndefined();
  });

  it('无参考图节点', () => {
    expect(analysis.referenceImages).toHaveLength(0);
  });
});

describe('analyzeComfyWorkflow - MiniMax H3 视频工作流', () => {
  const analysis = analyzeComfyWorkflow(createMiniMaxH3Workflow());

  it('识别为视频输出', () => {
    expect(analysis.kind).toBe('video');
  });

  it('识别参考图 LoadImage 节点与时长/帧率', () => {
    expect(analysis.referenceImages.length).toBeGreaterThanOrEqual(2);
    expect(analysis.duration).toBeDefined();
    expect(analysis.fps).toBeDefined();
  });
});

describe('applyComfyImageParams', () => {
  it('krea2 无参考图：摘除 LoadImage 13 与 TextGenerate.image 连线', () => {
    const analysis = analyzeComfyWorkflow(createComfyTTIWorkflow('krea2'));
    const next = applyComfyImageParams(createComfyTTIWorkflow('krea2'), analysis, {
      prompt: '一只猫',
      seed: 42,
      count: 2,
      aspectRatio: '16:9',
      imageSize: '2K',
    });
    expect(next['14'].inputs.value).toBe('一只猫');
    expect(next['13']).toBeUndefined();
    expect(next['19:11'].inputs.image).toBeUndefined();
    expect(next['1'].inputs.seed).toBe(42);
    expect(next['21'].inputs.seed).toBe(42);
    expect(next['7'].inputs.batch_size).toBe(2);
    expect(next['6'].inputs.aspect_ratio).toBe('16:9 (Widescreen)');
    expect(next['6'].inputs.megapixels).toBe(1.0);
    // 宽高是连线的不直接改写
    expect(next['7'].inputs.width).toEqual(['6', 0]);
  });

  it('krea2 有参考图：填入 LoadImage，多余参考图忽略', () => {
    const analysis = analyzeComfyWorkflow(createComfyTTIWorkflow('krea2'));
    const next = applyComfyImageParams(createComfyTTIWorkflow('krea2'), analysis, {
      prompt: '参考这张图',
      referenceImages: ['a.png', 'b.png'],
      seed: 1,
    });
    expect(next['13'].inputs.image).toBe('a.png');
    expect(next['19:11'].inputs.image).toEqual(['13', 0]);
  });

  it('z-image：按 9:16 + 1K 缩放直写宽高，批量写入 batch_size', () => {
    const analysis = analyzeComfyWorkflow(createComfyTTIWorkflow('z-image'));
    const next = applyComfyImageParams(createComfyTTIWorkflow('z-image'), analysis, {
      prompt: '小狐狸',
      seed: 7,
      count: 3,
      aspectRatio: '9:16',
      imageSize: '1K',
    });
    expect(next['67'].inputs.text).toBe('小狐狸');
    expect(next['68'].inputs.width).toBe(Math.round(768 * 0.75));
    expect(next['68'].inputs.height).toBe(Math.round(1344 * 0.75));
    expect(next['68'].inputs.batch_size).toBe(3);
    expect(next['70'].inputs.seed).toBe(7);
  });

  it('显式 negativePrompt 才覆盖模板内置负面词', () => {
    const analysis = analyzeComfyWorkflow(createComfyTTIWorkflow('z-image'));
    const original = createComfyTTIWorkflow('z-image')['71'].inputs.text;
    const untouched = applyComfyImageParams(createComfyTTIWorkflow('z-image'), analysis, { prompt: 'x' });
    expect(untouched['71'].inputs.text).toBe(original);
    const overridden = applyComfyImageParams(createComfyTTIWorkflow('z-image'), analysis, {
      prompt: 'x',
      negativePrompt: 'nsfw',
    });
    expect(overridden['71'].inputs.text).toBe('nsfw');
  });

  it('overrides：promptNodeId / seedNodeIds 覆盖自动识别', () => {
    const analysis = analyzeComfyWorkflow(createComfyTTIWorkflow('z-image'));
    const next = applyComfyImageParams(createComfyTTIWorkflow('z-image'), analysis, {
      prompt: '覆盖提示词',
      seed: 99,
    }, {
      promptNodeId: '71', // 故意指到负面节点验证覆盖生效
      seedNodeIds: ['70'],
    });
    expect(next['71'].inputs.text).toBe('覆盖提示词');
    expect(next['70'].inputs.seed).toBe(99);
  });

  it('不改入参模板', () => {
    const template = createComfyTTIWorkflow('z-image');
    const analysis = analyzeComfyWorkflow(template);
    applyComfyImageParams(template, analysis, { prompt: '新提示词', seed: 1 });
    expect(template['67'].inputs.text).toBe('');
    expect(template['70'].inputs.seed).toBe(42);
  });
});
