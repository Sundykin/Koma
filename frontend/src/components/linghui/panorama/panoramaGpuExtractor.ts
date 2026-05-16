import * as THREE from 'three';
import { safeFetch } from '../../../utils/safeFetch';
import type { LinghuiPanoramaProjectionMode } from '../../../types/linghui';
import type { ExtractPerspectiveOptions, ExtractPerspectiveResult } from './panoramaPerspectiveExtractor';

const GPU_SPHERE_RADIUS = 50;
const GPU_BAND_THETA_START = Math.PI * 0.2;
const GPU_BAND_THETA_LENGTH = Math.PI * 0.6;
const GPU_SCENE_BG_COLOR = 0x1a2530;

async function loadTexture(src: string): Promise<{ texture: THREE.Texture; revoke?: () => void }> {
  let objectUrl: string | null = null;
  const finalUrl = await (async () => {
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const response = await safeFetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      return objectUrl;
    }
    return src;
  })();

  const texture = await new Promise<THREE.Texture>((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(finalUrl, resolve, undefined, reject);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return {
    texture,
    revoke: objectUrl ? () => URL.revokeObjectURL(objectUrl) : undefined,
  };
}

function createProjectionMesh(texture: THREE.Texture, mode: LinghuiPanoramaProjectionMode): THREE.Mesh {
  if (mode === 'flat-wide') {
    const image = texture.image as { width?: number; height?: number } | undefined;
    const aspect = image?.width && image?.height ? image.width / image.height : 16 / 9;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(60 * aspect, 60),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
    );
  }

  const geometry = mode === 'equirectangular-2to1'
    ? new THREE.SphereGeometry(GPU_SPHERE_RADIUS, 96, 48)
    : new THREE.SphereGeometry(GPU_SPHERE_RADIUS, 96, 48, 0, Math.PI * 2, GPU_BAND_THETA_START, GPU_BAND_THETA_LENGTH);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, toneMapped: false }),
  );
  mesh.scale.set(-1, 1, 1);
  return mesh;
}

function lookDirection(yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
}

export async function extractPerspectiveViewGpu(
  panoramaSrc: string,
  options: ExtractPerspectiveOptions,
): Promise<ExtractPerspectiveResult> {
  const { yaw, pitch, fovDeg, width, height, projectionMode } = options;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GPU_SCENE_BG_COLOR);
  const camera = new THREE.PerspectiveCamera(fovDeg, width / height, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(lookDirection(yaw, pitch));
  camera.updateProjectionMatrix();

  let loaded: Awaited<ReturnType<typeof loadTexture>> | null = null;
  try {
    loaded = await loadTexture(panoramaSrc);
    const mesh = createProjectionMesh(loaded.texture, projectionMode);
    if (projectionMode === 'flat-wide') {
      mesh.position.set(0, 0, -GPU_SPHERE_RADIUS * 0.6);
    }
    scene.add(mesh);
    renderer.render(scene, camera);
    return { dataUrl: canvas.toDataURL('image/png'), width, height };
  } finally {
    scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach(item => item.dispose());
      } else if (material) {
        material.dispose();
      }
    });
    loaded?.texture.dispose();
    loaded?.revoke?.();
    renderer.dispose();
  }
}
