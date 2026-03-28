import {
  type LinghuiAudioNodeProperties,
  type LinghuiImageNodeProperties,
  type LinghuiNodeResult,
  type LinghuiScriptNodeProperties,
  type LinghuiTextNodeProperties,
  type LinghuiVideoRefMode,
} from '../../types/linghui';
import { compileLinghuiPromptReferences } from './linghuiPromptReferences';
import {
  formatLinghuiScriptShots,
  parseLinghuiScriptContent,
} from './linghuiScriptNodeUtils';
import {
  buildMediaItem,
  collectReferenceSources,
  collectTextSnippets,
  collectVideoPosterSources,
  mergePromptWithTextInputs,
  mergeUniqueSources,
  resolveImageNodeMode,
  type ExecutionNodeView,
} from './linghuiExecutionShared';
import {
  getLinghuiImageImportItems,
  resolveLinghuiImagePrimaryImportItem,
} from './linghuiImageCollections';
import {
  generateAudioWithProvider,
  generateImageWithProvider,
  generateTextWithProvider,
  generateVideoWithProvider,
} from './linghuiExecutionProviders';

const DEFAULT_SCRIPT_SYSTEM_PROMPT = [
  '你是灵绘的分镜脚本助手。',
  '请只输出 JSON，不要附加解释。',
  '输出格式必须是 {"shots":[{"title":"镜头标题","description":"画面描述","durationSec":3}] }。',
  '至少生成 3 个镜头，描述需要明确主体、动作、构图和氛围。',
].join('\n');

