import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { LinghuiRelightDirection } from '../../../../types/linghui';
import { useTheme } from '../../../../theme/runtime';

export type LightingPreviewMode = 'perspective' | 'front';
export type LightingDragTarget = 'main' | 'fill';

export interface LinghuiLightingSpherePreviewProps {
  imageUrl?: string;
  /** 主光位的命名方向（preset 选择写入），作为缺省的 azimuth/elevation 来源。 */
  direction: LinghuiRelightDirection;
  brightness: number;
  lightColor: string;
  rimLight: boolean;
  /** 主光位的显式连续角度（优先于 direction 派生）。 */
  mainAzimuthDeg?: number;
  mainElevationDeg?: number;
  /** 轮廓光（fill）显式角度。 */
  fillAzimuthDeg?: number;
  fillElevationDeg?: number;
  /** 预览相机模式：透视 / 正面。 */
  previewMode?: LightingPreviewMode;
  /** 球面 drag 时持续抛出连续角度（对齐 electron-egg 的 updatePreviewDrag）。 */
  onAnglesChange?: (target: LightingDragTarget, azimuthDeg: number, elevationDeg: number) => void;
  /** 切换透视/正面（如果父组件持久化）。 */
  onPreviewModeChange?: (mode: LightingPreviewMode) => void;
}

interface LightingColors {
  shellColor: string;
  gridColor: string;
  subjectBackColor: string;
  ambientColor: string;
  beamColor: string;
  rimColor: string;
  fallbackTopColor: string;
  fallbackMidColor: string;
  fallbackBottomColor: string;
}

interface LightDirectionVector {
  azimuthDeg: number;
  elevationDeg: number;
}

const LIGHT_DIRECTION_TABLE: Record<LinghuiRelightDirection, LightDirectionVector> = {
  front: { azimuthDeg: 0, elevationDeg: 8 },
  'front-right': { azimuthDeg: 45, elevationDeg: 8 },
  right: { azimuthDeg: 90, elevationDeg: 12 },
  'back-right': { azimuthDeg: 135, elevationDeg: 8 },
  back: { azimuthDeg: 180, elevationDeg: 8 },
  'back-left': { azimuthDeg: 225, elevationDeg: 8 },
  left: { azimuthDeg: 270, elevationDeg: 12 },
  'front-left': { azimuthDeg: 315, elevationDeg: 8 },
  'high-front': { azimuthDeg: 0, elevationDeg: 42 },
  'high-front-right': { azimuthDeg: 45, elevationDeg: 42 },
  'high-right': { azimuthDeg: 90, elevationDeg: 42 },
  'high-back-right': { azimuthDeg: 135, elevationDeg: 42 },
  'high-back': { azimuthDeg: 180, elevationDeg: 42 },
  'high-back-left': { azimuthDeg: 225, elevationDeg: 42 },
  'high-left': { azimuthDeg: 270, elevationDeg: 42 },
  'high-front-left': { azimuthDeg: 315, elevationDeg: 42 },
  'low-front': { azimuthDeg: 0, elevationDeg: -30 },
  'low-front-right': { azimuthDeg: 45, elevationDeg: -30 },
  'low-right': { azimuthDeg: 90, elevationDeg: -30 },
  'low-back-right': { azimuthDeg: 135, elevationDeg: -30 },
  'low-back': { azimuthDeg: 180, elevationDeg: -30 },
  'low-back-left': { azimuthDeg: 225, elevationDeg: -30 },
  'low-left': { azimuthDeg: 270, elevationDeg: -30 },
  'low-front-left': { azimuthDeg: 315, elevationDeg: -30 },
  top: { azimuthDeg: 0, elevationDeg: 75 },
  bottom: { azimuthDeg: 0, elevationDeg: -55 },
};

const FILL_DEFAULT: LightDirectionVector = { azimuthDeg: 315, elevationDeg: 10 };

