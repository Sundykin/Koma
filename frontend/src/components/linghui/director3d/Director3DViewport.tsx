/**
 * Director3D 主视口。
 *
 * 包含：
 *  - 单一工作台相机：用户编辑视角即最终取景视角
 *  - 背景：none / color / image-plane / panorama（cylinder/sphere/equirect 自动按 projectionMode）
 *  - 地面网格、原点指示器
 *  - 假人列表（procedural mesh）
 *  - 命令式句柄 onCanvasReady：交给父组件做截图导出
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DRenderMode,
  LinghuiDirector3DScene,
} from '../../../types/linghui';
import { Director3DMannequin } from './Director3DMannequin';
import { Director3DLiteMannequin } from './Director3DLiteMannequin';
import { Director3DFormation } from './Director3DFormation';
import { Director3DCreature } from './Director3DCreatureMesh';
import { Director3DProp } from './Director3DProp';
import { buildDirector3DActorGroup, type ExportGeometryContext } from './director3dExportGeometry';
import { resolvePanoramaViewerMode } from '../panorama/panoramaProjection';
import { safeFetch } from '../../../utils/safeFetch';
import { resolveDirector3DColor } from './director3dColors';

export interface Director3DCaptureOptions {
  width?: number;
  height?: number;
  /** 导出风格：lineart（默认） / silhouette / depth / composition */
  renderMode?: LinghuiDirector3DRenderMode;
  /** 临时相机参数。提供时使用该相机渲染（不改 viewport 当前视角），用于批量多视角导出 */
  cameraOverride?: LinghuiDirector3DScene['camera'];
  /**
   * 强制使用此 scene 渲染（不读 props.scene）。
   * 时间轴逐帧导出用：外部直接传入 interpolateSceneAt(scene, t) 算出来的快照，
   * 避免依赖 React state 更新链路导致 capture 闭包仍是旧 scene 而产出静态视频。
   */
  sceneOverride?: LinghuiDirector3DScene;
}

export interface Director3DViewportHandle {
  /** 渲染当前镜头视角并把画面导出为 PNG dataUrl。 */
  captureCurrentView: (options?: Director3DCaptureOptions) => Promise<string | null>;
  /** 返回当前工作台视角对应的相机参数。 */
  getCurrentCamera: () => LinghuiDirector3DScene['camera'];
  /**
   * 返回当前轨道相机的 yaw (累计弧度，不取模) / pitch / distance。
   * 用于关键帧记录环绕镜头：position 是 [x,y,z] 看不出转了几圈，但 yaw 累计可以。
   */
  getCurrentOrbit: () => { yaw: number; pitch: number; distance: number };
}

interface Director3DViewportProps {
  scene: LinghuiDirector3DScene;
  selectedActorId?: string | null;
  onActorClick?: (actorId: string) => void;
  onActorMove?: (actorId: string, position: [number, number, number]) => void;
  onActorRotate?: (actorId: string, rotationY: number) => void;
  onCanvasClick?: () => void;
  onCameraChange?: (
    camera: LinghuiDirector3DScene['camera'],
    orbit: { yaw: number; pitch: number; distance: number },
  ) => void;
  /** lineart 渲染模式（影响假人材质 / 背景显隐 / 网格颜色） */
  renderMode?: 'preview' | 'lineart' | 'silhouette';
  /**
   * 相机模式：
   *  - 'output'（默认）：拖动 / 缩放 / 视角预设 直接写到 scene.camera = 输出相机
   *    所有关键帧 / 导出 lineart / 时间轴插值用的就是这个
   *  - 'editor'：拖动 / 缩放只改 viewport 内部 ref，不写回 scene.camera，
   *    不影响最终输出。用于"我想从其他角度看一眼场景"。
   *    切回 output 模式时 viewport 视角会重新对齐到 scene.camera。
   */
  cameraMode?: 'output' | 'editor';
  className?: string;
}

const PIVOT = new THREE.Vector3(0, 0.8, 0);

/**
 * 离屏导出复用的 WebGL renderer。如果每帧都 new THREE.WebGLRenderer()，
 * 浏览器会很快撞到 WebGL context 数量上限（~16），导致老 context 被踢、
 * 渲染崩溃。这里全局复用一个 canvas + renderer，只在尺寸变化时 setSize。
 */
let offscreenSingleton: { canvas: HTMLCanvasElement; renderer: THREE.WebGLRenderer } | null = null;

function getOrCreateOffscreenRenderer(width: number, height: number): {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
} {
  if (!offscreenSingleton) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    offscreenSingleton = { canvas, renderer };
  } else if (offscreenSingleton.canvas.width !== width || offscreenSingleton.canvas.height !== height) {
    offscreenSingleton.canvas.width = width;
    offscreenSingleton.canvas.height = height;
    offscreenSingleton.renderer.setSize(width, height, false);
  }
  return offscreenSingleton;
}

/**
 * 递归 dispose 整棵 scene 的临时 geometry / material 资源 —— 避免逐帧导出内存泄漏。
 */
function disposeSceneGraph(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach(m => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    }
    // LineSegments 用 EdgesGeometry，也是 disposable
    const line = obj as THREE.LineSegments;
    if ((line as { isLineSegments?: boolean }).isLineSegments) {
      line.geometry?.dispose();
      if (line.material instanceof THREE.Material) line.material.dispose();
    }
  });
}

