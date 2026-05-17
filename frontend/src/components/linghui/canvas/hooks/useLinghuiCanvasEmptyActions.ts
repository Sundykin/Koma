import { useLinghuiCanvasAudioEmptyAction } from './useLinghuiCanvasAudioEmptyAction';
import { useLinghuiCanvasTextEmptyAction } from './useLinghuiCanvasTextEmptyAction';
import { useLinghuiCanvasVideoEmptyAction } from './useLinghuiCanvasVideoEmptyAction';
import type { UseLinghuiCanvasEmptyActionParams } from './linghuiCanvasEmptyActionShared';

/** LibTV TextNode EmptyState 4 actions: each action either edits current text or derives a subgraph. */
export type LinghuiTextEmptyAction = 'edit' | 'video' | 'image-prompt' | 'music';

/** LibTV VideoNode EmptyState 2 actions. */
export type LinghuiVideoEmptyAction = 'first-frame' | 'first-last-frame';

/** LibTV AudioNode EmptyState 1 action. */
export type LinghuiAudioEmptyAction = 'audio-to-video';

export function useLinghuiCanvasEmptyActions(params: UseLinghuiCanvasEmptyActionParams) {
  return {
    applyTextEmptyAction: useLinghuiCanvasTextEmptyAction(params),
    applyVideoEmptyAction: useLinghuiCanvasVideoEmptyAction(params),
    applyAudioEmptyAction: useLinghuiCanvasAudioEmptyAction(params),
  };
}
