# Provider Module

The provider module implements a unified interface for AI services including text generation (LLM), image generation (TTI), video generation (ITV), and text-to-speech (TTS). It uses a factory pattern with dynamic registration supporting both built-in and plugin providers.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Provider System                                │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      ProviderManager                             │   │
│  │  • Unified API for all provider types                           │   │
│  │  • Type-safe creation with generics                             │   │
│  │  • Plugin provider lifecycle management                         │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                             │                                           │
│         ┌───────────────────┼───────────────────┐                      │
│         ▼                   ▼                   ▼                      │
│  ┌────────────┐      ┌────────────┐      ┌────────────┐               │
│  │ttiRegistry │      │itvRegistry │      │ttsRegistry │               │
│  └─────┬──────┘      └─────┬──────┘      └─────┬──────┘               │
│        │                   │                   │                       │
│  ┌─────┴─────┐       ┌─────┴─────┐       ┌─────┴─────┐                │
│  │ComfyUI    │       │Sora2      │       │EdgeTTS    │                │
│  │NanoBanana │       │Kling      │       │OpenAI TTS │                │
│  │Gemini3Pro │       │Runway     │       │FishAudio  │                │
│  └───────────┘       │Pika       │       │GPT-SoVITS │                │
│                      │AnimateDiff│       └───────────┘                │
│                      └───────────┘                                     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      LLM Providers                               │   │
│  │  (Direct factory, not registered - simpler API)                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │   │
│  │  │ OpenAI   │  │ Gemini   │  │ Claude   │                       │   │
│  │  └──────────┘  └──────────┘  └──────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
providers/
├── index.ts              # Main exports and factory functions
├── types.ts              # Core type definitions
├── registry.ts           # Provider registration system
├── manager.ts            # ProviderManager class
├── polling.ts            # Async task polling utilities
├── channel/
│   ├── types.ts          # Channel configuration types
│   └── index.ts          # Channel exports
├── llm/
│   ├── types.ts          # LLM provider interface
│   ├── index.ts          # LLM factory
│   ├── OpenAIProvider.ts # OpenAI / compatible
│   ├── GeminiProvider.ts # Google Gemini
│   └── ClaudeProvider.ts # Anthropic Claude
├── tti/
│   ├── types.ts          # TTI provider interface
│   ├── index.ts          # TTI factory + registration
│   ├── ComfyUIProvider.ts
│   ├── NanoBananaProvider.ts
│   └── Gemini3ProProvider.ts
├── itv/
│   ├── types.ts          # ITV provider interface
│   ├── index.ts          # ITV factory + registration
│   ├── Sora2Provider.ts
│   ├── KlingProvider.ts
│   ├── RunwayProvider.ts
│   ├── PikaProvider.ts
│   └── ComfyUIAnimateDiffProvider.ts
└── tts/
    ├── types.ts          # TTS provider interface
    ├── index.ts          # TTS factory + registration
    ├── EdgeTTSProvider.ts
    ├── OpenAITTSProvider.ts
    ├── FishAudioProvider.ts
    ├── GPTSoVITSProvider.ts
    └── TTSService.ts     # High-level TTS service
