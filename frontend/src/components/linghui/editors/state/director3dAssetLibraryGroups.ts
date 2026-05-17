import {
  DIRECTOR3D_PROP_LIBRARY,
  type Director3DPropCategory,
  type Director3DPropPreset,
} from '../../director3d/director3dScene';

export const DIRECTOR3D_PROP_CATEGORY_ORDER: Director3DPropCategory[] = ['basic', 'furniture', 'vehicle', 'nature', 'gear'];

export function groupDirector3DPropsByCategory(): Record<Director3DPropCategory, Director3DPropPreset[]> {
  return DIRECTOR3D_PROP_LIBRARY.reduce((acc, preset) => {
    acc[preset.category] = acc[preset.category] || [];
    acc[preset.category].push(preset);
    return acc;
  }, {} as Record<Director3DPropCategory, Director3DPropPreset[]>);
}
