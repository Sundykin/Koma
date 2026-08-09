## Context

`AssetManagerPanel` 目前在组件内部完成缺失图片筛选、任务包装、并发生成、重试和刷新。项目生产工作台只知道缺口数量，无法调用这段逻辑；如果直接复制代码，会导致不同入口在参考图归一化、风格快照和失败统计上漂移。

## Goals / Non-Goals

**Goals:**

- 把缺失素材生成抽成项目级可复用工作流，两个入口共享完全相同的生成参数和失败语义。
- 工作台主行动直接启动批量任务，并从任务记录恢复运行状态。
- 在有缺口时同时给出“补素材”和“跳过素材生成分镜”两个明确选择。
- 任务去重以项目/剧集为作用域；批量完成后只刷新权威资产和当前剧集 readiness。

**Non-Goals:**

- 不改变单个角色、场景、道具详情面板的生成按钮。
- 不把缺失素材设为生成分镜的强制门槛。
- 不改变模型能力解析、尾帧连续性或 Linghui 任务。

## Decisions

### 1. 抽取纯输入 + 回调式批量工作流

新增 `projectAssetGenerationWorkflow`，接收已经筛选好的 `Character | Scene | Prop` 项目集合及生成上下文，内部负责 `runWithTask`、并发、重试、参考图远程化和统一工作流调用；通过 `onProgress`、`onItemSettled` 和 `onComplete` 回调将状态投影给调用方。

这样 `AssetManagerPanel` 仍可保留自己的列表筛选和进度展示，`ProjectOverview` 不需要挂载完整资产组件即可复用同一业务路径。

### 2. 项目/剧集作用域去重

工作流在启动前使用 `findActiveTask` 查询 `type=asset-generation`、`targetKind=episode`、当前项目/剧集；存在活动任务时返回 deduped，不重复提交。旧资产面板的项目级任务继续兼容，但新工作台任务统一带 `targetKind=episode`。

### 3. readiness 动作区分“补全”和“跳过”

当缺失素材大于零且没有活动任务时，主行动为 `generate-assets`；面板同时展示次行动 `generate-shots`。生成分镜请求只依赖剧本和已解析资产，不检查缺失图片数量，明确记录用户选择。

### 4. 任务状态优先于局部 React loading

项目工作台通过 `useActiveTask` / `useTaskTransitions` 观察批量任务。局部 `starting` 只覆盖提交到任务落库的短窗口；切换步骤回来后仍显示任务进度。完成/失败事件触发资产、分析和 shots 重新加载。

## Risks / Trade-offs

- [两个入口共享任务但参数上下文不同] → 工作流输入包含完整项目风格、比例、模型和剧集名；去重时活动任务优先，后续点击只提示“正在进行”。
- [生成分镜时仍有缺图] → UI 明确标注“已跳过素材补全”，不静默宣称资产已就绪；分镜引用缺口由现有分镜 readiness 继续提示。
- [旧资产面板任务 targetKind 不是 episode] → 查询同时兼容项目级活动任务，逐步迁移新入口，不删除旧任务记录。

## Migration Plan

1. 抽取工作流并让 `AssetManagerPanel` 先切换到新实现，保持原 UI 行为。
2. 项目工作台接入 `generate-assets` 和“跳过生成分镜”。
3. 旧活动任务只读兼容，不做数据迁移；新任务带剧集目标信息。
4. 构建、单测和 Electron 实机验证后发布；回滚仅恢复前端 bundle。
