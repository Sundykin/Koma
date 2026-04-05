## Context

当前 `LinghuiNodeResult` 把 `text`、`primary`、`items`、`shots` 全部定义为可选字段。虽然有 `kind`，但类型系统并没有把“`kind === 'storyboard'` 时一定有 `shots`”这类约束表达出来。

结果是：

- 执行层和 UI 层存在大量 `result?.primary?.source` 之类的弱类型读取
- 静态结果解析、预览组件、提示词引用和导出逻辑都各自做了重复容错
- 修改结果结构时，很难靠编译器发现遗漏消费点

## Goals / Non-Goals

**Goals**

- 把 `LinghuiNodeResult` 改为真正的 discriminated union
- 让单图、多图、视频、音频、文本、分镜的核心字段在对应分支中成为必填
- 为常见消费路径提供统一 helper，减少重复的 `kind` 分支
- 用测试覆盖关键结果形态和典型消费者

**Non-Goals**

- 不在本轮为每种结果的 `metadata` 建立完整的强类型领域模型
- 不引入新的结果 `kind`
- 不改变现有工作流执行语义或导出格式

## Decisions

### Decision: 先收紧结构字段，再逐步收紧 metadata

本轮优先让 `text`、`primary`、`items`、`shots` 这些核心结构字段与 `kind` 对齐；`metadata` 仍保留为可扩展对象，但允许附带少量通用字段。

Why:

- 这是最大收益、最小风险的第一步
- 现有 `metadata` 形态分散，强行一次性完全建模会把 change 范围放大太多

### Decision: 提供统一 result helper

除了类型定义外，还会提供一组轻量 helper，用于读取 primary media、文本、shots、items 和计数信息。

Why:

- 可以让旧消费点快速迁移到统一入口
- 避免在每个组件里重复手写相似的 `switch (result.kind)`

### Decision: 优先改“生产点 + 核心消费点”

先更新结果生产点（静态解析、节点执行器）和核心消费点（预览、编辑器、导出、存储），再由编译器帮助发现遗漏。

Why:

- 这些路径覆盖了灵绘结果对象的大部分真实使用方式
- 可以确保改动不是“类型定义看起来更严，但运行时代码仍按旧模型访问”

## Risks / Trade-offs

- [少量 UI/存储代码需要同步迁移] → 用 helper 收敛访问方式，并补 targeted tests
- [仍保留宽泛 metadata] → 本轮先解决结构安全问题，后续再按节点类别逐步收紧 metadata
- [历史快照中的旧结果结构可能仍然存在] → helper 保持兼容读取，避免旧 workspace 数据直接失效

## Migration Plan

1. 先定义新的 `LinghuiNodeResult` 联合类型和 helper
2. 更新静态结果解析与节点执行器，确保生产的新结果符合新契约
3. 迁移核心消费者与测试
4. 跑 targeted tests，确认主要链路未回归

## Open Questions

None.
