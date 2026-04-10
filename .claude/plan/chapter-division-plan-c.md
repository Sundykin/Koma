# 章节划分方案 C：规则候选切点 + LLM 选边界

## 数据流
```
script → episodeBoundaryDetector → units[]
  → summarizeUnitsInBatches → summaries[]
  → generateCandidateCutpoints → candidates[] (scored)
  → chooseCutpointsWithLLM → selectedCandidateIds[]
  → validateChapterSelection → pass/repair/fallback
  → materializeChapterRanges → ChapterPreview[]
```

## 新建文件
- `frontend/src/services/chapterPlanning/types.ts`
- `frontend/src/services/chapterPlanning/ChapterPlanningService.ts`
- `frontend/src/services/chapterPlanning/unitBuilder.ts`
- `frontend/src/services/chapterPlanning/candidateScorer.ts`
- `frontend/src/services/chapterPlanning/validator.ts`
- `frontend/src/services/chapterPlanning/prompts.ts`
- `frontend/src/services/chapterPlanning/summaryService.ts`
- `frontend/src/services/chapterPlanning/scriptSampling.ts`

## 修改文件
- `frontend/src/components/storyboard/panels/ScriptStudioPanel.tsx` — 接入 ChapterPlanningService
- `frontend/src/components/storyboard/panels/workflowSessions.ts` — 扩展 Session 类型
- `frontend/src/store/promptTemplates.ts` — 保留 operator 入口但简化模板

## 实施顺序
- P1: unitBuilder + types
- P2: summaryService + scriptSampling
- P3: candidateScorer + validator
- P4: prompts + ChapterPlanningService
- P5: ScriptStudioPanel 接入 + UI
- P6: 测试

## Codex SESSION: 019d7234-c379-7a20-86f2-7a193a138013
## Gemini SESSION: f46c0fa2-21b6-41bd-ab4a-54d7173a09a9
