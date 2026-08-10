import { describe, expect, it } from 'vitest';
import { preflightLinghuiTargetNodes } from './linghuiExecutionPreflight';
import type { LinghuiExecutionContext, LinghuiNodeData, LinghuiRFNodeSnapshot } from '../../../../types/linghui';

/** 构造一个最小 ExecutionContext：nodes + edges 足够 preflight 用 */
function makeContext(
  nodes: LinghuiRFNodeSnapshot[],
  edges: LinghuiExecutionContext['edges'] = [],
  nodeOutputs: LinghuiExecutionContext['nodeOutputs'] = {},
): LinghuiExecutionContext {
  return {
    nodes,
    edges,
    nodeOutputs,
    settingsSnapshot: undefined,
  } as unknown as LinghuiExecutionContext;
}

function nodeSnapshot(id: string, linghuiType: string, properties: Record<string, unknown>): LinghuiRFNodeSnapshot {
  return {
    id,
    type: linghuiType,
    data: {
      linghuiType: linghuiType as LinghuiNodeData['linghuiType'],
      label: `节点${id}`,
      properties,
      inputs: [],
      outputs: [],
    } as unknown as LinghuiNodeData,
  } as LinghuiRFNodeSnapshot;
}

describe('preflightLinghuiTargetNodes', () => {
  it('image import 节点无素材 → 阻塞', () => {
    const ctx = makeContext([
      nodeSnapshot('n1', 'linghui/image', { mode: 'import' }),
    ]);
    const issues = preflightLinghuiTargetNodes(ctx, ['n1']);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('请先上传图片素材');
  });

  it('image generate 节点（非 import）→ 不误报素材缺失', () => {
    const ctx = makeContext([
      nodeSnapshot('n1', 'linghui/image', { mode: 'generate', prompt: '一只猫' }),
    ]);
    expect(preflightLinghuiTargetNodes(ctx, ['n1'])).toEqual([]);
  });

  it('multiAngle 无上游图片 → 阻塞；有上游结果 → 放行', () => {
    const ctxNoUpstream = makeContext([
      nodeSnapshot('n1', 'linghui/image', { mode: 'generate', prompt: 'x', multiAngle: { enabled: true } }),
    ]);
    const issues = preflightLinghuiTargetNodes(ctxNoUpstream, ['n1']);
    expect(issues.some(i => i.message.includes('多角度'))).toBe(true);

    // 有上游图片结果（真实运行时上游已执行，nodeOutputs 有值）
    const source = nodeSnapshot('src', 'linghui/image', { mode: 'import', source: '/x.png' });
    const target = nodeSnapshot('n1', 'linghui/image', { mode: 'generate', prompt: 'x', multiAngle: { enabled: true } });
    const ctxWithUpstream = makeContext(
      [source, target],
      [{ id: 'e1', source: 'src', target: 'n1', sourceHandle: 'output-0', targetHandle: 'input-0' } as never],
      { src: { kind: 'image', primary: { source: '/x.png', label: '上游图' } } as never },
    );
    expect(preflightLinghuiTargetNodes(ctxWithUpstream, ['n1'])).toEqual([]);
  });

  it('audio 节点无音频无文本无上游 → 阻塞；有自带文本 → 放行', () => {
    const ctx = makeContext([
      nodeSnapshot('n1', 'linghui/audio', {}),
    ]);
    const issues = preflightLinghuiTargetNodes(ctx, ['n1']);
    expect(issues.some(i => i.message.includes('请先上传音频'))).toBe(true);

    const ctxWithPrompt = makeContext([
      nodeSnapshot('n1', 'linghui/audio', { prompt: '旁白内容' }),
    ]);
    expect(preflightLinghuiTargetNodes(ctxWithPrompt, ['n1'])).toEqual([]);
  });

  it('只检查目标节点；非目标节点的缺失不报', () => {
    const ctx = makeContext([
      nodeSnapshot('n1', 'linghui/image', { mode: 'import' }),
      nodeSnapshot('n2', 'linghui/image', { mode: 'import' }),
    ]);
    const issues = preflightLinghuiTargetNodes(ctx, ['n2']);
    expect(issues).toHaveLength(1);
    expect(issues[0].nodeId).toBe('n2');
  });
});
