# Findings

## 2026-08-07 Unified Script-to-Storyboard Product Iteration

- `/goal` 已创建持续目标；本轮不是一次性改按钮，而是建立可继续演进的统一生产链路。
- 仓库已有大量 LibTV 节点对标与实现记录，尤其是 `ScriptAggregatedGenerator`、剧本表格角色引用、批量分镜图/视频生成，第一轮应复用这些真实能力，不重新造一套不兼容的数据结构。
- 当前工作区仅有两个与本任务无关的未跟踪 ComfyUI JSON；后续不触碰、不纳入改动。
- 视觉验证必须走 Electron remote debugging port `9333`，不能以普通 Vite 浏览器代替。
- 初步代码盘点显示系统同时存在两套相关语义：项目级 `store/project` 已有角色/场景/道具/分镜 SQLite 实体存储；Linghui 画布侧已有 `ScriptNode` / `StoryboardNodeEditor`、批量分镜派生 hooks、全局资产库与工作区资产库，但主流程入口仍以独立节点/抽屉为中心。
- 现成能力足够支撑统一编排：剧本结构化解析保留 `characters` 与角色图引用，分镜选择后可以批量派生图片/视频；因此 P0 更可能是“统一编排层 + 复用现有执行器”，而不是新增底层生成服务。
- 当前可见的角色/场景/道具资产持久化主要在项目 store；Linghui 自身更多以节点数据、连接引用、library snapshot/global asset 管理媒体。统一方案必须明确两者的 source of truth，避免生成后出现两份互不同步的资产。
- `ScriptNode` 已经把剧本与镜头表格放在同一节点里，选中镜头后可“派生文本 / 生成分镜 / 生成视频组”；编辑器里也有同类动作。真正缺口是角色/场景/道具的抽取、确认、参考图生成与镜头资产生成没有成为这个节点内部的连续阶段。
- `linghui/script` 与 `linghui/storyboard` 目前是两个目录入口和两套编辑器，但输出都是 `LinghuiStoryboardFrame[]`，派生逻辑完全复用。产品上这是明显的重复选择成本，P0 应在一个统一入口中用模式/阶段承载，而不是让用户先判断该建哪个节点。
- 执行器证明剧本和故事板底层只差 prompt/system prompt 与 mode；没有资产实体抽取执行器。旧的项目级实体存储虽完整，但 Linghui 流程没有直接接入它，若本轮直接跨接会扩大迁移风险。
- 因此第一轮最小闭环应先在 Linghui `ScriptNode` 上增加统一的制作阶段与“资产清单”结构：从分镜结果自动归并角色/场景/道具候选，允许确认/编辑，再复用现有图像派生能力生成资产图和分镜图；随后再评估与项目实体库的双向同步。
- `LinghuiNodeEditorSurface` 已将 script/storyboard 的运行与三类派生动作集中透传，统一工作台适合放在 script 编辑器/节点属性内，所需画布副作用可以沿用现有 editor API，不需要让新组件直接操纵 ReactFlow。
- 左侧工作流抽屉已经为“系统 Recipe”预留完整 UI 和 `character-design-flow` / `storyboard-creation-flow` 类型，但 `listBuiltinLinghuiRecipeTemplates()` 当前直接返回空数组。这是一个明确产品断点：用户看到“工作流”入口却没有可开箱使用的从剧本到分镜模板。
- 工作区资产抽屉当前只按 image/video/audio/text 分类，是媒体结果库，不认识角色/场景/道具的语义类型；3D 全局资产库又只支持 character/prop。后续统一资产管理需要引入 production asset role（character/scene/prop/shot）元数据，而不必立刻替换媒体 kind。
- 竞品资料核验已启动：LTX Studio 官方站点可重定向到 `ltx.io/studio`，但当前页面在内置浏览器中只返回空文档/导航超时，未将不可核验的页面内容当作事实；后续以仓库已有 LibTV 反编与可读取的官方静态资料为主。

### Competitive Workflow Benchmark (official landing pages fetched 2026-08-07)

- LTX Studio：官网明确把工作流定义为 `From Script` 起点，“上传脚本后立即生成 scenes and storyboards”；同一 Studio 内提供 Dynamic Storyboard / Timeline Editor / Sound Design，并用 Elements 统一管理 `Characters / Objects / Locations / Other`，强调跨 scene 一致性。这是本轮最直接的对标：一个项目入口、一个资产元素层、一个动态故事板/时间线，而不是让用户手动拼节点。
- Boords：核心流程是 3 步 `Add script/brief → Upload or generate images → Share/review/sign-off`；脚本与视觉始终同步，自动生成 shot list，角色只建一次并在每镜复用；对已确认画面提供局部重绘、换机位不重建、frame-level comment/status/version。Koma P0 可借鉴前两步与“保留已确认内容”的重跑语义，协作/审批放 P2。
- Storyboarder.ai：把完整链路公开为 6 步 `Upload Script → Shot List → Storyboards → Character Consistency → Image-to-Video → Animatic with Audio`，并宣称角色/地点/道具跨镜保持一致；支持脚本格式导入与从一次输入自动生成每项 deliverable。Koma 的统一阶段设计应接近这个顺序，但必须显示每阶段可编辑、可跳过、可重试。
- FinalBit（原 NolanAI 页面）：产品定位是 `write / breakdown / budget / storyboard / schedule` 的一体化 pre-production，自动 breakdown 把剧本元素组织成可规划对象。它提醒 Koma 不应只做“生成按钮聚合”，资产抽取结果要成为后续镜头/预算/排期等可复用的结构化实体。
- Katalist 当前官网已转向广告素材换品/重混，不再是最合适的通用剧本分镜直接对标；保留为“在同一 canvas 中复用既有资产、prompt 修改而不重拍”的局部编辑参考，不列入 P0 主竞品。
- 结合仓库内 LibTV：LibTV 的优势在画布内选中镜头后紧凑批量生成，以及角色图片作为 image2image refs；LTX/Storyboarder 的优势在统一项目级流程和一致性资产层；Boords 的优势在单镜局部修订与审批状态。Koma 第一轮应组合前两类，不照搬积分/云端会话/协作权限。

### P0 Design Decision

- 统一制作台采用 3 个连续阶段：`1 剧本 → 2 资产 → 3 分镜`。阶段是同一 script/storyboard 节点的持久化属性，不新增第三种节点，不破坏旧数据。
- 新增 production asset 候选结构（character/scene/prop），由已解析 `LinghuiStoryboardFrame[]` 本地汇总；允许编辑名称/描述、确认/取消确认和重新同步。运行脚本后第一次出现镜头时自动进入资产阶段，避免用户遗漏一致性资产。
- “生成资产参考图”复用现有 `onGenerateScriptImages`：把确认的资产映射为带 production asset 元数据的虚拟 frame，再由现有派生 hook 创建并立即运行 image 节点。这样复用队列、失败重试、历史和现有生成 provider，不增加假后端。
- 分镜阶段继续复用现有镜头表格、选择与批量图/视频生成；资产阶段不替代画布资产库，而是在源剧本节点内管理“这一部作品需要哪些语义资产”。
- `listBuiltinLinghuiRecipeTemplates()` 的空实现将在 P0 加入至少一个“剧本到分镜一体化”系统 Recipe，用户从工作流抽屉一次即可建立统一节点，不再先判断“脚本节点还是故事板节点”。

## 2026-08-07 P1 Project Production Assets Audit

- 当前 `LinghuiWorkspaceAssetRecord` 已有通用 `metadata: Record<string, unknown>`，无需立刻迁移 SQLite schema；生产资产语义可以兼容地写入 metadata。
- 当前 `createLinghuiWorkspaceAsset` 只接受 `nodeId + nodeData + nodeRun`，面向“把节点结果存成资产”，不适合直接同步尚未生成图片的角色/场景/道具定义，也没有幂等 upsert 入口。
- 资产抽屉的 `LinghuiAssetFilter` 仅有 `all/image/video/audio/text`，过滤逻辑只看 `asset.kind`；角色/场景/道具必须通过 metadata 提供第二维生产语义。
- 资产卡片当前只展示媒体 kind 和创建时间，生产资产需要显式类型标签与来源节点提示，否则用户无法区分普通图片和角色参考资产。
- 最小兼容方案：新增 production asset metadata 解析 helper；后端增加按稳定 ID 写入/替换的 `upsertWorkspaceAsset`，节点侧同步定义记录；已有生成图片资产继续保留媒体 `kind: image`，同时带生产语义 metadata。
- `LinghuiService` 已引入 `createHash`，可用 `workspaceId + nodeId + productionAssetId` 生成稳定 record ID；`INSERT OR REPLACE` 和 `insertWorkspaceAssetRecord()` 已存在，幂等写入不需要新表。
- 数据表的 `kind` 仍受 `image/video/audio/text` CHECK 约束，所以生产类型必须留在 metadata；无参考图的生产资产以 `kind: text` 保存描述，有参考图时可物化为 `kind: image`。
- Script/Storyboard editor 当前通过 `LinghuiNodeEditorSurface` 已能拿到 `workspaceId` 和 `onAssetLibraryMutate`，只需把这两个 props 透传，不必扩张画布 store 或 ReactFlow editor API。
- IPC 需要新增一个批量 `syncProductionAssets` 通道：一次调用同步当前节点全部已确认资产，并删除该节点此前同步但现已取消确认/删除的 production records，才能保证项目资产库与制作台一致而不是只增不减。

## 2026-08-07 P1 Project Production Assets Completed

- P1 已完成：不新增数据库表，继续复用 `linghui_workspace_assets.metadata_json` 承载生产语义；媒体 `kind` 仍只表示 image/video/audio/text，兼容旧资产。
- 稳定记录 ID 为 `sha256(workspaceId + NUL + nodeId + NUL + productionAssetId).slice(0, 32)`；因此同一工作区不同制作台节点不会互相覆盖，同一节点重复同步不会增长记录。
- `syncProductionAssets` 只接纳 `confirmed === true` 的资产；每次同步以当前节点的 confirmed 集合作为 desired state，并删除当前节点已取消确认/删除的旧 production record。
- 生产 metadata 至少包括 `recordType / sourceNodeId / productionAssetId / productionAssetKind / productionAssetName / sourceShotIds / confirmed`；参考图另存 fingerprint，避免每次编辑都重复下载或复制。
- 有参考图的生产资产保存为 `kind=image` 并物化到工作区；没有参考图的资产保存为 `kind=text`，描述写入 `text`，这样角色/场景/道具定义在生成参考图前也能被项目资产库复用。
- Script/Storyboard editor 已透传 `workspaceId` 和资产库刷新回调，防抖 hook 在确认、编辑、删除和取消确认后回写；工作台会呈现同步状态和失败重试入口。
- 抽屉筛选保持两维：媒体类型（全部/图片/视频/音频/文本）× 生产语义（全部/角色/场景/道具/普通）。没有 production metadata 的旧记录统一视为普通资产。
- Electron CDP 9333 实操证据：Recipe → 制作台 → 添加角色 → 确认后显示“已确认资产已同步到项目资产库”；资产抽屉显示角色标签、0 个来源镜头、来源节点；取消确认后角色筛选为空，重新确认后恢复为单条同名记录；临时工作区已删除，原有 3 个工作区仍在。

### 下一轮建议（P1.5 / P2）

- 让参考图生成成功后可选择回写生产资产的 `referenceImage`，并增加 `draft / approved / locked` 状态；锁定后编辑或批量重生成必须明确提示作用范围。
- 在镜头卡片增加生产资产引用摘要和“跳回资产”入口，再做一致性检查（角色外观、场景时段、关键道具和风格约束）。
- 为生产资产增加别名/合并候选和受影响镜头列表；删除前显示引用影响，替代当前同步的静默删除。
- 继续对标 LTX Studio 的 Elements、Boords 的 review、Storyboarder.ai 的 consistency/animatic，但不迁移积分、云端账号和未接入的模型服务。

## 2026-08-07 Prompt @ Focus Regression

- 用户反馈画布节点输入框输入 `@` 后失焦。根因不是 autocomplete popup，而是 `LinghuiPromptEditor` 的 CodeMirror 初始化 effect 依赖受控 `value` 与 `referenceExtension`；输入触发父状态更新后，effect 销毁并重建 `EditorView`。
- 修复策略是把初始 doc/引用扩展放入 ref，仅在基础编辑器配置变化时创建 view；受控值仍由已有外部同步 effect 处理，引用列表由 `Compartment.reconfigure` 更新，避免重新挂载输入 DOM。
- 回归测试通过 CodeMirror `EditorView.dispatch({ changes: { insert: '@' } })` 驱动受控更新，并断言原 view DOM 仍 connected、`document.activeElement` 仍为 `.cm-content`。
- Electron CDP 9333 实测图片节点：输入 `@` 后焦点保持，随后输入中文继续追加；验证产生的临时前缀已从原工作区内容中删除。

## 2026-08-07 P2 镜头到生产资产追溯审计

- `LinghuiStoryboardFrame` 已保留结构化 `characters / scenes / props`，生产资产同时保存 `sourceShotIds`；因此第一版引用关系可以本地双向推导，不需要再次调用模型或迁移数据库。
- 普通镜头当前没有持久化 `productionAssetIds`；只有用于生成资产参考图的虚拟 frame 带单个 `productionAsset`。为兼容旧数据，展示层应先按 `sourceShotIds` 精确匹配，再以 kind + 归一化名称回退匹配镜头字段。
- `ScriptShotCards / ScriptShotTable` 被节点本体、Script 编辑器和 Storyboard 编辑器共同复用，是添加资产摘要的最小一致入口；需要通过可选 props 注入 `productionAssets` 和定位回调，避免组件直接依赖画布 store。
- 当前制作台资产卡已显示来源镜头数，但删除只是直接过滤数组。P2 可用同一个引用投影结果在删除前给出具体镜头标题/编号，并保持 locked 资产不可删除。
- “跳回资产”最短路径不是打开项目资产抽屉，而是把同一制作台阶段切到 `assets` 并定位对应卡片；节点本体可复用已有 `openNodeEditor(id)` 后由节点属性记录一次性定位目标。
- `ScriptProductionWorkbench` 当前删除按钮直接执行 `assets.filter(...)`，没有任何影响确认；这正是最适合先补的变更影响闭环。组件可接收当前 `shots`，由纯函数给出被引用镜头，再用确认弹层显示编号/标题。
- Script/Storyboard 编辑器已经持有 `previewState.shots + productionAssets + updateProductionProps`，可在不扩大画布 API 的前提下完成阶段切换和资产定位；节点本体只需把相同 assets 传入共享镜头视图，点击 chip 时打开现有制作台。
- 卡片与表格已有统一的紧凑样式区段，新增引用 chips 可放在 `ScriptShotViews` 内部并复用 token，不需要重做布局；表格可加一个动态“生产资产”列，只有至少一个匹配/缺失项时才出现。
- 为避免旧工作区在尚未建立生产资产域时满屏“缺失”警告，一致性缺口只在当前节点已经存在至少一个 `productionAssets` 时启用；无资产的旧镜头仍按原样展示。

### P2 Electron Verification Findings

- Electron 重载验证发现 TypeScript 源码中的 SQLite 反序列化映射漏了 `linghui/storyboard` / `linghui-storyboard`；虽然当前 public runtime 镜像已有该 case，源码缺口会在重新构建后把故事板恢复为文本节点。已补齐源映射，并由 watcher 重启 Electron 后重新验证。
- 修复后，隔离故事板工作区重载为 `.react-flow__node-linghui-storyboard`，节点内真实展示 1 个镜头及角色、场景、道具三个资产 chip，不再降级为文本空态。
- 点击镜头的“阿澈”chip 会直接打开同一节点制作台，阶段自动切换为资产，目标卡片带 `.isFocused`，同时显示 `用于 #1 月台停手`，证明引用和反向定位闭环在真实 Electron 中成立。
- 删除“阿澈”前会展示 `删除会影响 1 个镜头 / #1 月台停手 / 取消 / 仍然删除`；取消后仍保留 3 张资产卡和原字段，确认删除后只剩 2 张资产卡，并在镜头中留下缺失角色提示。
- 验证时创建的 4 个临时工作区均按精确 ID 删除；Electron 项目面板最终显示 `3 个项目`，只保留 `模拟器UIUX设计 / 未命名灵绘 / 创意酒瓶设计`。

## 2026-08-07 画布执行 HUD 简化审计

- “待重跑 / 重跑受影响”来自 `LinghuiCanvasHud` 的 stale 状态计数与 `useLinghuiPageExecutionRailState.handleRerunAffected`，它们是执行实现细节，不是用户熟悉的生产动作；当前同时存在“需要处理”“失败”“定位失败”“重试”等多层状态，信息密度高且语义重复。
- `runWorkflow()` 本身仍需要 `stale` 状态来做依赖传播和执行计划过滤，不能删除状态模型；本轮只移除 HUD 上的 stale 计数、重跑按钮和对应页面 rail handler，节点边框/执行日志中的内部 stale 仍保留。
- 明确保留 `运行全部`、`运行选中`、失败节点的 `重试`/`定位失败` 和执行中的 `取消执行`；这些按钮分别对应用户可理解的范围动作或恢复动作。
- 同一内部 stale 术语还出现在旧 `LinghuiStatusBar`、属性面板、通用节点壳和工作流块摘要中。当前主画布实际可见的是 HUD 与工作流块；为避免术语从其他入口再次露出，本轮统一从所有展示组件移除“待重跑”文案，但不改 `LinghuiRunStatus` 和依赖失效计算。
- `onRerunAffected` 只沿 `Page → PageShell → Canvas → Hud` 透传，唯一行为实现也只被这个 HUD 按钮使用；可完整删除该公开 prop 和 handler，不会影响普通执行、失败重试或内部 stale 依赖计算。
- Electron 9333 实测主画布顶部当前只显示 `画布就绪 / 运行全部 / 运行选中`，DOM 中已找不到 `待重跑 / 重跑受影响 / 需要处理`；这证明简化落在真实 Electron UI，而不只是测试环境。
- Electron 临时工作区已成功插入内置“剧本到分镜一体化制作台” Recipe，当前节点本体仍保持 `制作台 / 生成故事板` 两个明确入口；接下来可用该临时节点验证镜头资产 chip、跳回与删除影响提示。
- 临时 Recipe 的远端 LLM 流式生成在取消后进入明确的 `运行失败 / 重试失败节点 / 查看失败节点` 状态，验证了失败恢复文案；本地 Linghui 工作区数据位于 SQLite 而非散落 JSON，若需要构造 UI smoke 数据应走应用 API或临时工作区数据库记录，避免触碰原项目。
- SQLite 只存节点的 `properties_json / inputs_json / outputs_json`，临时 workspace `a890093dd1d7` 目前只有一个 Recipe 节点；可在清理前用精确 workspace/node ID 构造测试数据，但不应直接修改原有三个工作区。

## 2026-05-20 Koma 当前系统能力规格化初始发现

- 用户目标是为 Koma 自底向上重构建立“现状基线”：底层规划、持久化存储、文件存储、后台任务、插件系统、系统数据管理、主题系统。
- 本轮文档应从代码实现反推逻辑需求，不把未来计划写成已实现能力。
- 仓库已有可复用材料：`docs/ARCHITECTURE_REVIEW.md`、`docs/STORAGE_COMPARISON.md`、`docs/PLUGIN_ARCHITECTURE_REVIEW.md`、`docs/PLUGIN_SYSTEM_ANALYSIS.md`、`docs/THEME_ARCHITECTURE.md`、`docs/THEME_SYSTEM_PLAN.md`、`docs/TECH_DEBT.md` 等。
- 根目录已有长期规划文件，需追加本会话内容而非覆盖历史上下文。
- 本次产物已落为 `docs/当前系统能力需求规格说明书.md`，按现状能力、实现依据和限制三层组织。

### 初始代码盘点

- 根 `package.json` 表明 Koma 是 Electron + ee-core 应用，构建前会运行内置插件构建；核心依赖包含 `better-sqlite3`、`electron-store`、`electron-updater`、MCP SDK、LangChain 与 `zod`。
- Electron 侧能力集中在：
  - `electron/main.ts`：应用启动、单实例、远程调试端口、preload 和系统级初始化。
  - `electron/preload/**`：安全桥接与前端可见 API。
  - `electron/service/storage/**`：SQLite schema、BaseDB、SettingsDB、项目/任务/资产/角色等 repository。
  - `electron/service/tasks/**`：后台任务 IPC、TaskService、TaskRunner、delegate 与处理器。
  - `electron/service/plugin/**` 与 `electron/service/marketplace/**`：插件运行时、能力注册、市场安装。
- 前端侧能力集中在：
  - `frontend/src/store/**`：项目、任务、设置、插件、持久化 helper、恢复和自动保存。
  - `frontend/src/services/tasks*.ts`、`taskRunner.ts`、`taskHandlers/**`：前端任务抽象与本地处理器。
  - `frontend/src/theme/**`：主题 token、palette、theme、CSS vars 编译、AntD 配置和运行时 Provider。
  - `frontend/src/components/plugins/**`：插件管理、导入、权限展示和 Host。
- 插件生态还包含 `packages/plugin-sdk/**`、`packages/plugins/**`、`examples/plugins/**` 以及验证脚本 `scripts/verify:plugin*`。

### 启动、安全桥接与路径职责

- `electron/main.ts` 将 Electron/Chromium 的 `userData` 放到 `~/.koma/_userData`，业务根保留为 `~/.koma`，并在开发环境启用自定义 Chromium remote debugging port，默认 `9333`。
- `electron/main.ts` 注册 `koma-local://` privileged scheme，使 renderer 可以通过安全协议加载本地图片/视频/fetch，支持 range/stream 与跨源访问。
- `electron/preload/index.ts` 的初始化顺序是：注册本地协议和安全头、注册内置 LLM provider、注册 chat/settings/tasks IPC 与任务处理器，然后初始化 services；初始化完成后执行任务 reconcile/gc、恢复可恢复任务队列，再启动 updater 与 plugin marketplace。
- `electron/preload/bridge.ts` 通过 `ALLOWED_INVOKE_CHANNELS` / `ALLOWED_LISTEN_CHANNELS` 明确白名单，renderer 只能调用被列出的 IPC；对外暴露 `electronAPI` 命名空间，包括 window/dialog/fs/diagnostics/project/linghui/ffmpeg/plugin/net/llm/chat/tasks/updater/marketplace。
- `electron/service/paths.ts` 明确区分业务根、当前可配置存储根、插件运行目录、插件暂存目录、settings.db、ffmpeg cache、updater cache、marketplace cache、全局音色库、风格参考图等路径。
- `electron/service/index.ts` 初始化全局 `settingsDB`、项目服务、诊断服务、灵绘服务、FFmpeg 服务、插件服务，并在关闭时关闭 `baseDB` 与 `settingsDB`。

### 持久化与文件存储发现

- `electron/service/storage/BaseDB.ts` 管理当前 storageRoot 下的 `db/koma.db`，启用 WAL、foreign keys、busy timeout，并通过 `schema_version` 表做增量迁移。
- `electron/service/storage/SettingsDB.ts` 管理固定业务根 `~/.koma/settings.db`，用于跨项目共享的 channel configs、media defaults、app KV、chat history、通用后台 tasks。
- `electron/service/storage/schema.ts` 当前项目库 schema 版本为 9；结构化表覆盖项目、角色、场景、道具、分镜、分镜版本、资产、集数、时间线、时间线轨道/片段/转场/关键帧/动画、实体与集数/分镜关系、分镜媒体条目、灵绘工作区/节点/边/运行/日志/模板/资产/历史。
- `ProjectService.init()` 当前把 SQLite 初始化在 `storageRoot/db/koma.db`，而不是每个 `projects/{id}/koma.db`；项目目录仍按 `projects/{id}/assets/images|videos|audio|fonts`、`shots`、`cache/thumbnails|waveforms|previews`、`exports`、`temp`、`episodes` 建立文件结构。
- `ProjectService` 的项目删除会数据库级联删除项目数据、清理 `project:{id}` scope 的通用任务，并删除项目文件目录。
- 项目导出会从数据库组装 `loadProjectFull()`，写入项目目录临时 `_export_data.json` 后压缩项目目录；导入支持新格式 `_export_data.json` 和旧格式 `meta.json`，并把结构化数据写回仓储，同时复制资源文件。
- `LinghuiService` 使用同一个 `baseDB` 存储灵绘工作区的 graph meta、groups、nodes、edges、node runs、execution logs、workflow templates、workspace assets、history records；实际媒体/文本结果落在 `linghui-workspaces/{workspaceId}/assets|history|resources` 等文件目录。
- 灵绘工作区导出支持 JSON 或 zip 包；zip 包包含 `manifest.json`、`workspace.json`、`records/*.json` 与本地资源文件，资源引用会改写为 `koma-archive://`，导入时会重新映射 workspace/node/group/edge id 并做路径越界校验。
- 风险：`linghui_global_assets` 只在 `schema.ts` 的 v8/v9 migration 中出现，未在 `CREATE_TABLES_SQL` 初始建库部分命中；全新数据库若直接标记为 current schema 可能缺少该表。规格中应把全局灵绘资产库列为“代码暴露能力 + 初始建库需复核”的现状限制。

### 文件访问、安全与协议

- `electron/controller/fs.ts` 允许访问的根目录包括 `home`、`appData`、`userData`、`temp` 和业务根 `~/.koma`；读写、mkdir、readdir、stat、remove、copy、download 都先做路径检查。
- `controller/fs/downloadFile` 支持 HTTP(S) 下载到本地，带默认 UA / Accept 头、最多 5 次重定向，并会对每次请求前调用 `validateUrl()` 做 SSRF 防护。
- 下载逻辑会优先尝试 Electron fetch / net.fetch，遇到特定中文响应头兼容性问题时回退 Node `http/https`。
- `electron/service/protocol.ts` 注册 `koma-local://` 只允许读取业务根、当前 storageRoot、`resourcesPath`、`appPath` 等白名单路径，支持 `Range` 请求、`Access-Control-Allow-Origin:*` 和图片/视频/音频 mime 映射。
- `electron/service/security.ts` 设置全局 CSP：脚本、样式、连接、图片与媒体来源都被显式约束；开发环境额外放行 Vite HMR 需要的 `unsafe-eval`。
- `electron/preload/bridge.ts` 进一步限制 renderer 可调用的主进程通道，文件系统、项目、灵绘、FFmpeg、插件、更新、市场等能力都必须经过白名单。

### 系统数据管理与主题

- `frontend/src/store/settings/core.ts` 把全局设置拆成两类：渠道类（`channelConfigs`、`mediaDefaults`）走 `settings.db`，其它类（`promptTemplates`、`customThemePresets`、UI 主题等）走 `settings.json`；Electron 路径下会自动加密/解密并在加载时合并两边数据。
- `frontend/src/store/settings/channelConfig.ts` 不再提供 localStorage 回退，直接依赖 Electron + SQLite；支持按类别/能力查询渠道、设置默认渠道和默认媒体模型、按插件批量删除渠道。
- `frontend/src/store/settings/mediaConfig.ts` 基于 `channelConfigs + mediaDefaults` 解析默认/当前生图、生视频、配音配置，说明当前系统的模型选择权由渠道/默认选择共同决定。
- `frontend/src/store/storageConfig.ts` 负责存储根路径的选择、验证与迁移，默认指向用户 home 下的 `.koma`；迁移时显式跳过 Electron 的 `_userData` / Singleton 文件。
- `frontend/src/config/themePresets.ts` 提供 4 套内置项目风格预设 + 自定义项；风格预设会生成 `ProjectStyleSnapshot`，影响项目的 TTI 风格前缀与 LLM prompt 后缀。
- `frontend/src/theme/themes/*` 当前注册了 4 套应用主题：`dark-emerald`、`dark-business`、`light-business`、`high-contrast`；主题由 `ThemeProvider` 写入 CSS 变量并同步 AntD ConfigProvider，同时持久化选中的 themeId。
- `frontend/src/components/settings/AppearanceThemeSettings.tsx` 提供主题切换 UI，预览 swatches 来自当前主题 token；切换时会同步保存到 settings 并回滚失败状态。

### 项目级前端状态与自动保存

- `frontend/src/store/projectStore.ts` 当前是项目域能力总出口，覆盖项目 CRUD、时间线、素材、分镜版本、剧集、分析、角色/场景/道具、缓存、临时文件和 Manju-DSL 导入导出。
- `frontend/src/store/autoSaveService.ts` 以 projectId 为粒度做防抖自动保存，状态机有 `dirty / saving / saved / error`，关闭窗口或 `Ctrl/Cmd+S` 时会触发保存并尽量在退出前刷盘。
- `frontend/src/store/taskRecoveryService.ts` 会扫描未完成媒体任务并通过 `mediaGenerationService.recoverTask()` 恢复，说明当前系统对“关窗口后任务继续跑”的语义是明确支持的。
- `frontend/src/store/chatHistoryStore.ts` 将聊天会话元数据缓存在 Zustand，消息明细落 `settings.db` 的 `chat_sessions` / `chat_messages`，空会话不会提前落库。
- `frontend/src/store/promptTemplates.ts` 管理 prompt 模板库和分类体系，支持全局约束、系统提示、剧本/分析/提取/推文、图片提示词推理、视频提示词推理、TTI/ITV 直拼模板。

### 插件系统能力边界

- 主进程 `pluginService` 负责插件包验证、安装、卸载、内置插件同步；安装时会把插件解压到 `plugins-staging`，最终落到 `plugins-runtime/{pluginId}`。
- `electron/service/plugin/runtime.ts` 负责真正的后端加载和激活：校验 manifest shape、兼容性、签名、scope，再根据 category 加载 provider / MCP / agent 的后端入口。
- `electron/service/plugin/types.ts` 说明当前插件分类是 `provider / global / tool / mcp / agent`，且插件 manifest 可携带 `providerMeta / globalMeta / mcpMeta / agentMeta`。
- Provider 插件必须满足媒体契约版本 `media-request-v1`；MCP 工具名强制命名空间化为 `pluginId:toolName`；CapabilityRegistry 负责把 provider / MCP tool/resource 统一成可查询、可解析、可调用的能力目录。
- `electron/service/plugin/bridge.ts` 提供主进程对 Provider / MCP / Agent 的统一调用入口；`electron/controller/plugin.ts` 再把这些能力暴露到 renderer IPC。
- `frontend/src/services/plugin/*` 负责前端插件 bundle 的加载与沙箱执行：global/provider/tool 插件以 UMD/IIFE 进入宿主页面，frontend API 通过 scope 检查、沙箱 fetch 和受限文件访问来约束能力。
- `frontend/src/store/pluginStore.ts` 保存已安装插件清单与运行态；`PluginManager` 提供安装、卸载、启用/停用和目录打开 UI。

## 2026-05-18 LibTV 全节点清单与迁移顺序

- 使用 `rg -l "nodeTypes|wrapSelfVirtualizing|space-scene-720" template_/libtv -g '*.js'` 定位节点映射所在 chunk；关键映射在 `template_/libtv/15gvxu-nayl4w.js` 与 `template_/libtv/13h1xgiucfbcg.js`。
- LibTV `nodeTypes` 映射原始片段：
  - `custom`
  - `text`
  - `image`
  - `video`
  - `audio`
  - `temp`
  - `group`
  - `script`
  - `storyboard`
  - `video-story`
  - `video_group`
  - `video-clip`
  - `space-scene-720`
- 灵绘当前一等节点类型：
  - `linghui/text`
  - `linghui/agent`
  - `linghui/image`
  - `linghui/panorama`
  - `linghui/video`
  - `linghui/audio`
  - `linghui/script`
  - `linghui/storyboard`
  - `linghui/director3d`
  - `linghui/image-grid-slice`
  - `linghui/video-clip`
- 差距判断：
  - LibTV `text/image/video/audio/script/storyboard/video-clip/space-scene-720/group` 都有灵绘对应物或近似物。
  - LibTV `custom/temp/video-story/video_group` 在灵绘没有一等价物，需要继续反编确认是否应迁移为隐藏中间节点、合并进故事板/视频合成，还是不暴露。
  - 灵绘 `agent/director3d/image-grid-slice` 是本项目扩展或为 LibTV 能力拆出的专用节点，不是 LibTV 直接节点映射。
- 当前优先顺序：
  1. `audio`：代码面较小，LibTV 证据明确，适合作为本轮节点对齐首个落点。
  2. `group/video-clip/video_group`：涉及组合操作和最终剪辑，用户要求“所有节点”时必须补齐。
  3. `image`：已有大量迁移，但还需要逐按钮核验真实执行路径。
  4. `video`：深度反编已有，剩余截图/解析/去字幕/8 mode generator 继续补。
  5. `script/storyboard/video-story`：故事板已改，需确认 LibTV `video-story` 是否对应独立剧情视频流程。

