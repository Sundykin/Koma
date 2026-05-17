import React from 'react';
import { Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import {
  AudioWaveform,
  Captions,
  ChevronDown,
  ScanLine,
  Scissors,
  Sparkles,
} from 'lucide-react';
import type { LinghuiVideoToolKey } from '../../../../types/linghui';
import { VIDEO_TOOL_PRESETS } from '../state/videoNodeEditorShared';

export const VIDEO_TOOLBAR_ITEMS: Array<{ key: LinghuiVideoToolKey; label: string }> = [
  { key: 'clip', label: '剪辑' },
  { key: 'upscale', label: '高清' },
  { key: 'analyze', label: '解析' },
  { key: 'subtitle-remove', label: '智能去字幕' },
  { key: 'audio-separation', label: '音频分离' },
];

interface LinghuiNodeEditorVideoToolbarProps {
  nodeId: string;
  activeVideoTool: LinghuiVideoToolKey | null;
  message: MessageInstance;
  onToolChange: (tool: LinghuiVideoToolKey | null) => void;
  onSeparateVideoAudio?: (nodeId: string) => void;
  resolveDropdownContainer: (triggerNode: HTMLElement) => HTMLElement;
}

/**
 * 视频工具条 LibTV 风：剪辑 / 高清 / 解析 / 智能去字幕 / 音频分离（音视频分离 + 人声分离>仅人声/仅背景音）。
 * 严格不暴露假按钮：未接入服务的入口走 disabled + tooltip 解释。
 */
export const LinghuiNodeEditorVideoToolbar: React.FC<LinghuiNodeEditorVideoToolbarProps> = ({
  nodeId,
  activeVideoTool,
  message,
  onToolChange,
  onSeparateVideoAudio,
  resolveDropdownContainer,
}) => {
  const activateTool = (tool: LinghuiVideoToolKey) => {
    onToolChange(activeVideoTool === tool ? null : tool);
  };

  const handleSubtitleRemove = () => {
    message.info('智能去字幕需要云端 AI 服务，暂未在本地接入。');
  };

  const handleAudioVideoSplit = () => {
    if (onSeparateVideoAudio) {
      onSeparateVideoAudio(nodeId);
    } else {
      message.error('音频分离能力当前不可用，请检查工作区状态');
    }
  };

  const audioSeparationMenu: MenuProps['items'] = [
    {
      key: 'audio-vocal-separation',
      label: '人声分离',
      children: [
        {
          key: 'audio-vocal-only',
          label: '仅保留人声',
          disabled: true,
        },
        {
          key: 'audio-bgm-only',
          label: '仅保留背景音',
          disabled: true,
        },
      ],
    },
    {
      key: 'audio-av-split',
      label: '音视频分离',
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        handleAudioVideoSplit();
      },
    },
  ];

  return (
    <div className="linghuiNodeEditorToolRail isLibTVVideo">
      <Tooltip title={VIDEO_TOOL_PRESETS.clip.description}>
        <button
          type="button"
          className={`linghuiNodeEditorToolButton ${activeVideoTool === 'clip' ? 'isActive' : ''}`}
          onClick={() => activateTool('clip')}
        >
          <Scissors size={14} className="linghuiNodeEditorToolButtonIcon" />
          <span>剪辑</span>
        </button>
      </Tooltip>

      <Tooltip title={VIDEO_TOOL_PRESETS.upscale.description}>
        <button
          type="button"
          className={`linghuiNodeEditorToolButton ${activeVideoTool === 'upscale' ? 'isActive' : ''}`}
          onClick={() => activateTool('upscale')}
        >
          <span className="linghuiNodeEditorToolButtonBadge">HD</span>
          <span>高清</span>
        </button>
      </Tooltip>

      <Tooltip title={VIDEO_TOOL_PRESETS.analyze.description}>
        <button
          type="button"
          className={`linghuiNodeEditorToolButton ${activeVideoTool === 'analyze' ? 'isActive' : ''}`}
          onClick={() => activateTool('analyze')}
        >
          <ScanLine size={14} className="linghuiNodeEditorToolButtonIcon" />
          <span>解析</span>
        </button>
      </Tooltip>

      <Tooltip title={VIDEO_TOOL_PRESETS['subtitle-remove'].description}>
        <button
          type="button"
          className="linghuiNodeEditorToolButton isPlaceholder"
          onClick={handleSubtitleRemove}
          disabled
        >
          <Captions size={14} className="linghuiNodeEditorToolButtonIcon" />
          <span>智能去字幕</span>
          <Sparkles size={12} className="linghuiNodeEditorToolButtonHintIcon" />
        </button>
      </Tooltip>

      <Dropdown
        trigger={['click']}
        classNames={{ root: 'linghuiNodeEditorDropdownMenu' }}
        getPopupContainer={resolveDropdownContainer}
        menu={{ items: audioSeparationMenu }}
      >
        <button
          type="button"
          className={`linghuiNodeEditorToolButton ${activeVideoTool === 'audio-separation' ? 'isActive' : ''}`}
          onClick={event => event.stopPropagation()}
        >
          <AudioWaveform size={14} className="linghuiNodeEditorToolButtonIcon" />
          <span>音频分离</span>
          <ChevronDown size={12} className="linghuiNodeEditorToolButtonCaret" />
        </button>
      </Dropdown>
    </div>
  );
};
