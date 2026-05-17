import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { ArrowUp, Image as ImageIcon, RotateCcw, X } from 'lucide-react';
import type {
  LinghuiImageToolKey,
} from '../../../../types/linghui';
import {
  IMAGE_RESOLUTIONS,
} from '../../../../types/linghui';
import { cssVars } from '../../../../theme/runtime';
import {
  LINGHUI_IMAGE_TOOL_PRESETS,
  type LinghuiImageToolPresetDef,
} from '../state/linghuiImageToolPresets';

export interface ImageEditorOption {
  value: string;
  label: string;
}

export interface LinghuiImageOutpaintRatio {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface LibTVToolShellProps {
  title: string;
  className?: string;
  children: ReactNode;
  onClose: () => void;
}

interface LibTVToolFooterProps {
  onGenerate: () => void;
  onClose: () => void;
  disabled?: boolean;
}

interface ImagePreviewStageProps {
  currentImagePreview: string;
  imageAlt: string;
  className?: string;
}

interface ImageOutpaintToolPanelProps {
  currentImagePreview: string;
  imageAlt: string;
  aspectRatioChoices: ImageEditorOption[];
  outpaintPresets: LinghuiImageToolPresetDef[];
  outpaintPresetLabel: string;
  outpaintAspectRatio: string;
  outpaintResolution: string;
  outpaintRatio: LinghuiImageOutpaintRatio;
  setOutpaintAspectRatio: (value: string) => void;
  setOutpaintResolution: (value: string) => void;
  setOutpaintRatio: Dispatch<SetStateAction<LinghuiImageOutpaintRatio>>;
  onSelectOutpaintPreset: (preset: LinghuiImageToolPresetDef) => void;
  onGenerate: () => void;
  onClose: () => void;
}

interface ImageRepaintToolPanelProps {
  currentImagePreview: string;
  imageAlt: string;
  aspectRatioChoices: ImageEditorOption[];
  repaintPresets: LinghuiImageToolPresetDef[];
  repaintPresetLabel: string;
  repaintPrompt: string;
  repaintAspectRatio: string;
  setRepaintPresetLabel: (value: string) => void;
  setRepaintPrompt: (value: string) => void;
  setRepaintAspectRatio: (value: string) => void;
  onGenerate: () => void;
  onClose: () => void;
}

interface ImageGenericToolPanelProps {
  tool: LinghuiImageToolKey;
  currentImagePreview: string;
  imageAlt: string;
  aspectRatioChoices: ImageEditorOption[];
  genericPresetLabel: string;
  genericPrompt: string;
  genericAspectRatio: string;
  genericResolution: string;
  onSelectGenericPreset: (preset: LinghuiImageToolPresetDef) => void;
  setGenericPrompt: (value: string) => void;
  setGenericAspectRatio: (value: string) => void;
  setGenericResolution: (value: string) => void;
  onGenerate: () => void;
  onClose: () => void;
}

export const ImageNodeEditorLibTVToolShell: React.FC<LibTVToolShellProps> = ({
  title,
  className = '',
  children,
  onClose,
}) => (
  <div className={`linghuiImageLibTVPanel ${className}`} role="dialog" aria-label={title}>
    <div className="linghuiImageLibTVPanelHeader">
      <h3>{title}</h3>
      <button
        type="button"
        className="linghuiImageLibTVCloseButton"
        aria-label="关闭"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
    {children}
  </div>
);

export const ImageNodeEditorLibTVToolFooter: React.FC<LibTVToolFooterProps> = ({
  onGenerate,
  onClose,
  disabled = false,
}) => (
  <div className="linghuiImageLibTVPanelFooter">
    <button
      type="button"
      className="linghuiImageLibTVResetButton"
      onClick={onClose}
    >
      <RotateCcw size={14} />
      <span>重置参数</span>
    </button>
    <div className="linghuiImageLibTVFooterRight">
      <button
        type="button"
        className="linghuiImageLibTVGenerateButton"
        aria-label="生成"
        disabled={disabled}
        onClick={onGenerate}
      >
        <ArrowUp size={18} />
      </button>
    </div>
  </div>
);

export const ImageNodeEditorPreviewStage: React.FC<ImagePreviewStageProps> = ({
  currentImagePreview,
  imageAlt,
  className = '',
}) => (
  <div className={`linghuiImageLibTVPreviewStage ${className}`}>
    {currentImagePreview ? (
      <img src={currentImagePreview} alt={imageAlt} draggable={false} />
    ) : (
      <ImageIcon size={30} />
    )}
  </div>
);

export const ImageNodeEditorOutpaintPanel: React.FC<ImageOutpaintToolPanelProps> = ({
  currentImagePreview,
  imageAlt,
  aspectRatioChoices,
  outpaintPresets,
  outpaintPresetLabel,
  outpaintAspectRatio,
  outpaintResolution,
  outpaintRatio,
  setOutpaintAspectRatio,
  setOutpaintResolution,
  setOutpaintRatio,
  onSelectOutpaintPreset,
  onGenerate,
  onClose,
}) => (
  <ImageNodeEditorLibTVToolShell title="扩图" className="isCompactTool" onClose={onClose}>
    <div className="linghuiImageLibTVPanelBody isTwoColumn">
      <div className="linghuiImageLibTVOutpaintStage">
        {/* LibTV 扩图预览：原图居中，4 向白色扩展区根据 outpaintRatio 实时显示 */}
        <div
          className="linghuiImageToolOutpaintPreview"
          style={cssVars({
            '--linghui-outpaint-top': `${outpaintRatio.top * 100}%`,
            '--linghui-outpaint-right': `${outpaintRatio.right * 100}%`,
            '--linghui-outpaint-bottom': `${outpaintRatio.bottom * 100}%`,
            '--linghui-outpaint-left': `${outpaintRatio.left * 100}%`,
          })}
        >
          <div className="linghuiImageToolOutpaintFrame">
            {currentImagePreview ? (
              <img src={currentImagePreview} alt={imageAlt} draggable={false} />
            ) : (
              <ImageIcon size={22} />
            )}
          </div>
        </div>
      </div>
      <div className="linghuiImageLibTVControlStack">
        <div className="linghuiImageLibTVSectionTitle">扩图方式</div>
        <div className="linghuiImageLibTVPresetButtons">
          {outpaintPresets.map((preset: LinghuiImageToolPresetDef) => (
            <button
              key={preset.label}
              type="button"
              className={outpaintPresetLabel === preset.label ? 'isActive' : ''}
              onClick={() => onSelectOutpaintPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="linghuiImageLibTVSectionTitle">扩图方向（0–80%）</div>
        <div className="linghuiImageLibTVOutpaintSliders">
          {(['top', 'right', 'bottom', 'left'] as const).map(side => {
            const label = ({ top: '上', right: '右', bottom: '下', left: '左' } as const)[side];
            return (
              <label key={side} className="linghuiImageLibTVOutpaintSliderRow">
                <span className="linghuiImageLibTVOutpaintSliderLabel">{label}</span>
                <input
                  type="range"
                  min={0}
                  max={0.8}
                  step={0.05}
                  value={outpaintRatio[side]}
                  onChange={event => setOutpaintRatio(prev => ({ ...prev, [side]: Number(event.target.value) }))}
                />
                <span className="linghuiImageLibTVOutpaintSliderValue">
                  {Math.round(outpaintRatio[side] * 100)}%
                </span>
              </label>
            );
          })}
        </div>
        <div className="linghuiImageLibTVSectionTitle">比例</div>
        <div className="linghuiImageLibTVPresetButtons">
          {aspectRatioChoices.map(option => (
            <button
              key={option.value}
              type="button"
              className={outpaintAspectRatio === option.value ? 'isActive' : ''}
              onClick={() => setOutpaintAspectRatio(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="linghuiImageLibTVSectionTitle">分辨率</div>
        <div className="linghuiImageLibTVPresetButtons">
          {IMAGE_RESOLUTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={outpaintResolution === option.value ? 'isActive' : ''}
              onClick={() => setOutpaintResolution(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
    <ImageNodeEditorLibTVToolFooter onGenerate={onGenerate} onClose={onClose} />
  </ImageNodeEditorLibTVToolShell>
);

export const ImageNodeEditorRepaintPanel: React.FC<ImageRepaintToolPanelProps> = ({
  currentImagePreview,
  imageAlt,
  aspectRatioChoices,
  repaintPresets,
  repaintPresetLabel,
  repaintPrompt,
  repaintAspectRatio,
  setRepaintPresetLabel,
  setRepaintPrompt,
  setRepaintAspectRatio,
  onGenerate,
  onClose,
}) => (
  <ImageNodeEditorLibTVToolShell title="重绘" className="isCompactTool" onClose={onClose}>
    <div className="linghuiImageLibTVPanelBody isTwoColumn">
      <ImageNodeEditorPreviewStage currentImagePreview={currentImagePreview} imageAlt={imageAlt} />
      <div className="linghuiImageLibTVControlStack">
        <div className="linghuiImageLibTVSectionTitle">重绘方式</div>
        <div className="linghuiImageLibTVPresetButtons">
          {repaintPresets.map((preset: LinghuiImageToolPresetDef) => (
            <button
              key={preset.label}
              type="button"
              className={repaintPresetLabel === preset.label ? 'isActive' : ''}
              onClick={() => setRepaintPresetLabel(preset.label)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <textarea
          className="linghuiImageLibTVPromptBox"
          value={repaintPrompt}
          placeholder="补充要修复、替换或迁移的具体方向"
          onChange={event => setRepaintPrompt(event.target.value)}
        />
        <div className="linghuiImageLibTVSectionTitle">比例</div>
        <div className="linghuiImageLibTVPresetButtons">
          {aspectRatioChoices.map(option => (
            <button
              key={option.value}
              type="button"
              className={repaintAspectRatio === option.value ? 'isActive' : ''}
              onClick={() => setRepaintAspectRatio(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
    <ImageNodeEditorLibTVToolFooter onGenerate={onGenerate} onClose={onClose} />
  </ImageNodeEditorLibTVToolShell>
);

export const ImageNodeEditorGenericPanel: React.FC<ImageGenericToolPanelProps> = ({
  tool,
  currentImagePreview,
  imageAlt,
  aspectRatioChoices,
  genericPresetLabel,
  genericPrompt,
  genericAspectRatio,
  genericResolution,
  onSelectGenericPreset,
  setGenericPrompt,
  setGenericAspectRatio,
  setGenericResolution,
  onGenerate,
  onClose,
}) => {
  const toolDef = LINGHUI_IMAGE_TOOL_PRESETS[tool];
  const presets = toolDef.presets;
  const isCropTool = tool === 'crop';

  return (
    <ImageNodeEditorLibTVToolShell title={toolDef.title} className="isCompactTool" onClose={onClose}>
      <div className="linghuiImageLibTVPanelBody isTwoColumn">
        <ImageNodeEditorPreviewStage currentImagePreview={currentImagePreview} imageAlt={imageAlt} />
        <div className="linghuiImageLibTVControlStack">
          <div className="linghuiImageLibTVSectionTitle">
            {toolDef.title}方式
          </div>
          <div className="linghuiImageLibTVPresetButtons">
            {presets.map((preset: LinghuiImageToolPresetDef) => (
              <button
                key={preset.label}
                type="button"
                className={genericPresetLabel === preset.label ? 'isActive' : ''}
                onClick={() => onSelectGenericPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {/* 裁剪类纯本地工具不需要追加 prompt；其它工具支持用户补充 prompt */}
          {!isCropTool && (
            <textarea
              className="linghuiImageLibTVPromptBox"
              value={genericPrompt}
              placeholder="补充具体要求（可选）"
              onChange={event => setGenericPrompt(event.target.value)}
            />
          )}
          <div className="linghuiImageLibTVSectionTitle">比例</div>
          <div className="linghuiImageLibTVPresetButtons">
            {aspectRatioChoices.map(option => (
              <button
                key={option.value}
                type="button"
                className={genericAspectRatio === option.value ? 'isActive' : ''}
                onClick={() => setGenericAspectRatio(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {!isCropTool && (
            <>
              <div className="linghuiImageLibTVSectionTitle">分辨率</div>
              <div className="linghuiImageLibTVPresetButtons">
                {IMAGE_RESOLUTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={genericResolution === option.value ? 'isActive' : ''}
                    onClick={() => setGenericResolution(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <ImageNodeEditorLibTVToolFooter onGenerate={onGenerate} onClose={onClose} />
    </ImageNodeEditorLibTVToolShell>
  );
};
