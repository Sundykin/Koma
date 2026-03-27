## 1. Spec and design
- [x] 1.1 Finalize proposal scope around Phase 1 fade-only transition semantics migration.
- [x] 1.2 Document the architectural design for single-source-of-truth transitions, overlap timing semantics, compatibility loading, lifecycle rules, and capability boundaries.
- [x] 1.3 Add spec deltas for `storage`, `export`, `timeline-editing`, `timeline-editor`, and `media-playback`.

## 2. Validation and sequencing
- [x] 2.1 Validate that the spec deltas keep `Track.transitions[]` as the only editable truth and limit `Clip.transition` to compatibility reads.
- [x] 2.2 Validate that the proposed requirements preserve the fixed implementation order: storage migration → export alignment → preview minimum loop → UI minimum entry → regression hardening.
- [x] 2.3 Run `npx --yes @fission-ai/openspec validate update-transition-semantics-migration --strict` and resolve all issues before implementation approval.

## 3. Implementation follow-up (post-approval, not part of proposal stage)
- [ ] 3.1 Migrate editor types and store persistence to track-level transition relations.
- [ ] 3.2 Update capability checks and the first export path to consume track-level transitions.
- [ ] 3.3 Add preview active-transition semantics and minimum fade rendering.
- [ ] 3.4 Add minimum timeline add/edit/remove affordances for cut-point transitions.
- [ ] 3.5 Add regression coverage for migration, lifecycle handling, preview/export timing, and unsupported capability feedback.
