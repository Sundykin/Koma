# Task Plan: SoulArtisan 后端/业务中台能力分析

## Goal
基于 `SoulArtisan` 的 `admin-web/api`、`admin-web/pages`、`admin-web/store`、`agent-web/src`、文档和环境配置，分析其实际业务对象、数据与任务组织方式、AI 能力地位、商业化/运营化信号，并提炼对 `Koma` 的启发。

## Current Phase
Phase 1

## Phases
### Phase 1: Discovery
- [x] 扫描顶层结构与关键配置文件
- [ ] 记录多入口产品形态与疑似服务边界
- [ ] 建立研究档案
- **Status:** in_progress

### Phase 2: SoulArtisan Domain Mapping
- [ ] 读取根 README、子应用 README 与环境变量
- [ ] 扫描任务、用户、站点、积分、系统配置等模块
- [ ] 提炼业务对象与服务边界
- **Status:** pending

### Phase 3: Dataflow and AI Analysis
- [ ] 追踪 admin-web/api 与 agent-web/src/api 的请求模型
- [ ] 追踪任务、内容、站点、积分的数据组织方式
- [ ] 判断 AI 属于核心引擎还是附属增强
- **Status:** pending

### Phase 4: Koma Implications
- [ ] 对照 Koma 当前产品/系统边界
- [ ] 总结对 Koma 的产品化与中台化启发
- [ ] 标记确定结论与推断结论
- **Status:** pending

### Phase 5: Delivery
- [ ] 输出结构化中文结论
- [ ] 每个关键判断附文件证据
- [ ] 明确不确定项与推断依据
- **Status:** pending

## Key Questions
1. `SoulArtisan` 实际服务的业务对象是什么？
2. 其数据与任务如何组织，核心实体关系是什么？
3. AI 能力是业务核心还是附属能力？
4. 仓库中有哪些商业化/运营化信号？
5. 对 `Koma` 的产品边界和业务中台建设有什么启发？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 以“目录入口 + API 封装 + 状态层 + 页面模块 + 环境配置”五条线判断后端边界 | 竞品没有独立 backend，需要从接入面和业务模块反推真实中台 |
| 单独创建带前缀的规划文件 | 根目录已有其他分析任务的规划文件，避免互相覆盖 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 现有 `task_plan.md/findings.md/progress.md` 已被用于其他任务 | 1 | 改为创建带 `soulartisan_backend_` 前缀的独立研究档案 |