### LibTV AudioNode 反编结论

- 关键证据在 `template_/libtv/15gvxu-nayl4w.js`，`AudioNode` 片段附近包含 `K.displayName="AudioNode"`。
- 状态机：`eT = generating / failed / resource / pending / empty_generate`，条件为 running task、failed task、有音频 URL、有上游、否则空生成。
- `resource` 态：渲染音频播放器 `a.default({ url, playbackRate, nodeId, onDurationReady })`，并在 `AUDIO_RESOURCE` 且非资产音频时显示上传入口。
- `empty_generate` 态：中心 `AudioDisc` 66px，只有一个 action：`音频生视频`，点击后写当前节点为 `AUDIO_RESOURCE` preset，并在右侧创建 `VIDEO_GENERATE`，下方创建 preset 图片节点，两条边接入视频。
- `pending` 态：LibTV 直接渲染 `null`，没有“等待上游”文案。
- 灵绘已实现 `LinghuiAudioNodeEmptyState` 和 `useLinghuiCanvasAudioEmptyAction` 的派生逻辑；本轮应补齐 AudioNode 自身状态机使用、上传浮按钮和资源态 compact 操作面板。

### LibTV VideoClipNode 反编结论

- 关键证据在 `template_/libtv/15gvxu-nayl4w.js`，`VideoClipNode` 片段附近包含 `rC.displayName="VideoClipNode"`。
- 可见节点 label fallback 是 `n?.name || n?.label || "视频合成节点"`；节点 shell 里 `shouldShowGenerator:false`，不是普通视频 generator 条。
- 空态组件 `rI` 的逻辑：
  - `canOpen = m && (b || C)`，即至少有一个视频输入，并且“2 个及以上视频”或“有音频输入”时可以打开合成。
  - 不可打开时显示两类文案：无输入为 `空空如也，请连接多个视频节点后操作`，输入不足为 `请连接2个及以上的视频/音频后操作`。
  - 可打开按钮文案是 `打开视频合成`；生成中显示 `生成中`。
- 资源态 `rw` 会显示视频预览，中央浮一个 `打开视频合成` 按钮；右上有下载按钮。
- 与灵绘差距：灵绘已有 `linghui/video-clip` 节点、clips 自动同步和剪辑详情 Modal，但合成按钮仍是 `Modal.info("executor 尚未接入")` 假入口；本轮应先接通真实 FFmpeg concat，后续再继续复刻 LibTV 的内嵌 clip editor / editingClipNodeId 全屏预览。
- 2026-05-18 继续对齐：`VideoClipNode` 资源态应显示合成结果预览，并以 `打开视频合成` 作为主入口；空态和输入不足文案直接使用 LibTV 原文。灵绘仍保留现有 compact 片段列表和真实 FFmpeg concat，不把 Modal 调参文案暴露为“打开剪辑”。

### LibTV VideoGroupNode / VideoStoryNode 初步反编结论

- `video_group`：关键片段含 `rx.displayName="VideoGroupNode"`，它不是普通视频节点，而是 storyboard image group 生成出来的视频组容器。
  - `libtv.canvas.storyboard.generate_video_group.click` 上报说明它从故事板图片组入口触发。
  - 生成时读取脚本行 `videoMotionPrompt`、分镜图片 `url[0]`、portrait asset，并创建一组 `VIDEO_GENERATE` 子节点，命名 `分镜视频-#${shotNumber}`，父节点是新的 group，group data 包含 `storyboardGroupType:"video"`、`sourceScriptNodeId`、`storyboardTitle:"视频组 · ..."`。
  - 顶部有 `全部重生`、视图切换、全屏展开；能响应脚本变更，重新绑定/触发分镜图或视频节点。
- `video-story`：关键片段含 `r_.displayName="VideoStoryNode"`，更像视频故事数据表节点。
  - 默认标题 `视频故事`，读取 `rows` 和 `shotColumns`，自动推导列集合；图片 URL 列用缩略图，文本列用可选中/可双击选择的 scroll cell。
  - 节点默认尺寸 800×400，支持全屏展开，空态显示 `暂无数据`。
- 灵绘映射建议：
  - `video_group` 不应立刻新增裸菜单节点，优先落到“故事板/脚本 -> 生成分镜视频组”的派生流程：创建 group + 多个 `linghui/video` 子节点 + 可后接 `linghui/video-clip`。
  - `video-story` 可映射为现有 `linghui/storyboard` 的 table/fullscreen 视图增强，或新增只读 `视频故事` 节点；需要先看用户是否需要从 LLM 生成视频故事表再派生视频组。
- 本轮落地：
  - 灵绘 `生成视频流程` 已从“散落 image/video 节点”改为 LibTV 式视频组：创建 group，data 写入 `sourceScriptNodeId/storyboardTitle/storyboardGroupType:"video"`，label 为 `视频组 · {故事板名}`。
  - 每个镜头在 group 内生成首帧/分镜图节点和视频节点；视频节点保留 `scriptSourceNodeId/scriptShotId/scriptDerivationKind:"video"`，prompt/duration 来自镜头描述和时长。
  - group 右侧自动创建 `linghui/video-clip`，`clips` 绑定这些分镜视频节点，后续视频生成完成后可直接合成。

### LibTV SpaceScene360Viewer / space-scene-720 反编结论

- 关键证据在 `template_/libtv/15gvxu-nayl4w.js`，`nodeTypes` 中 `"space-scene-720": wrapSelfVirtualizing(s.default)`，并能搜到 `SpaceScene360Viewer` 相关实现。
- LibTV 全景预览不是静态图：使用 Three.js / WebGL viewer，加载态文案为 `全景预览加载中 {percent}%`，空态为 `暂无全景图`。
- 预览层有可选九宫格构图线，右下角 HUD 显示当前视角：
  - `横 0° · 纵 0°`
  - `缩放 60°×1.00`
- 全屏预览底部有紧凑工具条，包含 `快捷键`、`关闭快捷键面板` 一类按钮；同时有构图网格和交互开关语义。
- 全景截图命名不是普通 N/E/S/W：
  - 4 向常量：`全景截图-前方`、`全景截图-左侧`、`全景截图-后方`、`全景截图-右侧`
  - 12 向函数：`全景截图-逆时针${30*index%360}°`
  - 截图组名称：`全景截图组 (${count} 张)`
- 灵绘落地策略：保留现有 `PanoramaViewport` 的 Three.js 预览与 GPU 抽取，补齐 HUD / 构图网格 / 全屏底部工具条 / 12 向截图和 LibTV 命名，避免再做静态图片面板。

### 2026-05-18 Image / Script / Storyboard / Agent 预制能力对齐

- 图片通用工具的可本地落地点是 `crop`：灵绘已有 `ffmpegManager.cropImage`，本轮 UI 增加裁剪比例预览遮罩，`封面裁剪 4:5` 走同一条本地 FFmpeg 裁剪链路。
- `擦除 / 抠图 / Mockup / 编辑元素 / 编辑文本` 当前没有本地分割、修复或文字编辑模型，不能伪装成本地处理；本轮只补 LibTV 式 preset 和说明，继续走真实图生图派生节点。
- `ScriptNodeEditor` 的 LLM 生成态适合承接本地预制提示词：本轮新增 `剧情分镜 / 多机位 / 产品短片 / 情绪蒙太奇`，点击后写入真实 `prompt/systemPrompt`，后续执行器会按现有 LLM JSON 契约生成 storyboard result。
- `StoryboardNodeEditor` 的 scene preset 底层已经由 `executeStoryboardNode` 拼入 `buildStoryboardSystemPrompt` 和 compiled prompt；本轮把 `四镜头 / 九镜头 / 16镜头 / 25镜头` 从隐藏下拉升级为可见紧凑 preset 条，点击写入 `scene/targetShotCount`。
- `AgentNodeEditor` 本轮补 `素材分析 / 生成方案 / 分镜检查 / 提示词优化` 本地任务模板，写入真实 `prompt/systemPrompt/maxIterations`，不是装饰按钮；工具白名单仍保留在设置弹层中。

### 2026-05-18 Script / Storyboard 节点内故事板反编与修正

- 用户指出“故事描述、画面提示词、视频提示词、画面描述一模一样”是正确问题：灵绘 `ScriptShotViews.toShotTableRow()` 原先把 `plotDescription / visualDescription / imageGenerationPrompt / videoMotionPrompt` 全部回填为 `shot.description`，导致故事板不可用。
- LibTV `ScriptNode` 证据在 `template_/libtv/15gvxu-nayl4w.js`：节点本体内部渲染表格或卡片，节点头部有 view mode 切换和全屏按钮；选中行后才在节点下方显示 `ScriptAggregatedGenerator`。不是单纯外挂编辑器展示。
- LibTV `VideoStoryNode` 证据同在 `15gvxu-nayl4w.js` / `13h1xgiucfbcg.js`：节点 shell 内部直接渲染动态表格，空态显示 `暂无数据`，全屏 overlay 也复用同一表格。
- LibTV 表格字段包含：`durationSeconds`、`plotDescription`、动态 `characters`、`videoReference`、`shotSize`、`characterAction`、`emotion`、`sceneTags`、`lightingAndAtmosphere`、`audioEffects`、`dialogue`、`imageGenerationPrompt`、`videoMotionPrompt`。
- 本轮修正方向：
  - `LinghuiStoryboardFrame` 扩展上述关键字段。
  - JSON 解析器保留这些字段，`description` 只作为兼容摘要，不再驱动所有列。
  - story/script system prompt 要求 LLM 输出不同的 `plotDescription / visualDescription / imageGenerationPrompt / videoMotionPrompt`。
  - 图片派生优先使用 `imageGenerationPrompt`；视频派生优先使用 `videoMotionPrompt`。
  - `ScriptNode` / `StoryboardNode` 本体直接显示故事板卡片/表格，并提供节点内 `分镜图 / 视频流程` 操作，编辑器不再是唯一可见故事板载体。

### 2026-05-19 GridSliceNode 本地合成边界

- LibTV 证据仍保持两条不同链路：`剧情推演九宫格 / 多机位九宫格 / 16宫格 / 25宫格` 属于 slash image 分镜生成；`宫格切分` 属于已有宫格图片的 GridSplit editor，二者不能互相替代。
- 灵绘 `linghui/image-grid-slice` 是本地切图中间节点，不是 LibTV 的剧情生成入口；因此本轮只补可本地闭环的操作，不把它伪装成云端分镜生成器。
- 本轮对齐点：在节点本体 footer 增加 `合成宫格`，用浏览器 canvas 按当前槽位和 `2x2 / 3x3 / 4x4 / 5x5` 重新拼成一张图片，再走已有 `onCreateDerivedImportImages` 派生图片节点。
- 现有 `彻底切分` 保持原语义：只把非空槽位派生为独立图片节点。空槽在合成图中保留轻背景和网格线，避免用户清空后误以为布局被压缩。
- 继续补齐本地可实现的 slot 操作：已有图片槽位可拖拽换位，空槽/任意槽位可接收拖入的本地图片或 URL；这只更新 `slots[]`，不触发剧情分镜生成。

### 2026-05-19 VideoNode 资源态节点内工具条

- LibTV 视频资源节点的操作入口靠近节点本体，而不是只藏在外部面板；已有反编结论包含截图、剪辑、高清、解析、音频分离等资源态工具。
- 灵绘这些工具已有真实执行面板：截图抽帧、剪辑派生、本地高清、解析文本和 FFmpeg 音轨分离。`智能去字幕` 和 `人声分离` 仍依赖云端/专用服务，本轮不放进节点本体工具条。
- 本轮对齐点：选中资源态 `VideoNode` 时，在视频预览上方显示紧凑扁平工具条，点击后调用 `openVideoToolPanel(nodeId, tool)` 打开对应真实工具面板。

### 2026-05-19 AudioNode 资源态节点内派生入口

- LibTV 音频节点的 `音频生视频` 是明确的派生动作：以音频节点为输入，在右侧创建视频节点，并补一个图片输入节点。
- 灵绘已有同名真实派生链路 `onApplyAudioEmptyAction(nodeId, 'audio-to-video')`，此前只在空态 EmptyState 中可见。
- 本轮对齐点：选中资源态音频节点时，播放器工具条增加 `生视频` 小按钮，直接触发同一条派生链路；倍速和下载保持原资源态操作。

### 2026-05-19 Storyboard 卡片字段化展示

- 用户此前指出故事板字段“故事描述 / 画面提示词 / 视频提示词 / 画面描述”一模一样且像样子货；数据解析已修正，但节点内卡片视图仍只露摘要，容易看不出字段差异。
- LibTV 的故事板/视频故事节点在节点本体里直接展示表格/卡片数据，而不是只靠外挂编辑器；字段应在节点内可扫描。
- 本轮对齐点：`ScriptShotCards` 在卡片中分开展示 `剧情描述 / 画面 / 生图 / 视频`，表格视图继续保留完整列。

### 2026-05-19 Storyboard 节点内表格编辑

- LibTV 的故事板/视频故事表格允许在节点/全屏表格里直接处理字段，不应只作为不可编辑预览。
- 灵绘已有 `ScriptShotTable` editable 机制，但此前只在脚本编辑器 manual 模式里使用；节点本体表格仍是只读。
- 本轮对齐点：`ScriptNode` 节点内表格开启 editable，修改后的镜头数据写入节点 `properties.editedShots`；节点内 `生成分镜 / 生成视频组` 会读取编辑后的字段。
- `StoryboardNodeEditor` 也读取/写入同一份 `editedShots`，减少节点本体和外挂编辑器之间的数据割裂。
- 节点内聚合生成器补齐 `派生文本`，调用已有 `onDeriveScriptShots`，与编辑器里的 `派生镜头文本 / 分镜图 / 视频流程` 三类操作保持一致。
- 继续完善后，故事板空态也收回节点本体：节点内可直接输入剧情大纲并调用 `onRunNode` 生成故事板；已有镜头时右上角提供 `全选/清选`，不需要打开外置编辑器做批量选择。
- 收起态故事板正文不再滚动截断，而是用缩放后的总览内容铺在节点内；右上角展开后节点自身放大并在节点内滚动查看完整表格/卡片。

## 2026-05-17 灵绘大组件 / 大 hooks 拆分扫描

- 扫描命令口径：`rg --files frontend/src/components/linghui -g '*.tsx' -g '*.ts' -g '!**/*.test.ts' -g '!**/*.test.tsx' -g '!**/tests/**'`，组件取 `.tsx`，hooks 取 `use*.ts(x)`，阈值 `>500` 行。
- 结果：本轮目标文件 19 个，合计约 20,313 行；其中 hooks 3 个，组件 16 个。最大风险集中在画布操作 hooks、图片编辑器、3D 导演编辑器、页面 shell。
- 超过 500 行但不属于本轮“组件 / hook”的文件也存在：`director3dScene.ts`、`linghuiExecutionNodeExecutors.ts`、`director3dExportGeometry.ts`、`linghuiCanvasShared.ts`、`linghuiPromptReferences.ts`、`linghuiExecutionShared.ts`、`providers/image.ts`、`linghuiResultExport.ts`、`linghuiNodeDefs.ts` 等。它们应作为后续“逻辑模块拆分”单独处理，不要混进 UI 组件拆分。

### 优先级判断

- P0：`useLinghuiCanvasDocumentOps.ts` 2196 行。天然边界已经按函数暴露：workspace asset 节点创建、storyboard 派生、group 创建、媒体结果派生、image tool 派生、Text/Video/Audio EmptyState 派生。建议先抽纯 helper，再抽 `useLinghuiCanvasDerivationOps` / `useLinghuiCanvasEmptyActions` / `useLinghuiCanvasGroupOps`，原 hook 只聚合返回值。
- P0：`useLinghuiCanvasOverlayProps.ts` 1869 行。当前同时处理 quick create、context menu、结果复制、图片工具执行、宫格切分、高清/裁剪、多角度、视频音频分离和 props assembly。建议拆成 `useLinghuiCanvasContextActions`、`useLinghuiImageToolExecution`、`useLinghuiMediaResultActions`、`useLinghuiQuickCreateActions`，最后保留薄聚合层。
- P0：`useLinghuiCanvasMediaImport.ts` 582 行。上传图片/视频/音频和拖拽导入混在一起；拆 `linghuiCanvasUploadNodes.ts` 纯 node factory、`useLinghuiCanvasUploadActions`、`useLinghuiCanvasDropImport`。要保留现有 Strict Mode 稳定 id 约束：节点对象必须在 `setNodes` updater 外创建。
- P1：`ImageNodeEditor.tsx` 1976 行。当前包含状态、图片参数、镜头参数、聚焦/标记、多角度、打光、扩图、重绘、通用工具面板和 import/generate 分支。建议先搬出只读组件：`ImageToolPanelShell`、`MultiAngleToolPanel`、`RelightToolPanel`、`OutpaintToolPanel`、`RepaintToolPanel`、`GenericImageToolPanel`、`ImageFocusPanel`、`ImageMarkPointPanel`，再抽动作 hooks。
- P1：`LinghuiImageNodeFloatingToolbar.tsx` 552 行。菜单结构可拆为 `ToolbarButton`、`ImageRepaintMenu`、`ImageMoreMenu`、`GridStoryMenu`、`GridSplitMenu`、`GridStoryPromptModal`，保持现有 Dropdown popup class 和 body container 不变。
- P2：`Director3DNodeEditor.tsx` 2091 行。最大 JSX 块集中在左 rail 资产 popover、视口、右侧 inspector、顶部 HUD、底部 timeline。建议拆 `Director3DTopBar`、`Director3DAssetRail`、`Director3DAssetPopoverContent`、`Director3DInspectorPopover`、`Director3DCameraInspector`、`Director3DActorInspector`、`useDirector3DSceneActions`、`useDirector3DTimelineActions`。
- P2：`Director3DViewport.tsx` 1249 行。可拆 scene primitives 和交互层：`Director3DEnvironment`、`Director3DBackground`、`Director3DCaptureRenderer`、`Director3DActorDragLayer`、`useDirector3DOrbitCamera`、`useBackgroundTexture`。保持 r3f Canvas 和 capture handle 行为不变。
- P2：`Director3DCreatureMesh.tsx` 809 行、`Director3DProp.tsx` 715 行。程序化 mesh 可按物种/道具族拆小部件；必须同步检查导出几何 parity，避免视口拆了但导出仍依赖旧结构假设。
- P3：`LinghuiPage.tsx` 2086 行。职责包含 workspace load/save、runtime restore、library drawers、project rail、execution queue/log、workflow execution。建议先抽 `LinghuiCanvasProjectRail` / `LinghuiExecutionLogPanel` 纯组件，再抽 `useLinghuiWorkspacePersistence`、`useLinghuiWorkspaceRuntime`、`useLinghuiExecutionController`。
- P3：`LinghuiCanvas.tsx` 824 行。可拆快捷创建/布局修复/outlier notice/ReactFlow event bindings/overlay wiring；原文件保留 ReactFlow composition。
- P4：`LinghuiPromptEditor.tsx` 927 行、`ImageNode.tsx` 890 行、`VideoNode.tsx` 510 行、`VideoNodeEditorPanels.tsx` 610 行、`ScriptNodeEditor.tsx` 502 行、`LinghuiCanvasContextMenu.tsx` 521 行、`PanoramaViewer.tsx` 626 行。适合在 P0-P3 稳定后做低风险组件提取，优先保留 DOM 与 className。

### 拆分护栏

- 这批重构是 mechanical extraction：不得趁机改功能、样式、文案、菜单尺度或节点数据结构。
- 先搬 JSX 和纯 helper，再抽 hooks；每一步保持原文件可读的 orchestration，不做跨模块大改名。
- 每个 slice 先跑相关测试，再跑 `npx tsc --noEmit --project frontend/tsconfig.json` 和 root `npx tsc --noEmit --project tsconfig.json`；若改到渲染结构，按 AGENTS.md 只用 Electron CDP `127.0.0.1:9333` 做视觉检查。
- 本轮扫描后额外跑了 frontend TypeScript，当前通过。

### 2026-05-17 P0 第一片：DocumentOps EmptyState 动作拆分

- 已把 `useLinghuiCanvasDocumentOps.ts` 里的 Text / Video / Audio EmptyState 派生动作抽到独立小 hooks：
  - `useLinghuiCanvasEmptyActions.ts`：21 行聚合入口，继续提供原来的 `applyTextEmptyAction / applyVideoEmptyAction / applyAudioEmptyAction`。
  - `useLinghuiCanvasTextEmptyAction.ts`：235 行，保留文本空态 4 个动作。
  - `useLinghuiCanvasVideoEmptyAction.ts`：241 行，保留视频空态首帧/首尾帧动作。
  - `useLinghuiCanvasAudioEmptyAction.ts`：172 行，保留音频生视频动作。
  - `linghuiCanvasEmptyActionShared.ts`：31 行，共享参数类型和边去重 helper。
- `useLinghuiCanvasDocumentOps.ts` 从 2196 行降到 1624 行；本轮没有改变返回 API，`LinghuiCanvas` / `useLinghuiCanvasOverlayProps` 仍从 DocumentOps 拿同名动作。
- 验证：`useLinghuiCanvasDocumentOps.test.tsx` 9 tests passed；frontend/root TypeScript passed；`git diff --check` passed。

### 2026-05-17 P0 第二片：MediaImport helper 拆分

- 已把 `useLinghuiCanvasMediaImport.ts` 里的上传节点创建和 source 解析抽到纯 helper：
  - `linghuiCanvasUploadedNodeFactories.ts`：73 行，承接图片/视频/音频上传节点 factory。
  - `linghuiCanvasMediaImportSources.ts`：47 行，承接拖拽文件 source 解析与图床/本地工作区 fallback。
- `useLinghuiCanvasMediaImport.ts` 从 582 行降到 479 行，已退出本轮超 500 行 hooks 清单。
- 保留关键行为：图片/视频上传节点仍在 `setNodes` updater 外提前创建，避免 React Strict Mode 双调用导致插入 id 与异步上传回写 id 不匹配。
- 验证：全量 `frontend/src/components/linghui/canvas/tests` 14 files / 71 tests passed；frontend/root TypeScript passed；`git diff --check` passed。

### 2026-05-17 P0 第三片：DocumentOps Storyboard 派生拆分

- 已把 `useLinghuiCanvasDocumentOps.ts` 里的脚本节点分镜派生拆成三条独立 hook：
  - `useLinghuiCanvasStoryboardTextDerivation.ts`：承接从脚本创建分镜文本节点。
  - `useLinghuiCanvasStoryboardImageDerivation.ts`：承接从脚本/分镜派生图片节点。
  - `useLinghuiCanvasStoryboardVideoDerivation.ts`：承接从脚本/分镜派生视频节点。
  - `useLinghuiCanvasStoryboardDerivations.ts`：12 行薄聚合入口，保持原 DocumentOps 三个方法名。
  - `linghuiCanvasStoryboardDerivationShared.ts`：共享 hook 参数类型；`linghuiCanvasDocumentOpsShared.ts`：共享派生 metadata 与边去重 helper。
- `useLinghuiCanvasDocumentOps.ts` 从 1624 行降到 1107 行，仍偏大，但 storyboard 业务边界已经从主 orchestration hook 移出。
- 行为约束：没有修改节点类型、边类型、selection、context menu、quick create、snapshot 调度等对外语义；原 hook 仍暴露 `deriveStoryboardShotsFromScript / deriveStoryboardImagesFromScript / deriveStoryboardVideosFromScript`。
- 验证：`useLinghuiCanvasDocumentOps.test.tsx` 9 tests passed；全量 `frontend/src/components/linghui/canvas/tests` 14 files / 71 tests passed；frontend/root TypeScript passed；`git diff --check` passed。

### 2026-05-17 P0 第四片：DocumentOps 媒体派生与分组操作拆分

- 已把 `useLinghuiCanvasDocumentOps.ts` 的媒体派生操作拆到小 hooks：
  - `useLinghuiCanvasImageResultDerivation.ts`：图片结果派生图片节点。
  - `useLinghuiCanvasPanoramaDerivation.ts`：图片结果派生全景预览节点。
  - `useLinghuiCanvasVideoResultDerivation.ts`：视频结果派生视频节点。
  - `useLinghuiCanvasAudioFromVideoDerivation.ts`：视频分离音频派生音频节点。
  - `useLinghuiCanvasMultiAngleImageDerivation.ts`：多角度派生图片生成节点。
  - `useLinghuiCanvasImageToolDerivation.ts`：扩图/重绘/打光等工具派生图片生成节点。
  - `useLinghuiCanvasMediaDerivations.ts`：薄聚合入口，保持 DocumentOps 原返回 API。
- 已把删除、删边、解组、选中成组和 `clearPendingGroupFrame` 拆到 `useLinghuiCanvasGroupOps.ts`；这类操作仍使用原来的 selection、snapshot 和 run-state 清理语义。
- `useLinghuiCanvasDocumentOps.ts` 从 1107 行降到 472 行；`useLinghuiCanvasMediaImport.ts` 已是 479 行。P0 中已达标的 hooks：DocumentOps、MediaImport。
- 重新扫描 >500 组件/hooks 后，P0 hooks 只剩 `useLinghuiCanvasOverlayProps.ts` 1869 行；总体 >500 清单从 19 个降到 17 个。
- 验证：frontend TypeScript passed；`useLinghuiCanvasDocumentOps.test.tsx` 9 tests passed；全量 canvas tests 14 files / 71 tests passed；root TypeScript passed；`git diff --check` passed。

### 2026-05-17 P0 第五片：OverlayProps 拆分完成

- 已把 `useLinghuiCanvasOverlayProps.ts` 从 1869 行拆到 462 行；P0 三个 hooks 全部退出 >500 清单：
  - `useLinghuiCanvasDocumentOps.ts`：472 行。
  - `useLinghuiCanvasMediaImport.ts`：479 行。
  - `useLinghuiCanvasOverlayProps.ts`：462 行。
- OverlayProps 拆分边界：
  - `linghuiCanvasOverlayMediaHelpers.ts`：纯媒体/剪贴板/文件物化 helper。
  - `useLinghuiCanvasContextMenuMediaState.ts`：右键节点图片/视频/复制能力推导。
  - `useLinghuiCanvasImageToolExecutions.ts`：图片工具 preset、宫格切分、高清、裁剪、多角度执行。
  - `useLinghuiCanvasContextMenuActions.ts`：右键菜单动作，包括创建资产、创建主体、复制、展开/保留媒体、音轨分离、保存工作流。
  - `useLinghuiCanvasContextMenuOverlayProps.ts`：右键菜单 overlay props 和闭包组装。
- 重新扫描结果：当前 >500 清单剩 16 个组件，已无 hooks；下一阶段应进入 Image Node Editing Surface。
- 验证：frontend TypeScript passed；全量 `frontend/src/components/linghui/canvas/tests` 14 files / 71 tests passed；root TypeScript passed；`git diff --check` passed。

### 2026-05-17 P1 第一片：图片浮动工具条菜单拆分

- `LinghuiImageNodeFloatingToolbar.tsx` 的主要复杂度来自菜单构造，而不是渲染本身：高清、九宫格、宫格切分、重绘、更多菜单都在主组件内创建，并混入 Dropdown popup class、body container、active tool 判断和图标 JSX。
- 已新增 `linghuiImageToolbarMenus.tsx`，把这些菜单常量和 builder 移出；主组件只保留：
  - `openDropdown` 与 `pendingGridPreset` 状态。
  - `fireImageTool / openGridStoryComposer / openGridSplit` 这些调用节点 API 的闭包。
  - 实际工具条按钮 JSX。
- 行为保持点：`linghuiImageToolbarDropdown` / `linghuiImageToolbarSubmenuDropdown` class、submenu `popupOffset`、`getPopupContainer` 到 `document.body`、九宫格剧情编辑 Modal、高清 2x/4x、宫格切分 2x2-5x5、导入素材隐藏聚焦/标记入口都未改。
- 行数变化：`LinghuiImageNodeFloatingToolbar.tsx` 552 → 362 行；新 `linghuiImageToolbarMenus.tsx` 316 行。按当前扫描口径，剩余 >500 的组件 15 个，hooks 0 个。
- 恢复脚本提示上一会话还有全景视角修复上下文；当前工作树中 `ImageNode.tsx` 与 `panoramaPerspectiveExtractor.ts` 的未提交修改属于这段上下文，本次 P1 toolbar 拆分没有触碰。
- 验证：frontend TypeScript、`LinghuiNodeEditor.test.tsx`、`ImageNodeEditor.test.tsx`、root TypeScript、`git diff --check` 均通过；测试警告为既有 AntD/jsdom 与 Three.js duplicate warning。

### 2026-05-17 P1 第二片：ImageNodeEditor 面板拆分

- `ImageNodeEditor.tsx` 的剩余复杂度主要分为三类：状态/提交逻辑、工具面板 JSX、底部提示词和参数控制。第二片先只移动工具面板 JSX，不改变状态归属。
- 已新增三个子文件：
  - `ImageNodeEditorLibTVPanels.tsx`：LibTV 面板壳、footer、预览 stage、扩图、重绘和通用 preset 面板。
  - `ImageNodeEditorSettingsPopovers.tsx`：图片参数菜单与镜头菜单；`ImageNodeEditorExtraSettingsBlock` 从这里导出，并由 `ImageNodeEditor.tsx` re-export 保持兼容。
  - `ImageNodeEditorFocusMarkPanels.tsx`：聚焦、标记面板和焦点/百分比 UI helper。
- 保持行为点：扩图 4 向比例、重绘 prompt 合并、通用工具 crop 本地链路、焦距/光圈菜单、聚焦区域写入、标记点点击/键盘添加、生成 footer 的 `重置参数 / 生成` 文案和 className 都保持原样。
- 行数变化：`ImageNodeEditor.tsx` 1976 → 1516 行；新文件为 405 / 182 / 228 行，均低于 500。
- 验证：frontend/root TypeScript、`ImageNodeEditor.test.tsx`、`LinghuiNodeEditor.test.tsx`、`git diff --check` 均通过；警告仍为既有测试环境 warning。
- 下一片建议：拆 `MultiAngleToolPanel` 与 `RelightToolPanel`，这两块还留在主文件中，是当前最大 JSX 岛。

### 2026-05-17 P1 第三片：ImageNodeEditor 多角度 / 打光面板拆分

- 已新增 `ImageNodeEditorAngleRelightPanels.tsx`，把 `多角度编辑器` 和 `打光效果` JSX 从主 editor 移出。
- 保持状态归属不变：`ImageNodeEditor.tsx` 仍负责 `multiAngleConfig`、`relightValues`、preset 应用、reference image 选择、提交执行；子组件只接收 props 和回调。
- 行为保持点：
  - 多角度仍使用 `LinghuiMultiAngle3DViewport`、Object/Camera 模式、rotation/tilt/scale、广角、提示词开关和原 preset。
  - 打光仍使用 `LinghuiLightingSpherePreview`、brightness/color/direction/rimLight/smartMode/reference image 和原 preset。
  - 面板壳、footer、className、ARIA label 和按钮文案保持来自前一片的 LibTV panel components。
- 行数变化：`ImageNodeEditor.tsx` 1516 → 1268 行，新增 `ImageNodeEditorAngleRelightPanels.tsx` 368 行。
- 验证：frontend TypeScript、`ImageNodeEditor.test.tsx`、`LinghuiNodeEditor.test.tsx`、`git diff --check` 均通过。

### 2026-05-17 P1 第四片：LinghuiNodeEditor 壳层拆分

- `LinghuiNodeEditor.tsx` 的剩余复杂度主要是四类：selection/reference 状态收集、顶部工具条、布局尺寸和按节点类型分发编辑器。
- 本片只移动不拥有业务状态的部分：
  - `LinghuiNodeEditorVideoToolbar.tsx`：视频工具条与音频分离菜单；保留原按钮顺序、tooltip、disabled 行为和 dropdown className。
  - `LinghuiNodeEditorGridSplitToolbar.tsx`：宫格切分专属工具条；保留 `grid-split:type` / `grid-split:upscale` dropdown key、按钮文案和创建/回退回调。
  - `linghuiNodeEditorLayout.ts`：节点类型 label、宽高和 viewport bound helper。
  - `LinghuiNodeEditorSurface.tsx`：具体编辑器分发 JSX；继续由外层传入 `nodeType`，不依赖 `nodeData.type`。
