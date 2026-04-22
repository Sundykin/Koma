# Koma Studio — Engineering Conventions

## Storage

- **All configuration data lives in SQLite.** LLM/TTI/ITV/TTS channel configs, prompt templates, visual style presets, plugin registry, MCP servers, agent profiles, recent projects, storage paths, media defaults, feature flags — everything goes through `electron/service/config/ConfigService` and its per-domain repositories.
- **No `settings.json`, no `localStorage` for config.** The only exceptions in localStorage are pure UI state (e.g., `app-language`) and chat session metadata.
- **No legacy data migration.** The current release ships with a clean-slate approach: users re-enter config on first boot of the new build. Do not add dual-write, compat shims, or "import from old JSON" flows.
- **Sensitive fields** (`api_key`, `auth_token`) are encrypted at the Repository boundary (`electron/service/storage/fieldCrypto.ts`, AES-256-GCM + PBKDF2 from `app.getPath('userData')`). Business layers see plaintext only.
- **Static resources** (assets/cache/temp/exports/plugins-runtime zip contents) remain on the filesystem under `{storageRoot}/`; only their metadata lives in SQLite.

## Config IPC surface

- Frontend reads via `useConfigStore` (Zustand) which bootstraps once and subscribes to `config:changed`.
- Frontend writes via `electronAPI.config.<domain>.*` (preferred) or the legacy `loadSettings`/`saveSettings` compat shim.
- Main process writes should always go through `ConfigService.writeTx({domain, action, id}, fn)` to get transaction + broadcast in one call.

## Adding a new config domain

1. Add table DDL to `electron/service/storage/schema.ts` and a migration in `MIGRATIONS`.
2. Add Repository interface + SQLite implementation under `electron/service/storage/repositories/`.
3. Register the repository in `electron/service/config/index.ts:ConfigService.init()`.
4. Add controller methods in `electron/controller/config.ts`.
5. Whitelist the channels in `electron/preload/bridge.ts` (`ALLOWED_INVOKE_CHANNELS`) and expose `electronAPI.config.<domain>.*`.
6. Extend `frontend/src/services/configBridge.ts` and `useConfigStore` with the new domain.

For one-off key/value config that doesn't warrant its own table, use `kv_configs` with a suitable namespace — but avoid it for anything queryable or referenced by other tables.