```

---

## Provider Types

### LLM Provider

Language model for text generation and chat.

```typescript
interface LLMProvider {
  type: string;
  config: ModelConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;
  generateText(prompt: string, systemPrompt?: string): Promise<string>;
  chat(messages: ChatMessage[]): Promise<string>;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

**Available Providers:**
| Type | Name | Description |
|------|------|-------------|
| `openai` | OpenAI | GPT models via OpenAI API |
| `openai-compatible` | OpenAI Compatible | Any OpenAI-compatible API |
| `gemini` | Google Gemini | Gemini Pro/Ultra |
| `claude` | Anthropic Claude | Claude 3 models |

### TTI Provider

Text-to-image generation.

```typescript
interface TTIProvider {
  type: string;
  config: TTIModelConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;

  // Core method - returns ImageResult (sync) or taskId (async)
  generateImage(prompt: string, options?: TTIOptions): Promise<ImageResult | string>;

  // Progress callback variant (optional)
  generateImageWithProgress?(
    input: TTIGenerateInput,
    onProgress?: (progress: ProgressInfo) => void
  ): Promise<ImageResult>;

  // Async providers implement this
  checkProgress?(taskId: string): Promise<ProgressInfo>;

  polling?: PollingConfig;
}

interface TTIOptions {
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  steps?: number;
  cfgScale?: number;
  aspectRatio?: string;
  imageUrls?: string[];        // Reference images
  referenceImages?: string[];  // Alias
}

interface ImageResult {
  path: string;
  url?: string;
  width: number;
  height: number;
  seed?: number;
}
```

**Available Providers:**
| Type | Name | Description |
|------|------|-------------|
| `comfyui` | ComfyUI | Local ComfyUI instance |
| `nano-banana` | NanoBanana | NanoBanana cloud service |
| `gemini-3-pro` | Gemini 3 Pro | Google image generation |

### ITV Provider

Image-to-video generation.

```typescript
interface ITVProvider {
  type: ITVProviderType;
  config: ITVConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;

  // Core method - always returns final result
  generateVideo(input: ITVGenerateInput): Promise<VideoResult>;

  // Progress methods
  checkProgress?(taskId: string): Promise<ProgressInfo>;
  cancelTask?(taskId: string): Promise<void>;
  generateVideoWithProgress?(
    input: ITVGenerateInput,
    onProgress?: (progress: ProgressInfo) => void
  ): Promise<VideoResult>;

  // Extended features (Sora2)
  extractCharacter?(params: CharacterExtractionParams): Promise<string | CharacterProgressInfo>;
  checkCharacterProgress?(taskId: string): Promise<CharacterProgressInfo>;
  extractProp?(taskId: string, timestamps?: string): Promise<string>;
  remixVideo?(videoId: string, options: RemixOptions): Promise<string | ProgressInfo>;
}

interface ITVGenerateInput {
  imageUrl?: string;
  prompt: string;
  options?: ITVOptions;
}

interface VideoResult {
  url: string;
  path?: string;
  taskId?: string;
  duration?: number;
}
```

**Available Providers:**
| Type | Name | Capabilities |
|------|------|--------------|
| `sora2` | Sora 2 | itv, character-extract, remix |
| `kling` | Kling AI | itv |
| `runway` | Runway Gen-2 | itv |
| `pika` | Pika Labs | itv |
| `comfyui-animatediff` | ComfyUI AnimateDiff | itv |

### TTS Provider

Text-to-speech synthesis.

```typescript
interface TTSProvider {
  type: TTSProviderType;
  config: TTSConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;
  synthesize(text: string, voiceId: string, options?: TTSOptions): Promise<AudioResult>;
  listVoices(): Promise<Voice[]>;
}

interface AudioResult {
  path: string;
  duration?: number;
}

interface Voice {
  id: string;
  name: string;
  language?: string;
  gender?: string;
}
```

**Available Providers:**
| Type | Name | Description |
|------|------|-------------|
| `edge-tts` | Edge TTS | Free Microsoft Edge voices |
| `openai-tts` | OpenAI TTS | OpenAI TTS-1/TTS-1-HD |
| `fish-audio` | Fish Audio | Fish Audio service |
| `gpt-sovits` | GPT-SoVITS | Local GPT-SoVITS server |

---

## Provider Registry

The registry system enables dynamic provider registration from built-in code and plugins.

### Registration

```typescript
import { registerProvider } from './providers';
import type { ProviderDefinition } from './providers';

const myProvider: ProviderDefinition<TTIProvider> = {
  type: 'my-tti',
  kind: 'tti',
  name: 'My TTI Provider',
  description: 'Custom image generation',
  factory: (config, ctx) => new MyTTIProvider(config),
  capabilities: ['tti'],
  configSchema: {
    type: 'object',
    properties: {
      apiKey: { title: 'API Key', type: 'string', format: 'password' },
    },
    required: ['apiKey'],
  },
  polling: { interval: 3000, maxDuration: 600000 },
};

registerProvider(myProvider);
```

### ProviderDefinition Interface

```typescript
interface ProviderDefinition<T> {
  type: string;                    // Unique identifier
  kind: ChannelKind;               // 'tti' | 'itv' | 'tts'
  name: string;                    // Display name
  description?: string;
  factory: (config: Record<string, any>, ctx: ProviderContext) => T;
  capabilities?: ChannelCapability[];
  pluginId?: string;               // For plugin providers
  configSchema?: Record<string, any>;  // JSON Schema for UI
  defaultConfig?: Record<string, any>;
  polling?: PollingConfig;
}
```

### Listing Providers

```typescript
import { listProviders, ttiRegistry, itvRegistry, ttsRegistry } from './providers';

// List all providers
const all = listProviders();

// List by kind
const ttiProviders = listProviders('tti');
const itvProviders = listProviders('itv');

// Direct registry access
const sora2Def = itvRegistry.get('sora2');
```

---

## ProviderManager

Type-safe unified API for all provider operations.

```typescript
import { providerManager } from './providers';

// Create provider instance
const ttiProvider = providerManager.create('tti', 'comfyui', {
  baseUrl: 'http://localhost:8188',
});

const itvProvider = providerManager.create('itv', 'sora2', {
  apiKey: 'sk-...',
});

// Register custom provider
providerManager.register({
  type: 'custom-tti',
  kind: 'tti',
  name: 'Custom TTI',
  factory: (config, ctx) => new CustomTTIProvider(config),
});

// Unregister
providerManager.unregister('tti', 'custom-tti');

// Unregister all providers from a plugin
providerManager.unregisterByPlugin('plugin-id');

// List providers
const ttiList = providerManager.list('tti');
const allList = providerManager.listAll();

// Check existence
const exists = providerManager.has('tti', 'comfyui');
```

---

## Factory Functions

Convenience functions for creating providers from configuration.

### Project-Level Factories

```typescript
import {
  getProjectLLMProvider,
  getProjectTTIProvider,
  getProjectITVProvider,
  getProjectTTSProvider,
  getProjectProviders,
} from './providers';

// Get provider using project's config or default
const llm = await getProjectLLMProvider(project.llmConfigId);
const tti = await getProjectTTIProvider(project.ttiConfigId);
const itv = await getProjectITVProvider(project.itvConfigId);
const tts = await getProjectTTSProvider(project.ttsConfigId);

// Get all at once
const { llm, tti, itv, tts } = await getProjectProviders({
  llmConfigId: project.llmConfigId,
  ttiConfigId: project.ttiConfigId,
  itvConfigId: project.itvConfigId,
  ttsConfigId: project.ttsConfigId,
});
```

### Direct Factories

```typescript
import {
  createLLMProvider,
  createTTIProvider,
  createITVProvider,
  createTTSProvider,
} from './providers';

const llm = createLLMProvider({
  provider: 'openai',
  apiKey: 'sk-...',
  modelName: 'gpt-4',
});

const tti = createTTIProvider({
  provider: 'comfyui',
  baseUrl: 'http://localhost:8188',
});
```

---

## Polling System

Unified polling for async tasks.

```typescript
import { pollTask, pollTaskById, DEFAULT_POLLING_CONFIG } from './providers';

// Full polling with submit
const result = await pollTask({
  submit: () => provider.submitTask(params),
  check: (taskId) => provider.checkProgress(taskId),
  polling: {
    interval: 3000,      // 3 seconds
    maxDuration: 600000, // 10 minutes
    initialDelay: 2000,  // Wait 2s before first check
  },
  onProgress: (progress) => {
    console.log(`${progress.progress}%: ${progress.status}`);
  },
  signal: abortController.signal,
});

// Simplified polling with existing taskId
const result = await pollTaskById(
  taskId,
  (id) => provider.checkProgress(id),
  DEFAULT_POLLING_CONFIG,
  (progress) => console.log(progress),
  signal
);
```

### PollingConfig

```typescript
interface PollingConfig {
  interval: number;       // Poll every N ms (default: 3000)
  maxDuration: number;    // Timeout after N ms (default: 600000)
  initialDelay?: number;  // Wait before first poll (default: 2000)
}

const DEFAULT_POLLING_CONFIG: PollingConfig = {
  interval: 3000,
  maxDuration: 600000,
  initialDelay: 2000,
};
```

---

## Configuration Validation

```typescript
import {
  validateLLMConfig,
  validateTTIConfig,
  validateITVConfig,
  validateTTSConfig,
  validateAllSettings,
} from './providers';

// Individual validation
const llmResult = validateLLMConfig(config);
if (!llmResult.valid) {
  console.error(llmResult.errors);
}

// Validate all settings at once
const results = validateAllSettings(appSettings);
// Returns: { llm, tti, itv, tts } each with { valid, errors }
```

---

## Connection Testing

```typescript
import { testLLMConnection, testTTIConnection } from './providers';

const llmTest = await testLLMConnection(llmConfig);
console.log(llmTest.success, llmTest.message);

const ttiTest = await testTTIConnection(ttiConfig);
console.log(ttiTest.success, ttiTest.message);
```

---

## Plugin Provider Integration

Plugins can register custom providers with sandboxed network access.

### Plugin Context

```typescript
interface ProviderContext {
  pluginId?: string;
  sandboxedFetch: typeof fetch;  // Sandboxed fetch for security
  logger?: {
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
  };
}
```

### Plugin Provider Example

```typescript
// In plugin code
api.channel.register({
  type: 'my-plugin-tti',
  kind: 'tti',
  name: 'Plugin TTI',
  factory: (config, ctx) => ({
    type: 'my-plugin-tti',
    config,
    validate: () => true,
    testConnection: async () => {
      // Use sandboxed fetch
      const res = await ctx.sandboxedFetch('https://api.example.com/health');
      return res.ok;
    },
    generateImage: async (prompt, options) => {
      const res = await ctx.sandboxedFetch('https://api.example.com/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, ...options }),
      });
      return await res.json();
    },
  }),
});
```

---

## Channel Configuration

Channels represent configured instances of providers.

```typescript
interface ChannelConfig {
  id: string;
  name: string;
  description?: string;

  providerType: string;             // References registry type
  providerConfig: Record<string, any>;
  capabilities: ChannelCapability[];

  polling?: PollingConfig;          // Override provider defaults
  enabled: boolean;
  isDefault?: boolean;

  source: 'builtin' | 'plugin';
  pluginId?: string;

  createdAt: number;
  updatedAt: number;
}

type ChannelCapability =
  | 'tti'               // Text-to-image
  | 'itv'               // Image-to-video
  | 'tts'               // Text-to-speech
  | 'character-extract' // Character extraction (Sora2)
  | 'remix'             // Video remix (Sora2)
  | 'image-hosting';    // Image hosting service
```

---

## Progress Info

Standardized progress reporting.

```typescript
interface ProgressInfo {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;     // 0-100
  resultUrl?: string;
  localPath?: string;
  error?: string;
  extra?: Record<string, any>;
}
```

---

## Implementing a New Provider

### 1. Define the Provider Class

```typescript
// providers/tti/MyProvider.ts
import type { TTIProvider, TTIOptions, ImageResult } from './types';
import type { TTIModelConfig, ProgressInfo } from '../../types';

export class MyProvider implements TTIProvider {
  type = 'my-provider';
  config: TTIModelConfig;

  constructor(config: TTIModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateImage(prompt: string, options?: TTIOptions): Promise<ImageResult> {
    const res = await fetch(`${this.config.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, ...options }),
    });

    const data = await res.json();
    return {
      path: data.url,
      url: data.url,
      width: options?.width || 1024,
      height: options?.height || 1024,
    };
  }
}
```

### 2. Register in Index

```typescript
// providers/tti/index.ts
import { MyProvider } from './MyProvider';

