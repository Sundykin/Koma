/**
 * 全景 720° 球面预览。
 *
 * 文件导出两种用法：
 *   - <PanoramaViewport>：纯 3D 视口（Canvas + 控制），可嵌入任何容器，节点卡片小窗内嵌也用它
 *   - <PanoramaViewer>：带 antd Modal 的全屏版本，`open` 控制弹出
 *
 * 摄像机算法（与 panoramaPromptTemplate 的设计意图对齐）：
 *   - 地平线居中：初始 yaw=0、pitch=0，相机直视赤道
 *   - 几何用"带状球面"（thetaStart=36°, thetaLength=108°，赤道带 ±54°）：
 *     南北极根本没有几何 → 不存在经线汇聚成点的脚下漩涡 / 头顶拉花畸变
 *   - 带外用 scene.background 深蓝灰兜底，避免赤道带上下出现纯黑突兀块
 *   - Pitch ±50°，与带几何对齐：用户视角不会跑出带边缘
 *   - FOV 联动 sensitivity：缩放时拖拽更精准
 *   - 平滑 lerp(0.18) 跟随，给"calm, readable composition"那种平稳感
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from 'antd';
import { Maximize2 } from 'lucide-react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { safeFetch } from '../../../utils/safeFetch';
import {
  resolvePanoramaViewerMode,
  type PanoramaProjectionMode,
  type PanoramaViewerMode,
} from './panoramaProjection';

/* ============================== 几何 / 视觉常量 ============================== */

const SPHERE_RADIUS = 50;
// 球带（sphere-band）：赤道 ±54°，去掉极点几何避免漩涡
const SPHERE_BAND_THETA_START = Math.PI * 0.2;
const SPHERE_BAND_THETA_LENGTH = Math.PI * 0.6;
// 完整球（equirect-sphere）：用整个球
const SPHERE_FULL_THETA_START = 0;
const SPHERE_FULL_THETA_LENGTH = Math.PI;
// 圆柱（cylinder-band）：高度按 21:9 / 16:9 出图比例换算，避免上下被无限拉伸
const CYLINDER_RADIUS = SPHERE_RADIUS;

const PITCH_LIMIT_BAND = (Math.PI / 180) * 30;    // 圆柱带：±30°
const PITCH_LIMIT_SPHERE_BAND = (Math.PI / 180) * 50;  // 球带：±50°
const PITCH_LIMIT_FULL = (Math.PI / 180) * 75;   // 完整球：±75°

const FOV_INITIAL = 75;
const FOV_MIN = 35;
const FOV_MAX = 100;
const AUTO_ROTATE_DURATION_MS = 2400;
const SCENE_BG_COLOR = 0x1a2530;             // 深蓝灰，模拟带外天空 / 地面

function pitchLimitForViewerMode(mode: PanoramaViewerMode): number {
  if (mode === 'equirect-sphere') return PITCH_LIMIT_FULL;
  if (mode === 'sphere-band') return PITCH_LIMIT_SPHERE_BAND;
  if (mode === 'cylinder-band') return PITCH_LIMIT_BAND;
  return 0; // flat：不允许 pitch
}

/* ============================== 纹理加载（处理 HTTP CORS 问题） ============================== */

/**
 * Three.TextureLoader 默认 fallthrough 到浏览器 fetch，远程 HTTP 图床多数不带 CORS 头
 * → 直接抛 "Could not load <url>: undefined"。
 *
 * 这里改造：
 *   - koma-local:// / data: / blob:    → 直接喂给 ImageLoader（同源 / 自带数据）
 *   - http(s)://                        → safeFetch 走 Electron 主进程 net 层（无 CORS），
 *                                         拿到 Blob → URL.createObjectURL → ImageLoader
 * 卸载时撤销 blob URL 防内存泄漏；切换 imageUrl 时复用 effect cleanup。
 */
interface PanoramaTextureState {
  texture: THREE.Texture | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
}

