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
  LinghuiDirector3DScene,
} from '../../../types/linghui';
import { Director3DMannequin } from './Director3DMannequin';
import { resolvePanoramaViewerMode } from '../panorama/panoramaProjection';
import { safeFetch } from '../../../utils/safeFetch';
import { resolveDirector3DColor } from './director3dColors';

export interface Director3DViewportHandle {
  /** 渲染当前镜头视角并把画面导出为 PNG dataUrl。 */
  captureCurrentView: (options?: { width?: number; height?: number }) => Promise<string | null>;
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
  const capture = useCallback(async (options?: { width?: number; height?: number }) => {
    const currentCamera = cameraStateRef.current;
    const width = options?.width ?? 1024;
    const aspectParts = currentCamera.aspectRatio.split(':');
    const ratio = aspectParts.length === 2 ? Number(aspectParts[0]) / Number(aspectParts[1]) : 16 / 9;
    const height = options?.height ?? Math.round(width / ratio);

    // 临时离屏渲染：用 scene 里的 camera 数据 + lineart 材质
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const renderer = new THREE.WebGLRenderer({ canvas: offscreen, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(resolveDirector3DColor('var(--token-bg-base)', 'black'), 1);

    const offscreenScene = new THREE.Scene();
    offscreenScene.background = new THREE.Color(resolveDirector3DColor('var(--token-bg-base)', 'black'));
    offscreenScene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(3, 6, 4);
    offscreenScene.add(dirLight);

    // 导出场景里画线稿：边缘描边（EdgesGeometry）+ 纯白填充
    for (const actor of scene.actors) {
      const group = new THREE.Group();
      group.position.fromArray(actor.position);
      group.rotation.y = actor.rotationY;
      group.scale.setScalar(actor.scale);
      // 简化：导出时也用与预览一致的几何，但材质换成线稿
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const wireMat = new THREE.LineBasicMaterial({ color: 0x000000 });
      const torsoGeo = new THREE.BoxGeometry(0.36, 0.6, 0.2);
      const torso = new THREE.Mesh(torsoGeo, mat);
      torso.position.y = 0.86 + 0.3;
      const torsoEdges = new THREE.LineSegments(new THREE.EdgesGeometry(torsoGeo), wireMat);
      torsoEdges.position.copy(torso.position);
      group.add(torso);
      group.add(torsoEdges);

      const headGeo = new THREE.SphereGeometry(0.12, 24, 18);
      const head = new THREE.Mesh(headGeo, mat);
      head.position.y = 0.86 + 0.6 + 0.16;
      const headEdges = new THREE.LineSegments(new THREE.EdgesGeometry(headGeo), wireMat);
      headEdges.position.copy(head.position);
      group.add(head);
      group.add(headEdges);

      const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 12);
      [-1, 1].forEach((sign) => {
        const arm = new THREE.Mesh(armGeo, mat);
        arm.position.set(sign * 0.21, 0.86 + 0.3 - 0.04 - 0.275, 0);
        const armEdges = new THREE.LineSegments(new THREE.EdgesGeometry(armGeo), wireMat);
        armEdges.position.copy(arm.position);
        group.add(arm);
        group.add(armEdges);
      });
      const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.86, 12);
      [-1, 1].forEach((sign) => {
        const leg = new THREE.Mesh(legGeo, mat);
        leg.position.set(sign * 0.13, 0.86 - 0.43, 0);
        const legEdges = new THREE.LineSegments(new THREE.EdgesGeometry(legGeo), wireMat);
        legEdges.position.copy(leg.position);
        group.add(leg);
        group.add(legEdges);
      });
      offscreenScene.add(group);
    }

    // 地面线稿
    const gridHelper = new THREE.GridHelper(24, 24, 0x404040, 0x202020);
    offscreenScene.add(gridHelper);

    if (scene.background.mode === 'panorama' && texture) {
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

    const cam = new THREE.PerspectiveCamera(currentCamera.fov, ratio, 0.05, 200);
    cam.position.fromArray(currentCamera.position);
    cam.lookAt(new THREE.Vector3().fromArray(currentCamera.target));

    renderer.render(offscreenScene, cam);
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
        return (
          <Director3DMannequin
            key={actor.id}
            actor={renderActor}
            selected={actor.id === selectedActorId}
            renderMode={renderMode}
            onPointerDown={(event) => handleActorPointerDown(actor, event)}
          />
        );
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
