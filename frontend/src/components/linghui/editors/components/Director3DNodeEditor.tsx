/**
 * Director3D 节点编辑器：三层布局参考用户提供的截图。
 *
 *   ┌─────────┬───────────────────────────────┬───────────┐
 *   │ 资产库   │  3D 视口（中心）                │ 属性面板    │
 *   │ 道具/人物│  + 镜头条 + 渲染模式切换         │ 选中物体    │
 *   │ 视角/模板 │                               │            │
 *   └─────────┴───────────────────────────────┴───────────┘
 *
 *  - 左：可点击的资产 = 添加道具 / 添加假人 / 视角预设 / 场景模板
 *  - 中：Director3DViewport + 镜头条（FOV / 比例）
 *  - 右：选中假人 → 编辑位置/朝向/姿态/颜色；未选中假人 → 编辑当前取景视角参数
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { App, Button, InputNumber, Slider } from 'antd';
import { Camera, Plus, Trash2, Users, Wand2 } from 'lucide-react';
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DActorPose,
  LinghuiDirector3DBackgroundMode,
  LinghuiDirector3DNodeProperties,
  LinghuiDirector3DRenderMode,
  LinghuiDirector3DScene,
  LinghuiNodeData,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import {
  DIRECTOR3D_POSE_OPTIONS,
  compileDirector3DPromptFragment,
  createDefaultDirector3DScene,
  createDirector3DActor,
} from '../../director3d/director3dScene';
import { toDirector3DColorInputValue } from '../../director3d/director3dColors';
import { Director3DViewport, type Director3DViewportHandle } from '../../director3d/Director3DViewport';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';

interface Director3DNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  onRun?: () => void;
}

type SelectionKind = 'actor' | null;
interface Selection {
  kind: SelectionKind;
  actorId?: string;
}

const ASSET_PROPS: Array<{ id: string; label: string }> = [
  { id: 'mannequin', label: '假人' },
];

const VIEW_PRESETS: Array<{ id: string; label: string; position: [number, number, number]; target: [number, number, number]; fov: number }> = [
  { id: 'preset-eye', label: '平视', position: [0, 1.55, 4.5], target: [0, 1.6, 0], fov: 35 },
  { id: 'preset-low', label: '低角度仰拍', position: [0, 0.5, 3], target: [0, 1.6, 0], fov: 50 },
  { id: 'preset-high', label: '高角度俯拍', position: [0, 3.4, 3.4], target: [0, 1, 0], fov: 38 },
  { id: 'preset-side', label: '侧面 OTS', position: [3.4, 1.6, 1.5], target: [0, 1.55, 0], fov: 32 },
  { id: 'preset-wide', label: '全景广角', position: [0, 1.5, 6.5], target: [0, 1.5, 0], fov: 60 },
];

const ASPECT_RATIOS = ['16:9', '21:9', '4:3', '1:1', '9:16'];

const RENDER_MODE_LABELS: Record<LinghuiDirector3DRenderMode, string> = {
  lineart: '线稿',
  silhouette: '剪影',
  depth: '深度',
  composition: '构图',
};

function getScene(properties: Record<string, unknown> | undefined): LinghuiDirector3DScene {
  const raw = (properties as Partial<LinghuiDirector3DNodeProperties> | undefined)?.scene;
  if (raw && typeof raw === 'object') return raw as LinghuiDirector3DScene;
  return createDefaultDirector3DScene();
}

export const Director3DNodeEditor: React.FC<Director3DNodeEditorProps> = ({ nodeId, nodeData }) => {
  const { message } = App.useApp();
  const { updateNodeData } = useLinghuiNodeMutation();
  const scene = useMemo(() => getScene(nodeData.properties), [nodeData.properties]);
  const [selection, setSelection] = useState<Selection>({ kind: null });
  const [activeAssetTab, setActiveAssetTab] = useState<'props' | 'characters' | 'cameras' | 'templates'>('characters');
  const [renderModeForExport, setRenderModeForExport] = useState<LinghuiDirector3DRenderMode>('lineart');
  const [previewMode, setPreviewMode] = useState<'preview' | 'lineart' | 'silhouette'>('preview');
  const viewportRef = useRef<Director3DViewportHandle | null>(null);

  const updateScene = useCallback((updater: (prev: LinghuiDirector3DScene) => LinghuiDirector3DScene) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, scene: updater(getScene(prev.properties)) },
    }));
  }, [nodeId, updateNodeData]);

  const selectedActor = useMemo(() => {
    if (selection.kind !== 'actor') return null;
    return scene.actors.find(a => a.id === selection.actorId) ?? null;
  }, [scene.actors, selection]);

  const handleAddActor = useCallback(() => {
    updateScene(prev => {
      const id = `actor_${Date.now().toString(36)}`;
      const actor = createDirector3DActor({
        id,
        label: `角色${prev.actors.length + 1}`,
        position: [
          (prev.actors.length % 2 === 0 ? 1 : -1) * 0.6 * (Math.floor(prev.actors.length / 2) + 1),
          0,
          0,
        ],
      });
      return { ...prev, actors: [...prev.actors, actor] };
    });
  }, [updateScene]);

  const handleApplyCameraPreset = useCallback((preset: typeof VIEW_PRESETS[number]) => {
    updateScene(prev => ({
      ...prev,
      camera: {
        ...prev.camera,
        position: preset.position,
        target: preset.target,
        fov: preset.fov,
      },
    }));
    setSelection({ kind: null });
  }, [updateScene]);

  const handleActorChange = useCallback((actorId: string, patch: Partial<LinghuiDirector3DActor>) => {
    updateScene(prev => ({
      ...prev,
      actors: prev.actors.map(a => (a.id === actorId ? { ...a, ...patch } : a)),
    }));
  }, [updateScene]);

  const handleActorMove = useCallback((actorId: string, position: [number, number, number]) => {
    handleActorChange(actorId, { position });
  }, [handleActorChange]);

  const handleDeleteActor = useCallback((actorId: string) => {
    updateScene(prev => ({ ...prev, actors: prev.actors.filter(a => a.id !== actorId) }));
    setSelection({ kind: null });
  }, [updateScene]);

  const handleCameraField = useCallback(<K extends keyof LinghuiDirector3DScene['camera']>(
    field: K,
    value: LinghuiDirector3DScene['camera'][K],
  ) => {
    updateScene(prev => ({ ...prev, camera: { ...prev.camera, [field]: value } }));
  }, [updateScene]);

  const handleCameraChange = useCallback((camera: LinghuiDirector3DScene['camera']) => {
    updateScene(prev => ({ ...prev, camera }));
  }, [updateScene]);

  const handleBackgroundModeChange = useCallback((mode: LinghuiDirector3DBackgroundMode) => {
    updateScene(prev => ({ ...prev, background: { ...prev.background, mode } }));
  }, [updateScene]);

  const handleExportLineart = useCallback(async () => {
    const currentCamera = viewportRef.current?.getCurrentCamera();
    const dataUrl = await viewportRef.current?.captureCurrentView({ width: 1280 });
    if (!dataUrl) {
      message.warning('线稿导出失败，请重试');
      return;
    }
    // 把 dataUrl 写到节点 properties，方便下游图片节点直接拿来当参考
    updateNodeData(nodeId, prev => {
      const props = prev.properties as Partial<LinghuiDirector3DNodeProperties>;
      const nextScene = {
        ...getScene(prev.properties),
        camera: currentCamera ?? getScene(prev.properties).camera,
      };
      const fragment = compileDirector3DPromptFragment(nextScene);
      return {
        ...prev,
        properties: {
          ...prev.properties,
          scene: nextScene,
          prompt: props.prompt ?? '',
          lineartDataUrl: dataUrl,
          directorPromptFragment: fragment,
        },
      };
    });
    message.success('线稿已生成，可在下游图片节点引用');
  }, [message, nodeId, updateNodeData]);

  const lineartPreview = (nodeData.properties as { lineartDataUrl?: string } | undefined)?.lineartDataUrl;

  return (
    <div className="linghuiEditorPanel linghuiDirector3DEditorPanel" onMouseDown={event => event.stopPropagation()}>
      <div className="linghuiDirector3DLayout">
        {/* 左侧：资产库 */}
        <aside className="linghuiDirector3DAssets">
          <div className="linghuiDirector3DTabs">
            <button type="button" className={`linghuiDirector3DTab ${activeAssetTab === 'props' ? 'isActive' : ''}`} onClick={() => setActiveAssetTab('props')}>道具</button>
            <button type="button" className={`linghuiDirector3DTab ${activeAssetTab === 'characters' ? 'isActive' : ''}`} onClick={() => setActiveAssetTab('characters')}>人物</button>
            <button type="button" className={`linghuiDirector3DTab ${activeAssetTab === 'cameras' ? 'isActive' : ''}`} onClick={() => setActiveAssetTab('cameras')}>视角</button>
            <button type="button" className={`linghuiDirector3DTab ${activeAssetTab === 'templates' ? 'isActive' : ''}`} onClick={() => setActiveAssetTab('templates')}>模板</button>
          </div>

          <div className="linghuiDirector3DAssetGrid">
            {activeAssetTab === 'characters' && ASSET_PROPS.map(asset => (
              <button key={asset.id} type="button" className="linghuiDirector3DAssetTile" onClick={handleAddActor}>
                <Users size={20} />
                <span>{asset.label}</span>
              </button>
            ))}
            {activeAssetTab === 'cameras' && VIEW_PRESETS.map(preset => (
              <button key={preset.id} type="button" className="linghuiDirector3DAssetTile" onClick={() => handleApplyCameraPreset(preset)}>
                <Camera size={20} />
                <span>{preset.label}</span>
              </button>
            ))}
            {activeAssetTab === 'props' && (
              <div className="linghuiDirector3DAssetEmpty">道具暂未实装</div>
            )}
            {activeAssetTab === 'templates' && (
              <div className="linghuiDirector3DAssetEmpty">分镜模板暂未实装</div>
            )}
          </div>
        </aside>

        {/* 中央：3D 视口 + 镜头条 */}
        <main className="linghuiDirector3DStage">
          <div className="linghuiDirector3DStageSurface">
            <Director3DViewport
              ref={viewportRef}
              scene={scene}
              selectedActorId={selection.kind === 'actor' ? selection.actorId : null}
              onActorClick={(id) => setSelection({ kind: 'actor', actorId: id })}
              onActorMove={handleActorMove}
              onCanvasClick={() => setSelection({ kind: null })}
              onCameraChange={handleCameraChange}
              renderMode={previewMode}
            />
          </div>

          <div className="linghuiDirector3DCameraBar">
            <div className="linghuiDirector3DCameraChip">
              <Camera size={14} />
              <span>{Math.round(scene.camera.fov)}° FOV · {scene.camera.aspectRatio}</span>
            </div>
            <div className="linghuiDirector3DRenderModes">
              {(Object.keys(RENDER_MODE_LABELS) as LinghuiDirector3DRenderMode[]).slice(0, 2).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={`linghuiDirector3DRenderMode ${renderModeForExport === mode ? 'isActive' : ''}`}
                  onClick={() => {
                    setRenderModeForExport(mode);
                    setPreviewMode(mode === 'silhouette' ? 'silhouette' : 'preview');
                  }}
                >
                  {RENDER_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
            <Button type="primary" size="small" icon={<Wand2 size={14} />} onClick={handleExportLineart}>
              导出线稿参考
            </Button>
          </div>

          {lineartPreview ? (
            <div className="linghuiDirector3DLineartPreview">
              <span className="linghuiDirector3DLineartLabel">最近导出</span>
              <img src={lineartPreview} alt="lineart preview" />
            </div>
          ) : null}
        </main>

        {/* 右侧：属性面板 */}
        <aside className="linghuiDirector3DInspector">
          <div className="linghuiDirector3DInspectorHeader">属性</div>

          {selection.kind === 'actor' && selectedActor ? (
            <div className="linghuiDirector3DInspectorBody">
              <Field label="名称">
                <input
                  className="linghuiDirector3DInspectorInput"
                  value={selectedActor.label}
                  onChange={(e) => handleActorChange(selectedActor.id, { label: e.target.value })}
                />
              </Field>
              <Field label="位置 (m)">
                <Vec3Input
                  value={selectedActor.position}
                  onChange={(value) => handleActorChange(selectedActor.id, { position: value })}
                />
              </Field>
              <Field label="朝向 (°)">
                <Slider
                  min={-180}
                  max={180}
                  value={Math.round((selectedActor.rotationY * 180) / Math.PI)}
                  onChange={(deg) => handleActorChange(selectedActor.id, { rotationY: ((deg as number) * Math.PI) / 180 })}
                />
              </Field>
              <Field label="姿势">
                <div className="linghuiDirector3DPoseGrid">
                  {DIRECTOR3D_POSE_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      className={`linghuiDirector3DPoseTile ${selectedActor.posePreset === option.value ? 'isActive' : ''}`}
                      onClick={() => handleActorChange(selectedActor.id, { posePreset: option.value as LinghuiDirector3DActorPose })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="缩放">
                <Slider
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  value={selectedActor.scale}
                  onChange={(scale) => handleActorChange(selectedActor.id, { scale: scale as number })}
                />
              </Field>
              <Field label="颜色">
                <input
                  type="color"
                  className="linghuiDirector3DColorInput"
                  value={toDirector3DColorInputValue(selectedActor.color)}
                  onChange={(e) => handleActorChange(selectedActor.id, { color: e.target.value })}
                />
              </Field>
              <Button danger size="small" icon={<Trash2 size={14} />} onClick={() => handleDeleteActor(selectedActor.id)}>
                删除
              </Button>
            </div>
          ) : (
            <div className="linghuiDirector3DInspectorBody">
              <Field label="FOV">
                <Slider min={18} max={90} value={scene.camera.fov} onChange={(fov) => handleCameraField('fov', fov as number)} tooltip={{ formatter: (v) => `${v}°` }} />
              </Field>
              <Field label="比例">
                <div className="linghuiDirector3DRatioGrid">
                  {ASPECT_RATIOS.map(ratio => (
                    <button
                      key={ratio}
                      type="button"
                      className={`linghuiDirector3DRatioTile ${scene.camera.aspectRatio === ratio ? 'isActive' : ''}`}
                      onClick={() => handleCameraField('aspectRatio', ratio)}
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
                      onClick={() => handleBackgroundModeChange(mode)}
                    >
                      {mode === 'none' ? '无' : mode === 'color' ? '纯色' : mode === 'image-plane' ? '图片板' : '全景'}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="linghuiDirector3DInspectorActions">
                <Button size="small" icon={<Plus size={14} />} onClick={handleAddActor}>添加假人</Button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="linghuiDirector3DField">
    <div className="linghuiDirector3DFieldLabel">{label}</div>
    <div className="linghuiDirector3DFieldBody">{children}</div>
  </div>
);

interface Vec3InputProps {
  value: [number, number, number];
  onChange: (value: [number, number, number]) => void;
}

const Vec3Input: React.FC<Vec3InputProps> = ({ value, onChange }) => {
  const handle = (idx: number, next: number | null) => {
    const updated = [...value] as [number, number, number];
    updated[idx] = typeof next === 'number' && Number.isFinite(next) ? next : 0;
    onChange(updated);
  };
  return (
    <div className="linghuiDirector3DVec3">
      {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
        <div key={axis} className="linghuiDirector3DVec3Cell">
          <span className="linghuiDirector3DVec3Axis">{axis}</span>
          <InputNumber
            size="small"
            controls={false}
            value={Number(value[idx].toFixed(2))}
            onChange={(next) => handle(idx, next as number | null)}
          />
        </div>
      ))}
    </div>
  );
};

export default Director3DNodeEditor;
