import { Button } from 'antd';
import { Image as ImageIcon } from 'lucide-react';
import type {
  LinghuiImageFocusRegion,
  LinghuiImageMarkPoint,
} from '../../../../types/linghui';
import {
  DEFAULT_LINGHUI_IMAGE_FOCUS_REGION,
  LINGHUI_IMAGE_MARK_POINT_LIMIT,
} from '../../../../types/linghui';
import { cssVars } from '../../../../theme/runtime';

export type LinghuiFocusRegionAxis = 'x' | 'y' | 'width' | 'height';

const IMAGE_FOCUS_REGION_STEP = 0.01;
const IMAGE_FOCUS_REGION_PRESETS: Array<{
  key: string;
  label: string;
  region: Pick<LinghuiImageFocusRegion, 'x' | 'y' | 'width' | 'height'>;
}> = [
  { key: 'center', label: '中心', region: { x: 0.28, y: 0.22, width: 0.44, height: 0.42 } },
  { key: 'portrait', label: '脸部', region: { x: 0.32, y: 0.12, width: 0.36, height: 0.32 } },
  { key: 'upper', label: '上半身', region: { x: 0.2, y: 0.1, width: 0.6, height: 0.58 } },
  { key: 'full', label: '全图', region: { x: 0.04, y: 0.04, width: 0.92, height: 0.92 } },
];

interface ImageFocusPanelProps {
  currentImagePreview: string;
  imageAlt: string;
  activeFocusRegion: LinghuiImageFocusRegion | null;
  normalizedFocusRegion: LinghuiImageFocusRegion | null;
  onUpdateFocusRegion: (patch: Partial<LinghuiImageFocusRegion>) => void;
  onUpdateFocusRegionAxis: (axis: LinghuiFocusRegionAxis, rawValue: number) => void;
  onEnableFocusRegion: () => void;
  onDisableFocusRegion: () => void;
}

interface ImageMarkPanelProps {
  currentImagePreview: string;
  imageAlt: string;
  activeMarkPoints: LinghuiImageMarkPoint[];
  normalizedMarkPointCount: number;
  onStageClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onStageKeyboardAdd: (target: HTMLDivElement) => void;
  onRemoveMarkPoint: (pointId: string) => void;
  onClearMarkPoints: () => void;
}

function formatFocusRegionPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMarkPointPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export const ImageNodeEditorFocusPanel: React.FC<ImageFocusPanelProps> = ({
  currentImagePreview,
  imageAlt,
  activeFocusRegion,
  normalizedFocusRegion,
  onUpdateFocusRegion,
  onUpdateFocusRegionAxis,
  onEnableFocusRegion,
  onDisableFocusRegion,
}) => {
  const focusRegionStyle = activeFocusRegion
    ? cssVars({
        '--linghui-focus-x': `${activeFocusRegion.x * 100}%`,
        '--linghui-focus-y': `${activeFocusRegion.y * 100}%`,
        '--linghui-focus-w': `${activeFocusRegion.width * 100}%`,
        '--linghui-focus-h': `${activeFocusRegion.height * 100}%`,
      })
    : undefined;

  return (
    <div className="linghuiEditorSection linghuiImageFocusPanel">
      <div className="linghuiImageFocusHeader">
        <div>
          <div className="linghuiEditorSectionTitle">聚焦</div>
          <div className="linghuiImageFocusHint">红框区域会作为下一次局部补全重点</div>
        </div>
        <div className="linghuiEditorSummaryRow">
          {activeFocusRegion ? (
            <span className="linghuiEditorSummaryPill">
              {formatFocusRegionPercent(activeFocusRegion.width)} × {formatFocusRegionPercent(activeFocusRegion.height)}
            </span>
          ) : (
            <span className="linghuiEditorSummaryPill isMuted">未启用</span>
          )}
        </div>
      </div>

      <div className="linghuiImageFocusStage">
        {currentImagePreview ? (
          <img src={currentImagePreview} alt={imageAlt} draggable={false} />
        ) : (
          <ImageIcon size={22} />
        )}
        {activeFocusRegion && <div className="linghuiImageFocusBox" style={focusRegionStyle} />}
      </div>

      <div className="linghuiImageFocusPresetRow">
        {IMAGE_FOCUS_REGION_PRESETS.map(preset => (
          <button
            key={preset.key}
            type="button"
            className="linghuiImageFocusPresetButton"
            onClick={() => onUpdateFocusRegion({ ...preset.region, enabled: true })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="linghuiImageFocusControls">
        {([
          ['x', '横向'],
          ['y', '纵向'],
          ['width', '宽度'],
          ['height', '高度'],
        ] as Array<[LinghuiFocusRegionAxis, string]>).map(([axis, label]) => {
          const value = activeFocusRegion?.[axis] ?? DEFAULT_LINGHUI_IMAGE_FOCUS_REGION[axis];
          return (
            <label key={axis} className="linghuiImageFocusSlider">
              <span>{label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={IMAGE_FOCUS_REGION_STEP}
                value={value}
                onChange={event => onUpdateFocusRegionAxis(axis, Number(event.target.value))}
              />
              <strong>{formatFocusRegionPercent(value)}</strong>
            </label>
          );
        })}
      </div>

      <div className="linghuiImageFocusActions">
        <Button size="small" type="primary" onClick={onEnableFocusRegion}>
          标记区域
        </Button>
        <Button size="small" onClick={onDisableFocusRegion} disabled={!normalizedFocusRegion}>
          清除聚焦
        </Button>
      </div>
    </div>
  );
};

export const ImageNodeEditorMarkPanel: React.FC<ImageMarkPanelProps> = ({
  currentImagePreview,
  imageAlt,
  activeMarkPoints,
  normalizedMarkPointCount,
  onStageClick,
  onStageKeyboardAdd,
  onRemoveMarkPoint,
  onClearMarkPoints,
}) => (
  <div className="linghuiEditorSection linghuiImageMarkPanel">
    <div className="linghuiImageFocusHeader">
      <div>
        <div className="linghuiEditorSectionTitle">标记</div>
        <div className="linghuiImageFocusHint">点击图片添加焦点，标记会写入下一次生成提示</div>
      </div>
      <span className={`linghuiEditorSummaryPill ${activeMarkPoints.length ? '' : 'isMuted'}`}>
        {activeMarkPoints.length}/{LINGHUI_IMAGE_MARK_POINT_LIMIT}
      </span>
    </div>

    <div
      className="linghuiImageMarkStage"
      role="button"
      aria-label="添加标记点"
      tabIndex={0}
      onClick={onStageClick}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onStageKeyboardAdd(event.currentTarget);
        }
      }}
    >
      {currentImagePreview ? (
        <img src={currentImagePreview} alt={imageAlt} draggable={false} />
      ) : (
        <ImageIcon size={22} />
      )}
      {activeMarkPoints.map((point, index) => (
        <span
          key={point.id}
          className="linghuiImageMarkPoint"
          style={cssVars({
            '--linghui-mark-x': `${point.x * 100}%`,
            '--linghui-mark-y': `${point.y * 100}%`,
          })}
        >
          {index + 1}
        </span>
      ))}
    </div>

    {activeMarkPoints.length > 0 && (
      <div className="linghuiImageMarkList">
        {activeMarkPoints.map((point, index) => (
          <div key={point.id} className="linghuiImageMarkListItem">
            <span>{point.label || `标记 ${index + 1}`}</span>
            <strong>
              {formatMarkPointPercent(point.x)}, {formatMarkPointPercent(point.y)}
            </strong>
            <button type="button" onClick={() => onRemoveMarkPoint(point.id)}>
              删除
            </button>
          </div>
        ))}
      </div>
    )}

    <div className="linghuiImageFocusActions">
      <Button size="small" onClick={onClearMarkPoints} disabled={normalizedMarkPointCount === 0}>
        清除标记
      </Button>
    </div>
  </div>
);
