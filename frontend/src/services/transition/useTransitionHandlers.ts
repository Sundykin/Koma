import { useCallback, useRef } from 'react';
import type { Track } from '../../types/editor';
import type { MessageInstance } from 'antd/es/message/interface';
import { generateId } from '../../utils/generateId';
import { TRANSITION_TYPE_FADE } from './constants';
import {
  DEFAULT_TRANSITION_DURATION,
  getChainAwareMaxDuration,
  getMaxTransitionDuration,
} from './transitionResolver';

interface UseTransitionHandlersParams {
  updateTracks: (updater: (prev: Track[]) => Track[]) => void;
  selectedTransitionId: string | null;
  setSelectedTransitionId: (id: string | null) => void;
  setSelectedClipId: (id: string | null) => void;
  setSelectedKeyframeId: (id: string | null) => void;
  message: MessageInstance;
}

export function useTransitionHandlers({
  updateTracks,
  selectedTransitionId,
  setSelectedTransitionId,
  setSelectedClipId,
  setSelectedKeyframeId,
  message,
}: UseTransitionHandlersParams) {
  const selectedTransitionIdRef = useRef(selectedTransitionId);
  selectedTransitionIdRef.current = selectedTransitionId;

  const handleSelectTransition = useCallback((id: string | null) => {
    setSelectedTransitionId(id);
    setSelectedClipId(null);
    setSelectedKeyframeId(null);
  }, [setSelectedTransitionId, setSelectedClipId, setSelectedKeyframeId]);

  const handleAddTransition = useCallback((trackId: string, fromClipId: string, toClipId: string) => {
    let createdTransitionId: string | null = null;

    updateTracks((prev) =>
      prev.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        const maxDuration = getMaxTransitionDuration(track, fromClipId, toClipId);
        if (maxDuration <= 0) {
          return track;
        }

        createdTransitionId = generateId();
        return {
          ...track,
          transitions: [
            ...(track.transitions ?? []),
            {
              id: createdTransitionId,
              fromClipId,
              toClipId,
              type: TRANSITION_TYPE_FADE,
              duration: Math.min(DEFAULT_TRANSITION_DURATION, maxDuration),
            },
          ],
        };
      })
    );

    if (createdTransitionId) {
      setSelectedTransitionId(createdTransitionId);
      message.success('已添加淡变转场');
    } else {
      message.warning('当前切点不满足添加转场条件');
    }
  }, [message, updateTracks, setSelectedTransitionId]);

  const handleUpdateTransitionDuration = useCallback((
    trackId: string,
    transitionId: string,
    duration: number
  ) => {
    updateTracks((prev) =>
      prev.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        return {
          ...track,
          transitions: (track.transitions ?? []).map((transition) => {
            if (transition.id !== transitionId) {
              return transition;
            }

            const maxDuration = getChainAwareMaxDuration(
              track,
              transition.id
            );

            return {
              ...transition,
              duration: Math.min(Math.max(0.1, duration), maxDuration),
            };
          }),
        };
      })
    );
  }, [updateTracks]);

  const handleDeleteTransition = useCallback((trackId: string, transitionId: string) => {
    updateTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? {
              ...track,
              transitions: (track.transitions ?? []).filter(
                (transition) => transition.id !== transitionId
              ),
            }
          : track
      )
    );
    if (selectedTransitionIdRef.current === transitionId) {
      setSelectedTransitionId(null);
    }
    message.success('已删除转场');
  }, [message, updateTracks, setSelectedTransitionId]);

  return {
    handleSelectTransition,
    handleAddTransition,
    handleUpdateTransitionDuration,
    handleDeleteTransition,
  };
}
