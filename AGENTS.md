<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Cursor Cloud specific instructions

### Project overview

Koma Studio is an AI-powered short drama creation tool (AI 短剧创作工具) built as an Electron + React app. See `README.md` for the full tech stack and project structure. Key directories: `frontend/` (React/Vite), `electron/` (Electron main process), `packages/` (plugin SDK and plugins).

### Running services

- **Frontend dev server**: `cd frontend && npx vite --host 0.0.0.0` — serves at `http://localhost:5173/`. The frontend has browser-mode fallbacks and works without Electron for UI development and testing.
- **Electron**: `cd electron && npm run dev` — requires a display; not available in headless cloud VMs. Episode creation and filesystem-based features require the Electron environment.
- **Combined**: `npm run dev` at the root runs both via `concurrently`.

### Lint / Test / Build

- **Lint**: `cd frontend && npx eslint src/` (flat config at `frontend/eslint.config.cjs`)
- **Test**: `cd frontend && npx vitest run` (49 tests across 3 files)
- **Build frontend**: `cd frontend && npx vite build` — currently has a pre-existing issue: the `overrides` in `frontend/package.json` force `refractor@^5.0.0` which is incompatible with `react-syntax-highlighter@15` (pulled by `ds-markdown`). Production build fails; dev server works after the workaround below.
- **Build electron**: `cd electron && npx tsc` — compiles cleanly.

### Known dependency workaround (refractor)

The `frontend/package.json` `overrides` field forces `refractor@5`, but `react-syntax-highlighter` (transitive dep of `ds-markdown`) expects refractor v3 API (CJS default exports and `refractor/lang/*.js` paths not in v5 exports map). After `npm install`, you must downgrade refractor in `node_modules`:

```bash
cd frontend
rm -rf node_modules/refractor
npm pack refractor@3.6.0
mkdir -p node_modules/refractor
tar xzf refractor-3.6.0.tgz -C node_modules/refractor --strip-components=1
rm refractor-3.6.0.tgz
rm -rf node_modules/.vite
```

This is already included in the update script. Without this, the Vite dev server crashes on startup.

### Notes

- No database or Docker required. All data is stored on the local filesystem via `electron-store`.
- AI features (LLM, TTI, TTS, ITV) require API keys configured in the app's settings page. The app works without them but AI features are disabled.
- The frontend uses `localStorage` as a fallback when not running in Electron.