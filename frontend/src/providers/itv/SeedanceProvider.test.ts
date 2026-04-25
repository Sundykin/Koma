import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeFetchMock = vi.fn();
const nativeFetchMock = vi.fn();
const fsDownloadFileMock = vi.fn();
const fsReadFileAsBase64Mock = vi.fn();
const fsRemoveMock = vi.fn();
const appGetPathMock = vi.fn();

vi.mock('../../utils/safeFetch', () => ({
  safeFetch: (url: string, init?: RequestInit) => safeFetchMock(url, init),
}));

vi.mock('../../services/electronService', () => ({
  fsDownloadFile: (url: string, destPath: string) => fsDownloadFileMock(url, destPath),
  fsReadFileAsBase64: (path: string) => fsReadFileAsBase64Mock(path),
  fsRemove: (path: string) => fsRemoveMock(path),
  appGetPath: (name: string) => appGetPathMock(name),
  // logger 需要 electronService.isElectron() 做分支；测试环境返回 false 即可
  electronService: {
    isElectron: () => false,
  },
}));

vi.stubGlobal('fetch', nativeFetchMock);

import { SeedanceProvider } from './SeedanceProvider';
import { bytesToBase64 } from '../../utils/encoding';

function setupRemoteDownloadMocks(name: string, payload: Uint8Array) {
  appGetPathMock.mockResolvedValue('/tmp/koma-test');
  fsDownloadFileMock.mockResolvedValueOnce({ success: true, size: payload.byteLength });
  fsReadFileAsBase64Mock.mockResolvedValueOnce(bytesToBase64(payload));
  fsRemoveMock.mockResolvedValue(undefined);
  return name;
}

function mockSeedanceUploadFlow(params: {
  uploads: Record<string, { url: string; mimeType: string; size: number; id?: string }>;
  generation: Record<string, unknown>;
}) {
  safeFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === 'https://toapis.example.com/v1/uploads/images') {
      const formData = init?.body as FormData;
      const file = formData.get('file') as File | null;
      const upload = file ? params.uploads[file.name] : undefined;
      if (!file || !upload) {
        throw new Error(`Unexpected Seedance upload file: ${file?.name || 'unknown'}`);
      }
      return new Response(JSON.stringify({
        success: true,
        data: {
          id: upload.id || file.name,
          url: upload.url,
          mime_type: upload.mimeType,
          size: upload.size,
        },
      }), { status: 200 });
    }

    return new Response(JSON.stringify(params.generation), { status: 200 });
  });
}

