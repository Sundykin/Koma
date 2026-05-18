import { describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';

vi.mock('../state/linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(),
  generateImagesWithProvider: vi.fn(),
  generateImageVariantsWithProvider: vi.fn(),
  generateTextWithProvider: vi.fn(),
  generateVideoWithProvider: vi.fn(),
}));

function buildStoryboardNodeView(properties: Record<string, unknown>): ExecutionNodeView {
  return {
    id: 'storyboard-1',
    type: 'linghui/storyboard',
    title: '故事板',
    properties: {
      prompt: '',
      llmSelection: 'channel-llm::model-llm',
      scene: 'plot_deduction_nine_grid',
      viewMode: 'cards',
      targetShotCount: 9,
      ...properties,
    },
    getAllInputResults: () => [],
    getAllInputImages: () => [],
    getInputResult: () => undefined,
    getPromptReferences: () => [],
  };
}

describe('executeStoryboardNode', () => {
  it('未填剧情时直接报错', async () => {
    const { executeStoryboardNode } = await import('../state/linghuiExecutionNodeExecutors');
    await expect(executeStoryboardNode(buildStoryboardNodeView({}))).rejects.toThrow(/剧情大纲/);
  });

  it('用 LibTV scene 内置提示词 + 用户剧情拼成 prompt，并把 scene 写入 metadata', async () => {
    const { executeStoryboardNode } = await import('../state/linghuiExecutionNodeExecutors');
    const providers = await import('../state/linghuiExecutionProviders');

    vi.mocked(providers.generateTextWithProvider).mockResolvedValue(JSON.stringify({
      shots: Array.from({ length: 6 }, (_unused, idx) => ({
        title: `镜头 ${idx + 1}`,
        description: `主角在第 ${idx + 1} 个场景做出反应，特写，冷色光。`,
        durationSec: 10,
      })),
    }));

    const result = await executeStoryboardNode(buildStoryboardNodeView({
      prompt: '主角在暴雨夜的废弃车站与神秘女子相遇',
      targetShotCount: 6,
    }));

    expect(providers.generateTextWithProvider).toHaveBeenCalledTimes(1);
    const call = vi.mocked(providers.generateTextWithProvider).mock.calls[0]?.[0];
    expect(call?.prompt).toContain('剧情推演 / 分镜脚本生成逻辑');
    expect(call?.prompt).toContain('用户剧情大纲：');
    expect(call?.prompt).toContain('主角在暴雨夜的废弃车站与神秘女子相遇');
    expect(call?.systemPrompt).toMatch(/故事板生成助手/);
    expect(call?.systemPrompt).toMatch(/LibTV scene 内置要求/);
    expect(call?.systemPrompt).toMatch(/目标 6 个镜头/);

    expect(result.kind).toBe('storyboard');
    if (result.kind !== 'storyboard') return;
    expect(result.shots).toHaveLength(6);
    expect(result.metadata?.mode).toBe('storyboard');
    expect(result.metadata?.scene).toBe('plot_deduction_nine_grid');
    expect(result.metadata?.targetShotCount).toBe(6);
    expect(String(result.metadata?.compiledPrompt)).toContain('用户剧情大纲');
  });

  it('允许只有上游引用时生成，并把引用文本编译进 LibTV scene prompt', async () => {
    const { executeStoryboardNode } = await import('../state/linghuiExecutionNodeExecutors');
    const providers = await import('../state/linghuiExecutionProviders');

    vi.mocked(providers.generateTextWithProvider).mockResolvedValue(JSON.stringify({
      shots: [{ title: '上游推进', description: '主角根据上游参考进入新场景，中景，冷色光。', durationSec: 10 }],
    }));

    const result = await executeStoryboardNode({
      ...buildStoryboardNodeView({
        prompt: '',
        scene: 'coherent_storyboard_16',
        targetShotCount: 16,
      }),
      getPromptReferences: () => [{
        id: 'ref_text',
        nodeId: 'text-1',
        kind: 'text',
        name: '上游剧情',
        textValue: '上游剧情：角色发现隐藏线索。',
      }],
    });

    const call = vi.mocked(providers.generateTextWithProvider).mock.calls.at(-1)?.[0];
    expect(call?.prompt).toContain('16 个清楚镜头节拍');
    expect(call?.prompt).toContain('上游剧情：角色发现隐藏线索。');
    expect(call?.systemPrompt).toMatch(/目标 16 个镜头/);
    expect(result.kind).toBe('storyboard');
    if (result.kind !== 'storyboard') return;
    expect(result.metadata?.scene).toBe('coherent_storyboard_16');
  });

  it('LLM 输出空响应时报错引导用户重试', async () => {
    const { executeStoryboardNode } = await import('../state/linghuiExecutionNodeExecutors');
    const providers = await import('../state/linghuiExecutionProviders');

    vi.mocked(providers.generateTextWithProvider).mockResolvedValue('   \n  \n   ');

    await expect(executeStoryboardNode(buildStoryboardNodeView({
      prompt: '一段剧情',
    }))).rejects.toThrow(/无法解析成分镜/);
  });

  it('目标镜头数会被夹到 [4, 25] 区间', async () => {
    const { executeStoryboardNode } = await import('../state/linghuiExecutionNodeExecutors');
    const providers = await import('../state/linghuiExecutionProviders');

    vi.mocked(providers.generateTextWithProvider).mockResolvedValue(JSON.stringify({
      shots: [{ title: 't', description: 'd', durationSec: 10 }],
    }));

    await executeStoryboardNode(buildStoryboardNodeView({
      prompt: '剧情',
      targetShotCount: 100,
    }));

    const call1 = vi.mocked(providers.generateTextWithProvider).mock.calls.at(-1)?.[0];
    expect(call1?.systemPrompt).toMatch(/目标 25 个镜头/);

    await executeStoryboardNode(buildStoryboardNodeView({
      prompt: '剧情',
      targetShotCount: 1,
    }));

    const call2 = vi.mocked(providers.generateTextWithProvider).mock.calls.at(-1)?.[0];
    expect(call2?.systemPrompt).toMatch(/目标 4 个镜头/);
  });
});