function createDirector3DMaterialContext(
  renderMode: LinghuiDirector3DRenderMode,
  actorColor?: string,
): ExportGeometryContext {
  const drawEdges = renderMode === 'lineart' || renderMode === 'composition';
  const wireMat = drawEdges ? new THREE.LineBasicMaterial({ color: 0x000000 }) : UNUSED_WIRE_MATERIAL;
  let fillMat: THREE.Material;
  if (renderMode === 'silhouette') {
    fillMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  } else if (renderMode === 'depth') {
    fillMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  } else {
    const colorStr = resolveDirector3DColor(actorColor || '', '#ffffff');
    fillMat = renderMode === 'preview'
      ? new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorStr),
        roughness: 0.7,
        metalness: 0.05,
        side: THREE.DoubleSide,
      })
      : new THREE.MeshBasicMaterial({ color: new THREE.Color(colorStr), side: THREE.DoubleSide });
  }
  return { drawEdges, wireMat, fillMat };
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const UNUSED_WIRE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x000000 });

interface OrbitCameraState {
  yaw: number;
  pitch: number;
  distance: number;
  pan: THREE.Vector3;
}

function toCameraTuple(vector: THREE.Vector3): [number, number, number] {
  return [
    Number(vector.x.toFixed(4)),
    Number(vector.y.toFixed(4)),
    Number(vector.z.toFixed(4)),
  ];
}

function samePosition(a: [number, number, number], b: [number, number, number]) {
  return Math.abs(a[0] - b[0]) < 0.0001
    && Math.abs(a[1] - b[1]) < 0.0001
    && Math.abs(a[2] - b[2]) < 0.0001;
}

function normalizeAngleRadians(value: number): number {
  let next = value;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function resolveOrbitCameraState(camera: LinghuiDirector3DScene['camera']): OrbitCameraState {
  const position = new THREE.Vector3().fromArray(camera.position);
  const target = new THREE.Vector3().fromArray(camera.target);
  const offset = position.clone().sub(target);
  const distance = Math.max(0.1, offset.length());
  const pitch = Math.asin(Math.max(-1, Math.min(1, offset.y / distance)));
  const yaw = Math.atan2(offset.x, offset.z);
  return {
    yaw,
    pitch,
    distance,
    pan: target.clone().sub(PIVOT),
  };
}

function buildCameraFromOrbit(
  yaw: number,
  pitch: number,
  distance: number,
  pan: THREE.Vector3,
  baseCamera: LinghuiDirector3DScene['camera'],
): LinghuiDirector3DScene['camera'] {
  const cosP = Math.cos(pitch);
  const target = new THREE.Vector3(
    pan.x + PIVOT.x,
    pan.y + PIVOT.y,
    pan.z + PIVOT.z,
  );
  const position = new THREE.Vector3(
    Math.sin(yaw) * cosP * distance + target.x,
    Math.sin(pitch) * distance + target.y,
    Math.cos(yaw) * cosP * distance + target.z,
  );
  return {
    ...baseCamera,
    position: toCameraTuple(position),
    target: toCameraTuple(target),
  };
}

/**
 * 工作台环境常量：geometry 尺寸 + 云朵 / 凸起的固定位置。
 * 缩到低配能跑：圆盘 r=15, sky r=20，grid 与圆盘同步 (30×30 总宽，30 分割 = 1m/格)。
 * 云朵 / 凸起用确定性位置，避免渲染时抖动。
 */
const GROUND_RADIUS = 15;
const SKY_RADIUS = 20;
const GROUND_GRID_TOTAL = GROUND_RADIUS * 2;
const GROUND_GRID_DIVISIONS = 30;

// 6 朵固定云（避免每帧重新随机导致抖动）
const ENV_CLOUDS: Array<{ x: number; z: number; y: number; rx: number; rz: number }> = [
  { x: -8, z: -6, y: 11, rx: 2.0, rz: 1.4 },
  { x: 7, z: -9, y: 12, rx: 2.6, rz: 1.6 },
  { x: -4, z: 8, y: 13, rx: 1.8, rz: 1.1 },
  { x: 9, z: 5, y: 10, rx: 2.2, rz: 1.5 },
  { x: 0, z: 10, y: 14, rx: 2.4, rz: 1.4 },
  { x: -10, z: 1, y: 13, rx: 1.9, rz: 1.2 },
];

/**
 * 用 canvas 程序化生成"颗粒感" data URL（深浅斑点 PNG），给地面 / 凸起的 material.map / bumpMap 用。
 * 一次生成、模块级缓存，导出 192 帧只跑一次。
 */
function generateGroundNoiseDataUrl(size = 128, seed = 0xa1b2c3): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  // 基底浅米
  ctx.fillStyle = '#e0ddd5';
  ctx.fillRect(0, 0, size, size);
  // pseudo-random 颗粒 (LCG，确定性，避免每次渲染都变)
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = 0; i < size * size * 0.55; i++) {
    const x = (rand() * size) | 0;
    const y = (rand() * size) | 0;
    const r = rand();
    const dim = r < 0.5 ? 28 : r < 0.8 ? 14 : 8;
    ctx.fillStyle = r < 0.5
      ? `rgba(180,176,168,${0.18 + rand() * 0.18})`
      : `rgba(255,253,246,${0.14 + rand() * 0.14})`;
    ctx.fillRect(x, y, 1, 1);
    if (dim > 8 && r > 0.7) {
      ctx.fillRect(x + 1, y, 1, 1);
      ctx.fillRect(x, y + 1, 1, 1);
    }
  }
  return canvas.toDataURL('image/png');
}