function usePanoramaTexture(imageUrl: string): PanoramaTextureState {
  const [state, setState] = useState<PanoramaTextureState>({ texture: null, status: 'idle' });

  useEffect(() => {
    if (!imageUrl) {
      setState({ texture: null, status: 'idle' });
      return;
    }

    let cancelled = false;
    let blobUrl: string | null = null;
    let createdTexture: THREE.Texture | null = null;
    setState({ texture: null, status: 'loading' });

    const buildTextureFrom = (finalUrl: string) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(
        finalUrl,
        (tex) => {
          if (cancelled) {
            tex.dispose();
            return;
          }
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.repeat.set(1, 1);
          tex.offset.set(0, 0);
          tex.needsUpdate = true;
          createdTexture = tex;
          setState({ texture: tex, status: 'ready' });
        },
        undefined,
        (err) => {
          if (cancelled) return;
          // eslint-disable-next-line no-console
          console.warn('[PanoramaTexture] TextureLoader failed', { finalUrl, err });
          setState({ texture: null, status: 'error', error: '纹理加载失败' });
        },
      );
    };

    const isLocalish =
      imageUrl.startsWith('koma-local://')
      || imageUrl.startsWith('data:')
      || imageUrl.startsWith('blob:');

    if (isLocalish) {
      buildTextureFrom(imageUrl);
    } else {
      // 远程 HTTP/HTTPS：safeFetch → Blob → object URL
      (async () => {
        try {
          const response = await safeFetch(imageUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          if (cancelled) return;
          blobUrl = URL.createObjectURL(blob);
          buildTextureFrom(blobUrl);
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.warn('[PanoramaTexture] safeFetch failed', { imageUrl, error: msg });
          setState({ texture: null, status: 'error', error: msg || '远程图片加载失败' });
        }
      })();
    }

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (createdTexture) createdTexture.dispose();
    };
  }, [imageUrl]);

  return state;
}

/* ============================== 几何分发（按 viewerMode） ============================== */

