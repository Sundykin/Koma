import type {
  LinghuiDirector3DNodeProperties,
  LinghuiDirector3DRenderMode,
  LinghuiDirector3DScene,
} from '../../../../types/linghui';
import { createDefaultDirector3DScene } from '../../director3d/director3dScene';

export type Director3DSelectionKind = 'actor' | null;

export interface Director3DSelection {
  kind: Director3DSelectionKind;
  actorId?: string;
}

export function normalizeDirector3DAngleRadians(value: number): number {
  let next = value;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

export const DIRECTOR3D_RENDER_MODE_LABELS: Record<LinghuiDirector3DRenderMode, string> = {
  preview: '彩色',
  lineart: '线稿',
  silhouette: '剪影',
  depth: '深度',
  composition: '构图',
};

export function resolveDirector3DScene(
  properties: Record<string, unknown> | undefined,
): LinghuiDirector3DScene {
  const raw = (properties as Partial<LinghuiDirector3DNodeProperties> | undefined)?.scene;
  if (!raw || typeof raw !== 'object') return createDefaultDirector3DScene();
  const scene = raw as LinghuiDirector3DScene;
  if (scene.timeline && Array.isArray(scene.timeline.keyframes)) {
    const needsMigration = scene.timeline.keyframes.some(k => !k.scope);
    if (needsMigration) {
      return {
        ...scene,
        timeline: {
          ...scene.timeline,
          keyframes: scene.timeline.keyframes.map(k => (k.scope ? k : { ...k, scope: 'scene' as const })),
        },
      };
    }
  }
  return scene;
}
