## Context

The transition planning docs already freeze the intended architecture:

- transitions are relation objects, not clip-owned effects
- `Track.transitions[]` is the only editable source of truth
- `Clip.transition` remains read-only compatibility input
- Phase 1 supports only `fade`
- transitions are anchored to same-track adjacent clip cut points
- transition duration equals overlap duration
- preview and export share semantics, not implementation
- a single resolved transition timing result is the only valid source of timing truth

The current codebase does not yet reflect that design. Relevant code references still show the legacy model:

- `frontend/src/types/editor.ts` defines `Clip.transition` and has no `Track.transitions[]`
- `frontend/src/store/trackStore.ts` persists tracks directly and computes duration with hard-cut assumptions
- `frontend/src/services/draftExport/exportCapabilityChecker.ts` still detects transitions from `clip.transition`
- `frontend/src/services/draftExport/jianyingUtils.ts` still imports `ClipTransition`
- timeline and player paths still assume hard-cut playback and minimal transition affordance

This change documents the semantic migration before any implementation starts.

## Goals

1. Define a single relation-based transition model for editing and persistence.
2. Define compatibility behavior for legacy project data.
3. Define overlap timing semantics that downstream capabilities must honor.
4. Define the minimum Phase 1 workflow contract across storage, playback, export, and timeline interaction.
5. Keep scope narrow enough to avoid Phase 2 workflow creep.

## Non-Goals

- Implementing a second transition type
- Adding default transitions, quick add, or batch apply
- Defining plugin/resource/shader transition infrastructure
- Building a capability registry abstraction
- Reworking all export backends simultaneously
- Designing a deep inspector or advanced editing handles

## Decision Summary

### 1. Data model

The editing model moves from clip-attached metadata to track-level relations.

Conceptually, Phase 1 uses the frozen minimal structure:

```ts
type Transition = {
  id: string
  fromClipId: string
  toClipId: string
  type: 'fade'
  duration: number
}
```

This model matters because the transition belongs to the boundary between two adjacent clips, not to either clip in isolation.

### 2. Source of truth and compatibility

All new add/edit/remove operations must target `Track.transitions[]` only.

`Clip.transition` remains acceptable only as a legacy input shape when loading older project data. After load, the editor state must normalize into the track-level relation model so downstream editing, preview, and export do not continue to branch on the old structure.

This avoids long-lived dual truth and directly addresses Stop-Loss 3.

### 3. Timing semantics

A transition duration represents overlap time between adjacent clips. The track duration model therefore changes from hard-cut end maxima to overlap-aware duration.

The proposal intentionally does not prescribe a rendering implementation, but it does require one timing truth:

- transition active ranges
- visible overlap intervals
- track total duration
- normalized export timing
- timeline cut-point occupancy

must all derive from the same resolved semantics.

This is the architectural guardrail that prevents timeline, preview, and export from each inventing separate time logic.

### 4. Lifecycle rules

Phase 1 prefers predictable rules over smart repair:

- deleting a referenced clip removes the transition
- moving a clip so adjacency breaks removes the transition
- inserting a clip that breaks a cut point removes the transition
- replacing clip content without changing clip identity may preserve the transition

The design intentionally avoids implicit re-binding because it would hide data mutations and increase ambiguity during the first migration.

### 5. Preview and export relationship

Preview and export share transition semantics and timing rules, but not renderer implementation. This preserves the planned split between editing-grade preview and final-grade export.

The proposal therefore requires semantic alignment, not a shared runtime. Preview only needs the minimum fade loop for Phase 1. Export only needs one path to produce correct fade output in Phase 1.

### 6. Capability boundaries

Capability behavior remains deliberately minimal:

- supported
- unsupported
- explicit feedback

No silent fallback is allowed. If a backend does not support the new transition semantics or a scenario is out of Phase 1 scope, the user must receive a clear unsupported result.

## Capability Design

### Storage

Storage requirements need to cover two directions:

1. new projects persist transitions in `Track.transitions[]`
2. old projects with `Clip.transition` remain loadable and normalize into the new editing truth

This is the minimum storage contract needed for Gate B items around save/reload and old-project compatibility.

### Export

Export requirements should focus on the first real delivery path rather than every backend. The frozen planning docs prioritize at least one working export path and clear capability boundaries.

The spec should therefore require:

- export capability checks to inspect track-level transition relations
- at least one export path to map `fade` correctly
- unsupported cases to be explicit
- export timing to follow the same overlap semantics as the rest of the system

### Timeline editing

Timeline-editing requirements should define where transitions are legal and what happens when clip operations invalidate them.

This capability is the right place to specify:

- transitions only exist at same-track adjacent cut points
- add/edit/remove behaviors operate on the relation model
- clip deletion, insertion, and movement can invalidate existing transitions

### Timeline editor

Timeline-editor requirements should stay minimal. Phase 1 only needs enough affordance for users to perceive and operate transitions at cut points.

The proposal should avoid default-transition, batch, or complex inspector behavior here.

### Media playback

Playback requirements should focus on semantic consumption rather than full rendering sophistication:

- detect when a fade transition is active
- use overlap-aware timing
- produce minimum fade playback behavior consistent with the resolved semantics

This is enough to support Gate B preview behavior without overcommitting to a shared renderer abstraction.

## Trade-offs

### Why move storage before UI

Because the biggest current risk is semantic divergence, not missing controls. UI on top of the legacy model would create false progress and make migration harder.

### Why require resolver/layout-style shared semantics now

Because overlap changes the timeline itself. If timing logic is duplicated, regression risk grows immediately across playback, export, and editing.

### Why keep lifecycle rules destructive instead of smart

Because predictable deletion is safer than implicit reattachment during the first iteration. Smart repair can be revisited later if Phase 1 proves valuable.

## Open Risks

1. Existing store shape references may still be inconsistent (`track.items` vs `track.clips`) and could complicate later implementation.
2. Existing export helpers may encode clip-owned assumptions deeply enough that migration touches more code than the type layer suggests.
3. Preview and export may appear aligned in simple cases while still drifting in edge timing cases unless later tests cover overlap boundaries.

## Rollout Constraints

This change must stay within the frozen Phase 1 boundary. No requirement in the deltas should imply:

- more than one transition type
- default or batch workflows
- plugin/resource transition extensibility
- cross-track transitions
- silent degradation of unsupported export paths

Those remain explicitly out of scope until later gates are passed.