export async function executeTextNode(
  node: ExecutionNodeView,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const {
    mode = 'manual',
    content = '',
    prompt = '',
    systemPrompt = '',
    llmConfigId = '',
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
    llmConfigId: String(llmConfigId),
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

export async function executeImageNode(
  node: ExecutionNodeView,
  onProgress?: (progress: number, message?: string) => void,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const source = String(node.properties.source ?? '').trim();
  const properties = node.properties as unknown as LinghuiImageNodeProperties;
  const mode = resolveImageNodeMode({ source, mode: properties.mode });
  const prompt = String(node.properties.prompt ?? '').trim();
  const ttiConfigId = String(node.properties.ttiConfigId ?? '');
  const batchCount = Math.max(1, Math.min(4, Number(node.properties.batchCount ?? 1)));

  if (mode === 'import') {
    const importItems = getLinghuiImageImportItems(properties);
    const primaryImport = resolveLinghuiImagePrimaryImportItem(properties);
    if (!importItems.length) {
      throw new Error('请先上传图片素材');
    }

    const items = importItems.map(item => buildMediaItem({
      kind: 'image',
      source: item.source,
      label: item.label || node.title,
      width: item.width,
      height: item.height,
      mimeType: item.mimeType,
      metadata: item.aspectRatio ? { aspectRatio: item.aspectRatio } : undefined,
    }));
    const primary = items.find(item => item.source === primaryImport?.source) ?? items[0];

    return {
      kind: items.length > 1 ? 'images' : 'image',
      primary,
      items: items.length > 1 ? items : undefined,
      metadata: { source: primary?.source ?? source, mode: 'import', itemCount: items.length },
    };
  }

  const referenceSources = collectReferenceSources(node.getAllInputImages());
  const silentReferenceSources: string[] = [];
  const textSnippets = collectTextSnippets(node.getAllInputResults(1));
  const promptReferences = node.getPromptReferences();
  const effectivePrompt = mergePromptWithTextInputs(prompt || node.title, textSnippets);
  const count = batchCount;

  if (count > 1) {
    const items = await Promise.all(
      Array.from({ length: count }, (_, i) => i).map(async index => {
        const label = `#${index + 1}`;
        const image = await generateImageWithProvider({
          prompt: effectivePrompt,
          referenceSources,
          silentReferenceSources,
          ttiConfigId,
          promptReferences,
          onProgress: progress => onProgress?.(Math.round((index / count) * 100 + progress / count), `${label} 生成中`),
          placeholderTitle: label,
          placeholderSubtitle: prompt || '占位预览',
          accent: '#4ade80',
          signal,
        });
        return { ...image, label };
      }),
    );

    return {
      kind: 'images',
      primary: items[0],
      items,
      metadata: { prompt, batchCount: count, mode: 'generate' },
    };
  }

  const image = await generateImageWithProvider({
    prompt: effectivePrompt,
    referenceSources,
    silentReferenceSources,
    ttiConfigId,
    promptReferences,
    onProgress,
    placeholderTitle: node.title,
    placeholderSubtitle: prompt || '图片占位预览',
    accent: '#4ade80',
    signal,
  });

  return {
    kind: 'image',
    primary: image,
    metadata: { prompt, mode: 'generate' },
  };
}

export async function executeScriptNode(node: ExecutionNodeView, signal?: AbortSignal): Promise<LinghuiNodeResult> {
  const {
    mode = 'manual',
    content = '',
    prompt = '',
    systemPrompt = '',
    llmConfigId = '',
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
    systemPrompt: String(systemPrompt).trim() || DEFAULT_SCRIPT_SYSTEM_PROMPT,
    llmConfigId: String(llmConfigId),
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

export async function executeVideoNode(
  node: ExecutionNodeView,
  onProgress?: (progress: number, message?: string) => void,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const source = String(node.properties.source ?? '').trim();
  const posterSource = String(node.properties.posterSource ?? '').trim();
  const prompt = String(node.properties.prompt ?? '').trim();
  const itvConfigId = String(node.properties.itvConfigId ?? '');
  const refMode = (node.properties.refMode ?? 'all-ref') as LinghuiVideoRefMode;
  const duration = Number(node.properties.duration ?? 5);
  const aspectRatio = String(node.properties.aspectRatio ?? '16:9');
  const resolution = String(node.properties.resolution ?? '720P');

  if (source) {
    return {
      kind: 'video',
      primary: buildMediaItem({
        kind: 'video',
        source,
        posterSource,
        label: node.title,
      }),
      metadata: { source, posterSource, mode: 'upload' },
    };
  }

  const imageReferenceSources = collectReferenceSources(node.getAllInputResults(0));
  const videoPosterSources = collectVideoPosterSources(node.getAllInputResults(3));
  const referenceSources = mergeUniqueSources(imageReferenceSources, videoPosterSources);
  const textSnippets = collectTextSnippets([
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
  ]);
  const promptReferences = node.getPromptReferences();
  const primarySource = referenceSources[0];
  const additionalReferenceSources = refMode === 'all-ref'
    ? referenceSources.slice(1)
    : (referenceSources.length > 1 ? [referenceSources[referenceSources.length - 1]] : []);
  const primaryReferenceId = promptReferences.find(item => item.source === primarySource)?.id;
  const effectivePrompt = mergePromptWithTextInputs(prompt || node.title, textSnippets);

  const video = await generateVideoWithProvider({
    prompt: effectivePrompt,
    imageSource: primarySource,
    additionalReferenceSources,
    duration,
    aspectRatio,
    resolution,
    itvConfigId,
    promptReferences,
    primaryReferenceId,
    onProgress,
    signal,
  });

  return {
    kind: 'video',
    primary: video,
    metadata: {
      prompt,
      refMode,
      duration,
      aspectRatio,
      resolution,
      audioSource: node.getInputResult(2)?.primary?.source,
      imageReferenceCount: imageReferenceSources.length,
      videoReferenceCount: videoPosterSources.length,
    },
  };
}

export async function executeAudioNode(
  node: ExecutionNodeView,
  onProgress?: (progress: number, message?: string) => void,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const { source = '', prompt = '', ttsConfigId = '' } = node.properties as unknown as LinghuiAudioNodeProperties;
  const normalizedSource = String(source).trim();
  const normalizedPrompt = String(prompt).trim();

  if (normalizedSource) {
    return {
      kind: 'audio',
      primary: buildMediaItem({
        kind: 'audio',
        source: normalizedSource,
        label: node.title,
      }),
      text: normalizedPrompt || undefined,
      metadata: { source: normalizedSource, mode: 'upload' },
    };
  }

  if (!normalizedPrompt) {
    const upstreamTextSnippets = collectTextSnippets([
      ...node.getAllInputResults(1),
      ...node.getAllInputResults(2),
      ...node.getAllInputResults(3),
    ]);
    if (!upstreamTextSnippets.length && node.getPromptReferences().length === 0) {
      throw new Error('请先上传音频，或输入要合成的文本');
    }
  }

  const promptReferences = node.getPromptReferences();
  const textSnippets = collectTextSnippets([
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
    ...node.getAllInputResults(3),
  ]);
  const promptWithTextInputs = mergePromptWithTextInputs(normalizedPrompt, textSnippets);
  const compiledPrompt = promptReferences.length > 0
    ? compileLinghuiPromptReferences({
        prompt: promptWithTextInputs,
        references: promptReferences,
        replacementStrategy: 'readable-name',
      }).compiledPrompt
    : promptWithTextInputs;

  if (!compiledPrompt.trim()) {
    throw new Error('请先上传音频，或输入要合成的文本');
  }

  const audio = await generateAudioWithProvider({
    text: compiledPrompt,
    ttsConfigId: String(ttsConfigId),
    onProgress,
    signal,
  });

  return {
    kind: 'audio',
    primary: {
      ...audio,
      label: node.title,
    },
    text: compiledPrompt,
    metadata: {
      prompt: normalizedPrompt,
      compiledPrompt,
      mode: 'tts',
      upstreamTextCount: textSnippets.length,
    },
  };
}

export async function executeNode(
  node: ExecutionNodeView,
  onProgress?: (progress: number, message?: string) => void,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  switch (node.type) {
    case 'linghui/text':
      return executeTextNode(node, signal);
    case 'linghui/image':
      return executeImageNode(node, onProgress, signal);
    case 'linghui/video':
      return executeVideoNode(node, onProgress, signal);
    case 'linghui/audio':
      return executeAudioNode(node, onProgress, signal);
    case 'linghui/script':
      return executeScriptNode(node, signal);
    default:
      throw new Error(`暂不支持执行节点类型：${node.type}`);
  }
}
