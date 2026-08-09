## Context

编辑器当前注册了 `script → assets → storyboard → video` 四个步骤。`ProjectOverview` 已经把剧集列表、剧本编辑器和项目资产概览放在同一页面，但真正的资产提取、缺失素材生成和分镜任务仍只在 `AssetManagerPanel` 内可用；因此用户必须先按步骤跳转，且顶部进度容易与磁盘中的分析和媒体状态脱节。

本变更只作用于 Koma 项目编辑器。Linghui 的页面、存储和任务不在范围内。已有 `EpisodeStepProgress` 和旧 `assets` 路由必须保持可读，旧项目无需迁移即可继续打开。

## Goals / Non-Goals

**Goals:**

- 用真实的当前剧集数据计算剧本、资产、分镜三个生产阶段的状态和缺口。
- 将剧本和角色/场景/道具管理呈现在同一个“项目”步骤中，并保留进入完整资产编辑器和分镜编辑器的显式入口。
- 在项目步骤直接复用现有分析任务客户端和分镜任务客户端，支持开始、查看进行中、失败重试和完成后的自动刷新。
- 保持 `assets` 深链接和 `EpisodeStepProgress` 兼容，不让隐藏/旧步骤改变现有持久化语义。
- 用纯函数保证就绪度和下一步建议可单测，组件只负责展示和调用动作。

**Non-Goals:**

- 不重写 `AssetManagerPanel` 内部的角色、场景、道具编辑和图片生成工作流。
- 不改变尾帧连续性规则、视频生成协议或 Linghui 模块。
- 不引入新的后端表；工作台状态由现有 episode analysis、实体媒体和 task records 派生。

## Decisions

### 1. 以派生模型作为唯一展示状态

新增 `projectProductionReadiness` 纯函数，输入当前剧集、`EpisodeAnalysis`、角色/场景/道具和分镜，输出阶段状态（`ready` / `incomplete` / `running` / `blocked`）、完成数、总数、缺口和建议动作。任务记录只覆盖 `running`，不可用“点过下一步”替代真实数据。

备选方案是继续依赖 `EpisodeStepProgress`。该字段只表示用户导航过步骤，无法反映分析中间阶段或缺失媒体，因此不适合作为工作台质量状态。

### 2. 项目步骤承载生产摘要，完整编辑器按需打开

扩展 `ProjectOverview` 右侧资产区域上方增加生产摘要卡。卡片显示三阶段状态，并提供“解析剧本”“处理缺失素材”“生成分镜”“打开资产管理”“打开分镜”等动作。动作通过现有回调切换到兼容步骤，只有任务启动动作留在当前页面。

备选方案是把完整 `AssetManagerPanel` 永久嵌入项目页面，会造成重复加载、双份选中状态和更高内存开销；摘要 + 按需进入保留现有组件的成熟交互。

### 3. 主导航显示项目、分镜、视频三步，旧 assets 仅兼容

步骤注册增加 `visibleInNavigator`（默认 true）。`assets` 设为 false，`listEditorSteps` 和 `listEditorStepIds` 只返回可见步骤；`getEditorStep('assets')` 仍可获取旧定义，旧深链接和 `ScriptStep` 的 start-production 逻辑仍能落到资产编辑器。项目步骤的下一步直接指向 `storyboard`，并在导航中显示为“项目”。

备选方案是删除 `assets` 注册。那会破坏旧保存的步骤和可能的外部深链接，因此只隐藏不删除。

### 4. 任务刷新使用边沿事件与一次性重新加载

工作台订阅当前项目/剧集的 `script-analysis` 与 `shot-analysis` 完成、失败转换；转换后重新读取分析、实体和 shots，并合并当前选中剧集。轮询和任务提交仍由现有服务负责，不在摘要组件复制长轮询。

### 5. 资产缺口使用现有媒体选择器

角色、场景、道具是否就绪分别复用 `getCharacterCostumePhotoSource`、`getScenePreviewImageSource`、`getPropPreviewImageSource`。这样远程、data/blob 和本地媒体的判断与资产面板一致，避免工作台显示“已生成”但分镜引用无法使用。

## Risks / Trade-offs

- [旧调用仍传入 `assets`] → `getEditorStep` 保留隐藏定义；入口解析在找不到可见步骤时回退到 `script` / `storyboard`。
- [任务完成和组件刷新竞态] → 所有加载函数使用取消标记，完成事件只触发一次刷新；失败状态保留可重试动作。
- [项目级实体与当前剧集分析不一致] → readiness 同时使用 episode refs 和全局实体媒体，只把当前剧集引用计入缺口。
- [摘要卡占用右侧空间] → 使用紧凑三阶段条和可折叠内容，完整资产列表仍可进入原面板。

## Migration Plan

1. 发布前端代码，新增纯函数与摘要卡，不修改数据库 schema。
2. 首次打开项目时从现有 episode analysis、实体和 shots 派生状态；旧项目直接可用。
3. 新建项目默认进入“项目”步骤；已有 `assets` step 值在读取时映射到“项目”步骤，用户仍可从摘要卡打开原资产编辑器。
4. 若回滚，只需恢复前端 bundle；持久化数据和旧 `assets` 字段保持可读。

## Open Questions

- 后续是否要把完整资产编辑器作为项目步骤内的可切换子面板，而非按需进入独立旧步骤。
- 是否将 readiness 汇总扩展到项目内所有剧集，形成项目级批量生产队列。
