import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { LinghuiMultiAngleMode } from '../../../../types/linghui';
import { useTheme } from '../../../../theme/runtime';

interface MultiAngle3DViewportProps {
  imageUrl?: string;
  mode: LinghuiMultiAngleMode;
  rotation: number;
  tilt: number;
  scale: number;
  isWideAngle: boolean;
  onRotationTiltChange: (rotation: number, tilt: number) => void;
  onScaleChange: (scale: number) => void;
}

interface PreviewColors {
  accent: string;
  shellColor: string;
  gridColor: string;
  cameraBody: string;
  cameraLens: string;
  rayColor: string;
  subjectBackColor: string;
  ambientColor: string;
  fallbackTopColor: string;
  fallbackMidColor: string;
  fallbackBottomColor: string;
}

function normalizeUnsigned(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizeSigned(value: number): number {
  const next = normalizeUnsigned(value);
  return next > 180 ? next - 360 : next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scaleToZoom(scale: number): number {
  return clamp(Math.round((clamp(scale, 0, 100) / 100) * 6), 0, 6);
}

function makeFallbackTexture(colors: PreviewColors): THREE.CanvasTexture {
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

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  subject: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  subjectBack: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  subjectGroup: THREE.Group;
  shell: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  grid: THREE.Group;
  cameraMarker: THREE.Group;
  cameraRay: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  fallbackTexture: THREE.CanvasTexture;
}

export const LinghuiMultiAngle3DViewport: React.FC<MultiAngle3DViewportProps> = ({
  imageUrl,
  rotation,
  tilt,
  scale,
  isWideAngle,
  onRotationTiltChange,
  onScaleChange,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRefs = useRef<SceneRefs | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const frameRef = useRef<number>(0);
  const propsRef = useRef({ rotation, tilt, scale, isWideAngle });
  propsRef.current = { rotation, tilt, scale, isWideAngle };
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; rotation: number; tilt: number } | null>(null);
  const { theme } = useTheme();
  const colors = useMemo<PreviewColors>(() => ({
    accent: theme.tokens.status.info,
    shellColor: theme.tokens.bg.elevated,
    gridColor: theme.tokens.text.tertiary,
    cameraBody: theme.tokens.text.secondary,
    cameraLens: theme.tokens.text.tertiary,
    rayColor: theme.tokens.text.secondary,
    subjectBackColor: theme.tokens.bg.app,
    ambientColor: theme.tokens.accent.onAccent,
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
    const maxWidth = 0.9;
    const maxHeight = 1.14;
    const width = aspect >= maxWidth / maxHeight ? maxWidth : maxHeight * aspect;
    const height = aspect >= maxWidth / maxHeight ? maxWidth / aspect : maxHeight;
    refs.subject.scale.set(width, height, 1);
    refs.subjectBack.scale.set(width + 0.06, height + 0.06, 1);
  }, []);

  const updateTransforms = useCallback(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const { rotation: rot, tilt: tlt, scale: scl } = propsRef.current;
    const zoom = scaleToZoom(scl);
    refs.subjectGroup.scale.setScalar(1.12 - zoom * 0.045);

    const cameraPoint = spherePoint(rot, tlt, 1.42);
    refs.cameraMarker.position.copy(cameraPoint);
    refs.cameraMarker.lookAt(0, 0, 0.08);

    refs.cameraRay.geometry.setFromPoints([new THREE.Vector3(0, 0, 0.12), cameraPoint]);
  }, []);

  const renderLoop = useCallback(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.renderer.render(refs.scene, refs.camera);
    frameRef.current = window.requestAnimationFrame(renderLoop);
  }, []);

  // Setup scene once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'linghuiMultiAngle3DViewport__canvas';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.1, 5.05);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.42));
    const keyLight = new THREE.DirectionalLight(colorsRef.current.ambientColor, 1);
    keyLight.position.set(2.8, 1.8, 3.2);
    scene.add(keyLight);

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

    const cameraMarker = new THREE.Group();
    const cameraBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.13, 0.1),
      new THREE.MeshBasicMaterial({ color: colorsRef.current.cameraBody, transparent: true, opacity: 0.94 }),
    );
    const cameraLens = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.055, 0.12),
      new THREE.MeshBasicMaterial({ color: colorsRef.current.cameraLens, transparent: true, opacity: 0.96 }),
    );
    cameraLens.position.set(0, 0, 0.08);
    cameraMarker.add(cameraBody, cameraLens);
    cameraMarker.renderOrder = 6;
    scene.add(cameraMarker);

    const cameraRay = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]),
      new THREE.LineBasicMaterial({
        color: colorsRef.current.rayColor,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    cameraRay.renderOrder = 4;
    scene.add(cameraRay);

    sceneRefs.current = {
      renderer,
      scene,
      camera,
      subject,
      subjectBack,
      subjectGroup,
      shell,
      grid,
      cameraMarker,
      cameraRay,
      fallbackTexture,
    };

    const resizeObserver = new ResizeObserver(() => {
      const refs = sceneRefs.current;
      if (!refs || disposed) return;
      const width = Math.max(1, Math.round(host.clientWidth));
      const height = Math.max(1, Math.round(host.clientHeight));
      refs.renderer.setSize(width, height, false);
      refs.camera.aspect = width / height;
      refs.camera.fov = propsRef.current.isWideAngle ? 30 : 38;
      refs.camera.position.set(0, 0.1, propsRef.current.isWideAngle ? 5.75 : 5.05);
      refs.camera.lookAt(0, 0, 0);
      refs.camera.updateProjectionMatrix();
    });
    resizeObserver.observe(host);

    updateSubjectFit(fallbackTexture);
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
  }, [renderLoop, updateSubjectFit, updateTransforms]);

  // Apply theme-derived color updates without rebuilding the scene.
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
    refs.cameraRay.material.color.set(colors.rayColor);
    refs.cameraMarker.children.forEach((child, index) => {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      if (mesh.material?.color) {
        mesh.material.color.set(index === 0 ? colors.cameraBody : colors.cameraLens);
      }
    });
  }, [colors]);

  // Load texture when imageUrl changes.
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

  // Sync transforms whenever the angles change.
  useEffect(() => {
    updateTransforms();
  }, [rotation, tilt, scale, isWideAngle, updateTransforms]);

  // Sync camera FOV / position for wide-angle mode.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.camera.fov = isWideAngle ? 30 : 38;
    refs.camera.position.set(0, 0.1, isWideAngle ? 5.75 : 5.05);
    refs.camera.lookAt(0, 0, 0);
    refs.camera.updateProjectionMatrix();
  }, [isWideAngle]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, rotation, tilt };
    setIsDragging(true);
  }, [rotation, tilt]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - drag.x) / Math.max(1, rect.width)) * 100;
    const dy = ((event.clientY - drag.y) / Math.max(1, rect.height)) * 100;
    const nextRotation = normalizeUnsigned(drag.rotation + dx * 1.08);
    const nextTilt = clamp(drag.tilt - dy * 0.9, -85, 85);
    onRotationTiltChange(nextRotation, nextTilt);
  }, [onRotationTiltChange]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const step = 100 / 6;
    const next = clamp(scale + (event.deltaY > 0 ? -step : step), 0, 100);
    onScaleChange(next);
  }, [onScaleChange, scale]);

  const nudge = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (direction === 'up') {
      onRotationTiltChange(rotation, clamp(tilt + 15, -85, 85));
    } else if (direction === 'down') {
      onRotationTiltChange(rotation, clamp(tilt - 15, -85, 85));
    } else if (direction === 'left') {
      onRotationTiltChange(normalizeUnsigned(rotation - 15), tilt);
    } else {
      onRotationTiltChange(normalizeUnsigned(rotation + 15), tilt);
    }
  }, [onRotationTiltChange, rotation, tilt]);

  const stopButtonBubble = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return (
    <>
      <div
        ref={hostRef}
        className={`linghuiMultiAngle3DViewport ${isDragging ? 'isDragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={handleWheel}
        role="presentation"
      />
      <button
        className="tcPanoramicEditor__dir tcPanoramicEditor__dir--up"
        type="button"
        aria-label="向上调整俯仰"
        onPointerDown={stopButtonBubble}
        onClick={() => nudge('up')}
      >
        <ChevronUp size={11} />
      </button>
      <button
        className="tcPanoramicEditor__dir tcPanoramicEditor__dir--down"
        type="button"
        aria-label="向下调整俯仰"
        onPointerDown={stopButtonBubble}
        onClick={() => nudge('down')}
      >
        <ChevronDown size={11} />
      </button>
      <button
        className="tcPanoramicEditor__dir tcPanoramicEditor__dir--left"
        type="button"
        aria-label="向左环绕"
        onPointerDown={stopButtonBubble}
        onClick={() => nudge('left')}
      >
        <ChevronLeft size={11} />
      </button>
      <button
        className="tcPanoramicEditor__dir tcPanoramicEditor__dir--right"
        type="button"
        aria-label="向右环绕"
        onPointerDown={stopButtonBubble}
        onClick={() => nudge('right')}
      >
        <ChevronRight size={11} />
      </button>
    </>
  );
};
