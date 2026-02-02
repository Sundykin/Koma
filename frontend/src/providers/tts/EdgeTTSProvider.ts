/**
 * Edge TTS Provider (???)
 * ??? Microsoft Edge ? TTS ???
 */
import { v4 as uuidv4 } from 'uuid';
import type { TTSConfig, TTSOptions, AudioResult, Voice } from '../../types';
import type { TTSProvider } from './types';

// Edge TTS?????????
const EDGE_VOICES: Voice[] = [
  {
    id: 'zh-CN-XiaoxiaoNeural',
    name: '??? (??s)',
    language: 'zh-CN',
    gender: 'female',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-YunxiNeural',
    name: '??? (??s)',
    language: 'zh-CN',
    gender: 'male',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-YunjianNeural',
    name: '??? (??s)',
    language: 'zh-CN',
    gender: 'male',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-XiaoyiNeural',
    name: '??? (??s)',
    language: 'zh-CN',
    gender: 'female',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-YunyangNeural',
    name: '??? (??s-???)',
    language: 'zh-CN',
    gender: 'male',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-XiaochenNeural',
    name: '??? (??s)',
    language: 'zh-CN',
    gender: 'female',
    provider: 'edge-tts',
  },
];

export class EdgeTTSProvider implements TTSProvider {
  type: 'edge-tts' = 'edge-tts';
  config: TTSConfig;

  private readonly WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
  private readonly TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

  constructor(config: TTSConfig) {
    this.config = config;
  }

  validate(): boolean {
    // Edge TTS ???? API Key
    return true;
  }

  async testConnection(): Promise<boolean> {
    // Edge TTS ??????
    return true;
  }

  async synthesize(
    text: string,
    voiceId: string,
    options?: TTSOptions
  ): Promise<AudioResult> {
    const requestId = uuidv4().replace(/-/g, '');
    const wsUrl = ${this.WSS_URL}?TrustedClientToken=&ConnectionId=;

    return new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(wsUrl);
        const audioChunks: BlobPart[] = [];
        let isCompleted = false;

        socket.binaryType = 'arraybuffer';

        socket.onopen = () => {
          // 1. Send Config
          const configMsg = Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"system":{"name":"Edge","version":"112.0.1722.34","build":"31de38d1-6a2c-4734-9721-789a744216a7","lang":"en-US"},"os":{"platform":"Windows","name":"Windows","version":"10"}},"audio":{"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}};
          socket.send(configMsg);

          // 2. Send SSML
          const ssml = this.makeSSML(text, voiceId, options);
          const ssmlMsg = X-RequestId:\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n;
          socket.send(ssmlMsg);
        };

        socket.onmessage = (event) => {
          if (typeof event.data === 'string') {
            if (event.data.includes('Path:turn.end')) {
              isCompleted = true;
              socket.close();
            }
          } else if (event.data instanceof ArrayBuffer) {
            // Binary data starts with a header, we need to strip it
            const view = new DataView(event.data);
            const headerLength = view.getInt16(0);
            const audioChunk = event.data.slice(headerLength + 2);
            if (audioChunk.byteLength > 0) {
              audioChunks.push(audioChunk);
            }
          }
        };

        socket.onclose = () => {
          if (isCompleted && audioChunks.length > 0) {
            const blob = new Blob(audioChunks, { type: 'audio/mpeg' });
            const url = URL.createObjectURL(blob);
            resolve({
              path: url,
              duration: 0, // TODO: ???????????????
              format: 'mp3',
            });
          } else if (!isCompleted) {
            reject(new Error('Edge TTS connection closed unexpectedly'));
          }
        };

        socket.onerror = (err) => {
          reject(new Error(Edge TTS WebSocket error: ));
        };

        // Timeout
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
            reject(new Error('Edge TTS request timeout'));
          }
        }, 60000); // 60s timeout
      } catch (err) {
        reject(err);
      }
    });
  }

  private makeSSML(text: string, voiceId: string, options?: TTSOptions): string {
    const rate = options?.rate ? ${Math.round((options.rate - 1) * 100)}% : '0%';
    const pitch = options?.pitch ? ${Math.round((options.pitch - 1) * 100)}% : '0%';
    
    // ??? XML ??????
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    return 
      <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>
        <voice name=''>
          <prosody pitch='' rate=''>
            
          </prosody>
        </voice>
      </speak>
    .trim();
  }

  async listVoices(): Promise<Voice[]> {
    return EDGE_VOICES;
  }
}

export default EdgeTTSProvider;