function PanoramaSphereBand({ texture }: { texture: THREE.Texture }) {
  const args = useMemo<[number, number, number, number, number, number, number]>(
    () => [SPHERE_RADIUS, 64, 32, 0, Math.PI * 2, SPHERE_BAND_THETA_START, SPHERE_BAND_THETA_LENGTH],
    [],
  );
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={args} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

function PanoramaSphereFull({ texture }: { texture: THREE.Texture }) {
  const args = useMemo<[number, number, number, number, number, number, number]>(
    () => [SPHERE_RADIUS, 96, 48, 0, Math.PI * 2, SPHERE_FULL_THETA_START, SPHERE_FULL_THETA_LENGTH],
    [],
  );
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={args} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

/**
 * 圆柱内壁，高度根据图像比例换算（避免上下方被无限拉伸）。
 * height = circumference / aspectRatio，确保贴图 1:1 不变形。
 */
function readTextureAspect(texture: THREE.Texture, fallback = 16 / 9): number {
  const img = texture.image as { width?: number; height?: number } | undefined;
  if (img && typeof img.width === 'number' && typeof img.height === 'number' && img.height > 0) {
    return img.width / img.height;
  }
  return fallback;
}

function PanoramaCylinder({ texture }: { texture: THREE.Texture }) {
  const args = useMemo<[number, number, number, number, number, boolean]>(() => {
    const aspect = readTextureAspect(texture, 21 / 9);
    const circumference = 2 * Math.PI * CYLINDER_RADIUS;
    const height = circumference / Math.max(aspect, 0.5);
    return [CYLINDER_RADIUS, CYLINDER_RADIUS, height, 64, 1, true];
  }, [texture]);
  return (
    <mesh scale={[-1, 1, 1]}>
      <cylinderGeometry args={args} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

/** 平面：把图直接铺一张大平面，用 yaw 控制视角左右；不做环绕。 */
function PanoramaFlatPlane({ texture }: { texture: THREE.Texture }) {
  const args = useMemo<[number, number]>(() => {
    const aspect = readTextureAspect(texture, 16 / 9);
    const height = 60;
    return [height * aspect, height];
  }, [texture]);
  return (
    <mesh position={[0, 0, -SPHERE_RADIUS * 0.6]}>
      <planeGeometry args={args} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

function PanoramaGeometry({ texture, viewerMode }: { texture: THREE.Texture; viewerMode: PanoramaViewerMode }) {
  if (viewerMode === 'equirect-sphere') return <PanoramaSphereFull texture={texture} />;
  if (viewerMode === 'sphere-band') return <PanoramaSphereBand texture={texture} />;
  if (viewerMode === 'cylinder-band') return <PanoramaCylinder texture={texture} />;
  return <PanoramaFlatPlane texture={texture} />;
}

/** 设置场景背景色，避免带外纯黑突兀 */
function SceneBackdrop() {
  const { scene } = useThree();
  useEffect(() => {
    const oldBg = scene.background;
    scene.background = new THREE.Color(SCENE_BG_COLOR);
    return () => {
      scene.background = oldBg;
    };
  }, [scene]);
  return null;
}

/* ============================== Camera Rig（memo + 稳定 ref props） ============================== */

interface CameraRigProps {
  yawTargetRef: React.MutableRefObject<number>;
  pitchTargetRef: React.MutableRefObject<number>;
  yawCurrentRef: React.MutableRefObject<number>;
  pitchCurrentRef: React.MutableRefObject<number>;
  fovRef: React.MutableRefObject<number>;
  autoRotateUntilRef: React.MutableRefObject<number>;
  isDraggingRef: React.MutableRefObject<boolean>;
}

const CameraRig: React.FC<CameraRigProps> = React.memo(function CameraRig({
  yawTargetRef,
  pitchTargetRef,
  yawCurrentRef,
  pitchCurrentRef,
  fovRef,
  autoRotateUntilRef,
  isDraggingRef,
}) {
  const { camera, size, gl } = useThree();
  const tmpVec = useRef(new THREE.Vector3());

  // 容器尺寸变化（节点卡片放大 / Modal 全屏切换）时，主动同步 camera.aspect 与 renderer.size，
  // 避免 r3f 内置 ResizeObserver 在某些时序下漏触发，导致渲染区只占容器一角、四周露出 SceneBackdrop 黑底。
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (size.width > 0 && size.height > 0) {
      cam.aspect = size.width / size.height;
      cam.updateProjectionMatrix();
      gl.setSize(size.width, size.height, false);
    }
  }, [camera, gl, size.width, size.height]);

  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;

    if (cam.fov !== fovRef.current) {
      cam.fov = fovRef.current;
      cam.updateProjectionMatrix();
    }

    if (Date.now() < autoRotateUntilRef.current && !isDraggingRef.current) {
      yawTargetRef.current += 0.0035;
    }

    const LERP = 0.18;
    yawCurrentRef.current += (yawTargetRef.current - yawCurrentRef.current) * LERP;
    pitchCurrentRef.current += (pitchTargetRef.current - pitchCurrentRef.current) * LERP;

    const yaw = yawCurrentRef.current;
    const pitch = pitchCurrentRef.current;
    tmpVec.current.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    cam.position.set(0, 0, 0);
    cam.lookAt(tmpVec.current);
  });

  return null;
});

/* ============================== Viewport（可拖拽 3D 视口，可独立使用） ============================== */

export interface PanoramaViewportProps {
  imageUrl: string;
  /** 父容器尺寸稳定后再传 true，确保 r3f 能测到正确尺寸（避免右下黑边） */
  mountReady?: boolean;
  /** 资源占位符 / 加载中显示的内容（imageUrl 为空时显示） */
  placeholder?: React.ReactNode;
  /** 右下显示当前 FOV 数值（小窗内嵌通常用 false 节省空间） */
  showFovHint?: boolean;
  /** 提供后会渲染右上角「全屏」按钮，点击触发回调（一般用来打开 PanoramaViewer Modal） */
  onRequestFullscreen?: () => void;
  /**
   * 投影模式（来自全景节点 properties.projectionMode 或 result.metadata.panoramaProjection）。
   * 缺省时按图像比例兜底推断。
   */
  projectionMode?: PanoramaProjectionMode;
  /** 显式声明展示算法；若给了，就不再按 projectionMode/比例推断。 */
  viewerMode?: PanoramaViewerMode;
  /** 出图比例字符串（"21:9" / "16:9" / "2:1"），帮助比例兜底。 */
  ratioString?: string;
}

/**
 * 纯 3D 视口：拖拽旋转 / 滚轮缩放，所有状态自包含。可嵌入任何尺寸的容器。
 * 节点卡片内嵌、Modal 全屏、Drawer 等场景都复用这同一个组件。
 */
export const PanoramaViewport: React.FC<PanoramaViewportProps> = ({
  imageUrl,
  mountReady = true,
  placeholder,
  showFovHint = true,
  onRequestFullscreen,
  projectionMode,
  viewerMode: viewerModeOverride,
  ratioString,
}) => {
  const yawTargetRef = useRef(0);
  const pitchTargetRef = useRef(0);
  const yawCurrentRef = useRef(0);
  const pitchCurrentRef = useRef(0);
  const fovRef = useRef(FOV_INITIAL);
  const autoRotateUntilRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [, forceFovTick] = useState(0);
  // 纹理加载在 Canvas 外面做（避免 Suspense 抛错），ready 后再喂给 PanoramaSphere
  const textureState = usePanoramaTexture(mountReady ? imageUrl : '');

  // 实际展示算法：override > projectionMode 推断 > 图像比例兜底
  const viewerMode: PanoramaViewerMode = useMemo(() => {
    if (viewerModeOverride) return viewerModeOverride;
    const tex = textureState.texture;
    const img = tex?.image as { width?: number; height?: number } | undefined;
    return resolvePanoramaViewerMode({
      projectionMode,
      width: img?.width,
      height: img?.height,
      ratioString,
    });
  }, [projectionMode, ratioString, textureState.texture, viewerModeOverride]);

  const pitchLimit = useMemo(() => pitchLimitForViewerMode(viewerMode), [viewerMode]);

  // 首次挂载（mountReady 由 false→true）：重置视角 + 启动 2.4s 入场旋转
  useEffect(() => {
    if (mountReady && imageUrl) {
      yawTargetRef.current = 0;
      pitchTargetRef.current = 0;
      yawCurrentRef.current = 0;
      pitchCurrentRef.current = 0;
      fovRef.current = FOV_INITIAL;
      autoRotateUntilRef.current = Date.now() + AUTO_ROTATE_DURATION_MS;
      isDraggingRef.current = false;
      setIsDragging(false);
      lastPointer.current = null;
    }
  }, [mountReady, imageUrl]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    lastPointer.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = true;
    setIsDragging(true);
    autoRotateUntilRef.current = 0;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !lastPointer.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    const sensitivity = (fovRef.current / FOV_INITIAL) * 0.005;
    // flat 模式不允许 yaw 环绕（图本身不连续），改成有限幅 pan
    if (viewerMode === 'flat') {
      yawTargetRef.current = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, yawTargetRef.current - dx * sensitivity));
    } else {
      yawTargetRef.current += -dx * sensitivity;
    }
    const next = pitchTargetRef.current + dy * sensitivity;
    pitchTargetRef.current = Math.max(-pitchLimit, Math.min(pitchLimit, next));
  }, [pitchLimit, viewerMode]);

  const onPointerUp = useCallback(() => {
    lastPointer.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const next = fovRef.current + (e.deltaY > 0 ? 2 : -2);
    fovRef.current = Math.max(FOV_MIN, Math.min(FOV_MAX, next));
    autoRotateUntilRef.current = 0;
    if (showFovHint) forceFovTick((n) => n + 1); // 仅当显示 hint 时才触发 re-render
  }, [showFovHint]);

  return (
    <div
      className={`linghuiPanoramaViewport ${imageUrl ? 'hasImage' : ''} ${isDragging ? 'isDragging' : ''}`}
      onPointerDown={imageUrl ? onPointerDown : undefined}
      onPointerMove={imageUrl ? onPointerMove : undefined}
      onPointerUp={imageUrl ? onPointerUp : undefined}
      onPointerCancel={imageUrl ? onPointerUp : undefined}
      onPointerLeave={imageUrl ? onPointerUp : undefined}
      onWheel={imageUrl ? onWheel : undefined}
    >
      {imageUrl && mountReady && textureState.status === 'ready' && textureState.texture ? (
        <div className="linghuiPanoramaCanvasShell">
          <Canvas
            camera={{ position: [0, 0, 0], fov: FOV_INITIAL, near: 0.1, far: 1000 }}
            dpr={[1, 2]}
            // 节点卡片会随出图比例 / 用户拖动尺寸变化，r3f 默认的 50ms scroll debounce 偶尔会
            // 漏触发；显式关掉 scroll 监听并把 resize debounce 调到 0，让 ResizeObserver 一脏就更新
            resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
            gl={{ antialias: true }}
          >
            <SceneBackdrop />
            <ambientLight intensity={1} />
            <PanoramaGeometry texture={textureState.texture} viewerMode={viewerMode} />
            <CameraRig
              yawTargetRef={yawTargetRef}
              pitchTargetRef={pitchTargetRef}
              yawCurrentRef={yawCurrentRef}
              pitchCurrentRef={pitchCurrentRef}
              fovRef={fovRef}
              autoRotateUntilRef={autoRotateUntilRef}
              isDraggingRef={isDraggingRef}
            />
          </Canvas>
        </div>
      ) : (
        <div className="linghuiPanoramaPlaceholder">
          {!imageUrl
            ? (placeholder ?? '暂无全景图')
            : textureState.status === 'error'
              ? `加载失败：${textureState.error || '未知错误'}`
              : (placeholder ?? '加载中…')}
        </div>
      )}

      {showFovHint && imageUrl && mountReady && textureState.status === 'ready' && (
        <div className="linghuiPanoramaFovHint">
          拖拽旋转 · 滚轮缩放（视野 {Math.round(fovRef.current)}°）
        </div>
      )}

      {/* 全屏入口：只渲染按钮自身，不铺额外的全幅遮罩，避免吃掉拖拽手势 */}
      {onRequestFullscreen && imageUrl && mountReady && textureState.status === 'ready' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRequestFullscreen();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="linghuiPanoramaFullscreenButton"
          title="全屏查看"
        >
          <Maximize2 size={12} />
          全屏
        </button>
      )}
    </div>
  );
};

