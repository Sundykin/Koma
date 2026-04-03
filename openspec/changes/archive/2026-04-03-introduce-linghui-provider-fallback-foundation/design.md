## Context

灵绘已经具备两块可以直接复用的基础能力：

- 渠道解析层能根据媒体类别与 capability 找到当前可用模型
- 图片 / 视频执行层已经把 Provider 调用集中在 `linghuiExecutionProviders.ts`

但两者之间还缺一层“执行策略”：

- 当前只会解析一个 Provider 并直接调用
- 一旦 Provider 配置失效、任务提交失败或轮询超时，节点会立刻失败
- 结果 metadata 中没有记录当前到底尝试过哪些 Provider

5.3.4 的完整终态还包括手动切换与参数降级，但作为 foundation slice，先补上自动 fallback 与透明尝试轨迹，能最大化复用现有代码，同时避免 UI 面与交互面一下子扩得过大。

## Goals / Non-Goals

**Goals:**

- 为图片与视频执行建立同能力 Provider fallback 候选计划
- 在 Provider 不可用、提交失败或轮询失败/超时时自动切换到下一个候选
- 对 fallback 总尝试次数设置上限
- 在成功结果 metadata 与最终失败错误中暴露 Provider 尝试摘要
- 保持现有图片 / 视频请求编译逻辑与 Provider 工厂不被推翻

**Non-Goals:**

- 不在本轮接入文本或 TTS 的 fallback
- 不实现用户执行中手动切换 Provider 的 UI
- 不实现 4K → 1080p → 720p 的参数降级链路
- 不新增全局 Provider 健康探测或独立后台熔断系统

## Decisions

### Decision: 候选计划只从“同媒体类别 + 同 capability + 已启用配置”中生成

候选集合直接基于当前 settings 中已启用的渠道模型解析，保持：

- 当前节点显式选择的 selection 优先
- 如果显式选择不可用，则退回 capability 过滤后的可用列表顺序
- 只在同一媒体类别内部切换，不跨到其他类别

Why:

- 能与现有 `resolveConfiguredChannelModel()` / capability 模型保持一致
- 避免切到不支持当前请求契约的模型
- 配置顺序本身已经是当前用户最接近“偏好顺序”的信号

### Decision: 自动 fallback 只覆盖图片与视频执行中的 Provider 阶段

首版在以下阶段触发 fallback：

- Provider 创建失败 / `validate()` 失败
- `start()` 提交任务失败
- 异步任务轮询失败或超时

首版不试图对所有编译期错误都兜底；节点输入缺失等前置校验继续由节点执行器负责。

Why:

- 这些都是最典型的“换一个 Provider 可能恢复”的故障
- 输入缺失属于用户侧问题，不应该靠重试隐藏
- 这样可以把 fallback 插在现有执行流程里，而不重写整条编译链

### Decision: 总尝试次数有界，首版限制为最多 3 次

候选计划允许存在多个可用模型，但首版每次节点执行最多尝试 3 个 Provider（包含首选）。

Why:

- 防止候选过多时把一次失败放大为长时间串行等待
- 对视频这种长任务尤其重要
- 足以覆盖“主选 + 两个备选”的常见配置规模

### Decision: 成功结果和失败错误都要携带尝试摘要

首版不新增专门 UI，而是先把 fallback 轨迹写进结果 metadata，并在最终失败时拼装聚合错误消息。

Why:

- 让执行结果具备可追溯性
- 不需要额外侵入画布 UI 就能让下游调试和日志获益
- 为后续把尝试轨迹做成显式 UI 留出数据基础

## Risks / Trade-offs

- [不是所有错误都适合 fallback] → 通过把范围限制在 Provider 阶段，并继续依赖节点前置校验来降低误重试
- [串行尝试可能拉长失败路径] → 通过最多 3 次尝试控制最坏时延
- [首版没有手动切换 UI] → 自动恢复能力先落地，后续再补交互层

## Migration Plan

1. 在渠道解析层补齐 fallback 候选计划能力
2. 在图片 / 视频执行链路接入有界 fallback runner
3. 写入结果 metadata 与聚合失败消息
4. 补充 resolver 与 provider 执行测试

## Open Questions

None.
