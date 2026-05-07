# Findings

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
