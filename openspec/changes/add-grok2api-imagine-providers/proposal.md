# Change: Add Grok2API Imagine Providers (TTI/ITV)

## Why
Current Grok2API usage is wired through existing providers/endpoints that do not reliably apply multi-image references (TTI) and may ignore additional references (ITV). We need dedicated providers that speak Grok2API's reverse-engineered multimodal `/v1/chat/completions` format, without impacting existing providers.

## What Changes
- Add two new built-in providers:
  - `grok2api-imagine-tti`: TTI provider that uses:
    - `/v1/images/generations` for pure text-to-image
    - `/v1/chat/completions` for image-edit/multi-reference prompts (when references exist)
  - `grok2api-imagine-itv`: ITV provider that uses `/v1/chat/completions` for image-to-video.
- Keep existing providers unchanged.
- Add presets so users can select these providers in settings.

## Impact
- Affected specs: model providers (TTI/ITV)
- Affected code:
  - Provider registry: `frontend/src/providers/tti/index.ts`, `frontend/src/providers/itv/index.ts`
  - New providers: `frontend/src/providers/tti/Grok2ApiImagineTTIProvider.ts`, `frontend/src/providers/itv/Grok2ApiImagineITVProvider.ts`
  - Presets/UI: `frontend/src/store/settings/presets.ts`, `frontend/src/types.ts`

