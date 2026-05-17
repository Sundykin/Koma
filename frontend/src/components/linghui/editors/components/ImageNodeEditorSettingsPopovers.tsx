import type {
  LinghuiImageCinematicConfig,
} from '../../../../types/linghui';
import {
  IMAGE_RESOLUTIONS,
  LINGHUI_IMAGE_APERTURE_PRESETS,
  LINGHUI_IMAGE_BATCH_COUNTS,
  LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS,
  normalizeLinghuiImageCinematicConfig,
} from '../../../../types/linghui';

interface ImageEditorOption {
  value: string;
  label: string;
}

export interface ImageNodeEditorExtraSettingsBlock {
  /** 渲染在设置弹层里的标题（与原生 比例 / 分辨率 / 出图数量 等并列） */
  label: string;
  /** 当前选中的 value */
  value: string;
  /** 候选项；label 显示，value 写回 */
  options: Array<{ value: string; label: string; hint?: string }>;
  onChange: (next: string) => void;
}

interface ImageSettingsContentProps {
  aspectRatioChoices: ImageEditorOption[];
  aspectRatio: string;
  resolution: string;
  batchCount: number;
  hideBatchCount: boolean;
  extraSettings?: ImageNodeEditorExtraSettingsBlock | ImageNodeEditorExtraSettingsBlock[];
  onAspectRatioChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
  onBatchCountChange: (value: number) => void;
}

interface CameraSettingsContentProps {
  cinematicConfig: LinghuiImageCinematicConfig;
  onCinematicChange: (config: LinghuiImageCinematicConfig) => void;
}

export const ImageNodeEditorImageSettingsContent: React.FC<ImageSettingsContentProps> = ({
  aspectRatioChoices,
  aspectRatio,
  resolution,
  batchCount,
  hideBatchCount,
  extraSettings,
  onAspectRatioChange,
  onResolutionChange,
  onBatchCountChange,
}) => (
  <div
    className="linghuiEditorSettingsPopover"
    onClick={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()}
    onPointerDown={event => event.stopPropagation()}
  >
    <div className="linghuiEditorSettingsBlock">
      <div className="linghuiEditorSettingsLabel">比例</div>
      <div className="linghuiEditorOptionGrid">
        {aspectRatioChoices.map(option => (
          <button
            key={option.value}
            type="button"
            className={`linghuiEditorOptionTile ${aspectRatio === option.value ? 'isActive' : ''}`}
            onClick={() => onAspectRatioChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>

    <div className="linghuiEditorSettingsBlock">
      <div className="linghuiEditorSettingsLabel">分辨率</div>
      <div className="linghuiEditorOptionGrid isCompact">
        {IMAGE_RESOLUTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            className={`linghuiEditorOptionTile ${resolution === option.value ? 'isActive' : ''}`}
            onClick={() => onResolutionChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>

    {!hideBatchCount && (
      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">出图数量</div>
        <div className="linghuiEditorOptionGrid">
          {LINGHUI_IMAGE_BATCH_COUNTS.map(value => (
            <button
              key={value}
              type="button"
              className={`linghuiEditorOptionTile ${batchCount === value ? 'isActive' : ''}`}
              onClick={() => onBatchCountChange(value)}
            >
              {value}张
            </button>
          ))}
        </div>
      </div>
    )}

    {extraSettings && (Array.isArray(extraSettings) ? extraSettings : [extraSettings]).map((block, index) => (
      <div key={`${block.label}-${index}`} className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">{block.label}</div>
        <div className="linghuiEditorOptionGrid">
          {block.options.map(option => (
            <button
              key={option.value}
              type="button"
              className={`linghuiEditorOptionTile ${block.value === option.value ? 'isActive' : ''}`}
              onClick={() => block.onChange(option.value)}
              title={option.hint}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export const ImageNodeEditorCameraSettingsContent: React.FC<CameraSettingsContentProps> = ({
  cinematicConfig,
  onCinematicChange,
}) => (
  <div
    className="linghuiEditorSettingsPopover isCameraMenu"
    onClick={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()}
    onPointerDown={event => event.stopPropagation()}
  >
    <div className="linghuiEditorSettingsBlock">
      <div className="linghuiEditorSettingsLabel">焦距 / 镜头</div>
      <div className="linghuiEditorOptionGrid">
        {LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS.map(option => (
          <button
            key={option.value}
            type="button"
            className={`linghuiEditorOptionTile ${cinematicConfig.focalLength === option.value ? 'isActive' : ''}`}
            onClick={() => onCinematicChange(normalizeLinghuiImageCinematicConfig({
              ...cinematicConfig,
              focalLength: option.value,
            }))}
            title={option.prompt}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>

    <div className="linghuiEditorSettingsBlock">
      <div className="linghuiEditorSettingsLabel">光圈 / 景深</div>
      <div className="linghuiEditorOptionGrid isCompact">
        {LINGHUI_IMAGE_APERTURE_PRESETS.map(option => (
          <button
            key={option.value}
            type="button"
            className={`linghuiEditorOptionTile ${cinematicConfig.aperture === option.value ? 'isActive' : ''}`}
            onClick={() => onCinematicChange(normalizeLinghuiImageCinematicConfig({
              ...cinematicConfig,
              aperture: option.value,
            }))}
            title={option.prompt}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
