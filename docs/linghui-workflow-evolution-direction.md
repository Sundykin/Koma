# Linghui 工作流演化方向

## 文档目的

沉淀一版可归档的方向性结论，明确 `Koma` 应如何借鉴 `SoulArtisan` 的工作流编排能力来演化 `Linghui`，同时避免走向高耦合、难维护的融合路线。

本文重点回答四个问题：

1. `Linghui` 是否应该与项目主线深度互相映射？
2. `SoulArtisan` 的工作流里，哪些东西值得借鉴？
3. `Koma` 当前在 `Linghui` 这一层真正的不足是什么？
4. 最合理的演化路线是什么？

## 结论摘要

- 结论一：`Linghui` 不应与项目主线做任意图结构级别的双向精确映射。
- 结论二：`Linghui` 应借鉴 `SoulArtisan` 的不是“具体节点实现”，而是“工作流配方层”。
- 结论三：`Koma` 应坚持“底层统一、上层分开”。
- 结论四：`Linghui` 当前最大的不足不是执行底座，而是缺少场景化编排、默认图谱和引导式扩展动作。

一句话概括：

`Koma` 不该把 `Linghui` 做成另一个 `SoulArtisan` 的工作流编辑器，而应该把 `Linghui` 做成建立在统一能力层之上的高级编排层，并通过“内置工作流配方”降低无限画布的认知负担。

## 已确认的边界

### 1. 底层统一

必须统一的是真相源，而不是界面形态。

需要统一的底层事实包括：

- 资产落盘和资产引用
- 任务状态与轮询恢复
- 渠道、模型与能力解析
- 生成结果的持久化和可追踪元数据

这条路线在 `Koma` 里已经有基础：

- [frontend/src/services/mediaPersistenceService.ts](/Users/sunmeng/workspace/Koma/frontend/src/services/mediaPersistenceService.ts)
- [frontend/src/services/mediaTaskBindingService.ts](/Users/sunmeng/workspace/Koma/frontend/src/services/mediaTaskBindingService.ts)
- [frontend/src/providers/channel/resolver.ts](/Users/sunmeng/workspace/Koma/frontend/src/providers/channel/resolver.ts)
- [frontend/src/store/taskQueueStore.ts](/Users/sunmeng/workspace/Koma/frontend/src/store/taskQueueStore.ts)
- [frontend/src/components/linghui/linghuiExecutionProviders.ts](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/linghuiExecutionProviders.ts)

### 2. 上层分开

不应要求项目主线与 `Linghui` 共用同一种用户心智。

- 项目主线应该继续使用“剧本、角色、场景、道具、分镜、视频”的阶段式语言。
- `Linghui` 应继续使用“节点、连接、编排、派生、批量执行”的高级工作流语言。

### 3. 明确放弃的方向

当前阶段不应推进以下路线：

- 任意 `Linghui` 节点图自动、完整映射回项目结构
- 任意项目结构完整反推回 `Linghui` 节点图
- 在节点组件内部直接堆积任务提交、轮询、业务副作用

原因很明确：

- `Linghui` 节点数量、层数、派生步数没有固定上限
- 分镜演进链路天然高度灵活
- 强做中层精确映射，复杂度与维护成本都会爆炸

## 从 SoulArtisan 借鉴什么

## 核心判断

`SoulArtisan` 值得借鉴的是“工作流产品化方法”，不是它当前节点实现细节。

其工作流体系有三层非常值得参考：

### 1. 工作流注册层

`SoulArtisan` 不是只有一个自由画布，而是通过注册表定义不同 workflow。

相关实现：

- [agent-web/src/components/dashboard/workflows/core/workflowRegistry.ts](/Users/sunmeng/workspace/SoulArtisan/agent-web/src/components/dashboard/workflows/core/workflowRegistry.ts)
- [agent-web/src/components/dashboard/workflows/core/types.ts](/Users/sunmeng/workspace/SoulArtisan/agent-web/src/components/dashboard/workflows/core/types.ts)
- [agent-web/src/components/dashboard/workflows/core/BaseWorkflow.tsx](/Users/sunmeng/workspace/SoulArtisan/agent-web/src/components/dashboard/workflows/core/BaseWorkflow.tsx)

它的价值在于：

- 一个编辑器壳可以承载多种工作流目标
- 工作流不是从“空白画布”开始，而是从“创作目标”开始
- 节点集合、工具栏、默认行为都可以随 workflow 切换

### 2. 场景化工作流配置

`SoulArtisan` 已经有不同场景的工作流配置，例如：

- 角色流程：[agent-web/src/components/dashboard/workflows/character-resource/config.ts](/Users/sunmeng/workspace/SoulArtisan/agent-web/src/components/dashboard/workflows/character-resource/config.ts)
- 分镜图流程：[agent-web/src/components/dashboard/workflows/storyboard/config.ts](/Users/sunmeng/workspace/SoulArtisan/agent-web/src/components/dashboard/workflows/storyboard/config.ts)

每个工作流配置里都定义了：

