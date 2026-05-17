import React, { useMemo } from 'react';
import { Slider } from 'antd';
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from '../../../../types/linghui';
import { clampDurationToSpec, type VideoDurationSpec } from '../../../../providers/itv/durationSpec';
import { specToInputBounds } from '../../../../providers/itv/durationSpec';

interface VideoParameterPanelProps {
  aspectRatio: string;
  resolution: string;
  duration: number;
  durationSpec: VideoDurationSpec;
  onUpdateAspectRatio: (value: string) => void;
  onUpdateResolution: (value: string) => void;
  onUpdateDuration: (value: number) => void;
  onClose?: () => void;
}

export function VideoParameterPanel({
  aspectRatio, resolution, duration, durationSpec,
  onUpdateAspectRatio, onUpdateResolution, onUpdateDuration, onClose,
}: VideoParameterPanelProps) {
  const durationBounds = specToInputBounds(durationSpec);
  const durationMarks = useMemo(() => {
    if (durationSpec.kind === 'enum') {
      return durationSpec.values.reduce<Record<number, string>>((marks, value) => { marks[value] = `${value}s`; return marks; }, {});
    }
    return { [durationSpec.min]: `${durationSpec.min}s`, [durationSpec.default]: `${durationSpec.default}s`, [durationSpec.max]: `${durationSpec.max}s` };
  }, [durationSpec]);
  const durationHint = durationSpec.kind === 'enum'
    ? `当前模型仅支持 ${durationSpec.values.map(v => `${v}s`).join(' / ')}`
    : `当前模型支持 ${durationSpec.min}-${durationSpec.max}s`;

  return (
    <div className="linghuiVideoEditorParamsPopover" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <div className="linghuiVideoEditorParamGroup">
        <div className="linghuiVideoEditorParamLabel">比例</div>
        <div className="linghuiVideoEditorOptionGrid">
          {VIDEO_ASPECT_RATIOS.map(option => (
            <button key={option.value} type="button" className={`linghuiVideoEditorOptionTile ${aspectRatio === option.value ? 'isActive' : ''}`} onClick={() => { onClose?.(); onUpdateAspectRatio(option.value); }}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="linghuiVideoEditorParamGroup">
        <div className="linghuiVideoEditorParamLabel">分辨率</div>
        <div className="linghuiVideoEditorOptionGrid isCompact">
          {VIDEO_RESOLUTIONS.map(option => (
            <button key={option.value} type="button" className={`linghuiVideoEditorOptionTile ${resolution === option.value ? 'isActive' : ''}`} onClick={() => { onClose?.(); onUpdateResolution(option.value); }}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="linghuiVideoEditorParamGroup">
        <div className="linghuiVideoEditorDurationHeader">
          <span className="linghuiVideoEditorParamLabel">视频时长</span>
          <span className="linghuiVideoEditorDurationValue">{duration}s</span>
        </div>
        {durationSpec.kind === 'enum' ? (
          <div className="linghuiVideoEditorDurationChoices">
            {durationSpec.values.map(value => (
              <button key={value} type="button" className={`linghuiVideoEditorOptionTile ${duration === value ? 'isActive' : ''}`} onClick={() => { onClose?.(); onUpdateDuration(value); }}>
                {value}s
              </button>
            ))}
          </div>
        ) : (
          <Slider className="linghuiVideoEditorDurationSlider" min={durationBounds.min} max={durationBounds.max} step={durationBounds.step} marks={durationMarks} value={clampDurationToSpec(duration, durationSpec)} onChange={v => onUpdateDuration(Number(v))} onChangeComplete={() => onClose?.()} />
        )}
        <div className="linghuiVideoEditorDurationHint">{durationHint}</div>
      </div>
    </div>
  );
}
