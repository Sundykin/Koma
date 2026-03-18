# Change: 优先按剧本显式分集边界拆分剧集

## Why
当前 AI 自动剧集会把完整剧本重新交给 LLM 规划集数和分割点，即使原文已经包含明确的分集边界（如“第104集”“104-1”），也不会优先使用这些真实边界。这会导致用户明明导入了已拆分好的多集剧本，系统仍然重规划出完全不同的集数和结构。

## What Changes
- 为自动剧集增加“显式分集边界优先”的确定性解析步骤
- 当原文命中明确的分集边界时，直接按原文边界拆分，不再让 LLM 重规划集数
- 当原文未命中明确分集边界时，才进入现有 LLM 规划流程
- 更新自动剧集提示词：仅在未检测到显式边界时，让 LLM 负责规划；若原文已存在边界，则要求 LLM 仅补充标题/摘要，不重排边界
- 调整 UI 文案与约束，使“目标集数”不再误导为会覆盖原文已存在的分集结构

## Impact
- Affected specs: `script-processing`
- Affected code:
  - `frontend/src/services/EpisodeSplitService.ts`
  - `frontend/src/services/episodeSplitUtils.ts`
  - `frontend/src/components/project/EpisodeSplitWizard.tsx`
  - `frontend/src/components/project/EpisodeManager.tsx`
