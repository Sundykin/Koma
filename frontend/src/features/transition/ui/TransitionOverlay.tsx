import React, { useMemo } from 'react';
import type { Track, Transition } from '../../../types/editor';
import type { ResolvedClipWindow } from '../core/types';
import { MIN_VISIBLE_DURATION, DEFAULT_TRANSITION_DURATION, MAX_TRANSITION_DURATION } from '../core/constants';
import {
  findTransitionByClipPair,
  getAddableTransitionDuration,
  getChainAwareMaxDuration,
  getMaxTransitionDuration,
  getSortedTrackClips,
  normalizeTrackTransitions,
} from '../core/transitionResolver';

interface TransitionOverlayProps {
  track: Track;
  resolvedClipWindows: Map<string, ResolvedClipWindow>;
  pixelsPerSecond: number;
  selectedTransitionId: string | null;
  invalidTransitions?: Transition[];
  isDragging?: boolean;
  onSelectTransition?: (id: string | null) => void;
  onAddTransition?: (trackId: string, fromClipId: string, toClipId: string) => void;
  onUpdateTransitionDuration?: (trackId: string, transitionId: string, duration: number) => void;
  onDeleteTransition?: (trackId: string, transitionId: string) => void;
}

export const TransitionOverlay: React.FC<TransitionOverlayProps> = React.memo(({
  track,
  resolvedClipWindows,
  pixelsPerSecond,
  selectedTransitionId,
  invalidTransitions,
  isDragging = false,
  onSelectTransition,
  onAddTransition,
  onUpdateTransitionDuration,
  onDeleteTransition,
}) => {
  const sortedClips = getSortedTrackClips(track);
  const normalizedTrack = useMemo(() => normalizeTrackTransitions(track), [track]);

  const chainMaxDurations = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of normalizedTrack.transitions ?? []) {
      map.set(t.id, getChainAwareMaxDuration(normalizedTrack, t.id));
    }
    return map;
  }, [normalizedTrack]);

  const invalidIds = useMemo(
    () => new Set((invalidTransitions ?? []).map((transition) => transition.id)),
    [invalidTransitions],
  );

  return (
    <>
      {sortedClips.slice(1).map((toClip, clipIndex) => {
        const fromClip = sortedClips[clipIndex];
        const explicitTransition = findTransitionByClipPair(track, fromClip.id, toClip.id);
        const normalizedTransition = findTransitionByClipPair(normalizedTrack, fromClip.id, toClip.id);
        const transition = explicitTransition ?? normalizedTransition;
        const isInvalid = transition ? invalidIds.has(transition.id) : false;
        const addableDuration = getAddableTransitionDuration(normalizedTrack, fromClip.id, toClip.id);
        const maxDuration = getMaxTransitionDuration(normalizedTrack, fromClip.id, toClip.id);
        const chainMaxDuration = transition
          ? (chainMaxDurations.get(transition.id) ?? maxDuration)
          : maxDuration;
        const sliderMin = Math.min(MIN_VISIBLE_DURATION, chainMaxDuration);
        const sliderMax = Math.min(MAX_TRANSITION_DURATION, Math.max(chainMaxDuration, sliderMin));
        const fromWindow = resolvedClipWindows.get(fromClip.id);
        const toWindow = resolvedClipWindows.get(toClip.id);
        const cutPointTime = fromWindow?.resolvedEnd ?? toClip.start;

        return (
          <div
            key={`transition-${fromClip.id}-${toClip.id}`}
            className="absolute top-1 z-20 -translate-x-1/2"
            style={{ left: cutPointTime * pixelsPerSecond }}
          >
            {transition ? (
              <div className="relative flex flex-col items-center gap-1">
                {!isInvalid && (() => {
                  const transitionStartTime = toWindow?.resolvedStart ?? (cutPointTime - transition.duration);
                  return (
                    <div
                      className="absolute top-0 h-full border-x border-cyan-400/40 bg-cyan-400/12 pointer-events-none"
                      style={{
                        left: (transitionStartTime - cutPointTime) * pixelsPerSecond,
                        width: transition.duration * pixelsPerSecond,
                        minWidth: 2,
                      }}
                    />
                  );
                })()}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!isInvalid) {
                      onSelectTransition?.(
                        selectedTransitionId === transition.id ? null : transition.id,
                      );
                    }
                  }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium shadow ${
                    isInvalid
                      ? isDragging
                        ? 'border border-orange-500/50 bg-orange-500/20 text-orange-300 opacity-60 pointer-events-none transition-colors duration-200 delay-200'
                        : 'border border-orange-500/45 bg-orange-500/15 text-orange-200 pointer-events-none transition-colors duration-200'
                      : selectedTransitionId === transition.id
                        ? 'bg-cyan-500 text-black'
                        : 'bg-zinc-800/90 text-cyan-200 hover:bg-zinc-700'
                  }`}
                  title={isInvalid ? '失效转场' : '编辑转场'}
                >
                  {isInvalid ? `⚠ 无效 ${transition.duration.toFixed(1)}s` : `淡变 ${transition.duration.toFixed(1)}s`}
                </button>
                {selectedTransitionId === transition.id && !isInvalid && (() => {
                  const computedWidth = chainMaxDuration * pixelsPerSecond * 0.8;
                  const useButtons = computedWidth < 60;

                  return (
                    <div className="flex items-center gap-1 rounded-full bg-black/85 px-2 py-1">
                      {useButtons ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newDuration = Math.max(sliderMin, transition.duration - 0.1);
                              onUpdateTransitionDuration?.(track.id, transition.id, newDuration);
                            }}
                            className="rounded bg-zinc-700 px-1 text-[10px] text-white hover:bg-zinc-600"
                            title="减少 0.1s"
                          >
                            −
                          </button>
                          <span className="min-w-[2rem] text-center text-[10px] text-zinc-400">
                            {transition.duration.toFixed(1)}s
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newDuration = Math.min(sliderMax, transition.duration + 0.1);
                              onUpdateTransitionDuration?.(track.id, transition.id, newDuration);
                            }}
                            className="rounded bg-zinc-700 px-1 text-[10px] text-white hover:bg-zinc-600"
                            title="增加 0.1s"
                          >
                            +
                          </button>
                        </>
                      ) : (
                        <>
                          <input
                            type="range"
                            min={sliderMin}
                            max={sliderMax}
                            step={0.1}
                            value={transition.duration}
                            onChange={(e) => {
                              e.stopPropagation();
                              onUpdateTransitionDuration?.(track.id, transition.id, Number(e.target.value));
                            }}
                            className="h-1 w-16 accent-cyan-500"
                            title={`转场时长: ${transition.duration.toFixed(1)}s`}
                          />
                          <span className="min-w-[2rem] text-center text-[10px] text-zinc-400">
                            {transition.duration.toFixed(1)}s
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTransition?.(track.id, transition.id);
                        }}
                        className="rounded bg-red-600 px-1 text-[10px] text-white hover:bg-red-500"
                        title="删除转场"
                      >
                        ×
                      </button>
                    </div>
                  );
                })()}
              </div>
            ) : (
              addableDuration > 0 && (
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
});

TransitionOverlay.displayName = 'TransitionOverlay';
