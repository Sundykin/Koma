import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';

vi.mock('../state/linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(),
  generateTextWithProvider: vi.fn(),
  generateVideoWithProvider: vi.fn(),
}));

function createNode(params?: {
  prompt?: string;
  systemPrompt?: string;
}): ExecutionNodeView {
  return {
    id: 'script-node-1',
    type: 'linghui/script',
    title: '脚本节点',
    properties: {
      mode: 'generate',
      content: '',
      prompt: params?.prompt ?? '生成一段古风短剧分镜',
      systemPrompt: params?.systemPrompt ?? '注意中国古代场景和服装细节',
      llmSelection: 'llm-main::model-a',
      viewMode: 'cards',
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

describe('executeScriptNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('保留默认 JSON 契约并追加用户自定义 system prompt', async () => {
    const { executeScriptNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateTextWithProvider).mockResolvedValue(
      '{"shots":[{"title":"镜头 1","description":"古城街道上，主角回头望向远处灯火","durationSec":10}]}',
    );

    const node = createNode();
    const result = await executeScriptNode(node);

    const request = vi.mocked(executionProviders.generateTextWithProvider).mock.calls[0]?.[0];
    expect(request?.prompt).toBe('生成一段古风短剧分镜');
    expect(request?.systemPrompt).toContain('请只输出 JSON');
    expect(request?.systemPrompt).toContain('输出格式必须是 {"shots"');
    expect(request?.systemPrompt).toContain('durationSec 只能填写 6、10、12、16、20 之一');
    expect(request?.systemPrompt).toContain('注意中国古代场景和服装细节');
    expect(result.kind).toBe('storyboard');
    if (result.kind !== 'storyboard') {
      throw new Error('expected storyboard result');
    }
    expect(result.shots).toHaveLength(1);
    expect(result.text).toContain('镜头 1');
  });
});
