import { describe, expect, it } from 'vitest';
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

  it('buildVideoCapabilityRequest: normalizes duration options to supported AI video values', () => {
    const imageRequest = buildVideoCapabilityRequest({
      capability: 'video.image-to-video',
      prompt: 'demo',
      primaryImage: 'https://cdn.example.com/shot.png',
      options: { duration: 4, aspectRatio: '16:9' },
    });
    expect(imageRequest.options?.duration).toBe(6);

    const textRequest = buildVideoCapabilityRequest({
      capability: 'video.text-to-video',
      prompt: 'demo',
      options: { duration: 18, aspectRatio: '9:16' },
    });
    expect(textRequest.options?.duration).toBe(20);
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

    expect(compiled.request.prompt).toContain('@Image 1');
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

    expect(compiled.request.prompt).toContain('@Image 1');
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
          maxAdditionalReferences: 5,
        },
      },
    })).toBe(5);
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
      transportSupport: {
        primary: true,
        additional: true,
        reference: true,
        start: true,
        end: true,
      },
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
      transportSupport: {
        primary: true,
        additional: true,
        reference: true,
        start: true,
        end: true,
      },
      maxAdditionalReferences: 2,
    });

    expect(referenceRequest.capability).toBe('video.reference-to-video');
    expect(referenceRequest.referenceImages?.length).toBe(3);
  });
});
