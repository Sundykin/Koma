import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { safeFetch } from '../../../../utils/safeFetch';

export interface PanoramaTextureState {
  texture: THREE.Texture | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
}

export function usePanoramaTexture(imageUrl: string): PanoramaTextureState {
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
          if (cancelled) { tex.dispose(); return; }
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
        () => {
          if (cancelled) return;
          setState({ texture: null, status: 'error', error: '纹理加载失败' });
        },
      );
    };

    const isLocalish = imageUrl.startsWith('koma-local://') || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:');

    if (isLocalish) {
      buildTextureFrom(imageUrl);
    } else {
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
