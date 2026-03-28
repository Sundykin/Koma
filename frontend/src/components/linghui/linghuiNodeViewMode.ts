import type { LinghuiNodeData, LinghuiNodeViewMode } from '../../types/linghui';

export function resolveLinghuiNodeViewMode(
  value?: LinghuiNodeViewMode | string | null,
): LinghuiNodeViewMode {
  if (value === 'collapsed' || value === 'immersive') {
    return value;
  }
  return 'light';
}

export function getPreferredLinghuiEditorMode(
  nodeData?: Pick<LinghuiNodeData, 'viewMode'> | null,
): Exclude<LinghuiNodeViewMode, 'collapsed'> {
  return resolveLinghuiNodeViewMode(nodeData?.viewMode) === 'immersive' ? 'immersive' : 'light';
}
