import React, { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { LinghuiDirector3DRenderMode, LinghuiDirector3DScene } from '../../../types/linghui';
import { resolvePanoramaViewerMode } from '../panorama/panoramaProjection';
import { buildDirector3DActorGroup, type ExportGeometryContext } from './director3dExportGeometry';
import { resolveDirector3DColor } from './director3dColors';
import { ENV_CLOUDS, GROUND_RADIUS, SKY_RADIUS, getGroundNoiseTexture } from './Director3DEnvironment';
import type { Director3DCaptureOptions, Director3DViewportHandle } from './Director3DViewport';

const UNUSED_WIRE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x000000 });

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


interface CaptureRendererProps {
  scene: LinghuiDirector3DScene;
  texture: THREE.Texture | null;
  cameraStateRef: React.MutableRefObject<LinghuiDirector3DScene['camera']>;
  registerCapture: (fn: Director3DViewportHandle['captureCurrentView']) => void;
}

export const CaptureRenderer: React.FC<CaptureRendererProps> = ({ scene, texture, cameraStateRef, registerCapture }) => {
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
  }, [cameraStateRef, texture]);

  useEffect(() => {
    registerCapture(capture);
  }, [capture, registerCapture]);

  return null;
};