- 节点集合
- 节点分组
- 输入输出端口
- 默认数据
- 工具栏项目
- feature 开关

这让 workflow 更像“配方”，而不是“零件盒”。

### 3. 引导式扩展动作

`SoulArtisan` 的很多节点会主动帮用户补下一步。

例如：

- 分镜节点可以直接创建参考图节点、场景节点
- 图片展示节点可以直接转视频

相关实现：

- [agent-web/src/components/dashboard/nodes/StoryboardNode.tsx](/Users/sunmeng/workspace/SoulArtisan/agent-web/src/components/dashboard/nodes/StoryboardNode.tsx)
- [agent-web/src/components/dashboard/nodes/ImageDisplayNode.tsx](/Users/sunmeng/workspace/SoulArtisan/agent-web/src/components/dashboard/nodes/ImageDisplayNode.tsx)

这一点非常值得 `Linghui` 学习，因为它本质上是在降低无限画布的起手难度。

## 不应该借鉴什么

`SoulArtisan` 当前也有不适合迁移到 `Koma` 的实现方式。

### 1. 节点组件承担过多业务逻辑

其部分节点组件直接负责：

- 拉接口
- 轮询任务
- 修改节点数据
- 触发下游节点生成

这会导致：

- 节点组件职责过重
- 执行逻辑分散
- 调试和测试困难

`Koma` 当前更好的方向是执行层与节点 UI 分离：

- [frontend/src/components/linghui/linghuiExecutionWorkflow.ts](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/linghuiExecutionWorkflow.ts)
- [frontend/src/components/linghui/linghuiExecutionNodeExecutors.ts](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/linghuiExecutionProviders.ts)

### 2. 过强的项目耦合

`SoulArtisan` 的 workflow 和其平台项目体系是紧耦合的，这符合它的平台产品定位，但不适合 `Koma` 当前阶段。

`Koma` 的 `Linghui` 需要保留更高的自由度，不宜为了项目结构而压扁节点编排能力。

## Koma 当前 Linghui 的不足

## 1. 节点层过于统一，缺少“场景层”

`Linghui` 目前只有 5 类统一节点：

- `text`
- `image`
- `video`
- `audio`
- `script`

相关定义：

- [frontend/src/types/linghui.ts](/Users/sunmeng/workspace/Koma/frontend/src/types/linghui.ts)
- [frontend/src/components/linghui/linghuiNodeDefs.ts](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/linghuiNodeDefs.ts)

这套统一抽象本身没有错，但目前缺少一层：

- 这些基础节点如何组成“角色设定流程”
- 如何组成“分镜图流程”
- 如何组成“分镜视频流程”
- 如何组成“角色视频流程”

也就是说，`Linghui` 有基础积木，但没有官方配方。

## 2. 模板存在，但主要是“用户快照模板”

`Linghui` 已经支持保存工作流模板，但当前模板更像用户保存的子图快照，而不是系统内置的场景工作流。

相关实现：

- [frontend/src/store/linghuiStorage.ts](/Users/sunmeng/workspace/Koma/frontend/src/store/linghuiStorage.ts)
- [frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts)
- [frontend/src/components/linghui/LinghuiLibraryDrawer.tsx](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/LinghuiLibraryDrawer.tsx)

不足在于：

- 用户必须先会搭，才能存模板
- 模板是结果，不是引导入口
- 系统无法清晰表达“推荐从哪种工作流开始”

## 3. 连接规则偏通用，缺少创作语义

当前 `Linghui` 的连接校验主要基于数据类型匹配。

相关实现：

- [frontend/src/components/linghui/linghuiNodeDefs.ts](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/linghuiNodeDefs.ts)

这意味着系统知道：

- 图片不能直接接文本输入

但系统还不知道：

- 角色设定图链应该怎么串
- 分镜脚本链应该怎么展开
- 视频节点的某一路视觉输入在当前模式里到底是主图、参考图、首帧还是尾帧

目前视频能力层已经开始补这部分语义，但还只停留在视频节点内部：

- [frontend/src/components/linghui/videoCapabilityUtils.ts](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/videoCapabilityUtils.ts)

## 4. 缺少“下一步引导动作”

`Linghui` 现在更像一个强大的自由节点系统，但不是一个善于引导的工作流系统。

也就是说，它能做很多事，但不够主动告诉用户：

- 下一步最合理的派生链是什么
- 当前节点最适合扩展成哪种子图
- 哪个创作目标最适合从当前节点继续

## 建议的演化方向

## 总原则

不增加第二套底层系统，只在 `Linghui` 上方增加一层“工作流配方层”。

目标是：

- 保留自由节点图能力
- 增加场景化起手能力
- 减少空白画布焦虑
- 不破坏现有统一执行层

## 一、引入内置工作流配方层

建议新增一组内置定义，而不是只依赖用户模板。

建议概念：

- `LinghuiRecipeDefinition`
- `LinghuiStarterFlowRegistry`
- `LinghuiStarterFlowSnapshot`

每个 recipe 应描述：

