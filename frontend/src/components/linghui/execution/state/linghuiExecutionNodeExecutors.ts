import {
  getLinghuiResultPrimaryMedia,
  type LinghuiAgentExecutionMetadata,
  type LinghuiAgentNodeProperties,
  type LinghuiAudioNodeProperties,
  type LinghuiImageNodeProperties,
  type LinghuiNodeResult,
  type LinghuiScriptNodeProperties,
  type LinghuiTextNodeProperties,
  type LinghuiVideoCapability,
} from '../../../../types/linghui';
import { compileLinghuiPromptReferences } from '../../editors/state/linghuiPromptReferences';
import {
  formatLinghuiScriptShots,
  parseLinghuiScriptContent,
} from '../../editors/state/linghuiScriptNodeUtils';
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
} from '../../editors/state/linghuiImageCollections';
import {
  generateAudioWithProvider,
  generateImageWithProvider,
  generateImagesWithProvider,
  generateTextWithProvider,
  runAgentWithProvider,
  generateVideoWithProvider,
} from './linghuiExecutionProviders';
import {
  getVideoCapabilityInputError,
  resolveVideoCapabilitySources,
} from '../../editors/state/videoCapabilityUtils';
import { createLogger } from '../../../../store/logger';

const imageExecutionLogger = createLogger('LinghuiImageExecution');

const DEFAULT_SCRIPT_SYSTEM_PROMPT = [
  '你是灵绘的分镜脚本助手。',
  '请只输出 JSON，不要附加解释。',
  '输出格式必须是 {"shots":[{"title":"镜头标题","description":"画面描述","durationSec":10}] }。',
  'durationSec 只能填写 6、10、12、16、20 之一；无法判断时填写 10。',
  '至少生成 3 个镜头，描述需要明确主体、动作、构图和氛围。',
].join('\n');

function buildScriptSystemPrompt(systemPrompt: string): string {
  const normalized = String(systemPrompt).trim();
  if (!normalized) {
    return DEFAULT_SCRIPT_SYSTEM_PROMPT;
  }

  return [
    DEFAULT_SCRIPT_SYSTEM_PROMPT,
    '在严格遵守上述 JSON 输出要求的前提下，请额外满足以下要求：',
    normalized,
  ].join('\n\n');
}

type NodeExecutionProgressHandler = (progress: number, message?: string, partialResult?: LinghuiNodeResult) => void;

const IMAGE_BATCH_SEPARATE_OUTPUT_CONSTRAINT = [
  '批量出图时请为每个 count 输出独立成品文件。',
  'API count creates separate independent image files.',
  'Do not create a grid, collage, contact sheet, diptych, triptych, multi-panel layout, or multiple images inside one canvas.',
  'Each output must contain exactly one finished image composition.',
].join('\n');

const IMAGE_BATCH_VARIATION_OPTION_BLUEPRINTS = [
  [
    'Variation direction: identity cues, face silhouette, facial structure.',
    'Keep the same prompt-locked subject, but vary signature markers, head silhouette, jawline, cheekbone, brow, eye, nose, and mouth relationships for a clearly different candidate read.',
  ],
  [
    'Variation direction: hair silhouette, expression, pose.',
    'Keep the same gender, age range, and outfit category, but vary hairstyle silhouette, bangs/volume/flow, facial expression, gesture, posture, and body rhythm.',
  ],
  [
    'Variation direction: wardrobe/accessory detail, lighting, composition.',
    'Keep the same clothing category and world setting, but vary garment cut emphasis, material layering, accessory hierarchy, lighting direction, value grouping, crop, and framing.',
  ],
  [
    'Variation direction: background atmosphere, camera angle, staging.',
    'Keep the same style and genre, but vary background mood, environmental accents, camera angle, depth staging, foreground/background separation, and composition energy.',
  ],
  [
    'Variation direction: profile read, emotion intensity, hand posing.',
    'Keep the same character identity, but vary three-quarter/profile read, emotional tone, hand pose, negative space, and rim-light treatment.',
  ],
  [
    'Variation direction: accessory hierarchy, fabric motion, scene mood.',
    'Keep the same subject and costume class, but vary emblem placement, prop prominence, cloth flow, atmospheric effects, and color temperature.',
  ],
] as const;

function appendIndependentBatchOutputConstraint(prompt: string): string {
  const normalizedPrompt = String(prompt).trim();

  if (!normalizedPrompt) {
    return IMAGE_BATCH_SEPARATE_OUTPUT_CONSTRAINT;
  }

  if (normalizedPrompt.includes('API count creates separate independent image files')) {
    return normalizedPrompt;
  }

  return `${normalizedPrompt}\n\n${IMAGE_BATCH_SEPARATE_OUTPUT_CONSTRAINT}`;
}

