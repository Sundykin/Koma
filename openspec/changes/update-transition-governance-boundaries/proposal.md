## Summary

Formalize the transition governance hardening that was implemented after the initial Phase 1 semantics migration work, so storage, playback, and export boundaries no longer overstate Phase 3 readiness.

## Why

Recent code changes closed several real transition-governance gaps:

- timeline load/save now normalize through one persistence boundary
- unsupported future timeline versions are rejected instead of silently coerced
- preview/export text transition opacity is aligned under the same overlap semantics
- Manju import/export no longer pretends to support transition timeline round-trip

Those are not just bug fixes in isolated files. Together they change the effective contract for timeline persistence, compatibility handling, preview/export alignment, and project interchange boundaries.

Without a dedicated OpenSpec change, the repository remains in an unsafe state where code reflects stricter rules than the written specs, and Phase 3 evaluation can drift again.

## What Changes

- Define a formal timeline persistence boundary that normalizes supported timeline versions on both load and save.
- Require unsupported future timeline versions to fail explicitly rather than silently downgrading.
- Require preview and export fade semantics to align for visible overlap and opacity, including text clips.
- Clarify that transition-bearing `TimelineData` is currently out of scope for Manju round-trip until a dedicated compatibility proposal exists.
- Document that these changes strengthen Gate E evidence but do not by themselves grant Gate F or Gate G approval.

## Impact

### Affected specs

- `storage`
- `media-playback`
- `export`

### Affected code

- `frontend/src/features/transition/core/migration.ts`
- `frontend/src/store/project/timeline.ts`
- `frontend/src/store/project/analysis.ts`
- `frontend/src/engine/simpleEngine.ts`
- `frontend/src/services/simpleExportRenderer.ts`
- `frontend/src/store/project/manju.ts`
- `docs/transition-phase3-evaluation.md`

### Non-goals

- Approving Phase 3 as complete
- Adding a second transition type
- Re-introducing Manju timeline round-trip support
- Defining plugin/resource/shader transition trust models
- Building a full capability error model or Gate F evidence pack
