import type { TransitionType } from '../../types/editor';

export const DEFAULT_TRANSITION_DURATION = 0.3;
export const TRANSITION_TYPE_FADE: TransitionType = 'fade';
export const SUPPORTED_TRANSITION_TYPES: ReadonlySet<TransitionType> = new Set<TransitionType>(['fade']);
