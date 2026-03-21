## 1. Proposal Approval
- [ ] Review `proposal.md` and confirm Open Questions (ITV 是否强制 URL，上传失败策略)
- [ ] Confirm default policy matrix:
  - [ ] TTI output ensure remoteUrl: best-effort | required
  - [ ] TTI references ensure remoteUrl: best-effort | required
  - [ ] ITV primaryImage ensure remoteUrl: best-effort | required
  - [ ] ITV additional refs ensure remoteUrl: best-effort | required

## 2. Provider Contract (image-hosting)
- [ ] Add `frontend/src/providers/imageHosting/types.ts`
- [ ] Add `frontend/src/providers/imageHosting/index.ts` and register builtins if needed
- [ ] Update `frontend/src/providers/registry.types.ts` (ensure kind/capabilities include `image-hosting`)
- [ ] Update `frontend/src/providers/manager.ts` type map for `'image-hosting'`
- [ ] Update `packages/plugin-sdk` types to include `image-hosting` capability for provider defs

## 3. Image Hosting Orchestrator
- [ ] Refactor `frontend/src/services/imageHostingService.ts` to:
  - [ ] choose default channel via `getDefaultChannelConfig('image-hosting')`
  - [ ] create provider instance via `createProviderInstance('image-hosting', ...)`
  - [ ] expose `uploadLocalFileToImageHosting(localPath)` and `uploadBytesToImageHosting(bytes, options)`
  - [ ] remove SCDN-specific hardcoding from core service (move into provider/plugin)

## 4. RemoteUrlService (Normalization)
- [ ] Add `frontend/src/services/mediaRemoteUrlService.ts`
  - [ ] `ensureRemoteUrlForAsset(asset, policy)`:
    - [ ] if asset.remoteUrl already present -> return
    - [ ] if localPath present -> read bytes via electron fs -> upload -> set remoteUrl
    - [ ] if data-url -> decode -> upload -> set remoteUrl
  - [ ] `ensureRemoteUrlForSources(sources[], policy)` for batch references
  - [ ] enforce logging hygiene (do not log full base64)

## 5. MediaGenerationService Integration (Single Entry)
- [ ] Update `frontend/src/services/MediaGenerationService.ts`
  - [ ] TTI: after `persistMediaAsset` and before `bindOwnerRefMedia`, call `ensureRemoteUrlForAsset`
  - [ ] ITV: before resolver, normalize primaryImage (and optionally refs) according to policy
  - [ ] Keep resolver pure (no uploads inside `mediaAssetResolver.ts`)

## 6. Plugin Compatibility
- [ ] Update `packages/plugins/scdn-image-hosting/src/index.tsx`
  - [ ] register provider with real `factory(config, ctx)` (do not return null)
  - [ ] implement `uploadImage` using `ctx.sandboxedFetch` to avoid CORS (FormData upload)
  - [ ] keep UI configuration path unchanged (`channels.updateProviderConfig`)

## 7. Remove Legacy Config
- [ ] Delete `frontend/src/store/settings/imageHostingConfig.ts`
- [ ] Remove re-exports from:
  - [ ] `frontend/src/store/settings/index.ts`
  - [ ] `frontend/src/store/globalStore.ts`
- [ ] Remove `ImageHostingConfig` type and `AppSettings.imageHostingConfig` field from `frontend/src/types.ts`

## 8. Tests
- [ ] Add unit tests:
  - [ ] `frontend/src/services/mediaPersistenceService.test.ts` (data-url persists to file; never treated as path)
  - [ ] `frontend/src/services/mediaAssetResolver.test.ts` (prefer remoteUrl; localPath -> data-url)
  - [ ] `frontend/src/services/mediaRemoteUrlService.test.ts` (localPath/data-url -> upload -> remoteUrl)
  - [ ] `frontend/src/providers/itv/CustomITVProvider.test.ts` (remote-url input does not include base64 fields)
- [ ] Decide and encode expected behavior when image-hosting is disabled or upload fails (ties to policy matrix)

## 9. Validation
- [ ] `npx tsc -p frontend/tsconfig.json --noEmit`
- [ ] `openspec validate add-pluggable-image-hosting-remoteurl --strict`

