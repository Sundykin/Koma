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
import { Director3DFormation, deriveFormationMembers } from './Director3DFormation';
import { Director3DProp } from './Director3DProp';
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
}

export interface Director3DViewportHandle {
  /** 渲染当前镜头视角并把画面导出为 PNG dataUrl。 */
  captureCurrentView: (options?: Director3DCaptureOptions) => Promise<string | null>;
  /** 返回当前工作台视角对应的相机参数。 */
  getCurrentCamera: () => LinghuiDirector3DScene['camera'];
}

interface Director3DViewportProps {
  scene: LinghuiDirector3DScene;
  selectedActorId?: string | null;
  onActorClick?: (actorId: string) => void;
  onActorMove?: (actorId: string, position: [number, number, number]) => void;
  onCanvasClick?: () => void;
  onCameraChange?: (camera: LinghuiDirector3DScene['camera']) => void;
  /** lineart 渲染模式（影响假人材质 / 背景显隐 / 网格颜色） */
  renderMode?: 'preview' | 'lineart' | 'silhouette';
  className?: string;
}

const PIVOT = new THREE.Vector3(0, 0.8, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

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

function GroundGrid({ visible, lineColor }: { visible: boolean; lineColor: string }) {
  if (!visible) return null;
  return (
    <gridHelper
      args={[24, 24, lineColor, lineColor]}
      position={[0, 0, 0]}
    />
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
  const capture = useCallback(async (options?: Director3DCaptureOptions) => {
    const currentCamera = options?.cameraOverride ?? cameraStateRef.current;
    const width = options?.width ?? 1024;
    const aspectParts = currentCamera.aspectRatio.split(':');
    const ratio = aspectParts.length === 2 ? Number(aspectParts[0]) / Number(aspectParts[1]) : 16 / 9;
    const height = options?.height ?? Math.round(width / ratio);
    const exportMode: LinghuiDirector3DRenderMode = options?.renderMode ?? 'lineart';

    // 临时离屏渲染：用 scene 里的 camera 数据 + 按 exportMode 切换材质风格
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const renderer = new THREE.WebGLRenderer({ canvas: offscreen, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);

    // 不同导出风格的画布背景：
    //  - lineart / composition：白底（线稿习惯）
    //  - silhouette：白底，主体填黑
    //  - depth：白底，主体按距离取灰
    const backdropColor = exportMode === 'silhouette' || exportMode === 'depth' || exportMode === 'composition'
      ? 0xffffff
      : resolveDirector3DColor('var(--token-bg-base)', 'black');
    renderer.setClearColor(backdropColor, 1);

    const offscreenScene = new THREE.Scene();
    offscreenScene.background = new THREE.Color(backdropColor);
    offscreenScene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(3, 6, 4);
    offscreenScene.add(dirLight);

    // 按风格构造主体 mesh 材质：
    //  - lineart / composition：纯白填充 + 黑色 EdgesGeometry 描边
    //  - silhouette：纯黑填充，不画边
    //  - depth：MeshDepthMaterial（远=白 近=黑，便于下游 ControlNet 直接用）
    const fillMat: THREE.Material = exportMode === 'silhouette'
      ? new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })
      : exportMode === 'depth'
        ? new THREE.MeshDepthMaterial({ side: THREE.DoubleSide })
        : new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const wireMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    const drawEdges = exportMode === 'lineart' || exportMode === 'composition';
    const addLineartMesh = (group: THREE.Group, geometry: THREE.BufferGeometry, offset: [number, number, number] = [0, 0, 0]) => {
      const mesh = new THREE.Mesh(geometry, fillMat);
      mesh.position.set(offset[0], offset[1], offset[2]);
      group.add(mesh);
      if (drawEdges) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), wireMat);
        edges.position.copy(mesh.position);
        group.add(edges);
      }
    };

    for (const actor of scene.actors) {
      const group = new THREE.Group();
      group.position.fromArray(actor.position);
      group.rotation.y = actor.rotationY;
      group.scale.setScalar(actor.scale);

      if (actor.type === 'mannequin') {
        addLineartMesh(group, new THREE.BoxGeometry(0.36, 0.6, 0.2), [0, 0.86 + 0.3, 0]);
        addLineartMesh(group, new THREE.SphereGeometry(0.12, 24, 18), [0, 0.86 + 0.6 + 0.16, 0]);
        const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 12);
        [-1, 1].forEach((sign) => {
          addLineartMesh(group, armGeo, [sign * 0.21, 0.86 + 0.3 - 0.04 - 0.275, 0]);
        });
        const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.86, 12);
        [-1, 1].forEach((sign) => {
          addLineartMesh(group, legGeo, [sign * 0.13, 0.86 - 0.43, 0]);
        });
      } else if (actor.type === 'mannequin-lite') {
        // 低级群演单兵：头 + 锥形躯干 + 两臂 + 两腿（与 Director3DLiteMannequin 几何一致）
        const torsoTop = 0.18;
        const torsoBot = 0.13;
        const torsoHeight = 0.55;
        const armRadius = 0.045;
        const armLength = 0.5;
        const legRadius = 0.07;
        const legLength = 0.75;
        const headRadius = 0.11;
        const torsoCenter = legLength + torsoHeight / 2;
        const shoulderY = legLength + torsoHeight - 0.06;
        const headCenter = shoulderY + headRadius + 0.04;
        const shoulderX = 0.18 + armRadius * 0.6;
        const hipX = 0.13 - legRadius * 0.2;
        addLineartMesh(group, new THREE.CylinderGeometry(torsoTop, torsoBot, torsoHeight, 14), [0, torsoCenter, 0]);
        addLineartMesh(group, new THREE.SphereGeometry(headRadius, 16, 12), [0, headCenter, 0]);
        [-1, 1].forEach((sign) => {
          addLineartMesh(group, new THREE.CylinderGeometry(armRadius, armRadius, armLength, 10), [sign * shoulderX, shoulderY - armLength / 2, 0]);
        });
        [-1, 1].forEach((sign) => {
          addLineartMesh(group, new THREE.CylinderGeometry(legRadius, legRadius, legLength, 10), [sign * hipX, legLength / 2, 0]);
        });
      } else if (actor.type === 'formation' && actor.formation) {
        // 方阵线稿：每个成员画"头 + 锥形躯干 + 两腿"，无手臂保持低多边
        const torsoTop = 0.16;
        const torsoBot = 0.12;
        const torsoHeight = 0.50;
        const legRadius = 0.065;
        const legLength = 0.70;
        const headRadius = 0.10;
        const torsoCenter = legLength + torsoHeight / 2;
        const shoulderY = legLength + torsoHeight - 0.05;
        const headCenter = shoulderY + headRadius + 0.03;
        const hipX = 0.11 - legRadius * 0.2;
        const members = deriveFormationMembers(actor.formation);
        for (const member of members) {
          const memberGroup = new THREE.Group();
          memberGroup.position.set(member.x, 0, member.z);
          memberGroup.rotation.y = member.rotationY;
          addLineartMesh(memberGroup, new THREE.CylinderGeometry(torsoTop, torsoBot, torsoHeight, 12), [0, torsoCenter, 0]);
          addLineartMesh(memberGroup, new THREE.SphereGeometry(headRadius, 14, 10), [0, headCenter, 0]);
          [-1, 1].forEach((sign) => {
            addLineartMesh(memberGroup, new THREE.CylinderGeometry(legRadius, legRadius, legLength, 10), [sign * hipX, legLength / 2, 0]);
          });
          group.add(memberGroup);
        }
      } else if (actor.type === 'prop-box') {
        addLineartMesh(group, new THREE.BoxGeometry(0.9, 0.8, 0.6), [0, 0.4, 0]);
      } else if (actor.type === 'prop-cylinder') {
        addLineartMesh(group, new THREE.CylinderGeometry(0.35, 0.35, 0.9, 24), [0, 0.45, 0]);
      } else if (actor.type === 'prop-plane') {
        addLineartMesh(group, new THREE.BoxGeometry(1.6, 2, 0.05), [0, 1, 0]);
      } else if (actor.type === 'prop-camera') {
        addLineartMesh(group, new THREE.BoxGeometry(0.4, 0.3, 0.55), [0, 0.5, 0]);
        const lens = new THREE.CylinderGeometry(0.12, 0.16, 0.25, 18);
        lens.rotateX(Math.PI / 2);
        addLineartMesh(group, lens, [0, 0.5, 0.4]);
      } else if (actor.type === 'prop-arrow') {
        const shaft = new THREE.CylinderGeometry(0.05, 0.05, 1, 12);
        shaft.rotateX(Math.PI / 2);
        addLineartMesh(group, shaft, [0, 0.1, 0.5]);
        const head = new THREE.ConeGeometry(0.16, 0.32, 18);
        head.rotateX(Math.PI / 2);
        addLineartMesh(group, head, [0, 0.1, 1.1]);
      }

      offscreenScene.add(group);
    }

    // 地面线稿：仅在 lineart 模式下保留浅色网格；silhouette / depth / composition 不画地面
    if (exportMode === 'lineart') {
      const gridHelper = new THREE.GridHelper(24, 24, 0x404040, 0x808080);
      offscreenScene.add(gridHelper);
    }

    if (scene.background.mode === 'panorama' && texture && exportMode === 'lineart') {
      const aspect = (texture.image && (texture.image as { width: number }).width)
        ? (texture.image as { width: number; height: number }).width / (texture.image as { height: number }).height
        : 21 / 9;
      const viewerMode = resolvePanoramaViewerMode({
        projectionMode: scene.background.projectionMode,
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
    renderer.dispose();
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
  onActorDragStart?: () => void;
  onActorDragEnd?: () => void;
}

interface ActorDragSession {
  id: string;
  pointerId: number;
  planeY: number;
  offset: THREE.Vector3;
  lastPosition: [number, number, number] | null;
}

const ActorDragLayer: React.FC<ActorDragLayerProps> = ({
  actors,
  selectedActorId,
  renderMode,
  onActorPress,
  onActorMove,
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
    if (session.lastPosition) {
      onActorMove?.(session.id, session.lastPosition);
    }
    onActorDragEnd?.();
  }, [onActorDragEnd, onActorMove]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      event.preventDefault();
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
  }, [endDrag, getPlaneHit]);

  useEffect(() => {
    if (!dragPreview || dragSessionRef.current?.id === dragPreview.id) return;
    const actor = actors.find(item => item.id === dragPreview.id);
    if (actor && samePosition(actor.position, dragPreview.position)) {
      setDragPreview(null);
    }
  }, [actors, dragPreview]);

  const handleActorPointerDown = useCallback((actor: LinghuiDirector3DActor, event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    event.nativeEvent.stopPropagation();

    const nativeEvent = event.nativeEvent;
    const planeY = actor.position[1];
    const actorPosition = new THREE.Vector3().fromArray(actor.position);
    const hit = getPlaneHit(nativeEvent.clientX, nativeEvent.clientY, planeY);

    dragSessionRef.current = {
      id: actor.id,
      pointerId: nativeEvent.pointerId,
      planeY,
      offset: hit ? actorPosition.sub(hit) : new THREE.Vector3(),
      lastPosition: null,
    };
    onActorPress?.(actor.id);
    onActorDragStart?.();
  }, [getPlaneHit, onActorDragStart, onActorPress]);

  return (
    <>
      {actors.map((actor) => {
        const renderActor = dragPreview?.id === actor.id
          ? { ...actor, position: dragPreview.position }
          : actor;
        const shared = {
          key: actor.id,
          actor: renderActor,
          selected: actor.id === selectedActorId,
          renderMode,
          onPointerDown: (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => handleActorPointerDown(actor, event),
        };
        if (actor.type === 'mannequin') {
          return <Director3DMannequin {...shared} />;
        }
        if (actor.type === 'mannequin-lite') {
          return <Director3DLiteMannequin {...shared} />;
        }
        if (actor.type === 'formation') {
          return <Director3DFormation {...shared} />;
        }
        return <Director3DProp {...shared} />;
      })}
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
      onCanvasClick,
      onCameraChange,
      renderMode = 'preview',
      className,
    },
    ref,
  ) {
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
      getCurrentCamera: () => cameraStateRef.current,
    }), []);

    useEffect(() => {
      const orbit = resolveOrbitCameraState(scene.camera);
      yawTargetRef.current = orbit.yaw;
      pitchTargetRef.current = orbit.pitch;
      distanceRef.current = orbit.distance;
      panOffsetRef.current.copy(orbit.pan);
      cameraStateRef.current = scene.camera;
    }, [scene.camera]);

    const commitCurrentCamera = useCallback(() => {
      const currentCamera = buildCameraFromOrbit(
        yawTargetRef.current,
        pitchTargetRef.current,
        distanceRef.current,
        panOffsetRef.current,
        scene.camera,
      );
      cameraStateRef.current = currentCamera;
      onCameraChange?.(currentCamera);
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
          <GroundGrid visible={scene.render.showGrid} lineColor={lineColor} />

          {/* 原点指示 */}
          <axesHelper args={[1.2]} position={[0, 0.01, 0]} />

          <ActorDragLayer
            actors={scene.actors}
            selectedActorId={selectedActorId}
            renderMode={renderMode}
            onActorPress={handleActorPress}
            onActorMove={onActorMove}
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
