## 1. Implementation
- [ ] Add `Grok2ApiImagineTTIProvider` (chat multimodal for references, generations for no references)
- [ ] Add `Grok2ApiImagineITVProvider` (chat multimodal for i2v)
- [ ] Register providers in TTI/ITV registries (new providerType ids)
- [ ] Add presets for the new providers in settings
- [ ] Add unit tests for request body shape + basic response extraction

## 2. Verification
- [ ] `frontend`: `npx tsc -p tsconfig.json --noEmit`
- [ ] `frontend`: `npx vitest run`

