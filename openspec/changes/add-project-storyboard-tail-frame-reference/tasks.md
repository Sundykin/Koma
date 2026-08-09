## 1. Data model and persistence

- [x] 1.1 Add the project-only `ShotVideoReference` type and compatibility normalizer to `Shot`.
- [x] 1.2 Extend shot metadata serialization/deserialization and persistence round-trip tests.
- [x] 1.3 Add deterministic continuity-rule helpers and tests for first shot, scene/character/action continuity, and explicit transitions.

## 2. Script breakdown

- [x] 2.1 Extend the shot analysis JSON schema and project prompt templates with optional continuity suggestion/reason fields.
- [x] 2.2 Normalize continuity only after all analysis chunks are merged and final Shot IDs/order are assigned.
- [x] 2.3 Add compatibility tests for missing/invalid LLM continuity fields and legacy projects.

## 3. Tail-frame media and references

- [x] 3.1 Implement cached FFmpeg tail-frame extraction for local, remote, data and blob media inputs.
- [x] 3.2 Add `previous-video-tail` to the project shot reference bundle and compile it as the highest-priority reference for reference-to-video and image-to-video.
- [x] 3.3 Compile `@previous_tail_frame` safely and add request/compiler tests, including max-reference trimming.

## 4. Rendering workflow

- [x] 4.1 Resolve the active predecessor video and refresh automatic tail frames when its version key changes.
- [x] 4.2 Make single-shot rendering return explicit missing-video/extraction errors and never substitute a poster frame.
- [x] 4.3 Replace blind batch concurrency with dependency-aware scheduling while preserving parallel independent branches and completion callbacks.

## 5. Project storyboard UI

- [x] 5.1 Display automatic mode, reason, source and tail-frame preview in `ShotCard`.
- [x] 5.2 Add manual inherit/independent, capture/re-capture, cancel and restore-automatic actions using existing shot mutation/persistence hooks.
- [x] 5.3 Disable capture when the predecessor has no real completed video and surface actionable errors.

## 6. Verification

- [x] 6.1 Run targeted unit/component tests for rules, persistence, analysis, references, FFmpeg, rendering scheduler and ShotCard interactions.
- [x] 6.2 Run TypeScript checks and Vite/Electron builds.
- [x] 6.3 Start the Electron app on the configured remote debugging port and verify the project storyboard flow through DevTools Protocol.
