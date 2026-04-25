import type { AppSettings } from '../../../../../types';
import { getProjectTTSProvider } from '../../../../../providers';
import type { AudioResult } from '../../../../../providers/tts/types';
import type { LinghuiAudioMediaItem } from '../../../../../types/linghui';
import { buildMediaItem, throwIfExecutionAborted } from '../linghuiExecutionShared';
import { createTaskSnapshotGetter, resolveAsyncProviderResult } from './shared';

async function resolveTTSVoiceId(
  provider: NonNullable<Awaited<ReturnType<typeof getProjectTTSProvider>>>,
  preferredVoiceId?: string,
): Promise<string> {
  const normalizedPreferred = String(preferredVoiceId ?? '').trim();
  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  if (provider.config?.defaultVoice) {
    return provider.config.defaultVoice;
  }

  const voices = await provider.listVoices();
  return voices[0]?.id || 'default';
}

export async function generateAudioWithProvider(params: {
  text: string;
  ttsSelection?: string;
  voiceId?: string;
  settingsSnapshot?: AppSettings;
  onProgress?: (progress: number, message?: string, partialResult?: unknown) => void;
  signal?: AbortSignal;
}): Promise<LinghuiAudioMediaItem> {
  throwIfExecutionAborted(params.signal);
  const provider = await getProjectTTSProvider(
    params.ttsSelection || undefined,
    'speech.text-to-speech',
    params.settingsSnapshot,
  );
  if (!provider || !provider.validate()) {
    throw new Error('未配置可用的 TTS 服务');
  }

  const voiceId = await resolveTTSVoiceId(provider, params.voiceId);
  const started = await provider.start({
    text: params.text,
    voiceId,
  } as never);
  throwIfExecutionAborted(params.signal);

  const output = started.mode === 'immediate'
    ? started.output
    : await resolveAsyncProviderResult<AudioResult>(
        started.taskId,
        createTaskSnapshotGetter(provider),
        params.onProgress,
        params.signal,
        {
          mediaKind: 'audio',
          provider: provider.config?.provider,
        },
      );
  throwIfExecutionAborted(params.signal);

  const format = output.format?.toLowerCase();
  const mimeType = format
    ? (format === 'wav'
        ? 'audio/wav'
        : format === 'ogg'
          ? 'audio/ogg'
          : format === 'aac'
            ? 'audio/aac'
            : format === 'flac'
              ? 'audio/flac'
              : 'audio/mpeg')
    : undefined;

  return buildMediaItem({
    kind: 'audio',
    source: output.path,
    mimeType,
    durationSec: output.duration,
    metadata: { voiceId, format: output.format },
  });
}