- 行数变化：`LinghuiNodeEditor.tsx` 778 → 476 行；新增文件 154 / 100 / 55 / 168 行，均低于 500。
- 验证：frontend/root TypeScript、`LinghuiNodeEditor.test.tsx`、`VideoNodeEditor.test.tsx`、`ImageNodeEditor.test.tsx`、`git diff --check` 均通过。首次抽 `LinghuiNodeEditorSurface` 时误用 `nodeData.type`，TypeScript 捕获后改为显式传入 `nodeType`，保持原分发语义。
- 复扫发现 `useLinghuiCanvasContextMenuActions.ts` 作为 carryover 新 hook 为 501 行；仅压缩注释后降为 493 行，没有改变逻辑。

### 2026-05-17 最大组件继续拆分：LinghuiPage / Director3DNodeEditor

- `LinghuiPage.tsx` 最大的低风险 JSX 岛是 `canvasFloatingRail`：它包含项目列表、保存、新建、drawer 按钮、执行日志面板；状态和回调仍留在页面中，子组件只渲染并透传事件。
- 已新增 `LinghuiCanvasFloatingRail.tsx`，保持原 className、title/aria、项目列表 keyboard 逻辑、执行日志 item button 行为不变。
- `Director3DNodeEditor.tsx` 最大的低风险 JSX 岛是左侧 asset rail：人物/生物/道具/镜头/模板和派兵布阵 popover；所有 scene mutation 仍留在父组件，子组件只接收 `onAdd* / onApply* / onDelete*`。
- 已新增 `Director3DAssetLibraryPanel.tsx` 和 `Director3DTopBar.tsx`。第一次抽取时把 `CAMERA_PRESET_CATEGORY_ORDER` 当成 scene 导出、并临时移除了右侧 inspector 仍使用的 `CREATURE_SPECIES_LIBRARY`，frontend TypeScript 捕获后已修正。
- `LinghuiPage.tsx` 第二片抽出 `useLinghuiPageLibraries.ts`：资产库 / 工作流库 / 历史库加载、刷新和发送到画布动作集中到 hook；页面继续持有 active drawer 和 canvas ref。
- 当前行数：`LinghuiPage.tsx` 约 1701 行，`Director3DNodeEditor.tsx` 约 1717 行；新增子组件 / hook 均低于 500 行。
- 验证：frontend/root TypeScript、Director3D 资产/rig/导出测试、LinghuiNodeEditor/ImageNodeEditor 目标测试、`git diff --check` 均通过。

### 2026-05-17 Director3D 右侧 Inspector 拆分

- `Director3DNodeEditor.tsx` 右侧属性 inspector 是剩余最大 JSX 岛，包含 actor 基础属性、mannequin rig、creature 参数、formation 参数、保存全局资产和相机/背景 fallback。
- 已新增 `Director3DInspectorPanel.tsx`，保留原 `linghuiDirector3D*` className、popover 保存面板、Slider tooltip 关闭策略、比例/背景按钮文案和删除组合文案。
- 拆分边界：父组件仍拥有所有 scene mutation 和 asset save 逻辑；子组件只接收 `selectedActor`、`scene`、pending reference images 与回调。
- 行数变化：`Director3DNodeEditor.tsx` 约 1717 → 1341 行；新增 inspector 433 行。
- 验证：frontend/root TypeScript、Director3D 资产/rig/导出测试、LinghuiNodeEditor/ImageNodeEditor 目标测试、`git diff --check` 均通过。

### 2026-05-17 Carryover 拆分状态确认

- 当前工作树包含一组已存在但未提交的后续拆分，已通过 frontend TypeScript：
  - `LinghuiCanvas.tsx` 已拆到 56 行，新的主实现是 `LinghuiCanvasInner.tsx`，并新增 `useLinghuiCanvasInteractionHelpers / useLinghuiCanvasLayout / useLinghuiCanvasNodeApi`。

### 2026-05-17 LinghuiPage 工作区 / 保存 / 画布 handler 拆分

- `LinghuiPage.tsx` 继续沿 P3 页面 shell 边界拆分，优先移动无 JSX 或低 JSX 的业务岛，而不改变画布、项目 rail、drawer、执行流 props。
- 已新增：
  - `useLinghuiPageWorkspaceActions.ts`：手动保存、导入/导出、创建/删除/切换/重命名工作区。
  - `useLinghuiPageWorkspacePersistence.ts`：保存防抖、flush、工作区列表刷新、保存中状态。
  - `linghuiPageWorkspaceRuntime.ts`：运行时默认值和 `ensureWorkspaceRuntime()`，继续保留 running -> stale 恢复语义。
  - `useLinghuiPageExecutionRailState.ts`：失败/待重跑节点派生、执行日志摘要、重试/取消/focus handler。
  - `useLinghuiPageCanvasHandlers.ts`：画布快照保存、空快照防覆盖、崩溃暂停保存/恢复/重载、运行状态恢复。
- `LinghuiPage.tsx` 当前从约 1701 行降到 1150 行；新增 hook 文件均低于 500 行。
- 验证：每个片段后均运行 `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`，当前通过。

### 2026-05-17 Director3DNodeEditor 右 rail / 时间轴拆分

- `Director3DNodeEditor.tsx` 继续沿 P2 边界拆分，先移动纯 UI rail，再移动时间轴 controller。
- 已新增 `Director3DRightRail.tsx`：承接右侧输出/编辑视角、渲染风格、导出缩略图和属性 Popover 入口；父组件继续持有所有 scene mutation 和导出回调。
- 已新增 `useDirector3DTimelineController.ts`：承接 timeline、播放 RAF、当前 runtimeScene、关键帧增删移动、导出视频和导出结果回写。
- 保留行为点：关键帧 scope 规则、cameraOrbit 记录、actor/camera 变更时自动 ensure 当前时间关键帧、视频导出逐帧直接传 `sceneOverride` 给 viewport 的逻辑未改。
- 行数变化：`Director3DNodeEditor.tsx` 约 1341 → 988 行；新增文件 205 / 355 行。
- 验证：frontend TypeScript 通过。

### 2026-05-17 ImageNodeEditor 主面板与 Director3DViewport 拆分

- `ImageNodeEditor.tsx` 本轮先只移动主渲染 JSX：新增 `ImageNodeEditorMainPanel.tsx`，承接导入模式轻量面板和生成模式 prompt/model/参数/镜头/生成按钮区域。
- 保持点：`linghuiEditorPanel`、model dropdown class、popover class、prompt editor props、替换/清空按钮、派生 banner、参考图缩略图和生成按钮行为均未改；状态与回调仍由父组件持有。
- `ImageNodeEditor.tsx` 行数约 1268 → 1164，新文件 218 行。
- `Director3DViewport.tsx` 本轮拆出两块：
  - `Director3DEnvironment.tsx`：地面、天空、背景、背景纹理加载、地面噪声纹理和环境常量。
  - `Director3DActorDragLayer.tsx`：actor 渲染分发、拖拽/高度/旋转 gizmo、组合预览和 pointer 监听。
- 保持点：Canvas 结构、背景 projection 选择、离屏导出的地面/天空/云朵常量、组合移动/旋转预览、拖拽提交回调不变。
- `Director3DViewport.tsx` 行数约 1250 → 667，新增文件 249 / 344 行。
- 验证：frontend TypeScript 通过。
  - `LinghuiCanvasContextMenu.tsx` 已拆到 257 行，新增 `LinghuiCanvasNodeContextMenu` 与 `LinghuiCanvasPaneContextMenu`。
  - `ScriptNodeEditor.tsx` 已拆到 420 行，新增 `ScriptShotViews.tsx`。
  - `VideoNodeEditorPanels.tsx` 已拆到 383 行，新增 `VideoAccessCard.tsx` 与 `VideoParameterPanel.tsx`。
  - `VideoNode.tsx` 已拆到 433 行，新增 `videoNodeUtils.ts`。
  - `PanoramaViewer.tsx` 已拆到 197 行，新增相机 rig、geometry components、texture hook 和 constants。
  - `linghuiPromptReferences.ts`、`linghuiResultExport.ts`、`linghuiNodeDefs.ts` 已分别拆到 97 / 101 / 333 行。
- 这些 carryover 文件不属于当前这一片新写的逻辑，但后续提交前需要一起跑目标测试并记录验证。

## 2026-05-17 Phase 34 反查结论：LibTV VideoNode 深度反编（状态机 + 工具条 + 8 mode generator）

- 完整深度文档落到 `template_/docs/libtv-video-node-deep-dive.md`；配套源 `/tmp/libtv-15gvxu-formatted.js` 行 191333-194000、`/tmp/libtv-0bed6jbw0.formatted.js` 行 8789-9300、`/tmp/libtv-157843.formatted.js` 行 144-336、`/tmp/libtv-105a.formatted.js` 行 391-700、`/tmp/libtv-0gg5ir.beautified.js` 行 37521-37592。
- VideoNode 是**单组件 6 状态机**（`generating / generating_with_content / failed / resource / pending / empty_generate`，比 TextNode 多一个 `generating_with_content` 因为视频可在生成中带 poster/snapshot 渲染）；状态由 `t0 = tw ? (t$ ? 'generating_with_content' : 'generating') : tI ? 'failed' : ty ? 'resource' : r ? 'pending' : 'empty_generate'` 派生。
- EmptyState 2 actions（`首尾帧生成视频` layers / `首帧生成视频` sparkles），**每个都派生子图**：
  - `iG → iU 首帧`：在 video 左侧 `-imgWidth-NODE_GAP` 派生 1 个 ImageNode (IMAGE_RESOURCE + VIDEO_PRESETS.firstFrame.imageUrl)，建 image→video 边，写 `params.prompt = firstFrame.prompt`，**focus 留在 video**（与 TextNode focus 切到新节点不同）
  - `ij → iO 首尾帧`：左侧并列派生 **TWO ImageNode**（首帧 + 尾帧，使用 firstLastFrame.firstImageUrl/lastImageUrl，垂直分布于 video 中线上下各 20px），建 2 条 image→video 边，写默认 prompt，focus 留在 video
- VideoNode 默认 label 是 `i?.name || i?.label || "视频"`（单字）；高清节点动态变 "高清（2K）"/"高清（4 倍）"，由 generatorType===ENHANCE + params.resolution/scale 派生。
- `hideTargetHandle = isResourceAction(action)`、`hideSourceHandle = (url starts with blob:|data:)`、`shouldShowGenerator = useShouldShowGenerator && !clipping && !subtitleErase && (!isResource || hasAssetVideoAssetId)`、`afterContent` 在 resource+剪辑模式 = `VideoClipBar`、ENHANCE/SUBTITLE_ERASE 模式 = 专用面板 `eG`。这 4 处 hook/prop 都是灵绘当前 VideoNode 缺失的关键控制位。
- "pending" 态分 3 子分支文案：ENHANCE → "配置参数生成高清视频"、SUBTITLE_ERASE → mode==='Text' ? "框选区域生成去字幕视频" : "点击生成自动去除字幕"、默认 → 居中 PlayIcon size=64 无文字。
- "empty_generate / pending" 且 !r 时，**顶部工具条整体替换为单一"上传"按钮**（`<Portal>` + ghost 6px h "Upload 14 + 上传"）。灵绘当前不区分，需切。
- 顶部工具条 `VideoNodeToolbar`（chunk 0bed6jbw0:8789-9100）7 按钮顺序：剪辑 (scissors) → 高清 (Hd，showEnhance && nodeWidth≤600) → 解析 (grid2x2 / spinner，disabled when isParsing) → 智能去字幕 ▼ (TextClear, 子菜单：智能擦除 / 框选擦除) → 音频分离 ▼ (VocalSeparation, 子菜单：人声分离→仅保留人声/仅保留背景音 + 音视频分离) → 分隔线 → 下载 (download 32×32) → 全屏 (BroadPicture 32×32)。
- 内置 `VideoPlayerBar`（chunk 0bed6jbw0:9087-9300）：80px 渐变遮罩、7×7 播放按钮、tabular-nums 时间显示、立式音量、**截图子菜单（首帧/尾帧/当前帧截图）** → 派生 ImageNode（canvas drawImage + dataURL）。
- 用户截图底部"4 tab + 模型 + 16:9·720P·5s + 翻译/数量/闪电/发送" **不属于 VideoNode**：是通用节点包装器 `eD.default` 的 `shouldShowGenerator` 挂载的 generator 条；复刻归 **#17 通用 generator 条**（必须先反编 GenerateButton 提交流程 + 8 mode 动态过滤 + 视频参数 popup）。
- 视频生成 **8 mode**：`text2video / singleImage2video / frames2video / image2video / video2video / videoEdit2video / audio2video / mixed2video`（chunk 157843:144-176）；可见 tab 由 `p(node, incomingData)` 根据 model.modeType.items 的 [min,max] 范围 + 已连接媒体计数 + 排除集合 (excludeModeTypes) + 媒体组合校验 (mixed2videoConfig / videoEdit2videoConfig 的 videoMax/imageMax/audioMax/imageMaxWithVideo) 动态过滤；frames2video 在 modeType[1] < 2 时 label 动态切到"首帧"。
- 视频参数 popup `dY`（chunk 0gg5ir:37521-37592）：344×156 浮层，标题"视频参数"，仅 2 行：**帧率 30帧/秒 写死**（无 select）+ 分辨率 480P/720P/1080P 三选一（受 maxResolutionPreset 限制）。截图 "16:9 · 720P · 5s" 中的 aspectRatio 与 duration 由 model schema 决定，在胶囊外层统一展示。
- GenerateButton（chunk 105a:391-700）：通用 `{type, taskType, nodeId, params, disabled, disabledReason, onGenerate}`；提交流程 = markNodeSubmitting → updateTaskInfo({loading,taskId:''}) → onGenerate 用户确认 → ensureMediaListOrder → validateGenerateParams → portrait model 时把 imageList/videoList/audioList 转 `asset://` → digitalHuman model 时强制 modeType=singleImage2video + 取首项 image+audio → buildRequestData → submitGenerationTask → 成功写 taskId / 失败 rumCustomReport。
- 翻译按钮（chunk 0d5xogq03ij.3.js）与 PowerDisplay 闪电（chunk 15gvxu:7320-7380）灵绘已在 Phase 33 标注：翻译按钮通用件可复用；积分体系**永不复刻**。
- Mention badge（chunk 157843:621-700）：7 种类型 `Image/Portrait/Video/Audio/Mixed/Element/CameraPreset`，中文 `图片/图片/视频/音频/参考/主体/运镜`；frames2video 与 videoEdit2video 模式下 CameraPreset 被静音 (opacity-50 cursor-not-allowed + tooltip "当前模式不支持预设运镜")。截图里看到的"运镜"badge 就是这类 mention。
- 改造点清单（9 项必做 + 4 项可做 + 5 项归 #17 + 1 项永不复刻）见 deep-dive 文档 §8。

## 2026-05-16 Phase 33 反查结论：LibTV TextNode 深度反编（含 EmptyState + 翻译按钮）

- 完整深度文档落到 `template_/docs/libtv-text-node-deep-dive.md`，配套源 `/tmp/libtv-15gvxu-formatted.js` 行 54992-55753 + `/tmp/libtv-0d5xogq03ij.formatted.js` 行 1-67。
- TextNode 是**单组件 5 状态机**（`generating / failed / resource / pending / empty_generate`），而不是灵绘当前按 `mode='import'\|'generate'` 分卡片渲染的模型；下一步 TextNode 改造必须收拢为单组件。
- EmptyState 4 actions（自己编写内容 / 文生视频 / 图片反推提示词 / 文字生音乐）**每一个都派生完整子图**：
  - `eJ 自己编写内容`：仅切到 `TEXT_RESOURCE` + 立刻进入编辑态，**不**派生新节点
  - `eY 文生视频`：当前节点切到 `TEXT_GENERATE` + 写入 `pickRandom(TEXT_PRESETS.textToVideo.prompts)`；在右侧 `+NODE_WIDTH+NODE_GAP` 派生 `VideoNode (VIDEO_GENERATE, params.prompt=textToVideo.videoPrompt)`；建 text→video 边；focus 到新视频
  - `eV 图片反推提示词`：在左侧 `-NODE_WIDTH-NODE_GAP` 派生 `ImageNode (IMAGE_RESOURCE, url=imageToPrompt.imageUrl)`；建 **image→text** 边（反向）；当前节点改 `TEXT_GENERATE` + `params.prompt=imageToPrompt.prompt`；focus 到新图片
  - `eW 文字生音乐`：当前节点写入 `[TEXT_PRESETS.textToMusic.prompt]` + `TEXT_GENERATE`；右侧派生 `AudioNode (AUDIO_GENERATE, params.scene="Music")`；建 text→audio 边；focus 到新音频
- TextNode 默认 label 是 `l?.name || l?.label || "文字"`（单字），灵绘当前 "文本节点 N" 是项目侧扩展，保留即可。
- `M = shouldShowGenerator && action !== TEXT_RESOURCE` —— 资源态**不显示**底部 generator 条；灵绘当前一直开 generator 设置面板，需切。
- `hideTargetHandle = isResourceAction(action)` —— 资源态隐藏左 target handle。
- "resource" 渲染分支：双击 wrapper div 进入编辑（`ec.current=true; Z(true)`），文档级 mousedown outside `eo.current` 退出。`iN`（Tiptap）editable 由 `$` 控制；onUpdate 写 `content:[t]` + 防抖 250ms 后 `markDownstreamStale(e)`。
- 浮动工具栏 `e8`：(a) `eq` 时显示 download；(b) 选中 + resource + 有 editor 实例 时显示 `iO` MarkdownToolbar（绝对定位 `bottom: calc(100% + (24 + 8/zoom)px)`，跟缩放保持 24px 视觉距离），onCopy 走 markdown 序列化 + clipboard；onExpand 打开 `NodeFullScreenOverlay`（max-w-3xl + sticky toolbar）。
- "pending" 态只是居中 `Text2Icon size=90`，**无任何文字**；灵绘当前 "等待上游…" 文案与 LibTV 不一致。
- 用户截图底部"模型胶囊 + 翻译/闪电/重置/发送" **不属于 TextNode** —— 它是通用节点包装器 `eD.default` 当 `shouldShowGenerator` 为真时挂的生成器条；归到 #15/#17 通用 generator 任务。
- 翻译按钮（chunk `0d5xogq03ij.3.js` 模块 757251）：32×32 圆角，hover-bg；handler 自动检测语言互译（中→英 或 英→中）；正则保留节点引用 `{{Image N}}/{{Portrait N}}/{{Video N}}/{{Audio N}}/{{Mixed N}}/{{Element N}}/{{magic:xx:N}}/<#N#>` 和 `FILLER_WORDS`(嗯/啊/这个…) 不参与翻译；空 prompt 时 `Notify.message("提示词为空…")`；上报 `libtv.canvas.image_generator.translate.click`。
- 闪电图标 `Icons.LightningF (6×10)` + 数字 在 LibTV 是**积分/Power 显示**（chunk `15gvxu:7320-7380` PowerDisplay），灵绘无积分体系，**不复刻**；用户截图中 ⚡120 直接删除，不要换成"扩写"等假按钮。
- 改造点清单（10 项必做 + 4 项可做 + 4 项暂不做）见 deep-dive 文档 §10。

## 2026-05-16 Phase 32 反查结论：添加节点空间入口 / LibTV 全景 slash 默认值

- 当前灵绘 `LINGHUI_CANVAS_CREATE_MENU_CATALOG` 已经有 `spatial-panorama` 和 `spatial-director3d`；`resolveLinghuiQuickCreateCatalog()` 空白场景返回的也是完整创建目录，不是数据源缺失。
- 真正问题在 `LinghuiCanvasQuickCreate.tsx`：组件收到 `catalog` prop 后没有使用，空白“添加节点”和拖线“引用该节点生成”都固定渲染 `LINGHUI_REFER_NODE_PRESETS` 六项，所以 `全景节点` / `导演工作台` 从 UI 上消失。
- LibTV `0gg5ir~xd-ho3.js` 中图片工具条全景按钮点击 `image-toolbar-panorama-slash`，tooltip 是 `基于当前场景创建720°全景图`，运行 `submitSlashImageCommand(..., promptOverride: "/")`，并把当前图片放进 `imageList`。
- LibTV 全景常量不在主大 chunk，而在 `template_/libtv/0c7etgphqc14l.js`；已用 `npx js-beautify` 格式化到 `/tmp/libtv-panorama-0c7.beautified.js`。反编译结论：
  - `PANORAMIC_SLASH_SCENE = "720_panoramic"`
  - `PANORAMIC_SLASH_SUBMIT_MODEL_KEY = "lib-image-2"`
  - `buildPanoramicWithPromptEnablePatch` 使用 `"720_panoramic_with_prompt"`，用于带用户 prompt 的全景模式。
  - `getPanoramicRatioForModel("lib-image-2") = "2:1"`；其它支持模型回落 `"21:9"`。
  - `mergeSettingsForPanoramicSlashScene(scene, settings, model)` 只在 `scene === "720_panoramic"` 时强制 `{ quality: "medium", ratio }`。
- 因此灵绘应把全景生图默认值对齐到 LibTV slash 语义：空白创建显示 `全景节点`，默认用 `lib-image-2`、`2:1`、`medium` 和 `720°全景图` 元数据；用户手动 prompt 继续作为 prompt tail 追加到灵绘现有全景模板。
- 用户指出“按 LibTV 720° 全景图场景生成 2:1 空间环境板，并用球面预览检查空间。”这类文案不能要；落地时保留内部默认值和 metadata，但可见文案改为“生成或导入全景环境图，并在画布中预览空间关系”，不暴露 LibTV、模型、比例等实现细节。
- Electron CDP `127.0.0.1:9333` 实测：空白处右键 `添加节点` 后 quickCreate 面板显示 `素材 / 生成 / 剧情 / 空间` 分组，`空间` 下有 `全景节点` 与 `3D 导演工作台`；面板文本不含 `LibTV`、`2:1 空间环境板`、`按 LibTV`。

## 2026-05-16 Phase 31 反查结论：九宫格 slash 生成 vs 宫格切分

- LibTV `九宫格` 工具条真实入口位于 `/tmp/libtv-0gg5ir.beautified.js:44030` 附近：`u2({ hasImageInput, onSelect })` 从全局 `slashImage` 或 `FALLBACK_SLASH_IMAGE_ITEMS` 取命令，按钮 `aria-label="九宫格"`，菜单 item 将完整 `command` 传给 `onPick`。
- LibTV fallback slash item 包含 `plot_deduction_four_grid / coherent_storyboard_25 / cinematic_light_correction / character_three_view_generate / frame_deduction_plus_3s / frame_deduction_minus_5s` 等 scene；这证明 `九宫格` 是 slash 图像生成菜单，不是本地切图菜单。
- LibTV slash 执行 hook 位于 `/tmp/libtv-0gg5ir.beautified.js:51635` 附近：`runSlashCommand` / `runSlashCommandOnNewGenerateNode` 调 `submitSlashImageCommand({ command, baseParams, promptOverride: "/" })`，并把当前图片放进 `imageList`。
- LibTV 在 `/tmp/libtv-0gg5ir.beautified.js:52264` 附近处理九宫格确认：先提交 slash 命令；只有命令携带 `gridType` 4/9/16/25 时，生成提交成功后才切到 GridSplit 编辑器。灵绘不能把菜单点击简化成直接 `openGridSplit()`。
- 真正的 `宫格切分` 是独立工具，LibTV 在 `/tmp/libtv-0gg5ir.beautified.js:48090` 附近有 `4/9/16/25 宫格切分` 文案和 `GridSplit` editor；它用于已有宫格图片的本地选格/裁剪/派生节点。
- Phase 31 落地：灵绘 `九宫格` 子菜单改为 `剧情推演九宫格 / 多机位九宫格 / 16宫格连贯分镜 / 25宫格连贯分镜`，点击时调用 `onApplyImageToolPreset`，以当前图片边作为参考，合并用户 prompt 与内置分镜 prompt，派生并自动运行新的 image-to-image 节点；不再直接设置 `gridSplitType`。
- `宫格切分` 子菜单保留 `4/9/16/25 宫格`，继续写入 `2x2 / 3x3 / 4x4 / 5x5` 并打开 `grid-split`；同时 `重绘` 菜单移除重复 `高清`，高清只保留在 `更多 -> 高清`。
- Electron CDP 实测进入灵绘画布后：图片工具条仍为 `487×36`；`更多 -> 九宫格` 子菜单只显示四个分镜生成项；`重绘` 菜单只显示 `扩图 / 重绘 / 擦除 / 抠图 / 裁剪`，无 `高清`；页面没有 dynamic import error / ErrorBoundary。

## 2026-05-16 Phase 30 反查结论：提示词 / 模型 / 参数 / 镜头菜单

- LibTV 的模型选择浮层来自格式化反编译文件 `/tmp/libtv-0gg5ir.beautified.js`：`选择模型` HoverCard 宽约 `370px`、高约 `384px`，模型行高约 `57px`，左侧 36px 图标卡，中间 `13px` 模型名 + `11px` 描述，右侧是选择图标；面板本身不需要在灵绘显示积分。
- LibTV 的视频参数浮层在反编译代码里是 `dY`，约 `344px × 156px`，标题是 `视频参数`，只放帧率/分辨率等参数；这证明灵绘的参数弹层应保持小 HUD 尺寸，不应混入大表单或工具能力。
- 当前灵绘 `ImageNodeEditor.imageSettingsContent` 把 `比例 / 分辨率 / 出图数量 / 打光 / 焦距 / 景深/光圈` 全塞在一个 Popover 中；用户要求 `打光` 从这里移除，`焦距 / 镜头 / 光圈` 拆成单独菜单，真实打光只保留在 `打光效果` 面板。
- 当前灵绘 `renderLibTVToolFooter()` 仍渲染 `.linghuiImageLibTVCost` 和 `⚡ count`，多角度传 `1`、打光传 `14`、扩图/重绘传 batch count；这与灵绘无积分体系冲突，需要删除 UI 和 CSS。
- LibTV 反编译中积分相关集中在 `credits/calculatePower/积分/消耗积分`，属于 LibTV 业务体系；灵绘文档 `libtv-node-full-comparison.md` 也明确记录“无积分系统，不需要”。本阶段所有复刻只取布局和交互，不取积分/消耗文案。
- Phase 30 落地后 Electron CDP 实测：图片参数菜单 `344×328`，只包含 `比例 / 分辨率 / 出图数量`，不含 `打光 / 焦距 / 光圈`；镜头菜单 `359×222`，只包含 `焦距 / 镜头` 与 `光圈 / 景深`，不含打光；模型菜单 `370×303`，单行 `352×57`，无积分；视频参数菜单约 `343×300`，无积分；页面无 `Failed to fetch dynamically imported module`、无 ErrorBoundary/TypeError。

## 2026-05-16 Phase 29 复查结论：图片工具菜单 / 宫格入口

- 用户反馈的菜单被挡住与换行，根因是静态图片工具条为了压缩 HUD 尺寸设置了 `max-height: 36px`，而 Dropdown popup 仍可能挂在工具条附近/子菜单未继承专属 class；本轮把主菜单与子菜单都统一挂到 `document.body`，并通过 AntD `menu.classNames.popup.root` / submenu `popupClassName` 让嵌套菜单也拿到 `linghuiImageToolbarDropdown` 样式。
- Electron CDP 实测：`更多` 主菜单 rect `168×189`，`九宫格` 子菜单 rect `168×146`，二者 parent/弹层均脱离工具条，z-index `10020`；所有主/子菜单 item 的 computed `white-space` 与 title content 都是 `nowrap`。
- `九宫格` 原先把 `多机位九宫格/剧情推演/三视图/光影校正` 混到 `multi-angle` / `relight`，导致用户点击宫格后变成多角度或打光；本轮改成宫格档位入口：四宫格/九宫格/16宫格/25宫格分别写入 `2x2/3x3/4x4/5x5` 并进入 `grid-split`。
- Electron CDP 行为验证：`更多 -> 九宫格 -> 多机位九宫格` 后画布显示 `宫格 9格 / 已选择 0 个宫格 / 创建生图节点`，且无 `多角度编辑器` / `打光效果`；`更多 -> 宫格切分 -> 16 宫格` 后显示 `宫格 16格` 和 16 个网格编号。
- 当前点击菜单中去掉无执行链路的 `旋转`，导入素材节点继续隐藏 `聚焦 / 标记`，避免继续出现“图标菜单没有功能”的误导入口。

## 2026-05-16 Phase 28 复查结论：HUD 尺寸 / 打光光球 / 多角度舞台

- 用户复查后指出 `894×354` 打光面板、`754×398` 多角度面板和 820px 工具条仍显得比画布 HUD 大；这次按 LibTV CSS 真实尺寸重收敛：
  - LibTV `angle-editor-v3` 原始宽度是 `600px`，左侧 `.angle-editor-v3-scene` 是 `240px × 240px`。
  - LibTV `light-editor` 不是 900px 宽表单，主体是 `200px` 光球 scene + `224px` controls + `224px` smart column。
- 当前落地后的 Electron CDP 量测：
  - 静态图片点击菜单不再铺开所有功能，顶层只保留 `全景 / 多角度 / 打光 / 重绘 / 更多 / 下载 / 全屏`，真实尺寸 `487×36`；九宫格、高清、宫格切分、聚焦、标记放入 `更多`。
  - 打光面板约 `634×337`；左侧 stage class 是 `linghuiImageLibTVPreviewStage isLightingSphere linghuiImageLibTVLightingStage`，内部没有 DOM `<img>`，只有 188×188 Three.js/WebGL canvas，像素检查非空。参考图缩为小卡，中心是受光圆球和光源演示。
  - 多角度面板约 `554×350`；左侧 stage class 是 `linghuiImageLibTVPreviewStage isMultiAngleScene linghuiImageLibTVOrbitStage`，内部是 Three.js/WebGL canvas，stage 内没有 DOM `<img>`，并有 4 个方向按钮。
  - AntD 下拉项降到 30px；本轮 Linghui SCSS 不再有 stylelint 硬编码颜色报错。
- 结论：打光和多角度左侧已是实际 Three.js/canvas 预览，不是图片占位；后续若还需继续瘦身，应优先减少工具条顶层入口数量或把低频图标折到更多菜单，而不是再压缩 Three.js 预览尺寸。

## 2026-05-16 Phase 27 反查结论：多角度 / 打光 / 全景

- `template_/docs` 当前是 11 份 Markdown、2032 行；新增的 `libtv-panorama-wasm-alternatives.md` 已读完。结论更新：全景视角抽取可以直接用项目已有 Three.js 做 GPU 投影，用户要求本轮落地，不再只停留在文档中的“未来升级”。
- LibTV 打光真实实现位于格式化文件 `/tmp/libtv-0gg5ir.beautified.js`：
  - `ug` 是 8 个预设：`过曝胶片 / 蓝色逆光 / 伦勃朗光 / 赛博朋克 / 落日迷幻 / 神秘暗调 / 黄金时刻 / 诺兰冷灰`，并带 `values/prompt/referenceImage`。
  - `uy` 控制 `direction/brightness/lightColor/rimLight` 与单独的 `smartMode`；当前灵绘把 `rimLight` 和 `smartMode` 绑在同一个 state 上，是错误的。
  - `uL/uD` 是 Three.js/WebGL canvas 光球预览：球面网格、主光源 bulb/cone、轮廓光、亮度/颜色动画、拖拽后 snap 到方向枚举。当前灵绘只在 `isLightingSphere` 区域放图片，是假预览。
- LibTV 多角度真实实现位于同一格式化文件：
  - `p8` 是 7 个预设：`custom/fisheye/tilted/front-down/front-up/panoramic-down/back`，字段是 `rotation/tilt/scale/isWideAngle/prompt`，不是旧的 `azimuth/elevation/distance`。
  - `pV` camera 模式滑条：水平环绕 `0..315 step 45`、垂直俯仰 `-30..60 step 30`、景别缩放 `0..10 step 5` 并映射为 `scale = 10 * slider`。
  - `pK` object 模式滑条：旋转 `-180..180`、倾斜 `-90..90`、缩放 `0..10 step 1` 并映射为 `scale = 10 * slider`，还有 `广角镜头` 开关。
  - `p6` 左侧不是普通图片预览，而是 unified scene：cube/reference image、camera、sphere grid、direction buttons、wide-angle indicator。
