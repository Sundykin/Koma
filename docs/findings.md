# Findings & Decisions

## Requirements
- 输出中文、结构化分析。
- 必须同时覆盖 `Koma` 与 `SoulArtisan`。
- Koma 侧必须覆盖 `electron/`、`frontend/src/providers/`、`frontend/src/services/`、`frontend/src/store/`、`frontend/src/workflow/`。
- 必须回答差异、优势短板与发展方向，而不是只做代码说明。
- 所有关键判断需要带文件证据。

## Research Findings
- `SoulArtisan` 是“三层产品”结构，不是单一前端站点。
  - `admin-web/App.tsx` 暴露了站点、系统配置、提示词、卡密、积分、用户、图片任务、视频任务、日志等后台路由。
  - `agent-web/src/App.tsx` 暴露了首页、登录注册、工作流项目、剧本、图像生成、视频生成、媒体反推、分镜处理、角色项目等前台创作入口。
  - `playlet/pom.xml` 表明其拥有独立 Spring Boot 后端，包含 MyBatis Plus、Sa-Token、Redis、Spring AI、COS 等能力。
- `SoulArtisan` 的业务重心带有明显的平台运营属性。
  - `admin-web/types.ts` 中核心实体包含 `Site`、`AdminUser`、`SiteConfig`、`User`、`ImageTask`、`VideoTask`、`TaskStats`。
  - `admin-web/api/task.ts` 与 `admin-web/api/stats.ts` 说明其后台持续围绕任务监控、用户增长、内容统计运转。
  - `agent-web/src/components/dashboard/Dashboard.tsx` 首页把“算力”“充值”“图像生成”“视频生成”“剧本管理”“工作流”“角色项目”等放在同一入口，偏运营转化导向。
- `SoulArtisan` 的 AI 能力是业务模块之一，但不是唯一中心。
  - `agent-web/src/api/capability.ts` 通过 `/api/capabilities` 暴露渠道、模型、价格，说明模型能力是平台配置项。
  - `agent-web/src/api/videoGeneration.ts` 请求参数包含 `channel`、`model`、`projectId`、`scriptId`、`callbackUrl`，更像面向站点任务系统的 AI 接口。
  - `agent-web/src/api/characterProject.ts` 与 `agent-web/src/api/workflowProject.ts` 显示其把 AI 工作流封装为项目资源、分镜、任务，而不是统一的底层能力总线。
- 仓库根 `package.json` 显示这是一个 Electron + 前端双端打包项目，依赖包含 `langchain`、`@langchain/*`、`@langchain/langgraph`、`@modelcontextprotocol/sdk`、`electron-store`，说明系统层已具备 LLM 编排、本地桌面能力、MCP 集成三类基础设施。
- `electron/` 目录不仅有窗口与文件系统控制器，还包含 `service/plugin/`、`service/chat/`、`service/chat/mcp/`，表明 Electron 主进程承担了插件运行、能力注册、Agent 编排与 MCP 接入职责。
- `frontend/src/providers/` 同时覆盖 `llm`、`tti`、`itv`、`tts`、`imageHosting`、`channel`，说明“模型渠道”在前端层已经抽象成多模态 provider 体系，而非单一模型 SDK。
- `frontend/src/workflow/` 下存在角色资产、场景资产、分镜图、分镜视频、脚本生成、镜头计划等独立 workflow，说明产品核心执行流被编码成多阶段内容生产流水线。
- `frontend/src/providers/README.md` 明确规定媒体 provider 统一走 request-based contract 和 `start()/getTaskSnapshot()` 生命周期，provider 不负责项目路径写入，结果持久化由 `mediaPersistenceService` 负责。这说明模型调用与资产落盘被强制解耦。
- `frontend/src/providers/channel/catalog.ts` 说明内置 channel 只定义 provider 模板，不硬编码上游模型列表；真实模型及能力矩阵保存在 `ChannelConfig.models`，可以动态更新而无需发新版本。
- `frontend/src/providers/channel/resolver.ts` 把“默认渠道/模型选择”“能力匹配”“provider config 组装”统一集中处理，说明模型渠道选择是按 `category + capability + selection` 解析，而不是页面级硬编码。
- `frontend/src/providers/index.ts` 支持从内置渠道和插件渠道创建 provider；插件 provider 通过 `pluginStore`、`sandboxedFetch`、`createProviderInstance` 注入运行上下文，已经具备多模型与插件渠道并存的基本机制。
- `Koma` 在产品形态上更接近“本地优先的专业创作工作站”。
  - `frontend/src/App.tsx` 把项目、概览、编辑器、设置、插件、聊天、灵绘都纳入一个桌面工作台。
  - `frontend/src/workflow/README.md` 明确把系统定义为多步骤 AI 视频生产 orchestration。
  - `frontend/src/components/linghui/LinghuiPage.tsx` 显示灵绘具备独立工作区、资产库、历史库、模板库与执行日志。
