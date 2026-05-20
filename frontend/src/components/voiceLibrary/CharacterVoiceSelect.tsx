/**
 * 给角色（也给后面分镜 / 项目级默认音色）用的音色 Select 控件。
 *
 * 行为：
 *  - 启动时拉一次全局音色库快照（builtin + custom 合并）
 *  - 按分类分组显示
 *  - 内置 / 自定义都可选
 *  - 旁边带 ▶ 试听按钮（同一时间只播一个）
 *  - 兼容 legacy：character.voiceId 可能直接是 Koma voice id（'cherry'/'aiden'），
 *    自动归一为 builtin-koma-voice-<id>
 *
 * 注：这是受控组件，符合 antd Form.Item 的 value/onChange 协议。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Select, Space } from 'antd';
import type { SelectProps } from 'antd';
import { PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import {
  groupProfilesByCategory, loadVoiceLibrary, resolveVoiceSampleUrl,
} from '../../services/voiceLibrary/voiceLibraryService';
import { resolveLegacyKomaVoiceProfileId } from '../../services/voiceLibrary/builtin';
import type { VoiceLibrarySnapshot, VoiceProfile } from '../../types/voice-library';

interface CharacterVoiceSelectProps {
  value?: string;
  onChange?: (value: string | undefined) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  size?: SelectProps['size'];
}

export const CharacterVoiceSelect: React.FC<CharacterVoiceSelectProps> = ({
  value, onChange, placeholder, allowClear = true, disabled, size,
}) => {
  const [snapshot, setSnapshot] = useState<VoiceLibrarySnapshot>({ categories: [], profiles: [] });
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await loadVoiceLibrary();
        if (!cancelled) setSnapshot(snap);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 把 legacy 直接是 Koma voice id 的旧值归一为 VoiceProfile.id
  const normalizedValue = useMemo(() => {
    if (!value) return undefined;
    const inSnapshot = snapshot.profiles.find((p) => p.id === value);
    if (inSnapshot) return value;
    const legacy = resolveLegacyKomaVoiceProfileId(value);
    return legacy ?? value;
  }, [value, snapshot]);

  const options = useMemo<SelectProps['options']>(() => {
    return groupProfilesByCategory(snapshot)
      .filter((g) => g.profiles.length > 0)
      .map(({ category, profiles }) => ({
        label: category.name,
        options: profiles.map((p) => ({
          label: p.name,
          value: p.id,
        })),
      }));
  }, [snapshot]);

  const currentProfile: VoiceProfile | undefined = useMemo(() => (
    normalizedValue ? snapshot.profiles.find((p) => p.id === normalizedValue) : undefined
  ), [normalizedValue, snapshot]);

  const stopPlay = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  const play = useCallback(async (profile: VoiceProfile) => {
    stopPlay();
    const url = await resolveVoiceSampleUrl(profile.sampleFile);
    if (!url) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(profile.id);
    audio.addEventListener('ended', () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingId(null);
      }
    });
    try {
      await audio.play();
    } catch {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingId(null);
      }
    }
  }, [stopPlay]);

  useEffect(() => () => stopPlay(), [stopPlay]);

  // 选中变更后，把归一化的值回写一次，避免老数据停留在旧 id 上
  useEffect(() => {
    if (value && normalizedValue && normalizedValue !== value) {
      onChange?.(normalizedValue);
    }
  }, [value, normalizedValue, onChange]);

  const isPlayingCurrent = playingId && currentProfile && playingId === currentProfile.id;

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Select
        value={normalizedValue}
        onChange={(v) => onChange?.(v)}
        options={options}
        loading={loading}
        placeholder={placeholder ?? '选择音色（留空使用项目默认）'}
        allowClear={allowClear}
        disabled={disabled}
        size={size}
        showSearch
        optionFilterProp="label"
        style={{ flex: 1 }}
      />
      <Button
        size={size}
        disabled={!currentProfile || disabled}
        icon={isPlayingCurrent ? <StopOutlined /> : <PlayCircleOutlined />}
        title={isPlayingCurrent ? '停止' : '试听'}
        onClick={() => {
          if (!currentProfile) return;
          if (isPlayingCurrent) stopPlay();
          else void play(currentProfile);
        }}
      />
    </Space.Compact>
  );
};
