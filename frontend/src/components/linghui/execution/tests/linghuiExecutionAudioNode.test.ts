import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';

vi.mock('../state/linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(),
  generateImageVariantsWithProvider: vi.fn(),
  generateImagesWithProvider: vi.fn(),
  generateTextWithProvider: vi.fn(),
  generateVideoWithProvider: vi.fn(),
}));

function createNode(voiceId = 'zh-CN-XiaoxiaoNeural'): ExecutionNodeView {
  return {
    id: 'audio-node-1',
    type: 'linghui/audio',
    title: '音频节点',
    properties: {
      source: '',
      prompt: '欢迎来到灵绘工作流',
      ttsSelection: 'tts-main::edge-tts',
      voiceId,
    },
    getAllInputResults() {
      return [];
    },
    getAllInputImages() {
      return [];
    },
    getInputResult() {
      return undefined;
    },
    getPromptReferences() {
      return [];
    },
  };
}

describe('executeAudioNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('把用户选择的 voiceId 透传给 TTS 执行层', async () => {
    const { executeAudioNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateAudioWithProvider).mockResolvedValue({
      kind: 'audio',
      source: 'https://cdn.example.com/audio.mp3',
      metadata: { voiceId: 'zh-CN-XiaoxiaoNeural' },
    } as any);

    await executeAudioNode(createNode());

    expect(executionProviders.generateAudioWithProvider).toHaveBeenCalledWith(expect.objectContaining({
      text: '欢迎来到灵绘工作流',
      ttsSelection: 'tts-main::edge-tts',
      voiceId: 'zh-CN-XiaoxiaoNeural',
    }));
  });
});
