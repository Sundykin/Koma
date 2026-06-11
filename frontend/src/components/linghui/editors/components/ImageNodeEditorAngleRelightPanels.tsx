import { useEffect, useState } from 'react';
import { Camera, ChevronUp, HelpCircle, RotateCcw, Sun, X } from 'lucide-react';
import { DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG } from '../../../../types/linghui';
import {
  LINGHUI_LIGHTING_DEFAULT_SWATCH,
  LINGHUI_LIGHTING_SWATCHES,
} from '../../../../theme/palettes/linghuiLightingSwatches';
import { cssVars } from '../../../../theme/runtime';
import type {
  LinghuiImageRelightConfig,
  LinghuiMultiAngleConfig,
  LinghuiMultiAngleMode,
  LinghuiRelightDirection,
} from '../../../../types/linghui';
import type { LinghuiImageToolPresetDef } from '../state/linghuiImageToolPresets';
import { LinghuiLightingSpherePreview } from './LinghuiLightingSpherePreview';
import { LinghuiMultiAngle3DViewport } from './LinghuiMultiAngle3DViewport';

const MULTI_ANGLE_ZOOM_LABELS = ['鱼眼', '超广角', '广角', '标准', '中焦', '长焦', '特写'] as const;

// 对齐 electron-egg tc-lighting-toolbar 的 7 色 swatches（具体色值在 theme/palettes 中）
const RELIGHT_COLOR_SWATCHES = LINGHUI_LIGHTING_SWATCHES;