describe('SeedanceProvider', () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
    nativeFetchMock.mockReset();
    fsDownloadFileMock.mockReset();
    fsReadFileAsBase64Mock.mockReset();
    fsRemoveMock.mockReset();
    appGetPathMock.mockReset();
    // 默认：fs.downloadFile 成功 + 读回任意 base64（具体字节由各用例覆盖）
    appGetPathMock.mockResolvedValue('/tmp/koma-test');
    fsDownloadFileMock.mockResolvedValue({ success: true, size: 20 });
    fsReadFileAsBase64Mock.mockResolvedValue(bytesToBase64(new Uint8Array([1, 2, 3])));
    fsRemoveMock.mockResolvedValue(undefined);
  });

  it('submits text-to-video requests to /v1/videos/generations', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'task-seedance-text' }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    const result = await provider.start({
      capability: 'video.text-to-video',
      prompt: 'a fox runs through snow',
      options: { duration: 11, aspectRatio: '16:9', resolution: '720p' },
    } as any);

    expect(result).toEqual({ mode: 'async', taskId: 'task-seedance-text' });
    expect(safeFetchMock.mock.calls[0][0]).toBe('https://toapis.example.com/v1/videos/generations');
    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('seedance-2.0');
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.metadata).toEqual({ resolution: '720p' });
    expect(body.image_with_roles).toBeUndefined();
  });

  it('uploads remote primary image before submitting first_frame mode', async () => {
    nativeFetchMock.mockResolvedValueOnce(new Response('primary-image-binary', {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }));
    safeFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: {
          id: 'upload-primary',
          url: 'https://toapis.example.com/uploads/primary.png',
          mime_type: 'image/png',
          size: 20,
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'task-seedance-image' }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: 'make the still image breathe',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/primary.png' },
      options: { duration: 5, aspectRatio: 'adaptive', resolution: '480p' },
    } as any);

    expect(fsDownloadFileMock).toHaveBeenCalledWith('https://cdn.example.com/primary.png', expect.any(String));
    expect(safeFetchMock.mock.calls[0][0]).toBe('https://toapis.example.com/v1/uploads/images');
    const body = JSON.parse((safeFetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(body.image_with_roles).toEqual([
      { url: 'https://toapis.example.com/uploads/primary.png', role: 'first_frame' },
    ]);
    expect(body.metadata).toEqual({ resolution: '480p' });
  });

  it('maps multi-reference image-to-video requests to reference_image mode', async () => {
    nativeFetchMock
      .mockResolvedValueOnce(new Response('primary-image-binary', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }))
      .mockResolvedValueOnce(new Response('ref-image-binary', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }));
    mockSeedanceUploadFlow({
      uploads: {
        'primary.png': {
          url: 'https://toapis.example.com/uploads/primary.png',
          mimeType: 'image/png',
          size: 20,
          id: 'upload-primary',
        },
        'ref-1.png': {
          url: 'https://toapis.example.com/uploads/ref-1.png',
          mimeType: 'image/png',
          size: 18,
          id: 'upload-ref-1',
        },
      },
      generation: { id: 'task-seedance-reference' },
    });

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: 'keep the same subject while changing camera motion',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/primary.png' },
      additionalReferences: [
        { transport: 'remote-url', value: 'https://cdn.example.com/ref-1.png' },
      ],
      options: { duration: 5, aspectRatio: '9:16', resolution: '1280x720' },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(body.image_with_roles).toEqual([
      { url: 'https://toapis.example.com/uploads/primary.png', role: 'reference_image' },
      { url: 'https://toapis.example.com/uploads/ref-1.png', role: 'reference_image' },
    ]);
    expect(body.metadata).toEqual({ resolution: '720p' });
  });

  it('declares data-url transport support so host can defer uploads to seedance', async () => {
    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    expect(provider.assetTransports).toEqual({
      primaryImage: ['remote-url', 'data-url'],
      additionalReferences: ['remote-url', 'data-url'],
      referenceImages: ['remote-url', 'data-url'],
      startFrame: ['remote-url', 'data-url'],
      endFrame: ['remote-url', 'data-url'],
    });
  });

  it('uploads data-url reference images through /v1/uploads/images before generation', async () => {
    mockSeedanceUploadFlow({
      uploads: {
        'seedance-upload-1.png': {
          url: 'https://toapis.example.com/uploads/ref-a.webp',
          mimeType: 'image/webp',
          size: 12,
          id: 'upload-a',
        },
        'seedance-upload-2.png': {
          url: 'https://toapis.example.com/uploads/ref-b.webp',
          mimeType: 'image/webp',
          size: 13,
          id: 'upload-b',
        },
      },
      generation: { id: 'task-seedance-uploaded-reference' },
    });

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: '保持人物一致性并生成自然动作',
      referenceImages: [
        { transport: 'data-url', value: 'data:image/png;base64,AA==' },
        { transport: 'data-url', value: 'data:image/png;base64,BB==' },
      ],
      options: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
    } as any);

    expect(safeFetchMock.mock.calls[0][0]).toBe('https://toapis.example.com/v1/uploads/images');
    expect((safeFetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
    expect((safeFetchMock.mock.calls[0][1] as RequestInit).headers).toEqual({
      Authorization: 'Bearer secret',
    });
    expect((safeFetchMock.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(FormData);

    expect(safeFetchMock.mock.calls[1][0]).toBe('https://toapis.example.com/v1/uploads/images');
    expect((safeFetchMock.mock.calls[1][1] as RequestInit).body).toBeInstanceOf(FormData);

    expect(safeFetchMock.mock.calls[2][0]).toBe('https://toapis.example.com/v1/videos/generations');
    const body = JSON.parse((safeFetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(body.image_with_roles).toEqual([
      { url: 'https://toapis.example.com/uploads/ref-a.webp', role: 'reference_image' },
      { url: 'https://toapis.example.com/uploads/ref-b.webp', role: 'reference_image' },
    ]);
  });

  it('uploads remote primary image and local refs through seedance upload endpoint while preserving order', async () => {
    nativeFetchMock.mockResolvedValueOnce(new Response('primary-image-binary', {
      status: 200,
      headers: { 'Content-Type': 'image/webp' },
    }));
    mockSeedanceUploadFlow({
      uploads: {
        'primary.webp': {
          url: 'https://toapis.example.com/uploads/primary.webp',
          mimeType: 'image/webp',
          size: 21,
          id: 'upload-primary',
        },
        'seedance-upload-2.png': {
          url: 'https://toapis.example.com/uploads/scene.webp',
          mimeType: 'image/webp',
          size: 13,
          id: 'upload-scene',
        },
      },
      generation: { id: 'task-seedance-mixed-reference' },
    });

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: '主图在前，附加参考图继续保持一致性',
      referenceImages: [
        { transport: 'remote-url', value: 'https://cdn.example.com/primary.webp' },
        { transport: 'data-url', value: 'data:image/png;base64,AA==' },
      ],
      options: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
    } as any);

    expect(fsDownloadFileMock).toHaveBeenCalledWith('https://cdn.example.com/primary.webp', expect.any(String));
    expect(safeFetchMock.mock.calls).toHaveLength(3);
    expect(safeFetchMock.mock.calls[0][0]).toBe('https://toapis.example.com/v1/uploads/images');
    expect(safeFetchMock.mock.calls[1][0]).toBe('https://toapis.example.com/v1/uploads/images');
    expect(safeFetchMock.mock.calls[2][0]).toBe('https://toapis.example.com/v1/videos/generations');

    const body = JSON.parse((safeFetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(body.image_with_roles).toEqual([
      { url: 'https://toapis.example.com/uploads/primary.webp', role: 'reference_image' },
      { url: 'https://toapis.example.com/uploads/scene.webp', role: 'reference_image' },
    ]);
  });

  it('maps reference-to-video requests to reference_image mode after uploading remote URLs', async () => {
    nativeFetchMock
      .mockResolvedValueOnce(new Response('ref-a-binary', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }))
      .mockResolvedValueOnce(new Response('ref-b-binary', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      }));
    mockSeedanceUploadFlow({
      uploads: {
        'ref-a.png': {
          url: 'https://toapis.example.com/uploads/ref-a.png',
          mimeType: 'image/png',
          size: 12,
          id: 'upload-ref-a',
        },
        'ref-b.jpg': {
          url: 'https://toapis.example.com/uploads/ref-b.jpg',
          mimeType: 'image/jpeg',
          size: 13,
          id: 'upload-ref-b',
        },
      },
      generation: { id: 'task-seedance-reference' },
    });

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: '让角色参考图保持一致并产生自然动作',
      referenceImages: [
        { transport: 'remote-url', value: 'https://cdn.example.com/ref-a.png' },
        { transport: 'remote-url', value: 'https://cdn.example.com/ref-b.jpg' },
      ],
      options: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(body.image_with_roles).toEqual([
      { url: 'https://toapis.example.com/uploads/ref-a.png', role: 'reference_image' },
      { url: 'https://toapis.example.com/uploads/ref-b.jpg', role: 'reference_image' },
    ]);
  });

  it('maps start-end-to-video requests to first_frame and last_frame roles', async () => {
    nativeFetchMock
      .mockResolvedValueOnce(new Response('start-frame-binary', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }))
      .mockResolvedValueOnce(new Response('end-frame-binary', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }));
    mockSeedanceUploadFlow({
      uploads: {
        'start.png': {
          url: 'https://toapis.example.com/uploads/start.png',
          mimeType: 'image/png',
          size: 14,
          id: 'upload-start',
        },
        'end.png': {
          url: 'https://toapis.example.com/uploads/end.png',
          mimeType: 'image/png',
          size: 15,
          id: 'upload-end',
        },
      },
      generation: { id: 'task-seedance-start-end' },
    });

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0-fast',
    } as any);

    await provider.start({
      capability: 'video.start-end-to-video',
      prompt: 'turn dawn into night',
      startFrame: { transport: 'remote-url', value: 'https://cdn.example.com/start.png' },
      endFrame: { transport: 'remote-url', value: 'https://cdn.example.com/end.png' },
      options: { duration: 20, aspectRatio: '3:4', resolution: '1080p' },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(body.duration).toBe(12);
    expect(body.metadata).toEqual({ resolution: '720p' });
    expect(body.image_with_roles).toEqual([
      { url: 'https://toapis.example.com/uploads/start.png', role: 'first_frame' },
      { url: 'https://toapis.example.com/uploads/end.png', role: 'last_frame' },
    ]);
  });

  it('reads completed task snapshots from result.data[0].url', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'task-seedance-done',
      model: 'seedance-2.0',
      status: 'completed',
      progress: 100,
      completed_at: 1768380514,
      expires_at: 1768466914,
      result: {
        type: 'video',
        data: [
          {
            url: 'https://files.example.com/output.mp4',
            format: 'mp4',
          },
        ],
      },
    }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    const snapshot = await provider.getTaskSnapshot('task-seedance-done');

    expect(safeFetchMock.mock.calls[0][0]).toBe('https://toapis.example.com/v1/videos/generations/task-seedance-done');
    expect(snapshot.state).toBe('succeeded');
    expect(snapshot.output?.source).toBe('https://files.example.com/output.mp4');
    expect(snapshot.output?.metadata).toMatchObject({
      format: 'mp4',
      model: 'seedance-2.0',
    });
  });

  it('reads completed task snapshots from metadata.url when result data is absent', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'task-seedance-metadata-url',
      model: 'seedance-2.0',
      status: 'completed',
      progress: 100,
      completed_at: 1768380514,
      expires_at: 1768466914,
      metadata: {
        generate_audio: true,
        url: 'https://files.toapis.com/images/task-seedance-metadata-url/output.mp4',
      },
    }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    const snapshot = await provider.getTaskSnapshot('task-seedance-metadata-url');

    expect(snapshot.state).toBe('succeeded');
    expect(snapshot.output?.source).toBe('https://files.toapis.com/images/task-seedance-metadata-url/output.mp4');
    expect(snapshot.output?.metadata).toMatchObject({
      format: 'mp4',
      model: 'seedance-2.0',
    });
  });

  it('fails completed task snapshots only when no usable video url is returned', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'task-seedance-missing-url',
      model: 'seedance-2.0',
      status: 'completed',
      progress: 100,
      completed_at: 1768380514,
      expires_at: 1768466914,
      metadata: {
        generate_audio: true,
      },
      result: {
        type: 'video',
        data: [
          {
            format: 'mp4',
          },
        ],
      },
    }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    const snapshot = await provider.getTaskSnapshot('task-seedance-missing-url');

    expect(snapshot.state).toBe('failed');
    expect(snapshot.error).toBe('Seedance 任务已完成，但未返回可用视频 URL');
  });

  it('surfaces actionable model route errors from upstream', async () => {
    safeFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: {
          id: 'upload-ref-a',
          url: 'https://toapis.example.com/uploads/ref-a.png',
          mime_type: 'image/png',
          size: 12,
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          code: 'model_not_found',
          message: '模型 seedance-2.0 未配置渠道能力（ChannelCapability），请联系管理员配置 SKU 路由',
          type: 'new_api_error',
        },
      }), { status: 503 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await expect(provider.start({
      capability: 'video.reference-to-video',
      prompt: '保持人物一致性并生成自然镜头运动',
      referenceImages: [
        { transport: 'data-url', value: 'data:image/png;base64,AA==' },
      ],
      options: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
    } as any)).rejects.toThrow(
      '当前 API Key/渠道未开通模型 seedance-2.0',
    );
  });

  it('surfaces invalid image_url errors from upstream', async () => {
    safeFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: {
          id: 'upload-ref-a',
          url: 'https://toapis.example.com/uploads/ref-a.png',
          mime_type: 'image/png',
          size: 12,
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 'fail_to_fetch_task',
        message: '{"error":{"message":"invalid image_url","type":"BadRequest"}}',
        data: null,
      }), { status: 400 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'doubao-seedance-2-0',
    } as any);

    await expect(provider.start({
      capability: 'video.reference-to-video',
      prompt: '保持人物一致性并生成自然镜头运动',
      referenceImages: [
        { transport: 'data-url', value: 'data:image/png;base64,AA==' },
      ],
      options: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
    } as any)).rejects.toThrow(
      '上游无法读取参考图 URL（invalid image_url）',
    );
  });
});
