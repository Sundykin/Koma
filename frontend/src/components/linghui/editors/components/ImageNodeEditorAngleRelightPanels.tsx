import type {
  LinghuiImageRelightConfig,
  LinghuiMultiAngleConfig,
  LinghuiMultiAngleMode,
  LinghuiRelightDirection,
} from '../../../../types/linghui';
import type { LinghuiImageToolPresetDef } from '../state/linghuiImageToolPresets';
import { LinghuiLightingSpherePreview } from './LinghuiLightingSpherePreview';
import { LinghuiMultiAngle3DViewport } from './LinghuiMultiAngle3DViewport';
import {
  ImageNodeEditorLibTVToolFooter,
  ImageNodeEditorLibTVToolShell,
} from './ImageNodeEditorLibTVPanels';

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
}) => (
  <ImageNodeEditorLibTVToolShell title="多角度编辑器" className="isMultiAngle" onClose={onClose}>
    <div className="linghuiImageLibTVTabRow">
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
    <div className="linghuiImageLibTVPanelBody isTwoColumn">
      <div className="linghuiImageLibTVPreviewStage isMultiAngleScene linghuiImageLibTVOrbitStage">
        <LinghuiMultiAngle3DViewport
          imageUrl={currentImagePreview}
          mode={multiAngleConfig.mode}
          rotation={multiAngleConfig.rotation}
          tilt={multiAngleConfig.tilt}
          scale={multiAngleConfig.scale}
          isWideAngle={multiAngleConfig.isWideAngle}
          onRotationTiltChange={(rotation, tilt) => onUpdateMultiAngle({ rotation, tilt, presetKey: 'custom' })}
          onScaleChange={(scale) => onUpdateMultiAngle({ scale, presetKey: 'custom' })}
        />
      </div>
      <div className="linghuiImageLibTVControlStack">
        <div className="linghuiImageLibTVModeSwitcher" role="tablist" aria-label="多角度模式">
          <button type="button" className={multiAngleConfig.mode === 'object' ? 'isActive' : ''} onClick={() => onSetMode('object')}>
            Object
          </button>
          <button type="button" className={multiAngleConfig.mode === 'camera' ? 'isActive' : ''} onClick={() => onSetMode('camera')}>
            Camera
          </button>
        </div>
        {multiAngleConfig.mode === 'camera' ? (
          <>
            <div className="linghuiImageLibTVSliderRow">
              <span>水平环绕</span>
              <input
                type="range"
                min={0}
                max={315}
                step={45}
                value={((Math.round(multiAngleConfig.rotation / 45) * 45) % 360 + 360) % 360}
                onChange={event => onUpdateMultiAngle({ rotation: Number(event.target.value), presetKey: 'custom' })}
              />
              <strong>{((Math.round(multiAngleConfig.rotation / 45) * 45) % 360 + 360) % 360}°</strong>
            </div>
            <div className="linghuiImageLibTVSliderRow">
              <span>垂直俯仰</span>
              <input
                type="range"
                min={-30}
                max={60}
                step={30}
                value={Math.max(-30, Math.min(60, Math.round(multiAngleConfig.tilt / 30) * 30))}
                onChange={event => onUpdateMultiAngle({ tilt: Number(event.target.value), presetKey: 'custom' })}
              />
              <strong>{Math.max(-30, Math.min(60, Math.round(multiAngleConfig.tilt / 30) * 30))}°</strong>
            </div>
            <div className="linghuiImageLibTVSliderRow">
              <span>景别缩放</span>
              <input
                type="range"
                min={0}
                max={10}
                step={5}
                value={Math.round(multiAngleConfig.scale / 10)}
                onChange={event => onUpdateMultiAngle({ scale: Number(event.target.value) * 10, presetKey: 'custom' })}
              />
              <strong>{multiAngleConfig.scale <= 30 ? '全景' : multiAngleConfig.scale <= 60 ? '中景' : '特写'}</strong>
            </div>
          </>
        ) : (
          <>
            <div className="linghuiImageLibTVSliderRow">
              <span>旋转</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={multiAngleConfig.rotation}
                onChange={event => onUpdateMultiAngle({ rotation: Number(event.target.value), presetKey: 'custom' })}
              />
              <strong>{Math.round(multiAngleConfig.rotation)}°</strong>
            </div>
            <div className="linghuiImageLibTVSliderRow">
              <span>倾斜</span>
              <input
                type="range"
                min={-90}
                max={90}
                step={1}
                value={multiAngleConfig.tilt}
                onChange={event => onUpdateMultiAngle({ tilt: Number(event.target.value), presetKey: 'custom' })}
              />
              <strong>{Math.round(multiAngleConfig.tilt)}°</strong>
            </div>
            <div className="linghuiImageLibTVSliderRow">
              <span>缩放</span>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={Math.round(multiAngleConfig.scale / 10)}
                onChange={event => onUpdateMultiAngle({ scale: Number(event.target.value) * 10, presetKey: 'custom' })}
              />
              <strong>{Math.round(multiAngleConfig.scale / 10)}</strong>
            </div>
            <div className="linghuiImageLibTVSwitchRow">
              <span>广角镜头</span>
              <button
                type="button"
                className={multiAngleConfig.isWideAngle ? 'isOn' : ''}
                aria-label="广角镜头"
                onClick={() => onUpdateMultiAngle({ isWideAngle: !multiAngleConfig.isWideAngle, presetKey: 'custom' })}
              />
            </div>
          </>
        )}
        <div className="linghuiImageLibTVSwitchRow">
          <span>提示词</span>
          <button
            type="button"
            className={multiAngleConfig.promptEnabled ? 'isOn' : ''}
            aria-label="提示词开关"
            onClick={() => onUpdateMultiAngle({ promptEnabled: !multiAngleConfig.promptEnabled })}
          />
        </div>
        {multiAngleConfig.promptEnabled && (
          <textarea
            className="linghuiImageLibTVPromptBox"
            value={multiAngleConfig.prompt}
            placeholder="输入提示词..."
            onChange={event => onUpdateMultiAngle({ prompt: event.target.value, presetKey: multiAngleConfig.prompt ? multiAngleConfig.presetKey : 'custom' })}
          />
        )}
      </div>
    </div>
    <ImageNodeEditorLibTVToolFooter onGenerate={onGenerate} onClose={onClose} />
  </ImageNodeEditorLibTVToolShell>
);

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
}) => (
  <ImageNodeEditorLibTVToolShell title="打光效果" className="isRelight" onClose={onClose}>
    <div className="linghuiImageLibTVPanelBody isRelightGrid">
      <div className="linghuiImageLibTVPreviewStage isLightingSphere linghuiImageLibTVLightingStage">
        <LinghuiLightingSpherePreview
          imageUrl={currentImagePreview}
          direction={relightValues.direction}
          brightness={relightValues.brightness}
          lightColor={relightValues.lightColor}
          rimLight={relightValues.rimLight}
          onDirectionChange={(direction) => {
            onSetRelightSceneActive(true);
            onUpdateRelightValues({
              direction,
              rimLight: backDirections.has(direction) ? false : relightValues.rimLight,
            });
          }}
        />
      </div>
      <div className="linghuiImageLibTVControlStack">
        <div className="linghuiImageLibTVSmartHeader">
          <span>全局</span>
          <span className={`linghuiImageLibTVActiveMark ${relightSceneActive ? 'isActive' : ''}`}>
            {relightSceneActive ? '已启用' : '默认'}
          </span>
        </div>
        <div className="linghuiImageLibTVSliderRow">
          <span>亮度</span>
          <input
            type="range"
            min={0}
            max={brightnessSteps.length - 1}
            step={1}
            value={Math.max(0, brightnessSteps.indexOf(relightValues.brightness))}
            onMouseDown={() => onSetRelightBrightnessActive(true)}
            onChange={event => {
              onSetRelightBrightnessActive(true);
              onUpdateRelightValues({ brightness: brightnessSteps[Number(event.target.value)] ?? 50 });
            }}
          />
          <strong>{relightValues.brightness} %</strong>
        </div>
        <div className="linghuiImageLibTVColorRow">
          <span>颜色</span>
          <input
            type="color"
            aria-label="颜色"
            value={relightValues.lightColor}
            onChange={event => {
              onSetRelightColorActive(true);
              onUpdateRelightValues({ lightColor: event.target.value });
            }}
          />
        </div>
        <div className="linghuiImageLibTVButtonGrid">
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
                });
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="linghuiImageLibTVSwitchRow">
          <span>轮廓光</span>
          <button
            type="button"
            className={relightValues.rimLight ? 'isOn' : ''}
            aria-label="轮廓光"
            disabled={backDirections.has(relightValues.direction)}
            onClick={() => onUpdateRelightValues({ rimLight: !relightValues.rimLight })}
          />
        </div>
      </div>
      <div className="linghuiImageLibTVPresetColumn">
        <div className="linghuiImageLibTVSmartHeader">
          <span>智能模式</span>
          <button
            type="button"
            className={relightValues.smartMode ? 'isOn' : ''}
            aria-label="智能模式"
            onClick={() => onUpdateRelightValues({ smartMode: !relightValues.smartMode })}
          />
        </div>
        {relightValues.smartMode && (
          <>
            <textarea
              className="linghuiImageLibTVPromptBox"
              placeholder="简单描述你想实现的打光效果，或者情绪风格"
              value={relightPrompt}
              onChange={event => onSetRelightPrompt(event.target.value)}
            />
            {relightReferenceImage ? (
              <div className="linghuiImageLibTVReferencePreview">
                <img src={getPreviewSource(relightReferenceImage)} alt="打光参考图" />
                <button type="button" onClick={() => onSetRelightReferenceImage(null)} aria-label="移除参考图">
                  移除
                </button>
              </div>
            ) : (
              <button type="button" className="linghuiImageLibTVReferenceButton" onClick={() => onPickRelightReferenceImage()}>
                打光参考图
              </button>
            )}
          </>
        )}
        <div className="linghuiImageLibTVSectionTitle">预设</div>
        <div className="linghuiImageLibTVPresetGrid">
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
    <ImageNodeEditorLibTVToolFooter onGenerate={onGenerate} onClose={onClose} />
  </ImageNodeEditorLibTVToolShell>
);
