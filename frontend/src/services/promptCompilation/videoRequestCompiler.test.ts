import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildVideoCapabilityRequest,
  compileWorkflowVideoDomainRequest,
  mapVideoRequestToProviderRequest,
  resolveVideoProtocolCompilationLimit,
} from './videoRequestCompiler';

describe('videoRequestCompiler', () => {

  it('buildVideoCapabilityRequest: validates capability-specific required fields', () => {
    expect(() => buildVideoCapabilityRequest({
      capability: 'video.image-to-video',
      prompt: 'demo',
    })).toThrow('缺少主图输入');

    expect(() => buildVideoCapabilityRequest({
      capability: 'video.reference-to-video',
      prompt: 'demo',
      referenceImages: [],
    })).toThrow('缺少参考图输入');

    expect(() => buildVideoCapabilityRequest({
      capability: 'video.start-end-to-video',
      prompt: 'demo',
      startFrame: 'https://cdn.example.com/start.png',
    })).toThrow('缺少首尾帧输入');
  });

  it('buildVideoCapabilityRequest: passes through valid durations without a spec (grok 白名单吸附已废弃)', () => {
    // 调用方已按所选 ITV 渠道 spec 吸附时长；无 spec 时这里不再往 grok 白名单 [6,10,12,16,20]
    // 吸附（会把 seedance / ComfyUI 的合法值 5、7 等吸错），只做正向整数直通。
    const imageRequest = buildVideoCapabilityRequest({
      capability: 'video.image-to-video',
      prompt: 'demo',
      primaryImage: 'https://cdn.example.com/shot.png',
      options: { duration: 4, aspectRatio: '16:9' },
    });
    expect(imageRequest.options?.duration).toBe(4);

    const textRequest = buildVideoCapabilityRequest({
      capability: 'video.text-to-video',
      prompt: 'demo',
      options: { duration: 18, aspectRatio: '9:16' },
    });
    expect(textRequest.options?.duration).toBe(18);
  });

  it('buildVideoCapabilityRequest: falls back to default duration only for invalid values', () => {
    // duration 键缺失时保持缺失（由上层决定）；给了非法值（0/负数/非数字）才回退到默认 10s
    const missing = buildVideoCapabilityRequest({
      capability: 'video.text-to-video',
      prompt: 'demo',
      options: {},
    });
    expect(missing.options?.duration).toBeUndefined();

    const invalid = buildVideoCapabilityRequest({
      capability: 'video.text-to-video',
      prompt: 'demo',
      options: { duration: 0 },
    });
    expect(invalid.options?.duration).toBe(10);
  });

  it('buildVideoCapabilityRequest: normalizes duration by channel duration spec when provided', () => {
    const request = buildVideoCapabilityRequest({
      capability: 'video.text-to-video',
      prompt: 'demo',
      options: { duration: 3 },
      durationSpec: { kind: 'range', min: 4, max: 15, step: 1, default: 5 },
    });

    expect(request.options?.duration).toBe(4);
  });

  it('compileWorkflowVideoDomainRequest: compiles grok-image-index prompt for image-to-video', () => {
    const compiled = compileWorkflowVideoDomainRequest({
      request: buildVideoCapabilityRequest({
        capability: 'video.image-to-video',
        prompt: '让 @char_hero 在 @scene_city 夜景中移动',
        primaryImage: 'https://cdn.example.com/shot.png',
        additionalReferences: ['https://cdn.example.com/manual-ref.png'],
      }),
      protocol: 'grok-image-index',
      promptCompilation: {
        selectedAssets: [
          { type: 'char', assetId: 'char_hero', source: 'https://cdn.example.com/char.png' },
          { type: 'scene', assetId: 'scene_city', source: 'https://cdn.example.com/scene.png' },
        ],
      },
      maxAdditionalReferences: 3,
    });

    expect(compiled.request.prompt).not.toContain('@Image 1');
    expect(compiled.request.prompt).toContain('@Image 2');
    expect(compiled.request.prompt).toContain('@Image 3');
    expect(compiled.request.additionalReferences?.length).toBeLessThanOrEqual(3);
    expect(compiled.compilationDebug?.protocol).toBe('grok-image-index');
  });

  it('compileWorkflowVideoDomainRequest: compiles grok-image-index prompt for reference-to-video with primary image first', () => {
    const primaryImage = 'https://cdn.example.com/shot.png';
    const compiled = compileWorkflowVideoDomainRequest({
      request: buildVideoCapabilityRequest({
        capability: 'video.reference-to-video',
        prompt: '让 @char_hero 在 @scene_city 夜景中移动',
        referenceImages: [
          primaryImage,
          'https://cdn.example.com/manual-ref.png',
        ],
      }),
      protocol: 'grok-image-index',
      promptCompilation: {
        selectedAssets: [
          { type: 'char', assetId: 'char_hero', source: 'https://cdn.example.com/char.png' },
          { type: 'scene', assetId: 'scene_city', source: 'https://cdn.example.com/scene.png' },
        ],
        primaryReferenceSource: primaryImage,
      },
      maxAdditionalReferences: 3,
    });

    expect(compiled.request.prompt).not.toContain('@Image 1');
    expect(compiled.request.prompt).toContain('@Image 2');
    expect(compiled.request.prompt).toContain('@Image 3');
    expect(compiled.request.referenceImages).toEqual([
      primaryImage,
      'https://cdn.example.com/char.png',
      'https://cdn.example.com/scene.png',
      'https://cdn.example.com/manual-ref.png',
    ]);
    expect(compiled.compilationDebug?.protocol).toBe('grok-image-index');
  });

  it('compileWorkflowVideoDomainRequest: replaces shot asset mentions with readable text for non-grok video providers', () => {
    const compiled = compileWorkflowVideoDomainRequest({
      request: buildVideoCapabilityRequest({
        capability: 'video.image-to-video',
        prompt: '让 @char_hero 在 @scene_city 夜景中移动',
        primaryImage: 'https://cdn.example.com/shot.png',
        additionalReferences: [],
      }),
      promptCompilation: {
        selectedAssets: [
          { type: 'char', assetId: 'char_hero', name: '主角', textValue: '黑衣青年' },
          { type: 'scene', assetId: 'scene_city', name: '城市夜景', textValue: '霓虹闪烁的城市夜景' },
        ],
      },
    });

    expect(compiled.request.prompt).toContain('黑衣青年');
    expect(compiled.request.prompt).toContain('霓虹闪烁的城市夜景');
    expect(compiled.request.prompt).not.toContain('@char_hero');
    expect(compiled.request.prompt).not.toContain('@scene_city');
    expect(compiled.request.additionalReferences).toEqual([]);
  });

  it('resolveVideoProtocolCompilationLimit: supports config override and protocol default', () => {
    expect(resolveVideoProtocolCompilationLimit({
      protocol: 'grok-image-index',
    })).toBe(3);

    expect(resolveVideoProtocolCompilationLimit({
      protocol: 'grok-image-index',
      provider: {
        config: {
          provider: 'grok2api-imagine-itv',
        },
      },
    })).toBe(6);

    expect(resolveVideoProtocolCompilationLimit({
      protocol: 'grok-image-index',
      provider: {
        config: {
          maxAdditionalReferences: 5,
        },
      },
    })).toBe(5);
  });

  it('mapVideoRequestToProviderRequest: 本地素材原样直达 provider —— 图床已下线，不再做远程 URL 归一化', async () => {
    const request = await mapVideoRequestToProviderRequest({
      projectId: 'p1',
      request: buildVideoCapabilityRequest({
        capability: 'video.image-to-video',
        prompt: 'demo',
        primaryImage: { transport: 'data-url', value: 'data:image/png;base64,AA==' },
        additionalReferences: [
          { transport: 'data-url', value: 'data:image/png;base64,AQ==' },
        ],
      }),
    });

    expect(request.primaryImage).toEqual({ transport: 'data-url', value: 'data:image/png;base64,AA==' });
    expect(request.additionalReferences?.[0]).toEqual({ transport: 'data-url', value: 'data:image/png;base64,AQ==' });
  });

  it('mapVideoRequestToProviderRequest: 首尾帧同样原样透传', async () => {
    const request = await mapVideoRequestToProviderRequest({
      projectId: 'p1',
      request: buildVideoCapabilityRequest({
        capability: 'video.start-end-to-video',
        prompt: 'demo',
        startFrame: { transport: 'data-url', value: 'data:image/png;base64,AA==' },
        endFrame: { transport: 'data-url', value: 'data:image/png;base64,AA==' },
      }),
    });

    expect(request.startFrame).toEqual({ transport: 'data-url', value: 'data:image/png;base64,AA==' });
    expect(request.endFrame).toEqual({ transport: 'data-url', value: 'data:image/png;base64,AA==' });
  });

  it('mapVideoRequestToProviderRequest: respects capability shape and optional max reference cap', async () => {
    const imageRequest = await mapVideoRequestToProviderRequest({
      projectId: 'p1',
      request: buildVideoCapabilityRequest({
        capability: 'video.image-to-video',
        prompt: 'demo',
        primaryImage: { transport: 'data-url', value: 'data:image/png;base64,AA==' },
        additionalReferences: [
          { transport: 'data-url', value: 'data:image/png;base64,BB==' },
        ],
      }),
    });

    expect(imageRequest.capability).toBe('video.image-to-video');
    expect(imageRequest.primaryImage?.transport).toBe('data-url');
    expect((imageRequest.additionalReferences || []).length).toBe(1);

    const referenceRequest = await mapVideoRequestToProviderRequest({
      projectId: 'p1',
      request: buildVideoCapabilityRequest({
        capability: 'video.reference-to-video',
        prompt: 'demo',
        referenceImages: [
          'https://cdn.example.com/1.png',
          'https://cdn.example.com/2.png',
          'https://cdn.example.com/3.png',
          'https://cdn.example.com/4.png',
          'https://cdn.example.com/5.png',
        ],
      }),
      maxAdditionalReferences: 2,
    });

    expect(referenceRequest.capability).toBe('video.reference-to-video');
    expect(referenceRequest.referenceImages?.length).toBe(3);
  });
});
