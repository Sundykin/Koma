import React from 'react';
import { Button, InputNumber, Popover, Slider } from 'antd';
import { Plus, RotateCw, Save as SaveIcon, Trash2, Upload } from 'lucide-react';
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DActorPose,
  LinghuiDirector3DBackgroundMode,
  LinghuiDirector3DCreatureAction,
  LinghuiDirector3DScene,
} from '../../../../types/linghui';
import {
  CREATURE_SPECIES_LIBRARY,
} from '../../director3d/director3dScene';
import {
  DIRECTOR3D_JOINT_META,
  DIRECTOR3D_RIG_PRESET_OPTIONS,
  patchRigJoint,
  resolveActorRig,
} from '../../director3d/director3dRig';
import { toDirector3DColorInputValue } from '../../director3d/director3dColors';
import { Field, Vec3Input } from './Director3DFormComponents';

const DIRECTOR3D_INSPECTOR_SLIDER_TOOLTIP = { open: false } as const;
const ASPECT_RATIOS = ['16:9', '21:9', '4:3', '1:1', '9:16'];

interface Director3DInspectorPanelProps {
  pendingReferenceImages: string[];
  saveAssetPopoverOpen: boolean;
  scene: LinghuiDirector3DScene;
  selectedActor: LinghuiDirector3DActor | null;
  selectionKind: 'actor' | null;
  onActorChange: (actorId: string, patch: Partial<LinghuiDirector3DActor>) => void;
  onAddActor: () => void;
  onAddRidingHorse: () => void;
  onBackgroundModeChange: (mode: LinghuiDirector3DBackgroundMode) => void;
  onCameraField: (field: 'fov' | 'aspectRatio', value: number | string) => void;
  onDeleteActor: (actorId: string) => void;
  onPickReferenceImages: () => void;
  onSaveSelectedAsGlobalAsset: () => void;
  onSetPendingReferenceImages: React.Dispatch<React.SetStateAction<string[]>>;
  onSetSaveAssetPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const Director3DInspectorPanel: React.FC<Director3DInspectorPanelProps> = ({
  pendingReferenceImages,
  saveAssetPopoverOpen,
  scene,
  selectedActor,
  selectionKind,
  onActorChange,
  onAddActor,
  onAddRidingHorse,
  onBackgroundModeChange,
  onCameraField,
  onDeleteActor,
  onPickReferenceImages,
  onSaveSelectedAsGlobalAsset,
  onSetPendingReferenceImages,
  onSetSaveAssetPopoverOpen,
}) => (
  <div className="linghuiDirector3DRailPopoverInner">
    <div className="linghuiDirector3DRailPopoverTitle">
      {selectionKind === 'actor' && selectedActor ? (selectedActor.label || '属性') : '属性'}
    </div>
    {selectionKind !== 'actor' || !selectedActor ? (
      <div className="linghuiDirector3DInspectorEmpty">点击视口里的物体查看其属性</div>
    ) : null}

    {selectionKind === 'actor' && selectedActor ? (
      <div className="linghuiDirector3DInspectorBody">
        <Field label="名称">
          <input
            className="linghuiDirector3DInspectorInput"
            value={selectedActor.label}
            onChange={(e) => onActorChange(selectedActor.id, { label: e.target.value })}
          />
        </Field>
        <Field label="位置 X / 高度Y / Z (m)">
          <Vec3Input
            value={selectedActor.position}
            onChange={(value) => onActorChange(selectedActor.id, { position: value })}
          />
        </Field>
        <Field label="高度 Y (m)">
          <div className="linghuiDirector3DRigSliderRow">
            <Slider
              min={-1}
              max={8}
              step={0.05}
              value={Number(selectedActor.position[1].toFixed(2))}
              tooltip={DIRECTOR3D_INSPECTOR_SLIDER_TOOLTIP}
              onChange={(height) => {
                const y = Number(height);
                onActorChange(selectedActor.id, {
                  position: [selectedActor.position[0], Number(y.toFixed(2)), selectedActor.position[2]],
                });
              }}
              style={{ flex: 1 }}
            />
            <span className="linghuiDirector3DRigSliderValue">{selectedActor.position[1].toFixed(2)}</span>
          </div>
        </Field>
        <Field label="朝向 (°)">
          <Slider
            min={-180}
            max={180}
            value={Math.round((selectedActor.rotationY * 180) / Math.PI)}
            tooltip={DIRECTOR3D_INSPECTOR_SLIDER_TOOLTIP}
            onChange={(deg) => onActorChange(selectedActor.id, { rotationY: ((deg as number) * Math.PI) / 180 })}
          />
        </Field>
        {selectedActor.groupId ? (
          <div className="linghuiDirector3DGroupHint">
            {selectedActor.groupLabel || '组合'} · {selectedActor.groupRole === 'rider' ? '骑手' : selectedActor.groupRole === 'mount' ? '坐骑' : '成员'}，移动 / 旋转会联动同组实体
          </div>
        ) : null}
        {selectedActor.type === 'mannequin' ? (
          <>
            <Field label="预置动作">
              <div className="linghuiDirector3DPoseGrid">
                {DIRECTOR3D_RIG_PRESET_OPTIONS.map(option => {
                  const isBuiltinMatch = Boolean(option.posePreset && selectedActor.posePreset === option.posePreset && !selectedActor.rig);
                  const isRigMatch = Boolean(selectedActor.rig && JSON.stringify(selectedActor.rig) === JSON.stringify(option.rig));
                  const active = isBuiltinMatch || isRigMatch;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={`linghuiDirector3DPoseTile ${active ? 'isActive' : ''}`}
                      onClick={() => onActorChange(selectedActor.id, {
                        ...(option.posePreset
                          ? { posePreset: option.posePreset, rig: option.rig }
                          : { posePreset: 'idle' as LinghuiDirector3DActorPose, rig: option.rig }),
                      })}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="骨骼微调">
              <div className="linghuiDirector3DRigGrid">
                {DIRECTOR3D_JOINT_META.map(joint => {
                  const currentRig = resolveActorRig(selectedActor.rig, selectedActor.posePreset);
                  return (
                    <div key={joint.key} className="linghuiDirector3DRigJoint">
                      <div className="linghuiDirector3DRigJointHeader">{joint.label}</div>
                      {joint.axes.map(({ axis, name, hint }) => {
                        const radValue = currentRig[joint.key][axis];
                        const degValue = Math.round((radValue * 180) / Math.PI);
                        return (
                          <div key={`${joint.key}-${axis}`} className="linghuiDirector3DRigSliderRow">
                            <span className="linghuiDirector3DRigSliderLabel" title={hint}>{name}</span>
                            <Slider
                              min={-180}
                              max={180}
                              step={1}
                              value={degValue}
                              tooltip={DIRECTOR3D_INSPECTOR_SLIDER_TOOLTIP}
                              onChange={(deg) => {
                                const nextRad = ((deg as number) * Math.PI) / 180;
                                const nextRig = patchRigJoint(currentRig, joint.key, axis, nextRad);
                                onActorChange(selectedActor.id, { rig: nextRig });
                              }}
                              style={{ flex: 1 }}
                            />
                            <span className="linghuiDirector3DRigSliderValue">{degValue}°</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                <Button
                  size="small"
                  block
                  onClick={() => onActorChange(selectedActor.id, { rig: undefined })}
                  disabled={!selectedActor.rig}
                >
                  重置到预置动作
                </Button>
              </div>
            </Field>
          </>
        ) : null}
        {selectedActor.type === 'creature' ? (
          <>
            <Field label="物种">
              <div className="linghuiDirector3DPoseGrid">
                {CREATURE_SPECIES_LIBRARY.map(spec => (
                  <button
                    key={spec.kind}
                    type="button"
                    className={`linghuiDirector3DPoseTile ${selectedActor.species === spec.kind ? 'isActive' : ''}`}
                    onClick={() => onActorChange(selectedActor.id, {
                      species: spec.kind,
                      color: spec.color,
                    })}
                    title={spec.promptHint}
                  >
                    {spec.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="动作">
              <div className="linghuiDirector3DPoseGrid">
                {(['idle', 'walk', 'run', 'pounce', 'fly', 'roar'] as LinghuiDirector3DCreatureAction[]).map(action => {
                  const labels: Record<LinghuiDirector3DCreatureAction, string> = {
                    idle: '站立', walk: '行走', run: '奔跑', pounce: '扑击', fly: '飞行', roar: '咆哮',
                  };
                  const active = (selectedActor.creatureAction ?? 'idle') === action;
                  return (
                    <button
                      key={action}
                      type="button"
                      className={`linghuiDirector3DPoseTile ${active ? 'isActive' : ''}`}
                      onClick={() => onActorChange(selectedActor.id, {
                        creatureAction: action,
                        creatureRig: undefined,
                      })}
                    >
                      {labels[action]}
                    </button>
                  );
                })}
              </div>
            </Field>
          </>
        ) : null}
        {selectedActor.type === 'formation' && selectedActor.formation ? (
          <>
            <Field label="行 × 列">
              <div className="linghuiDirector3DVec3">
                <div className="linghuiDirector3DVec3Cell">
                  <span className="linghuiDirector3DVec3Axis">R</span>
                  <InputNumber
                    size="small"
                    controls={false}
                    min={1}
                    max={12}
                    value={selectedActor.formation.rows}
                    onChange={value => onActorChange(selectedActor.id, {
                      formation: {
                        ...selectedActor.formation!,
                        rows: Math.max(1, Math.min(12, Math.round(Number(value) || 1))),
                      },
                    })}
                  />
                </div>
                <div className="linghuiDirector3DVec3Cell">
                  <span className="linghuiDirector3DVec3Axis">C</span>
                  <InputNumber
                    size="small"
                    controls={false}
                    min={1}
                    max={12}
                    value={selectedActor.formation.cols}
                    onChange={value => onActorChange(selectedActor.id, {
                      formation: {
                        ...selectedActor.formation!,
                        cols: Math.max(1, Math.min(12, Math.round(Number(value) || 1))),
                      },
                    })}
                  />
                </div>
                <div className="linghuiDirector3DVec3Cell">
                  <span className="linghuiDirector3DVec3Axis">S</span>
                  <InputNumber
                    size="small"
                    controls={false}
                    min={0.3}
                    max={3}
                    step={0.1}
                    value={selectedActor.formation.spacing}
                    onChange={value => onActorChange(selectedActor.id, {
                      formation: {
                        ...selectedActor.formation!,
                        spacing: Math.max(0.3, Math.min(3, Number(value) || 1)),
                      },
                    })}
                  />
                </div>
              </div>
            </Field>
            <Field label="成员朝向">
              <div className="linghuiDirector3DPoseGrid">
                {([
                  { value: 'forward' as const, label: '正向' },
                  { value: 'away' as const, label: '背向' },
                  { value: 'inward' as const, label: '向心' },
                  { value: 'outward' as const, label: '向外' },
                ]).map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={`linghuiDirector3DPoseTile ${selectedActor.formation?.memberFacing === option.value ? 'isActive' : ''}`}
                    onClick={() => onActorChange(selectedActor.id, {
                      formation: { ...selectedActor.formation!, memberFacing: option.value },
                    })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>
          </>
        ) : null}
        <Field label="缩放">
          <Slider
            min={0.3}
            max={selectedActor.type === 'mannequin' ? 1.5 : 3}
            step={0.05}
            value={selectedActor.scale}
            tooltip={DIRECTOR3D_INSPECTOR_SLIDER_TOOLTIP}
            onChange={(scale) => onActorChange(selectedActor.id, { scale: scale as number })}
          />
        </Field>
        <Field label="颜色">
          <input
            type="color"
            className="linghuiDirector3DColorInput"
            value={toDirector3DColorInputValue(selectedActor.color)}
            onChange={(e) => onActorChange(selectedActor.id, { color: e.target.value })}
          />
        </Field>
        <div className="linghuiDirector3DInspectorActions">
          {selectedActor.type !== 'formation' && selectedActor.type !== 'mannequin-lite' ? (
            <Popover
              open={saveAssetPopoverOpen}
              onOpenChange={(next) => {
                onSetSaveAssetPopoverOpen(next);
                if (!next) onSetPendingReferenceImages([]);
              }}
              trigger="click"
              placement="leftTop"
              overlayClassName="linghuiDirector3DBattalionPopover"
              getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
              content={(
                <div className="linghuiDirector3DBattalionPanel">
                  <div className="linghuiDirector3DBattalionTitle">保存到全局库</div>
                  <div className="linghuiDirector3DBattalionHint">
                    可选附带 1-3 张参考图，下游图片节点会拿到当作真实视觉指引。
                  </div>
                  {(selectedActor.referenceImages?.length || pendingReferenceImages.length) > 0 ? (
                    <div className="linghuiDirector3DAngleStrip" style={{ marginTop: 4 }}>
                      {selectedActor.referenceImages?.map((url) => (
                        <img key={`existing-${url}`} src={url} alt="已绑定" title="已在 actor 上的参考图" />
                      ))}
                      {pendingReferenceImages.map((url) => (
                        <img key={`pending-${url}`} src={url} alt="待入库" title="本次上传，待保存入库" />
                      ))}
                    </div>
                  ) : null}
                  <div className="linghuiDirector3DBattalionActions">
                    <Button
                      size="small"
                      icon={<Upload size={14} />}
                      onClick={onPickReferenceImages}
                      disabled={pendingReferenceImages.length + (selectedActor.referenceImages?.length ?? 0) >= 3}
                    >
                      添加参考图
                    </Button>
                    <Button size="small" type="primary" icon={<SaveIcon size={14} />} onClick={onSaveSelectedAsGlobalAsset}>
                      保存
                    </Button>
                  </div>
                </div>
              )}
            >
              <Button size="small" icon={<SaveIcon size={14} />}>
                存到全局库
              </Button>
            </Popover>
          ) : null}
          <Button danger size="small" icon={<Trash2 size={14} />} onClick={() => onDeleteActor(selectedActor.id)}>
            {selectedActor.groupId ? '删除组合' : '删除'}
          </Button>
        </div>
      </div>
    ) : (
      <div className="linghuiDirector3DInspectorBody">
        <Field label="FOV">
          <div className="linghuiDirector3DRigSliderRow">
            <Slider
              min={18}
              max={90}
              value={scene.camera.fov}
              tooltip={DIRECTOR3D_INSPECTOR_SLIDER_TOOLTIP}
              onChange={(fov) => onCameraField('fov', fov as number)}
              style={{ flex: 1 }}
            />
            <span className="linghuiDirector3DRigSliderValue">{Math.round(scene.camera.fov)}°</span>
          </div>
        </Field>
        <Field label="比例">
          <div className="linghuiDirector3DRatioGrid">
            {ASPECT_RATIOS.map(ratio => (
              <button
                key={ratio}
                type="button"
                className={`linghuiDirector3DRatioTile ${scene.camera.aspectRatio === ratio ? 'isActive' : ''}`}
                onClick={() => onCameraField('aspectRatio', ratio)}
              >
                {ratio}
              </button>
            ))}
          </div>
        </Field>
        <Field label="背景">
          <div className="linghuiDirector3DBackgroundModes">
            {(['none', 'color', 'image-plane', 'panorama'] as LinghuiDirector3DBackgroundMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                className={`linghuiDirector3DBgMode ${scene.background.mode === mode ? 'isActive' : ''}`}
                onClick={() => onBackgroundModeChange(mode)}
              >
                {mode === 'none' ? '无' : mode === 'color' ? '纯色' : mode === 'image-plane' ? '图片板' : '全景'}
              </button>
            ))}
          </div>
        </Field>
        <div className="linghuiDirector3DInspectorActions">
          <Button size="small" icon={<Plus size={14} />} onClick={onAddActor}>添加假人</Button>
          <Button size="small" icon={<RotateCw size={14} />} onClick={onAddRidingHorse}>人骑马</Button>
        </div>
      </div>
    )}
  </div>
);