/* ============================== Modal 包装（全屏预览） ============================== */

interface PanoramaViewerProps {
  open: boolean;
  imageUrl: string;
  title?: string;
  onClose: () => void;
  projectionMode?: PanoramaProjectionMode;
  viewerMode?: PanoramaViewerMode;
  ratioString?: string;
}

export const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
  open,
  imageUrl,
  title,
  onClose,
  projectionMode,
  viewerMode,
  ratioString,
}) => {
  // mountReady 由 antd Modal 的 afterOpenChange 驱动 —— 动画结束后才挂 Canvas，
  // 避免 r3f 用动画中途的小尺寸初始化 GL buffer 导致右下黑边
  const [mountReady, setMountReady] = useState(false);
  const handleAfterOpenChange = useCallback((nextOpen: boolean) => {
    setMountReady((prev) => (prev === nextOpen ? prev : nextOpen));
  }, []);

  return (
    <Modal
      title={title || '全景预览'}
      open={open}
      onCancel={onClose}
      footer={null}
      width="min(96vw, 1600px)"
      destroyOnHidden
      centered
      className="linghuiPanoramaModal"
      rootClassName="linghuiPanoramaModal"
      afterOpenChange={handleAfterOpenChange}
    >
      <div className="linghuiPanoramaModalViewport">
        <PanoramaViewport
          imageUrl={imageUrl}
          mountReady={mountReady}
          projectionMode={projectionMode}
          viewerMode={viewerMode}
          ratioString={ratioString}
        />
      </div>
    </Modal>
  );
};

export default PanoramaViewer;
