import type { LinghuiDirector3DBackground, LinghuiDirector3DCamera } from '../../../types/linghui';

export function defaultDirector3DCamera(): LinghuiDirector3DCamera {
  return {
    position: [0, 1.55, 4.5],
    target: [0, 1.6, 0],
    fov: 35,
    roll: 0,
    aspectRatio: '16:9',
  };
}

export function defaultDirector3DBackground(): LinghuiDirector3DBackground {
  return {
    mode: 'none',
    color: 'var(--token-bg-app)',
    yawOffset: 0,
  };
}
