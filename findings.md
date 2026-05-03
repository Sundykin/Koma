# Findings

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
