import React, { useMemo } from 'react';
import { Button, Modal, Select } from 'antd';
import type {
  LinghuiMultiAngleConfig,
} from '../../../../types/linghui';
import {
  LINGHUI_MULTI_ANGLE_AZIMUTHS,
  LINGHUI_MULTI_ANGLE_DISTANCES,
  LINGHUI_MULTI_ANGLE_ELEVATIONS,
} from '../../../../types/linghui';
import { LinghuiMultiAngle3DViewport } from './LinghuiMultiAngle3DViewport';
import { useLinghuiActionLock } from '../hooks/useLinghuiActionLock';

interface ProviderOption {
  value: string;
  label: string;
}

interface LinghuiMultiAngleModalProps {
  open: boolean;
  sourceImage?: string;
  sourceLabel?: string;
  config: LinghuiMultiAngleConfig;
  providerOptions: ProviderOption[];
  ttiSelection: string;
  onChangeConfig: (patch: Partial<LinghuiMultiAngleConfig>) => void;
  onChangeTTISelection: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function rotationToAzimuth(rotation: number): LinghuiMultiAngleConfig['azimuth'] {
  const normalized = ((Math.round(rotation / 45) * 45) % 360 + 360) % 360;
  return LINGHUI_MULTI_ANGLE_AZIMUTHS.find(item => item.value === normalized)?.value ?? 0;
}

function tiltToElevation(tilt: number): LinghuiMultiAngleConfig['elevation'] {
  const snapped = Math.max(-30, Math.min(60, Math.round(tilt / 30) * 30));
  return LINGHUI_MULTI_ANGLE_ELEVATIONS.find(item => item.value === snapped)?.value ?? 0;
}

function scaleToDistance(scale: number): LinghuiMultiAngleConfig['distance'] {
  if (scale <= 25) return 1.8;
  if (scale >= 75) return 0.6;
  return 1;
}

function distanceToScale(distance: LinghuiMultiAngleConfig['distance']): number {
  if (distance === 0.6) return 100;
  if (distance === 1.8) return 0;
  return 50;
}

export const LinghuiMultiAngleModal: React.FC<LinghuiMultiAngleModalProps> = ({
  open,
  sourceImage,
  sourceLabel,
  config,
  providerOptions,
  ttiSelection,
  onChangeConfig,
  onChangeTTISelection,
  onCancel,
  onConfirm,
}) => {
  const { locked: isConfirmLocked, runWithActionLock } = useLinghuiActionLock(!open);
  const azimuthMeta = useMemo(() => (
    LINGHUI_MULTI_ANGLE_AZIMUTHS.find(item => item.value === config.azimuth) ?? LINGHUI_MULTI_ANGLE_AZIMUTHS[0]
  ), [config.azimuth]);
  const elevationMeta = useMemo(() => (
    LINGHUI_MULTI_ANGLE_ELEVATIONS.find(item => item.value === config.elevation) ?? LINGHUI_MULTI_ANGLE_ELEVATIONS[1]
  ), [config.elevation]);
  const distanceMeta = useMemo(() => (
    LINGHUI_MULTI_ANGLE_DISTANCES.find(item => item.value === config.distance) ?? LINGHUI_MULTI_ANGLE_DISTANCES[1]
  ), [config.distance]);
  const handleConfirm = () => {
    runWithActionLock(onConfirm);
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title="多角度相机"
      width={980}
      footer={null}
      destroyOnHidden={false}
      className="linghuiMultiAngleModal"
    >
      <div className="linghuiMultiAngleModalBody">
        <div className="linghuiMultiAngleStage">
          <div className="linghuiMultiAngleStageHint">拖动画布切换相机机位，滚轮切换景别</div>
          <LinghuiMultiAngle3DViewport
            imageUrl={sourceImage}
            mode={config.mode}
            rotation={config.rotation}
            tilt={config.tilt}
            scale={config.scale}
            isWideAngle={config.isWideAngle}
            onRotationTiltChange={(rotation, tilt) => onChangeConfig({
              rotation,
              tilt,
              azimuth: rotationToAzimuth(rotation),
              elevation: tiltToElevation(tilt),
            })}
            onScaleChange={(scale) => onChangeConfig({
              scale,
              distance: scaleToDistance(scale),
            })}
          />
        </div>

        <div className="linghuiMultiAngleSidebar">
          <div className="linghuiMultiAngleInfoCard">
            <div className="linghuiMultiAngleInfoTitle">当前视角</div>
            <div className="linghuiMultiAngleInfoValue">{azimuthMeta.label}</div>
            <div className="linghuiMultiAngleInfoMeta">仰角：{elevationMeta.label}</div>
            <div className="linghuiMultiAngleInfoMeta">景别：{distanceMeta.label}</div>
          </div>

          <div className="linghuiEditorSelectField">
            <div className="linghuiEditorFieldLabel">生图渠道</div>
            <Select
              size="small"
              value={ttiSelection || undefined}
              placeholder="选择多角度生图渠道"
              onChange={onChangeTTISelection}
              options={providerOptions}
              popupMatchSelectWidth={false}
            />
          </div>

          <div className="linghuiMultiAngleControlBlock">
            <div className="linghuiEditorFieldLabel">仰角</div>
            <div className="linghuiMultiAngleChipRow">
              {LINGHUI_MULTI_ANGLE_ELEVATIONS.map(item => (
                <button
                  key={item.value}
                  type="button"
                  className={`linghuiMultiAngleChip ${item.value === config.elevation ? 'isActive' : ''}`}
                  onClick={() => onChangeConfig({ elevation: item.value, tilt: item.value })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="linghuiMultiAngleControlBlock">
            <div className="linghuiEditorFieldLabel">景别</div>
            <div className="linghuiMultiAngleChipRow">
              {LINGHUI_MULTI_ANGLE_DISTANCES.map(item => (
                <button
                  key={item.value}
                  type="button"
                  className={`linghuiMultiAngleChip ${item.value === config.distance ? 'isActive' : ''}`}
                  onClick={() => onChangeConfig({ distance: item.value, scale: distanceToScale(item.value) })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="linghuiMultiAngleSidebarHint">
            系统会直接使用"当前图片 + 当前相机角度"调用多角度生图接口，不再拼接原提示词。
          </div>

          <div className="linghuiMultiAngleFooter">
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" disabled={isConfirmLocked} onClick={handleConfirm}>创建并生图</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
