import React from 'react';
import type { Clip, Track } from '../../types/editor';
import type { ResolvedClipWindow } from './transitionResolver';
import {
  DEFAULT_TRANSITION_DURATION,
  findTransitionByClipPair,
  getChainAwareMaxDuration,
  getMaxTransitionDuration,
  getSortedTrackClips,
} from './transitionResolver';

interface TransitionOverlayProps {
  track: Track;
  resolvedClipWindows: Map<string, ResolvedClipWindow>;
  pixelsPerSecond: number;
  selectedTransitionId: string | null;
  onSelectTransition?: (id: string | null) => void;
  onAddTransition?: (trackId: string, fromClipId: string, toClipId: string) => void;
  onUpdateTransitionDuration?: (trackId: string, transitionId: string, duration: number) => void;
  onDeleteTransition?: (trackId: string, transitionId: string) => void;
}

export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({
  track,
  resolvedClipWindows,
  pixelsPerSecond,
  selectedTransitionId,
  onSelectTransition,
  onAddTransition,
  onUpdateTransitionDuration,
  onDeleteTransition,
}) => {
  const sortedClips = getSortedTrackClips(track);

  return (
    <>
      {sortedClips.slice(1).map((toClip, clipIndex) => {
        const fromClip = sortedClips[clipIndex];
        const transition = findTransitionByClipPair(track, fromClip.id, toClip.id);
        const maxDuration = getMaxTransitionDuration(track, fromClip.id, toClip.id);
        const chainMaxDuration = transition
          ? getChainAwareMaxDuration(track, transition.id)
          : maxDuration;
        const fromWindow = resolvedClipWindows.get(fromClip.id);
        const cutPointTime = fromWindow?.resolvedEnd ?? toClip.start;

        return (
          <div
            key={`transition-${fromClip.id}-${toClip.id}`}
            className="absolute top-1 z-20 -translate-x-1/2"
            style={{ left: cutPointTime * pixelsPerSecond }}
          >
            {transition ? (
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectTransition?.(
                      selectedTransitionId === transition.id ? null : transition.id
                    );
                  }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium shadow ${
                    selectedTransitionId === transition.id
                      ? 'bg-cyan-500 text-black'
                      : 'bg-zinc-800/90 text-cyan-200 hover:bg-zinc-700'
                  }`}
                  title="编辑转场"
                >
                  淡变 {transition.duration.toFixed(1)}s
                </button>
                {selectedTransitionId === transition.id && (
                  <div className="flex items-center gap-1 rounded-full bg-black/85 px-1 py-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onUpdateTransitionDuration?.(
                          track.id,
                          transition.id,
                          Math.max(0.1, transition.duration - 0.1)
                        );
                      }}
                      className="rounded bg-zinc-700 px-1 text-[10px] text-white hover:bg-zinc-600"
                      title="缩短转场"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onUpdateTransitionDuration?.(
                          track.id,
                          transition.id,
                          Math.min(chainMaxDuration, transition.duration + 0.1)
                        );
                      }}
                      className="rounded bg-zinc-700 px-1 text-[10px] text-white hover:bg-zinc-600"
                      title="延长转场"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteTransition?.(track.id, transition.id);
                      }}
                      className="rounded bg-red-600 px-1 text-[10px] text-white hover:bg-red-500"
                      title="删除转场"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ) : (
              maxDuration > 0 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddTransition?.(track.id, fromClip.id, toClip.id);
                  }}
                  className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-cyan-600 hover:text-white"
                  title={`添加淡变（默认 ${DEFAULT_TRANSITION_DURATION.toFixed(1)}s）`}
                >
                  + 转场
                </button>
              )
            )}
          </div>
        );
      })}
    </>
  );
};
