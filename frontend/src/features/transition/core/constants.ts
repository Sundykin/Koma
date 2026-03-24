import type { TransitionType } from '../../../types/editor';

export const DEFAULT_TRANSITION_DURATION = 0.5;
export const MAX_TRANSITION_DURATION = 2.0;
export const MIN_VISIBLE_DURATION = 0.1;
export const TRANSITION_TYPE_FADE: TransitionType = 'fade';
export const SUPPORTED_TRANSITION_TYPES: ReadonlySet<TransitionType> = new Set<TransitionType>(['fade']);