function normalizeUnsigned(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizeSigned(value: number): number {
  const normalized = normalizeUnsigned(value);
  return normalized > 180 ? normalized - 360 : normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function spherePoint(azimuthDeg: number, elevationDeg: number, radius: number): THREE.Vector3 {
  const azimuth = (normalizeSigned(azimuthDeg) * Math.PI) / 180;
  const elevation = (clamp(elevationDeg, -85, 85) * Math.PI) / 180;
  return new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elevation) * radius,
    Math.sin(elevation) * radius,
    Math.cos(azimuth) * Math.cos(elevation) * radius * 0.42,
  );
}

function buildSphereGrid(color: string): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
  });
  const radius = 1.48;
  const segments = 96;

  const addLoop = (points: THREE.Vector3[]) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.LineLoop(geometry, material);
    line.renderOrder = 1;
    group.add(line);
  };

  for (const lat of [-60, -35, -15, 0, 15, 35, 60]) {
    const y = Math.sin((lat * Math.PI) / 180) * radius;
    const ringRadius = Math.cos((lat * Math.PI) / 180) * radius;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < segments; i += 1) {
      const t = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(t) * ringRadius, y, Math.sin(t) * ringRadius * 0.42));
    }
    addLoop(points);
  }

  for (const lon of [0, 30, 60, 90, 120, 150]) {
    const lonRad = (lon * Math.PI) / 180;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < segments; i += 1) {
      const t = (i / segments) * Math.PI * 2;
      const x = Math.sin(lonRad) * Math.cos(t) * radius;
      const z = Math.cos(lonRad) * Math.cos(t) * radius * 0.42;
      const y = Math.sin(t) * radius;
      points.push(new THREE.Vector3(x, y, z));
    }
    addLoop(points);
  }
  return group;
}

function makeLightPyramidGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3));
  return geometry;
}

function getSubjectCorners(
  subject: THREE.Mesh<THREE.PlaneGeometry, THREE.Material>,
  expand = 1.04,
): THREE.Vector3[] {
  subject.updateWorldMatrix(true, false);
  const half = 0.5 * expand;
  return [
    subject.localToWorld(new THREE.Vector3(-half, half, 0.012)),
    subject.localToWorld(new THREE.Vector3(half, half, 0.012)),
    subject.localToWorld(new THREE.Vector3(half, -half, 0.012)),
    subject.localToWorld(new THREE.Vector3(-half, -half, 0.012)),
  ];
}

function makeFallbackTexture(colors: LightingColors): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 256, 320);
    gradient.addColorStop(0, colors.fallbackTopColor);
    gradient.addColorStop(0.5, colors.fallbackMidColor);
    gradient.addColorStop(1, colors.fallbackBottomColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 320);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colors.ambientColor;
    ctx.fillRect(28, 28, 200, 116);
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = colors.subjectBackColor;
    ctx.fillRect(48, 174, 160, 96);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  subject: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  subjectBack: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  subjectGroup: THREE.Group;
  shell: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  grid: THREE.Group;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  lightMarker: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  fillMarker: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  beam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  fillBeam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  fallbackTexture: THREE.CanvasTexture;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startAzimuth: number;
  startElevation: number;
  target: LightingDragTarget;
  rect: DOMRect;
}

function isDomTestEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

function effectiveMain(props: LinghuiLightingSpherePreviewProps): LightDirectionVector {
  const fallback = LIGHT_DIRECTION_TABLE[props.direction] ?? LIGHT_DIRECTION_TABLE.front;
  return {
    azimuthDeg: typeof props.mainAzimuthDeg === 'number' ? props.mainAzimuthDeg : fallback.azimuthDeg,
    elevationDeg: typeof props.mainElevationDeg === 'number' ? props.mainElevationDeg : fallback.elevationDeg,
  };
}

function effectiveFill(props: LinghuiLightingSpherePreviewProps): LightDirectionVector {
  return {
    azimuthDeg: typeof props.fillAzimuthDeg === 'number' ? props.fillAzimuthDeg : FILL_DEFAULT.azimuthDeg,
    elevationDeg: typeof props.fillElevationDeg === 'number' ? props.fillElevationDeg : FILL_DEFAULT.elevationDeg,
  };
}

