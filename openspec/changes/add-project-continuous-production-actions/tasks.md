## 1. Shared asset generation workflow

- [ ] 1.1 Define a reusable project asset batch generation input/result model and missing-item collector for current episode references.
- [ ] 1.2 Extract concurrency, retry, user-reference normalization, style snapshot and per-item persistence logic from `AssetManagerPanel` into the shared workflow.
- [ ] 1.3 Add task deduplication for episode-scoped and legacy project-scoped asset generation records.
- [ ] 1.4 Switch `AssetManagerPanel` to the shared workflow without changing its visible behavior.

## 2. Workbench continuous actions

- [ ] 2.1 Extend readiness actions with `generate-assets` and a separate `generate-shots` skip action when asset images are missing.
- [ ] 2.2 Add direct batch progress, success/failure summary and retry UI to `ProjectProductionReadinessPanel`.
- [ ] 2.3 Wire project workbench actions to shared asset generation and existing shot analysis, preserving episode context and explicit skip wording.
- [ ] 2.4 Project asset/task transitions refresh assets, readiness and the project asset overview without duplicate submissions.

## 3. Verification

- [ ] 3.1 Add unit tests for missing-item collection, deduplication, mixed success/failure, direct workbench generation and skip-to-shots behavior.
- [ ] 3.2 Run targeted regression tests, TypeScript checks and frontend/Electron builds.
- [ ] 3.3 Verify the direct actions and resumable progress in Electron through remote debugging port 9333.
- [ ] 3.4 Run `openspec validate add-project-continuous-production-actions --strict`.
