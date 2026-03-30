## Why

当前媒体体系把渠道配置、Provider、模型、能力和界面形态耦合成了同一层对象，导致一个渠道只能近似承载一个模型和一种生成接口。这样既无法正确表达 Vidu 这类“同一渠道下多模型且各模型能力范围不同”的服务，也迫使用户自己判断某个模型到底支持文生视频、图生视频、参考生视频还是首尾帧视频。

项目尚未上线，现在是彻底重构这套抽象的最佳时机。若继续沿用现有结构，设置页、项目选择器、灵绘视频编辑器、项目分镜/角色/道具视频工作流都会持续积累错误前提和重复分支，后续每接一个新渠道都需要再做一次整套特化。

## What Changes

- **BREAKING** 将 LLM、文生图、图生视频、语音合成的配置体系重构为“渠道包含多个模型”的目录结构，渠道负责共享鉴权与基础连接信息，模型负责声明自身能力、输入约束和默认参数。
- **BREAKING** 将能力声明从当前的顶层 provider/channel 粗粒度能力，改为模型级能力声明与运行时解析；调用链路必须根据所选模型能力决定可执行的生成模式，而不是让用户自行判断。
- **BREAKING** 重构项目级与工作流级的模型选择方式，从“选择某个配置对象”改为“选择某个渠道中的某个模型”，并只暴露该模型实际支持的能力范围。
- **BREAKING** 重构 ITV 请求契约与视频生成界面，明确区分文生视频、图生视频、参考生视频、首尾帧视频四类模式，并为不同模式提供独立输入结构、参数校验和提示词编译入口。
- 重构设置页、Provider Registry、媒体生成服务、插件调用接口和工作流执行层，使其统一消费同一套渠道-模型-能力目录，而不是分别维护 LLM/TTI/ITV/TTS 的平行特例。
- 在新架构下接入 Vidu 视频渠道，支持可配置 `baseUrl` 与 `apiKey`，并以 [vidu视频渠道.md](/Users/sunmeng/workspace/Koma/vidu视频渠道.md) 约定的接口和模型能力范围暴露文生视频、图生视频、参考生视频、首尾帧视频能力。
- **BREAKING** 清理现有把旧配置结构、旧选择器和旧能力路由保留下来的兼容层。本次重构不考虑旧数据兼容，不保留迁移桥接代码。

## Capabilities

### New Capabilities
- `media-channel-catalog`: 统一定义渠道、渠道内模型、模型能力声明、能力过滤与运行时解析规则，作为所有媒体能力的基础目录能力。

### Modified Capabilities
- `model-providers`: 将现有按 provider/单模型配置的要求改为按渠道配置与模型目录管理，覆盖 LLM、TTI、ITV、TTS 四类媒体能力。
- `itv`: 将现有偏“单图生视频 provider 切换”的要求改为模型能力驱动的视频生成体系，覆盖文生视频、图生视频、参考生视频、首尾帧视频四类模式。
- `tts`: 将现有按 provider 切换的语音合成要求改为渠道内多模型选择与统一执行解析。
- `asset-generation`: 要求项目分镜、角色、场景、道具及相关工作流统一基于所选模型能力解析执行，不再硬编码某类 provider 假设。
- `character-management`: 角色与道具的预览视频生成、绑定状态与相关入口改为基于统一视频模型能力解析，不再假定特定 ITV provider。
- `linghui-studio`: 要求灵绘视频节点的编辑界面和执行编译按所选视频模型能力自适应，而不是仅区分“生成/导入”或“普通参考/首尾帧”。
- `ui-components`: 设置页配置管理、项目级选择器和视频相关交互组件改为展示渠道、模型与能力范围，而不是直接展示旧配置对象。

## Impact

- 受影响代码包括媒体类型定义、项目设置结构、全局设置存储、Provider Registry、插件媒体调用 API、媒体生成服务、灵绘执行层、项目工作流和设置/选择器 UI。
- 受影响的核心目录预计包括 `frontend/src/types*`、`frontend/src/providers/**`、`frontend/src/store/settings/**`、`frontend/src/services/**`、`frontend/src/workflow/**`、`frontend/src/components/settings/**`、`frontend/src/components/project/**`、`frontend/src/components/linghui/**`。
- Vidu 将作为新架构下首个按模型能力矩阵接入的视频渠道，并以 [vidu视频渠道.md](/Users/sunmeng/workspace/Koma/vidu视频渠道.md) 作为该渠道的集成契约来源。