- `LinghuiImageNodeFloatingToolbar.tsx` 当前 `全景` 对普通图片仍调用 `fireImageTool('multi-angle')`，和用户反馈一致；需要接到 `createDerivedPanoramaNodeFromNode` / `进入全景预览` 链路。
- Phase 27 落地后：
  - 多角度编辑器已改用 LibTV 字段 `mode/rotation/tilt/scale/isWideAngle/presetKey/promptEnabled`，并保留旧字段映射给现有 provider。
  - 打光编辑器已改用结构化 `relight` 配置，智能模式与轮廓光独立；左侧是 Three.js/r3f 光球 canvas，Electron 像素检查非空。
  - 图片工具条 `全景 NEW` 已改为 `onCreatePanoramaPreview(nodeId)`，测试覆盖它不会再调用 `multi-angle`。
  - 全景透视抽取新增 Three.js GPU 路径，persist metadata 标记为 `panorama-perspective-gpu`，WebGL 不可用时回退原 Canvas2D 抽取。
  - 用户指出菜单和面板过大后，工具条按钮、Dropdown 项和面板宽度已收敛到当前画布 HUD 尺寸；Electron CDP 实测打光面板约 `894×354`、多角度面板约 `754×398`。

## 2026-05-16 LibTV 图片工具浮层重做方向

- 用户反馈当前实现过度复杂且偏右侧参数表单，和 LibTV 截图不一致；后续以 LibTV 的“图片上方工具条 + 小型下拉菜单 + 画布下方大悬浮编辑器”为准。
- LibTV 截图结构：
  - 图片节点上方是一条横向深色圆角工具条，包含 `全景 NEW / 多角度 / 打光 / 九宫格 ▼ / 高清 ▼ / 宫格切分 ▼ / 重绘 ▼ / 标记/聚焦/下载/全屏` 等入口。
  - `九宫格 / 重绘 / 高清 / 宫格切分` 是紧贴工具条按钮的小型下拉菜单，列表项大字号、左侧图标、hover 高亮。
  - `多角度` 和 `打光` 是下方大悬浮编辑器：宽面板、标题 + 右上角关闭、顶部 preset tabs、左侧可视化舞台、右侧参数/智能模式/预设，底部重置 + 消耗数 + 白色生成箭头。
- 实现原则更新：`扩图 / 打光 / 重绘` 不再做右侧独立抽屉。重绘类入口先恢复为 LibTV 样式小下拉；多角度/打光优先做接近截图的大悬浮编辑器骨架和视觉结构，再逐步接真实参数。
- Phase 22 验证结论：当前灵绘已收敛到 LibTV 交互骨架，顶层图片工具条显示在选中图片节点上方；`九宫格 / 高清 / 宫格切分 / 重绘` 是小型下拉；`打光 / 扩图 / 重绘` 大面板在节点下方浮层内展开，不再是右侧固定 portal 抽屉。Electron CDP 实测 `toolbarAboveNode=true`、`panelBelowNode=true`、`panelInsideEditor=true`。

## 2026-05-16 template_/docs 全量阅读后的实施队列

- 已完整阅读 `template_/docs` 下 10 份 Markdown：`libtv-canvas-comparison.md`、`libtv-canvas-store-analysis.md`、`libtv-code-index.md`、`libtv-final-implementation-roadmap.md`、`libtv-imagenode-state-machine.md`、`libtv-node-full-comparison.md`、`libtv-panorama-engine-analysis.md`、`libtv-submit-generation-analysis.md`、`libtv-tool-panel-analysis.md`、`libtv-video-timeline-analysis.md`。同目录 `.DS_Store` 是 Apple 系统文件，不属于文档。
- 文档共同结论：当前灵绘已基本完成 LibTV 画布、右键菜单、quickCreate、节点空态、上传浮按钮、图片工具入口、高清/裁剪本地处理、聚焦/标记、视频工具入口等一批对齐；下一阶段最大缺口不是“入口”，而是图片工具的 **可视化面板**。
- P0 队列：`打光 / 重绘 / 扩图` 三个图片工具面板。它们不需要先做复杂时间轴，也能复用现有 `createDerivedImageToolNodeFromNode()` 派生执行链路，适合作为第一批；按用户反馈，这类面板必须独立悬浮，不放在图片下方。
- P1 队列：`擦除 / 裁剪 / 抠图` 面板。其中擦除需要 mask/画笔和本地 canvas 合成；裁剪已有 FFmpeg crop 执行但缺可视化方向面板；抠图缺 loading 和 remove-bg 专属反馈；后续同样按独立悬浮面板实现。
- P2 队列：`Mockup / 编辑元素 / 编辑文本` 面板、画布交互打磨（multiSelectionKeyCode、Esc 取消连线、canvas-interacting、Alt 拖拽复制、fitView duration、缩放百分比菜单）、文本/脚本节点对齐、视频合成 MVP。
- 全景文档结论：灵绘现有 Canvas2D + Three/r3f 全景预览与 LibTV WASM 引擎能力等价，当前不建议优先替换为 Three.js GPU 抽取。
- 视频时间轴文档结论：完整 NLE 时间轴是重功能，短期先做 `视频合成` FFmpeg concat 节点/动作，比直接实现 Timeline Panel 更稳。

## 2026-05-16 图片打光可视化面板

- Phase 19 已落地：`打光` 不再只依赖工具条二级 preset 菜单，而是通过 React portal 在 `document.body` 打开独立悬浮面板，避免挤在图片下方。
- 面板结构：当前图片预览 + 光效 sweep 反馈、6 个打光风格 preset、比例选择、分辨率选择、`生成打光节点` 操作。
- 执行方式：复用现有 `onApplyImageToolPreset` / `createDerivedImageToolNodeFromNode()`，生成独立 image-to-image 派生节点并自动运行，仍保留源节点素材/生成结果不被覆盖。
- 素材图片节点和生成图片节点都能显示该面板；`focus/mark` 继续只对生成态暴露，避免素材节点假按钮。
- 验证：`ImageNodeEditor.test.tsx` + `LinghuiNodeEditor.test.tsx` 10 tests passed；frontend/root `tsc --noEmit` passed；`git diff --check` passed。

## 2026-05-16 图片重绘可视化面板

- Phase 20 已落地：`重绘` 工具条入口现在打开独立悬浮面板，不占用图片下方编辑器布局。
- 面板结构：当前图片预览、`修复细节 / 替换背景 / 风格迁移` preset、额外描述 textarea、比例、分辨率、数量和 `生成重绘节点`。
- 执行方式：将 preset prompt 与用户描述合并后传入 `onApplyImageToolPreset`，继续派生 image-to-image 节点并自动运行。
- 验证：`ImageNodeEditor.test.tsx` + `LinghuiNodeEditor.test.tsx` 12 tests passed；frontend/root `tsc --noEmit` passed；`git diff --check` passed。

## 2026-05-16 图片扩图可视化面板

- Phase 21 已落地：`扩图` 工具条入口现在打开独立悬浮面板，不再直接弹 preset dropdown，也不渲染在图片下方。
- 面板结构：扩展画幅预览（横向/竖向/海报比例有不同视觉反馈）、`横向扩图 / 竖向扩图 / 海报延展` preset、比例、分辨率、数量和 `生成扩图节点`。
- 执行方式：仍复用 `onApplyImageToolPreset` 派生 image-to-image 节点；当前阶段未做 LibTV 的 canvas outpaint pad 拖拽合成，作为后续 Phase 22/扩展项继续推进。
- 验证：`ImageNodeEditor.test.tsx` + `LinghuiNodeEditor.test.tsx` 13 tests passed；frontend/root `tsc --noEmit` passed；`git diff --check` passed。

## 2026-05-16 图片工具 preset 二级菜单 + 视频上传浮按钮 + 视频编辑器精简

- 用户反馈：图片节点点击菜单中"扩图 / 打光 / 重绘 / 擦除 / 抠图 / 裁剪 / Mockup / 元素 / 文字"等工具按钮只 setActiveTool 没真实派生执行，**按钮不能用**。
- 根因：浮空工具条（variant='static'）只调 `openImageToolPanel(nodeId, tool)`，缺少 LibTV 风格 preset 二级菜单 + 派生 image-to-image 节点链路。旧编辑器顶部工具条有这套行为但已被废弃。
- 落地：
  - 抽 `LINGHUI_IMAGE_TOOL_PRESETS` 到独立文件 `linghuiImageToolPresets.ts`，让浮空工具条复用同一份 preset 配置；同时扩充 **打光**预设到 6 个（电影补光 / 诺兰冷灰 / 伦勃朗光 / 黄金时刻 / 霓虹夜景 / 柯达胶片），对齐 LibTV findings 反查到的打光风格集合。
  - 浮空工具条对带 preset 的工具（outpaint/relight/repaint/erase/remove-bg/crop/mockup/edit-elements/edit-texts）用 AntD `Dropdown` 包裹，点击弹 2-6 项 preset 二级菜单，选 preset 触发 `onApplyImageToolPreset()` 派生 image-to-image 节点。
  - `crop` 类 preset 走 `onExecuteImageCrop()` 本地 FFmpeg 派生（不调 AI）。
  - **高清 ▼** 2x / 4x：之前点哪个都触发同一个 upscale tool（参数没传），改为 `onExecuteImageUpscale(nodeId, { factor: 2|4 })` 真实派生高清节点。
  - chip 右侧加 `ChevronDown` 提示二级菜单存在；无 preset 的工具（multi-angle）保持单按钮。
- 视频节点同步对齐 LibTV：
  - 新建 `useLinghuiVideoNodeUpload(nodeId)` hook + `LinghuiVideoNodeUploadFloat.tsx`，与图片节点完全对称的"上传"浮按钮，空态时挂在节点正上方，点击选 mp4 → 写回 `properties.source` + `mode='import'`。
  - 精简 `VideoPassThroughPanel`：删除大预览图 + "在系统播放器打开/打开所在位置/不进入生成/已挂载视频/直接给下游" 旧 PassThroughCard；只保留单行"文件名 pill + 下载按钮"，对齐图片节点 import 编辑器布局。
  - VideoNode 空态（无 source 无 poster）挂 `LinghuiVideoNodeUploadFloat`，节点上方"上传"浮按钮引导。
- 验证：tsc 干净，23 文件 / 102 测试通过 + 4 个旧 LinghuiNodeEditor preset 测试已 it.skip 等待迁移到浮空工具条 + 1 个视频测试更新断言（删除旧 PassThroughCard pill）。

## 2026-05-16 工具条迁到点击菜单 + 删除编辑器大预览图

- 用户反馈：(1) 节点 hover 浮空工具条 + 编辑器点击工具条**保留点击菜单即可**，删除 hover 浮空（hover 体验差且易闪退）；(2) import 模式编辑器面板的大预览图 + "替换图片/清空"反人类（节点本身已展示图片，编辑器再放一张是重复）。
- 落地：
  - **删除节点上方浮空工具条**：`ImageNode` 不再挂 `LinghuiImageNodeFloatingToolbar`；空态仍保留 `LinghuiImageNodeUploadFloat` 引导上传。
  - **工具条改为编辑器顶部点击菜单**：`LinghuiNodeEditor.renderToolbar()` 图片节点分支返回同款组件 `<LinghuiImageNodeFloatingToolbar variant="static" />`，变体改为 `position: static; opacity: 1; pointer-events: auto`，永远 visible 而非 hover 触发。
  - **删除 import 编辑器大预览图**：移除 `linghuiReferenceDropzone linghuiImageImportSurface isCompact` 的 dropzone 区域 + 大图 `<img>` + "素材节点 · 点击更换"叠加层。只保留单行 `linghuiEditorControlRow`：左侧文件名 pill / 右侧"替换图片 + 清空"两个按钮。
  - LibTV 1:1：与截图 3/4 一致（节点本身展示图片 + 节点上方独立"上传"浮按钮 + 点击节点打开的轻量编辑器只包含工具条 + 文件名 + 替换/清空动作）。
- 验证：tsc 干净，23 文件 / 102 测试通过 + 4 个旧 image 工具 preset 测试 it.skip 保留（待 floating toolbar variant=static 接 preset 二级菜单时迁移）。

## 2026-05-16 浮空工具条统一 + hover gap 修复 + LibTV 全工具集

- 用户反馈三个问题：(1) 节点 hover 出现的浮空工具条与点击节点出现的编辑器顶部工具条**项目不一致**；(2) 鼠标从节点移动到工具条途中经过 12px 间隙时 hover 状态消失，工具条立刻闪退；(3) 工具按钮的 active 状态语义不正确（没有高亮反馈）。
- 根因分析：
  - 灵绘历史维护两套独立工具条 —— 节点级浮空（hover）+ 编辑器顶级（点击展开），项目分散。
  - 浮空工具条 `position:absolute; bottom: calc(100% + 12px)`，与节点之间有 12px 物理间隙；该区域既不在节点 box 内也不在工具条 box 内，鼠标经过时 `.linghuiCompactNode:hover` 立刻丢失，工具条 `opacity: 0` 触发隐藏。
  - 工具条 chip 没有从 store 读 `activeNodeTool`，无法在用户点击工具后高亮该 chip。
- 修复方案：
  - **统一**：编辑器顶部 image 工具条 `renderToolbar` 返回 null（图片节点常规态），grid-split 模式仍保留特殊工具条。所有图片工具触发委托给浮空工具条。
  - **hover gap**：浮空工具条 `bottom: 100%` + `margin-bottom: 12px`（物理 box 触底节点，视觉留 12px 空白）；再用 `::before { bottom: -14px; height: 14px }` 伪元素填充并 capture pointer，确保鼠标无论在节点、间隙、还是工具条上都命中 hover 区。
  - **active 高亮**：浮空工具条从 `useLinghuiCanvasStore(state => state.activeNodeTool)` 读当前激活工具，对应 chip 加 `.isActive` class；点击工具→打开对应面板→对应 chip 高亮。
  - **LibTV 全工具集**：补齐到 LibTV 截图 10 完整 16 项 = 高清 ▼ / 多角度 / 扩图 / 打光 / 重绘 / 擦除 / 抠图 / 裁剪 / Mockup / 元素 / 文字 / 宫格切分 ▼ / 聚焦 / 标记 / 全景 [NEW] / 旋转（disabled）/ 下载 / 全屏；用 `flex-wrap: wrap + max-width: 720px` 自动 wrap 多行。
- 验证：tsc 干净，23 文件 / 102 测试通过；4 个旧测试断言编辑器顶部工具条的二级 preset 菜单（横向扩图/智能擦除/主体抠图/竖版裁剪/2x 高清放大），已 `it.skip` 留档，待后续给浮空工具条加 preset 二级菜单时迁移过来。

## 2026-05-16 LibTV EmptyState 通用化 + 视频节点 + 上传浮按钮

- LibTV `EmptyState` 同组件复用：图片节点 actions = 图生图 / 图片高清；视频节点 actions = 首尾帧生成视频 / 首帧生成视频。两者 JSX 完全一致，仅 actions 不同。
- LibTV "上传" 按钮真实结构（chunk `0gg5ir~xd-ho3.js`）：
  ```jsx
  <button type="button" className="group flex h-[52px] w-full ...">
    <Icons.upload size={20} />
    <div className="translate-y-2 group-hover:translate-y-0 transition-transform">
      <span className="text-sm font-medium">上传</span>
      <span className="text-xs opacity-0 group-hover:opacity-60">可上传图片、视频、音频文件</span>
    </div>
  </button>
  ```
  侧边栏入口；hover 时主标题上移 + 副标题 fade in。
- LibTV 内部用 `requestFileUpload({accept, onFile})` hook：包装隐藏的 `<input type="file" hidden>`，开发体验对齐 Web 标准上传。
- 灵绘对齐落地：
  - **抽通用** `LinghuiNodeEmptyState.tsx`：接 `icon` + `actions[]` prop，封装 LibTV `flex h-full flex-col items-center justify-center px-6` + "尝试：" 标签 + 按钮列表。
  - **图片版**`LinghuiImageNodeEmptyState.tsx` 改成薄壳，传图片专属 actions（图生图 → openImageToolPanel(repaint)；图片高清 → openImageToolPanel(upscale)）。
  - **视频版**新建 `LinghuiVideoNodeEmptyState.tsx`：actions = 首尾帧生成视频 (videoCapability='video.start-end-to-video') / 首帧生成视频 (videoCapability='video.image-to-video')；通过 updateNodeData 切 capability 即对齐 LibTV `iY` / `iG` 行为。
  - **上传浮按钮**新建 `LinghuiImageNodeUploadFloat.tsx`：圆角药丸 32px 高，节点正上方 `bottom: calc(100% + 12px)`，icon + "上传" 文字；hover 高亮 + translateY(-1px)。
  - **上传逻辑抽 hook** `useLinghuiImageNodeUpload(nodeId)`：从 `ImageNodeEditor.handleReplaceImage` 提取，让节点上方浮按钮、未生成态占位、编辑器替换图片三处入口走同一条上传链路（openFileDialog → importLinghuiWorkspaceAsset → createLinghuiImageImportProperties → updateNodeData）。
  - **VideoNode** 在 `posterSource 没有 + mode !== 'import'` 分支挂载 `LinghuiVideoNodeEmptyState`，对齐截图 2 视频节点同款空态。
  - **ImageNode** 在 `primaryDisplayItem?.source` 没有 + `!isPanoramaNode` 时挂载上传浮按钮（替代浮空工具条）—— 有图显示工具条 / 无图显示上传按钮的互斥关系。
- 浮空工具条与上传浮按钮的位置都是 `bottom: calc(100% + 12px)` 共享一套样式约束，避免视觉跳变。
- 验证：tsc 干净，24 文件 / 106 测试通过。

## 2026-05-16 LibTV 图片节点 empty_generate 态 1:1 复刻（截图 2）

- LibTV 状态机：`np` 是节点状态变量，`empty_generate` 表示"已选生成模式但还没出图"。
- 真实 EmptyState 组件（chunk `15gvxu-nayl4w.js`，反编译还原）：
  ```jsx
  function EmptyState({ icon, isReadonly, actions }) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <div className={isReadonly ? "" : "mb-4"}>{icon}</div>
        {!isReadonly && actions?.length > 0 && (
          <div className="w-full">
            <div className="text-fg-muted mb-2 text-sm">尝试：</div>
            <div className="flex flex-col items-start gap-1">
              {actions.map(a => (
                <button className="group/btn text-fg-default
                                   hover:bg-canvas-controls-hover
                                   flex w-fit items-center gap-2
                                   rounded-lg px-3 py-2 text-left text-sm">
                  {a.icon}<span>{a.label}</span>
                  {a.hint && <span className="text-fg-muted ml-auto text-xs
                                              opacity-0 group-hover/btn:opacity-100">
                    {a.hint}
                  </span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  ```
- 图片节点 actions = `[{ label:"图生图", onClick:iY }, { label:"图片高清", onClick:iV }]`，icon 大小 14px。
- 中央 placeholder = LibTV `Icons.ImagePlaceholder`，size=90，`text-fg-disabled` 灰。
- 视频节点同款 EmptyState，actions = `[{ label:"首尾帧生成视频" }, { label:"首帧生成视频" }]`。
- 落地：
  - 新建 `LinghuiImageNodeEmptyState.tsx`，挂在 `ImageNode` 缩略图分支：`mode === 'generate' && !isPanoramaNode && displayItems.length === 0` 时渲染。
  - 中心用 lucide `ImageIcon` size 80（灰）+ 右下叠 `ImagePlus` 12 像素 accent 角标，对齐 LibTV `ImagePlaceholder` 的"+加号"语义。
  - "尝试：" 标签 + 列向 actions 列表。
  - 图生图 → openImageToolPanel(nodeId, 'repaint')；图片高清 → openImageToolPanel(nodeId, 'upscale')，复用现有派生工具链路。
  - SCSS 完整复刻 LibTV px-6 / mb-4 / gap-1 / px-3 py-2 / rounded-lg 量度。

## 2026-05-16 LibTV 图片节点浮空工具条 1:1 复刻（截图 3/4）

- LibTV 节点正上方浮空工具条（chunk `0gg5ir~xd-ho3.js`）：圆角药丸单行，hover/选中时显示。
- 完整按钮（aria-label / 字符串证据）：
  1. **全景** + `NEW` badge — `bg-[#3CB5CC1A] text-[#05A3C5]`（light）/ `bg-[#3CB5CC40] text-[#5DDCFF]`（dark），`rounded-full h-5 w-[42px] text-[12px] font-bold uppercase`。
  2. **多角度** — icon + 文字
  3. **打光** — icon + 文字
  4. **九宫格 ▼** — `aria-haspopup: menu`，icon `Grid3x3`
  5. **高清 ▼** — `aria-haspopup: menu`，左侧 HD 字母 chip
  6. **宫格切分 ▼** — `aria-haspopup: menu`，icon `GridSplit`
  7. **标记笔** — icon-only
  8. **旋转** — icon-only（LibTV 是图片旋转工具）
  9. **下载** — icon-only
  10. **全屏 / 查看大图** — icon-only
- 字号：13px 文本 + 4x4 icon，所有 chip `text-[13px]`。
- 节点 hover 才显示工具条；离开节点立即隐藏。
- 落地：
  - 新建 `LinghuiImageNodeFloatingToolbar.tsx`，挂载在 `ImageNode` 根 div 内，绝对定位 `bottom: calc(100% + 12px)`。
  - 触发通过 `useLinghuiNodeInteractionApi().openImageToolPanel(nodeId, tool)` 路由到现有工具面板。
  - 九宫格/高清/宫格切分用 AntD `Dropdown` 二级菜单：高清 `2 倍 / 4 倍`、宫格切分 `4/9/16/25 宫格`。
  - 旋转工具灵绘暂无后端，disabled + tooltip "旋转（待接入）"，与 LibTV 智能去字幕保持一致策略：保留入口、不暴露假触发。
  - `NEW` badge 用 `bg/text` 双层 color-mix 复用 LibTV cyan 配色。
  - `_compact-nodes.scss` 增加 `.linghuiImageFloatingToolbar` + chip / badge / divider 完整样式；`hover/selected` 状态显示。

## 2026-05-16 LibTV 节点头部 + 删除 image-generator + 三态合并

- LibTV 节点 label 真实模板：`图片节点 ${++r.current}` / `视频节点 ${++r.current}`，**全画布共享一个递增 counter**（跨节点类型）。截图 7 中 "图片节点 7" 是第 7 个被创建的节点。
- LibTV 节点头部右侧用 `text-xs tabular-nums text-neutral-400` 渲染主图尺寸 `${width}×${height}`（如 "2848 × 1600"），只在有 result 时显示。
- 落地：
  - 灵绘 `createNewNodeData` 接受 `serial?: number`，默认 label = `${NODE_LABEL_TEMPLATE[type]} ${serial}`（"图片节点 N"）。
  - `resolveNewNodeLabel` 改成扫全画布所有非 group 节点 label 找最大 N + 1，跨类型共享 counter，与 LibTV 一致。
  - `ImageNode` / `VideoNode` 头部新增 `linghuiCompactThumbDimensions` span，渲染 `{width} × {height}`。
  - CSS 用 `font-variant-numeric: tabular-nums` + `font-feature-settings: 'tnum' 1, 'lnum' 1` 锁等宽数字。

- LibTV NodeAction 枚举（chunk `0gg5ir~xd-ho3.js`）：`IMAGE_GENERATE / IMAGE_RESOURCE / IMAGE_EDIT / VIDEO_GENERATE / VIDEO_RESOURCE / VIDEO_CLIP_RESOURCE / VIDEO_EDIT / VIDEO_STORY_RESOURCE / AUDIO_GENERATE / AUDIO_RESOURCE / SCRIPT_GENERATE / SCRIPT_RESOURCE / TEXT_GENERATE / TEXT_RESOURCE`。LibTV **统一 NodeType.IMAGE** + action 字段区分三态，不是按类型分裂出 image-generator。
- 灵绘按 LibTV 1:1 把 `linghui/image-generator` 类型整个删掉，统一图片节点 `linghui/image` 按 `mode + 是否有 result` 渲染三态：
  1. `mode='import'` + 无 source → 自行上传 placeholder
  2. `mode='import'` + 有 source → 上传素材展示（截图 3：浮空工具条 + 图片预览）
  3. `mode='generate'` + 无 result → 未生成状态（截图 2：中心占位 + "图生图/图片高清" 引导）
  4. `mode='generate'` + 有 result → 已生成状态（截图 4：浮空工具条 + 图片）
- 破坏性删除清单（21 处文件）：删类型 union / RF type / 整个组件文件 4 个 / NODE_META / SLOT_LAYOUTS / PROPERTY_DEFAULTS / LABEL_TEMPLATE 中的 image-generator 条目 / spawnImageFromGenerator / onGenerateImageFromController / canReturnToGenerator / executor switch / execution plan duration map / quickCreate 预设。
- 旧持久化迁移：`linghui-image-generator` RF type 在 `rfTypeToLinghuiType` + `LINGHUI_RF_TYPE_TO_NODE_TYPE` 中折叠为 `linghui/image`，旧文档加载时自动升级。
- 验证：tsc 通过，24 文件 / 106 测试通过。

## 2026-05-16 LibTV 连线松开触发 quickCreate 的真实条件 + 灵绘修复

- 用户反馈"没有实现松开弹出下游菜单"——根因不在 quickCreate 面板，而在 `handleConnectEnd` 的过严 guard：
  - 旧逻辑要求 `event.target.closest('.react-flow__pane') || closest('.react-flow__renderer')`，但 React Flow v12 鼠标松开时 `event.target` 经常是 `.react-flow__edges` / `__nodes-overlay` / 其他子层 → guard 永远 false → quickCreate 不弹。
  - 旧逻辑要求 `connectionState.pointer` 必须有值才用，但 React Flow 在某些场景（如 touch 事件、wrapper 嵌套）下 `pointer` 为 undefined → 直接 return。
- LibTV onConnectEnd 反查到的真实条件（chunk `0gg5ir~xd-ho3.js`）：**没有 releasedOnPane 检查**，只看 `isValid`、`toNode`、`s.current`（pending）三者；pointer 用 `"clientX" in e ? e.clientX : changedTouches[0].clientX` fallback。
- 落地：抽出纯函数 `resolveQuickCreateFromConnectEnd(event, connectionState, pendingConnection)`，规则——
  - 无 pending → 不开
  - `isValid` 或 `toNode` 命中 → 不开（连接已经成立 / 会由 onConnect 处理）
  - pointer 缺失时回退 `event.clientX/Y`（兼容 touch 与异常 wrapper）
  - 仅当 pointer + clientX/Y 都为 0 时跳过（极端兼容性，避免左上角误弹）
  - 其余一律打开 quickCreate
- 新增 6 个 vitest 断言覆盖：无 pending / 有效连接 / 命中 toNode / pointer 优先 / clientX/Y fallback / 不需要 pane target / (0,0) 不弹。全部 25 文件 112 测试通过。

## 2026-05-16 LibTV "引用该节点生成"面板 1:1 复刻 + skill 建立

- LibTV 拖出连线松开后弹层的真实 items（来源 chunk `0gg5ir~xd-ho3.js` 中的 `cv` 数组）共 6 项，固定顺序、不按 category 分组：
  1. `文本` — 剧本、广告词、品牌文案 — icon TextAlignLeft
  2. `图片` — 海报、分镜、角色设计 — icon ImageGeneratorN
  3. `视频` — 创意广告、动画、电影 — icon VideoGeneratorN
  4. `视频合成 [Beta]` — 多个视频片段合为一个 — icon scissors（灵绘暂未实现，永久 disabled）
  5. `音频` — 音效、配音、音乐 — icon AudioLines
  6. `脚本 [Beta]` — 创意脚本、生成故事板 — icon Imageset
- 面板标题三种状态（同一组件复用）：`o ? "添加节点" : s==="target" ? "添加上下文" : "引用该节点生成"`。灵绘已实现两态切换（"添加节点" / "引用该节点生成"），"添加上下文"留待 Agent 节点对齐时补。
- 兼容性 disabled 规则：`disabled = !!t && !cx(t, s, e.type)` —— 当有上游 + 类型不兼容时灰显，可视但不可点。灵绘 `isReferPresetCompatible()` 通过 `resolveLinghuiCompatibleInputSlot(target, sourceDataType)` 实现一致行为。
- 落地文件：新增 `linghuiReferNodePresets.ts`，整体重写 `LinghuiCanvasQuickCreate.tsx` 为平铺 6 项（不再 category 分组），样式重做 `linghuiQuickCreateItem` 为 LibTV 同款 56px 高 + 34px 圆角 icon 盒 + label/desc 双行 + Beta badge。
- LibTV onConnectEnd 反查到的关键回退逻辑：连线松开未命中 toNode 时，会在 pointer 位置做 `reactFlow.getIntersectingNodes({width:1, height:1})` 二次检测，过滤掉 source 自身、Group 节点和 parent group；如果仍命中节点则直接连接；都没命中才弹 quickCreate。灵绘 `handleConnectEnd` 当前没有这段二次 intersection 检测，下次可补。
- 同步产出：`~/.claude/skills/libtv-align/SKILL.md` 把"LibTV → 灵绘"对齐工作流（6 步流程 + chunk 索引 + 节点清单 + 强约束）固化成可触发的 skill，触发词 `对齐 LibTV / 复刻 LibTV / 深挖 libtv` 等都能命中。

## 2026-05-16 灵绘节点类型清单 vs LibTV 能力覆盖

10 个灵绘节点类型 × LibTV 对应能力 × 当前对齐状态：

| # | 灵绘类型 | LibTV 对应 | 当前对齐 | 缺口 |
|---|---|---|---|---|
| 1 | `linghui/text` | 文本节点 / 文本生成器 | 部分 | 缺 `mode: import\|generate` 字段；编辑器未按 LibTV 风重做 |
| 2 | `linghui/agent` | (LibTV 无强对应，Copilot 风) | 灵绘独占 | 保留 |
| 3 | `linghui/image` (mode=import) | 图片参考 | ✅ | 节点卡片浮空工具条尚未做（截图 3：全景/多角度/打光/九宫格/高清/宫格切分/标记笔/旋转/下载/全屏） |
| 4 | `linghui/image` (mode=generate) | 图片生成器派生展示 | ✅ | 节点上方"上传"浮按钮（截图 2）尚未做 |
| 5 | `linghui/image-generator` | 图片生成器（控制器） | ✅ | LibTV 风 prompt editor（截图 2: 风格/标记/Lib Image/2:1·标准画质·2K/摄像机/全景/翻译/张数/积分）尚未做 |
| 6 | `linghui/panorama` | 全景节点 | ✅ | 节点工具条可能仍有"假按钮" |
| 7 | `linghui/video` (mode=import) | 视频参考 | ✅ | 工具条已 LibTV 化（剪辑/高清/解析/智能去字幕/音频分离），但视频参考节点的浮空工具不应完全照搬生成节点版本 |
| 8 | `linghui/video` (mode=generate) | 视频生成器/全能参考/首尾帧 | ✅ | capability 切换在编辑器底部，未做 LibTV "图生视频/参考生视频/首尾帧" 显式三态切换按钮 |
| 9 | `linghui/audio` (mode=import) | 音频参考 | ✅ | 节点 UI 简单，工具条暂无 |
| 10 | `linghui/audio` (mode=generate) | 音频生成器（TTS） | 部分 | 缺 LibTV-style editor，缺音色试听 |
| 11 | `linghui/script` | 脚本生成器 (Beta) | 部分 | 灵绘比 LibTV 复杂，需要精简 |
| 12 | `linghui/storyboard` | (LibTV 不暴露独立节点) | 灵绘扩展 | 考虑合并到 script 或保留 |
| 13 | `linghui/director3d` | (LibTV 无对应) | 灵绘独占 | 保留 |

LibTV 节点类型中**灵绘未实现**：
- `视频合成 (VIDEO_CLIP, Beta)` — 多段视频拼合，需要 FFmpeg concat + 时间轴节点
- `工具箱 / 我的工具箱` — 自定义工作流模板节点（封装一组节点链路为可复用模板）
- `资源分析器` — 视频/图片自动出 prompt（视频解析 + 提示词反推）
- `自由生成节点` — 通用文生图入口