// Add to builtins array
const builtins: ProviderDefinition<TTIProvider>[] = [
  // ... existing providers
  {
    type: 'my-provider',
    kind: 'tti',
    name: 'My Provider',
    description: 'Custom image generation',
    factory: (config) => new MyProvider(config as TTIModelConfig),
    capabilities: ['tti'],
    configSchema: {
      type: 'object',
      properties: {
        apiKey: { title: 'API Key', type: 'string', format: 'password' },
        baseUrl: { title: 'API URL', type: 'string' },
      },
      required: ['apiKey'],
    },
  },
];
```

### 3. Async Provider with Polling

```typescript
export class AsyncProvider implements TTIProvider {
  // ... basic methods

  polling: PollingConfig = {
    interval: 3000,
    maxDuration: 300000,
    initialDelay: 2000,
  };

  async generateImage(prompt: string, options?: TTIOptions): Promise<string> {
    // Return taskId for async polling
    const res = await fetch(`${this.config.baseUrl}/submit`, {
      method: 'POST',
      body: JSON.stringify({ prompt, ...options }),
    });
    const { taskId } = await res.json();
    return taskId;
  }

  async checkProgress(taskId: string): Promise<ProgressInfo> {
    const res = await fetch(`${this.config.baseUrl}/progress/${taskId}`);
    const data = await res.json();
    return {
      status: data.status,
      progress: data.progress,
      resultUrl: data.url,
    };
  }
}
```

---

## Best Practices

1. **Always validate** before making API calls
2. **Use polling utilities** for async operations instead of custom loops
3. **Implement testConnection** for configuration verification
4. **Include configSchema** for auto-generated settings UI
5. **Use sandboxedFetch** in plugin providers for security
6. **Handle errors gracefully** and return meaningful messages
7. **Support cancellation** via AbortSignal where possible