- `Koma` 的平台化潜力主要体现在“统一能力层”和“本地资产沉淀”。
  - `frontend/src/providers/channel/types.ts` 抽象了 `ChannelDefinition / ChannelModelDefinition / ModelCapability`。
  - `frontend/src/providers/channel/catalog.ts` 明确不硬编码上游模型列表，真实模型及能力矩阵由用户配置维护。
  - `frontend/src/components/settings/ChannelModelsEditor.tsx` 允许手工维护模型名和能力。
  - `electron/service/plugin/capability/CapabilityRegistry.ts` 说明其目标是统一 Provider、MCP Tool、Resource 的能力注册表。
- `Koma` 当前前端形态已经明显偏“专业工作站”，但心智仍未完全收束。
  - `frontend/src/App.tsx` 把项目、灵绘、聊天、设置等多套工作台并列暴露。
  - `frontend/src/components/project/ProjectOverview.tsx` 把剧集管理、剧本工作台、项目资产三栏前置，说明产品主线是项目化长流程而非单次生成。
  - `frontend/src/components/storyboard/Storyboard.tsx` 与 `frontend/src/components/editor/SimpleEditor.tsx` 说明分镜与时间线编辑已具备高密度专业工作台特征。
  - `frontend/src/components/linghui/LinghuiPage.tsx` 则又提供了一套独立节点式创作范式，导致“默认主线”和“高级主线”并存。
- `SoulArtisan` 的优势不只是“有后台”，而是已经把 AI 调用包成可运营系统。
  - `admin-web/App.tsx`、`admin-web/types.ts`、`admin-web/api/points.ts`、`admin-web/api/cardkey.ts` 共同指向站点、账号、算力、充值、日志、提示词配置的完整运营骨架。
  - `agent-web/src/App.tsx`、`agent-web/src/api/videoGeneration.ts`、`agent-web/src/api/capability.ts` 说明前台创作入口和异步任务系统已经平台化。
  - `playlet/pom.xml` 与 README 中的后端说明表明其目标是多租户内容生产平台，而非单机创作工具。
- 初步战略判断：
  - `SoulArtisan` 更像“可白标、可计费、可运营的 AI 内容生产平台”。
  - `Koma` 更像“本地优先、可扩展、强调资产闭环与执行恢复的 AI 创作工作站”。
  - 两者不应走同一条正面竞争路径；Koma 应该强化工作站与能力中台，而不是复制站点后台。
- `Koma` 的 Electron 主进程已经承担系统级基础设施职责，而不是“桌面壳”。
  - `electron/preload/bridge.ts` 暴露了窗口、对话框、文件系统、项目、FFmpeg、插件、网络、聊天/MCP/能力调用等白名单 IPC。
  - `electron/service/plugin/runtime.ts` 负责加载、激活、停用 Electron 侧插件，并把 provider、MCP、agent 三类插件注册到主进程 registries。
  - `electron/service/plugin/capability/ProviderAdapter.ts` 与 `MCPAdapter.ts` 把 provider、内部 MCP、外部 MCP 统一同步到 `CapabilityRegistry`。
  - `electron/main.ts` 在开发模式下单独启用 remote debugging 端口并隔离 `userData`，明显服务于本地 Agent/MCP 调试工作流。
