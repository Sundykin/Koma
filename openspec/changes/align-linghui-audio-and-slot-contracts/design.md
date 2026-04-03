## Context

当前灵绘节点系统的问题不只是执行逻辑本身，还包括“节点对外暴露了什么契约”。如果 UI 告诉用户某个输入槽位可连接，或者某个节点支持 TTS，但实际执行层不消费该输入、也不给用户配置关键参数，这就是契约不一致。

这次 change 不扩大到视频节点真正消费音频轨道，因为现有 ITV request/provider 栈还没有对应字段。我们只处理当前已经有底层能力、但节点层没有闭环的部分。

## Goals / Non-Goals

**Goals**

- 阻止新的无效图片连线进入 text / audio / script 节点
- 让音频节点能显式选择 TTS `voiceId`
- 让执行层与音频节点 UI 使用同一份 `voiceId` 契约
- 用单元测试覆盖连接校验和音色透传行为

**Non-Goals**

- 不在本轮为视频节点新增 `audioTrack` 到 ITV request/provider 的跨层协议
- 不重构节点 handle 渲染结构或重排已有槽位索引
- 不处理所有语义不够直观的 textSnippet 合并规则

## Decisions

### Decision: 用连接校验阻止新的无效图片输入

我们不直接重排 text / audio / script 节点的槽位索引，因为这会影响现有边的 `input-N` 编号。改为在连接校验阶段阻止以下连接：

- image -> text 节点的图片参考槽位
- image -> audio 节点的图片参考槽位
- image -> script 节点的图片参考槽位

Why:

- 可以立即阻止新的无效连接
- 不会因为槽位索引变化破坏已有画布边数据

### Decision: 音频节点属性显式持有 `voiceId`

音频节点将增加 `voiceId` 属性，默认为空；执行层遵循：

- 用户选了 `voiceId` 就优先使用
- 用户没选时才回退到 provider 默认音色 / 第一个可用音色

Why:

- 当前 provider 栈本来就支持 `voiceId`
- 节点层只差最后一段属性和 UI 传递

### Decision: 音频编辑器动态加载当前 TTS provider 的音色列表

`AudioNodeEditor` 在 `ttsSelection` 变化时尝试读取 provider `listVoices()`，将返回值映射为 `Select` 选项；如果用户已有自定义 `voiceId` 但不在列表里，则保留为可见选项。

Why:

- 这样无需额外维护一份静态音色表
- 不同 provider 的音色差异可以自然暴露给用户

## Risks / Trade-offs

- 旧工作区里已经连到这些无效图片槽位的边不会自动迁移；本次主要保证“新的无效连接不再产生”
- 某些 provider 的 `listVoices()` 可能较慢或失败，因此音频编辑器需要在失败时优雅降级为无音色列表

## Migration Plan

1. 先补 OpenSpec 和测试，锁定无效连接与 voiceId 契约
2. 再改类型与执行层，让 `voiceId` 真正贯通到 provider 调用
3. 最后改音频编辑器，显示当前 TTS provider 的音色列表

## Open Questions

- 后续是否需要把 text / audio / script 节点那些“只消费 `.text` 字段”的 video/audio 槽位也做更强的语义收口，可以作为下一轮继续推进