- `id`
- `name`
- `description`
- `target`
- `supportedNodeTypes`
- `defaultGraph`
- `toolbarGroups`
- `recommendedActions`
- `featureFlags`

其本质类似于 `SoulArtisan` 的 workflow config，但要比它更轻，不直接绑定项目业务。

## 二、优先做“场景工作流”，而不是优先做更多节点

建议第一批内置 recipe：

1. `角色设定流程`
2. `分镜图流程`
3. `分镜视频流程`
4. `角色视频流程`
5. `脚本拆镜流程`

这些流程完全可以先基于现有 5 类统一节点构成，不一定要先引入大量新节点类型。

例子：

### 分镜图流程

- 起点：`script`
- 中间：派生 `text`
- 中间：派生 `image`
- 终点：输出图像结果

### 分镜视频流程

- 起点：`script`
- 中间：派生镜头文本
- 中间：派生镜头图
- 中间：`video`
- 终点：镜头视频结果

### 角色视频流程

- 起点：角色描述 `text`
- 中间：角色设定 `image`
- 中间：角色视频 `video`
- 终点：角色资产结果

## 三、为节点增加“引导式扩展动作”

这部分最值得直接借鉴 `SoulArtisan`。

建议在现有节点上增加可插拔的派生动作：

### `script` 节点

- 生成镜头文本链
- 生成分镜图链
- 生成分镜视频链

### `image` 节点

- 扩图链
- 多角度链
- 图生视频链
- 参考生视频链

### `video` 节点

- 高清链
- 解析链
- 合成链

这些动作不一定要新增独立节点类型，更推荐先实现为：

- 一键插入预制子图
- 自动创建分组
- 自动补默认参数
- 自动连线

这比单纯增加工具按钮更接近真正的 workflow 引导。

## 四、保留统一节点，谨慎新增专用节点

短期不建议把 `Linghui` 直接拆成很多 `SoulArtisan` 式专用节点。

原因：

- 当前统一节点抽象已经与统一能力层、执行层耦合良好
- 过早拆太多专用节点，会让维护成本飙升
- 很多场景差异，本质上可以由 recipe 和 preset 解决

因此建议优先顺序是：

1. 先加 recipe
2. 再加 guided actions
3. 最后只为确实无法表达的高价值场景增加少量专用节点

如果后续确实需要新增专用节点，优先考虑：

- `storyboard-shot` 级节点
- `reference-collector` 级节点
- `structured-script` 级节点

而不是一开始就复制 `SoulArtisan` 里全部节点类型。

## 五、工作流模板分成两类

建议把 `Linghui` 的模板体系明确拆成两层：

### 1. 系统模板

由产品内置，代表官方推荐工作流。

特点：

- 有明确创作目标
- 有固定说明和推荐入口
- 可作为新建工作区的起点

### 2. 用户模板

保留现有快照模板能力。

特点：

- 来自用户自定义沉淀
- 更偏复用和归档
- 不承担官方引导职责

这样可以避免当前“只有模板，没有工作流方向”的问题。

## 六、明确不做项目结构级的精确回写映射

这条要写成显式原则。

当前阶段不要求：

- 任意 `Linghui` 子图都能自动投影为项目里的镜头层级
- 任意结果都能自动落到固定项目字段
- 任意分镜演进步骤都能被项目主线完整理解

合理做法是：

- 底层资产和任务统一
- `Linghui` 结果可以导出为资产
- 项目主线再消费资产，而不是消费整个节点图语义

这可以显著降低耦合。

## 推荐实施顺序

## 阶段一：建立配方层

目标：

- 让 `Linghui` 从“自由画布”变成“自由画布 + 官方起手配方”

交付物：

- `LinghuiRecipeDefinition`
- 内置 recipe registry
- 2 到 3 个 starter flow
- 新建工作区时可选 starter flow

## 阶段二：补齐引导动作

目标：

- 让节点具备明确的下一步扩展能力

交付物：

- `script` 节点派生镜头链
- `image` 节点派生图生视频链
- `video` 节点派生解析/高清/合成链
- 自动插入分组与预制子图

## 阶段三：引入更强的工作流语义

目标：

- 在不破坏自由度的情况下提升工作流可理解性

交付物：

- recipe 级 feature flags
- 更细粒度的连接语义
- 更明确的节点角色标签
- 官方模板与用户模板双体系

## 最终判断

`Linghui` 当前最需要的不是更多能力，而是更强的“场景化编排表达”。

借鉴 `SoulArtisan` 的正确方式，不是复制它的节点清单，也不是复制它的平台耦合，而是抽取出它在 workflow 产品化上的三点经验：

- 配方化
- 场景化
- 引导化

对 `Koma` 来说，最合理的路线是：

- 底层继续统一
- 上层继续分开
- `Linghui` 新增工作流配方层
- 通过 starter flow 和 guided actions 降低无限画布的认知门槛

这条路线既能保住 `Koma` 的系统优势，也能真正吸收 `SoulArtisan` 在工作流产品化上的长处。
