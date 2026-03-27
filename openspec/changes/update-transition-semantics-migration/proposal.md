## Summary

Migrate transition editing semantics from clip-attached metadata to track-level relations so Phase 1 can support a fade-only, cut-point-first workflow with consistent storage, preview, and at least one export path.

## Problem Statement

The current codebase still models transitions as `Clip.transition`, which conflicts with the accepted transition architecture and causes four system-level problems:

1. Editing truth is attached to a single clip instead of a relation between adjacent clips.
2. Persistence, capability checks, preview, and export are all coupled to the legacy clip-scoped model.
3. Timeline duration and transition timing still assume hard cuts instead of overlap semantics.
4. Continuing to add UI or export support on top of this model would create long-lived dual truth and time-logic divergence.

This prevents the project from passing Gate A and blocks the minimum Phase 1 fade loop defined in the frozen transition docs.

## Proposed Solution

Adopt `Track.transitions[]` as the only editable transition source of truth and define OpenSpec changes that align storage, timeline editing, playback, and export semantics around the same minimal relation model.

The proposal introduces the following scope:

- Add a track-level transition relation model for editing and persistence.
- Keep `Clip.transition` as read-only compatibility input for legacy projects.
- Restrict Phase 1 transitions to same-track adjacent clip cut points.
- Define overlap-based timing semantics where transition duration equals overlap duration.
- Require timeline, preview, and export to consume the same resolved transition layout semantics.
- Require at least one export path to correctly reflect fade transitions and capability boundaries, with Jianying export as the initial supported path.
- Add minimum timeline affordances for add/edit/remove flow without expanding into Phase 2 workflow features.

The proposal explicitly does not include:

- A second transition type
- Default transition or batch apply workflows
- Complex inspector semantics
- Resource-based, plugin-based, or shader-based transitions
- Platform-wide capability registry work
- Full native frame-by-frame export redesign

## Impact Analysis

### Affected capabilities

- `storage`
- `export`
- `timeline-editing`
- `timeline-editor`
- `media-playback`

### Primary code areas motivating the change

- `frontend/src/types/editor.ts`
- `frontend/src/store/trackStore.ts`
- `frontend/src/services/draftExport/exportCapabilityChecker.ts`
- `frontend/src/services/draftExport/jianyingUtils.ts`
- `frontend/src/components/editor/SimpleTimeline.tsx`
- `frontend/src/components/editor/SimplePlayer.tsx`
- `frontend/src/engine/simpleEngine.ts`
- `frontend/src/services/simpleExportRenderer.ts`

### Expected product impact

- Users can understand transitions as cut-point relations rather than clip-attached effects.
- Phase 1 can validate whether fade transitions are valuable in the default editing workflow.
- The system can move toward preview/export consistency without requiring a shared renderer implementation.

## Risks and Mitigations

### Risk: dual truth persists during migration
Mitigation: specs require all new writes to target `Track.transitions[]` only, with `Clip.transition` limited to compatibility reads.

### Risk: preview, export, and timeline compute different timing rules
Mitigation: specs require shared overlap semantics and resolver/layout-based timing outputs.

### Risk: legacy projects load incorrectly
Mitigation: storage specs require compatibility ingestion of legacy `Clip.transition` data into the new editing truth.

### Risk: UI appears complete before semantics are stable
Mitigation: timeline-editor scope is limited to minimum cut-point affordances and explicitly excludes Phase 2 workflow expansion.

## Success Criteria

This proposal is successful when the approved change defines requirements that allow the implementation to satisfy all of the following:

- New editing flows persist transitions via `Track.transitions[]`.
- Legacy projects with `Clip.transition` remain readable.
- Fade transitions are constrained to adjacent clips on the same track.
- Timeline duration and active transition timing use overlap semantics.
- Preview supports active fade semantics.
- At least one export path correctly outputs fade transitions.
- Capability feedback clearly distinguishes supported vs unsupported cases without silent fallback.

## Related Specs

- `storage`
- `export`
- `timeline-editing`
- `timeline-editor`
- `media-playback`
