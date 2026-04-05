## Why

`docs/linghui-architecture-analysis.md` 指出了多处灵绘节点执行层的契约偏差，其中有几类问题会直接让用户得到“看起来能连、实际没生效”或“输入被静默丢弃”的结果：

- 多角度图片节点在缺少参考图时会静默回退为普通文生图，且用户填写的 prompt 不会进入多角度请求
- 上游批量图片结果向下游传播时只传 `primary`，其余图片会被丢弃
- 脚本节点自定义 `systemPrompt` 会覆盖结构化 JSON 约束，导致结果无法解析
- 手动脚本节点在静态解析路径中不输出结构化 `shots`，使 `resolveTargetsOnly` 下的下游节点拿不到完整分镜数据

这些问题都属于执行契约层的高优缺陷，适合先作为一轮独立 change 落地，而不是和更大的架构演化改造混在一起。

## What Changes

- 收紧多角度图片执行契约：缺少上游参考图时明确失败，不再静默降级为普通文生图
- 保留多角度图片的用户 prompt，使其在专用接口和通用图生图回退路径中都能参与请求编译
- 调整共享参考图收集逻辑，让批量图片结果的全部唯一图片都能向下游节点传播，并保持选中主图优先
- 调整脚本节点的系统提示词拼装方式，保留结构化 JSON 输出约束，同时允许用户追加补充要求
- 让手动脚本节点在静态解析路径中复用统一解析器，输出 `formattedText` 与 `shots`
- 补充对应的执行层与工作流测试

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 修正图片节点、脚本节点和共享执行工具的契约，使多角度、生图引用和脚本静态解析行为与用户预期一致

## Impact

- Affected specs: `linghui-studio`
- Affected code:
  - `frontend/src/components/linghui/linghuiExecutionNodeExecutors.ts`
  - `frontend/src/components/linghui/linghuiExecutionProviders.ts`
  - `frontend/src/components/linghui/linghuiExecutionShared.ts`
  - `frontend/src/components/linghui/linghuiScriptNodeUtils.ts`
  - `frontend/src/services/promptCompilation/multiAnglePromptCompiler.ts`
  - `frontend/src/components/linghui/linghuiExecutionWorkflow.test.ts`
  - `frontend/src/components/linghui/linghuiExecutionProviders.test.ts`
  - `frontend/src/components/linghui/linghuiExecutionVideoNode.test.ts`
