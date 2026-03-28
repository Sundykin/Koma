import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Dropdown, Select, Tooltip } from 'antd';
import { ArrowUp, Grid3x3, Image as ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import type {
  LinghuiGridType,
  LinghuiImageNodeMode,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiImageToolKey,
} from '../../types/linghui';
import {
  GRID_TYPES,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
} from '../../types/linghui';
import { loadSettings } from '../../store/settings/core';
import { electronService, openFileDialog } from '../../services/electronService';
import { importLinghuiWorkspaceAsset } from '../../store/linghuiStorage';
import { useLinghuiNodeMutation } from './nodes/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from './linghuiPromptReferences';

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

interface ProviderOption {
  value: string;
  label: string;
}

interface ImageNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  referenceImages: Array<{ source?: string; label?: string }>;
  promptReferences?: LinghuiPromptReferenceItem[];
  workspaceId?: string | null;
  activeTool: LinghuiImageToolKey | null;
  onToolChange: (tool: LinghuiImageToolKey | null) => void;
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

const IMAGE_TOOLBAR_ITEMS: Array<{ key: LinghuiImageToolKey; label: string }> = [
  { key: 'slash', label: 'Slash' },
  { key: 'multi-angle', label: '多角度' },
  { key: 'outpaint', label: '扩图' },
  { key: 'relight', label: '打光' },
  { key: 'repaint', label: '重绘' },
];

const IMAGE_SLASH_PRESETS: ImageToolPreset[] = [
  {
    label: '/multi-angle',
    description: '把当前主体扩展成多角度设定图。',
    promptSnippet: '同一主体的多角度设定图，展示正面、侧面、背面和三分之四视角，保持造型、服饰与材质高度一致。',
    properties: { gridType: '2x2', batchCount: 4 },
  },
  {
    label: '/outpaint',
    description: '在保留主体的前提下向四周延展构图。',
    promptSnippet: '在保留主体与主要构图的基础上向四周扩图，补足环境细节、前景层次和空间纵深。',
    properties: { aspectRatio: '16:9', resolution: '2K' },
  },
  {
    label: '/relight',
    description: '快速切换电影布光和情绪光氛围。',
    promptSnippet: '电影级布光，主光、轮廓光与环境氛围光层次清晰，材质高光自然，空间光比明确。',
    properties: { resolution: '2K' },
  },
  {
    label: '/repaint',
    description: '把当前提示切换到细节修复和局部重绘方向。',
    promptSnippet: '局部重绘，修复手部、五官与边缘细节，保持主体身份和整体风格一致。',
  },
  {
    label: '/grid',
    description: '切到宫格输出，适合角色表和素材探索。',
    promptSnippet: '输出一组统一风格的多画面参考图，主体一致，变化集中在姿态、镜头与场景细节。',
    properties: { gridType: '3x3', batchCount: 4 },
  },
];

const IMAGE_TOOL_PRESETS: Record<Exclude<LinghuiImageToolKey, 'slash'>, {
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
};

function mergePromptSnippet(currentPrompt: string, snippet: string): string {
  const normalizedCurrent = currentPrompt.trim();
  const normalizedSnippet = snippet.trim();
  if (!normalizedSnippet) return normalizedCurrent;
  if (normalizedCurrent.includes(normalizedSnippet)) return normalizedCurrent;
  return normalizedCurrent ? `${normalizedCurrent}\n${normalizedSnippet}` : normalizedSnippet;
}

function resolveImageNodeMode(props: LinghuiImageNodeProperties): LinghuiImageNodeMode {
  if (props.mode === 'import' || props.mode === 'generate') {
    return props.mode;
  }
  return String(props.source ?? '').trim() ? 'import' : 'generate';
}

export const ImageNodeEditor: React.FC<ImageNodeEditorProps> = ({
  nodeId,
  nodeData,
  referenceImages,
  promptReferences = [],
  workspaceId = null,
  activeTool,
  onToolChange,
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
  const gridType = (props.gridType ?? 'none') as LinghuiGridType;
  const batchCount = Number(props.batchCount ?? 4);
  const previewSource = getPreviewSource(source);
  const hasSource = Boolean(source.trim());
  const isImportMode = mode === 'import';
  const displayReferenceImages: DisplayReferenceImage[] = [
    ...(hasSource && !isImportMode ? [{ source, label: '当前素材', badge: '主' }] : []),
    ...referenceImages.map((ref, index) => ({
      ...ref,
      badge: String(index + 1),
    })),
  ];

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const mentionHint = isImportMode
    ? hasSource
      ? '当前节点会直接输出挂载本地图像；切到生成图片后，这张图会继续作为节点内参考图参与生图'
      : '当前处于导入输出模式，请先上传图片素材'
    : hasSource
      ? '当前素材会作为节点内主参考图参与生成，输入 @ 仍可继续引用其它上游图片、封面或文本产物'
    : promptReferences.length > 0
      ? '输入 @ 可直接引用上游图片、封面或文本产物，执行时会自动完成提示词替换'
      : '当前还没有可引用的上游产物，先连接参考图、文本节点或上游图片节点';

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

  const updateProp = useCallback((key: string, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
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

  const applyUploadedImage = useCallback(async (nextSource: string, filenameHint?: string) => {
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

    updateNodeData(nodeId, prev => ({
      ...prev,
      label: prev.label.startsWith('图片') ? (filenameHint?.replace(/\.[^.]+$/, '') || prev.label) : prev.label,
      properties: {
        ...prev.properties,
        mode: resolveImageNodeMode(prev.properties as unknown as LinghuiImageNodeProperties),
        source: resolvedSource,
      },
    }));
    clearNodeRunState(nodeId);
  }, [clearNodeRunState, nodeId, updateNodeData, workspaceId]);

  const handleSelectImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        multiple: false,
        title: '选择图片素材',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const filename = filePath.split(/[\\/]/).pop();
        await applyUploadedImage(filePath, filename);
      }
    } catch (error: any) {
      message.error(error?.message || '选择图片失败');
    }
  }, [applyUploadedImage, message]);

  const handleDropImage = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      message.warning('请拖入图片文件');
      return;
    }

    try {
      const filePath = (file as File & { path?: string }).path;
      if (filePath) {
        await applyUploadedImage(filePath, file.name);
        return;
      }

      const dataUrl = await readFileAsDataUrl(file);
      await applyUploadedImage(dataUrl, file.name);
    } catch (error: any) {
      message.error(error?.message || '导入图片失败');
    }
  }, [applyUploadedImage, message]);

  const handleClearImage = useCallback(() => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        source: '',
      },
    }));
    clearNodeRunState(nodeId);
  }, [clearNodeRunState, nodeId, updateNodeData]);

  return (
    <div className="linghuiEditorPanel" onMouseDown={e => e.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">图片节点</div>
          <div className="linghuiEditorSubtitle">
            {isImportMode
              ? hasSource
                ? '当前处于导入输出模式，会直接输出挂载的图片产物'
                : '当前处于导入输出模式，上传图片后可直接作为画布产物输出'
              : displayReferenceImages.length > 0
                ? `当前会带入 ${displayReferenceImages.length} 张参考图；连接的文本节点也会作为提示上下文带入`
                : '可上传本地图像，或连接参考图 / 文本节点后生成图片'}
          </div>
        </div>
      </div>

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

      <div className="linghuiEditorToolBar">
        {IMAGE_TOOLBAR_ITEMS.map(item => (
          <button
            key={item.key}
            type="button"
            className={`linghuiEditorToolChip ${activeTool === item.key ? 'isActive' : ''}`}
            onClick={() => onToolChange(activeTool === item.key ? null : item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeTool && (
        <div className="linghuiEditorToolPanel">
          <div className="linghuiEditorToolPanelHeader">
            <div>
              <div className="linghuiEditorToolPanelTitle">
                {activeTool === 'slash' ? 'Slash 快捷面板' : IMAGE_TOOL_PRESETS[activeTool].title}
              </div>
              <div className="linghuiEditorToolPanelDesc">
                {isImportMode
                  ? '当前节点仍在导入输出模式，点击任一预设会自动切到生成图片，并保留当前素材作为节点内参考图。'
                  : activeTool === 'slash'
                    ? '一键把常用图像操作写入提示词和参数，不必手动拼装。'
                    : IMAGE_TOOL_PRESETS[activeTool].description}
              </div>
            </div>
            <Button size="small" onClick={() => onToolChange(null)}>
              收起
            </Button>
          </div>

          <div className="linghuiEditorToolPresetList">
            {(activeTool === 'slash' ? IMAGE_SLASH_PRESETS : IMAGE_TOOL_PRESETS[activeTool].presets).map(preset => (
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
        </div>
      )}

      <div
        className={`linghuiReferenceDropzone ${previewSource ? 'hasPreview' : ''}`}
        onDragOver={event => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={handleDropImage}
        onClick={handleSelectImage}
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
            <UploadCloud size={28} />
            <div>拖入图片到这里</div>
            <div className="linghuiReferencePlaceholderHint">或点击选择本地图片素材</div>
          </div>
        )}
      </div>

      {displayReferenceImages.length > 0 && !isImportMode && (
        <div className="linghuiEditorRefs">
          {displayReferenceImages.map((ref, i) => {
            const src = getPreviewSource(ref.source);
            return (
              <div key={`${ref.source || ref.label || i}-${ref.badge}`} className="linghuiEditorRefThumb">
                {src ? <img src={src} alt={ref.label || `参考 ${i + 1}`} /> : <ImageIcon size={16} />}
                <span className="linghuiEditorRefBadge">{ref.badge}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="linghuiEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={value => updateProp('prompt', value)}
          references={promptReferences}
          placeholder={isImportMode ? '导入模式下这里可先保留你的备注；切回生成图片后会继续作为提示词使用' : '描述你想要生成的画面内容，输入 @ 引用上游产物'}
          darkTheme
          minHeight="80px"
          maxHeight="160px"
        />
        <div className="linghuiEditorPromptHint">{mentionHint}</div>
      </div>

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarLeft">
          <Button size="small" icon={<UploadCloud size={14} />} onClick={handleSelectImage}>
            上传图片
          </Button>
          <Button size="small" icon={<Trash2 size={14} />} danger disabled={!source} onClick={handleClearImage}>
            清空素材
          </Button>

          <Select
            size="small"
            className="linghuiEditorSelect"
            value={ttiConfigId || undefined}
            placeholder="选择生图渠道"
            onChange={v => updateProp('ttiConfigId', v)}
            options={providers}
            popupMatchSelectWidth={false}
            style={{ minWidth: 140 }}
            disabled={isImportMode}
          />

          <Select
            size="small"
            className="linghuiEditorSelect"
            value={`${aspectRatio}·${resolution}`}
            onChange={v => {
              const [ar, res] = v.split('·');
              updateProp('aspectRatio', ar);
              updateProp('resolution', res);
            }}
            popupMatchSelectWidth={false}
            options={IMAGE_ASPECT_RATIOS.flatMap(ar =>
              IMAGE_RESOLUTIONS.map(res => ({
                value: `${ar.value}·${res.value}`,
                label: `${ar.label} · ${res.label}`,
              })),
            )}
            style={{ minWidth: 120 }}
            disabled={isImportMode}
          />
        </div>

        <div className="linghuiEditorToolbarRight">
          <Dropdown
            menu={{
              items: GRID_TYPES.map(g => ({
                key: g.value,
                label: g.label,
                onClick: () => updateProp('gridType', g.value),
                disabled: isImportMode,
              })),
              selectedKeys: [gridType],
            }}
            trigger={['click']}
            disabled={isImportMode}
          >
            <Tooltip title={isImportMode ? '导入输出模式下不使用宫格生成' : '宫格类型'}>
              <Button size="small" icon={<Grid3x3 size={14} />} type={gridType !== 'none' ? 'primary' : 'default'} disabled={isImportMode}>
                {gridType !== 'none' && !isImportMode ? gridType : ''}
              </Button>
            </Tooltip>
          </Dropdown>

          <Select
            size="small"
            value={batchCount}
            onChange={v => updateProp('batchCount', v)}
            options={[
              { value: 1, label: '1张' },
              { value: 2, label: '2张' },
              { value: 4, label: '4张' },
            ]}
            popupMatchSelectWidth={false}
            style={{ width: 72 }}
            disabled={isImportMode}
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
    </div>
  );
};
