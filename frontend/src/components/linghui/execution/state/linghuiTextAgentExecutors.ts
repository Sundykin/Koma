import type {
  LinghuiAgentExecutionMetadata,
  LinghuiAgentNodeProperties,
  LinghuiNodeResult,
  LinghuiTextNodeProperties,
} from '../../../../types/linghui';
import {
  compileLinghuiPromptReferences,
} from '../../editors/state/linghuiPromptReferences';
import {
  collectReferenceSources,
  collectTextSnippets,
  mergePromptWithTextInputs,
  type ExecutionNodeView,
} from './linghuiExecutionShared';
import {
  generateTextWithProvider,
  runAgentWithProvider,
} from './linghuiExecutionProviders';
import {
  resolveStreamingProgress,
  type NodeExecutionProgressHandler,
} from './linghuiNodeExecutorTypes';

export async function executeTextNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const {
    mode = 'manual',
    content = '',
    prompt = '',
    systemPrompt = '',
    llmSelection = '',
  } = node.properties as unknown as LinghuiTextNodeProperties;

  if (mode === 'manual') {
    const normalizedContent = String(content).trim();
    if (!normalizedContent) {
      throw new Error('请先输入文本内容');
    }

    return {
      kind: 'text',
      text: normalizedContent,
      metadata: { mode: 'manual' },
    };
  }

  const promptReferences = node.getPromptReferences();
  const textSnippets = collectTextSnippets([
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
    ...node.getAllInputResults(3),
  ]);
  const promptWithTextInputs = mergePromptWithTextInputs(String(prompt).trim(), textSnippets);
  const promptWithRefs = promptReferences.length > 0
    ? compileLinghuiPromptReferences({
        prompt: promptWithTextInputs,
        references: promptReferences,
        replacementStrategy: 'readable-name',
      }).compiledPrompt
    : promptWithTextInputs;

  if (!promptWithRefs) {
    throw new Error('请先输入生成文本的提示词');
  }

  const generatedText = await generateTextWithProvider({
    prompt: promptWithRefs,
    systemPrompt: String(systemPrompt).trim(),
    llmSelection: String(llmSelection),
    settingsSnapshot: node.settingsSnapshot,
    onChunk: (_delta, accumulated) => {
      onProgress?.(
        resolveStreamingProgress(accumulated),
        '文本生成中',
        {
          kind: 'text',
          text: accumulated,
          metadata: {
            mode: 'generate',
            prompt: String(prompt).trim(),
            systemPrompt: String(systemPrompt).trim(),
            partial: true,
          },
        },
      );
    },
    signal,
  });

  return {
    kind: 'text',
    text: generatedText.trim(),
    metadata: {
      mode: 'generate',
      prompt: String(prompt).trim(),
      systemPrompt: String(systemPrompt).trim(),
    },
  };
}

export async function executeAgentNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const {
    prompt = '',
    systemPrompt = '',
    llmSelection = '',
    enabledTools = [],
    maxIterations = 6,
  } = node.properties as unknown as LinghuiAgentNodeProperties;

  const promptReferences = node.getPromptReferences();
  const textSnippets = collectTextSnippets(node.getAllInputResults(1));
  const promptWithTextInputs = mergePromptWithTextInputs(String(prompt).trim(), textSnippets);
  const compiledPrompt = promptReferences.length > 0
    ? compileLinghuiPromptReferences({
        prompt: promptWithTextInputs,
        references: promptReferences,
        replacementStrategy: 'readable-name',
      }).compiledPrompt
    : promptWithTextInputs;

  if (!compiledPrompt.trim()) {
    throw new Error('请先输入 Agent 提示词');
  }

  const imageSources = collectReferenceSources(node.getAllInputResults(0));
  const execution = await runAgentWithProvider({
    prompt: compiledPrompt,
    systemPrompt: String(systemPrompt).trim(),
    llmSelection: String(llmSelection),
    enabledTools: Array.isArray(enabledTools) ? enabledTools.map(item => String(item)) : [],
    maxIterations: Number(maxIterations ?? 6),
    imageSources,
    inputTextCount: textSnippets.length,
    settingsSnapshot: node.settingsSnapshot,
    onChunk: (_delta, accumulated) => {
      onProgress?.(
        resolveStreamingProgress(accumulated, 20, 95),
        'Agent 输出中',
        {
          kind: 'text',
          text: accumulated,
          metadata: {
            mode: 'agent',
            prompt: String(prompt).trim(),
            systemPrompt: String(systemPrompt).trim(),
            llmSelection: String(llmSelection),
            enabledTools: Array.isArray(enabledTools) ? enabledTools.map(item => String(item)) : [],
            maxIterations: Number(maxIterations ?? 6),
            observedToolRounds: 0,
            toolTrace: [],
            inputTextCount: textSnippets.length,
            inputImageCount: imageSources.length,
            partial: true,
          } as LinghuiAgentExecutionMetadata,
        },
      );
    },
    onProgress,
    signal,
  });

  return {
    kind: 'text',
    text: execution.text.trim(),
    metadata: execution.metadata,
  };
}