function normalizeAzimuth(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scaleToZoomStep(scale: number): number {
  return clamp(Math.round((clamp(scale, 0, 100) / 100) * 6), 0, 6);
}

function zoomStepToScale(step: number): number {
  return clamp(Math.round((clamp(step, 0, 6) / 6) * 100), 0, 100);
}

export interface LibTVMultiAnglePreset {
  key: LinghuiMultiAngleConfig['presetKey'];
  label: string;
  values: Pick<LinghuiMultiAngleConfig, 'rotation' | 'tilt' | 'scale'> | null;
  isWideAngle?: boolean;
  prompt: string;
}

interface ImageMultiAnglePanelProps {
  currentImagePreview: string;
  presets: LibTVMultiAnglePreset[];
  multiAngleConfig: LinghuiMultiAngleConfig;
  onApplyPreset: (preset: LibTVMultiAnglePreset) => void;
  onSetMode: (mode: LinghuiMultiAngleMode) => void;
  onUpdateMultiAngle: (patch: Partial<LinghuiMultiAngleConfig>) => void;
  onGenerate: () => void;
  onClose: () => void;
}

interface ImageRelightPanelProps {
  currentImagePreview: string;
  relightValues: LinghuiImageRelightConfig;
  relightSceneActive: boolean;
  relightPrompt: string;
  relightReferenceImage: string | null;
  relightPresetLabel: string;
  relightPresets: LinghuiImageToolPresetDef[];
  mainDirections: Array<{ value: LinghuiRelightDirection; label: string }>;
  backDirections: ReadonlySet<LinghuiRelightDirection>;
  brightnessSteps: readonly number[];
  getPreviewSource: (source?: string) => string;
  onSetRelightSceneActive: (active: boolean) => void;
  onSetRelightBrightnessActive: (active: boolean) => void;
  onSetRelightColorActive: (active: boolean) => void;
  onUpdateRelightValues: (patch: Partial<LinghuiImageRelightConfig>) => void;
  onSetRelightPrompt: (value: string) => void;
  onSetRelightReferenceImage: (value: string | null) => void;
  onPickRelightReferenceImage: () => void;
  onApplyRelightPreset: (preset: LinghuiImageToolPresetDef) => void;
  onGenerate: () => void;
  onClose: () => void;
}

export const ImageNodeEditorMultiAnglePanel: React.FC<ImageMultiAnglePanelProps> = ({
  currentImagePreview,
  presets,
  multiAngleConfig,
  onApplyPreset,
  onSetMode,
  onUpdateMultiAngle,
  onGenerate,
  onClose,
}) => {
  // 灵绘多角度只保留 camera 编辑器（对齐 electron-egg 的 tc-panoramic-editor 单态语义）。
  useEffect(() => {
    if (multiAngleConfig.mode !== 'camera') {
      onSetMode('camera');
    }
  }, [multiAngleConfig.mode, onSetMode]);
  const azimuth = normalizeAzimuth(multiAngleConfig.rotation);
  const elevation = Math.round(clamp(multiAngleConfig.tilt, -85, 85));
  const zoomStep = scaleToZoomStep(multiAngleConfig.scale);
  const zoomLabel = MULTI_ANGLE_ZOOM_LABELS[zoomStep] ?? '广角';
  const customPreset = presets.find(item => item.key === 'custom');

  const resetParams = () => {
    if (customPreset) {
      onApplyPreset(customPreset);
      return;
    }
    onUpdateMultiAngle({ rotation: 0, tilt: 0, scale: 33, isWideAngle: false, presetKey: 'custom' });
  };

  return (
    <div className="tcPanoramicEditor" role="dialog" aria-label="多角度编辑器">
      <div className="tcPanoramicEditor__header">
        <strong>多角度编辑器</strong>
        <button type="button" aria-label="关闭多角度编辑器" onClick={onClose}>×</button>
      </div>

      <div className="tcPanoramicEditor__presets">
        {presets.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={multiAngleConfig.presetKey === tab.key ? 'isActive' : ''}
            onClick={() => onApplyPreset(tab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tcPanoramicEditor__body">
        <div className="tcPanoramicEditor__preview">
          <div className="tcPanoramicEditor__previewInner">
            <div className="tcPanoramicEditor__grid" />
            <LinghuiMultiAngle3DViewport
              imageUrl={currentImagePreview}
              mode="camera"
              rotation={multiAngleConfig.rotation}
              tilt={multiAngleConfig.tilt}
              scale={multiAngleConfig.scale}
              isWideAngle={multiAngleConfig.isWideAngle}
              onRotationTiltChange={(rotation, tilt) => onUpdateMultiAngle({ rotation, tilt, presetKey: 'custom' })}
              onScaleChange={(scale) => onUpdateMultiAngle({ scale, presetKey: 'custom' })}
            />
          </div>
        </div>

        <div className="tcPanoramicEditor__sliders">
          <label className="tcViewSlider tcViewSlider--dark">
            <span>水平环绕</span>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={azimuth}
              aria-label="水平环绕"
              onChange={event => onUpdateMultiAngle({ rotation: Number(event.target.value), presetKey: 'custom' })}
            />
            <em>{azimuth}°</em>
          </label>
          <label className="tcViewSlider tcViewSlider--dark">
            <span>垂直俯仰</span>
            <input
              type="range"
              min={-85}
              max={85}
              step={1}
              value={elevation}
              aria-label="垂直俯仰"
              onChange={event => onUpdateMultiAngle({ tilt: Number(event.target.value), presetKey: 'custom' })}
            />
            <em>{elevation}°</em>
          </label>
          <label className="tcViewSlider tcViewSlider--dark">
            <span>景别缩放</span>
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={zoomStep}
              aria-label="景别缩放"
              onChange={event => onUpdateMultiAngle({ scale: zoomStepToScale(Number(event.target.value)), presetKey: 'custom' })}
            />
            <em>{zoomLabel}</em>
          </label>
        </div>
      </div>

      <div className="tcPanoramicEditor__footer">
        <button type="button" className="tcViewReset tcViewReset--dark" onClick={resetParams}>
          <RotateCcw size={11} />
          <span>重置参数</span>
        </button>
        <button
          type="button"
          className="tcPanoramicEditor__apply"
          aria-label="创建多角度节点"
          onClick={onGenerate}
        >
          <Camera size={17} />
        </button>
      </div>
    </div>
  );
};


export const ImageNodeEditorRelightPanel: React.FC<ImageRelightPanelProps> = ({
  currentImagePreview,
  relightValues,
  relightSceneActive,
  relightPrompt,
  relightReferenceImage,
  relightPresetLabel,
  relightPresets,
  mainDirections,
  backDirections,
  brightnessSteps,
  getPreviewSource,
  onSetRelightSceneActive,
  onSetRelightBrightnessActive,
  onSetRelightColorActive,
  onUpdateRelightValues,
  onSetRelightPrompt,
  onSetRelightReferenceImage,
  onPickRelightReferenceImage,
  onApplyRelightPreset,
  onGenerate,
  onClose,
}) => {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const brightnessIndex = Math.max(0, brightnessSteps.indexOf(relightValues.brightness));
  const activeColorHex = (relightValues.lightColor || LINGHUI_LIGHTING_DEFAULT_SWATCH).toUpperCase();
  const rimDisabled = backDirections.has(relightValues.direction);

  const resetParams = () => {
    onUpdateRelightValues({
      ...DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG,
      mainAzimuthDeg: undefined,
      mainElevationDeg: undefined,
      fillAzimuthDeg: undefined,
      fillElevationDeg: undefined,
      previewMode: undefined,
    });
    onSetRelightSceneActive(false);
    onSetRelightBrightnessActive(false);
    onSetRelightColorActive(false);
    onSetRelightPrompt('');
    onSetRelightReferenceImage(null);
    setColorPickerOpen(false);
  };

  return (
    <div className="tcLightingToolbar linghuiImageLibTVPanel isRelight" role="dialog" aria-label="打光效果">
      <div className="tcLightingToolbar__header">
        <strong>打光效果</strong>
        <button type="button" aria-label="关闭打光效果" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="tcLightingToolbar__body">
        <div className="tcLightingToolbar__preview">
          <LinghuiLightingSpherePreview
            imageUrl={currentImagePreview}
            direction={relightValues.direction}
            brightness={relightValues.brightness}
            lightColor={relightValues.lightColor}
            rimLight={relightValues.rimLight}
            mainAzimuthDeg={relightValues.mainAzimuthDeg}
            mainElevationDeg={relightValues.mainElevationDeg}
            fillAzimuthDeg={relightValues.fillAzimuthDeg}
            fillElevationDeg={relightValues.fillElevationDeg}
            previewMode={relightValues.previewMode ?? 'perspective'}
            onPreviewModeChange={(mode) => onUpdateRelightValues({ previewMode: mode })}
            onAnglesChange={(target, azimuthDeg, elevationDeg) => {
              onSetRelightSceneActive(true);
              if (target === 'main') {
                onUpdateRelightValues({
                  mainAzimuthDeg: azimuthDeg,
                  mainElevationDeg: elevationDeg,
                });
              } else {
                onUpdateRelightValues({
                  fillAzimuthDeg: azimuthDeg,
                  fillElevationDeg: elevationDeg,
                });
              }
            }}
          />
        </div>

        <div className="tcLightingToolbar__controls">
          <div className="tcLightingToolbar__row tcLightingToolbar__row--global">
            <strong>全局</strong>
            <label className="tcViewSwitch">
              <span>智能模式</span>
              <input
                type="checkbox"
                role="switch"
                aria-label="智能模式"
                checked={Boolean(relightValues.smartMode)}
                onChange={event => onUpdateRelightValues({ smartMode: event.target.checked })}
              />
              <i />
            </label>
          </div>

          <label className="tcViewSlider tcViewSlider--light">
            <span>
              亮度
              <HelpCircle size={12} />
            </span>
            <input
              type="range"
              min={0}
              max={brightnessSteps.length - 1}
              step={1}
              aria-label="亮度"
              value={brightnessIndex}
              onMouseDown={() => onSetRelightBrightnessActive(true)}
              onChange={event => {
                onSetRelightBrightnessActive(true);
                onUpdateRelightValues({ brightness: brightnessSteps[Number(event.target.value)] ?? 50 });
              }}
            />
            <em>
              <Sun size={12} />
              {Math.round(relightValues.brightness)}%
            </em>
          </label>

          <div className="tcLightingToolbar__colorRow">
            <span>颜色</span>
            <div className="tcLightingToolbar__colorWrap">
              <button
                type="button"
                className="tcLightingToolbar__colorSwatch"
                aria-label="选择灯光颜色"
                style={cssVars({ '--linghui-relight-color': activeColorHex })}
                onClick={() => setColorPickerOpen(value => !value)}
              />
              {colorPickerOpen && (
                <div className="tcLightingToolbar__colorPopover">
                  <input
                    type="color"
                    aria-label="颜色"
                    value={activeColorHex}
                    onChange={event => {
                      onSetRelightColorActive(true);
                      onUpdateRelightValues({ lightColor: event.target.value });
                    }}
                  />
                  <div className="tcLightingToolbar__swatches">
                    {RELIGHT_COLOR_SWATCHES.map(swatch => (
                      <button
                        key={swatch}
                        type="button"
                        aria-label={`颜色 ${swatch}`}
                        className={activeColorHex === swatch ? 'isActive' : ''}
                        style={cssVars({ '--linghui-relight-swatch': swatch })}
                        onClick={() => {
                          onSetRelightColorActive(true);
                          onUpdateRelightValues({ lightColor: swatch });
                          setColorPickerOpen(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="tcLightingToolbar__sourceGroup">
            <span>主光源</span>
            <div>
              {mainDirections.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={relightValues.direction === value ? 'isActive' : ''}
                  onClick={() => {
                    onSetRelightSceneActive(true);
                    onUpdateRelightValues({
                      direction: value,
                      rimLight: backDirections.has(value) ? false : relightValues.rimLight,
                      // 点 preset 时清空 drag 写入的连续角度，让 direction 派生重新生效
                      mainAzimuthDeg: undefined,
                      mainElevationDeg: undefined,
                    });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="tcLightingToolbar__row">
            <span>轮廓光</span>
            <label className="tcViewSwitch">
              <input
                type="checkbox"
                role="switch"
                aria-label="轮廓光"
                checked={Boolean(relightValues.rimLight)}
                disabled={rimDisabled}
                onChange={() => onUpdateRelightValues({ rimLight: !relightValues.rimLight })}
              />
              <i />
            </label>
          </div>

          {/* 当前活跃状态指示（继承 Linghui 原有语义） */}
          {relightSceneActive && (
            <div className="tcLightingToolbar__activeHint">
              <span>当前场景已启用</span>
            </div>
          )}

          {relightValues.smartMode && (
            <div className="tcLightingToolbar__smartArea">
              <textarea
                className="tcLightingToolbar__prompt"
                placeholder="简单描述你想实现的打光效果，或者情绪风格"
                value={relightPrompt}
                onChange={event => onSetRelightPrompt(event.target.value)}
              />
              {relightReferenceImage ? (
                <div className="tcLightingToolbar__refPreview">
                  <img src={getPreviewSource(relightReferenceImage)} alt="打光参考图" />
                  <button type="button" onClick={() => onSetRelightReferenceImage(null)} aria-label="移除参考图">
                    移除
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="tcLightingToolbar__refButton"
                  onClick={() => onPickRelightReferenceImage()}
                >
                  打光参考图
                </button>
              )}
            </div>
          )}

          <div className="tcLightingToolbar__presetTitle">预设</div>
          <div className="tcLightingToolbar__presetGrid">
            {relightPresets.map((preset: LinghuiImageToolPresetDef) => (
              <button
                key={preset.label}
                type="button"
                className={relightPresetLabel === preset.label ? 'isActive' : ''}
                onClick={() => onApplyRelightPreset(preset)}
              >
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tcLightingToolbar__footer linghuiImageLibTVPanelFooter">
        <button type="button" className="tcViewReset tcViewReset--light" onClick={resetParams}>
          <RotateCcw size={14} />
          <span>重置参数</span>
        </button>
        <div className="tcLightingToolbar__footerActions">
          <span>{relightPresets.length}</span>
          <button type="button" aria-label="创建打光节点" onClick={onGenerate}>
            <ChevronUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

