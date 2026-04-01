# Task Plan: SoulArtisan vs Koma 对标分析

## Goal
基于 `/Users/sunmeng/workspace/SoulArtisan` 与 `/Users/sunmeng/workspace/Koma` 的真实代码，对比两者的产品边界、前端形态、后端/系统能力、AI 能力组织方式与平台化潜力，最终推演 Koma 的发展方向。

## Current Phase
Phase 5

## Phases
### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document initial findings in findings.md
- **Status:** completed

### Phase 2: Codebase Exploration
- [x] Map both repositories' top-level structures
- [x] Read key entry points, route files, and representative APIs
- [x] Collect parallel analysis from 2 frontend + 2 backend agents
- **Status:** completed

### Phase 3: Synthesis
- [x] Summarize product-form differences
- [x] Summarize system-layer differences
- [x] Identify Koma's strongest moat and weakest gap
- **Status:** completed

### Phase 4: Verification
- [x] Re-check key claims against source files
- [x] Ensure each conclusion has file evidence
- [x] Note any uncertainty explicitly
- **Status:** completed

### Phase 5: Delivery
- [x] Deliver a structured Chinese report
- [x] Include clickable file references
- [x] Keep focus on the five requested questions
- **Status:** in_progress

## Key Questions
1. SoulArtisan 与 Koma 分别服务什么用户、解决什么问题？
2. 两者在前端产品形态与创作工作流上的根本差异是什么？
3. 两者在 AI 能力组织、任务执行、资产沉淀上的差异是什么？
4. Koma 当前最强的技术势能与最明显的产品短板是什么？
5. 面向未来，Koma 应该沿什么方向发展，避免与 SoulArtisan 同质化竞争？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 采用 2 前端 + 2 后端并行分析 | 按用户要求组建团队，同时减少单线偏见 |
| 先厘清 SoulArtisan 的业务边界，再评估 Koma 的方向 | 避免只从技术先进性出发做错误战略判断 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 首次 `spawn_agent` 同时传入 `message` 和 `items` 导致创建失败 | 1 | 改为只使用 `message` 参数重新派发 |

## Notes
- 重点关注“已实现事实”与“可推演方向”的边界，避免把愿景当成现状。
- Koma 侧重点是 Electron、本地资产、统一能力层；SoulArtisan 侧重点是站点运营、任务平台、多入口产品矩阵。