function buildBatchVariationInstructions(count: number): string {
  const normalizedCount = Math.max(1, Math.floor(Number(count) || 1));
  const outputAssignments = Array.from(
    { length: normalizedCount },
    (_unused, index) => `Output ${index + 1} -> Variation option ${index + 1}`,
  ).join('; ');
  const optionBlocks = Array.from({ length: normalizedCount }, (_unused, index) => {
    const blueprint = IMAGE_BATCH_VARIATION_OPTION_BLUEPRINTS[
      index % IMAGE_BATCH_VARIATION_OPTION_BLUEPRINTS.length
    ];

    return [
      `Variation option ${index + 1}:`,
      `- ${blueprint[0]}`,
      `- ${blueprint[1]}`,
    ].join('\n');
  }).join('\n\n');

  return [
    'Variation options for separate batch outputs:',
    `There will be ${normalizedCount} independent API outputs. Assign a different variation option to each output: ${outputAssignments}.`,
    'Each independent output must choose exactly one variation option, and each variation option may be used by only one output in this batch.',
    'Do not treat the variation list as a single-image layout instruction. Do not turn it into a grid, collage, contact sheet, multi-panel canvas, or one image containing multiple candidates.',
    'Keep the original prompt locked on the same main subject, gender, age range, outfit category, world setting, and overall style/theme. Do not drift into a different subject, costume class, or genre.',
    'Use character/gacha differentiation axes where relevant: identity cues, face silhouette, facial structure, hair silhouette, expression/pose, wardrobe/accessory detail, lighting/composition, background atmosphere.',
    optionBlocks,
    'Across outputs, the differences must be distinct, significant, and immediately recognizable at thumbnail size.',
    'No identical outputs. No cloned composition. No same face repeated. No near-duplicate pose or camera framing across the batch.',
  ].join('\n');
}

function appendBatchVariationConstraint(prompt: string, count: number): string {
  const promptWithIndependentOutputConstraint = appendIndependentBatchOutputConstraint(prompt);

  if (promptWithIndependentOutputConstraint.includes('Variation options for separate batch outputs:')) {
    return promptWithIndependentOutputConstraint;
  }

  return `${promptWithIndependentOutputConstraint}\n\n${buildBatchVariationInstructions(count)}`;
}

function resolveStreamingProgress(accumulated: string, base = 18, cap = 92): number {
  return Math.max(base, Math.min(cap, base + Math.floor(accumulated.trim().length / 48)));
}

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

