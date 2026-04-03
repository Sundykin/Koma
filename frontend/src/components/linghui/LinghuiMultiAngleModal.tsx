import React, { useMemo } from 'react';
import { Button, Modal, Select } from 'antd';
import type {
  LinghuiMultiAngleConfig,
} from '../../types/linghui';
import {
  LINGHUI_MULTI_ANGLE_AZIMUTHS,
  LINGHUI_MULTI_ANGLE_DISTANCES,
  LINGHUI_MULTI_ANGLE_ELEVATIONS,
} from '../../types/linghui';
import { LinghuiMultiAngle3DViewport } from './LinghuiMultiAngle3DViewport';

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
  const azimuthMeta = useMemo(() => (
    LINGHUI_MULTI_ANGLE_AZIMUTHS.find(item => item.value === config.azimuth) ?? LINGHUI_MULTI_ANGLE_AZIMUTHS[0]
  ), [config.azimuth]);
  const elevationMeta = useMemo(() => (
    LINGHUI_MULTI_ANGLE_ELEVATIONS.find(item => item.value === config.elevation) ?? LINGHUI_MULTI_ANGLE_ELEVATIONS[1]
  ), [config.elevation]);
  const distanceMeta = useMemo(() => (
    LINGHUI_MULTI_ANGLE_DISTANCES.find(item => item.value === config.distance) ?? LINGHUI_MULTI_ANGLE_DISTANCES[1]
  ), [config.distance]);

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
            azimuth={config.azimuth}
            elevation={config.elevation}
            distance={config.distance}
            onAngleChange={(azimuth, elevation) => onChangeConfig({ azimuth, elevation })}
            onDistanceChange={(distance) => onChangeConfig({ distance })}
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
                  onClick={() => onChangeConfig({ elevation: item.value })}
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
                  onClick={() => onChangeConfig({ distance: item.value })}
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
            <Button type="primary" onClick={onConfirm}>创建并生图</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
