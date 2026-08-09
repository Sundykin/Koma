## 1. Workflow registration and compatibility

- [x] 1.1 Add visible/hidden metadata to the editor step registry and make the navigator/order use only visible steps.
- [x] 1.2 Rename the visible script step label to “项目”, point its next action to storyboard, and preserve the hidden assets definition for deep links.
- [x] 1.3 Map legacy `assets` entry points back to the project step while keeping the full `AssetManager` wrapper available on demand.

## 2. Production readiness model

- [x] 2.1 Implement a pure readiness model for script, current-episode assets, and shots, including counts, missing media, running/failed task state, and a deterministic next action.
- [x] 2.2 Reuse existing media selectors and episode analysis references so remote, data/blob, and local assets follow the same readiness rules as asset generation.
- [x] 2.3 Add unit tests covering empty script, unparsed script, missing asset media, active/failed tasks, generated shots, and independent retry actions.

## 3. Project workbench integration

- [x] 3.1 Extend the editor step context and `ProjectOverview` with current-episode readiness data and step-opening callbacks.
- [x] 3.2 Add a compact production readiness panel to the project step with stage counts, reasons, primary next action, retry state, and explicit asset/storyboard entry buttons.
- [x] 3.3 Reuse `submitScriptAnalysisTask` and `submitShotAnalysisTask` from the project step for in-place execution, dedupe handling, and user-facing errors.
- [x] 3.4 Subscribe to task transition edges and refresh analysis, entities, and shots without losing the selected episode or script draft.

## 4. Existing flow alignment

- [x] 4.1 Update `ScriptStep`, `EditorView`, and `App` navigation callbacks so the unified project step can open assets/storyboard without clearing context.
- [x] 4.2 Keep the existing `AssetManagerPanel` and tail-frame storyboard controls unchanged in behavior, only exposing them through the new project-level entry points.
- [x] 4.3 Add regression tests for legacy assets navigation and project-step cross-stage context persistence.

## 5. Verification

- [x] 5.1 Run targeted readiness, editor, and storyboard tests plus TypeScript checks.
- [x] 5.2 Build the frontend and Electron bundles.
- [x] 5.3 Start the Electron dev app on remote debugging port 9333 and verify the project workflow, readiness panel, and storyboard tail-frame controls through DevTools Protocol.
- [x] 5.4 Run `openspec validate unify-project-production-workbench --strict` and record the verified result.