export async function executeImageNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const source = String(node.properties.source ?? '').trim();
  const properties = node.properties as unknown as LinghuiImageNodeProperties;
  const mode = resolveImageNodeMode({ source, mode: properties.mode });
  const prompt = String(node.properties.prompt ?? '').trim();
  const ttiSelection = String(node.properties.ttiSelection ?? '');
  const batchCount = Math.max(1, Math.min(4, Number(node.properties.batchCount ?? 1)));
  const multiAngleConfig = properties.multiAngle?.enabled === true
    ? {
        endpointPath: properties.multiAngle.endpointPath,
        promptProtocol: properties.multiAngle.promptProtocol,
        azimuth: properties.multiAngle.azimuth,
        elevation: properties.multiAngle.elevation,
        distance: properties.multiAngle.distance,
        sourceReferenceIndex: 0,
      }
    : null;

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
    const metadata = { source: primary?.source ?? source, mode: 'import', itemCount: items.length };

    if (items.length > 1) {
      return {
        kind: 'images',
        primary,
        items,
        metadata,
      };
    }

    return {
      kind: 'image',
      primary,
      metadata,
    };
  }

  const referenceSources = collectReferenceSources(node.getAllInputImages());
  const textSnippets = collectTextSnippets(node.getAllInputResults(1));
  const promptReferences = node.getPromptReferences();
  const explicitPrompt = mergePromptWithTextInputs(prompt, textSnippets);
  const effectivePrompt = mergePromptWithTextInputs(prompt || node.title, textSnippets);
  const count = batchCount;

  if (multiAngleConfig) {
    if (!referenceSources.length) {
      imageExecutionLogger.warn('灵绘图片节点多角度执行缺少上游图片，保持失败', {
        nodeId: node.id,
        title: node.title,
        promptLength: explicitPrompt.trim().length,
        textInputCount: textSnippets.length,
        ttiSelection,
      });
      throw new Error('多角度生图需要先连接一张上游图片');
    }

    const image = await generateImageWithProvider({
      prompt: explicitPrompt,
      referenceSources,
      ttiSelection,
      promptReferences: [],
      settingsSnapshot: node.settingsSnapshot,
      multiAngle: multiAngleConfig,
      onProgress,
      placeholderTitle: node.title,
      placeholderSubtitle: prompt || '多角度图片占位预览',
      accent: '#4ade80',
      signal,
    });

    return {
      kind: 'image',
      primary: image,
      metadata: {
        prompt,
        mode: 'multi-angle',
        multiAngle: properties.multiAngle,
      },
    };
  }

  if (count > 1) {
    const items = (await generateImagesWithProvider({
      prompt: appendBatchVariationConstraint(effectivePrompt, count),
      referenceSources,
      ttiSelection,
      promptReferences,
      settingsSnapshot: node.settingsSnapshot,
      onProgress,
      placeholderTitle: node.title,
      placeholderSubtitle: prompt || '图片占位预览',
      accent: '#4ade80',
      count,
      signal,
    }))
      .slice(0, count)
      .map((image, index) => ({ ...image, label: `#${index + 1}` }));

    const primary = items[0];
    if (!primary) {
      throw new Error('图片生成未返回有效结果');
    }

    return {
      kind: 'images',
      primary,
      items,
      metadata: {
        prompt,
        batchCount: count,
        batchMode: 'provider-count',
        mode: 'generate',
      },
    };
  }

  const image = await generateImageWithProvider({
    prompt: effectivePrompt,
    referenceSources,
    ttiSelection,
    promptReferences,
    settingsSnapshot: node.settingsSnapshot,
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

export async function executeVideoNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const source = String(node.properties.source ?? '').trim();
  const posterSource = String(node.properties.posterSource ?? '').trim();
  const prompt = String(node.properties.prompt ?? '').trim();
  const itvSelection = String(node.properties.itvSelection ?? '');
  const videoCapability = (node.properties.videoCapability ?? 'video.text-to-video') as LinghuiVideoCapability;
  const duration = Number(node.properties.duration ?? 5);
  const aspectRatio = String(node.properties.aspectRatio ?? '16:9');
  const resolution = String(node.properties.resolution ?? '720p');

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
  const resolvedSources = resolveVideoCapabilitySources(videoCapability, referenceSources);
  const inputError = getVideoCapabilityInputError(videoCapability, resolvedSources);
  if (inputError) {
    throw new Error(inputError);
  }

  const primaryReferenceSource = resolvedSources.primaryImageSource || resolvedSources.startFrameSource;
  const primaryReferenceId = promptReferences.find(item => item.source === primaryReferenceSource)?.id;
  const effectivePrompt = mergePromptWithTextInputs(prompt || node.title, textSnippets);

  const video = await generateVideoWithProvider({
    capability: videoCapability,
    prompt: effectivePrompt,
    primaryImageSource: resolvedSources.primaryImageSource,
    additionalReferenceSources: resolvedSources.additionalReferenceSources,
    referenceImageSources: resolvedSources.referenceImageSources,
    startFrameSource: resolvedSources.startFrameSource,
    endFrameSource: resolvedSources.endFrameSource,
    duration,
    aspectRatio,
    resolution,
    itvSelection,
    promptReferences,
    primaryReferenceId,
    settingsSnapshot: node.settingsSnapshot,
    onProgress,
    signal,
  });

  return {
    kind: 'video',
    primary: video,
    metadata: {
      prompt,
      capability: videoCapability,
      duration,
      aspectRatio,
      resolution,
      audioSource: getLinghuiResultPrimaryMedia(node.getInputResult(2))?.source,
      visualReferenceCount: resolvedSources.visualSources.length,
      imageReferenceCount: imageReferenceSources.length,
      videoReferenceCount: videoPosterSources.length,
    },
  };
}

export async function executeAudioNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const {
    source = '',
    prompt = '',
    ttsSelection = '',
    voiceId = '',
  } = node.properties as unknown as LinghuiAudioNodeProperties;
  const normalizedSource = String(source).trim();
  const normalizedPrompt = String(prompt).trim();
  const normalizedVoiceId = String(voiceId).trim();

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
    ttsSelection: String(ttsSelection),
    voiceId: normalizedVoiceId || undefined,
    settingsSnapshot: node.settingsSnapshot,
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
      voiceId: normalizedVoiceId || undefined,
      mode: 'tts',
      upstreamTextCount: textSnippets.length,
    },
  };
}

export async function executeNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  switch (node.type) {
    case 'linghui/text':
      return executeTextNode(node, onProgress, signal);
    case 'linghui/agent':
      return executeAgentNode(node, onProgress, signal);
    case 'linghui/image':
      return executeImageNode(node, onProgress, signal);
    case 'linghui/video':
      return executeVideoNode(node, onProgress, signal);
    case 'linghui/audio':
      return executeAudioNode(node, onProgress, signal);
    case 'linghui/script':
      return executeScriptNode(node, onProgress, signal);
    default:
      throw new Error(`暂不支持执行节点类型：${node.type}`);
  }
}
