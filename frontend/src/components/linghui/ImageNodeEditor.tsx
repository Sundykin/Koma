import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Select } from 'antd';
import { nanoid } from 'nanoid';
import { ArrowUp, Check, Grid3x3, Image as ImageIcon, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import type {
  LinghuiImageAssetItem,
  LinghuiGridType,
  LinghuiImageNodeMode,
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiNodeRunState,
} from '../../types/linghui';
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  LINGHUI_IMAGE_BATCH_COUNTS,
} from '../../types/linghui';
import { electronService, openFileDialog } from '../../services/electronService';
import { ffmpegManager } from '../../services/ffmpegManager';
import {
  getLinghuiWorkspaceDir,
  importLinghuiWorkspaceAsset,
  materializeLinghuiWorkspaceAssetSource,
} from '../../store/linghuiStorage';
import { loadSettings } from '../../store/settings/core';
import type { LinghuiPromptReferenceItem } from './linghuiPromptReferences';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import { useLinghuiNodeMutation } from './nodes/LinghuiNodeRunsContext';
import {
  createLinghuiImageImportProperties,
  getLinghuiImageImportItems,
  isLinghuiImageAspectRatioCompatible,
  MAX_LINGHUI_IMAGE_ITEMS,
  resolveImageAspectRatioLabel,
  resolveLinghuiImageCollection,
  resolveLinghuiImagePrimaryImportItem,
} from './linghuiImageCollections';

function getPreviewSource(source?: string): string {
  if (!source) return '';
  if (source.startsWith('http') || source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('koma-local://')) return source;
  return electronService.fs.toLocalUrl(source);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

async function readImageMetadata(source: string): Promise<Pick<LinghuiImageAssetItem, 'width' | 'height' | 'aspectRatio'>> {
  const previewSource = getPreviewSource(source);
  if (!previewSource) {
    throw new Error('图片预览地址无效');
  }

  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight,
      aspectRatio: resolveImageAspectRatioLabel(image.naturalWidth, image.naturalHeight),
    });
    image.onerror = () => reject(new Error('读取图片尺寸失败'));
    image.src = previewSource;
  });
}

async function createImageAssetItem(params: {
  source: string;
  filenameHint?: string;
  label?: string;
}): Promise<LinghuiImageAssetItem> {
  const metadata = await readImageMetadata(params.source);
  return {
    id: nanoid(10),
    source: params.source,
    label: params.label || params.filenameHint?.replace(/\.[^.]+$/, '') || undefined,
    width: metadata.width,
    height: metadata.height,
    aspectRatio: metadata.aspectRatio,
  };
}

function resolveImageNodeMode(props: LinghuiImageNodeProperties): LinghuiImageNodeMode {
  if (props.mode === 'import' || props.mode === 'generate') {
    return props.mode;
  }
  return String(props.source ?? '').trim() ? 'import' : 'generate';
}

function mergePromptSnippet(currentPrompt: string, snippet: string): string {
  const normalizedCurrent = currentPrompt.trim();
  const normalizedSnippet = snippet.trim();
  if (!normalizedSnippet) return normalizedCurrent;
  if (normalizedCurrent.includes(normalizedSnippet)) return normalizedCurrent;
  return normalizedCurrent ? `${normalizedCurrent}\n${normalizedSnippet}` : normalizedSnippet;
}

interface ProviderOption {
  value: string;
  label: string;
}

interface ImageNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  referenceImages: Array<{ source?: string; label?: string }>;
  promptReferences?: LinghuiPromptReferenceItem[];
  workspaceId?: string | null;
  activeTool: LinghuiImageToolKey | null;
  onToolChange: (tool: LinghuiImageToolKey | null) => void;
  onCreateDerivedImportImages?: (items: LinghuiImageAssetItem[]) => void;
  onRun: () => void;
}

interface ImageToolPreset {
  label: string;
  description: string;
  promptSnippet: string;
  properties?: Partial<LinghuiImageNodeProperties>;
}

interface DisplayReferenceImage {
  source?: string;
  label?: string;
  badge: string;
}

