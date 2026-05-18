import type {
  LinghuiNodeResult,
  LinghuiScriptNodeProperties,
} from '../../../../types/linghui';
import {
  compileLinghuiPromptReferences,
} from '../../editors/state/linghuiPromptReferences';
import {
  formatLinghuiScriptShots,
  parseLinghuiScriptContent,
} from '../../editors/state/linghuiScriptNodeUtils';
import {
  collectTextSnippets,
  mergePromptWithTextInputs,
  type ExecutionNodeView,
} from './linghuiExecutionShared';
import { generateTextWithProvider } from './linghuiExecutionProviders';
import {
  buildScriptSystemPrompt,
  buildStoryboardSystemPrompt,
} from './linghuiScriptPromptTemplates';
import {
  resolveStreamingProgress,
  type NodeExecutionProgressHandler,
} from './linghuiNodeExecutorTypes';
import { resolveLinghuiStoryboardScene } from '../../editors/state/linghuiStoryboardScenes';
import type { LinghuiPromptReferenceItem } from '../../editors/state/linghuiPromptReferences';

function buildStoryboardReferenceContext(references: LinghuiPromptReferenceItem[]): string {
  const lines = references
    .map((reference, index) => {
      const label = `${index + 1}. ${reference.name}`;
      const textValue = String(reference.textValue ?? '').trim();
      const description = String(reference.description ?? '').trim();
      if (textValue) {
        return `${label}：${textValue}`;
      }
      if (description) {
        return `${label}：${description}`;
      }
      return `${label}（${reference.kind} 参考）`;
    })
    .filter(Boolean);

  return lines.length > 0
    ? `上游参考：\n${lines.join('\n')}`
    : '';
}

export async function executeScriptNode(
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
  } = node.properties as unknown as LinghuiScriptNodeProperties;

  if (mode === 'manual') {
    const parsed = parseLinghuiScriptContent(String(content).trim());
    if (!parsed.shots.length) {
      throw new Error('请先输入可解析的脚本内容');
    }

    return {
      kind: 'storyboard',
      text: parsed.formattedText,
      primary: parsed.shots[0]?.image,
      shots: parsed.shots,
      metadata: {
        mode: 'manual',
        parseSource: parsed.source,
        rawContent: String(content).trim(),
      },
    };
  }

  const promptReferences = node.getPromptReferences();
  const textSnippets = collectTextSnippets([
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
  ]);
  const promptWithTextInputs = mergePromptWithTextInputs(String(prompt).trim(), textSnippets);
  const compiledPrompt = promptReferences.length > 0
    ? compileLinghuiPromptReferences({
        prompt: promptWithTextInputs,
        references: promptReferences,
        replacementStrategy: 'readable-name',
      }).compiledPrompt
    : promptWithTextInputs;

  if (!compiledPrompt.trim()) {
    throw new Error('请先输入脚本生成提示词');
  }

  const generatedText = await generateTextWithProvider({
    prompt: compiledPrompt,
    systemPrompt: buildScriptSystemPrompt(systemPrompt),
    llmSelection: String(llmSelection),
    settingsSnapshot: node.settingsSnapshot,
    onChunk: (_delta, accumulated) => {
      const partialParsed = parseLinghuiScriptContent(accumulated);
      onProgress?.(
        resolveStreamingProgress(accumulated, 20, 94),
        '脚本整理中',
        {
          kind: 'storyboard',
          text: partialParsed.formattedText || accumulated,
          shots: partialParsed.shots,
          primary: partialParsed.shots[0]?.image,
          metadata: {
            mode: 'generate',
            parseSource: partialParsed.source,
            prompt: String(prompt).trim(),
            systemPrompt: String(systemPrompt).trim(),
            rawGeneratedText: accumulated,
            partial: true,
          },
        },
      );
    },
    signal,
  });
  const parsed = parseLinghuiScriptContent(generatedText);

  if (!parsed.shots.length) {
    throw new Error('脚本生成结果无法解析成结构化镜头，请调整提示词后重试');
  }

  return {
    kind: 'storyboard',
    text: parsed.formattedText || formatLinghuiScriptShots(parsed.shots),
    primary: parsed.shots[0]?.image,
    shots: parsed.shots,
    metadata: {
      mode: 'generate',
      parseSource: parsed.source,
      prompt: String(prompt).trim(),
      systemPrompt: String(systemPrompt).trim(),
      rawGeneratedText: generatedText.trim(),
    },
  };
}

export async function executeStoryboardNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const prompt = String(node.properties.prompt ?? '').trim();
  const llmSelection = String(node.properties.llmSelection ?? '');
  const sceneDef = resolveLinghuiStoryboardScene(node.properties.scene);
  const targetShotCount = Number(node.properties.targetShotCount ?? sceneDef.targetShotCount);

  const promptReferences = node.getPromptReferences();
  if (!prompt && promptReferences.length === 0) {
    throw new Error('请先输入剧情大纲');
  }

  const textSnippets = collectTextSnippets([
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
  ]);
  const promptWithScene = [
    sceneDef.promptPrefix,
    buildStoryboardReferenceContext(promptReferences),
    prompt ? `用户剧情大纲：\n${prompt}` : '',
  ].filter(Boolean).join('\n\n');
  const promptWithTextInputs = mergePromptWithTextInputs(promptWithScene, textSnippets);
  const compiledPrompt = promptReferences.length > 0
    ? compileLinghuiPromptReferences({
        prompt: promptWithTextInputs,
        references: promptReferences,
        replacementStrategy: 'readable-name',
      }).compiledPrompt
    : promptWithTextInputs;

  const systemPrompt = buildStoryboardSystemPrompt(targetShotCount, sceneDef.promptPrefix);

  const generatedText = await generateTextWithProvider({
    prompt: compiledPrompt,
    systemPrompt,
    llmSelection,
    settingsSnapshot: node.settingsSnapshot,
    onChunk: (_delta, accumulated) => {
      const partialParsed = parseLinghuiScriptContent(accumulated);
      onProgress?.(
        resolveStreamingProgress(accumulated, 20, 94),
        '故事板生成中',
        {
          kind: 'storyboard',
          text: partialParsed.formattedText || accumulated,
          shots: partialParsed.shots,
          primary: partialParsed.shots[0]?.image,
          metadata: {
            mode: 'storyboard',
            scene: sceneDef.scene,
            parseSource: partialParsed.source,
            prompt,
            compiledPrompt,
            targetShotCount,
            rawGeneratedText: accumulated,
            partial: true,
          },
        },
      );
    },
    signal,
  });

  const parsed = parseLinghuiScriptContent(generatedText);
  if (!parsed.shots.length) {
    throw new Error('故事板生成结果无法解析成分镜，请调整剧情描述或更换 LLM 后重试');
  }

  return {
    kind: 'storyboard',
    text: parsed.formattedText || formatLinghuiScriptShots(parsed.shots),
    primary: parsed.shots[0]?.image,
    shots: parsed.shots,
    metadata: {
      mode: 'storyboard',
      scene: sceneDef.scene,
      parseSource: parsed.source,
      prompt,
      compiledPrompt,
      targetShotCount,
      rawGeneratedText: generatedText.trim(),
    },
  };
}