function pointerToPercent(rect: DOMRect, clientX: number, clientY: number): { x: number; y: number } {
  return {
    x: clamp(((clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100),
    y: clamp(((clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100),
  };
}

function markerScreenPercent(azimuthDeg: number, elevationDeg: number): { x: number; y: number } {
  // 与 electron-egg `computeMarker` 同源公式，用于 drag 起点判定主/轮廓光命中
  const orbit = normalizeSigned(azimuthDeg);
  const x = 50 + Math.sin((orbit * Math.PI) / 180) * 28;
  const y = 50 - elevationDeg * 0.48 - Math.cos((orbit * Math.PI) / 180) * 5;
  return { x: clamp(x, 10, 90), y: clamp(y, 10, 90) };
}

function distancePercent(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const LinghuiLightingSpherePreview: React.FC<LinghuiLightingSpherePreviewProps> = (props) => {
  const {
    imageUrl,
    rimLight: _rimLight,
    previewMode,
    onAnglesChange,
    onPreviewModeChange,
  } = props;
  const [localPreviewMode, setLocalPreviewMode] = useState<LightingPreviewMode>(previewMode ?? 'perspective');
  const activePreviewMode = previewMode ?? localPreviewMode;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRefs = useRef<SceneRefs | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const frameRef = useRef<number>(0);
  const dragRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTarget, setActiveTarget] = useState<LightingDragTarget>('main');

  const propsRef = useRef(props);
  propsRef.current = props;
  const previewModeRef = useRef(activePreviewMode);
  previewModeRef.current = activePreviewMode;

  const { theme } = useTheme();
  const colors = useMemo<LightingColors>(() => ({
    shellColor: theme.tokens.bg.elevated,
    gridColor: theme.tokens.text.tertiary,
    subjectBackColor: theme.tokens.bg.app,
    ambientColor: theme.tokens.accent.onAccent,
    beamColor: theme.tokens.accent.onAccent,
    rimColor: theme.tokens.status.info,
    fallbackTopColor: theme.tokens.text.tertiary,
    fallbackMidColor: theme.tokens.bg.elevated,
    fallbackBottomColor: theme.tokens.bg.app,
  }), [theme]);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const updateSubjectFit = useCallback((texture: THREE.Texture | null) => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const image = texture?.image as { width?: number; height?: number } | undefined;
    const aspect = image?.width && image?.height ? image.width / image.height : 0.78;
    const maxWidth = 0.74;
    const maxHeight = 1.02;
    const width = aspect >= maxWidth / maxHeight ? maxWidth : maxHeight * aspect;
    const height = aspect >= maxWidth / maxHeight ? maxWidth / aspect : maxHeight;
    refs.subject.scale.set(width, height, 1);
    refs.subjectBack.scale.set(width + 0.06, height + 0.06, 1);
  }, []);

  const updateLightBeam = useCallback((
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
    lightPoint: THREE.Vector3,
    intensity: number,
    opacityBase: number,
  ) => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const corners = getSubjectCorners(refs.subject, 1.04);
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!position || corners.length !== 4) return;
    const apex = lightPoint.clone().multiplyScalar(0.96);
    const facePairs: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]];
    let cursor = 0;
    for (const [from, to] of facePairs) {
      position.setXYZ(cursor, apex.x, apex.y, apex.z);
      cursor += 1;
      position.setXYZ(cursor, corners[from].x, corners[from].y, corners[from].z);
      cursor += 1;
      position.setXYZ(cursor, corners[to].x, corners[to].y, corners[to].z);
      cursor += 1;
    }
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.material.opacity = opacityBase + Math.min(0.18, Math.max(0, intensity) / 520);
  }, []);

  const updateTransforms = useCallback(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const main = effectiveMain(propsRef.current);
    const fill = effectiveFill(propsRef.current);
    const front = previewModeRef.current === 'front';

    refs.keyLight.color.set(propsRef.current.lightColor);
    refs.keyLight.intensity = 0.25 + Math.max(0, propsRef.current.brightness) / 68;
    const mainPoint = spherePoint(main.azimuthDeg, main.elevationDeg, 1.39);
    refs.keyLight.position.set(mainPoint.x * 2.3, mainPoint.y * 2.3, 2.8 + mainPoint.z * 1.5);

    refs.lightMarker.position.copy(mainPoint);
    refs.lightMarker.material.color.set(propsRef.current.lightColor);
    refs.lightMarker.material.opacity = activeTarget === 'main' ? 0.98 : 0.62;
    refs.lightMarker.scale.setScalar((activeTarget === 'main' ? 1.12 : 0.88) + Math.max(0, propsRef.current.brightness) / 180);

    updateLightBeam(refs.beam, mainPoint, propsRef.current.brightness, 0.12);
    refs.beam.material.color.set(propsRef.current.lightColor);

    const fillPoint = spherePoint(fill.azimuthDeg, fill.elevationDeg, 1.34);
    refs.fillLight.color.set(propsRef.current.lightColor);
    refs.fillLight.intensity = propsRef.current.rimLight ? 0.62 : 0;
    refs.fillLight.position.set(fillPoint.x * 2.3, fillPoint.y * 2.3, 2.8 + fillPoint.z * 1.5);
    refs.fillLight.visible = propsRef.current.rimLight;

    refs.fillMarker.position.copy(fillPoint);
    refs.fillMarker.material.color.set(colorsRef.current.rimColor);
    refs.fillMarker.material.opacity = propsRef.current.rimLight ? (activeTarget === 'fill' ? 0.96 : 0.58) : 0;
    refs.fillMarker.visible = propsRef.current.rimLight;
    refs.fillMarker.scale.setScalar((activeTarget === 'fill' ? 1.05 : 0.82) + (propsRef.current.rimLight ? 32 : 0) / 220);

    updateLightBeam(refs.fillBeam, fillPoint, propsRef.current.rimLight ? 32 : 0, 0.07);
    refs.fillBeam.material.color.set(colorsRef.current.rimColor);
    refs.fillBeam.visible = propsRef.current.rimLight;

    refs.subjectGroup.rotation.y = front ? 0 : -0.06;
    refs.subjectGroup.rotation.x = front ? 0 : -0.025;
    refs.subjectGroup.scale.setScalar(1);
  }, [activeTarget, updateLightBeam]);

  const updateCameraView = useCallback(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const front = previewModeRef.current === 'front';
    refs.camera.fov = front ? 30 : 38;
    refs.camera.position.set(0, front ? 0 : 0.1, front ? 5.75 : 5.05);
    refs.camera.lookAt(0, 0, 0);
    refs.camera.updateProjectionMatrix();
  }, []);

  const renderLoop = useCallback(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.renderer.render(refs.scene, refs.camera);
    frameRef.current = window.requestAnimationFrame(renderLoop);
  }, []);

  // Scene init / teardown.
  useEffect(() => {
    if (isDomTestEnvironment()) return;
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'linghuiLightingSphereCanvas__canvas';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

    const ambient = new THREE.AmbientLight(0xffffff, 1.42);
    const keyLight = new THREE.DirectionalLight(colorsRef.current.ambientColor, 1);
    keyLight.position.set(2.8, 1.8, 3.2);
    const fillLight = new THREE.DirectionalLight(colorsRef.current.ambientColor, 0.26);
    fillLight.position.set(-2.2, 0.9, 2.8);
    scene.add(ambient, keyLight, fillLight);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 64, 32),
      new THREE.MeshBasicMaterial({
        color: colorsRef.current.shellColor,
        transparent: true,
        opacity: 0.34,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    shell.renderOrder = 0;
    scene.add(shell);

    const grid = buildSphereGrid(colorsRef.current.gridColor);
    scene.add(grid);

    const subjectGroup = new THREE.Group();
    scene.add(subjectGroup);

    const fallbackTexture = makeFallbackTexture(colorsRef.current);

    const subjectBack = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: colorsRef.current.subjectBackColor,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    subjectBack.position.set(0, 0, 0.085);
    subjectBack.renderOrder = 2;
    subjectGroup.add(subjectBack);

    const subject = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({
        map: fallbackTexture,
        roughness: 0.48,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    );
    subject.position.set(0, 0, 0.11);
    subject.renderOrder = 3;
    subjectGroup.add(subject);

    const beam = new THREE.Mesh(
      makeLightPyramidGeometry(),
      new THREE.MeshBasicMaterial({
        color: colorsRef.current.beamColor,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.renderOrder = 4;
    scene.add(beam);

    const fillBeam = new THREE.Mesh(
      makeLightPyramidGeometry(),
      new THREE.MeshBasicMaterial({
        color: colorsRef.current.rimColor,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    fillBeam.renderOrder = 4;
    scene.add(fillBeam);

    const lightMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 24, 16),
      new THREE.MeshBasicMaterial({
        color: colorsRef.current.beamColor,
        transparent: true,
        opacity: 0.95,
      }),
    );
    lightMarker.renderOrder = 5;
    scene.add(lightMarker);

    const fillMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 24, 16),
      new THREE.MeshBasicMaterial({
        color: colorsRef.current.rimColor,
        transparent: true,
        opacity: 0.86,
      }),
    );
    fillMarker.renderOrder = 5;
    scene.add(fillMarker);

    sceneRefs.current = {
      renderer,
      scene,
      camera,
      subject,
      subjectBack,
      subjectGroup,
      shell,
      grid,
      keyLight,
      fillLight,
      lightMarker,
      fillMarker,
      beam,
      fillBeam,
      fallbackTexture,
    };

    const resizeObserver = new ResizeObserver(() => {
      if (!sceneRefs.current || disposed) return;
      const width = Math.max(1, Math.round(host.clientWidth));
      const height = Math.max(1, Math.round(host.clientHeight));
      sceneRefs.current.renderer.setSize(width, height, false);
      sceneRefs.current.camera.aspect = width / height;
      updateCameraView();
    });
    resizeObserver.observe(host);

    updateSubjectFit(fallbackTexture);
    updateCameraView();
    updateTransforms();
    frameRef.current = window.requestAnimationFrame(renderLoop);

    return () => {
      disposed = true;
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      resizeObserver.disconnect();
      textureRef.current?.dispose();
      textureRef.current = null;
      const refs = sceneRefs.current;
      if (refs) {
        refs.fallbackTexture.dispose();
        refs.scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose?.();
          const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) {
            material.forEach(entry => entry.dispose?.());
          } else {
            material?.dispose?.();
          }
        });
        refs.renderer.dispose();
        refs.renderer.domElement.remove();
      }
      sceneRefs.current = null;
    };
  }, [renderLoop, updateCameraView, updateSubjectFit, updateTransforms]);

  // Theme color refresh.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.shell.material.color.set(colors.shellColor);
    refs.grid.traverse(object => {
      const line = object as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
      if (line.material && (line.material as THREE.LineBasicMaterial).color) {
        (line.material as THREE.LineBasicMaterial).color.set(colors.gridColor);
      }
    });
    refs.subjectBack.material.color.set(colors.subjectBackColor);
  }, [colors]);

  // Texture load.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    if (!imageUrl) {
      refs.subject.material.map = refs.fallbackTexture;
      refs.subject.material.needsUpdate = true;
      updateSubjectFit(refs.fallbackTexture);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.loadAsync(imageUrl).then((texture) => {
      if (cancelled || !sceneRefs.current) return;
      textureRef.current?.dispose();
      textureRef.current = texture;
      texture.colorSpace = THREE.SRGBColorSpace;
      const maxAnisotropy = sceneRefs.current.renderer.capabilities.getMaxAnisotropy?.() ?? 1;
      texture.anisotropy = Math.min(maxAnisotropy, 8);
      sceneRefs.current.subject.material.map = texture;
      sceneRefs.current.subject.material.needsUpdate = true;
      updateSubjectFit(texture);
    }).catch(() => {
      if (!sceneRefs.current) return;
      sceneRefs.current.subject.material.map = sceneRefs.current.fallbackTexture;
      sceneRefs.current.subject.material.needsUpdate = true;
      updateSubjectFit(sceneRefs.current.fallbackTexture);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, updateSubjectFit]);

  // Sync sources when controls change.
  useEffect(() => {
    updateTransforms();
  }, [
    props.direction,
    props.brightness,
    props.lightColor,
    props.rimLight,
    props.mainAzimuthDeg,
    props.mainElevationDeg,
    props.fillAzimuthDeg,
    props.fillElevationDeg,
    activePreviewMode,
    activeTarget,
    updateTransforms,
  ]);

  useEffect(() => {
    updateCameraView();
  }, [activePreviewMode, updateCameraView]);

  const resolveDragTarget = useCallback((rect: DOMRect, clientX: number, clientY: number): LightingDragTarget => {
    if (!propsRef.current.rimLight) return 'main';
    const point = pointerToPercent(rect, clientX, clientY);
    const main = effectiveMain(propsRef.current);
    const fill = effectiveFill(propsRef.current);
    const mainDist = distancePercent(markerScreenPercent(main.azimuthDeg, main.elevationDeg), point);
    const fillDist = distancePercent(markerScreenPercent(fill.azimuthDeg, fill.elevationDeg), point);
    if (fillDist <= mainDist + 14) return 'fill';
    if (mainDist <= 18) return 'main';
    return activeTarget;
  }, [activeTarget]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const host = event.currentTarget;
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    host.setPointerCapture(event.pointerId);
    const target = resolveDragTarget(rect, event.clientX, event.clientY);
    const seed = target === 'fill' ? effectiveFill(propsRef.current) : effectiveMain(propsRef.current);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startAzimuth: seed.azimuthDeg,
      startElevation: seed.elevationDeg,
      target,
      rect,
    };
    setIsDragging(true);
    setActiveTarget(target);
  }, [resolveDragTarget]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = drag.rect;
    const dx = ((event.clientX - drag.startX) / Math.max(1, rect.width)) * 100;
    const dy = ((event.clientY - drag.startY) / Math.max(1, rect.height)) * 100;
    const nextAzimuth = normalizeUnsigned(drag.startAzimuth + dx * 3.2);
    const nextElevation = clamp(drag.startElevation - dy * 1.05, -45, 60);
    onAnglesChange?.(drag.target, nextAzimuth, nextElevation);
  }, [onAnglesChange]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
  }, []);

  const handlePreviewModeChange = useCallback((mode: LightingPreviewMode) => {
    setLocalPreviewMode(mode);
    onPreviewModeChange?.(mode);
  }, [onPreviewModeChange]);

  return (
    <div className="tcLightingToolbarSphere">
      <div className="tcLightingToolbarSphere__tabs" role="tablist" aria-label="打光预览模式">
        <button
          type="button"
          className={activePreviewMode === 'perspective' ? 'isActive' : ''}
          onClick={() => handlePreviewModeChange('perspective')}
        >
          透视
        </button>
        <button
          type="button"
          className={activePreviewMode === 'front' ? 'isActive' : ''}
          onClick={() => handlePreviewModeChange('front')}
        >
          正面
        </button>
      </div>
      <div
        ref={hostRef}
        className={`tcLightingToolbarSphere__stage ${activePreviewMode === 'front' ? 'isFront' : ''} ${isDragging ? 'isDragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        {isDomTestEnvironment() && <canvas aria-label="打光光球预览" />}
      </div>
    </div>
  );
};
