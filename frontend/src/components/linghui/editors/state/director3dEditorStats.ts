import type { LinghuiDirector3DActor } from '../../../../types/linghui';

export interface Director3DEditorStats {
  mannequins: number;
  liteMannequins: number;
  formations: number;
  formationMembers: number;
  props: number;
}

export function resolveDirector3DEditorStats(actors: LinghuiDirector3DActor[]): Director3DEditorStats {
  const mannequins = actors.filter(actor => actor.type === 'mannequin').length;
  const liteMannequins = actors.filter(actor => actor.type === 'mannequin-lite').length;
  const formationActors = actors.filter(actor => actor.type === 'formation');
  const formations = formationActors.length;
  const formationMembers = formationActors.reduce((sum, actor) => {
    const cfg = actor.formation;
    if (!cfg) return sum;
    return sum + Math.max(1, Math.round(cfg.rows)) * Math.max(1, Math.round(cfg.cols));
  }, 0);
  const props = actors.length - mannequins - liteMannequins - formations;
  return { mannequins, liteMannequins, formations, formationMembers, props };
}
