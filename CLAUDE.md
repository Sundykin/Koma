# Project Agent Rules

Use the shared project rules in `AGENTS.md`.

Important Electron verification rule:
- Do not open the frontend in a normal browser for UI smoke tests or visual verification.
- Use Electron's custom Chromium remote debugging port instead.
- Default endpoint: `http://127.0.0.1:9333`
- Env override: `KOMA_ELECTRON_REMOTE_DEBUGGING_PORT`
