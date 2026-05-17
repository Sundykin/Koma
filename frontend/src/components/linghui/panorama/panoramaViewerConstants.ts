import type { PanoramaViewerMode } from './panoramaProjection';

export const SPHERE_RADIUS = 50;
export const SPHERE_BAND_THETA_START = Math.PI * 0.2;
export const SPHERE_BAND_THETA_LENGTH = Math.PI * 0.6;
export const SPHERE_FULL_THETA_START = 0;
export const SPHERE_FULL_THETA_LENGTH = Math.PI;
export const CYLINDER_RADIUS = SPHERE_RADIUS;

export const PITCH_LIMIT_BAND = (Math.PI / 180) * 30;
export const PITCH_LIMIT_SPHERE_BAND = (Math.PI / 180) * 50;
export const PITCH_LIMIT_FULL = (Math.PI / 180) * 75;

export const FOV_INITIAL = 75;
export const FOV_MIN = 35;
export const FOV_MAX = 100;
export const AUTO_ROTATE_DURATION_MS = 2400;
export const SCENE_BG_COLOR = 0x1a2530;

export function pitchLimitForViewerMode(mode: PanoramaViewerMode): number {
  if (mode === 'equirect-sphere') return PITCH_LIMIT_FULL;
  if (mode === 'sphere-band') return PITCH_LIMIT_SPHERE_BAND;
  if (mode === 'cylinder-band') return PITCH_LIMIT_BAND;
  return 0;
}
