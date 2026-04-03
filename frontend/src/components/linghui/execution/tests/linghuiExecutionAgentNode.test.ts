import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';
import type { LinghuiNodeResult } from '../../../../types/linghui';

vi.mock('./linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(),
  generateTextWithProvider: vi.fn(),
  generateVideoWithProvider: vi.fn(),
  runAgentWithProvider: vi.fn(),
}));

function createNode(params?: {
  prompt?: string;
  slot0?: LinghuiNodeResult[];
  slot1?: LinghuiNodeResult[];
}) : ExecutionNodeView {
  const slot0 = params?.slot0 ?? [];
  const slot1 = params?.slot1 ?? [];

  return {
    id: 'agent-node-1',
    type: 'linghui/agent',
    title: 'Agent 节点',
    properties: {
      prompt: params?.prompt ?? '整理镜头说明',
      systemPrompt: '请输出简洁结论',
      llmSelection: 'llm-main::gpt-4.1',
      enabledTools: ['web_search'],
      maxIterations: 4,
    },
    getAllInputResults(slot) {
      if (slot === 0) return slot0;
      if (slot === 1) return slot1;
      return [];
    },
    getAllInputImages() {
      return slot0;
    },
    getInputResult() {
      return undefined;
    },
    getPromptReferences() {
      return [];
    },
  };
}

describe('executeAgentNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('会把上游文本与图片编译进 agent 执行请求', async () => {
    const { executeAgentNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.runAgentWithProvider).mockResolvedValue({
      text: '整理后的结论',
      metadata: {
        mode: 'agent',
        prompt: '上游世界观\n\n整理镜头说明',
        systemPrompt: '请输出简洁结论',
        llmSelection: 'llm-main::gpt-4.1',
        enabledTools: ['web_search'],
        maxIterations: 4,
        observedToolRounds: 1,
        toolTrace: [],
        inputTextCount: 1,
        inputImageCount: 1,
      },
    });

    const node = createNode({
      slot0: [
        {
          kind: 'image',
          primary: { kind: 'image', source: 'https://cdn.example.com/ref-1.png' },
        },
      ],
      slot1: [
        {
          kind: 'text',
          text: '上游世界观',
        },
      ],
    });

    const result = await executeAgentNode(node);

    expect(executionProviders.runAgentWithProvider).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '上游世界观\n\n整理镜头说明',
      systemPrompt: '请输出简洁结论',
      llmSelection: 'llm-main::gpt-4.1',
      enabledTools: ['web_search'],
      maxIterations: 4,
      imageSources: ['https://cdn.example.com/ref-1.png'],
      inputTextCount: 1,
    }));
    expect(result).toEqual({
      kind: 'text',
      text: '整理后的结论',
      metadata: expect.objectContaining({
        mode: 'agent',
        observedToolRounds: 1,
      }),
    });
  });

  it('缺少提示词时会阻止 agent 执行', async () => {
    const { executeAgentNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    const node = createNode({
      prompt: '',
      slot0: [],
      slot1: [],
    });

    await expect(executeAgentNode(node)).rejects.toThrow('请先输入 Agent 提示词');
    expect(executionProviders.runAgentWithProvider).not.toHaveBeenCalled();
  });
});
