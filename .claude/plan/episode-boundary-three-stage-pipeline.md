# 集边界检测管线 — 实施计划（简化版）

> **方案**: Regex 预筛 → LLM 全文提取 → 确定性校验
> **目标**: 替代纯 regex 检测，支持任意格式的剧本集边界识别
> **约束**: 不考虑 token 成本，效果优先

---

## 架构概览

```
用户粘贴剧本
       │
  ┌────▼────┐
  │ Stage 0 │  Regex 预筛选（同步，0ms）
  │ 高置信? │──Yes──▶ 直接返回 EpisodeBoundary[]
  └────┬────┘
       │ No
  ┌────▼────────┐
  │ Stage 1     │  LLM 全文提取（~5-15s）
  │ Extract     │  完整脚本带行号 → JSON candidates
  │             │  超长脚本自动分块（仅因上下文窗口限制）
  └────┬────────┘
       │
  ┌────▼────────┐
  │ Stage 2     │  Validate（确定性校验，0ms）
  │ Validate    │  行号反查 + 原文匹配 + offset 回算
  └────┬────────┘
       │
       ▼
  EpisodeBoundary[]（与现有接口完全兼容）
```

**关键简化**：去掉 Probe 阶段 — 它的核心目的是省 token，不考虑成本后直接全文提取效果更好。

---

## 文件结构

```
frontend/src/services/episodeBoundaries/
├── types.ts              — 管线类型定义
├── lineIndex.ts          — 行号 ↔ offset 映射
├── regexScreening.ts     — regex 预筛选 + 单行解析器
├── prompts.ts            — Extract 的 system + user prompt
├── extractStage.ts       — LLM 全文提取（含大脚本分块）
├── validateStage.ts      — 确定性校验
├── pipelineService.ts    — 编排入口 detectEpisodeBoundaries()
├── index.ts              — 公开导出
└── __tests__/
    ├── lineIndex.test.ts
    ├── regexScreening.test.ts
    ├── extractStage.test.ts
    ├── validateStage.test.ts
    └── pipelineService.test.ts
```

---

## 实施步骤

### Step 1: 基础类型与行号索引

**新建**: `episodeBoundaries/types.ts`, `episodeBoundaries/lineIndex.ts`

**types.ts 核心类型**:
- `EpisodeMarkerFormat`: `'cn_episode_title' | 'en_episode_title' | 'season_episode' | 'scene_heading' | 'mixed' | 'unknown'`
- `ScriptLineRecord`: `{ lineNumber, text, start, end }`
- `ScriptLineIndex`: 行号索引 — `getLine()`, `getStartOffset()`, `renderNumberedText()`
- `RegexBoundaryScreeningResult`: `{ boundaries, confidence, markerFormat, reasons }`
- `EpisodeBoundaryCandidate`: LLM 候选 — `{ lineNumber, rawLine, title, episodeNumber, confidence }`
- `BoundaryValidationIssue / Result`: 校验结果
- `EpisodeBoundaryPipelineResult`: `{ boundaries, source: 'regex'|'llm'|'llm-repaired'|'regex-fallback'|'none' }`

**lineIndex.ts**:
- `buildScriptLineIndex(script)` — 基于原始 script，不改写换行符
- offset 与 `EpisodeBoundary.start/contentStart` 对齐

### Step 2: Regex 预筛选

**新建**: `episodeBoundaries/regexScreening.ts`
**修改**: `episodeBoundaryDetector.ts` — 抽出 `parseEpisodeMarkerLine()`

- `parseEpisodeMarkerLine(line): ParsedEpisodeMarkerLine | null` — 单行解析（Validate 复用）
- `screenRegexBoundaries(script): RegexBoundaryScreeningResult` — 带置信度分级

高置信条件（跳过 LLM）:
1. `boundaries.length >= 2`
2. `episodeNumber !== null` 比例 ≥ 0.8
3. episodeNumber 严格递增
4. 相邻间距 ≥ 120 字符
5. 无重复

### Step 3: LLM 接口补齐

