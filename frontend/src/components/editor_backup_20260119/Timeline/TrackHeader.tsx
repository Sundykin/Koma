/**
 * 轨道头部组件
 */
import React from 'react';
import { Button, Tooltip } from 'antd';
import {
  LockOutlined,
  UnlockOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  SoundOutlined,
  AudioMutedOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { TrackLine } from '../../../types/track';

interface TrackHeaderProps {
  track: TrackLine;
  selected: boolean;
  onSelect: () => void;
  onToggleMute: () => void;
  onToggleLock: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
}

export function TrackHeader({
  track,
  selected,
  onSelect,
  onToggleMute,
  onToggleLock,
  onToggleVisible,
  onDelete,
}: TrackHeaderProps) {
  const getTrackIcon = () => {
    switch (track.type) {
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'image': return '🖼️';
      case 'text': return '📝';
      default: return '📄';
    }
  };

  return (
    <div
      className={`trackHeader ${selected ? 'selected' : ''} ${track.locked ? 'locked' : ''}`}
      style={{ height: track.height }}
      onClick={onSelect}
    >
      <div className="trackInfo">
        <span className="trackIcon">{getTrackIcon()}</span>
        <span className="trackName">{track.name}</span>
      </div>
      <div className="trackControls">
        {track.type === 'audio' && (
          <Tooltip title={track.muted ? '取消静音' : '静音'}>
            <Button
              type="text"
              size="small"
              icon={track.muted ? <AudioMutedOutlined /> : <SoundOutlined />}
              onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
            />
          </Tooltip>
        )}
        <Tooltip title={track.visible ? '隐藏' : '显示'}>
          <Button
            type="text"
            size="small"
            icon={track.visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            onClick={(e) => { e.stopPropagation(); onToggleVisible(); }}
          />
        </Tooltip>
        <Tooltip title={track.locked ? '解锁' : '锁定'}>
          <Button
            type="text"
            size="small"
            icon={track.locked ? <LockOutlined /> : <UnlockOutlined />}
            onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
          />
        </Tooltip>
        <Tooltip title="删除轨道">
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            danger
          />
        </Tooltip>
      </div>
    </div>
  );
}

export default TrackHeader;