let _groundNoiseTexture: THREE.Texture | null = null;
function getGroundNoiseTexture(): THREE.Texture {
  if (_groundNoiseTexture) return _groundNoiseTexture;
  const loader = new THREE.TextureLoader();
  const url = generateGroundNoiseDataUrl();
  _groundNoiseTexture = loader.load(url);
  _groundNoiseTexture.wrapS = THREE.RepeatWrapping;
  _groundNoiseTexture.wrapT = THREE.RepeatWrapping;
  _groundNoiseTexture.repeat.set(8, 8); // 平铺 8 次 → 看起来更碎
  return _groundNoiseTexture;
}

function GroundGrid({ visible }: { visible: boolean; lineColor?: string }) {
  const groundTexture = useMemo(() => (visible ? getGroundNoiseTexture() : null), [visible]);
  if (!visible) return null;
  return (
    <>
      {/* 圆盘地面：颗粒感纹理 + 高粗糙度 → 看起来像泥地/沙地，无大型凸起 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow={false}>
        <circleGeometry args={[GROUND_RADIUS, 48]} />
        <meshStandardMaterial
          color="#dcd6c9"
          roughness={0.95}
          metalness={0}
          map={groundTexture ?? undefined}
        />
      </mesh>
      {/* 网格线 —— 与圆盘同范围、间距 1m，淡灰不抢主体 */}
      <gridHelper
        args={[GROUND_GRID_TOTAL, GROUND_GRID_DIVISIONS, '#c8c4bd', '#dad6cd']}
        position={[0, 0.001, 0]}
      />
    </>
  );
}

function SkyDome({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <>
      {/* 半球穹顶 —— 用更柔和的天蓝色 */}
      <mesh>
        <sphereGeometry args={[SKY_RADIUS, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshBasicMaterial color="#9ec6e8" side={THREE.BackSide} />
      </mesh>
      {/* 6 朵固定白云 —— 在天空里给画面参考点 */}
      {ENV_CLOUDS.map((cloud, i) => (
        <mesh key={`cloud-${i}`} position={[cloud.x, cloud.y, cloud.z]} scale={[cloud.rx, 0.45, cloud.rz]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color="#fefefe" />
        </mesh>
      ))}
    </>
  );
}

function Background({
  scene,
  texture,
  renderMode,
}: {
  scene: LinghuiDirector3DScene;
  texture: THREE.Texture | null;
  renderMode: 'preview' | 'lineart' | 'silhouette';
}) {
  const bg = scene.background;
  const { scene: threeScene } = useThree();

  useEffect(() => {
    if (renderMode === 'lineart') {
      threeScene.background = new THREE.Color(resolveDirector3DColor('var(--token-bg-base)', 'black'));
      return;
    }
    if (bg.mode === 'color' && bg.color) {
      threeScene.background = new THREE.Color(resolveDirector3DColor(bg.color, 'black'));
    } else if (bg.mode === 'none') {
      threeScene.background = new THREE.Color(resolveDirector3DColor('var(--token-bg-app)', 'black'));
    }
    return undefined;
  }, [bg.color, bg.mode, renderMode, threeScene]);

  if (renderMode === 'lineart' || renderMode === 'silhouette') {
    return null;
  }

  if (bg.mode === 'image-plane' && texture) {
    return (
      <mesh position={[0, 4, -10]}>
        <planeGeometry args={[24, 13.5]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    );
  }

  if (bg.mode === 'panorama' && texture) {
    const tex = texture as THREE.Texture & { image?: { width?: number; height?: number } };
    const viewerMode = resolvePanoramaViewerMode({
      projectionMode: bg.projectionMode,
      width: tex.image?.width,
      height: tex.image?.height,
    });

    if (viewerMode === 'equirect-sphere') {
      return (
        <mesh scale={[-1, 1, 1]}>
          <sphereGeometry args={[40, 96, 48]} />
          <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
        </mesh>
      );
    }
    if (viewerMode === 'sphere-band') {
      return (
        <mesh scale={[-1, 1, 1]}>
          <sphereGeometry args={[40, 64, 32, 0, Math.PI * 2, Math.PI * 0.2, Math.PI * 0.6]} />
          <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
        </mesh>
      );
    }
    if (viewerMode === 'cylinder-band') {
      const aspect = (tex.image?.width && tex.image?.height) ? tex.image.width / tex.image.height : 21 / 9;
      const radius = 40;
      const circumference = 2 * Math.PI * radius;
      const height = circumference / Math.max(aspect, 0.5);
      return (
        <mesh scale={[-1, 1, 1]} position={[0, 1, 0]} rotation={[0, bg.yawOffset ?? 0, 0]}>
          <cylinderGeometry args={[radius, radius, height, 64, 1, true]} />
          <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
        </mesh>
      );
    }
    return (
      <mesh position={[0, 4, -10]}>
        <planeGeometry args={[24, 13.5]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    );
  }

  return null;
}

interface CameraRigProps {
  yawTargetRef: React.MutableRefObject<number>;
  pitchTargetRef: React.MutableRefObject<number>;
  distanceRef: React.MutableRefObject<number>;
  panOffsetRef: React.MutableRefObject<THREE.Vector3>;
  sceneCamera: LinghuiDirector3DScene['camera'];
  cameraStateRef: React.MutableRefObject<LinghuiDirector3DScene['camera']>;
}

const EditorCameraRig: React.FC<CameraRigProps> = ({
  yawTargetRef,
  pitchTargetRef,
  distanceRef,
  panOffsetRef,
  sceneCamera,
  cameraStateRef,
}) => {
  const { camera } = useThree();
  const tmp = useRef(new THREE.Vector3());

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.fov = sceneCamera.fov;
    perspectiveCamera.updateProjectionMatrix();
  }, [camera, sceneCamera.fov]);

  useFrame(() => {
    const currentCamera = buildCameraFromOrbit(
      yawTargetRef.current,
      pitchTargetRef.current,
      distanceRef.current,
      panOffsetRef.current,
      sceneCamera,
    );
    tmp.current.fromArray(currentCamera.position);
    camera.position.lerp(tmp.current, 0.2);
    camera.lookAt(new THREE.Vector3().fromArray(currentCamera.target));
    cameraStateRef.current = {
      ...currentCamera,
      position: toCameraTuple(camera.position),
    };
  });

  return null;
};

function useBackgroundTexture(scene: LinghuiDirector3DScene): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const sourceUrl = scene.background.mode === 'image-plane' || scene.background.mode === 'panorama'
    ? scene.background.source ?? ''
    : '';

  useEffect(() => {
    if (!sourceUrl) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    let createdTexture: THREE.Texture | null = null;

    const finalize = (url: string) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        createdTexture = tex;
        setTexture(tex);
      });
    };

    if (/^https?:\/\//i.test(sourceUrl)) {
      (async () => {
        try {
          const res = await safeFetch(sourceUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          if (cancelled) return;
          blobUrl = URL.createObjectURL(blob);
          finalize(blobUrl);
        } catch {
          if (!cancelled) setTexture(null);
        }
      })();
    } else {
      finalize(sourceUrl);
    }

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (createdTexture) createdTexture.dispose();
    };
  }, [sourceUrl]);

  return texture;
}