- `Koma` 已经具备本地 Agent 编排底座。
  - `electron/service/chat/AgentGraph.ts` 使用 LangGraph 构建 ReAct 图，把外部 MCP 与内部插件 MCP 工具都转成 LangChain tools。
  - `electron/service/chat/AgentOrchestrator.ts` 实现 Supervisor + Worker 的多智能体编排，并能基于 `CapabilityRegistry` 为 Worker 解析能力。
  - `electron/service/chat/ChatService.ts` 把 SessionStore、MCPManager、CapabilityBridge、AgentGraph、AgentOrchestrator 整合为统一聊天服务，支持单 Agent 和 orchestrated 两种模式。
  - `electron/service/chat/mcp/MCPManager.ts` 支持 stdio、SSE、WebSocket 三种 MCP 传输，这使主进程具备接入本地和远端工具生态的能力。
- `Koma` 的 workflow 层与媒体执行层通过统一 ownerRef/asset contract 打通。
  - `frontend/src/workflow/characterAssetWorkflow.ts`、`scenePropAssetWorkflow.ts`、`shotRenderWorkflow.ts` 都不直接操作文件系统，而是把 `ownerRef + request + selection` 交给 `mediaGenerationService`。
  - `frontend/src/workflow/shotRenderWorkflow.ts` 在生成分镜视频前先创建 shot version，并将音频/视频写入 `shot-version` 作用域，说明镜头产物具备版本化资产归档。
  - `frontend/src/workflow/scriptGenerator.ts` 把剧本生成也接入统一 LLM provider 选择与 prompt template / trace 体系，说明 workflow 不只是媒体侧，连文本策划链路也已纳入同一能力平台。
- `frontend/src/services/electronService.ts` 说明前端所有本地文件、项目与系统能力都通过 Electron 服务封装访问，浏览器环境只有降级 fallback，这进一步确认 Electron 是主产品运行时。
- `frontend/src/services/plugin/PluginLoader.ts` 与 `PluginInitializer.ts` 显示插件既能前端动态加载 UMD/IIFE bundle，也能按类别触发主进程 backend 激活，说明插件体系已打通前后端双运行时。
- `frontend/src/services/mcpService.ts` 说明前端对 MCP 的接入完全走 Electron IPC，而非浏览器直连，进一步强化了主进程作为能力中台的角色。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 以“产品入口 + AI 能力组织 + 运营/资产沉淀 + 系统层抽象”四条线并行分析 | 这样才能同时覆盖产品差异和技术方向 |
| 先确认 SoulArtisan 的业务边界，再判断 Koma 的竞争方向 | 避免只从技术先进性出发做错误战略判断 |
| 继续从 Electron capability 与 chat 编排层补证 | 需要确认护城河是在本地能力总线，还是仅在媒体工作流 |
| 将 LangGraph/MCP/Capability 视为系统层而非附属聊天功能 | 它们直接决定 Koma 的长期可扩展性与差异化空间 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 初始规划文件偏向 Koma 单边系统分析 | 扩展为双项目对标分析，并追加 SoulArtisan 业务证据 |

## Resources
- `/Users/sunmeng/workspace/SoulArtisan/admin-web/App.tsx`
- `/Users/sunmeng/workspace/SoulArtisan/agent-web/src/App.tsx`
- `/Users/sunmeng/workspace/SoulArtisan/playlet/pom.xml`
- `/Users/sunmeng/workspace/SoulArtisan/admin-web/types.ts`
- `/Users/sunmeng/workspace/SoulArtisan/admin-web/api/task.ts`
- `/Users/sunmeng/workspace/SoulArtisan/agent-web/src/api/characterProject.ts`
- `/Users/sunmeng/workspace/SoulArtisan/agent-web/src/api/videoGeneration.ts`
- `/Users/sunmeng/workspace/Koma/electron`
- `/Users/sunmeng/workspace/Koma/frontend/src/providers`
- `/Users/sunmeng/workspace/Koma/frontend/src/services`
- `/Users/sunmeng/workspace/Koma/frontend/src/store`
- `/Users/sunmeng/workspace/Koma/frontend/src/workflow`
- `/Users/sunmeng/workspace/Koma/package.json`

## Visual/Browser Findings
- 本任务不涉及浏览器或图片分析。

---
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
