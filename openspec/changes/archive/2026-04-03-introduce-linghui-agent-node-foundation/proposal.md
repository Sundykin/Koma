## Why

灵绘当前虽然能编排文本、图片、视频、音频和脚本节点，但还不能把现有的 Agent 推理与工具调用能力接入同一张工作流图中。这让“读图分析、调用工具检索、整理文本结论、再驱动下游生成”这类需要自主推理的链路仍然被迫跳出灵绘画布。

## What Changes

- 为灵绘引入首个 `linghui/agent` 节点类型，支持在画布中配置 Agent 提示词、工具白名单、LLM 选择和最大迭代数
- 为 agent 节点提供首版编辑器和节点卡片，复用现有灵绘节点编辑与运行体验
- 在执行层接入现有 chat `streamAgentGraph` 能力，让 agent 节点可以消费上游文本与图片参考，并产出文本结果
- 将 Agent 的 reasoning、工具调用与工具结果收敛到节点结果 metadata，供后续 UI 和导出能力继续消费
- 对首版能力做显式边界约束：先支持 single-agent 执行、文本结果和 chat-compatible LLM 渠道，不在本轮引入 orchestrated worker、多媒体文件输入或专用 trace 面板

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 灵绘工作流需要支持可执行的 Agent 节点，使画布内节点可以触发 Agent 推理与工具调用并输出文本结果

## Impact

- Affected specs:
  - `linghui-studio`
- Affected code:
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/components/linghui/linghuiExecutionProviders.ts`
  - `frontend/src/components/linghui/linghuiExecutionNodeExecutors.ts`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/` 下新增或更新 agent node / editor 组件
  - `frontend/src/chat/ipc/chatIPC.ts`
  - `frontend/src/components/linghui/linghuiResultExport.ts`
  - `frontend/src/components/linghui/` 下相关测试
