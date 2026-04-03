## Context

仓库中已经存在可执行的 chat agent 基础设施：`createLLM`、`createAgentGraph`、`streamAgentGraph`、MCP tool 列表，以及前端可调用的 `chatIPC` 会话接口。但灵绘目前只有 `text / image / video / audio / script` 五类节点，执行层也只认这五类节点，无法把 Agent 推理放进工作流图。

同时，这条链路有两个现实约束：

- chat Agent 的 session config 当前只稳定支持 `openai / anthropic / google` 这类 chat-compatible 渠道
- `ChatService.contentToHumanMessage()` 当前只明确支持文本和图片 content part，文件/音频/视频附件还没有在单 agent 流里透传

因此，5.2.2 的第一块应当优先做一个可执行、边界清晰的 foundation slice，而不是试图一次吞下多 worker 编排、所有媒体类型和专门的 trace UI。

## Goals / Non-Goals

**Goals:**

- 引入 `linghui/agent` 节点类型，并让其能被画布创建、编辑、运行和导出
- 让 agent 节点首版支持上游文本和图片输入
- 复用现有 chat `streamAgentGraph` 与 MCP tool 体系，执行后返回文本结果
- 把 reasoning 与 tool trace 收进 `LinghuiNodeResult.metadata`
- 为 `maxIterations` 提供首版显式限制，避免工具循环失控

**Non-Goals:**

- 不在本轮引入 orchestrated / supervisor 多 worker 模式
- 不在本轮为 agent 节点增加专门的 reasoning 可视化面板
- 不在本轮支持音频、视频、任意文件附件输入
- 不把通用 chat session 生命周期抽象成新的灵绘专用服务层

## Decisions

### Decision: 首版 agent 节点输出仍然使用 `text` result，而不是新增独立 result kind

Agent 节点第一版的用户价值主要在于“通过工具与推理得出文本结论”，因此结果可直接落到现有 `LinghuiTextResult`，额外的 reasoning / tool trace 放进 metadata。

Why:

- 现有节点卡片、执行记录、导出和下游文本消费链路都已经能处理 `text` result
- 可以用最小改动把 agent 节点闭环跑通
- 后续如果需要 richer trace UI，再在 metadata 基础上扩展即可

Alternatives considered:

- 新增 `agent` result kind：语义更强，但会扩大导出、预览、下游消费和结果类型判断的改动面

### Decision: 首版输入只支持“文本 + 图片参考”

Agent 节点输入槽定义为图片参考和文本输入，执行时把文本合并进用户消息，把图片转为 data URL 后作为 chat image part 发送。

Why:

- 这已经覆盖“读图分析 + 生成描述/结论”的高价值链路
- 现有单 agent 流确认支持 text/image content part
- 避免首版把音频/视频文件透传和文件序列化问题一起引入

Alternatives considered:

- 复用文本节点的四输入布局：形式上统一，但会暴露暂时不会被消费的音频/视频输入，造成误导

### Decision: 通过一次性临时 chat session 执行 agent 节点

每次执行 agent 节点时创建一个临时 session，订阅当前 session 的 stream 事件，收集 chunk / tool / done / error，完成后立即释放 session。

Why:

- 最大化复用现有 `chatIPC` 和 Electron chat service
- 不需要额外维护灵绘侧长生命周期会话缓存
- 单节点执行完成即释放，状态边界清晰

Alternatives considered:

- 为每个 agent 节点持久化 session：后续可能有价值，但当前会引入更多工作区状态同步问题

### Decision: `maxIterations` 通过工具轮次上限在前端执行侧显式约束

当前 `streamAgentGraph` 单 agent 路径没有直接暴露内建迭代上限，因此首版在灵绘执行侧统计工具调用轮次，超过阈值后主动取消当前 session 并报错。

Why:

- 满足节点属性对“防死循环”的基本语义承诺
- 不需要先改造整条 chat agent 架构

Trade-off:

- 首版更接近“工具轮次上限”而非底层 LangGraph 的精确 step limit，但对用户语义已经足够接近

### Decision: LLM 选择沿用灵绘现有 `llmSelection`，但增加 chat-compatible 渠道校验

Agent 节点编辑器继续使用灵绘当前的 LLM 渠道选择方式；执行时把所选渠道映射为 chat session config。如果 provider 不属于当前 chat 支持集合，则明确报错。

Why:

- 保持灵绘节点配置体验一致
- 避免为 agent 节点单独引入第二套 LLM 选择器

## Risks / Trade-offs

- [本地图片需要转换为 data URL，执行前有额外序列化开销] → 首版只支持少量图片参考，并在实现上复用现有 preview source / fetch 流程
- [chat-compatible provider 约束可能与灵绘一般 LLM 节点不一致] → 在编辑和执行提示中明确错误原因，避免静默失败
- [tool 事件数量被用作迭代近似值，极端场景下不等于底层精确 step 数] → 在 metadata 中记录实际 observed tool rounds，后续若 chat 内核补齐原生限制可无缝替换
- [临时 session 执行需要正确清理监听器] → 将会话创建、事件订阅、取消与 dispose 封装到单个 provider helper 中统一清理

## Migration Plan

1. 增加 agent 节点类型、属性、节点定义和节点组件
2. 增加 agent 编辑器与工具列表加载
3. 在执行 providers / executors 中接入 chat agent 流
4. 补充定向测试，验证节点执行、provider 映射和结果 metadata

## Open Questions

None.
