# 转场文档地图

> 状态：索引页
> 作用：用最短路径说明“先看什么、每份文档负责什么、哪里才是正式需求来源”。

---

## 1. 一句话规则

- **正式需求 / 设计 / 任务基线**：看 `openspec/changes/update-transition-semantics-migration/`
- **docs 下的文件**：用于路线说明、架构冻结、范围控制、实施拆分与导航，不再重复维护一份平行正式需求
- **真实代码实施顺序参考**：看 `/Users/mjy/.claude/plans/precious-roaming-moth.md`

---

## 2. 当前推荐阅读顺序

| 顺序 | 文档 | 作用 |
|---|---|---|
| 1 | `openspec/changes/update-transition-semantics-migration/proposal.md` | 为什么要做这次变更、目标和成功标准是什么 |
| 2 | `openspec/changes/update-transition-semantics-migration/design.md` | 正式设计结论：唯一真值、时间语义、preview/export 关系、能力边界 |
| 3 | `openspec/changes/update-transition-semantics-migration/specs/*/spec.md` | 分 capability 的正式需求增量 |
| 4 | `openspec/changes/update-transition-semantics-migration/tasks.md` | 正式任务拆分与实施基线 |
| 5 | `docs/transition-adr-v1.md` | 架构冻结决策 |
| 6 | `docs/transition-minimum-semantics-v1.md` | Phase 1 最小语义、范围和 Go/No-Go |
| 7 | `docs/transition-phase-gates-v1.md` | Gate / Stop-Loss / 阶段推进控制 |
| 8 | `docs/implementation-breakdown-v1.md` | docs 层实施分段与推荐顺序 |
| 9 | `/Users/mjy/.claude/plans/precious-roaming-moth.md` | 当前最贴近真实代码落点的 implementation planning |

---

## 3. docs 下各文档分工

| 文档 | 负责回答的问题 | 不负责什么 |
|---|---|---|
| `transition-doc-entry.md` | 转场文档入口、阅读顺序、边界说明 | 不再承担完整设计正文 |
| `transition-long-term-plan-v1.md` | 长期路线、Phase 1/2/3 主线、明确不走的路线 | 不定义当前正式需求细则 |
| `transition-adr-v1.md` | 架构冻结决策，例如关系对象、唯一真值、cut-point-first、双管线 | 不展开实施任务明细 |
| `transition-minimum-semantics-v1.md` | Phase 1 最小语义契约、生命周期规则、Go/No-Go | 不替代 OpenSpec spec deltas |
| `transition-phase-gates-v1.md` | Gate、Stop-Loss、推进控制规则 | 不替代正式任务或实现计划 |
| `implementation-breakdown-v1.md` | Segment 0~5 的实施拆分与验收方向 | 不替代逐文件实施计划 |

---

## 4. 不同角色怎么读

| 角色 | 建议先看 |
|---|---|
| 产品 / 需求 | `transition-long-term-plan-v1.md` → `transition-minimum-semantics-v1.md` → `proposal.md` |
| 架构 / 实现 | `transition-adr-v1.md` → `design.md` → `implementation-breakdown-v1.md` → `precious-roaming-moth.md` |
| 验收 / 范围控制 | `transition-phase-gates-v1.md` → `specs/*/spec.md` → `tasks.md` |

---

## 5. 边界约定

- 不再在 `docs/` 中维护与 OpenSpec 平行的“正式需求全文”
- 不再把团队讨论记录直接写成当前需求正文
- 不再把 AI 推荐、WebGL、GPU、资源型 transition、插件化 transition 等远期内容混入当前 Phase 1 文档
- 当前 Phase 1 的核心只围绕：
  - `Track.transitions[]` 作为唯一编辑真值
  - `Clip.transition` 仅兼容读取
  - same-track adjacent cut point
  - fade-only
  - overlap 时间语义
  - preview + 至少一条 export 链路闭环

---

## 6. 最短结论

如果你只想抓住当前要做的事，就记住下面 3 句：

1. **正式需求先看 OpenSpec change。**
2. **docs 负责解释路线、边界、治理和实施拆分。**
3. **真正落代码时，以 implementation plan 为最近参考。**
