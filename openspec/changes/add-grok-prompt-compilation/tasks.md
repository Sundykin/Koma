## 1. Specification
- [ ] Add spec deltas for `script-processing` (shot prompt generation includes scene/prop refs + mention requirements)
- [ ] Add spec deltas for `model-providers` (prompt compilation hook; Grok image-index protocol behavior)
- [ ] Add spec deltas for `prompt-templates` (request body debug logging rules, redaction/truncation)
- [ ] Run `openspec validate add-grok-prompt-compilation --strict`

## 2. Implementation
- [ ] Fix mention creation to preserve asset IDs for scene/prop (`@scene_{scene.id}` etc.)
- [ ] Ensure Storyboard mention items include scenes and props (and that inserted mentions match resolver expectations)
- [ ] Extend ShotPromptService to supply `sceneRefs` + `propRefs` and include in templates
- [ ] Update default templates to instruct using `@scene_*` / `@prop_*`
- [ ] Implement prompt compilation service:
  - [ ] Extract mentions from prompt
  - [ ] Build ordered “selected assets” list (characters → scenes → props)
  - [ ] Compile prompt to `@imageN` and generate ordered reference inputs
  - [ ] ITV special rule: prepend primary image as `@image1`
- [ ] Wire compilation into MediaGenerationService (only for channels with grok protocol enabled)
- [ ] Add debug logs for compiled prompt, mapping, and final request body (with redaction + safe truncation)

## 3. Tests / Verification
- [ ] Update/extend mention unit tests for scene IDs
- [ ] Add unit tests for Grok compiler mapping order and replacement correctness
- [ ] `npm run typecheck` (or `tsc -p frontend/tsconfig.json --noEmit`)

