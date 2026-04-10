# 章节划分 Plan C Phase 3 — 综合改进方案

> 综合 Codex（后端）+ Gemini（前端）+ 网络调研 + claude-code-sourcemap 探索结果
> 日期: 2026-04-10

## 目标

修复评分算法 bug、提升摘要性能 3-4x、改进 UX 反馈和交互。

---

## Sprint 1: 后端算法修复 + 性能提升

### R1: 修复 `scoreNarrativeShift` (P0, ~15 行)

**文件**: `candidateScorer.ts`

**问题**: `split('')` 单字符重叠对中文无区分度，最高权重维度 (0.30) 失效。

**方案**:
- 归一化摘要文本（去前缀、标点、空白）
- 中文 bigram Jaccard 距离
- `narrativeShift = lexicalShift * 0.72 + toneShift * 0.28`
- tone 缺失时使用中性值 0.35

### R2: 扩展悬念关键词为分级词典 (P1, ~40 行)

**文件**: `candidateScorer.ts`

**问题**: 11 个平铺关键词，无分级/位置加权。

**方案**:
- 40-60 词分四级: critical(0.38) / strong(0.24) / medium(0.14) / weak(0.08)
- 前后不对称: `endHookScore * 0.68 + openingPullScore * 0.24 + diversityBonus + escalationBonus`
- 同层多次命中取 max，防刷分

### R6: 并行化摘要 batch (P0, ~30 行)

**文件**: `summaryService.ts`

**问题**: 13 batch 串行 ≈ 78s。

**方案**:
- 复用 `frontend/src/utils/concurrency.ts` 的 `runWithConcurrency()`
- 默认 concurrency=3, 上限 4
- 进度按完成数推进
- 局部 batch 失败仅该 batch 回退

**预期**: 78s → 26-32s (2.5x 加速)

### R7: 自适应 batch 大小 (P1, ~30 行)

**文件**: `summaryService.ts`, `types.ts`

**问题**: 固定 BATCH_SIZE=8 / MAX_PROMPT_CHARS=24000，未利用大窗口模型。

**方案**:
- 新增 `ChapterPlanningSummaryTuning` 接口
- 基于 `contextWindowTokens` 计算 `usableInputTokens`
- 安全系数 `promptSafetyRatio = 0.78`
- 大窗口(128K): batchSize≈16 → 7 batch → 进一步减半

**预期**: 配合 R6, 总耗时 78s → ~18s (4.3x 加速)

---

## Sprint 2: 前端 UX 快速提升

### 2.1: 多阶段 Steps 进度 (P0)

**文件**: `ScriptStudioPanel.tsx`

**方案**:
- `PLANNING_STEP_MAP` 映射 7 个 stage → Ant Design `Steps`
- 每阶段显示名称 + 描述 + 当前进度
- 保留底部进度条显示百分比

### 3.1: 可展开章节卡片 (P0)

**方案**:
- `Collapse` + `Panel` 替代扁平 `List`
- 折叠态: 编号 + 标题 + 集范围 tag
- 展开态: 字数 tag, 单元数 tag, plotSummary (带左边框样式)

### 5.1: 配置/执行分离 (P0)

**方案**:
- `Card` 组件包裹配置（Slider + InputNumber + 模式按钮）
- "跳过划分" 移到右上角
- 配置面板执行期间 disabled

### 验证状态徽标 (P1)

**方案**:
- `validation.valid` → 绿色 CheckCircle
- `validation.issues` → 黄色 Exclamation + Tooltip
- `usedFallback` → 橙色 Tag
- `durationMs` → ClockCircle + 耗时

---

## 文件变更矩阵

| 文件 | Sprint | 变更内容 |
|------|--------|---------|
| `candidateScorer.ts` | S1 | R1: bigram Jaccard; R2: 分级 hook 词典 |
| `summaryService.ts` | S1 | R6: 并行化; R7: 自适应 batch |
| `types.ts` | S1 | 新增 `ChapterPlanningSummaryTuning` |
| `ChapterPlanningService.ts` | S1 | 透传 summaryTuning |
| `index.ts` | S1 | 导出新类型 |
| `candidateScorer.test.ts` | S1 | bigram、hook tier 测试 |
| `summaryService.test.ts` (新增) | S1 | 并发、batch planner、局部失败测试 |
| `ScriptStudioPanel.tsx` | S2 | Steps 进度、Collapse 卡片、配置分离、状态徽标 |

## 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| 供应商限流 429 | 中 | 并发上限锁 3; 局部回退 |
| 评分分布漂移 | 中 | 先做离线回放对比 |
| token 估算偏差 | 中 | 保留 22% 安全余量 |

## 延期项 (后续 Sprint)

- 确定性 fallback 升级为 DP 最优搜索
- 新增 temporalGap 时间跳跃维度
- 摘要缓存层 (IndexedDB)
- 两阶段 LLM 选择
- 交互式时间轴 (拖拽边界)
- 导出 JSON/Markdown
