# Findings: SoulArtisan 后端/业务中台能力

## Requirements
- 输出中文、结构化分析。
- 回答五个问题：业务对象、数据/任务组织、AI 地位、商业化信号、对 Koma 的启发。
- 结论必须附带文件证据。
- 不以是否存在传统 `backend/` 目录为判断标准，而是从 `admin-web/api`、`agent-web` 数据流、文档、环境配置、任务/用户/站点/积分/系统配置等模块反推业务中台。

## Research Findings
- `SoulArtisan` 顶层由 `admin-web/`、`agent-web/`、`playlet/` 三部分组成，呈现运营后台、用户前台和外部嵌入页三层产品结构。
- 根目录不存在独立后端代码目录，说明仓库更偏前端壳层和 API 接入层；真实服务边界需要从 API 模块、页面模块和环境变量回溯。
- 已发现关键证据入口包括根 `README.md`、`admin-web/README.md`、`admin-web/README_SETUP.md`、`agent-web/README.md`、两端 `.env*` 文件及 `admin-web/api` / `agent-web/src/api`。
- 根 `README.md` 明确将产品定义为“AI 驱动的创意内容生成平台”，覆盖 AI 对话、图像生成、视频生成、角色生成、剧本/分镜/角色资源库、可视化工作流、多租户站点、用户、点数、日志审计和云存储。
- 根 `README.md` 同时声明实际后端为 `playlet/` 下的 Spring Boot 服务，内部拆分出 `admin` 管理模块、用户端 `controller/service/entity`、AI 服务和数据库迁移，这说明当前分析对象虽缺独立 backend 目录，但业务中台在设计上是明确存在的。
- `admin-web/.env.development`、`admin-web/.env.production`、`agent-web/.env`、`agent-web/.env.production` 均通过 `VITE_API_BASE_URL` 指向统一后端，说明运营后台与用户端共享同一组业务服务。
- `admin-web/.env*` 中的 `VITE_APP_TITLE=易企漫剧平台` 和根 `README.md` 中的默认管理员/站点管理员账号，进一步表明该产品已经具备站点化运营而非单人创作工具形态。
- `admin-web/README_SETUP.md` 明确区分系统管理员与站点管理员，并列出站点管理、用户管理、图片/视频任务、日志管理等后台路由，说明后台业务核心是租户运营与任务监管。
- `admin-web/api/` 的文件切分已直接暴露后台中台域：`auth`、`site`、`user`、`task`、`points`、`cardkey`、`system`、`log`、`chatPrompt`、`dashboard`、`stats`。
- `admin-web/pages/` 与 API 模块一一对应，出现 `MySite/Config`、`Points/Config`、`Points/RecordList`、`System/Config`、`Content/ImageTaskList`、`Content/VideoTaskList` 等页面，说明后台重点并非内容创作，而是租户配置、计费规则、任务监管和系统运营。
- `agent-web/src/api/` 的切分反映前台业务主线：`script`、`playbook`、`characterProject`、`characterGeneration`、`pictureResource`、`videoResource`、`imageGeneration`、`videoGeneration`、`workflowProject`、`capability`、`site`、`user`、`auth`、`chat`。
- `agent-web/src/components/` 中同时存在 `dashboard/Sora2Workflow`、`generators/ImageGenerator`、`generators/VideoGenerator`、`history/MyImageHistory`、`history/MyVideoHistory`、`pages/StoryboardCutPage`、`pages/CharacterProjectDetail` 等组件，表明用户侧围绕“项目/角色/剧本/资源/生成任务”形成持续生产工作台，而非单次对话产品。
- `admin-web/api/request.ts` 与 `agent-web/src/utils/request.ts` 都把所有请求汇聚到单一 `VITE_API_BASE_URL`，且统一处理 `Bearer` Token 和 `{code,msg,data}` 响应格式，说明前后台共享同一后端业务域模型，而不是各自独立服务。
- `admin-web/types.ts` 直接给出后台核心实体：`AdminUser`、`Site`、`SiteConfig`、`User`、`ImageTask`、`VideoTask`、`SystemConfig`、`AdminOperationLog` 等，能从字段级别看到 `siteId`、`points`、`projectCount`、`taskId`、`adminRemark`、`prismApiKey`、`cosBucket` 等中台属性。
- `agent-web/src/App.tsx` 路由显示用户前台并非单一首页，而是包含 `dashboard`、`workflow-projects`、`scripts`、`image-generator`、`video-generator`、`storyboard-cut`、`character-projects`、`account-settings` 的完整生产工作台。
- `agent-web/src/api/script.ts` 体现剧本是一级业务对象，且支持成员协作、角色复制、项目关联、资源统计，说明数据不是围绕单条 prompt，而是围绕“剧本/项目资产”沉淀。
- `agent-web/src/api/workflowProject.ts` 与 `agent-web/src/api/characterProject.ts` 进一步证明任务组织采用“项目化”结构：工作流项目保存节点图数据，角色项目保存剧本、资源、分镜和生成状态。
- `agent-web/src/api/imageGeneration.ts` 与 `agent-web/src/api/videoGeneration.ts` 表明图像/视频生成被建模为异步任务，有独立 `taskId`、状态、结果地址、错误信息和历史列表；它们是项目工作流中的执行环节，而不是唯一产品形态。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 先确认产品结构与部署形态，再看具体模块 | 业务对象和服务边界通常先体现在入口应用拆分与环境配置 |
| 以根 README 的后端结构描述作为“设计事实”，再用前端接入代码验证“实现事实” | 当前仓库后端代码未完整展开，需要区分架构声明与前端实际调用 |
| 优先从 TypeScript 类型和 REST 路径抽取域模型 | 对竞品做后端能力分析时，类型字段和接口路径比 UI 文案更接近真实业务边界 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 项目无独立 backend 目录 | 改从 API 封装、页面模块与环境变量综合判断 |

## Resources
- `/Users/sunmeng/workspace/SoulArtisan/README.md`
- `/Users/sunmeng/workspace/SoulArtisan/admin-web/README.md`
- `/Users/sunmeng/workspace/SoulArtisan/admin-web/README_SETUP.md`
- `/Users/sunmeng/workspace/SoulArtisan/admin-web/.env.development`
- `/Users/sunmeng/workspace/SoulArtisan/admin-web/.env.production`
- `/Users/sunmeng/workspace/SoulArtisan/agent-web/README.md`
- `/Users/sunmeng/workspace/SoulArtisan/agent-web/.env`
- `/Users/sunmeng/workspace/SoulArtisan/agent-web/.env.production`
- `/Users/sunmeng/workspace/SoulArtisan/playlet`
- `/Users/sunmeng/workspace/SoulArtisan/admin-web/api`
- `/Users/sunmeng/workspace/SoulArtisan/admin-web/pages`
- `/Users/sunmeng/workspace/SoulArtisan/agent-web/src/api`
- `/Users/sunmeng/workspace/SoulArtisan/agent-web/src/components`

## Visual/Browser Findings
- 本任务不涉及浏览器或图片分析。