interface CaptureRendererProps {
  scene: LinghuiDirector3DScene;
  texture: THREE.Texture | null;
  cameraStateRef: React.MutableRefObject<LinghuiDirector3DScene['camera']>;
  registerCapture: (fn: Director3DViewportHandle['captureCurrentView']) => void;
}

const CaptureRenderer: React.FC<CaptureRendererProps> = ({ scene, texture, cameraStateRef, registerCapture }) => {
  // 把 props.scene 同步到 ref：capture 里读 ref 而不是闭包的 scene，
  // 这样即使 props 异步更新到位前 capture 被调用，也能拿到最新 scene
  const sceneRef = useRef<LinghuiDirector3DScene>(scene);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  const capture = useCallback(async (options?: Director3DCaptureOptions) => {
    // 优先级：sceneOverride > sceneRef.current（最新 props.scene）
    const effectiveScene = options?.sceneOverride ?? sceneRef.current;
    const currentCamera = options?.cameraOverride ?? effectiveScene.camera ?? cameraStateRef.current;
    const width = options?.width ?? 1024;
    const aspectParts = currentCamera.aspectRatio.split(':');
    const ratio = aspectParts.length === 2 ? Number(aspectParts[0]) / Number(aspectParts[1]) : 16 / 9;
    const height = options?.height ?? Math.round(width / ratio);
    const exportMode: LinghuiDirector3DRenderMode = options?.renderMode ?? 'lineart';

    // 复用单一 WebGLRenderer：每帧 new WebGLRenderer 会创建独立 WebGL context，
    // 浏览器有 ~16 个 context 上限，逐帧导出 192 帧会触发 "Too many active WebGL contexts"。
    const { renderer, canvas: offscreen } = getOrCreateOffscreenRenderer(width, height);

    // 背景色：preview 用淡天蓝（被 sky 穹顶完全包裹时影响小但渲染缓冲外区域有色调），
    // 其他模式（lineart / silhouette / depth / composition）纯白便于下游 AI 识别主体
    const backdropColor = exportMode === 'preview' ? 0xcfe4f5 : 0xffffff;
    renderer.setClearColor(backdropColor, 1);

    const offscreenScene = new THREE.Scene();
    offscreenScene.background = new THREE.Color(backdropColor);
    offscreenScene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(3, 6, 4);
    offscreenScene.add(dirLight);

    for (const actor of effectiveScene.actors) {
      offscreenScene.add(buildDirector3DActorGroup(actor, createDirector3DMaterialContext(exportMode, actor.color)));
    }

    // preview 模式：与画布完全同步的地面 + 天空 + 云朵（确定性位置不抖动）
    if (exportMode === 'preview') {
      // 圆盘地面 + 颗粒纹理（与 viewport GroundGrid 共用 getGroundNoiseTexture）
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0xdcd6c9,
        roughness: 0.95,
        metalness: 0,
        map: getGroundNoiseTexture(),
        side: THREE.DoubleSide,
      });
      const ground = new THREE.Mesh(new THREE.CircleGeometry(GROUND_RADIUS, 48), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.001;
      offscreenScene.add(ground);

      // 天空半球
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(SKY_RADIUS, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshBasicMaterial({ color: 0x9ec6e8, side: THREE.BackSide }),
      );
      offscreenScene.add(sky);

      // 白云（用 ENV_CLOUDS 固定位置）
      for (const cloud of ENV_CLOUDS) {
        const cloudMesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0xfefefe }),
        );
        cloudMesh.position.set(cloud.x, cloud.y, cloud.z);
        cloudMesh.scale.set(cloud.rx, 0.45, cloud.rz);
        offscreenScene.add(cloudMesh);
      }
    }

    if (effectiveScene.background.mode === 'panorama' && texture && exportMode === 'lineart') {
      const aspect = (texture.image && (texture.image as { width: number }).width)
        ? (texture.image as { width: number; height: number }).width / (texture.image as { height: number }).height
        : 21 / 9;
      const viewerMode = resolvePanoramaViewerMode({
        projectionMode: effectiveScene.background.projectionMode,
        width: (texture.image as { width?: number } | undefined)?.width,
        height: (texture.image as { height?: number } | undefined)?.height,
      });
      const radius = 40;
      const matBg = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, toneMapped: false });
      let mesh: THREE.Mesh | null = null;
      if (viewerMode === 'equirect-sphere') {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), matBg);
      } else if (viewerMode === 'cylinder-band') {
        const circumference = 2 * Math.PI * radius;
        const height = circumference / Math.max(aspect, 0.5);
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 64, 1, true), matBg);
      } else if (viewerMode === 'sphere-band') {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32, 0, Math.PI * 2, Math.PI * 0.2, Math.PI * 0.6), matBg);
      }
      if (mesh) {
        mesh.scale.set(-1, 1, 1);
        offscreenScene.add(mesh);
      }
    }

    // depth 模式收紧远裁面，让深度灰阶在常见场景距离（~12m 内）映射均匀，
    // 否则演员区距相机几米但 far=200，输出灰度近乎全白
    const near = 0.1;
    const far = exportMode === 'depth' ? 12 : 200;
    const cam = new THREE.PerspectiveCamera(currentCamera.fov, ratio, near, far);
    cam.position.fromArray(currentCamera.position);
    cam.lookAt(new THREE.Vector3().fromArray(currentCamera.target));

    renderer.render(offscreenScene, cam);

    // composition 模式：再叠一层 2D 三分线和黄金分割辅助框，画到 2D canvas 上方
    if (exportMode === 'composition') {
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 1.5;
        // 三分线
        for (let i = 1; i <= 2; i += 1) {
          const x = (width * i) / 3;
          const y = (height * i) / 3;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
        // 中央十字（视觉中心）
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        // 安全框（90%）
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(width * 0.05, height * 0.05, width * 0.9, height * 0.9);
        ctx.restore();
      }
    }

    let dataUrl: string | null = null;
    try {
      dataUrl = offscreen.toDataURL('image/png');
    } catch {
      dataUrl = null;
    }
    // 不 dispose renderer（复用），但要 dispose 本次构造的临时 scene 资源
    disposeSceneGraph(offscreenScene);
    offscreenScene.clear();
    return dataUrl;
  }, [cameraStateRef, scene, texture]);

  useEffect(() => {
    registerCapture(capture);
  }, [capture, registerCapture]);

  return null;
};

