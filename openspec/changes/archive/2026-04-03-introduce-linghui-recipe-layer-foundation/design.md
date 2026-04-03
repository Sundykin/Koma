## Context

灵绘现在已经有一套“保存工作流模板 -> 模板库展示 -> 发送回画布”的闭环，但它只覆盖工作区内用户手动保存的模板记录：

- 模板数据结构没有显式来源字段，无法区分系统预设和工作区快照
- 模板库把所有模板都当成同一类卡片展示，无法承载 Recipe Layer 的“系统配方”
- 架构文档提出的角色设计流、分镜创作流、配音工作流，暂时没有一个可以直接落地的承载层

5.2.4 的第一块不需要一口气做模板编辑器、Recipe Marketplace 或参数化 N 分支。更合适的 foundation slice，是先把系统预设 Recipe 作为模板记录并入现有模板库，使“内置配方”和“工作区模板”能共用同一套插入协议与 UI。

## Goals / Non-Goals

**Goals:**

- 为工作流模板记录引入 `source` / `kind` / `recipeKey` 元数据
- 定义首批系统内置 Recipe 模板，并将其表达为可直接发送到画布的 snapshot
- 让模板库读取逻辑合并系统 Recipe 与工作区模板
- 在模板抽屉中展示模板来源、Recipe 标签和描述，突出系统预设

**Non-Goals:**

- 不在本轮实现模板编辑器、拖拽式 Recipe 编排器或云端模板市场
- 不在本轮支持参数化动态展开（如真正的 `[image × N]` 自动生成）
- 不修改现有“发送到画布”的插入协议
- 不引入新的工作区存储格式版本迁移

## Decisions

### Decision: 将 Recipe Layer 表达为内置的 `LinghuiWorkflowTemplateRecord`

首版不新增独立的 Recipe Store，而是把系统预设 Recipe 映射成与工作区模板同构的模板记录，并复用现有 `snapshot -> addWorkflowTemplate()` 插入协议。

Why:

- 最小化改动面，直接复用现有模板插入能力
- 内置 Recipe 与工作区模板可以共享同一套列表 UI
- 后续若需要云端模板，只需继续扩展来源类型而不用重写消费方

### Decision: 模板元数据显式区分 `source` / `kind` / `recipeKey`

工作区模板记录新增：

- `source`: `system | workspace`
- `kind`: `recipe | saved-workflow`
- `recipeKey?`: 仅系统 Recipe 使用

Why:

- “系统配方”和“用户保存模板”是两个稳定维度，应该从数据层显式表达
- 旧记录可以在读取时默认补成 `workspace + saved-workflow`
- UI 不需要再通过名称猜测模板类型

### Decision: 系统 Recipe 以代码静态定义，不预写入工作区

系统 Recipe 模板由代码直接生成，不写入用户工作区索引文件；读取模板库时再与工作区模板合并。

Why:

- 避免首次进入工作区时产生额外写盘副作用
- 保持 Recipe 定义可随版本演进
- 不污染用户的模板索引文件

### Decision: 只做三套“最小可用”的 Recipe 预设

首版提供：

- 角色设计流：`text -> image -> image -> video`
- 分镜创作流：`text -> script -> [image x 2] -> [video x 2]`
- 配音工作流：`script -> [text x 2] -> [audio x 2]`

这些 Recipe 先通过固定节点数表达“推荐骨架”和默认参数，不做动态 N 展开。

Why:

- 与架构文档中的三个模板方向直接对齐
- 足够证明 Recipe Layer 已经落地
- 避免在 foundation 阶段引入复杂的参数化模板运行时

## Risks / Trade-offs

- [系统 Recipe 先用固定节点数量表达] → 可读性高、实现简单，但还不等于真正参数化模板；后续可在 `recipeKey` 之上继续扩展
- [模板类型兼容旧记录] → 需要在读取时做默认归一化，避免旧模板因为缺少字段而被识别错误
- [系统 Recipe 与工作区模板共用列表] → 需要在 UI 中显式区分来源，否则仍会让用户混淆

## Migration Plan

1. 定义 Recipe 模板快照与模板元数据
2. 合并系统 Recipe 与工作区模板读取结果
3. 调整模板库展示，让系统 Recipe 与工作区模板可区分
4. 补充模板列表与元数据测试

## Open Questions

None.