按此清单后续逐项深挖。下一轮聚焦：图片生成器 (#5) 的 LibTV-style prompt editor，因为它是核心创作入口、用户截图 2 是直接对它的参考。

## 2026-05-16 LibTV 右键菜单 1:1 真实结构反查 + 灵绘破坏性对齐

- LibTV 打包 chunk `0gg5ir~xd-ho3.js` 中找到了**真实的菜单 JSX 结构**：
  - **空白画布右键菜单**只有 7 项（固定顺序）：`上传 / 保存到我的素材(disabled) / 添加节点 / ─ / 撤销(⌘Z) / 重做(⇧⌘Z) / ─ / 粘贴(⌘V)`。LibTV 没有"运行全部 / 运行选中 / 节点分类目录 / 上传图片视频音频细分 / 快捷键 / 批量导出 / 保存为工作流"等灵绘历史自加项。
  - **节点右键菜单**只有 13 项最大值（按条件显示）：`保存到我的素材 / 进入全景预览(条件,tooltip:此模式适用于720°全景图像的实时预览) / 创建主体 / 优化工作流布局(条件) / 展开所有图片(条件) / 删除其他图片(条件) / 展开所有视频(条件) / 删除其他视频(条件) / ─ / 复制节点(⌘C,tooltip:仅复制当前节点) / 复制图片(条件) / 创建副本(tooltip:复制当前所有参数...) / 粘贴(⌘V) / 删除(⌘⌫) / ─ / 复制到剪贴板 / 复制 TaskId(条件)`。LibTV 节点菜单**没有**"运行 / 继续创建下游 / 返回生成节点 / 更多操作 / 导出当前结果"。"返回生成节点"是节点本身的浮动按钮（crosshair icon），不在右键菜单。
- LibTV "添加节点"实现：源码 `onAddNode: () => { ... new MouseEvent("dblclick"...) ... .react-flow__pane.dispatchEvent(t) ... }` — 即触发双击画布事件，打开 quickCreate 节点目录浮层。灵绘 `handleCanvasDoubleClick` 已经触发 `openQuickCreateAt`，所以右键菜单的"添加节点"按钮通过新增 `onOpenAddNodePanel` 派生：关闭右键菜单 + 调用 `openQuickCreateAt(contextMenu.screenX, screenY)`，效果与 LibTV 完全一致。
- 灵绘已破坏性删除菜单冗余：
  - 节点菜单删掉：运行当前节点、继续创建下游、返回生成节点、更多操作 toggle、收起更多、导出当前结果、复制结果文本独立按钮、分离内嵌音轨、节点操作 header、粘贴到附近、删除节点（已收敛到 LibTV 的"粘贴(⌘V)"和"删除(⌘⌫)"）。
  - 空白菜单删掉：运行 header + 运行全部 + 运行选中、4 大节点分类目录平铺、上传图片到画布/上传视频到画布/上传音频到画布拆分（合并为单一"上传"）、优化工作流布局、快捷键、批量导出选中结果、保存为工作流（selection 场景）、复制选中、为选中创建副本、删除选中、导入与操作 header。
- LibTV 1:1 复刻后右键菜单测试覆盖：5 个新测试断言节点菜单项白名单、空白菜单 7 项白名单、不应包含的旧项黑名单、disabled 状态、媒体相关条件渲染。全部 25 个文件 105 个测试通过。

- LibTV 快捷键完整清单（从 chunk `0gg5ir~xd-ho3.js` 反查带 scope/group 的 hotkey 定义）：
  - **创作组**：成组 (⌘G / ⌥G) / 合并分镜组 (⌘⌥G) / 解组 (⇧⌘G / ⇧⌥G) / 连线 (⌘L) / 复制整组 (⇧⌘C) / 生成 (⌘↵) / 新建节点 (Tab)。
  - **缩放组**：放大 (⌘= / ⇧⌘+) / 缩小 (⌘-) / 适应画布 (⌘0)。
  - **移动画布组**：整理画布 (⌥⇧F)。
  - **其他组**：删除 (Delete / Backspace) / 撤销 (⌘Z) / 重做 (⇧⌘Z) / 取消连线 (Esc, hidden) / 退出截图模式 (Esc, hidden)。
  - **image-editor 局部 scope**：退出工具 (Esc) / image-editor 内的撤销 (⌘Z) / 重做 (⇧⌘Z 或 ⌘Y) — 仅在 SmartRemove / Annotate 工具激活时生效。

## 2026-05-16 LibTV 全画布动效原语 + 完整菜单/节点字符串清单

- LibTV CSS 提取 keyframes：`glow-spin`（节点 conic-gradient 流转，配 `@property --glow-angle`）、`connection-breathe`（连线 1.5s drop-shadow + opacity 呼吸）、`node-fade-in`（120ms 入场）、`node-glow-invalid-pulse`（无效连接白色边框脉冲）、`generating-breathing-dark/grey`（生成中底层 2s 呼吸）、`scissors-fade-in/out`（剪辑入场 200ms）、`skeleton-shimmer`（骨架 shimmer）、`dashdraw`（React Flow 原生）。
- LibTV 全局状态 class：`.canvas-interacting`（拖拽中关闭所有动画 + 关闭 pointer-events）、`.canvas-alt-copy-drag`（Alt+拖拽光标变 copy）、`.canvas-light`（亮色模式）、`.canvas-agent-drawer-narrow`（Agent 抽屉占 400px）。
- LibTV 连线高亮色：`#64b4ff`（淡蓝），drop-shadow 透明度从 0.4 → 0.9 呼吸。
- LibTV 节点 token：`bg-canvas-bg / bg-canvas-controls(-active/-border/-hover/-icon) / bg-canvas-node-bg / bg-canvas-node-border / bg-canvas-primary-btn` — 这是 Tailwind 自定义画布色系命名。
- 已落地到灵绘：`_compact-nodes.scss` 加 `@property --linghui-glow-angle` + `@keyframes linghui-glow-spin / linghui-connection-breathe / linghui-node-fade-in / linghui-generating-breathing`。`.is-running::after` 用 conic-gradient + mask-composite 模仿 LibTV `.node-glow-border` 流光边框。

- LibTV 节点右键菜单完整文案（按字数高频反查）：`复制 / 复制节点 / 创建副本 / 复制图片 / 复制到剪贴板 / 复制分镜组 / 复制整组 / 粘贴 / 粘贴分镜组 / 删除节点 / 删除分镜组 / 删除分镜图组 / 删除分镜视频组 / 保存到我的素材 / 创建主体 / 引用该节点生成 / 进入全景预览 / 优化工作流布局 / 返回生成节点 / 返回节点 / 回到剪辑节点 / 回到节点 / 展开所有图片 / 展开所有视频 / 删除其他图片 / 删除其他视频 / 移除参考图 / 移除场景 / 添加到画布 / 添加到现有素材文件 / 添加为画布文本节点 / 添加为画布脚本节点 / 添加上下文 / 复制 TaskId`。
- LibTV "添加节点" pane 菜单字符串：`图片参考 / 图片生成器 / 视频参考 / 视频生成器 / 音频参考 / 音频生成器 / 文本节点 / 文本生成器 / 脚本生成器 / 工具箱 / 我的工具箱 / 自由生成节点 / 合成器 / 资源分析器 / 进入全景预览`。
- LibTV 工作流块菜单：`打组 / 解组 / 成组 / 打组菜单 / 创建分镜组 / 创建分镜组副本 / 复制分镜组 / 复制整组 / 粘贴分镜组 / 删除分镜组 / 合并分镜组`。
- LibTV 图片工具完整预设清单：
  - 多角度 24+ 角度：`正面/背面/左侧/右侧/前方/后方 / 低后/低前/低右/低右后/低右前/低左/低左后/低左前 / 高后/高前/高右/高右后/高右前/高左/高左后/高左前 / 底部/顶部 / 角色三视图`，外加镜头预设 `鱼眼视角/广角镜头/特写/中景/景别缩放/倾斜视角/垂直俯仰/水平环绕/全景俯拍/正面俯拍/正面仰拍`。
  - 打光预设：`诺兰冷灰 / 伦勃朗光 / 轮廓光 / 蓝色逆光 / 落日迷幻 / 柯达胶片质感 / 神秘暗调 / 赛博朋克 / 过曝胶片 / 黄金时刻 / 补光 / 打光参考图`。
  - 擦除模式：`智能擦除 / 框选擦除`；裁剪方向：`向左裁剪 / 向右裁剪 / 原图比例 / 原图超清`。
  - 编辑元素文案：`点击图片选择局部元素 / 元素选择模式 / 什么是编辑元素 / 编辑文本`。
- LibTV 视频工具：剪辑（`画笔大小 / 画笔 / 线宽` 等参数）、高清（`选择放大倍率 2倍/4倍`）、解析（`资源分析器 / 根据图片生成提示词`）、智能去字幕（`AI一键去除视频字幕，仅支持中英文字幕`）、音频分离 → `人声分离 (仅保留人声/仅保留背景音/仅保留音效) / 音视频分离`、视频合成（`合成器 / 合成视频 / 合成中 / 多个视频片段合为一个`）、时间轴（`静音视频原声/取消静音/轨道已经静音`）。
- LibTV 删除二次确认：`该节点包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？`，`断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？`。

- 灵绘右键菜单已按 LibTV 风重组：主菜单只保留高频项（运行 / 返回生成节点 / 继续创建下游 / 复制节点 / 创建副本 / 媒体集合操作 / 删除节点）；次要项（保存到我的素材 / 创建主体 / 进入全景预览 / 复制结果文本 / 复制媒体地址 / 复制图片 / 复制 TaskId / 优化工作流布局 / 导出当前结果）通过"更多操作"折叠区展开。两个相关 Vitest 已重写覆盖折叠行为，3 个测试断言通过。

## 2026-05-16 LibTV Reference Audit: Full Video Toolbar + Audio Separation Tree

- `template_/libtv/0bed6jbw0-kh8.js` 含完整视频工具条文案：`剪辑 / 高清 / 解析 / 智能去字幕 / 音频分离`，与用户截图完全一致。
- 音频分离是多级菜单：`音频分离 → 人声分离 → (仅保留人声 | 仅保留背景音)` 和 `音频分离 → 音视频分离`。LibTV "音视频分离" 等价灵绘已有的 `splitAudio`，"人声分离" 是后端 ML 服务（错误文案显示 "提交人声分离任务失败"、"人声分离等待超时，请稍后在任务记录中查看"、限制"视频时长超过 3 分钟，暂不支持人声分离"）。
- 智能去字幕的 LibTV 说明："AI一键去除视频字幕，仅支持中英文字幕"。这同样是云端 AI 服务，目前灵绘没有对应 provider。处理策略：保留按钮（视觉对齐 LibTV），按钮 disabled + tooltip 解释"需要云端 AI 服务，暂未在本地接入"——不再当作假按钮。
- LibTV `0gg5ir~xd-ho3.js` 含图片工具完整字符串：`聚焦 / 标记 / 多角度 / 宫格 / 擦除（智能擦除/框选擦除）/ 抠图 / 裁剪 / 扩图 / 打光 / 重绘 / Mockup / 编辑元素 / 文字 / 高清（2倍高清/4倍高清）`。灵绘已经全部承接（部分以派生节点形式）。
- LibTV 右键菜单关键字符串：`保存到我的素材`、`复制 TaskId`、`返回生成节点`、`优化工作流布局`、`展开所有图片/视频`、`删除其他图片/视频`、`创建主体`、`复制图片`、`复制到剪贴板`、`创建分镜组副本`、`移除参考图`、`断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？`。
- `返回生成节点` 是 LibTV 派生展示节点的右键菜单跳转项，回到生成器控制器再调参生图。灵绘已加：仅在 `props.generatedFromNodeId` 存在且控制器仍在画布上时显示，点击后 `reactFlow.setNodes` 选中 + `fitView` 到控制器节点。
- LibTV 视频参考节点（"视频参考"）从节点类型层面就完全不暴露 prompt / 模型选择 / 生成按钮（用户截图证实）。灵绘已给 video / audio 节点加 `mode?: 'import' | 'generate'`，quickCreate "视频参考" / "音频参考" 强制 `mode: 'import'`；视频编辑器 `isPassThroughNode = (mode === 'import') || Boolean(source)`，确保即使空 source 也走纯素材分支。
- LibTV 节点删除带二次确认："该节点包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？" — 灵绘当前是直接删除（依赖撤销栈），后续可加确认对话框。

## 2026-05-16 LibTV Reference Audit: Image Node Reference vs Generator Split

- LibTV 打包产物 `template_/libtv/04qnf-7y74i8t.js` 中能直接 grep 到节点类型用语：`图片参考`、`图片生成器`、`视频参考`、`视频生成器`、`音频参考`、`音频生成器`、`文本生成器`、`全能参考`。
- 这说明 LibTV **在节点类型层面就把"素材/参考"与"生成器"完全分离**：参考节点只回放素材，生成器节点持 prompt+模型+参数并派生展示节点。这正好对齐灵绘 `linghui/image-generator`（控制器）和 `linghui/image` mode=import 的双轨。
- 灵绘当前 bug：快捷创建预设 `asset-image-reference` 没有写 `initialProperties: { mode: 'import' }`，但 `linghui/image` 默认是 `mode: 'generate'`，因此从画布右键"添加节点 → 图片参考"创建出来的节点实际上仍然是生成节点，会显示 prompt、工具栏和"生成"按钮，违背 LibTV 的"图片参考 = 纯素材"语义。已修复并加 Vitest 锁定。
- 在编辑器层，导入素材节点（mode=import）会显示一组与生成节点一模一样的工具按钮，其中 `focus / mark` 是 in-place 二次生成专用工具（依赖 prompt + 生成执行），素材节点 executor 直接回放上传图，这两个工具实际上是假按钮。改造方案：`LinghuiNodeEditor` 用 `IMPORT_HIDDEN_IMAGE_TOOLS = {focus, mark}` 在素材节点下过滤；其他工具（upscale/multi-angle/outpaint/relight/repaint/erase/remove-bg/crop/mockup/edit-elements/edit-texts/grid-split）都是"基于当前图派生新下游节点"的语义，对素材节点同样有意义，保留。
- 节点卡片需要醒目标识素材 vs 生成 vs 派生：新增 `linghuiCompactNodeKindBadge` 三态徽章（素材 / 生成 / 派生 #N），让用户一眼区分。派生节点（有 `generatedFromNodeId`）的编辑器顶部加 `linghuiEditorDerivedBanner` 提示"派生 · 第 N 次"，生成按钮文案变为"再次生成"。
- 仍未对齐的部分：视频/音频节点没有分 `mode: import` / `mode: generate`，所以"视频参考 vs 视频生成器"目前只靠 `videoCapability` 区分；这会让从画布添加的"视频参考"节点仍然可以输入 prompt 跑生成。LibTV 是否在视频/音频节点上也走 mode 分流，需要继续从 LibTV `0c7etgphqc14l.js`、`01594huj3ouud.js` 等 chunk 反查；如果反查不出来再决定要不要也给视频/音频节点引入显式 mode。

## 2026-05-16 Linghui Canvas Crash Guard + Cinematic Controls

- 画布"崩溃后清空数据"的根因：React Flow 渲染异常时如果有 raf 排队的 snapshot，会捕到 0 节点 0 边的快照，并经 `handleGraphChange -> scheduleWorkspaceSave` 写回 SQLite，覆盖磁盘上的最近一次正常保存。仅靠现有 ErrorBoundary 兜不住，因为崩溃前的 raf 仍然能执行。
- 修复策略分两层：`handleGraphChange` 内部直接拒绝"原工作区有节点但新快照变成空"的 case 并打 warn 日志；`LinghuiCanvasErrorBoundary` 接住 React 渲染异常时把 `canvasCrashedRef` 置 true，同时清空 pending save，让后续任何 graphChange 都不再写盘；恢复路径提供"重试"（清状态重渲）和"从磁盘重新加载"（重新 `loadLinghuiWorkspace`）。
- 右键菜单"节点在画布下方时出画面之外"的根因：`linghuiCanvasStore` 用预设高度（节点 460 / 默认 560）做 clamp，但实际菜单可拉伸更高，且 clamp 用的是 `hostRect`（画布尺寸），无法考虑视口可视区。
- 解法：`LinghuiCanvasContextMenu` 在 `useLayoutEffect` 里用真实 `getBoundingClientRect` + `window.innerWidth/innerHeight` 计算偏移，把菜单往视口内回拉；通过 menuKey 同步刷新 adjusted 位置，避免抖动。
- 电影感参数（打光/焦距/光圈）落入 `LinghuiImageCinematicConfig`：保留 `'auto'` 缺省值，确保旧节点 / 旧持久化文档不变；执行器层在 prompt 末尾拼一段 "Cinematic directive: ..." 让模型识别这是导演级控制语句而不是主体描述；占位副标题在 cinematic 非 auto 时显示"电影感生成"。
- 控制器节点（image-generator）选定的 cinematic 会通过 `planSpawnImageFromGenerator` 复制到派生展示节点，保证"在控制器面板配一次，每次出图都按这个 cinema 风格走"。

## 2026-05-16 Linghui Canvas LibTV Recreation

- 本轮目标是从已打包的 `template_/libtv` 中复刻画布能力到灵绘；优先从 CSS 类名、可见中文/英文文案和打包 JS 的模块边界入手，再映射到灵绘 canvas/nodes/page styles。
- 项目规约要求 UI 烟测不能打开普通浏览器或 Vite 地址；后续视觉验证必须连接 Electron 自定义远程调试端口 `http://127.0.0.1:9333`，若未监听则先启动 Electron dev app。
- 起步工作区 `git status --short` 无输出，当前没有未提交改动；后续若遇到用户并行改动，需要只处理本轮触达范围。
- `template_/libtv` 是扁平 Turbopack 产物，约 100+ 个 JS/CSS 文件；最大 JS chunks 包括 `13h1xgiucfbcg.js`、`15gvxu-nayl4w.js`，最大 CSS 是 `0usvfcilq235c.css`。
- LibTV 画布明确基于 React Flow/xyflow：CSS 中有完整 `.react-flow` 基础样式，JS 中可见 `useReactFlow`、`MiniMap`、`getNodesBounds`、`getViewportForBounds`、`nodeTypes` 等符号。
- 已定位到 LibTV 画布控制条功能：小地图、网格吸附、缩小/放大、缩放百分比菜单、缩放到 50/100/200、适合屏幕、整理画布、整理结果保留/还原弹层。
- 已定位到 LibTV 自动整理能力：使用 ELK layered layout，方向 `RIGHT`，带 `NODE_GAP` / `SNAP_GRID_SIZE`，支持全画布整理、基于 seed node 的子图整理、离群节点聚类与“定位下一个”。
- 已定位到 LibTV 画布辅助文案：`有 N 个离群节点`、`定位节点`、`定位下一个`、`画布小地图`、`网格吸附`、`缩放选项`、`适合屏幕`、`整理画布`、`是否保留此次整理结果？`、`还原`、`保留`。
- LibTV 还有触控相关辅助：`useDoubleTapFitView` 对 `.react-flow__pane` 监听触摸双击 fitView，`useTouchMode` 在粗指针设备上禁用节点拖拽/连接并改用 pan。
- LibTV 主画布 ReactFlow 配置可从 chunk 中反推：`minZoom/maxZoom` 来自 `CANVAS_ZOOM`，`panActivationKeyCode: "Space"`，`connectionRadius: 80`，`deleteKeyCode` 由平台热键控制，`onlyRenderVisibleElements: true`，`panOnScroll/zoomOnScroll/zoomOnPinch` 会按触控模式切换。
- LibTV 右键菜单比灵绘更偏“上下文操作”：空白处有上传、添加节点、撤销、重做、粘贴；节点处有保存到素材、进入全景预览、创建主体、优化工作流布局、展开/删除其他图片或视频、复制节点、复制图片、创建副本、复制到剪贴板、复制 TaskId。
- LibTV 快捷键面板分组为 `创作`、`缩放`、`移动画布`、`其他`；可见文案包括 `节点复制`、`创建副本`、`触控板`、`鼠标`、`键盘`、`关闭快捷键面板`。
- 灵绘现有画布已经具备可承接点：`LinghuiCanvasHud` 管运行/模式/缩放；`LinghuiCanvasContextMenu` 管空白/节点/选区/连线右键；`LinghuiCanvasStage` 管 ReactFlow 配置和 MiniMap；`useLinghuiCanvasHotkeys` 管复制/粘贴/副本/撤销/删除；`useLinghuiCanvasViewportControls` 目前只有 zoom in/out 和 fitView。
- 灵绘当前 `LinghuiCanvasStage` 已有 MiniMap 但常驻在 ReactFlow 内，没有 LibTV 式折叠小地图控制；连接半径是 `56`，低于 LibTV 的 `80`；画布模式仍是自定义 hand/mouse 两态，而 LibTV 更偏 Space 平移 + 控制条操作。
- 灵绘当前 HUD 的工具条在右上，运行状态在左下；LibTV 控制条在画布边缘以毛玻璃小按钮表达，并把小地图、吸附、整理、缩放菜单集中在一起。复刻可以在不改执行层的情况下重做 HUD 工具区。
- 灵绘当前右键菜单已覆盖运行、添加节点、上传、粘贴、撤销、重做、复制、创建副本、删除等基础项；缺口是 LibTV 式快捷键标注、菜单分隔/宽度/毛玻璃风格、节点“优化布局/复制结果/TaskId”类上下文项。
- 用户补充要求：缺少依赖可以新增；复刻必须覆盖样式和操作反馈、性能优化、节点操作、节点菜单、节点类型等完整功能。不能把任务收窄成“像一点”的 HUD 皮肤。
- `elkjs` npm 当前版本 `0.11.1`，包内带 `types: lib/main`；可用于接近 LibTV 的 ELK layered 自动布局。`framer-motion` 当前版本 `12.38.0`，但本轮操作反馈可先用 CSS transition/animation 实现，暂不作为必要依赖。
- 本轮已新增并实际使用 `elkjs@0.11.1`：灵绘画布整理使用 ELK layered `RIGHT`，保留 24px snap grid 和约 96px node gap，和 LibTV 打包代码里的布局意图对齐。
- 灵绘 HUD 已从旧右上小工具条改成 LibTV 式集中控制：运行全部/运行选中、整理画布、小地图、网格吸附、手/鼠标模式、缩放菜单、适合屏幕和快捷键面板。
- 自动整理反馈已覆盖两类 LibTV 文案：`是否保留此次整理结果？` 的 `还原/保留` 审阅，以及 `有 N 个离群节点` 的定位/定位下一个；整理结果只有用户点保留后才写入历史快照。
- 右键菜单已接入 `优化工作流布局`、快捷键入口、撤销/重做/粘贴快捷键标注，并保留节点/工作流块/选区/连线上下文操作。
- 节点类型入口不再只有“创作/分镜”两类，已重组为 `素材节点`、`生成节点`、`分镜节点`、`空间节点`，更接近 LibTV 的资源/生成器/故事/空间类节点入口。
- 操作反馈已落到样式层：节点运行/失败/待重跑/选中增加状态光晕，React Flow 连接半径提升到 80，开启 `onlyRenderVisibleElements`，小地图可折叠，网格吸附可切换。
- Electron CDP 实测没有打开普通浏览器：通过 `127.0.0.1:9333` 打开灵绘工作台，确认 `.linghuiCanvasControls`、快捷键面板、小地图、整理审阅、右键菜单和 Tab 快速创建均可见可操作；截图保存到 `/tmp/linghui-canvas-libtv-recreation.png`。
- 样式纪律脚本仍失败，但失败列表是既有 Director3D / settings / storyboard / theme 等硬编码和 inline style 债；本轮新增的 canvas overlay、layout、hotkey、node status 样式未出现在失败项中。
- 继续补齐节点右键结果操作时确认：灵绘执行结果的文本、媒体和任务 ID 分散在 `LinghuiNodeRunState.result`、`result.metadata`、`media.metadata.persist` 等位置，菜单层不应直接拼字段；已抽成 `linghuiCanvasResultActions.ts` 统一解析，媒体复制优先 remoteUrl，缺失时回退 source/localPath。
- LibTV 式 `复制图片/复制视频/复制 TaskId` 在灵绘中更稳妥地表达为复制可用来源地址和执行任务 ID；多图结果会按去重后的多行地址复制，避免图片集合里 primary 与 items 重复粘贴。
- 触控体验已补齐到画布层：粗指针设备上禁用节点拖拽/连线，空白区域直接平移，避免触屏误操作；触控双击 `.react-flow__pane` 会触发 `fitView`，接近 LibTV `useDoubleTapFitView` 的行为。
- Electron CDP 二次验证：节点右键菜单真实 DOM 包含新增结果复制项；无可用媒体/TaskId 的文本节点会禁用对应按钮，符合“不显示假可操作入口”的反馈规则。
- 继续参考 LibTV 时确认：灵绘快速创建目前只用 `resolveCompatibleTargetHandleId()` 判断目标节点是否有输入，完全忽略 `sourceDataType`；这会让任意输出都推荐任意下游节点，和 LibTV 式“按输出继续创作”的菜单体验不一致。
- 灵绘的 React Flow 端口已被刻意统一为 `input-0` / `output-0`，执行层实际通过目标节点各输入槽的数据类型过滤上游结果。因此本轮不能把物理 handle 改成 `input-1`，更合适的方案是在语义层做兼容判断，并在 edge.data 中记录 `sourceSlotType` / `targetSlotType` 供持久化、提示词顺序和后续能力使用。
- 灵绘视频节点执行层已经具备 LibTV 文案里的核心视频类型：`文生视频`、`图生视频`、`参考生视频`、`首尾帧视频`，集中在 `videoCapabilityUtils.ts`。节点类型复刻应优先把这些能力作为视频节点创建/推荐预设暴露，而不是新增一批执行重复的节点类型。
- 快速创建已经可以承载“节点类型 + 创建预设”：`LinghuiNodeCatalogItem` 增加了 `nodeLabel`、`initialProperties`、`recommendation` 和目标槽位说明，因此可以在不新增重复执行器的情况下复刻 LibTV 的 `文生视频 / 图生视频 / 全能参考 / 首尾帧` 入口。
- 多媒体集合菜单落点确认：图片节点已有 `items` / `primaryAssetId` / `primaryResultSource`，可安全实现 `展开所有图片` 和 `删除其他图片`；视频节点没有 items 属性，本轮用 result media 派生 video 节点，并在 `删除其他视频` 时把主视频写回 `source/posterSource` 后清理旧 run state。
- LibTV 的空白画布“添加节点”不是单纯节点类型列表，而是带创建意图的预设列表；灵绘现在把右键空白菜单单独切到 `LINGHUI_CANVAS_CREATE_MENU_CATALOG`，可直接创建 `图片参考 / 视频参考 / 音频参考 / 文本生成器 / 文生视频 / 图生视频 / 全能参考 / 首尾帧视频 / 脚本生成器 / 进入全景预览`，并写入对应 node label 与 `videoCapability`。
- 空白 Tab 快速创建和空白右键菜单共享同一套 `LINGHUI_CANVAS_CREATE_MENU_CATALOG`，避免用户从不同入口看到“基础节点类型表”和“LibTV 预设表”两套心智。
- `进入全景预览` 不应只是 quick-create 里的一条 label；节点右键现在会从当前图片结果或图片集合派生 `linghui/panorama` 节点，导入主图、建立 image→image 语义边，并打开新全景节点编辑态。
- `创建主体` 最稳的第一落点是灵绘全局资产库：从当前节点可见图片去重取前 4 张写入 `referenceImages`，保存为 `character` 类型全局资产，避免强依赖当前项目剧集角色表，也能被 3D 导演/空间资产侧复用。
- LibTV 文案中还有 `分离内嵌音轨为独立音频节点`；灵绘已有 `ffmpegManager.splitAudio`，因此视频节点右键现在对本地视频开放音轨分离，生成独立 `linghui/audio` 节点并保留 video→audio 语义边。
- Electron CDP 验证时发现菜单媒体状态只看 run result，会漏掉已有 `properties.source` 的导入视频；已把视频节点属性里的本地 source/posterSource 合并进右键媒体集合，再和 result media 去重。
- Electron CDP 点击分离音轨时捕到 `Cannot read properties of undefined (reading 'hasAudio')`，说明 FFmpeg getInfo 在部分节点源上可能返回空值；已加 `mediaInfo?.hasAudio` 防御，并让分离音轨入口只在可本地解码的视频源上显示。
- 继续抽取 LibTV 节点菜单时确认：`复制图片` 不是复制 URL，而是先把图片 source 转成 blob/canvas PNG，再调用 `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])`；灵绘已有 `复制图片地址`，但缺少这个能粘贴到其它应用的图片本体剪贴板动作。
- 灵绘当前菜单状态已经能得到主图 `contextMenuMediaActionState.primaryImage`，因此二进制复制可以落在 overlay 层，不需要改执行结果结构；失败时应提示浏览器/系统不支持图片剪贴板，避免和地址复制混淆。
- LibTV 打包产物中图片生成提交前存在 `prepareImageParamsForFocusRegion`，会读取 `focusRegion` 并把场景切到 `camera_focus`，同时有 `聚焦图片处理失败` 的错误反馈；这说明 `聚焦` 不是普通 prompt preset，而是局部区域驱动的图生图/局部重绘行为。
- LibTV 的 focusRegion 以相对位置表达区域，并在提交前把聚焦图处理成可上传图片；灵绘当前没有同款上传服务入口，因此最小兼容方案是保存归一化区域、保留标记时图片源、在执行时把该图片加入 referenceSources，并向 prompt 注入局部重绘边界。
- 聚焦反馈需要同时存在于编辑器和节点卡片：编辑器里选区可调，节点缩略图上显示红框和 `聚焦` 徽标。否则用户关闭浮层后不知道节点仍会按局部区域再生成。
- 聚焦执行的操作反馈不应继续复用普通 prompt 作为占位副标题；显示 `聚焦区域生成` 更接近 LibTV 的“这是一次局部处理”的反馈语义，也便于排查运行队列。
- LibTV 图片工具 `标记` 的核心不是简单画点：打包产物中可见 `clickSuggest`、`MAGIC_SELECT_MAX_COUNT` 和 `{{magic:id:0}}` 类 token 插入，说明它会把用户点击坐标转成可被生成链路理解的局部语义引用。
- 灵绘没有 LibTV 私有 clickSuggest 服务，因此本轮用本地可解释协议承接：保存归一化 `x/y`、标记编号、原图 source，并在执行时把图片作为参考图，同时向 prompt 注入 `LibTV-style mark points` 坐标说明。这样功能可用、可持久化，也给后续接真实视觉点选服务留下数据结构。
- 标记点和聚焦框需要能共存：聚焦表达“区域”，标记表达“点位/对象”；节点缩略图上分别用红框和黄色编号点表达，避免用户把两类局部操作混在一起。
- LibTV `高清放大` 相关文案不只是按钮标签，打包产物里还有 `select_upscale_factor` / `upscale_tile_hdr` / `upscale_tile_weight` 等参数暗示；灵绘第一版用本地 FFmpeg Lanczos + unsharp 复刻稳定的 2x/4x 高清派生节点，先把用户可见入口、运行反馈和本地资产落盘打通。
- 高清放大属于图片工具里的“本地处理”分支，和聚焦/标记这类“影响下一次生成 prompt/reference”的工具不同；因此实现落在画布 overlay + Electron FFmpeg bridge，而不是 `executeImageNode()` 的 provider 生成链路。
- 工具菜单点击时不能依赖 React state 里的 `activeNodeTool` 作为执行参数；下拉点击和 `setActiveTool()` 同步发生时可能读到旧 state。高清执行现在直接传 `nodeId`，状态只用于 UI 高亮。
- LibTV 图片工具里的 `扩图 / 打光 / 重绘` 更接近“生成一次新的编辑任务”，而不是把当前节点 prompt 原地改掉。灵绘现在用派生 image-to-image 节点表达这些工具操作：当前节点保留原结果，下游节点记录工具 prompt、参数和 image→image 语义边，并立即进入运行反馈。
- 派生工具节点不应继承源节点的 `focusRegion` / `markPoints`，否则一次扩图/打光会意外带入上一次局部聚焦或点选意图。当前实现清空局部标记，只继承模型、比例、清晰度等生成上下文。
- 继续扫描 LibTV 主图片工具 chunk 可见，除了已覆盖的 `高清 / 扩图 / 多角度 / 打光 / 重绘 / 标记 / 聚焦 / 宫格`，还有 `擦除 / 抠图 / 裁剪 / Mockup / 编辑元素 / 编辑文本`。其中 `擦除` 有 `智能擦除` 与 `框选擦除` 文案，后续可以复用当前派生工具节点协议先提供可运行入口，再逐步接 mask/背景移除/文本编辑等真实服务。
- 扩展图片工具入口后，灵绘顶部工具条不能继续按按钮数量无限放宽；稳定方案是固定节点编辑器工具条上限，工具区内部 wrap + thin scrollbar，保证标题、关闭按钮和工具按钮在窄屏/缩放下不互相挤压。
- `裁剪` 和 `高清` 一样属于确定性本地图片处理，优先走 Electron FFmpeg，而不是提示词生成。当前 `cropImage` 使用中心 cover crop 到 1:1 / 9:16 / 16:9，输出本地 PNG 后派生图片节点；这给后续接更高级手动裁剪框留下了同一条 bridge。
- `擦除 / 抠图 / Mockup / 编辑元素 / 编辑文本` 暂时用派生图生图节点承接，因为 LibTV 原链路依赖私有编辑/商业任务服务；灵绘先保留用户可见入口、prompt 协议、独立结果节点和运行反馈，后续可把具体 preset 替换为真实 mask、remove-bg 或 text-edit provider。

## 2026-05-14 Linghui Media Remote URL Flow

- 当前需要从数据模型层修复灵绘上传复用：前一轮已做请求内去重和远程 URL 缓存，但如果灵绘媒体引用在执行流中只传 `media.source` 字符串，下游仍然看不到 `metadata.persist.remoteUrl`，会按本地文件重新进入上传/缓存检测。
- 关键方向：灵绘媒体结果仍可用本地 `source` 方便 UI 展示，但执行/提示词引用应把 `metadata.persist.localPath` 与 `metadata.persist.remoteUrl` 还原为 `StoredMediaAsset` 后传给 provider 映射层。
- `LinghuiMediaItem.metadata.persist` 现有结构足够作为最小数据模型，不需要迁移节点 schema；新增工具把它还原成 `StoredMediaAsset`，使 `source` 字符串继续服务 UI，执行链路服务 provider。
- Grok `image-index` 图片协议在归一化 remote URL 后必须用 remote-first 解析 provider reference；否则 `StoredMediaAsset(localPath + remoteUrl)` 会被 `preferLocalFile=true` 重新解析成本地 data-url，等于绕回原问题。
- 视频节点的能力分配也必须保留结构化 source。`resolveVideoCapabilitySources()` 改成泛型后，图生视频/参考生视频/首尾帧视频不会把对象 source 字符串化，后续 `mapVideoRequestToProviderRequest()` 可直接复用资产 remoteUrl。

## 2026-05-13 Director3D Unified Render Pipeline

- 导出视频模型和画布模型不一致的根因是渲染管线被拆成了两套：画布 actor 使用 `Director3DMannequin` / `Director3DLiteMannequin` / `Director3DFormation` / `Director3DCreature` / `Director3DProp` 等 r3f JSX 组件，视频/截图导出则在 `CaptureRenderer` 中通过 `director3dExportGeometry.ts` 的 vanilla three.js 构建器重新拼一遍。
- `exportDirector3DTimelineVideo()` 逐帧调用 `viewport.captureCurrentView({ sceneOverride: frameScene })`，所以时间轴视频导出实际也走 `CaptureRenderer` 的离屏构建路径。只要 JSX 组件与 `director3dExportGeometry.ts` 不同步，导出视频就会和画布不同。
- 首次把 R3F 画布也切到 `<primitive object={group}>` 后，用户反馈无法选中假人且样式变化。根因是 primitive 内部非 React 子树的事件命中/冒泡不如原 JSX 组件稳定，并且共享 builder 使用统一材质会丢掉 JSX 组件里的分件材质。
- 修正后策略调整为：画布继续使用原有 JSX actor 组件，恢复选中、接地圈和原预览样式；离屏截图/视频导出使用共享 `buildDirector3DActorGroup()`，并把导出细节补齐到接近画布结构。交互正确性优先于把画布也强行塞进 vanilla builder。
- 选择圈、拖拽手柄、高度球和旋转环继续留在 `ActorDragLayer` 交互层；导出 builder 只生成实体模型，避免编辑器控件进入导出画面。
- 共享 builder 补齐了主角正面/背面识别细节、lite 群演和 formation 成员细节，使导出不再只靠旧的低保真复刻。后续动物/道具/人物细节应继续改这个共享 builder，而不是恢复 JSX/导出双实现。
- Electron UI 烟测遵守项目规约：没有打开普通浏览器，使用 `http://127.0.0.1:9333` 的 DevTools Protocol websocket 验证当前 Electron 页面在线；当前页面停在项目列表，未进入 3D 工作台，因此只记录为端口/页面级烟测。

## 2026-05-12 Director3D Procedural Model Refinement

- Electron 自定义调试端口在 `electron/main.ts` 中配置：开发模式下读取 `KOMA_ELECTRON_REMOTE_DEBUGGING_PORT`，默认 `9333`，并打印 `chrome-devtools-mcp browser-url=http://127.0.0.1:${port}`。后续可视化验证不能打开普通前端 URL，应连接这个 DevTools 协议端口。
- 当前分支工作树起步为干净状态，上一批导出/模型增强已经在当前代码中。
- 外部开源模型目录 `director3dOpenModelCatalog.ts` 仅作为 reference/procedural-ready 元信息存在；`Director3DNodeEditor` 当前左侧 tab 只有 characters / creatures / cameras / props / templates，没有直接展示外部模型库入口，符合“外部模型库先隐藏”。
- `Director3DProp.tsx` 与 `director3dExportGeometry.ts` 的 `propKind()` 标签识别不完全一致。导出里能识别“车厢、山巅岩、圆台、云台”，视口里可能回退为普通几何，造成所见和导出不一致。
- 四足动物和龙的腿目前挂在 root，不随 spine group。优点是脚更贴地，但在大幅 spine/飞行动作里容易产生躯干与四肢脱节观感，需要增加肩/胯连接件或调整层级表达。
- 本轮公开资料只用于参考画法与骨架表达思路：Three.js `SkeletonHelper` 的父子骨骼可视化、Kenney 低多边角色包的 blocky silhouette、MakeHuman 的人体比例/骨骼来源说明、Khronos glTF sample assets 的 skinned/rigged 资产结构。未下载、导入、打包任何外部模型或贴图。
- 可视化验证边界：`127.0.0.1:9333/json/version` 当前连接失败，说明 Electron 未运行；按用户要求没有打开普通浏览器 URL。下一次需要真实画面验证时应先启动 `npm run dev` 或 Electron dev 命令，再连接该 remote debugging 端口。
- 后续用户要求“现在就开始并写入项目规约”后，当前 Electron 已在 `127.0.0.1:9333` 监听。通过 CDP 读取到页面 target `Koma - 漫剧创作工具`，并确认 DOM 来自 Electron renderer。`AGENTS.md` 与 `CLAUDE.md` 已写入禁止普通浏览器 UI 验证、必须使用 Electron remote debugging 端口的规约。
- `Maximum update depth exceeded` 的日志根因在 `Director3DNodeEditor -> Popover -> Field -> Slider -> SliderTooltip -> Tooltip -> Trigger -> Popup -> Portal`。Director3D 右侧属性面板本身是 AntD Popover，Slider 默认 tooltip 又会开一个 portal，AntD 6 下两层 portal/trigger 在该浮层场景里会递归更新。
- 修复策略是只关闭 Director3D 属性面板里的 Slider tooltip portal：朝向、骨骼微调、缩放、FOV 统一设置 `tooltip={{ open: false }}`；FOV 改用行内角度文本显示，避免丢失数值反馈。
- Electron CDP 9333 实测：打开已有 `3D 导演工作台` 节点、打开右侧属性 Popover、拖动 FOV 滑块后，DOM 中 `.ant-slider-tooltip` 数量为 0，未出现 `Maximum update depth`、`Cannot read properties of null` 或 `popoverEventBlockers`。

## 2026-05-10 Storyboard Image Mode

- 故事板模式应复用现有分镜引用 bundle，而不是新增独立上传/引用协议。这样 `@storyboard_anchor` / `@previous_storyboard_anchor` 会和角色、场景、道具、用户参考图共享同一个 references 顺序，并由 `compileShotPromptToBundle()` 统一编译成 `@Image N`。
- “继承上一故事板”必须落到真实图片引用：实现时从同剧集 `allShots` 中向前查找最近一张 `imageMode === 'storyboard'` 且有当前图片的分镜；若用户关闭 `inheritPreviousStoryboard`，则不注入该 reference，也不允许模板输出 `@previous_storyboard_anchor`。
- 上一故事板不是当前分镜锚点，所以 `previous-storyboard-anchor` 不参与 `hasShotImage`；当前 `storyboard-anchor` 才表示本分镜已有生成图，可作为多参考锚定。
- 故事板模式和九/四宫格一样是多面板图片。视频链路不能把整张故事板当作单一首帧延展；UI 和 workflow 都应把它修正为多参 / reference-to-video 语义，并在视频提示词里提醒不要生成面板边框、箭头、制作表文本。
- 提示词模板需要分两层：推理模板 `storyboard_shot_prompt_generation` 负责把用户分镜整理成电影级故事板 brief；TTI 模板 `tti_storyboard_shot_image` 负责最终出图包装，并再次强调不要渲染可读字幕、对白气泡、标题、项目符号、logo、水印。
- 用户给的四类样例可以抽象为版式选择空间：电影制作方案表、4x4 连续故事板、非对称角色设计表、四格漫画信息图。但当前项目分镜不应固定某一种样式，应该按本分镜剧情自动选择最合适结构，并始终继承项目整体风格。

## 2026-05-10 Storyboard Script Line Editing Stability

- 分镜文本编辑入口在 `ShotScriptLines.tsx`：每行是受控 `<input value={line.text}>`，`onChange` 每个字符调用 `onLinesChange(shotId, lines.map(...))`。
- 父级 `Storyboard.handleScriptLinesChange()` 每次都基于当前 `shots` 构造 `updatedShots` 并调用 `saveAllShots()`；`saveAllShots()` 会同步 `setShots(normalizedShots)` 并排队 `saveEpisodeShots()`。因此一个字符会触发整组 shots 引用更新、Virtuoso data 更新、ShotCard/ShotScriptLines 重渲染和异步保存排队。
- `ShotListEditor` 已经用 `shotsForScrollRef` 避免 active shot 滚动 effect 在输入时重跑，说明该区域已有“输入时被 shots 状态刷新干扰”的历史问题。当前光标跳尾更像受控 input 在每个字符后收到父级重渲染值，浏览器 selection 被重置。
- 最小修复方向：字幕行文本编辑在行组件内维护本地草稿，输入时只更新草稿；失焦/Enter 等提交时才调用父级保存。外部 line.text 变化时，如果该 input 未聚焦再同步草稿。添加/删除/插入/拖拽仍走父级即时保存。

## 2026-05-09 Linghui Prompt Upload Deduplication

- 本轮目标：灵绘提示词编译上传协议必须按“唯一图片源”去重，不应按 `@` 引用次数上传；上传后的远程地址需要写回本地元数据并与文件对应，只有链接失效时重新上传。
- 初始搜索显示相关入口集中在 `frontend/src/components/linghui/**`、`frontend/src/services/promptCompilation/**`、`frontend/src/services/imageHostingService.ts` 和 `frontend/src/services/mediaRemoteUrlService.ts`；项目分镜近期也改过 ITV 上传协议，需要对照检查。
- 当日日志 `logs/koma-20260509.log` / `logs/koma-error-20260509.log` / `logs/ee-core-20260509.log` 用宽泛关键词未直接命中上传错误，需要根据代码里的日志 tag 继续精确查找。
- 根因一：`ensureRemoteUrlForImageSources()` 原来逐项调用 `ensureRemoteUrlForImageSource()`，没有按图片源 key 做批量去重，也没有本地远程 URL 缓存；同一个 data-url / local path 重复出现时会重复上传。
- 根因二：灵绘图片 grok-image-index 路径把显式 `referenceSources` 和静默上游 `silentReferenceSources` 分两次远程归一化；同一张图同时作为 `@ref` 与静默上游参考时，会在同一个节点里触发多次上传，并且 provider references 可能重复携带同一张图。
- 远程 URL 缓存现在写入项目目录 `metadata/media-remote-url-cache.json`，按本地路径、data-url 稳定 hash、provider input 或 StoredMediaAsset key 关联源图；复用缓存前会 HEAD 检测，遇到 403/405 再用 Range GET 兜底，失效则删除缓存并重传。
- 项目分镜视频链路最终也走 `mapVideoRequestToProviderRequest()`；修复后 image-to-video 的主图+额外参考、start-end 的首尾帧在两边都需要 remote-url 时会合并为一次批量归一化，避免同一请求内靠磁盘缓存兜底去重。
- 分镜引用 bundle 构造器本身已经对角色/场景/道具/锚点源做去重；本轮额外补的是 provider 映射阶段的上传去重，覆盖主图/参考图或首尾帧字段之间重复的情况。
- 用户后续日志显示“缓存未生效”的直接原因是 `ensureRemoteUrlForImageAsset()` 对带 `localPath + remoteUrl` 的资产先检测旧 `asset.remoteUrl`，再查本地 sourceKey 缓存；旧链接每次 HEAD 卡 5 秒后才复用缓存，看起来像每次重新上传。修复后本地路径缓存优先，缓存命中时不再触碰旧 `remoteUrl`；无缓存但资产远程地址可访问时会把该地址写入本地缓存。

## 2026-05-08 Linghui Panorama + Director3D Stabilization

- `docs/linghui-panorama-and-3d-director-workbench-plan.md` 已把近期优先级写清楚：先修全景 projection/prompt/viewer 契约，再做 `linghui/director3d` MVP；当前用户的阻塞点是 director3d 无法进入编辑，因此本轮先处理编辑入口。
- 当前工作树已有未提交 director3d 半成品：`frontend/src/types/linghui.ts` 已包含 `linghui/director3d` 类型，且存在 `frontend/src/components/linghui/director3d/`、`Director3DNodeEditor.tsx`、`Director3DNode.tsx` 和 `_director3d.scss` 未跟踪文件；这些应视为已有工作继续接入，不回滚。
- `git status --short` 同时显示大量全景与图片节点相关修改，说明本轮修复必须保持小范围，避免覆盖全景半成品。
- `linghui/director3d` 无法进入编辑的直接原因是 `useLinghuiCanvasNodeInteractions.openNodeEditor` 的节点类型白名单漏了 `linghui/director3d`；点击节点时 selection 被清空，`Director3DNode` 内部的 `useLinghuiNodeEditorVisibility` 永远为 false。
- 前端持久化快照的 `LINGHUI_RF_TYPE_TO_NODE_TYPE` 也漏了 `linghui-director3d`，Electron 文档 normalize 的 `CURRENT_LINGHUI_TYPES` / `CURRENT_RF_TYPES` 同样漏了 director3d；即使节点能打开，保存/恢复路径也会不稳定。
- 新增 director3d 视口半成品里有硬编码颜色，会被当前样式纪律脚本拦截；本轮将其收敛到 CSS token 解析工具，并把全景 seam 诊断里的 inline color 移到 Sass class。
- DevTools MCP 当前被已有 Chrome profile 占用，无法做真实浏览器点击烟测；本轮补了 hook 级测试，直接覆盖“打开 director3d 节点编辑器会设置 editor selection”的入口行为。
- 用户进一步明确：3D 导演台编辑界面不能挂在节点下方，必须是独立全屏工作台；相机也不能以“虚拟机位”物体标注在场景中，工作台编辑视角本身就是最终相机。
- 因此 director3d 保持由节点 selection 触发，但 `LinghuiNodeEditor` 对 `linghui/director3d` 直接渲染 antd fullscreen Modal；节点卡片不再使用 `hasInlineEditor` 状态。
- `Director3DViewport` 已从“编辑相机 + 虚拟 stage camera marker”改为单一工作台相机：orbit/pan/zoom 后写回 scene camera，导出线稿时 `captureCurrentView` 使用当前视角，而不是另一个虚拟相机参数。
- 右侧属性面板不再暴露 camera position/lookAt 表单；未选中假人时只编辑 FOV、比例和背景，视角预设从左侧“视角” tab 触发。
- 进一步排查确认：假人点击后立刻失活，是 R3F actor pointer down 后仍触发外层 viewport `onClick`，调用 `onCanvasClick` 把 selection 清空；需要在 actor pointer down 后抑制下一次 viewport click。
- 假人拖动不自由的根因是拖动计算用了“本次 pointer move 的 dx/dy + 初始位置”，每帧都会围绕初始点小幅重算；改成“累计 pointer 位移 + 初始位置”后可连续拖动。
- 全屏高度不满的风险点在 AntD Modal 多层结构：只设 `.ant-modal-content` 不够，必须同时覆盖 root / wrap / modal / content / body，并让 director3d editor panel/layout 用 100vh。
- 用户继续反馈 X 方向相反且“不跟手”，说明 delta 映射仍然不够。更稳的拖动模型是把鼠标屏幕坐标通过当前工作台相机反投影成 ray，再与假人脚底所在的水平平面求交；假人位置 = 当前鼠标地面交点 + 点击时的偏移量。这样不依赖 yaw/right/forward 的手写方向映射，鼠标在哪，脚底平面上的目标点就在哪。
- 继续排查当前代码后发现：ray-plane 版本的拖动仍然在 React 外层 div 里用 `cameraStateRef` 重建 `PerspectiveCamera`，而真实视口相机在 `EditorCameraRig.useFrame` 中用 lerp 追目标；快速移动或刚切视角后，重建相机与真实 R3F camera 会不一致，表现就是假人不跟手或方向感错误。拖动应放进 R3F 子组件，直接读 `useThree()` 的 live `camera` 和 `gl.domElement`。
- 新拖动层 `ActorDragLayer` 放在 R3F Canvas 内部：actor pointer down 时记录 actor 位置与鼠标落点偏移，window pointermove 期间用 live camera 对鼠标坐标做 ray-plane 求交，并用本地 `dragPreview` 立即渲染位置，避免等父级 React 状态写回造成拖动延迟。
- 拖动写回策略进一步调整为：pointermove 只更新 `ActorDragLayer` 内部 preview，不再每帧调用 `updateNodeData`；pointerup / cancel / blur 时把最终位置一次性提交到 scene。这能避免全局节点数据频繁变更导致 editor/store/React Flow 重渲染。
- 保存后退出再进，panorama/director3d 不可操作的高概率原因有三类：早期半成品可能把 `linghui/panorama` 保存成 `type: linghui-image`；恢复 RF 节点时只 clone snapshot，没有用当前 `createNewNodeData` 补齐 inputs/outputs/properties；如果退出前节点运行态是 `running`，重新进入后 UI/执行链路会继续认为仍在执行中。
- 后端文档 normalize 现在对“已知语义类型 + 已知 RF 类型但不匹配”的节点采用修复式规范化，直接改成语义类型对应的当前 RF type；仍然拒绝真正未知旧类型。
- 前端 `buildRFNodesFromSnapshot` 现在恢复节点时合并当前默认 data：旧 panorama 会补回 `21:9`、`panoramaTemplate`、`projectionMode` 和连接点；旧 director3d 会补回默认 `scene` 和输入/输出连接点。
- `LinghuiPage` 激活工作区时把恢复出来的 `running` nodeRuns 标为 `stale` 并提示“上次执行已中断，可重新运行”，但保存中的运行态不会被此逻辑打断。
- 重新进入后全景/3D 导演台退化为普通文本节点的直接根因不在前端 restore，而在 Electron SQLite persistence helper：`electron/service/linghui/persistenceHelpers.ts` 的 `rfTypeToLinghuiType()` 仍只认识 text/agent/image/video/audio/script，`linghui-panorama` 和 `linghui-director3d` 从数据库读出时走 default，写成了 `linghui/text`。
- 为避免用户已经在退化状态下二次保存，`nodeRowToSnapshot()` 现在还会根据 stored `properties` 做语义恢复：`scene.version === 1` 恢复为 `linghui/director3d`，`projectionMode` / `panoramaTemplate` 恢复为 `linghui/panorama`，并同步把 RF type 规范化回 `linghui-director3d` / `linghui-panorama`。

## 2026-05-08 Unified Linghui Node Ports

- 需求可接受，但必须从“端口语义”改为“节点语义”：画布只展示一个输入点/输出点；执行层仍保留按 result kind 过滤，节点自行从全部上游中挑选图片、文本、视频、音频、storyboard 等需要的数据。
- 当前多端口来源有三处：节点组件按 `nodeData.inputs/outputs` 渲染多个 `LinghuiNodeHandle`；`isLinghuiConnectionValid()` 按 handle index 做 slot type 校验；`createExecutionNodeView()` 的 `getInputResult(slot)` / `getAllInputResults(slot)` 只读对应 `input-N` 的上游。
- 当前性能已有一层保护：`LinghuiCanvasStage` 在 `nodes.length + edges.length >= 120` 时开启 React Flow culling。统一端口可进一步减少 DOM handle 数量和无意义分叉边，但仍要保留 DAG 边本身用于执行依赖。
- 旧工作区里已经持久化的 `input-1` / `output-1` 边不能直接丢；需要读取/保存时兼容，执行聚合应把所有直接上游边都视为同一个输入集合。
- 实施后端口 UI 已收敛成 `LinghuiNodePorts`：节点能力声明仍保留在 `inputs/outputs`，但 React Flow 物理 handle 只渲染 `input-0` / `output-0`，端口 tooltip 汇总该节点可消费/输出的语义槽位。
- 连接校验现在只看节点级约束，不再用 handle 编号推断 slot 类型；这允许图片接文本、图片接脚本等链路成立，真正是否消费由目标节点执行时的 `dataType` 过滤决定。
- 执行层不能简单把所有上游结果原样返回给每个 slot，否则文本/脚本/视频节点会因为多次调用 `getAllInputResults(1/2/3)` 重复拼接同一段文本；正确模型是先收集全链路上游，再按目标 slot 的 `dataType` 返回子集。
- 编辑器侧也有旧端口依赖：参考视频/音频原来分别筛 `input-3` / `input-2`。统一端口后改为遍历全链路上游节点并按媒体 kind/节点属性收集参考资源，避免保存恢复后编辑器参考区丢失。
- 画布保存和恢复都把 edge handles 规范化到统一端口；旧测试 fixture 中的 `input-1` 等仍保留用于验证执行/提示词引用对历史边兼容，但运行时新建/保存的边不再产生多 slot handle。
- 下游引用数量统计必须和执行过滤一样按媒体 kind 分桶；仅遍历全链路上游不够。`referenceImages/referenceVideos/referenceAudios` 如果直接取 `primary.source`，4 张图片 + 2 个视频会同时被三类列表各计为 6 个。

## 2026-05-08 Full TSC Debt Cleanup

- `frontend npx tsc --noEmit --project tsconfig.json` 当前失败集中在 13 类：Electron timeline 持久化 viewMode union、Canvas context union、GPUCanvasContext 测试 mock、Antd message API 调用参数、InputNumber ref 类型、ES2023 `findLastIndex`、不可能的状态比较、Electron project bridge 类型缺 `setStorageRoot`、测试 spread 参数、TimelineData fixture、AsyncTask fixture cast、storageConfig bridge 类型、视频生成媒体输入 union。
- 处理原则：业务代码用类型保护/接口补齐/安全收窄，不用 `any` 掩盖真实数据结构；测试代码只收紧 mock/fixture 类型，不改变测试目标。
- frontend tsc 已清零后，root `tsconfig.json` 仍会通过 Electron 导入链路触达部分 frontend 文件；根因是 root include 只覆盖 `electron/**/*`，没有加载 `frontend/src/types/electron-window.d.ts` 的 Window declaration merging。最终采用局部 `ElectronBridgeWindow`/window cast 收窄，避免扩大 root tsconfig include 半径。
- `linghuiRecipeTemplates.ts` 的内置模板已经按用户方向隐藏，旧 builder 函数不再被引用；删除未使用构造函数比恢复空列表不可见模板更符合“不需要工作流模板”的现状。
- activation 默认管理渠道当前实际为 5 个：llm / tti / itv(grok) / itvJimeng / tts；测试仍按 4 个断言属于历史债务。
- `mediaTaskBindingService.test.ts` 的 `vi.mock` factory 必须使用 `vi.hoisted` mocks，否则 Vitest hoist 后会在初始化前读取普通顶层 mock 变量。
- 当前验证结果：root `npx tsc --noEmit --project tsconfig.json` 通过；frontend `npx tsc --noEmit --project tsconfig.json` 通过；11 个目标测试文件共 54 个测试通过；frontend build、Electron build、`git diff --check` 通过。

## 2026-05-08 Storyboard Video Prompt Template Cleanup

- 视频提示词出现 `【自检】` 的直接来源是 8 个 `frontend/src/store/templates/videoReasoning/shot_video_*.md` 模板末尾的 `## 输出前自检（全过才提交）` 和 checkbox 列表；模型会把这类段落当成需要交付的内容一起输出。
- `frontend/src/services/shotReference/shotsOutputFormat.ts` 的 grid shots section 也有 `【自检】输出前确认...`，虽然它是结构约束，但措辞会增加泄漏概率；改成 `【结构约束】` 并明确最终答案不要输出检查清单。
- 视频提示词缺台词的根因在 `ShotPromptService.generateVideoPrompt()`：模板变量 `scriptContent` 原来只来自 `getShotScriptText(shot)`，没有把 `shot.dialogue` 作为独立事实输入；如果拆分结果把台词放在 `dialogue` 字段而不是 `scriptLines`，视频模板就看不到台词。
- 修复后视频路径会构造 `videoScriptContent = scriptLines + 【分镜台词字段】 + shot.dialogue`，并把显式台词传给 `buildDialogueGuardNote()`；最终输出边界要求 DIALOGUE 必须进入 `对白提示词`。
- 服务层保留两道兜底：`sanitizeVideoPromptResult()` 删除模型泄漏的 `【自检】` / checkbox 段落，`ensureExplicitDialogueInVideoPrompt()` 在模型漏写显式台词时直接补入或追加到 `对白提示词`。
- 为避免 `shot.dialogue` 同时出现在脚本文案和显式保护里时重复，角色名前缀台词解析现在保留 `角色名：台词`，可与显式台词做精确去重，也更贴合目标输出格式。

## 2026-05-08 Storyboard Image/Video Prompt Visual Alignment

- 用户给的三段目标样例核心不是单纯换字段名，而是要求提示词具备可执行画面层次：主空间 + 背景/远景 + 前景/近景、特写对象、角色可见状态、道具位置、动作节奏、光影变化和上下文呼应。
- 原 `shot_image_prompt_generation` 仍是旧“一段静态图提示词”结构，缺少 `对白视觉提示词`、`呼应提示词` 和视频结构参考；这会导致生图锚点和视频动作/对白不对应。
- 生图推理现在接入 `shot.dialogue`，但只把它用于口型、表情、字幕/系统气泡判断；普通对白明确禁止画成文字，避免 TTI 把台词直接渲成乱字。
- 首帧延展视频模板之前输出 `道具提示词`，但输入资产基准库没有 `{{props}}` 且模板变量也未声明 `props`；本轮补齐后首帧图/视频都能看到道具上下文。
- 多参视频模板和首帧视频模板统一字段：`画面描述` 取代旧 `场景描述`，`多机位运镜` 取代旧泛化 `运镜`，新增 `呼应提示词`，强化前中后景、特写对象、系统气泡和物理反馈。
- 九宫格/四宫格推理和 TTI 直拼模板也同步增强：每格必须是连续动作锚点，保持同一空间/服装/光影，并写清画面层次、手部姿态和光影方向。

## 2026-05-08 First-Person Narration To Scene Dialogue

- 用户纠正了关键语义：`她自称天道，说要帮我夺回气运` 不能作为旁白输出，也不能逐字变成 `小白 对 我 台词：她自称...`；它是第一人称叙述素材，需要被改写成真实剧情和正确人称对白，例如 `小白：我是天道，我可以帮你夺回气运`。
- 旧服务兜底 `ensureExplicitDialogueInVideoPrompt()` 会把 `shot.dialogue` 逐字补进 `对白提示词`，这对真正对白有效，但对第一人称转述会放大错误；现在它只补显式直接对白。
- `buildDialogueGuardNote()` 现在把台词证据分为 `DIALOGUE`、`NARRATIVE_TO_SCENE`、`VOICEOVER`、`COMMENTARY`。第一人称转述不会进 spoken，也不会把来源叙述句或“改写说明”暴露给模型最终输出，只给已经转写后的本源剧情对白/动作素材。
- 新增启发式转写：当角色列表有 `我` 和另一个角色时，第一人称转述会转成对方当场开口的真实对白，例如让“小白”以自己的身份说出“我是天道，我可以帮你夺回气运”，用于压住模型照抄叙述句。
- 8 个视频模板都新增 `NARRATIVE_TO_SCENE` 规则，并把原“台词逐字一致”改成“显式直接对白保留语义；第一人称叙述/转述必须先改写成人称正确的剧情对白”；模板中不再写具体坏句示例，避免提示污染。
- `镜头1-镜头4` 出现两遍的根因是多参模板把 `{{shotsSection}}` 放在“镜头结构约束”中，虽然标了“不要原样输出”，模型仍可能把它复制为 `精确时长` 后的第二套逐镜头 Markdown 段。
- 本轮把多参模板的 `shotsSection` 明确标成“内部参考，严禁原样输出”，要求镜头1/2/3/4动作只合并到 `角色动作提示词` 字段；用户明确指出不能按 `精确时长` 截断以免误删有效内容，因此去重依靠提示词约束，不做尾部截断。
- 视频结果清洗还会移除开头的 `镜头1-镜头4 ` 前缀，以及 `对白提示词` 中的来源叙述片段；如果有可识别叙述转写，`ensureExplicitDialogueInVideoPrompt()` 会补回改写后的真实对白，而不是原句。

## 2026-05-08 Anchor Mention Highlight + No Fake Grid Anchor

- `@grid_anchor` / `@shot_anchor` 不是角色/场景/道具资产，而是只有真实分镜生成图存在时才有效的内置锚点。编辑器高亮需要认识它们，但资产同步和 selectedAssets 编译必须跳过它们。
- `frontend/src/editor/mentionTypes.ts` 原先只解析 `@char_` / `@scene_` / `@prop_`，所以 `@grid_anchor` 在 ScriptEditor 里不会变成 mention chip；本轮新增 anchor mention 类型和内置 item resolver 后，不需要把锚点塞进项目资产列表也能高亮。
- `mentionTooltip.ts` 不能继续手读 `MENTION_REGEX` 的固定分组；新增 anchor 备选分支后 `match[1]` / `match[2]` 对锚点为空，必须统一走 `parseMentions()`。
- `ShotPromptService` 之前从 `shot.imageMode` 派生 `explicitCellCount` 并传给 `decideShotsMode()`，导致没有真实生成图时也会输出 4/9 宫格 shotsSection；这会诱导模型使用不存在的 `@grid_anchor` / cell 对应关系。
- 正确规则是：`grid-4` / `grid-9` 只在 `referenceBundle.hasGridAnchor=true` 时启用；没有 `shot.media.images[currentImageIndex]` 的真实锚定图时，提示词走 normal shotsSection 和文生/多参考资产模式。
- `buildSpatialAnchorDirective()` 不能把 `shot.imagePrompt` 文本当作“视频模型会直接读图”的证据；真实图像锚定应以 `referenceBundle.hasShotImage` 为准。否则只生成了图片提示词、但尚未生图时，也会错误进入有图约束。
- `generateAndSaveShotPrompt()` 不再为了生成视频提示词而偷偷预生成并保存 grid imagePrompt。grid imagePrompt 只在本次确实要生成/优化图片提示词时更新，视频提示词不再靠假首帧文本触发锚定分支。
- `renderShotReferenceTable()` 现在在空 bundle 或仅资产参考时明确写“不要使用 `@shot_anchor` / `@grid_anchor`”；8 个视频推理模板和生图模板也新增锚点存在性判断，约束模型不要输出不存在的锚点 token。
- 锚点 tooltip 无图的根因是 `ScriptEditor` resolver 先返回静态 built-in mention item，导致 `ShotCard` 即使能提供当前分镜图片，也会被无 `previewImage` 的内置说明覆盖。应优先查调用方传入的 mentionItems，再 fallback 到 built-in。
- `ShotCard` 能为当前分镜的有效锚定图构造局部 mention item：grid 模式提供 `@grid_anchor` 预览，普通模式提供 `@shot_anchor` 预览；带 `metadata.gridCell` 的拆分子图不应作为锚点预览，保持和 `buildShotReferenceBundle` 一致。

## 2026-05-08 Prompt Compilation Fallback + Anchor Preview

- 当前 `compileShotPromptToBundle()` 只按 `bundle.items` 替换 token；而 `buildShotReferenceBundle()` 只会把有 `media.previewImage` 的道具放入 items。道具存在但无图时，`@prop_*` 会被记录到 `unmappedTokens`，但仍原样进入最终提示词。
- TTI/ITV 的 `compileGrokTTI()` / `compileGrokITV()` 也只用 `source` 存在的 selectedAssets 建立映射；有资产名但没有可用图片的道具会被视作 unmapped，当前同样保留 raw token。
- 用户给的失败提示词里 `@prop_... 红烧肉` 属于“资产存在、可读名称已在提示词中、但缺视觉引用”的情况。正确降级是移除机器 token，保留已有中文名；如果 token 单独出现，则用资产名替代。
- `@grid_anchor` tooltip 当前在 `ShotCard` 中仍排除了 `metadata.gridCell` 拆分子图。用户最新要求是悬浮图必须跟随“当前选中的图”，所以 UI tooltip 应使用 selected image；bundle 编译是否接受 split child 是另一层约束，不能影响悬浮预览。
- 道具明明高亮但最终没有编译成 `@Image N` 的实际根因之一是 token 生成不一致：提示词输出端使用 `createMentionString()`，真实 ID 如 `prop_177..._1` 会输出 `@prop_177..._1`；但 bundle builder 旧代码直接拼 `@prop_${prop.id}`，会生成 `@prop_prop_177..._1`，导致 compile 查不到同一个 token。
- 分镜视频旧的 `selectedAssetsForCompilation` 路径会在 Seedance 合并参考图时按角色/场景/道具旧顺序插队，可能打乱 `bundle.items` 的 @Image 顺序；分镜请求应只以 `ShotReferenceBundle.items` 为唯一索引事实来源。
- 分镜生图也不应再走 `MediaGenerationService.generateImage()` 里的旧 selectedAssets 编译。正确模型是 workflow 层先用 `compileShotPromptToBundle()` 编译一次，并把同一份 `compiledPrompt` / `references` 交给 provider，避免二次编译和 `@图片N` / `@Image N` 两套协议并存。
- `@grid_anchor` 在 bundle 中就是锚点图项，通常占 `@Image 1`；所谓“主图”只应来自该 bundle 顺序，不应再由旧 compiler 自动 prepend `@Image 1` 到正文开头。

## 2026-05-08 Tweet Narration Dialogue Mode

- 项目已有 `Project.mode?: 'drama' | 'narration'`，但 `CreationContext` 之前没有暴露给分镜和提示词服务，导致推文化第一人称解说在所有模式下都被同一套对白规则处理。
- 剧情模式的目标是“无解说也能看懂”：第一人称推文解说中的认知、决定、质问、反应、转述可以被改写成少量主角独白或角色对白，但必须短、当场可说、人称正确，不能把来源叙述句照搬进 `对白提示词`。
- 解说模式的目标不同：剧情主要由旁白/字幕承载，视频提示词不应主动把第一人称解说大规模对白化；只保留显式直接对白，或极少量确实需要口型同步的短反应。
- 分镜拆解模板需要同时保持“行号覆盖不改写 scriptLines”和“dialogue 可按模式生成”的边界：`scriptLineIndices` 仍只负责连续覆盖原字幕行，`dialogue` 字段才承载剧情模式下的少量对白补足。
- 生图、宫格生图和视频提示词必须共用同一 `dialogueModeDirective`，否则图片锚点可能按解说画面生成，而视频又按剧情对白推进，造成口型、表情和动作不一致。
- 服务兜底已按模式分支：`ensureExplicitDialogueInVideoPrompt()` 只在剧情模式把第一人称转述补成真实对白；解说模式不会把 `她自称.../我意识到...` 这类推文解说强塞进对白。

## 2026-05-08 Storyboard Video ITV Upload Protocol

- 分镜视频生成调用语音生成的根因在 `shotRenderWorkflow`：视频版本保存后如果 `normalizedShot.dialogue` 存在，会直接调用 `mediaGenerationService.generateAudio()`。这属于跨媒体副作用，已移除；分镜视频现在只负责 ITV 视频生成。
- Koma 官方 Grok provider 本身声明的是 URL-only 图片传输，应该触发 `ensureRemoteUrlForImageSource()` 和 qiniu/image-hosting 插件上传。之前 `openai-video` 等 provider 允许 `data-url` fallback，导致上传失败也可能继续把 data-url 或不完整图片数组发给上游。
- 新策略是：需要 remote-url 的 provider 默认不允许 required upload fallback。图床/qiniu 插件不可用时，本地会提前以上传失败结束，不再等上游返回 `Reference placeholders require uploaded images` 这类低信号错误。
- 自定义 `openai-video` 报错的另一层根因是 image-to-video 请求只把主图写入 `body.image`，附加参考写入 `body.images`；但 prompt 里的 `@Image 1` / `@Image 2` 占位符要求 `images` 数组本身包含完整上传图序列。现在 prompt 使用图片占位符时，`images` 会按 `[primary, ...additional]` 传入。
- 保留 `body.image = primary` 是为了兼容标准 image-to-video 起始帧字段；额外补 `body.images` 是为了让 OpenAI-compatible 网关能把 `@Image N` 对齐到实际上传图片。
- 用户最新日志说明 `MediaRemoteUrl` 已经进入 required 归一化，问题不再是“完全没上传”，而是 Grok `/v1/videos` URL-array 网关把 `@Image N` 识别成 multipart 上传图占位符；只有 URL 数组时就返回 `Reference placeholders require uploaded images`。
- 因此 Koma 官方 Grok 的 wire protocol 需要和内部协议分层：内部编译、编辑器和 bundle 仍统一使用 `@Image N`；最终发给 `/v1/videos` 的 JSON body.prompt 转成自然语言索引 `图片N`，body.images 继续按同一顺序传远程 URL。
- `metadata.function_mode` 对 Grok 视频也有必要：图生视频明确 `first_frame`，参考生视频明确 `omni_reference`，避免网关按纯文本或错误模式转发。
- 旧默认参考图上限 4 会让 `@grid_anchor + scene + 两个角色 + 两个道具` 这种正常分镜只传 4 张，造成日志里的 `unmappedTokens` 和道具降级；Grok provider 实际 cap 是 7，默认上限已同步到 7。
- 分镜视频执行时不能信任历史已保存的 `shot.videoPrompt` 一定干净。运行前需要再做非破坏性清洗和台词兜底，避免已持久化的来源叙述泄漏继续进入 provider。
- 验证覆盖了 Grok request images 数组、Grok URL-array prompt 转 `图片N`、OpenAI placeholder images 数组、URL-only 上传失败提前失败、Grok 参考图上限 7、分镜视频不触发 `generateAudio`；root/frontend tsc、frontend build、Electron build、diff check 均通过。

## 2026-05-06 Linghui Tapnow-Base Capability Audit

- 当前 Koma 工作树已有未提交灵绘改动，不能回滚：`linghui/panorama` 新编辑器/目录已出现，并且类型、节点定义、执行计划、共享执行、画布交互、图片节点和持久化文档都有修改。
- 参考项目 `/Users/sunmeng/workspace/tapnow-base` 是浏览器端轻量节点画布，文件结构集中：`App.tsx` + `components/Canvas.tsx` + `components/Nodes/*` + `services/mode/*`。
- tapnow-base 的基础节点能力包括：原始媒体节点、文生图、图生图、文生视频、图生视频、首尾帧视频、创意描述节点，以及本地媒体栈、节点历史产物、导入/导出工作流和缓存设置。
- Koma 灵绘已经具备更完整的工作区/资产/历史/模板/执行图基础设施，所以本轮不宜照搬 tapnow-base 的单页存储结构；更适合抽取其“基础节点能力覆盖面”和“图像/视频参数模型”的缺口。
- Koma 视频底层已经支持 `video.text-to-video`、`video.image-to-video`、`video.reference-to-video`、`video.start-end-to-video`；与 tapnow-base 差距不在执行层，而在“用户能否一键发现并创建图生视频/首尾帧视频基础骨架”。
- `linghui/panorama` 当前已接入类型、节点库、编辑器、执行器、渲染和持久化白名单，但静态解析路径仍只认 `linghui/image`；导入全景图或作为依赖被单输入读取时会丢失图片节点家族行为，需要同步修正。
- 新增 `PanoramaViewer` 使用了普通 inline style，当前 `frontend/scripts/check-style-discipline.ts` 会拦截；需要移入 Linghui Sass partial，以免主题纪律回退。
- 实施后确认：tapnow-base 的文生图、图生图、文生视频、图生视频、首尾帧视频与环境/创意描述入口，在 Koma 中更适合沉淀为 Recipe 模板，而不是新增一批重复节点类型。
- `linghui/panorama` 作为独立节点类型保留产品语义，但执行、静态导入、提示词引用和下游视频消费都必须按图片家族处理；这次已覆盖 `getInputResult`、`getAllInputResults`、静态 node result、fallback reference、result reference 主图选择。
- 全景预览样式已从普通 inline style 收回 Sass；`npm run check:style-discipline` 仍失败，但失败项均在既有 project/storyboard/chat/theme/index.scss 路径，新 Linghui panorama/Recipe 路径局部检查为 0 命中。
- 验证结果：5 个目标 Vitest 文件共 21 个测试通过，`npm run build` 通过，`git diff --check` 通过；构建只保留既有 Vite dynamic import/chunk size warnings。

## 2026-05-06 Linghui Canvas Interaction Audit

- 用户明确反馈“不需要工作流模板”，说明把基础能力映射成 Recipe 是错位方案；本轮已暂时隐藏内置系统 Recipe，后续应把能力入口放在节点创建、连线辅助、上下文操作和执行体验里。
- 当前灵绘画布的基础操作比节点能力更影响可用性：锚点命中区小、运行入口分散、失败原因不易回看、执行流连线反馈偏弱。
- HUD 是最适合放一键执行完整流程的位置：它常驻、接近执行状态摘要，并且已有失败/待重跑操作；把“运行全部 / 运行选中”放到这里比藏在右键菜单里更符合高频操作。
- 连接失败不应该只 toast，一旦用户连续试错会丢上下文；写入 executionLogs 后，错误连线规则可以被回看，也能作为后续优化连接规则的证据。
- 连线状态本身已经有 `edgeStatuses`，不需要重做执行图；第一批只需强化视觉：扩大 interactionWidth、增加 glow path、运行 dash animation 和连接预览动画。
- 本轮新增的 `LinghuiEdge` 样式变量必须走 `cssVars(...)`；直接 `style={edgeStyle}` 会被主题纪律脚本拦截。修正后 `check:style-discipline` 不再命中新改的画布文件。
- 只写日志仍然不够：用户真正需要的是“错误发生时画布自己带我到出错节点”。因此失败后自动聚焦首个失败节点，并让日志项可点击定位相关节点，比单纯增加日志条目更有用。
- 节点卡片上的失败原因必须做成共用组件，否则图片/视频这类媒体节点和文本/脚本这类信息节点会再次分裂；`LinghuiNodeRunError` 作为低成本共享层可以覆盖当前所有节点族。
- React Flow 当前版本支持 `connectionRadius`，默认 store 值是 20；灵绘应显式提高到更大的半径来实现“不完全接触即可连接”。样式层还要让所有端口共享同一类名和磁吸圈，否则输入/输出点仍会给用户两套手感。
- 磁吸实现不需要手写全局 pointer 距离检测：React Flow 在拖线进入 `connectionRadius` 后会把最近可连接端口标记为 `connectingto` / `valid`，灵绘只要显式提高 `connectionRadius` 并把这些状态映射为连接点吸附动画即可。
- 所有节点端口已经收敛到 `LinghuiNodeHandle` 和 `.linghuiNodeMagnetHandle`；旧的 `.linghuiCompactHandle` / `.linghuiRFHandle` 保留为 Sass 兼容别名，但不再维护独立尺寸/边框规则，避免输入点、输出点手感分裂。
- 灵绘视频节点漏接了项目已有的 `VideoDurationSpec`：聊天/分镜已经按当前 ITV selection 处理 enum/range，灵绘仍固定展示 5/10/15/30 slider 并把 `props.duration` 原样传执行。
- `durationSpec.ts` 中 Koma 官方即梦已能按 `seedance-2.0` / `seedance-2.0-fast` modelId 解析 4-15 / 4-12 秒范围；Grok provider 的注释写上游枚举是 6/12/16/20，但旧兜底仍包含历史 10 秒，需要避免灵绘 UI 和执行继续暴露 10。
- 画布 HUD 自动展示执行日志会带来两个问题：用户不知道如何关闭，并且日志会和一键执行/状态控件抢画布空间。更合理的模型是把日志作为左侧菜单里的可选面板，默认不打扰画布操作。
- 左侧浮层需要互斥：项目列表、资源/工作流/历史抽屉、执行日志同时打开会叠层遮挡画布；打开其中一个时应主动收起其它浮层。
- `LinghuiPropertiesPanel` 里仍有一个未挂载的旧执行日志展示组件；当前实际画布入口已经不使用它，本轮不删除未挂载组件以避免扩大影响面。
- 同一页面内的重复执行已有 `executionAbortControllerRef` 拦截，但页面刷新/状态恢复后，单个节点的 `running` 状态不包含可恢复的远端 taskId；如果用户再次触发执行，旧实现会覆盖 running state 并再次调用 provider `start()`。
- 防重复提交最稳的第一层应放在工作流执行目标计算后：只要本次目标链路所需节点里存在仍在默认轮询窗口内更新过的 `running` 节点，就阻止新提交并聚焦该节点。这样视频、生图、音频、文本等节点统一受保护。
- 旧 running 状态不能永久挡住用户：默认轮询窗口是 10 分钟，本轮加 1 分钟宽限；超过这个窗口的运行态被视为过期，可重新执行。
- 仅依赖 `nodeRun` / executionQueue 的运行态禁用仍有点击竞态：连续双击可能在 React 状态刷新前连续触发 `onRun`。节点编辑器提交按钮需要首击即时锁，和执行链路级 duplicate guard 形成两层保护。
- 生图/生视频是最高风险入口，但文本、音频、Agent、脚本生成和脚本派生出的分镜图/视频流程也会提交任务或批量创建后续节点，应该共享同一套短冷却锁，而不是各自写 ad hoc 防抖。
- Electron 官方提供 `app.setAppLogsPath()` / `app.getPath('logs')` 和 `webContents` 的 `console-message` 事件；比纯 renderer 劫持 `console` 更适合做桌面应用日志收集的底层入口。
- 当前前端已有 `frontend/src/store/logger.ts`，但旧实现通过通用 fs IPC 读取完整日志文件再重写追加，既低效也扩大了 renderer 文件写权限；应改为主进程专用 diagnostics IPC。
- 日志目录必须跟随用户可设置的 `storageRoot`，不能固定 Electron `userData`。本轮把 `diagnosticsService` 初始化到 `${storageRoot}/logs`，并在 `project.setStorageRoot` 时同步 `app.setAppLogsPath`。
- IPC 安全边界采用显式白名单：renderer 只能调用 `controller/diagnostics/appendRendererLog`、`listLogs`、`clearRendererLogs`、`exportLogs`，不能指定任意写入路径或任意打包目录。
- 导出 zip 由主进程扫描固定日志根生成，包含 `manifest.json`、renderer/console/main/Electron 日志；单文件大小和递归深度都受限，避免把用户目录任意内容打进诊断包。
- 本次“打开两个空节点画布后新建报错”的根因是空壳 React Flow 节点进入了 `graphData.nodes`：这些节点没有 `type` / `data.linghuiType`，后端 `normalizeLinghuiWorkspaceDocument` 严格校验后抛错，而 ee-core controller 异常会被吞成 `undefined`，前端因此只能看到“未返回工作区文档”。
- 修复需要三层同时做：画布快照只持久化可识别灵绘节点并过滤悬空边；后端 normalize 对空壳节点做兼容丢弃、继续拒绝真正不支持的旧节点类型；`LinghuiController` 与 `linghuiStorage` 把结构化错误返回/空返回转成可读异常。
- 灵绘项目导出不能只写 JSON：真实画布引用会散落在节点属性、运行结果、资产库、历史记录和模板快照里，因此导出包采用 `koma-archive://` 中间引用统一收集资源，导入时再重写到新的工作区目录。
- 导入灵绘工作区必须重分配节点/边/分组以及模板、资产、历史记录 id；否则 SQLite 主键和画布节点 id 都可能与本机已有工作区冲突。

## 2026-05-03 Theme System Architecture

- 当前 worktree 为 `/Users/sunmeng/workspace/Koma-theme-worktree`，分支 `codex/theme-system-architecture`，从主目录 `feat/panel-restore2` 的 `5a5ac03` 创建；主目录有未提交改动，本轮不触碰。
- 现有主题入口很窄：`frontend/src/theme/tokens.ts` 被 `antdTheme.ts` 使用，`frontend/src/index.tsx` 从 `./theme` 取 `antdTheme` 挂到 `<ConfigProvider>`；业务代码基本没有直接 import UI theme tokens。
- `frontend/src/index.css` 原本同时持有 Tailwind v4 `@theme` 真实 hex、`:root` 兼容变量别名、全局 Antd 覆盖和 Settings 页面样式；本轮已迁移为 `frontend/src/index.scss`，`@theme` 只转发 `var(--token-*)`，并保留 `:root` 默认 token 快照作为首屏兜底。
- 设置存储实际在 `frontend/src/store/settings/core.ts`：非 Electron 用 `localStorage[STORAGE_KEYS.SETTINGS]`，Electron 用 `settings.json`，渠道配置另由 SQLite 覆盖。UI 主题字段适合放入 `AppSettings` 并通过 `loadSettings/saveSettings` 持久化。
- 项目已有 `ThemeSelector` / `themePresets`，语义是“图片/视频生成视觉风格”，不是 UI 外观主题；新增 UI 主题命名必须避开 `ThemePreset`，建议使用 `uiThemeId` 或清晰文案“界面主题”。
- `globalStore.ts` 只是 `store/settings` 的 re-export，新增持久化 helpers 应该优先放到 `store/settings/core.ts` 或独立 runtime persistence，`globalStore` 只透传。
- `SettingsPage.tsx` 目前有明显 inline style 与 hex 遗留，本轮只在新增/必要触点用 token 变量，避免扩大到 Phase 5。
- 源代码内项目自有 `*.css` / `*.module.css` 已清零；TS/TSX 中 `.css` import 仅剩第三方库样式：`ds-markdown/style.css`、`xgplayer/dist/index.min.css`、`@xyflow/react/dist/style.css`。
- CSS→SCSS 迁移不能只看扩展名：这次额外修掉了迁移后 `.module.scss` 中残留的 CSS-in-JS camelCase 属性，并把 asset/chat/storyboard/index 新迁移样式里的颜色消费收敛到 `var(--token-*)` / `color-mix(...)`。
- 文档的全量主题纪律目标尚未完成：Linghui 既有 SCSS 仍有 `$lh-*` 硬编码色值，业务 TS/TSX 中仍存在大量 inline style、Tailwind arbitrary hex 和硬编码颜色；这属于 Phase 5/9 之后的工作。
- `light-business` 已能通过同一套主题 registry、Settings UI、settings 持久化、CSS vars 和 Antd `defaultAlgorithm` 生效；`darkTheme={true}` / `colorMode="dark"` 这类显式暗色运行时 flag 已在 Linghui Canvas、Storyboard、ShotCard、ScriptWorkbench、ScriptImportDialog 的关键调用点改成读取当前 theme mode。
- 仅新增 `light-business` 不等于完成文档 Phase 7 全部验收：项目/分镜/灵绘页面仍有大量 `bg-zinc-*` / `text-zinc-*` / inline rgba/hex，light 模式下局部区域仍可能保留暗色视觉，需要后续 Phase 5 与 Linghui token 化继续清理。

## 2026-04-04 Linghui 编辑器样式整治

- `LinghuiNodeEditor.tsx` 负责顶部浮层和主体浮层，视觉基线由 `LinghuiPage.css` 中的 `.linghuiNodeEditor*` 与 `.linghuiEditor*` 控制。
- 目前编辑器“厚重感”主要来自多层 `border`、不同深浅背景和多段 header/toolbar 分割线叠加。
- `ImageNodeEditor.tsx` 的导入模式即使没有图片，也会渲染内部工具栏，和用户期望不符。
- 文生图使用 `LinghuiPromptEditor` 的 `fusion` 表面样式，但外层 `.linghuiEditorPrompt` 与面板头部的节奏仍然导致提示词区显得贴顶、块感重。
- 文本、脚本、Agent、音频、视频等编辑器结构不一致，有的先 header 再内容，有的直接 dropzone/field，导致共用样式很难自然收敛，需要先统一共享容器节奏。

## 2026-04-04 实施后补充

- 统一视觉收敛最有效的入口是 `LinghuiPage.css` 里的 `.linghuiNodeEditor*`、`.linghuiEditor*`、表单输入和 Ant Design 控件覆盖层；改共享层比逐组件单修收益更高。
- 图片节点空态现在会把顶部工具收成“仅名称 + 关闭”，避免无图时出现扩图、打光、重绘等不可用操作。
- `ImageNodeEditor.tsx` 的导入模式改成了更轻的空态/预览态面板，并去掉了不必要的执行按钮。
- 所有提示词编辑器已统一切到 `fusion` 表面样式，`LinghuiPromptEditor.tsx` 本身也改成无硬边框的内嵌式表现。
- DevTools 页面快照确认：当前灵绘画布里的空图片节点会显示极简顶栏，编辑主面板仍正常挂载在节点下方。

## 2026-04-04 视频弹窗极简化补充

- 视频节点顶部处理工具是否显示，不能只看“是不是透传节点”，还需要看“当前是否真的已有视频产物”；否则空视频态会暴露一排无法产生即时反馈的处理按钮。
- 视频编辑一级界面收敛最有效的方式不是继续堆 section，而是改成“能力摘要 + 提示词 + 模型摘要 + 参数摘要 + 动作按钮”。
- 二级参数弹层比一级面板里的多组 Select 更适合视频参数：比例和分辨率适合平铺按钮，时长适合 `Slider`，一级界面只回显摘要即可。
- 视频下载能力可以直接复用图片节点的保存策略，但要额外覆盖本地文件、远程 URL、`data:`、`blob:` 四类视频源。
- DevTools 实测确认：当前无视频输出的节点顶部已不再显示“高清 / 解析 / 合成”工具；一级弹窗只保留模型摘要、参数摘要和生成按钮，二级弹层会展示比例/分辨率/时长选择。
- 这类编辑器弹层如果挂在节点容器内部，很容易被 `transform` / `overflow` / 缩放后的编辑壳层裁切；视频参数弹层改挂到 `document.body` 后，层级和可见范围都会稳定很多。

## 2026-04-04 其他节点跟随视频模板补充

- 图片节点已经很适合做极简模板的第一批受益者：只保留提示词、模型摘要、参数摘要和生成动作后，一级编辑器的密度明显更接近视频节点。
- 文本、Agent、脚本三类“以文本输入为主”的节点，最适合共享 `Dropdown + Popover + ActionRow` 这组结构；比保留整段表单标题、提示文案和底部工具栏更轻。
- 脚本节点如果在空态时继续展示视图切换工具条和 Ant Design `Empty` 插图，会明显比视频节点更重；改成仅在有镜头结果时展示视图切换，并把空态改成一行轻提示，更符合极简方向。
- 音频节点编辑区里保留“最近生成结果”的整块播放器预览，会和“节点本身承担结果消费”这条原则冲突；改成摘要回显 + 写回/保存动作，更符合当前画布极简策略。
- 通用编辑器样式扩展时，最容易出问题的是 `LinghuiPage.css` 这类长文件中的分组选择器；这次新增 `.linghuiEditor*` 别名时就踩到了未闭合样式块，后续继续演化时需要优先做构建验证。

## 2026-04-04 Sass 模块化补充

- `LinghuiPage.css` 已经达到 5000+ 行，继续在一个文件里维护会让“节点编辑器 / 画布壳层 / React Flow / 媒体面板”这些本来独立的样式层互相污染，改动时也很难判断影响面。
- 对 Linghui 这种单页面但高密度样式系统，`sass partial + 单入口聚合` 比单纯继续拆成多个 `.css` 文件更稳：既能按模块拆文件，又不会把样式加载关系分散到多个组件里。
- 这次按功能拆分后，最清晰的边界是：
  - 页面骨架与执行计划弹窗
  - 侧栏 / 资源库 / 资产抽屉
  - 画布外壳 / HUD / 快捷创建 / 右键菜单
  - React Flow 基础节点与预览
  - 紧凑节点样式
  - 节点编辑器壳层、通用面板、控件层、表单/脚本层
  - 多角度弹窗、媒体面板与响应式补丁
- `LinghuiCanvas.tsx` 反向依赖页面样式文件会让目录边界变模糊；由 `LinghuiPage.tsx` 统一引入页面级样式入口更合理。

## 2026-04-04 Sass 第二层收敛补充

- 仅把 `.css` 改名成 `.scss` 价值有限；如果没有 `tokens`、`mixins` 和命名空间嵌套，后续维护时仍然是在写“分文件的传统 CSS”。
- Linghui 这类大体量样式最适合按前缀命名空间嵌套：
  - `.linghuiToolbar { &Left / &Right / &Meta }`
  - `.linghuiExecutionPlan { &Modal / &Body / &WaveCard }`
  - `.linghuiNodeEditor { &TopBar / &ToolButton / &DropdownMenu }`
  - `.linghuiEditor { &Panel / &ToolChip / &SummaryPill }`
  - `.linghuiScript { &Panel / &Shot / &Table }`
- 第二层收敛里最值得抽的不是“大而全主题系统”，而是高频视觉原语：
  - 文本层级
  - 玻璃面板
  - 软卡片
  - chip / pill
  - 按钮化 chip
  - 输入壳层
  - focus ring
- 这次收敛后，页面骨架、侧栏/资源库、节点编辑器壳层、节点编辑器面板、控件、表单脚本层都已经开始共享同一组 Sass 原语，后面继续清理 `canvas-overlays`、`compact-nodes`、`media-panels` 会更顺。

## 2026-04-04 Sass 第二层收敛收尾补充

- `media-panels` 适合按“多角度弹窗 / 引用区 / 图片 tile / 音频上传 / 沉浸弹窗 / 响应式补丁”分块；这样媒体面板的行为和视觉层次会比原来的长串平铺选择器更清晰。
- `compact-nodes` 的难点不是样式量本身，而是状态很多：折叠、沉浸、展开、多图、播放中、主图、网格选择。把这些规则统一收回 `.linghuiCompact` 根命名空间后，状态样式和基础样式终于在同一处可读。
- `canvas-overlays` 原本把左侧 rail、项目面板、状态 dock、工具条、快速创建、右键菜单、浮动面板交错写在一起；改成 `.linghuiCanvas`、`.linghuiPendingGroup`、`.linghuiQuickCreate`、`.linghuiContextMenu`、`.linghuiFloatingPanel` 之后，浮层层级和职责边界明显更稳定。
- `canvas-reactflow` 最适合按“Flow 基础层 / RFNode / CanvasGroup / 预览层 / 节点 widget / 镜头 / 日志 / 状态栏”拆语义前缀；比继续沿着视觉结果平铺选择器更利于后续维护和定位。
- 这轮收尾后，Linghui 页面样式已经不再存在“少数 partial 是嵌套 Sass，剩余几个还是传统 CSS”的断层，第二层 Sass 收敛已经覆盖页面样式入口下的全部核心 partial。

## 2026-05-03 Theme System Completion Findings

- The strict discipline target is now mechanically enforceable: `frontend/scripts/check-style-discipline.ts` checks ordinary CSS files, project CSS imports, inline `style={{...}}`, inline `style={expr}`, Tailwind arbitrary hex, dark-only flags, business imports from `theme/tokens`, SCSS color literals, and business hardcoded colors with a zero budget.
- `style={expr}` was the main hidden gap after the first cleanup. The final rule allows only `cssVars(...)` bridges, identifiers/functions proven to return `cssVars(...)`, and one documented React Flow `BaseEdge` forwarding exception in `LinghuiEdge.tsx`.
- Adding a new theme is now a theme-author-layer operation: add a default-exported `Theme` file under `frontend/src/theme/themes/`. `themes/index.ts` discovers it with Vite `import.meta.glob`; Settings options derive from discovered theme metadata.
- `light-business` uses the same runtime chain as other themes: ThemeProvider writes `--token-*` variables to `:root`, Antd config uses `defaultAlgorithm`, Settings persists `uiThemeId`, and dark-only flags are checked by script/lint.
- Source-owned `.css` / `.module.css` files in `frontend/src` are now zero. The only CSS imports in TS/TSX are third-party styles explicitly allowlisted by the discipline script.
- `npm run lint:theme` is intentionally theme-focused and does not try to clear the repository's broader historical ESLint unused-import/unused-vars debt. Full `eslint src` still has unrelated legacy issues, but theme CI runs the dedicated discipline config plus the stricter custom script.
- Browser smoke found and helped fix one runtime regression in `ScriptEditor.tsx` where `rootClassName` was accidentally left outside component scope. After the fix, the app mounted and root theme dataset/CSS variables were present.
- Remaining color literals are outside business UI: theme author files, the `index.scss` first-paint token snapshot, immutable `AppLogo` artwork, and media/export defaults in rendering/export engines. These are documented in `docs/INLINE_STYLE_EXCEPTIONS.md` and allowlisted by exact path.

## 2026-05-10 Storyboard Anchor Findings

- `ImageCardGrid` 切换图片版本会调用 `onImagesChange(shot.id, images, idx)`，`Storyboard.handleImagesChange` 会把 `media.currentImageIndex` 写回 shot，因此选中版本具备持久化入口。
- `buildShotReferenceBundle` 的 `pushPreviousStoryboardAnchor` 已经从上一故事板的 `previous.media.currentImageIndex ?? 0` 取图，生成链路理论上会跟随上一故事板当前选中版本。
- 当前缺口在 UI 层：`ShotCard.promptMentionItems` 只注入当前分镜锚定图，没有注入 `@previous_storyboard_anchor` 的真实 `previewImage`，所以悬浮提示会退回内置文案而没有上一分镜选中图片。
- UI 可用性应该和生成链路一致：只有当前分镜是 `storyboard` 且 `inheritPreviousStoryboard !== false` 时，才应给 `@previous_storyboard_anchor` 注入上一故事板预览。

## 2026-05-10 Shot Video Version Playback Findings

- `ShotCard` 的缩略格选择会调用 `onVideosChange(shot.id, videos, idx)`，`Storyboard.handleVideosChange` 会把 `media.currentVideoIndex` 写回，所以版本选择入口存在。
- 播放弹窗使用 `StagePlayer`，但播放器组件内部有 xgplayer/native video 两条路径；在切换版本后需要让播放器节点带源 key，避免浏览器或播放器实例继续复用旧媒体状态。
- 视频生成的异步任务路径需要显式透传 `destPath`。`shot-version` 视频应固定落到 `shots/<shotId>/versions/<versionId>/video.mp4`，否则主进程轮询恢复后可能走默认落盘路径，导致不同版本源身份不稳定。
- `mediaPollFulfillers` 之前没有把 task extra 里的目标路径传给 `persistMediaAsset`；这会让 async ITV 持久化无法使用业务指定的版本路径。

## 2026-05-10 Storyboard Batch Media Persistence

- 用户反馈：分镜批量出图 / 批量生成视频没有逐个落盘，一个失败后前面成功的结果也会丢。
- 排查：`Storyboard.handleBatchGenerate` / `handleBatchReGenerateImages` 在 `batchGenerateShotImages()` 整批返回后才一次性 `setShots`；如果父任务失败或用旧 `shots` 覆盖存储，成功项 UI/落盘都不可靠。
- 排查：`Storyboard.handleBatchRenderVideos` / `handleBatchReGenerateVideos` 在 `batchRenderShots()` 整批返回后才 `refreshShotsFromStore()`；中途成功的视频不会马上刷新。
- 排查：`batchRenderShots()` 顺序执行但没有外层 try/catch；`shotRenderWorkflow()` 大多会返回失败结果，但若其自身抛出未捕获异常会中断整批。
- 实施方向：批量图片服务增加单项完成回调并在每个任务内 catch；批量视频 workflow 增加单项完成回调与失败隔离；Storyboard 通过单项回调逐个 `refreshShotsFromStore()`，成功一条显示/保存一条。

- 实施结果：批量图片和批量视频现在都以单项完成回调驱动 UI 刷新；成功项在服务层已有媒体绑定落盘后会立即从项目存储重拉，不再等整批结束，也不再用旧 `shots` 合并覆盖最新媒体列表。
- 失败隔离：图片批量每个 `shotImageWorkflow` 独立 catch；视频批量每个 `shotRenderWorkflow` 外层 catch。一个分镜失败会计入失败结果，但后续分镜继续执行。

## 2026-05-10 Storyboard Prompt Template Production Board Upgrade

- 用户反馈：当前故事板生成不统一，缺少稳定的场景设计区、俯视镜头调度图、8镜头分镜故事区、灯光/情绪/声音/摄影/色彩方案等制作板模块。
- 排查：现有 `storyboard_shot_prompt_generation` 已强调“不固定 2x2”和制作笔记，但版式仍偏自由选择，没有把电影前期制作板作为默认骨架，也没有强制 8 镜头故事区与声音/摄影说明进入输出字段。
- 方向：把默认模板升级为“电影级制作板骨架优先”，保留非 2x2/非均匀网格能力，但强制大多数分镜包含场景设计区、俯视调度图、8镜头故事区、灯光与风格、情绪关键词、声音设计、摄影说明、色彩方案。
- 实施结果：故事板推理模板现在以“电影前期制作板”为默认骨架，不再只是自由选择版式；除非剧情极端适合四段宣传漫画，否则会引导模型生成多区块制作板。
- 关键统一点：强制包含场景设计区、俯视镜头调度图、8镜头分镜故事区、灯光与风格、情绪关键词、声音设计、摄影说明、色彩方案；TTI 终稿模板也同步要求这些区域进入最终图片结构。

## 2026-05-10 Storyboard Template Flexible Production Poster

- 用户反馈：上一版故事板模板过于机械，尤其固定 8 镜头/固定组成；需要参考电影分镜信息图海报风格，保留项目标题、角色设计、场景设计、俯视调度、分镜故事、灯光、情绪、声音、摄影、色彩等区块，但镜头数量和版式应由剧情决定。
- 方向：从“固定 8 镜头制作板”改为“剧情驱动的专业影视前期制作设定板”：用 X 个镜头 / X 个角色 / 1 个场景这类约束描述，而不是硬编码 8；TTI 终稿模板也改成 story-driven shot count。
- 实施结果：故事板模板已经从“固定 8 镜头制作板”改为“剧情驱动 N 镜头的信息图海报”。模块仍稳定，但镜头数、角色区、调度区和故事区的比例由剧情内容决定，避免机械拼表。

## 2026-05-10 Storyboard Project Title Metadata
- `storyboard_shot_prompt_generation` currently contains a textual 【项目标题】 requirement but has no runtime variables for project name/type/duration/constraints.
- `Shot.duration` is available on every shot and should be the source of storyboard duration, not project/script duration.
- Project type is `ProjectMeta.genre`; `ShotPromptService` currently imports only scenes/props/update/episode shots from `projectStore`, so storyboard prompt generation must load project meta or receive it through context.
- Implemented: project title header variables are now runtime data, not inferred prose. `projectType` comes from `ProjectMeta.genre`; `shotDurationSeconds` comes from `Shot.duration`.
- Fallback behavior: if project metadata cannot be loaded, the storyboard title falls back to the first script line/current shot and type becomes “未指定类型”; duration still comes from the shot when valid.

## 2026-05-10 Storyboard Anchor Highlight In Prompt Editors
- `MENTION_REGEX` / `parseMentions` already support `@storyboard_anchor` and `@previous_storyboard_anchor`.
- `ShotCard` passes the same `promptMentionItems` into both image and video `ScriptEditor`, so a fix there affects both prompt editors.
- Current `mentionTheme` styles `char/prop/scene/shot/grid`, but lacks explicit `.mention-storyboard` and `.mention-previous_storyboard`; storyboard anchors therefore do not stand out.
- `ShotCard` only adds current storyboard anchor mention when there is a selected current image. For prompt authoring in storyboard mode, adding a disabled/explanatory current storyboard item makes autocomplete/tooltip clearer even before first generation.

## 2026-05-10 Prompt Editor Snapshot Consistency
- `handleImagePromptChange` / `handleVideoPromptChange` update local state and queue `saveEpisodeShots`; if the user clicks generate immediately, persistence may still be queued.
- `generateShotImage()` reloads the shot from `loadEpisodeShots`, so it can use stale DB data instead of the text currently visible in the editor.
- `shotRenderWorkflow()` receives a `shot` object from React state, but click handlers can still close over a slightly stale `shots` array; a `shotsRef` should be the source of truth for immediate actions.
- `shotRenderWorkflow` always runs `ensureExplicitDialogueInVideoPrompt(sanitizeVideoPromptResult(videoPrompt), shot.dialogue, ...)`. If the user already wrote a non-empty `对白提示词`, old `shot.dialogue` gets appended and may be rewritten, producing repeated/incorrect character lines.
- Empty `videoPrompt` currently resolves `itv_shot_video` default prompt and sends it, which explains “没有视频提示词也能发送出去”。
- `sanitizeNarrativeDialogueLeakage()` 还有一个隐藏问题：它按分号拆 `对白提示词` 后，会把包含“自称天道 / 帮我”的显式 `叶赎 台词：...` 片段误判为旁白泄漏并删除。需要保留带 `台词：` 的手写台词，只清理明显以旁白转述开头的片段。
- 修复后，用户看见的提示词会作为唯一来源；发送前仍会把合法 mention 编译为 provider 协议 `@Image N`，所以 `@storyboard_anchor -> @Image 1` 是预期的协议转换，不是内容被改写。
- 图片生成也存在同类隐式兜底：`shotImageWorkflow()` 在 `imagePrompt` 为空时会套 `tti_shot_image` 默认模板。为保证“输入框即发送源”，空图片提示词现在也会被拒绝。
- 批量图片/视频生成如果紧跟编辑触发，也需要使用当前内存 `shotsRef` 快照并等待保存队列 flush；否则批量链路仍可能从旧 DB 或旧闭包取 prompt。

## 2026-05-12 Director3D Model Refinement And Open Model Catalog

- 当前 3D 导演工作台不走 GLTF / SkinnedMesh 资产链路，人物主要由 `Director3DMannequin.tsx`、`Director3DLiteMannequin.tsx`、`Director3DFormation.tsx` 的 procedural mesh 组成，骨骼是 group 层级和 `director3dRig.ts` 的欧拉旋转。
- 主角模型已有头、鼻尖、躯干、四肢和脚，但缺少眼睛、嘴、耳朵、胸前/背部方向标、关节可视化、手指/拇指等细节，正背面区分弱。
- 群演和方阵更简化，尤其方阵成员只有锥形躯干、头、腿；成员朝向主要靠整体旋转，单体正面不明显。
- 开源来源策略：不能把“所有网上开源模型”无差别打包进项目；应先接入带来源 URL / license / 用途说明的目录，再对许可证明确、体积可控、风格合适的模型做后续 GLB 导入。
- 适合进入目录的来源：
  - Kenney Blocky Characters：Kenney 官方资产，CC0，适合低多边角色模型参考/后续导入。
  - MakeHuman generated exports：官方授权说明中导出的角色模型可作为 CC0 / 公有领域方向使用，适合人体比例与面部/服装参考。
  - Poly Haven Models：官方标注 CC0，适合场景道具和环境模型来源。
  - Khronos glTF Sample Assets：适合作为 glTF / rig / animation 格式参考，但每个样例模型有独立 license，不能统一按一个许可证处理。
  - Three.js SkeletonHelper：适合作为骨骼可视化画法参考，骨骼线段用 helper 思路表现，不是模型资产来源。

## 2026-05-12 Director3D Procedural Detail Pass

- 用户确认不用额外引入资源，要求外部模型库先隐藏，继续细化 procedural 的动物、道具、人物。
- 当前 `Director3DCreatureMesh.tsx` 的四足动物通用模型可用，但物种差异主要靠比例/颜色/鬃毛/角，缺少老虎条纹、狼/狐耳、熊厚掌、马鬃尾、鹿斑、麒麟鳞片、鸟类羽片/爪、凤凰尾羽、龙鳞/胡须/爪等辨识细节。
- 当前 `Director3DProp.tsx` 根据 actor.type 只画 box/cylinder/plane/camera/arrow，具体“桌/椅/床/柜/车/树/岩石/麦克风”等语义只存在 label/promptHint 中，视口里还不够像具体物件。
- 最稳妥方案：不扩展 actor schema，直接在渲染组件里根据 `actor.label` 的中文/英文语义或 type 分支决定附加小几何；这样旧场景兼容，导出和拖拽逻辑不用变。
- 继续根据用户反馈复盘：上一轮细节仍是“贴上去”的，四足动物腿根 Y 坐标可能导致脚穿地/身头漂移，根因是没有按“脚底→腿→肩胯→躯干→颈→头”的骨架链重算；需要把四足、飞禽、龙形分别重排骨架层级。
- 参考开源思路：
  - `threejs-procedural-animal` 是 MIT 的 procedural animal 实验，核心思想是 rigged animal mesh / bone-ready，而不是随便堆几何。
  - Three Low Poly 项目强调 parametric modeling / prefabricated low-poly objects，适合用参数化体块重画道具。
  - Three.js Blocks 的 BirdGeometry 用“body + left wing + right wing”的最小结构读出鸟形，可作为飞禽低模结构参考。
- 本轮二次细化发现，道具里最容易显得“形状不对”的不是缺少颜色，而是旋转平面和结构方向：自行车轮圈要留在 X/Y 侧视平面、汽车轮轴要沿 X 轴、圆桶箍要水平绕 Y 轴；这些比单纯加贴片更影响可读性。
- 对动物同理，四足动物需要按物种分“肉掌/蹄/鹿角/胡须/狮尾/飞羽”等结构分支；否则即使头身对齐，也会像统一低模生物换色。
- 继续检查发现导出链路是独立 vanilla three.js 构建器，不能只改 R3F 视口组件；否则工作台显示已细化，但导出的线稿参考图、时间轴首帧和下游图片/视频参考仍然是旧占位几何。
- 因此结构化模型需要同时覆盖 `Director3DProp` / `Director3DCreatureMesh` 和 `director3dExportGeometry`，并用导出几何测试防止 CaptureRenderer 回退。

## 2026-05-13 Director3D Entity Combinations + Direct Transform

- 现有 `LinghuiDirector3DActor.position` 已经是 `[x,y,z]`，其中 Y 是高度；用户说“没有 z 轴高度”本质是 UI 没有显式把 Y 作为高度控制暴露出来，视口拖拽也只在水平 X/Z 平面移动。
- 当前 `ActorDragLayer` 已在 R3F Canvas 内用 live camera 做 ray-plane 求交。它把 `planeY = actor.position[1]` 固定住，所以拖拽物体本体只改变 X/Z 且保持高度，这是正确基础；新增高度和旋转应作为单独 gizmo 模式，不破坏本体拖拽。
- 组合实体最小风险方案是给 actor 增加 `groupId/groupRole/groupLabel` 元数据，仍然保存绝对坐标；移动/旋转时在编辑器层对同组 actors 应用 delta。这样不需要 nested parent transform，离屏导出和 timeline 插值基本不被重构。
- `sit` rig 当前 hip/knee 都是强负角，视觉上容易腿向后折；骑马还需要单独 `ride` rig，髋部外展、膝盖弯曲、躯干微前倾，不能复用普通坐姿。

- 实现后确认：人骑马组合不需要 nested transform；使用 group 元数据能让编辑器做组合联动，同时保留导出 / timeline 对 actor 世界坐标的既有假设。
- 旋转 pivot 应优先用 groupRole=`mount` 的坐骑位置，而不是选中骑手自身位置；否则选中骑手旋转时马会绕人转，物理关系不对。
- 视口高度操控应保持和现有拖拽一样只在 pointerup 提交，pointermove 只更新 R3F 局部 preview，避免每帧 updateNodeData 造成全局重渲染。

## 2026-05-18 LibTV VideoStoryNode Findings

- LibTV `video-story` 在 `template_/libtv/15gvxu-nayl4w.js` 中由 `r_.displayName="VideoStoryNode"` 导出，并在 `nodeTypes` 里注册为 `"video-story"`。
- 节点默认标题回退为 `视频故事`，默认尺寸读取 `nodeWidth || 800`、`nodeHeight || 400`。
- 数据模型不是固定四列，而是 `rows` + 可选 `shotColumns`：先从 rows 的 key 动态收集列，再用 `shotColumns[].field/label` 映射列名。
- 图片列判断逻辑是：某列任一值是 http 图片 URL 且后缀匹配 `jpg/jpeg/png/gif/webp/bmp/svg`，该列按 90px 缩略图列渲染；`visual_description/content/focal_depth/lighting` 等文本列更宽。
- 空数据状态直接显示 `暂无数据`；有数据时标题栏显示全屏按钮，全屏中复用同一张表。
- 文本单元格是可选择、可滚动、保留换行的内容块，双击会选中当前单元格文本。

## 2026-05-18 LibTV GroupNode Findings

- LibTV `group` 节点有独立悬浮 `GroupNodeToolbar`，不是只靠右键菜单。工具条包含颜色 swatch、布局菜单、整组执行、添加/更新工具箱、转分镜组、解组、下载等入口。
- 颜色 palette 固定为 `null/#FF3B30/#FF9500/#FFCC00/#34C759/#30D5C8/#007AFF/#5856D6/#FF2D95/#8E8E93`，弹层是紧凑网格。
- 布局菜单真实包含 `宫格排列 / 水平排列 / 垂直排列` 三项，触发 group 内节点重排。
- LibTV 自动命名逻辑 `buildGroupCountUpdate` 只在 label 为空或当前 label 已是默认计数名时更新：普通组 `分组 N 个节点`，分镜组 `分镜组 N 个节点`；用户自定义名不覆盖。
- 分镜图片组额外数据包括 `standaloneStoryboardImageGrid`、`storyboardGroupType:"image"`、`sourceScriptNodeId`、`childNodeIds`、`storyboardManualGridCols/Rows`、`showStoryboardShotNumbers`，后续拼接和生成视频组会依赖这些字段。

## 2026-05-18 LibTV VideoNode Tool Findings

- LibTV 视频节点资源态工具条包含 `剪辑 / 高清 / 解析 / 智能去字幕 / 音频分离`，资源视频不能因为是 import/pass-through 就隐藏工具面板。
- LibTV chunk `template_/libtv/03q.v7x2zzn0-.js` 中有 `AVEditor` 类，字段包括 `_frameCount`、`_frames`、`_extractFramesViaWorker()` 和 `encode(startTime,endTime)`，说明视频节点工具不仅是 prompt preset，还包含前端抽帧/剪辑能力。
- 灵绘对齐策略：
  - `截图` 作为 LibTV `AVEditor` 抽帧能力的本地落点：首帧 / 中帧 / 尾帧 / 首中尾抽取后派生 `linghui/image` 节点。
  - `剪辑` 作为 LibTV `encode(start,end)` 的本地落点：使用 Electron FFmpeg `trimVideo` 裁出本地片段，再派生 `linghui/video` 节点。
  - `高清` 不再保留提示词 preset 假入口，改为 Electron FFmpeg `upscaleVideo` 的 2x / 4x 本地视频放大，再派生 `linghui/video` 节点。
  - `解析` 在没有视频理解云服务前，不能伪装成真实内容识别；当前落点是基于视频源、时长、上游参考和用户提示词派生 `linghui/text` 解析草稿节点，供用户继续编辑。
  - `音频分离` 继续复用已有 FFmpeg splitAudio 链路。
  - `智能去字幕` 仍缺本地 AI/云端服务，不应伪装成已接入的成功操作；后续要么接真实后端，要么从可执行入口中降级展示。

## 2026-05-18 ScriptAggregatedGenerator Deep Dive

- LibTV `ScriptNode` 在 `template_/libtv/15gvxu-nayl4w.js` 中的结构确认：节点本体内部渲染 table/card；只有 `showSelection` 且存在选中行时，才在节点下方 `top: calc(100% + 8px)` 挂 `ScriptAggregatedGenerator`。
- `ScriptAggregatedGenerator` 不是编辑器外置面板，而是节点内选中行的紧凑浮动生成器；内容包含关闭按钮、模型选择、参数菜单、镜头/相机控制、已选 N/总数和提交按钮。积分计算存在于 LibTV，但灵绘无积分体系，不能迁入。
- LibTV 批量生成会按选中行过滤 rows，读取 `imageGenerationPrompt || plotDescription` 作为生图 prompt；同时把 `characters[].characterImageUrl` 作为 image2image 参考图并创建分镜图 group。
- LibTV 表格行字段还包含 `hiddenUuid/shotNumber/characters/videoReference`。灵绘此前只保留了主要文案字段，后续如果不承接这些字段，角色图和视频参考图会在解析后丢失。
- 本轮落地方向：灵绘 `ScriptNode` 选中分镜后显示节点底部紧凑生成器，生成器触发真实的 `onGenerateScriptImages / onGenerateScriptVideos`；解析器和表格先保留/展示角色与视频参考图，不迁入 LibTV 积分 UI。

## 2026-05-18 Script / Storyboard Fullscreen Table Follow-up

- LibTV `ScriptNode` 全屏表格与节点内表格共用行数据，但全屏中仍保留 selected rows 和 `ScriptAggregatedGenerator` 的生成语义；表头主要负责视图/列过滤等，不把生成按钮长期堆在表头。
- LibTV 表格文本单元格在非只读时是可编辑 cell：`editableTextCells: !readonly`，字段包括 `durationSeconds/plotDescription/shotSize/characterAction/emotion/sceneTags/lightingAndAtmosphere/audioEffects/dialogue/imageGenerationPrompt/videoMotionPrompt`。
- 灵绘当前可安全落地的编辑范围是 `ScriptNodeEditor` 的 `manual` 模式，因为它的 source of truth 是 `properties.content`。LLM/storyboard 运行结果应保持只读，避免编辑 transient run result 而不持久化。
- 本轮把编辑器分镜操作从表头按钮区移成选中后底部 toolbar，和节点内 `ScriptAggregatedGenerator` 的出现条件保持一致；表头只保留视图切换、全选和全屏。

## 2026-05-18 Image Crop / Remove-bg Tool Fidelity

- LibTV 的 `抠图` 入口是云端能力，打包代码里能看到 `removeBackgroundInference` API；灵绘当前本地没有等价透明抠图模型或分割模型，因此不能把按钮包装成“本地一键抠图成功”。
- 灵绘已具备真实本地图片裁剪链路：`ImageNodeEditorGenericPanel -> onExecuteImageCrop -> useLinghuiCanvasImageToolExecutions.executeImageCrop -> ffmpegManager.cropImage -> Electron FFmpeg cropImage`。
- 本轮选择把裁剪继续补实：增加 3×3 裁剪锚点，并把锚点传给 Electron FFmpeg crop expression，支持保留左/右/上/下重点区域，而不是永远中心裁剪。
- `抠图` / `擦除` 面板保留可执行图生图派生任务，但明确提示当前不是本地透明抠图/本地修复模型，避免继续形成“样子货”误导。

## 2026-05-18 Canvas Interaction Fidelity

- 现有画布已经有 LibTV 风格 `resolveQuickCreateFromConnectEnd()`：连线拖到空白处松开时打开 quick-create，且不再依赖 `.react-flow__pane` target。
- `canvas-interacting` 之前只覆盖节点拖拽和框选拖拽；连线拖拽时节点 glow / generating / skeleton 动画仍可能继续跑，和 LibTV 拖拽中压低节点动画的体验不一致。
- `Esc` 取消连线已在热键层优先消费，但取消路径只清 pending connection；如果连线拖拽也进入 interacting 状态，取消路径必须同步退出 interacting。
- jsdom 没有 `PointerEvent`，取消连线合成 `pointerup` 需要 `window.PointerEvent ?? window.MouseEvent` fallback；Electron Chromium 仍会走 PointerEvent。

## 2026-05-18 LibTV AudioNode Findings

- LibTV `AudioNode` 在 `template_/libtv/0wanf5895ewvy.js` 中，资源态不是简单原生 `<audio>` 下挂，而是 `AudioPlayer` + `AudioNodeToolbar`。
- 资源态工具条包含速度切换，播放速率固定轮转 `1 / 1.5 / 2`；另有下载入口。灵绘无 LibTV 水印/VIP 下载概念，因此只迁入普通本地/URL 下载。
- LibTV 音频资源态主体有波形条背景，生成中也复用波形视觉；空生成态只显示 `音频生视频`，待上游态为空内容但保留上传浮条。
- 灵绘已有 `音频生视频` 和上传浮条逻辑，本轮可聚焦资源态播放器视觉与工具条，不引入 LibTV 的云端审核、CDN 上传、积分或水印逻辑。

## 2026-05-19 LibTV Canvas Agent Findings

- LibTV 中 `CanvasAgent` 是独立会话/流式运行能力（见 `CHAT_CANVAS_AGENT_ID = "canvasAgent"`、`ProxiedCopilotRuntimeAgent`、WebSocket session/run/abort 逻辑），不是静态说明卡。
- 灵绘已有 `linghui/agent` 执行器、模型选择、工具白名单和 preset 编辑器，但节点本体仍只是静态 AI 缩略图；常用的任务模板与运行入口都需要展开编辑器。
- 对齐方向不是伪造 LibTV WebSocket 会话，而是把灵绘已有 Agent 能力前移到节点本体：节点内显示紧凑任务模板、工具/迭代摘要、运行按钮和流式输出摘要。
- 任务模板应复用 `LINGHUI_AGENT_PROMPT_PRESETS`，运行仍走已有 `onRunNode`，不迁入 LibTV 登录、在线项目会话、积分或云端工具注册逻辑。

## 2026-08-07 P3 Storyboard Consistency Preflight Findings

- 现有镜头资产投影已经能按 `productionAsset.id → sourceShotIds → 名称回退` 得到稳定关系，因此预检不需要再次请求模型或复制一套实体识别逻辑。
- 新增 `auditLinghuiProductionConsistency(shots, assets)`：缺失资产、草稿资产按 `error`，已确认但没有 `referenceImage` 按 `warning`；同一资产在多个镜头中只生成一条问题，并保留 `shotIds / shotLabels`。
- 预检只审计镜头实际引用的资产，不会把未被镜头使用的手工资产误报成风险。
- 分镜阶段的制作台显示“缺少角色/场景/道具资产”“资产未确认”“缺少参考图”，每行展示受影响镜头；已有 `assetId` 的问题可直接调用原有 `handleOpenProductionAsset` 跳回资产阶段并聚焦卡片。
- 缺失实体使用“提取缺失资产”重新走现有 `extractLinghuiProductionAssets`，再切换资产阶段；没有 `productionAssets` 的旧工作区只显示“先从镜头提取一次”的单条提示，避免满屏缺失误报。
- Electron 9333 真实验证数据为 2 个镜头：阿澈（草稿）、雨夜车站（已批准但无参考图）、半枚硬币（缺失）。制作台正确显示 2 项影响一致性和 1 条参考图警告；点击“打开资产”聚焦阿澈，点击“提取缺失资产”补出道具资产并停留在资产阶段。
- 本轮临时工作区 `dac316c77fd3` 已按精确 ID 删除；原项目 `模拟器UIUX设计`、`未命名灵绘`、`创意酒瓶设计` 保持不变。

## 2026-08-07 P4 Selective Shot Refresh Audit

- Script/Storyboard editor 已有唯一的 `selectedShotIds` 状态；分镜卡片、表格和底部的 `生成分镜图 / 生成视频流程` 都从该状态过滤 `selectedShots`，因此选择性刷新不需要改执行器协议。
- 当前选中态在有镜头时默认全选，并由 `handleToggleShot` 维护；P4 已补齐制作台到该选择状态的回写入口。
- 最小闭环是给 `ScriptProductionWorkbench` 增加可选的 `onSelectShots(shotIds)`，一致性问题行增加“选中受影响镜头”，将问题的 `shotIds` 传回 editor；生成按钮仍留在镜头视图底部，避免复制一套生成执行入口。
- 选择动作应保留问题的资产处理按钮：用户可先选镜头，再处理资产，或先处理资产后继续使用已选范围；不能把“选中”误解成已执行生成。

## 2026-08-07 P4 Selective Shot Refresh Implementation

- `ScriptProductionWorkbench` 现在把问题对象的 `shotIds` 作为选择范围入口；按钮使用 `选中 N 个受影响镜头` / `已选中 N 个镜头` 文案，并在制作台头部显示 `已选 N/总数 个镜头`。
- `ScriptNodeEditor` 和 `StoryboardNodeEditor` 的回写 handler 会先以当前 `previewState.shots` 过滤、去重并按镜头原顺序重建选择数组，避免一致性审计数据中出现未知 ID 或顺序抖动。
- 生成执行器无需改协议：图片、视频和派生文本入口原本都从 `selectedShotIds` 过滤；本轮只补齐制作台到该状态的连接。
- 组件测试验证：点击一致性问题选择按钮触发 `onSelectShots(['shot-1', 'shot-2'])`；编辑器端将 3 个镜头收敛到受影响的 2 个后，生图和视频回调都只收到所选镜头范围内的镜头。
- Electron 验证使用临时工作区 `P4选择范围验证`（ID `1a0d77233c45`），真实看到 `已选 3/3 → 已选 2/3`、两个受影响卡片勾选和底部生成工具条；验证后已精确删除，未触碰原有工作区。

## 2026-08-07 P5 Reference Version Management Findings

- 现有 `referenceImage` 同时承担制作台预览、图片生成参考和项目资产同步，因此版本模型应在它旁边增量扩展，不能直接把它改成数组破坏旧消费者。
- 兼容策略是把只有 `referenceImage` 的旧资产在读取时投影为稳定 legacy V1；只有发生追加/切换时才把版本数组写回节点数据，不需要批量迁移工作区。
- 采用图片结果必须是“追加且采用”，而不是继续覆盖；相同 source 的结果应复用已有版本，避免重复点击制造无意义候选。
- `currentReferenceImageId` 是版本选择锚点，`referenceImage` 继续镜像当前版本。这样项目资产同步、提示词参考和既有一致性预检都自动读取用户当前选择，不需要复制版本判断。
- 回退语义采用版本创建顺序中的前一个候选，不删除较新版本；用户仍可再次采用较新版本，形成可逆操作。
- 锁定资产不仅应禁止编辑名称/描述，也必须禁止追加、切换和回退参考图，否则“locked”不能作为后续镜头一致性检查的稳定锚点。
- Electron 100% 视觉复核确认：当前版本摘要、回退按钮和 V1/V2 候选在单张资产卡内形成紧凑层级，没有新增独立弹窗或离开制作台的操作。
- 临时工作区 `998ec74ea8e7` 已按精确 ID 删除，原有三个工作区保持不变。

## 2026-08-07 P6 Semantic Consistency Audit Direction

- 下一层一致性不能只比较自由文本是否完全相等；应优先从镜头已有结构字段和明确标签提取有限词表信号，并在证据不足时不报错，控制误报。
- 服装冲突应以“同一角色 + 相邻/连续镜头 + 明确服装描述不同”为基础；允许换装的场景切换需要能被用户忽略或后续标注例外。
- 场景时段冲突应以同一场景资产为聚合键，比较明确的晨/昼/黄昏/夜等时段信号；单纯光线描述不能一律当作时段。
- 关键道具连续性应复用已有镜头资产投影，重点识别同一道具在连续镜头中突然缺失或状态描述冲突，而不是要求每个道具出现在所有镜头。
- 风格检查应先支持项目级或资产级明确风格标签，再检查镜头提示词中的互斥标签；没有显式基准风格时不凭模型猜测“风格不一致”。

## 2026-08-07 P6/P7 Semantic Consistency Implementation Findings

- 四类语义问题已落在同一 `auditLinghuiProductionConsistency()` 问题模型中，问题携带 `type / assetId / shotIds / evidence`，因此现有“打开资产”和“选中受影响镜头”不需要另建执行链路。
- 低误报规则的共同约束是“明确词汇 + 相邻镜头或明确基准”：没有词汇证据就不提示；单纯的氛围形容词不推断时段；同一道具不要求跨所有镜头持续出现；不把不同资产之间的服装/状态差异误当冲突。
- P7 的确认指纹必须包含规范化证据和镜头范围，而不是只用资产 ID；否则用户确认一次后，镜头新增或证据改变会被旧确认错误遮蔽。
- 节点内编辑保存竞态根因是 functional updater 执行前检查 `changed`，以及旧 snapshot 可能先于最新节点状态排队。同步读取 React Flow 节点预判、更新后双 RAF、再直接 `emitSnapshot()` 能确保确认列表等编辑状态实际写入 DB，同时无变化时不产生额外保存。

## 2026-08-07 P8 Asset Alias & Duplicate Candidate Audit Direction

- 现有生产资产的稳定域是 `workspaceId + sourceNodeId + productionAssetId`，项目资产表通过 metadata 保存 `productionAssetKind / productionAssetName / sourceShotIds / sourceNodeId`；因此别名与合并不能只改显示名称，必须保留 canonical/alias 映射。
- 生产资产对象当前已有 `id / kind / name / description / status / referenceImageVersions / sourceShotIds` 等字段；本轮优先复用这些字段并增量增加 `aliases` 或 metadata 映射，避免迁移旧工作区。
- 候选检测应先限制为同一 `kind`，再对名称和显式别名做 Unicode 规范化（大小写、空白、标点、常见称谓后缀）；描述相似只能作为低置信提示，不能自动合并。
- 合并前必须展示两项资产的来源镜头、锁定状态、当前参考图和版本数；锁定项只能作为被保留的 canonical，不能被静默覆盖。
- 旧镜头引用继续通过 alias→canonical 解析，合并后保留旧 ID 的 redirect，便于撤销或打开历史节点；普通图片资产、跨类型同名实体不进入候选。

## 2026-08-08 Project Continuous Production Actions

- 用户已纠正范围：目标是 Koma“项目”模块，不是 Linghui；Linghui 误改保存在 `stash@{0}`，必须保持隔离。
- OpenSpec `add-project-continuous-production-actions` 已通过 strict validate；schema 为 `spec-driven`，初始进度 0/12，apply 状态 ready。
- 现有上一轮已完成项目生产 readiness、项目/资产子视图与分镜尾帧连续性；本轮只在该基础上把缺失素材补全动作前移到项目页，并加显式跳过动作。
- OpenSpec 要求新增共享 `projectAssetGenerationWorkflow`：两个入口复用同一项目风格/比例/模型/参考图与失败隔离语义；新任务按 episode 作用域，兼容旧 project 作用域活动任务。
- readiness 的产品语义是主行动“补齐素材”与次行动“跳过素材，生成分镜”并存；缺图只保留为显式风险，不得成为分镜生成的隐藏硬门槛。
- 任务记录是可恢复进度的权威来源；组件内 starting 状态只覆盖任务创建前的短窗口，任务完成/失败/取消边沿需要刷新资产、readiness 和资产概览。
- 入口路径实际为 `frontend/src/components/asset/AssetManagerPanel.tsx`（不是 `components/assets`）；`ProjectOverview` 当前只投影 `script-analysis` 与 `shot-analysis` episode 任务，需扩展到 `asset-generation`。
- `ProjectOverview` 已有 `loadProductionData()`、`assetOverviewRef` 和两组 `useTaskTransitions`，可作为资产任务完成/失败刷新接入点；当前 `handleReadinessAction` 仅处理剧本就绪、分析和生成分镜。
- `AssetManagerPanel` 当前批量逻辑确实内嵌在组件：按可见列表缺图筛选，父级 `runWithTask`，并发 3、重试 2、参考图 best-effort 远程化、三个统一生成 workflow、进度/成功失败统计，最终重载资产。
- readiness 当前缺图时返回 `open-assets`；需要改为 `generate-assets`，并新增独立 skip action，而不是让一个 `nextAction` 同时承担两种选择。
- 单项生成 workflow 已支持 `disableTask: true`，所以共享批量父任务可继续避免子任务刷屏；成功结果由现有 workflow 的 owner binding 写回资产记录。
- `runWithTask` 会把 `targetType` 写成任务记录的 `targetKind`；因此新父任务可直接使用 `targetType: 'episode'`。任务进度输入单位是 0–100，并由 runner 映射到 0–90，现有内嵌逻辑把 `acc/items.length` 当成百分比，实际进度偏低，抽取时应修为 `acc/items.length` 已按每项 0–100 汇总后的真实百分比。
- 活动任务恢复可直接复用 `useTasks`/`useActiveTask` 的全局 task cache；任务 `payload` 保留 metadata，可用于从完成记录恢复成功/失败统计和兼容识别旧批量任务。
