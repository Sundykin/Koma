import type { Track, Transition, TransitionType } from '../../../types/editor';

export interface ResolvedClipWindow {
  clipId: string;
  trackId: string;
  resolvedStart: number;
  resolvedEnd: number;
}

export interface NormalizedTransitionPlan {
  transitionId: string;
  trackId: string;
  fromClipId: string;
  toClipId: string;
  type: TransitionType;
  duration: number;
  cutPointTime: number;
  activeStartTime: number;
  activeEndTime: number;
  exportVideoOffset: number;
  exportAudioOverlap: number;
  maxDuration: number;
}

export interface ResolvedTrackTimeline {
  track: Track;
  clipWindows: ResolvedClipWindow[];
  transitionPlans: NormalizedTransitionPlan[];
  duration: number;
  invalidTransitions: Transition[];
  clampedIds: Set<string>;
}