const GRID_SPLIT_OPTIONS: Array<{ value: LinghuiGridType; label: string; size: 2 | 3 | 4 | 5 }> = [
  { value: '2x2', label: '4宫格', size: 2 },
  { value: '3x3', label: '9宫格', size: 3 },
  { value: '4x4', label: '16宫格', size: 4 },
  { value: '5x5', label: '25宫格', size: 5 },
];

function resolveGridSize(gridType: LinghuiGridType): 2 | 3 | 4 | 5 {
  return GRID_SPLIT_OPTIONS.find(option => option.value === gridType)?.size ?? 2;
}

function toCssAspectRatio(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const [widthText, heightText] = value.split(':');
  const width = Number(widthText);
  const height = Number(heightText);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }

  return `${width} / ${height}`;
}

const IMAGE_TOOL_PRESETS: Record<LinghuiImageToolKey, {
  title: string;
  description: string;
  presets: ImageToolPreset[];
}> = {
  'multi-angle': {
    title: '多角度',
    description: '适合角色、商品或场景设定图，一次拉出多个稳定视角。',
    presets: [
      {
        label: '角色四视图',
        description: '正、侧、背、3/4 视角的角色设定图。',
        promptSnippet: '角色四视图设定图，正面、左侧、背面、三分之四视角，服装、发型与材质一致，背景简洁。',
        properties: { gridType: '2x2', batchCount: 4, aspectRatio: '3:4' },
      },
      {
        label: '商品多面展示',
        description: '适合电商或工业设计的结构表达。',
        promptSnippet: '同一商品的多面展示图，突出材质、结构和细节，角度清晰且统一。',
        properties: { gridType: '2x2', batchCount: 4, aspectRatio: '1:1' },
      },
    ],
  },
  outpaint: {
    title: '扩图',
    description: '把现有构图延展成海报、横幅或竖版画面。',
    presets: [
      {
        label: '横向扩图',
        description: '扩成横版场景，补足环境空间。',
        promptSnippet: '横向扩图，补足主体两侧环境、前后景关系和纵深层次，保持主体位置稳定。',
        properties: { aspectRatio: '16:9', resolution: '2K' },
      },
      {
        label: '海报延展',
        description: '增强留白和标题区，适合封面设计。',
        promptSnippet: '海报式扩图，保留主体视觉焦点，预留标题空间和排版留白，背景细节丰富但不喧宾夺主。',
        properties: { aspectRatio: '4:3', resolution: '2K' },
      },
    ],
  },
  relight: {
    title: '打光',
    description: '快速为画面添加更明确的光比和情绪氛围。',
    presets: [
      {
        label: '电影补光',
        description: '强调主光、边缘光和皮肤层次。',
        promptSnippet: '电影级补光，主体面部和轮廓光干净，皮肤与材质细节保留，层次分明。',
        properties: { resolution: '2K' },
      },
      {
        label: '霓虹夜景',
        description: '偏赛博与高对比氛围光。',
        promptSnippet: '霓虹夜景光效，冷暖对比明显，反光与氛围雾层次丰富，主体仍然清晰。',
        properties: { resolution: '2K' },
      },
    ],
  },
  repaint: {
    title: '重绘',
    description: '把当前节点切到局部修复、替换和细节统一方向。',
    presets: [
      {
        label: '修复细节',
        description: '优先修手部、五官和边缘。',
        promptSnippet: '细节修复，优化手部、五官、发丝和服装边缘，整体风格保持一致。',
      },
      {
        label: '替换背景',
        description: '保留主体，重绘背景氛围。',
        promptSnippet: '保留主体身份与姿态，仅重绘背景环境与氛围元素，增强故事感与空间层次。',
      },
    ],
  },
  'grid-split': {
    title: '宫格切分',
    description: '把当前主图切成 4 / 9 / 16 / 25 宫格，再选中若干格子继续生成节点。',
    presets: [],
  },
};