interface ActorDragLayerProps {
  actors: LinghuiDirector3DActor[];
  selectedActorId?: string | null;
  renderMode: 'preview' | 'lineart' | 'silhouette';
  onActorPress?: (actorId: string) => void;
  onActorMove?: (actorId: string, position: [number, number, number]) => void;
  onActorRotate?: (actorId: string, rotationY: number) => void;
  onActorDragStart?: () => void;
  onActorDragEnd?: () => void;
}

type ActorDragMode = 'move' | 'height' | 'rotate';

interface ActorDragSession {
  id: string;
  mode: ActorDragMode;
  pointerId: number;
  planeY: number;
  offset: THREE.Vector3;
  lastPosition: [number, number, number] | null;
  startClientY: number;
  startY: number;
  startRotationY: number;
  startAngle: number;
  lastRotationY: number | null;
}

const ActorDragLayer: React.FC<ActorDragLayerProps> = ({
  actors,
  selectedActorId,
  renderMode,
  onActorPress,
  onActorMove,
  onActorRotate,
  onActorDragStart,
  onActorDragEnd,
}) => {
  const { camera, gl } = useThree();
  const pointerRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const dragPlaneRef = useRef(new THREE.Plane(WORLD_UP, 0));
  const dragHitRef = useRef(new THREE.Vector3());
  const dragSessionRef = useRef<ActorDragSession | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; position: [number, number, number] } | null>(null);
  const [rotationPreview, setRotationPreview] = useState<{ id: string; rotationY: number } | null>(null);

  const applyPreviewToActor = useCallback((actor: LinghuiDirector3DActor): LinghuiDirector3DActor => {
    const movingActor = dragPreview ? actors.find(item => item.id === dragPreview.id) : null;
    if (dragPreview && movingActor) {
      if (actor.id === dragPreview.id) {
        return { ...actor, position: dragPreview.position };
      }
      if (movingActor.groupId && actor.groupId === movingActor.groupId) {
        const dx = dragPreview.position[0] - movingActor.position[0];
        const dy = dragPreview.position[1] - movingActor.position[1];
        const dz = dragPreview.position[2] - movingActor.position[2];
        return {
          ...actor,
          position: [
            Number((actor.position[0] + dx).toFixed(4)),
            Number((actor.position[1] + dy).toFixed(4)),
            Number((actor.position[2] + dz).toFixed(4)),
          ],
        };
      }
    }

    const rotatingActor = rotationPreview ? actors.find(item => item.id === rotationPreview.id) : null;
    if (rotationPreview && rotatingActor) {
      const delta = normalizeAngleRadians(rotationPreview.rotationY - rotatingActor.rotationY);
      if (actor.id === rotationPreview.id && !rotatingActor.groupId) {
        return { ...actor, rotationY: rotationPreview.rotationY };
      }
      if (rotatingActor.groupId && actor.groupId === rotatingActor.groupId) {
        const members = actors.filter(item => item.groupId === rotatingActor.groupId);
        const mountPivot = members.find(item => item.groupRole === 'mount')?.position;
        const averagePivot: [number, number, number] = [
          members.reduce((sum, item) => sum + item.position[0], 0) / Math.max(1, members.length),
          members.reduce((sum, item) => sum + item.position[1], 0) / Math.max(1, members.length),
          members.reduce((sum, item) => sum + item.position[2], 0) / Math.max(1, members.length),
        ];
        const pivot = mountPivot ?? averagePivot;
        const dx = actor.position[0] - pivot[0];
        const dz = actor.position[2] - pivot[2];
        const cos = Math.cos(delta);
        const sin = Math.sin(delta);
        return {
          ...actor,
          position: [
            Number((pivot[0] + dx * cos - dz * sin).toFixed(4)),
            actor.position[1],
            Number((pivot[2] + dx * sin + dz * cos).toFixed(4)),
          ],
          rotationY: normalizeAngleRadians(actor.rotationY + delta),
        };
      }
      if (actor.id === rotationPreview.id) {
        return { ...actor, rotationY: rotationPreview.rotationY };
      }
    }

    return actor;
  }, [actors, dragPreview, rotationPreview]);

  const getPlaneHit = useCallback((clientX: number, clientY: number, planeY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    pointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    camera.updateMatrixWorld();
    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    dragPlaneRef.current.set(WORLD_UP, -planeY);

    const hit = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, dragHitRef.current);
    return hit ? hit.clone() : null;
  }, [camera, gl.domElement]);

  const endDrag = useCallback((pointerId?: number) => {
    const session = dragSessionRef.current;
    if (!session) return;
    if (typeof pointerId === 'number' && session.pointerId !== pointerId) return;

    dragSessionRef.current = null;
    if ((session.mode === 'move' || session.mode === 'height') && session.lastPosition) {
      onActorMove?.(session.id, session.lastPosition);
    } else if (session.mode === 'rotate' && typeof session.lastRotationY === 'number') {
      onActorRotate?.(session.id, session.lastRotationY);
    }
    onActorDragEnd?.();
  }, [onActorDragEnd, onActorMove, onActorRotate]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      event.preventDefault();
      if (session.mode === 'move') {
        const hit = getPlaneHit(event.clientX, event.clientY, session.planeY);
        if (!hit) return;

        hit.add(session.offset);
        const position: [number, number, number] = [
          Number(hit.x.toFixed(4)),
          session.planeY,
          Number(hit.z.toFixed(4)),
        ];
        session.lastPosition = position;
        setDragPreview({ id: session.id, position });
        return;
      }

      if (session.mode === 'height') {
        const nextY = Math.max(-1, Math.min(8, session.startY - (event.clientY - session.startClientY) * 0.01));
        const actor = actors.find(item => item.id === session.id);
        if (!actor) return;
        const position: [number, number, number] = [
          actor.position[0],
          Number(nextY.toFixed(4)),
          actor.position[2],
        ];
        session.lastPosition = position;
        setDragPreview({ id: session.id, position });
        return;
      }

      const actor = actors.find(item => item.id === session.id);
      if (!actor) return;
      const hit = getPlaneHit(event.clientX, event.clientY, actor.position[1]);
      if (!hit) return;
      const angle = Math.atan2(hit.x - actor.position[0], hit.z - actor.position[2]);
      const rotationY = session.startRotationY + (angle - session.startAngle);
      const rounded = Number(rotationY.toFixed(4));
      session.lastRotationY = rounded;
      setRotationPreview({ id: session.id, rotationY: rounded });
    };

    const handlePointerUp = (event: PointerEvent) => {
      endDrag(event.pointerId);
    };

    const handleBlur = () => {
      endDrag();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [actors, endDrag, getPlaneHit]);

  useEffect(() => {
    if (!dragPreview || dragSessionRef.current?.id === dragPreview.id) return;
    const actor = actors.find(item => item.id === dragPreview.id);
    if (actor && samePosition(actor.position, dragPreview.position)) {
      setDragPreview(null);
    }
  }, [actors, dragPreview]);

  useEffect(() => {
    if (!rotationPreview || dragSessionRef.current?.id === rotationPreview.id) return;
    const actor = actors.find(item => item.id === rotationPreview.id);
    if (actor && Math.abs(actor.rotationY - rotationPreview.rotationY) < 0.0001) {
      setRotationPreview(null);
    }
  }, [actors, rotationPreview]);

  const startDrag = useCallback((actor: LinghuiDirector3DActor, event: ThreeEvent<PointerEvent>, mode: ActorDragMode) => {
    event.stopPropagation();
    event.nativeEvent.stopPropagation();

    const nativeEvent = event.nativeEvent;
    const planeY = actor.position[1];
    const actorPosition = new THREE.Vector3().fromArray(actor.position);
    const hit = getPlaneHit(nativeEvent.clientX, nativeEvent.clientY, planeY);

    dragSessionRef.current = {
      id: actor.id,
      mode,
      pointerId: nativeEvent.pointerId,
      planeY,
      offset: hit ? actorPosition.sub(hit) : new THREE.Vector3(),
      lastPosition: null,
      startClientY: nativeEvent.clientY,
      startY: actor.position[1],
      startRotationY: actor.rotationY,
      startAngle: hit ? Math.atan2(hit.x - actor.position[0], hit.z - actor.position[2]) : actor.rotationY,
      lastRotationY: null,
    };
    onActorPress?.(actor.id);
    onActorDragStart?.();
  }, [getPlaneHit, onActorDragStart, onActorPress]);

  const handleActorPointerDown = useCallback((actor: LinghuiDirector3DActor, event: ThreeEvent<PointerEvent>) => {
    startDrag(actor, event, 'move');
  }, [startDrag]);

  const handleHeightPointerDown = useCallback((actor: LinghuiDirector3DActor, event: ThreeEvent<PointerEvent>) => {
    startDrag(actor, event, 'height');
  }, [startDrag]);

  const handleRotatePointerDown = useCallback((actor: LinghuiDirector3DActor, event: ThreeEvent<PointerEvent>) => {
    startDrag(actor, event, 'rotate');
  }, [startDrag]);

  return (
    <>
      {actors.map((actor) => {
        const renderActor = applyPreviewToActor(actor);
        const shared = {
          actor: renderActor,
          selected: actor.id === selectedActorId,
          renderMode,
          onPointerDown: (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => handleActorPointerDown(actor, event),
        };
        if (actor.type === 'mannequin') {
          return <Director3DMannequin key={actor.id} {...shared} />;
        }
        if (actor.type === 'mannequin-lite') {
          return <Director3DLiteMannequin key={actor.id} {...shared} />;
        }
        if (actor.type === 'formation') {
          return <Director3DFormation key={actor.id} {...shared} />;
        }
        if (actor.type === 'creature') {
          return <Director3DCreature key={actor.id} {...shared} />;
        }
        return (
          <Director3DProp key={actor.id} {...shared} />
        );
      })}
      {selectedActorId ? (() => {
        const selected = actors.find(actor => actor.id === selectedActorId);
        if (!selected) return null;
        const previewSelected = applyPreviewToActor(selected);
        const position = previewSelected.position;
        const rotationY = previewSelected.rotationY;
        const radius = selected.type === 'creature'
          ? Math.max(0.75, selected.scale * 0.75)
          : Math.max(0.45, selected.scale * 0.45);
        return (
          <group position={position}>
            <mesh position={[0, 1.95 * selected.scale, 0]} onPointerDown={(event) => handleHeightPointerDown(selected, event)}>
              <sphereGeometry args={[0.085, 16, 12]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
            </mesh>
            <mesh position={[0, 0.98 * selected.scale, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 1.9 * selected.scale, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.62} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} onPointerDown={(event) => handleRotatePointerDown(selected, event)}>
              <ringGeometry args={[radius, radius + 0.035, 48]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.78} />
            </mesh>
            <mesh
              position={[Math.sin(rotationY) * (radius + 0.12), 0.08, Math.cos(rotationY) * (radius + 0.12)]}
              onPointerDown={(event) => handleRotatePointerDown(selected, event)}
            >
              <sphereGeometry args={[0.07, 16, 12]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
            </mesh>
          </group>
        );
      })() : null}
    </>
  );
};

export const Director3DViewport = forwardRef<Director3DViewportHandle, Director3DViewportProps>(
  function Director3DViewportInner(
    {
      scene,
      selectedActorId,
      onActorClick,
      onActorMove,
      onActorRotate,
      onCanvasClick,
      onCameraChange,
      renderMode = 'preview',
      cameraMode = 'output',
      className,
    },
    ref,
  ) {
    const cameraModeRef = useRef<'output' | 'editor'>(cameraMode);
    const initialOrbit = useMemo(() => resolveOrbitCameraState(scene.camera), []);
    const yawTargetRef = useRef(initialOrbit.yaw);
    const pitchTargetRef = useRef(initialOrbit.pitch);
    const distanceRef = useRef(initialOrbit.distance);
    const panOffsetRef = useRef(initialOrbit.pan);
    const isPanningRef = useRef(false);
    const isActorDragActiveRef = useRef(false);
    const suppressNextCanvasClickRef = useRef(false);
    const lastPointer = useRef<{ x: number; y: number } | null>(null);
    const captureFnRef = useRef<Director3DViewportHandle['captureCurrentView']>(() => Promise.resolve(null));
    const cameraStateRef = useRef<LinghuiDirector3DScene['camera']>(scene.camera);
    const texture = useBackgroundTexture(scene);

    useImperativeHandle(ref, () => ({
      captureCurrentView: (options) => captureFnRef.current(options),
      // viewport 当前显示的相机参数（编辑模式下 ≠ scene.camera，输出模式下 = scene.camera）
      // 用法：编辑器调用 viewport.getCurrentCamera() 拿到编辑视角，写到 scene.camera 即"应用为输出"
      getCurrentCamera: () => buildCameraFromOrbit(
        yawTargetRef.current,
        pitchTargetRef.current,
        distanceRef.current,
        panOffsetRef.current,
        scene.camera,
      ),
      // 用户拖动相机时 yawTargetRef 是累计弧度（不取模），所以连续转两圈 yaw = 4π
      getCurrentOrbit: () => ({
        yaw: yawTargetRef.current,
        pitch: pitchTargetRef.current,
        distance: distanceRef.current,
      }),
    }), [scene.camera]);

    useEffect(() => {
      // 当 scene.camera（输出相机）变化、或 mode 切回 output 时，重置 viewport 视角到输出相机
      // mode 切到 editor 时不重置：保留用户当前视角作为编辑起点
      const previousMode = cameraModeRef.current;
      cameraModeRef.current = cameraMode;
      const switchedBackToOutput = previousMode === 'editor' && cameraMode === 'output';
      if (cameraMode === 'output' || switchedBackToOutput) {
        const orbit = resolveOrbitCameraState(scene.camera);
        yawTargetRef.current = orbit.yaw;
        pitchTargetRef.current = orbit.pitch;
        distanceRef.current = orbit.distance;
        panOffsetRef.current.copy(orbit.pan);
        cameraStateRef.current = scene.camera;
      }
    }, [scene.camera, cameraMode]);

    const commitCurrentCamera = useCallback(() => {
      const currentCamera = buildCameraFromOrbit(
        yawTargetRef.current,
        pitchTargetRef.current,
        distanceRef.current,
        panOffsetRef.current,
        scene.camera,
      );
      cameraStateRef.current = currentCamera;
      // 编辑模式：viewport 视角变化只留在本地 ref，不写回 scene.camera，
      // 也就不会影响关键帧 / 导出 lineart / 时间轴动画
      if (cameraModeRef.current === 'editor') return;
      onCameraChange?.(currentCamera, {
        yaw: yawTargetRef.current,
        pitch: pitchTargetRef.current,
        distance: distanceRef.current,
      });
    }, [onCameraChange, scene.camera]);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (isActorDragActiveRef.current) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      lastPointer.current = { x: e.clientX, y: e.clientY };
      // 中键 / Shift + 左键 = pan
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isPanningRef.current = true;
      }
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (isActorDragActiveRef.current) return;
      const last = lastPointer.current;
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };

      if (isPanningRef.current) {
        const speed = 0.005 * distanceRef.current;
        const yaw = yawTargetRef.current;
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const up = new THREE.Vector3(0, 1, 0);
        panOffsetRef.current.addScaledVector(right, -dx * speed);
        panOffsetRef.current.addScaledVector(up, dy * speed);
        return;
      }

      // orbit
      yawTargetRef.current -= dx * 0.005;
      pitchTargetRef.current = Math.max(
        -Math.PI * 0.45,
        Math.min(Math.PI * 0.48, pitchTargetRef.current - dy * 0.005),
      );
    }, []);

    const endCameraInteraction = useCallback(() => {
      lastPointer.current = null;
      isPanningRef.current = false;
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      endCameraInteraction();
      if (!isActorDragActiveRef.current && Math.abs(e.movementX) < 2 && Math.abs(e.movementY) < 2) {
        // 视为 click（命中检测交给 mesh 自身的 onPointerDown）
      }
      commitCurrentCamera();
    }, [commitCurrentCamera, endCameraInteraction]);

    const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
      if (isActorDragActiveRef.current) return;
      const next = distanceRef.current * (e.deltaY > 0 ? 1.08 : 0.92);
      distanceRef.current = Math.max(2.5, Math.min(20, next));
      commitCurrentCamera();
    }, [commitCurrentCamera]);

    const handleActorPress = useCallback((actorId: string) => {
      suppressNextCanvasClickRef.current = true;
      onActorClick?.(actorId);
    }, [onActorClick]);

    const handleActorDragStart = useCallback(() => {
      isActorDragActiveRef.current = true;
      isPanningRef.current = false;
      lastPointer.current = null;
    }, []);

    const handleActorDragEnd = useCallback(() => {
      isActorDragActiveRef.current = false;
      lastPointer.current = null;
    }, []);

    const handleViewportClick = useCallback(() => {
      if (suppressNextCanvasClickRef.current) {
        suppressNextCanvasClickRef.current = false;
        return;
      }
      onCanvasClick?.();
    }, [onCanvasClick]);

    const registerCapture = useCallback((fn: Director3DViewportHandle['captureCurrentView']) => {
      captureFnRef.current = fn;
    }, []);

    const lineColor = renderMode === 'lineart'
      ? resolveDirector3DColor('var(--token-border-base)', 'gray')
      : resolveDirector3DColor('var(--token-border-strong)', 'slategray');

    return (
      <div
        className={`linghuiDirector3DViewport ${className || ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={endCameraInteraction}
        onPointerCancel={endCameraInteraction}
        onWheel={onWheel}
        onClick={handleViewportClick}
      >
        <Canvas
          camera={{ position: [5, 3, 5], fov: 35, near: 0.05, far: 200 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false }}
          resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
        >
          <ambientLight intensity={0.85} />
          <directionalLight position={[6, 8, 4]} intensity={0.65} />
          <directionalLight position={[-4, 6, -6]} intensity={0.3} />
          <Background scene={scene} texture={texture} renderMode={renderMode} />
          <SkyDome visible={renderMode === 'preview'} />
          <GroundGrid visible={scene.render.showGrid} />

          {/* 原点指示 */}
          <axesHelper args={[1.2]} position={[0, 0.01, 0]} />

          <ActorDragLayer
            actors={scene.actors}
            selectedActorId={selectedActorId}
            renderMode={renderMode}
            onActorPress={handleActorPress}
            onActorMove={onActorMove}
            onActorRotate={onActorRotate}
            onActorDragStart={handleActorDragStart}
            onActorDragEnd={handleActorDragEnd}
          />

          <EditorCameraRig
            yawTargetRef={yawTargetRef}
            pitchTargetRef={pitchTargetRef}
            distanceRef={distanceRef}
            panOffsetRef={panOffsetRef}
            sceneCamera={scene.camera}
            cameraStateRef={cameraStateRef}
          />

          <CaptureRenderer scene={scene} texture={texture} cameraStateRef={cameraStateRef} registerCapture={registerCapture} />
        </Canvas>
      </div>
    );
  },
);

export default Director3DViewport;
