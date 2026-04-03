## Why

灵绘当前点击“运行全部”或“运行选中”后会直接进入执行队列，用户在真正提交前看不到本轮会跑哪些节点、并行度如何、预计耗时多久，也无法提前识别明显的瓶颈分支。这让复杂工作流的执行更像“盲跑”，与架构文档中提出的 SQL EXPLAIN 式执行计划存在明显缺口。

## What Changes

- 新增灵绘执行计划构建服务，在执行前分析目标节点、依赖层级、并行波次和瓶颈节点
- 基于节点历史运行时长与节点类型兜底启发式，生成预估总耗时
- 在运行全部与运行选中前弹出执行计划确认弹窗，展示节点规模、波次、最大并行度、瓶颈节点和耗时估算
- 对当前缺少稳定 provider 定价元数据的情况，显式标记成本为“暂不可估”，而不是伪造价格
- 保持单节点快速运行路径不变，先把 Explain 能力接到批量执行入口

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 灵绘在批量执行前需要生成可确认的执行计划，并向用户展示并行度、预计耗时和瓶颈信息

## Impact

- Affected specs:
  - `linghui-studio`
- Affected code:
  - `frontend/src/components/linghui/linghuiExecutionWorkflow.ts`
  - `frontend/src/components/linghui/` 下新增执行计划分析与弹窗组件
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/` 下相关测试
