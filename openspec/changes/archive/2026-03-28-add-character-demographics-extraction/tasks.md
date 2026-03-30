## 1. Spec
- [x] 1.1 Update `prompt-templates` spec to require age/gender fields for default character extraction
- [x] 1.2 Update `script-processing` spec to require structured age/gender in character extraction results
- [x] 1.3 Update `character-management` spec to require editable age/gender fields

## 2. Implementation
- [x] 2.1 Update `character_extraction` built-in template and variable guidance
- [x] 2.2 Update ScriptAnalysisService character schema and mapping to include `gender`
- [x] 2.3 Extend `Character` type with formal `gender` field
- [x] 2.4 Update character create/detail UI to display and persist age/gender
- [x] 2.5 Verify type-check and frontend build
