## 1. Domain Model And Storage Rewrite

- [x] 1.1 定义新的媒体目录类型：媒体类别、渠道定义、渠道配置、模型定义、能力描述符和统一标准请求类型。
- [x] 1.2 删除旧的 `llmConfigs` / `ttiConfigs` / `itvConfigs` / `ttsConfigs` 与项目级 `*ConfigId` 字段，改写设置存储和项目选择结构。
- [x] 1.3 重写视频请求契约，落地文生视频、图生视频、参考生视频、首尾帧视频四类显式能力请求。
- [x] 1.4 为媒体资产和缓存元数据增加 `channelId`、`modelId`、`capability` 等统一上下文字段。

## 2. Registry And Resolution Layer

- [x] 2.1 重写 provider registry，使其按“媒体类别 / 渠道”注册渠道定义和适配器工厂。
- [x] 2.2 实现统一的 `MediaModelResolver`，支持项目选择、全局默认回退、能力校验和错误返回。
- [x] 2.3 替换旧的 `getProjectTTIProvider` / `getProjectITVProvider` / `getProjectTTSProvider` 一类工厂调用为统一解析入口。
- [x] 2.4 升级媒体契约版本和插件执行上下文，使插件渠道也走新的解析与执行链路。

## 3. Channel Implementations

- [x] 3.1 按“媒体类别 / 渠道”重组内置渠道目录，并将现有 LLM、TTI、TTS 渠道迁移到新 contract。
- [x] 3.2 实现 Vidu ITV 渠道，支持可配置 `baseUrl` / `apiKey`、官方鉴权头、四类视频能力接口映射和任务轮询。
- [x] 3.3 为 Vidu 建立模型能力矩阵和参数约束定义，确保不同模型只暴露真实支持的能力。
- [x] 3.4 清理或重建旧 ITV 渠道实现，移除依赖“一个配置就是一个模型”的残留接口。

## 4. Services, Workflows, And Prompt Compilation

- [x] 4.1 重写 `MediaGenerationService` 与相关媒体执行服务，统一消费能力级标准请求。
- [x] 4.2 改造项目分镜、角色、场景、道具相关工作流，使其先解析所需能力再执行生成。
- [x] 4.3 重构视频 prompt 编译链路，拆分为领域编译和渠道映射，消除 UI/工作流中的厂商特例。
- [x] 4.4 改造视频任务轮询、结果持久化和缓存命中逻辑，使其记录统一的渠道模型上下文。

## 5. Settings, Project UI, And Linghui

- [x] 5.1 重建设置页的 LLM / TTI / ITV / TTS 管理器，改为渠道卡片 + 渠道内模型列表 + 能力徽标展示。
- [x] 5.2 重建项目级模型选择器与相关业务弹窗，按所需能力过滤可选模型并显示默认回退状态。
- [x] 5.3 改造分镜视频生成入口和相关项目面板，使其使用能力感知的视频模式和统一解析器。
- [x] 5.4 重构灵绘视频节点编辑器与执行编译，按模型能力切换文生视频、图生视频、参考生视频、首尾帧视频变体。
- [x] 5.5 更新角色与道具预览视频入口，按当前模型能力启用或禁用对应操作。

## 6. Cleanup And Verification

- [x] 6.1 删除旧的 provider 配置类型、兼容字段、旧选择器分支和过时的 ITV 模式命名。
- [x] 6.2 为模型解析器、能力过滤、Vidu 接口映射和 prompt 编译增加单元测试或快照测试。
- [x] 6.3 验证分镜视频、角色预览视频、道具预览视频和灵绘视频节点四类关键链路的端到端行为。
- [x] 6.4 更新开发文档，明确新架构不兼容旧配置且所有新增渠道必须以“渠道内多模型 + 模型能力声明”方式接入。
