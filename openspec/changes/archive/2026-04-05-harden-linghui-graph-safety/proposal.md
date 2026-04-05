## Why

架构分析文档指出了两类“平时不容易注意，但出问题时很难排查”的安全缺口：

- 执行引擎在遇到有环图时不会给出明确错误，而是把未排序节点静默追加到末尾
- `rfTypeToLinghuiType()` 依赖正则替换，存在把未知类型错误映射为合法节点类型的边界风险

这两处都适合用一个小 change 直接补强，因为改动范围可控、收益明确。

## What Changes

- 在灵绘工作流执行前对待执行子图做显式环检测，遇到循环依赖时返回明确错误
- 停止在拓扑排序中静默追加环节点
- 用显式映射表替代 `rfTypeToLinghuiType()` 的字符串正则替换
- 补充执行层环依赖测试和类型映射测试

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 强化工作流执行前的图安全校验，并收紧 RF/灵绘节点类型转换契约

## Impact

- Affected specs: `linghui-studio`
- Affected code:
  - `frontend/src/components/linghui/linghuiExecutionWorkflow.ts`
  - `frontend/src/components/linghui/linghuiExecutionWorkflow.test.ts`
  - `frontend/src/types/linghui.ts`
  - `frontend/src/types/linghui.test.ts`