export const ImageNodeEditor: React.FC<ImageNodeEditorProps> = ({
  nodeId,
  nodeData,
  nodeRun,
  referenceImages,
  promptReferences = [],
  workspaceId = null,
  activeTool,
  onToolChange,
  onCreateDerivedImportImages,
  onRun,
}) => {
  const { message } = App.useApp();
  const { clearNodeRunState, updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiImageNodeProperties;
  const mode = resolveImageNodeMode(props);
  const source = String(props.source ?? '');
  const prompt = String(props.prompt ?? '');
  const ttiConfigId = String(props.ttiConfigId ?? '');
  const aspectRatio = String(props.aspectRatio ?? '3:4');
  const resolution = String(props.resolution ?? 'auto');
  const batchCount = Number(props.batchCount ?? 1);
  const importItems = useMemo(() => getLinghuiImageImportItems(props), [props]);
  const importPrimary = useMemo(() => resolveLinghuiImagePrimaryImportItem(props), [props]);
  const resolvedCollection = useMemo(() => resolveLinghuiImageCollection(props, nodeRun?.result), [nodeRun?.result, props]);
  const previewSource = getPreviewSource(resolvedCollection.primary?.source || source);
  const hasSource = Boolean(resolvedCollection.primary?.source || source.trim());
  const isImportMode = mode === 'import';
  const displayReferenceImages: DisplayReferenceImage[] = referenceImages.map((ref, index) => ({
    ...ref,
    badge: String(index + 1),
  }));
  const generatedItems = useMemo(
    () => resolvedCollection.mode === 'result' ? resolvedCollection.items : [],
    [resolvedCollection],
  );

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [splitGridType, setSplitGridType] = useState<LinghuiGridType>('2x2');
  const [selectedSplitCells, setSelectedSplitCells] = useState<number[]>([]);
  const [isSplittingGrid, setIsSplittingGrid] = useState(false);
  const splitGridSize = resolveGridSize(splitGridType);
  const totalSplitCells = splitGridSize * splitGridSize;
  const splitPreviewAspectRatio = useMemo(() => {
    if (resolvedCollection.primary?.width && resolvedCollection.primary?.height) {
      return `${resolvedCollection.primary.width} / ${resolvedCollection.primary.height}`;
    }

    const metadataRatio = typeof resolvedCollection.primary?.metadata?.aspectRatio === 'string'
      ? resolvedCollection.primary.metadata.aspectRatio
      : undefined;
    return toCssAspectRatio(metadataRatio || aspectRatio) || '1 / 1';
  }, [aspectRatio, resolvedCollection.primary]);
  const hasExplicitSplitSelection = selectedSplitCells.length > 0;
  const effectiveSelectedSplitCount = hasExplicitSplitSelection ? selectedSplitCells.length : totalSplitCells;
  const mentionHint = isImportMode
    ? hasSource
      ? '当前节点会直接输出挂载图片，适合把现成图片送给下游节点继续使用。'
      : '当前处于导入输出模式，请先上传图片素材。'
    : promptReferences.length > 0
      ? '输入 @ 可直接引用上游图片、视频封面或文本产物，执行时会自动完成提示词替换。'
      : '生成模式只使用上游输入和提示词，不再额外上传节点内参考图。';

  useEffect(() => {
    loadSettings().then(settings => {
      const builtins = (settings.ttiConfigs ?? []).map(config => ({
        value: config.id,
        label: config.name || config.provider,
      }));
      const channels = (settings.channelConfigs ?? [])
        .filter(config => config.enabled && config.capabilities?.includes('tti'))
        .map(config => ({
          value: config.id,
          label: config.name || config.id,
        }));
      setProviders([...builtins, ...channels]);
    });
  }, []);

  useEffect(() => {
    setSelectedSplitCells([]);
  }, [resolvedCollection.primary?.source, splitGridType]);

  const updateProp = useCallback((key: string, value: unknown, options?: { markStale?: boolean }) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }), options);
  }, [nodeId, updateNodeData]);

  const applyToolPreset = useCallback((preset: ImageToolPreset) => {
    updateNodeData(nodeId, prev => {
      const previousProps = prev.properties as unknown as LinghuiImageNodeProperties;
      return {
        ...prev,
        properties: {
          ...prev.properties,
          mode: 'generate',
          ...preset.properties,
          prompt: mergePromptSnippet(String(previousProps.prompt ?? ''), preset.promptSnippet),
        },
      };
    });
    clearNodeRunState(nodeId);
    message.success(`已应用 ${preset.label} 预设`);
  }, [clearNodeRunState, message, nodeId, updateNodeData]);

  const persistUploadedImageSource = useCallback(async (nextSource: string, filenameHint?: string) => {
    let resolvedSource = nextSource;

    if (
      workspaceId &&
      electronService.isElectron() &&
      nextSource &&
      !nextSource.startsWith('http://') &&
      !nextSource.startsWith('https://') &&
      !nextSource.startsWith('data:') &&
      !nextSource.startsWith('blob:')
    ) {
      resolvedSource = await importLinghuiWorkspaceAsset(workspaceId, nextSource, filenameHint);
    }

    return resolvedSource;
  }, [workspaceId]);

  const commitImportItems = useCallback((nextItems: LinghuiImageAssetItem[], nextPrimaryAssetId?: string) => {
    updateNodeData(nodeId, prev => {
      const previousProps = prev.properties as unknown as LinghuiImageNodeProperties;
      const nextProperties = createLinghuiImageImportProperties(previousProps, nextItems, nextPrimaryAssetId);
      const nextLabel = prev.label.startsWith('图片') && nextItems[0]?.label
        ? nextItems[0].label
        : prev.label;
      return {
        ...prev,
        label: nextLabel,
        properties: nextProperties as unknown as Record<string, unknown>,
      };
    }, { markStale: false });
    clearNodeRunState(nodeId);
  }, [clearNodeRunState, nodeId, updateNodeData]);

  const appendImportedImages = useCallback(async (candidates: Array<{ source: string; filenameHint?: string }>) => {
    if (!candidates.length) {
      return;
    }

    const existingItems = getLinghuiImageImportItems(props);
    const nextItems = [...existingItems];

    for (const candidate of candidates) {
      if (nextItems.length >= MAX_LINGHUI_IMAGE_ITEMS) {
        message.warning(`图片节点最多保留 ${MAX_LINGHUI_IMAGE_ITEMS} 张图片`);
        break;
      }

      const resolvedSource = await persistUploadedImageSource(candidate.source, candidate.filenameHint);
      const nextItem = await createImageAssetItem({
        source: resolvedSource,
        filenameHint: candidate.filenameHint,
      });
      const ratioBase = nextItems[0] ?? importPrimary;
      if (ratioBase && !isLinghuiImageAspectRatioCompatible(ratioBase, nextItem)) {
        throw new Error('同一图片节点中的图片必须保持相同比例');
      }
      nextItems.push(nextItem);
    }

    commitImportItems(nextItems, props.primaryAssetId || nextItems[0]?.id);
  }, [commitImportItems, importPrimary, message, persistUploadedImageSource, props]);

  const handleSelectImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        multiple: true,
        title: '选择图片素材',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        await appendImportedImages(result.filePaths.map(filePath => ({
          source: filePath,
          filenameHint: filePath.split(/[\\/]/).pop(),
        })));
      }
    } catch (error: any) {
      message.error(error?.message || '选择图片失败');
    }
  }, [appendImportedImages, message]);

  const handleDropImage = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const files = Array.from(event.dataTransfer.files ?? []).filter(file => file.type.startsWith('image/'));
    if (!files.length) {
      message.warning('请拖入图片文件');
      return;
    }

    try {
      const nextSources = await Promise.all(files.map(async file => {
        const filePath = (file as File & { path?: string }).path;
        if (filePath) {
          return { source: filePath, filenameHint: file.name };
        }

        const dataUrl = await readFileAsDataUrl(file);
        return { source: dataUrl, filenameHint: file.name };
      }));
      await appendImportedImages(nextSources);
    } catch (error: any) {
      message.error(error?.message || '导入图片失败');
    }
  }, [appendImportedImages, message]);

  const handleClearImage = useCallback(() => {
    commitImportItems([], '');
  }, [commitImportItems]);

  const handleRemoveImportImage = useCallback((itemId: string) => {
    const nextItems = importItems.filter(item => item.id !== itemId);
    const nextPrimary = props.primaryAssetId === itemId
      ? nextItems[0]?.id
      : props.primaryAssetId;
    commitImportItems(nextItems, nextPrimary);
  }, [commitImportItems, importItems, props.primaryAssetId]);

  const handleSetPrimaryImportImage = useCallback((itemId: string) => {
    commitImportItems(importItems, itemId);
  }, [commitImportItems, importItems]);

  const handleSetPrimaryGeneratedImage = useCallback((item: LinghuiMediaItem) => {
    if (!item.source) {
      return;
    }
    updateProp('primaryResultSource', item.source, { markStale: false });
  }, [updateProp]);

  const toggleSplitCell = useCallback((index: number) => {
    setSelectedSplitCells(current => (
      current.includes(index)
        ? current.filter(item => item !== index)
        : [...current, index].sort((left, right) => left - right)
    ));
  }, []);

  const handleExecuteGridSplit = useCallback(async () => {
    if (!resolvedCollection.primary?.source) {
      message.warning('当前没有可切分的主图');
      return;
    }
    if (!workspaceId) {
      message.warning('请先打开一个灵绘工作区');
      return;
    }
    if (!onCreateDerivedImportImages) {
      message.warning('当前画布暂时无法接收切分结果');
      return;
    }
    if (!electronService.isElectron()) {
      message.warning('宫格切分需要在桌面端使用');
      return;
    }

    const targetCellIndexes = selectedSplitCells.length
      ? selectedSplitCells
      : Array.from({ length: totalSplitCells }, (_, index) => index);

    setIsSplittingGrid(true);
    try {
      const materializedSource = await materializeLinghuiWorkspaceAssetSource({
        workspaceId,
        source: resolvedCollection.primary.source,
        filename: `${nodeId}-grid-source-${Date.now()}`,
        fallbackExt: 'png',
        mimeType: resolvedCollection.primary.mimeType,
        subDir: 'assets/grid-source',
      });

      if (!materializedSource) {
        throw new Error('无法准备宫格切分的源图片');
      }

      const metadata = await readImageMetadata(materializedSource);
      const outputDir = `${await getLinghuiWorkspaceDir(workspaceId)}/assets/grid-splits/${nodeId}-${Date.now()}`;
      const outputs = await ffmpegManager.splitGridImage({
        input: materializedSource,
        outputDir,
        aspectRatio: metadata.aspectRatio || aspectRatio,
        gridSize: splitGridSize,
        targetWidth: metadata.width,
        targetHeight: metadata.height,
        sharpenAmount: 0.9,
        format: 'png',
      });

      const selectedOutputs = targetCellIndexes
        .map(index => ({ source: outputs[index], index }))
        .filter(item => Boolean(item.source));

      if (!selectedOutputs.length) {
        throw new Error('没有生成可用的宫格图片');
      }

      const nextItems = await Promise.all(selectedOutputs.map(async item => (
        await createImageAssetItem({
          source: item.source,
          filenameHint: `cell-${item.index + 1}.png`,
          label: `${nodeData.label} ${item.index + 1}`,
        })
      )));

      onCreateDerivedImportImages(nextItems);
      onToolChange(null);
      message.success(`已生成 ${nextItems.length} 个图片节点`);
    } catch (error: any) {
      message.error(error?.message || '宫格切分失败');
    } finally {
      setIsSplittingGrid(false);
    }
  }, [
    aspectRatio,
    message,
    nodeData.label,
    nodeId,
    onCreateDerivedImportImages,
    onToolChange,
    resolvedCollection.primary,
    selectedSplitCells,
    splitGridSize,
    totalSplitCells,
    workspaceId,
  ]);

  const activeToolPresets = activeTool ? IMAGE_TOOL_PRESETS[activeTool].presets : [];

  return (
    <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">图片节点</div>
          <div className="linghuiEditorSubtitle">
            {isImportMode
              ? '导入输出模式只负责把现有图片传给下游节点。'
              : displayReferenceImages.length > 0
                ? `当前会按顺序带入 ${displayReferenceImages.length} 张上游图片参考，并结合文本上下文组织提示词。`
                : '生成模式下只使用上游输入和提示词，不再提供节点内附加参考图。'}
          </div>
        </div>
      </div>

      {activeTool && (
        <div className="linghuiEditorSection linghuiEditorToolSection">
          <div className="linghuiEditorToolPanel">
            <div className="linghuiEditorToolPanelHeader">
              <div>
                <div className="linghuiEditorToolPanelTitle">{IMAGE_TOOL_PRESETS[activeTool].title}</div>
                <div className="linghuiEditorToolPanelDesc">
                  {isImportMode
                    ? '应用任一预设都会自动切到生成图片模式，参考来源仍然来自上游节点。'
                    : IMAGE_TOOL_PRESETS[activeTool].description}
                </div>
              </div>
              <Button size="small" onClick={() => onToolChange(null)}>
                收起
              </Button>
            </div>

            {activeTool === 'grid-split' ? (
              resolvedCollection.primary?.source ? (
                <div className="linghuiEditorGridTool">
                  <div className="linghuiEditorGridToolbar">
                    {GRID_SPLIT_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`linghuiEditorGridChip ${splitGridType === option.value ? 'isActive' : ''}`}
                        onClick={() => setSplitGridType(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="linghuiEditorGridPreview">
                    <div
                      className="linghuiEditorGridPreviewFrame"
                      style={{ aspectRatio: splitPreviewAspectRatio }}
                    >
                      <img src={getPreviewSource(resolvedCollection.primary.source)} alt={resolvedCollection.primary.label || 'grid-source'} />
                    </div>
                    <div
                      className="linghuiEditorGridOverlay"
                      style={{
                        gridTemplateColumns: `repeat(${splitGridSize}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${splitGridSize}, minmax(0, 1fr))`,
                      }}
                    >
                      {Array.from({ length: totalSplitCells }, (_, index) => {
                        const selectedCell = selectedSplitCells.includes(index);
                        return (
                          <button
                            key={index}
                            type="button"
                            className={`linghuiEditorGridCell ${selectedCell ? 'isSelected' : ''}`}
                            onClick={() => toggleSplitCell(index)}
                          >
                            <span>{index + 1}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="linghuiEditorGridSummary">
                    <span>
                      {hasExplicitSplitSelection
                        ? `已选择 ${effectiveSelectedSplitCount} / ${totalSplitCells} 格`
                        : `未单独选择时将处理全部 ${totalSplitCells} 格`}
                    </span>
                    <div className="linghuiEditorGridActions">
                      <Button size="small" onClick={() => setSelectedSplitCells(Array.from({ length: totalSplitCells }, (_, index) => index))}>
                        全选
                      </Button>
                      <Button size="small" onClick={() => setSelectedSplitCells([])}>
                        清空
                      </Button>
                      <Button type="primary" size="small" loading={isSplittingGrid} onClick={() => void handleExecuteGridSplit()}>
                        生成图片节点
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="linghuiEditorEmptyState">
                  请先让当前图片节点拥有主图，再执行宫格切分。
                </div>
              )
            ) : (
              <div className="linghuiEditorToolPresetList">
                {activeToolPresets.map(preset => (
                  <div key={preset.label} className="linghuiEditorToolPresetCard">
                    <div className="linghuiEditorToolPresetBody">
                      <div className="linghuiEditorToolPresetTitle">{preset.label}</div>
                      <div className="linghuiEditorToolPresetDesc">{preset.description}</div>
                    </div>
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => applyToolPreset(preset)}
                    >
                      应用
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="linghuiEditorRefModes">
        {[
          { key: 'generate' as const, label: '生成图片' },
          { key: 'import' as const, label: '导入输出' },
        ].map(item => (
          <button
            key={item.key}
            className={`linghuiEditorRefModeTab ${mode === item.key ? 'isActive' : ''}`}
            onClick={() => updateProp('mode', item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isImportMode ? (
        <>
          <div className="linghuiEditorSection">
            <div className="linghuiEditorSectionHeader">
              <div className="linghuiEditorSectionTitle">导入图片集合</div>
              <div className="linghuiEditorSectionHint">
                最多 {MAX_LINGHUI_IMAGE_ITEMS} 张，且所有图片必须保持相同比例。主图才会被下游继续使用。
              </div>
            </div>
            <div
              className={`linghuiReferenceDropzone isCompact ${previewSource ? 'hasPreview' : ''}`}
              onDragOver={event => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={handleDropImage}
              onClick={() => {
                void handleSelectImage();
              }}
              role="button"
              tabIndex={0}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  void handleSelectImage();
                }
              }}
            >
              {previewSource ? (
                <img className="linghuiReferencePreview" src={previewSource} alt={nodeData.label || '图片素材'} />
              ) : (
                <div className="linghuiReferencePlaceholder">
                  <UploadCloud size={24} />
                  <div>拖入图片到这里</div>
                  <div className="linghuiReferencePlaceholderHint">或点击选择本地图片素材，可一次加入多张</div>
                </div>
              )}
            </div>

            {importItems.length > 0 && (
              <div className="linghuiEditorImageCollection">
                {importItems.map((item, index) => {
                  const itemPreview = getPreviewSource(item.source);
                  const isPrimary = importPrimary?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`linghuiEditorImageTile ${isPrimary ? 'isPrimary' : ''}`}
                    >
                      <button
                        type="button"
                        className="linghuiEditorImageTileButton"
                        onClick={() => handleSetPrimaryImportImage(item.id)}
                      >
                        {itemPreview ? <img src={itemPreview} alt={item.label || `图片 ${index + 1}`} /> : <ImageIcon size={18} />}
                        <span className="linghuiEditorImageTileIndex">{index + 1}</span>
                        {isPrimary && (
                          <span className="linghuiEditorImageTilePrimary">
                            <Check size={12} />
                            主图
                          </span>
                        )}
                      </button>
                      <div className="linghuiEditorImageTileMeta">
                        <span>{item.label || `图片 ${index + 1}`}</span>
                        <button
                          type="button"
                          className="linghuiEditorImageTileRemove"
                          onClick={() => handleRemoveImportImage(item.id)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="linghuiEditorToolbar">
            <div className="linghuiEditorToolbarLeft">
              <Button size="small" icon={<UploadCloud size={14} />} onClick={() => void handleSelectImage()}>
                {importItems.length > 0 ? '继续添加' : '上传图片'}
              </Button>
              <Button size="small" icon={<Trash2 size={14} />} danger disabled={!importItems.length} onClick={handleClearImage}>
                清空全部
              </Button>
            </div>

            <div className="linghuiEditorToolbarRight">
              <Button
                type="primary"
                size="small"
                shape="circle"
                icon={<ArrowUp size={16} />}
                onClick={onRun}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="linghuiEditorSection">
            <div className="linghuiEditorSectionHeader">
              <div className="linghuiEditorSectionTitle">上游输入</div>
              <div className="linghuiEditorSectionHint">图片参考会严格按照这里的展示顺序编译成 `@Image n`。</div>
            </div>

            {displayReferenceImages.length > 0 ? (
              <div className="linghuiEditorRefs">
                {displayReferenceImages.map((ref, index) => {
                  const src = getPreviewSource(ref.source);
                  return (
                    <div key={`${ref.source || ref.label || index}-${ref.badge}`} className="linghuiEditorRefThumb">
                      {src ? <img src={src} alt={ref.label || `参考 ${index + 1}`} /> : <ImageIcon size={16} />}
                      <span className="linghuiEditorRefBadge">{ref.badge}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="linghuiEditorEmptyState">
                还没有上游图片输入。连接图片、视频封面或文本节点后，再通过提示词引用它们。
              </div>
            )}
          </div>

          {generatedItems.length > 0 && (
            <div className="linghuiEditorSection">
              <div className="linghuiEditorSectionHeader">
                <div className="linghuiEditorSectionTitle">当前结果集合</div>
                <div className="linghuiEditorSectionHint">点击任意图片即可把它设为主图，下游只会使用主图。</div>
              </div>

              <div className="linghuiEditorImageCollection">
                {generatedItems.map((item, index) => {
                  const itemPreview = getPreviewSource(item.source);
                  const isPrimary = resolvedCollection.primary?.source === item.source;
                  return (
                    <div
                      key={`${item.source || index}-${item.label || ''}`}
                      className={`linghuiEditorImageTile ${isPrimary ? 'isPrimary' : ''}`}
                    >
                      <button
                        type="button"
                        className="linghuiEditorImageTileButton"
                        onClick={() => handleSetPrimaryGeneratedImage(item)}
                      >
                        {itemPreview ? <img src={itemPreview} alt={item.label || `结果 ${index + 1}`} /> : <Sparkles size={18} />}
                        <span className="linghuiEditorImageTileIndex">{index + 1}</span>
                        {isPrimary && (
                          <span className="linghuiEditorImageTilePrimary">
                            <Check size={12} />
                            主图
                          </span>
                        )}
                      </button>
                      <div className="linghuiEditorImageTileMeta">
                        <span>{item.label || `结果 ${index + 1}`}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="linghuiEditorPrompt">
            <LinghuiPromptEditor
              value={prompt}
              onChange={value => updateProp('prompt', value)}
              references={promptReferences}
              placeholder="描述你想要生成的画面内容，输入 @ 引用上游产物"
              darkTheme
              surfaceStyle="fusion"
              minHeight="96px"
              maxHeight="188px"
            />
            <div className="linghuiEditorPromptHint">{mentionHint}</div>
          </div>

          <div className="linghuiEditorToolbar">
            <div className="linghuiEditorToolbarLeft">
              <Select
                size="small"
                className="linghuiEditorSelect"
                value={ttiConfigId || undefined}
                placeholder="选择生图渠道"
                onChange={value => updateProp('ttiConfigId', value)}
                options={providers}
                popupMatchSelectWidth={false}
                style={{ minWidth: 140 }}
              />

              <Select
                size="small"
                className="linghuiEditorSelect"
                value={`${aspectRatio}·${resolution}`}
                onChange={value => {
                  const [nextAspectRatio, nextResolution] = value.split('·');
                  updateProp('aspectRatio', nextAspectRatio);
                  updateProp('resolution', nextResolution);
                }}
                popupMatchSelectWidth={false}
                options={IMAGE_ASPECT_RATIOS.flatMap(ar =>
                  IMAGE_RESOLUTIONS.map(res => ({
                    value: `${ar.value}·${res.value}`,
                    label: `${ar.label} · ${res.label}`,
                  })),
                )}
                style={{ minWidth: 124 }}
              />
            </div>

            <div className="linghuiEditorToolbarRight">
              <Button
                size="small"
                icon={<Grid3x3 size={14} />}
                type={activeTool === 'grid-split' ? 'primary' : 'default'}
                disabled={!resolvedCollection.primary?.source}
                onClick={() => onToolChange(activeTool === 'grid-split' ? null : 'grid-split')}
              >
                宫格
              </Button>

              <Select
                size="small"
                value={batchCount}
                onChange={value => updateProp('batchCount', value)}
                options={LINGHUI_IMAGE_BATCH_COUNTS.map(value => ({ value, label: `${value}张` }))}
                popupMatchSelectWidth={false}
                style={{ width: 72 }}
              />

              <Button
                type="primary"
                size="small"
                shape="circle"
                icon={<ArrowUp size={16} />}
                onClick={onRun}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