**修改**:
- `providers/llm/types.ts` — `LLMCallOptions` 增加 `timeoutMs`
- `chat/ipc/chatIPC.ts` — `LLMQueryRequest.options` 补齐 `timeoutMs`, `disableChunking`
- `providers/llm/IPCLLMProvider.ts` — `generateText()`/`chat()` 透传

### Step 4: LLM Extract 阶段

**新建**: `episodeBoundaries/prompts.ts`, `episodeBoundaries/extractStage.ts`

**策略**: 把完整脚本带行号发给 LLM，让它做"抄录式提取"

**System Prompt 要点**:
- 角色: "分集边界结构化提取器"
- 只返回真实存在的行号和原文
- 不推断、不补写、不脑补
- 明确列出什么算边界（第N集/Episode N/S1E3/场次编号）和什么不算（第一幕/章/序/正文提及）

**分块策略**（仅当脚本超过模型上下文窗口时）:
- 按 ~30K 字符分块（充分利用上下文窗口）
- 重叠 50 行上下文
- `Promise.allSettled` 并发提取
- 合并去重

**JSON 解析失败**: 单次重试

**Targeted Re-extract**: 对缺失区间局部重提取（前后各 120 行）

### Step 5: Validate 阶段

**新建**: `episodeBoundaries/validateStage.ts`

**确定性校验**（无 LLM）:
1. 行号范围校验: `1..totalLines`
2. 原文反查: `candidate.rawLine === lineIndex.getLine(lineNumber).text`
3. deterministic 单行解析: `parseEpisodeMarkerLine()` 成功
4. 标题归一化: scene_heading 无标题时补 `第${episodeNumber}集`
5. 重复行/集号去重
6. 单调递增校验
7. 最小间距校验
8. offset 回算: `start = line.start`, `contentStart = nextLine.start`

**Fatal → fallback**: 丢弃率 > 30% / 修复后仍非单调 / < 2 边界

### Step 6: Pipeline 编排

**新建**: `episodeBoundaries/pipelineService.ts`, `index.ts`

```typescript
export async function detectEpisodeBoundaries(
  script: string,
  options: { provider: LLMProvider; signal?: AbortSignal }
): Promise<EpisodeBoundaryPipelineResult>
```

**流程**:
```
regex screening
  ├─ high confidence → 返回 { source: 'regex' }
  └─ else → LLM extract
       ├─ extract 成功 → validate
       │    ├─ valid          → { source: 'llm' }
       │    ├─ auto-fix valid → { source: 'llm-repaired' }
       │    └─ severe         → targeted re-extract → 再 validate → regex-fallback
       └─ extract 全失败 → validate(regex) → regex-fallback
```

### Step 7: 下游集成

**修改**:
- `chapterPlanning/unitBuilder.ts` — `buildUnits(script, { overrideBoundaries? })`
- `episodeSplitUtils.ts` — 新增 `detectExplicitEpisodeAnalysisAsync()`

### Step 8: 前端 UI 改造

**修改**: `ScriptStudioPanel.tsx`, `workflowSessions.ts`

**Session 扩展**:
```typescript
detectionStatus?: 'idle' | 'extracting' | 'done' | 'failed';
detectionSource?: 'regex' | 'llm' | 'user';
detectedBoundaries?: EpisodeBoundary[];
```

**重构**: `useMemo` → `useEffect + useState` + AbortController
**UI**: 来源标签（蓝/绿/橙/灰）+ 手动编辑器 + 注入 `overrideBoundaries`

---

## 核心约束

1. **输出兼容**: 最终产物是 `EpisodeBoundary[]`，与现有接口完全一致
2. **不信任 LLM offset**: offset 一律由 lineIndex 本地回算
3. **不信任 LLM episodeNumber**: 以 deterministic parser 重新解析为准
4. **`disableChunking: true`**: 所有 LLM 调用禁止后端自动分段
5. **`buildUnits()` 保持同步**: 异步逻辑在外层 orchestration
6. **用户手动修正不可被自动覆盖**: scriptText 微调时保留, 全文替换时重置
7. **分块仅因上下文窗口限制**: 不做成本优化性质的摘录/采样
