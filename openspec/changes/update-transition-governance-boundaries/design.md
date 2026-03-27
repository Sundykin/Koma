## Context

The earlier transition change (`update-transition-semantics-migration`) defined the Phase 1 relation-based model, but the repository later needed additional governance hardening so the real runtime boundaries matched the intended semantics.

The key lesson from the review cycle is that the biggest remaining risk is not “missing another fade feature”, but letting storage, playback, export, and interchange each claim stronger guarantees than they actually enforce.

## Goals

1. Freeze the current timeline persistence boundary as a written contract.
2. Require explicit rejection of unsupported future timeline versions.
3. Freeze preview/export alignment at the semantic level for fade overlap and opacity.
4. Prevent Manju interchange from being interpreted as a supported transition round-trip path.
5. Keep Phase 3 evaluation language aligned with the actual proof level.

## Non-Goals

- Completing Gate F or Gate G
- Defining generalized schema migration registries beyond the currently implemented boundary
- Adding new interchange support for transition-bearing external formats
- Reworking capability into a fully user-facing trust report

## Decisions

### 1. Timeline persistence is a boundary, not a loose helper

Timeline persistence must normalize supported timeline data on both load and save. This means the contract is no longer:

- “load may return partially normalized data and UI may fix it later”

It becomes:

- “storage/load returns supported timeline data in normalized editor shape”

This is the minimum governance requirement needed to stop hidden divergence between project timeline and episode timeline paths.

### 2. Future versions must fail explicitly

Unknown future timeline versions must not be silently rewritten as the current version. Silent coercion destroys compatibility guarantees and makes corruption look like success.

The repository now rejects unsupported versions; this spec change turns that behavior into a requirement.

### 3. Preview/export alignment is semantic, not renderer-sharing

Preview and export still use separate runtimes, but they must agree on:

- visible clip set during overlap
- transition opacity at the same timestamp
- overlap-aware clip timing for fade transitions

This is especially important for text clips, because the review exposed a real mismatch there.

### 4. Manju timeline round-trip is explicitly out of scope

The previous state allowed `TimelineData` to be forced through Manju conversion boundaries with `as any`, which created the illusion of supported interchange.

The safer interim rule is explicit exclusion:

- Manju project interchange may still move project metadata, characters, scenes, and shots
- transition-bearing timeline round-trip is not yet supported and must not be claimed as such

This is a trust-boundary decision, not just a typing cleanup.

## Risks / Trade-offs

- Stricter future-version rejection may block some manually edited project files, but this is safer than silent corruption.
- Excluding Manju timeline round-trip reduces claimed interoperability, but prevents false Gate E/F evidence.
- Semantic alignment tests still do not replace full E2E or golden-baseline evidence; they only raise confidence for Gate E.

## Migration Plan

1. Record the persistence-boundary, version-rejection, and alignment behavior in specs.
2. Keep Manju timeline round-trip out of scope until a dedicated proposal defines its compatibility model.
3. Use later work to add E2E/golden evidence before any Gate F upgrade.

## Open Questions

- Should future timeline version rejection become user-visible recovery guidance in the product UI?
- Should capability reporting eventually expose “normalized but partially repaired input” versus “fully trusted input”?
- Which future proposal should own transition-aware project interchange beyond Koma-native storage?
