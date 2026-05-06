# Task Plan

## Session: 2026-05-06 Linghui Tapnow-Base Capability Audit

### Goal
- 审计当前 Koma 灵绘与参考项目 `/Users/sunmeng/workspace/tapnow-base` 的节点画布基础能力差异。
- 在不回滚已有未提交改动的前提下，补齐灵绘缺失或半成品能力，优先完善已出现的 `linghui/panorama` 全景/首尾帧链路。
- 保持现有 Linghui 架构边界：节点定义、编辑器、画布交互、执行器、类型、持久化文档 schema 统一演进。

### Scope
- `frontend/src/types/linghui.ts`
- `frontend/src/components/linghui/library/state/linghuiNodeDefs.ts`
- `frontend/src/components/linghui/nodes/**`
- `frontend/src/components/linghui/editors/components/**`
- `frontend/src/components/linghui/execution/state/**`
- `frontend/src/components/linghui/canvas/hooks/**`
- `electron/service/linghui/document.ts`
- 必要测试与文档记录

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Reference Audit | complete | 对照 tapnow-base 的基础节点、生成链路、媒体栈与导入导出能力，整理 Koma 差距 |
| 2. Current Diff Review | complete | 审查当前未提交灵绘改动，判断哪些是半成品、哪些需要接入 |
| 3. Capability Implementation | complete | 补齐缺失能力，优先让新增/半成品节点完成类型、UI、执行和持久化闭环 |
| 4. Validation | complete | 运行针对性测试/构建，必要时浏览器烟测灵绘入口 |

### Acceptance Criteria
- 参考项目的基础节点能力在 Koma 灵绘中有明确映射或记录为有意不做。
- 已存在的 `linghui/panorama` 改动不处于半接入状态：可创建、可编辑、可预览、可执行、可被下游消费、可持久化。
- 执行层对图片输入、首尾帧/全景类输出、提示词与模型参数处理稳定，不静默丢失引用。
- 构建或相关测试通过；如存在既有失败，记录具体边界。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| `npm run check:style-discipline` failed | 1 | 确认为既有项目/分镜/chat/theme 注释与根 token 快照债务；新增 Linghui panorama/Recipe 路径未命中该脚本失败项 |

## Session: 2026-05-06 Linghui Canvas Interaction Audit

### Goal
- 暂时移除不需要的基础工作流模板，避免把灵绘基础能力误导成预设 Recipe。
- 审计并改善灵绘画布基础操作：拖拽、连线锚点、执行入口、执行流反馈动画、失败反馈与执行日志。
- 优先修正“反人类”的高频触点：锚点难拖、运行入口藏太深、失败信息一闪而过、连线执行状态不够清楚。

### Scope
- `frontend/src/components/linghui/canvas/**`
- `frontend/src/components/linghui/page/components/LinghuiPage.tsx`
- `frontend/src/components/linghui/page/styles/**`
- `frontend/src/components/linghui/execution/state/linghuiExecutionWorkflow.ts`
- `frontend/src/components/linghui/library/state/linghuiRecipeTemplates.ts`
- 相关测试与记录文件

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Template Cleanup | complete | 暂时隐藏内置系统 Recipe，不再让工作流模板占据主线入口 |
| 2. Interaction Audit | complete | 定位 HUD、右键菜单、锚点、连线、执行状态和日志的主要摩擦点 |
| 3. First-Pass Fixes | complete | 优化一键运行入口、锚点命中区、连线执行动画、失败日志与连接失败记录 |
| 4. Failure Feedback Pass | complete | 节点本体展示失败原因，HUD 展示最近错误/运行日志并支持点击定位节点，失败执行后自动聚焦首个失败节点 |
| 5. Magnetic Handles | complete | 统一所有输入/输出连接点视觉与命中模型，增大连接吸附范围，并增加线靠近连接点时的磁吸动画 |
| 6. Validation | complete | 跑相关测试、构建和必要的样式纪律边界检查 |
| 7. Video Duration Constraints | complete | 灵绘视频节点按当前 ITV 渠道/模型动态限制时长，grok 走枚举，即梦走范围，并在执行前二次归一 |
| 8. Execution Log Sidebar Panel | complete | 将执行日志从画布 HUD 自动浮层迁移到左侧菜单入口，重做可关闭/可展开收起的日志面板 |
| 9. Duplicate Submission Guard | complete | 执行目标链路中存在仍在轮询/运行中的节点时阻止重复提交 provider，并允许过期 running 状态重新触发 |
| 10. Diagnostics Log Export | complete | 设置页新增前后端日志收集/导出 zip；前端日志经白名单 IPC 追加落盘，日志目录跟随 storageRoot |
| 11. Editor Action Click Guard | complete | 画布节点编辑器的生图、生视频等提交按钮增加即时防双击锁，避免运行态刷新前重复提交 |

### Acceptance Criteria
- 系统 Recipe 暂时不再出现在模板列表，用户保存的工作区模板能力保留。
- 画布 HUD 可直接一键运行全部/选中，不依赖右键菜单探索。
- 连线锚点更容易拖拽，连接预览和执行状态更明显。
- 节点失败、上游阻塞、连接失败都有可回看的日志记录或更具体 toast。
- 执行失败后首个失败节点会被自动选中聚焦，节点卡片上直接露出失败原因。
- 执行日志入口收纳到左侧菜单；日志面板可手动打开、关闭、展开/收起，日志项可点击定位相关节点。
- 目标链路里已有运行中节点时，不会再次提交视频/生图等 provider；过期的异常 running 状态不会永久阻塞用户重新执行。
- 生图、生视频等节点编辑器提交按钮连续双击只会触发一次提交；首击后立刻短暂锁定，随后仍由运行态禁用兜底。
- 设置页可导出诊断日志 zip，包含 renderer/main/Electron 日志和 manifest；storageRoot 变更后日志目录同步切换。
- 所有节点连接点使用同一套视觉/吸附样式；连线进入扩大范围即可吸附到端口，不必像素级碰到圆点。
- 相关测试/构建通过；既有风格脚本失败边界单独记录。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| `npm run check:style-discipline` failed after first edge patch | 1 | `LinghuiEdge` 的 `style={edgeStyle}` 被脚本拦截，已改为 `cssVars(...)`；复跑后新灵绘画布文件不再命中 |
| `npm run check:style-discipline` still fails | 2 | 剩余失败均为既有 project/storyboard/chat/theme/index.scss 债务，本轮不扩大范围 |
| `npm run check:style-discipline` still fails after magnetic handles | 3 | 失败项仍只在既有 project/storyboard/chat/theme/index.scss 路径；新增 `LinghuiNodeHandle`、连接点样式和舞台半径未出现在失败列表中 |
| `npm run check:style-discipline` still fails after video duration pass | 4 | 失败项仍只在既有 project/storyboard/chat/theme/index.scss 注释/颜色/inline style 债务；本轮视频时长文件未出现在失败列表中 |

## Session: 2026-05-03 Theme System Architecture

### Goal
- 在独立 `git worktree` `/Users/sunmeng/workspace/Koma-theme-worktree` 中改造主题架构，避免影响主目录正在进行的其它工作。
- 按 `docs/THEME_SYSTEM_PLAN.md` 与 `docs/THEME_ARCHITECTURE.md` 先落地 M1：Theme token 分层、ThemeProvider、Tailwind 变量转发、设置页暗色双主题切换与持久化。
- 使用团队模式：1 个前端架构师负责只读审查，3 个前端 worker 分别负责主题核心、入口/Tailwind、设置页持久化；主线负责集成与验证。

### Scope
- `frontend/src/theme/**`
- `frontend/src/index.tsx`
- `frontend/src/index.scss`
- `frontend/src/store/settings/**`
- `frontend/src/store/globalStore.ts`
- `frontend/src/types/provider-config.ts`
- `frontend/src/components/settings/**`
- `frontend/src/components/asset/**` 样式入口
- `frontend/src/components/chat/**` 与 `frontend/src/chat/components/**` 样式入口
- `frontend/src/components/storyboard/**` 样式入口
- 必要的 i18n / 文档 / 轻量测试

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Worktree Setup | complete | 从当前 `feat/panel-restore2` HEAD 创建 `codex/theme-system-architecture` 工作树 |
| 2. Architecture Recon | complete | 阅读主题、入口、Tailwind、设置存储、设置页结构，并收集团队建议 |
| 3. Theme Core | complete | 实现 `SemanticTokens`、主题 registry、CSS vars 编译、Antd config、ThemeProvider hooks |
| 4. Entry & CSS Vars | complete | 入口挂 ThemeProvider，`index.css` 改为 `--token-*` 与 Tailwind 转发 |
| 5. Settings UI & Persistence | complete | `AppSettings.uiThemeId` 持久化，设置页增加 UI 主题选择 |
| 6. Integration Validation | complete | 解决冲突，运行构建/测试/grep 自检，记录剩余未完成项 |
| 7. Source CSS to SCSS | complete | 将源代码内自有 `*.css` / `*.module.css` 迁移为 `.scss` / `.module.scss`，并修正迁移文件里的 SCSS/CSS 语法、token/color-mix 消费和 imports |
| 8. Light Business Theme | complete | 新增 `light-business` 主题并接入设置页切换、持久化、Antd defaultAlgorithm，清理 dark-only flag，主题纪律自检已通过 |
| 9. Inline Style Discipline | complete | 普通 inline style 全面迁移为 SCSS/Tailwind/CSS 变量桥接；严格脚本覆盖 `style={{...}}` 与 `style={expr}` |
| 10. High Contrast Theme | complete | 注册 `high-contrast` 主题，和其它预设共享同一 ThemeProvider/Settings 切换链路 |
| 11. Theme Guardrails | complete | 增加 `check:style-discipline`、主题专用 ESLint、Stylelint 和 GitHub Actions workflow |
| 12. Final Validation | complete | `npm run lint:theme`、`npm run build`、普通 CSS 清零 grep、浏览器挂载烟测均通过 |

### Acceptance Criteria
- 默认 `dark-emerald` 视觉与现有 token 值一致。
- `dark-business` 可在设置页选择并即时生效。
- `light-business` 可在设置页选择并即时生效。
- 刷新后主题选择持久化。
- Antd 主题配置由 active theme 生成，入口不再直接持有静态 `antdTheme`。
- Tailwind 语义工具类继续可用，`@theme` 不再持有真实 hex。
- 旧的 `tokens` / `antdTheme` import 尽量保持兼容，降低本轮改造半径。
- 源码目录自有 `*.css` / `*.module.css` 为 0；仅保留第三方 CSS import 白名单。
- 非 CSS 变量桥接的 inline style 为 0；`style={expr}` 也被自检脚本覆盖。
- `darkTheme={true}` / `colorMode="dark"` 字面量为 0。
- `business-hardcoded-colors` 为 0；业务 UI 硬编码颜色是 0 容忍，只保留文档化非 UI 例外。

### Deferred
- 受激活页限制，本轮浏览器烟测确认了应用挂载与根主题变量写入，但未能在真实 UI 中点击设置页完成 4 主题截图矩阵。
- `npm run build` 仍有既有 Vite chunk/dynamic import warnings，以及 Sass 对 `@import "tailwindcss"` 的上游弃用提示；不影响本轮主题目标。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| 全历史 fork agent 不允许指定 agent_type/model/reasoning | 1 | 改为非 fork agent 并显式传入工作目录 |
| 严格 inline 检查暴露 `style={expr}` 漏洞 | 1 | 扩展 `check-style-discipline.ts`，表达式样式仅放行 `cssVars(...)` 产物和精确文档例外 |
| `ScriptEditor` rootClassName 补丁误插到文件末尾 | 1 | 浏览器烟测发现 `className is not defined`，已移回组件作用域并复跑 lint/build/浏览器 |

## Session: 2026-04-04

### Goal
- 系统性优化灵绘所有节点编辑窗口的样式与操作体验。
- 统一编辑壳层、边距、提示区、工具区和表单控件表现。
- 去掉内部重边框与割裂背景，改成更扁平、更贴近画布的编辑体验。
- 处理已明确暴露的问题：
  - 图片节点在没有图片时不展示上方工具菜单，只保留名称重命名。
  - 文生图提示词编辑区与外层容器融合，避免独立边框、独立底色和贴顶。
  - 视频节点弹窗切到极简模式：无视频时隐藏顶部处理菜单，主界面只保留精简模型/参数回显、提示词与动作按钮，详细参数进入二级弹层。
  - 以视频节点一级弹窗为模板，把文本、脚本、Agent、音频、图片等其他节点编辑器也收敛成“主输入 + 摘要控件 + 动作按钮”的极简结构。
  - 将 `LinghuiPage.css` 迁移到 `sass` 并拆分成按模块组织的 partial，降低单文件维护成本。
  - 将核心 Linghui `scss` 从“传统 CSS 平铺写法”继续收敛到 `tokens + mixins + nested selectors`，形成第二层样式规范。

### Scope
- `frontend/src/components/linghui/editors/components/*`
- `frontend/src/components/linghui/page/components/LinghuiPage.tsx`
- `frontend/src/components/linghui/page/styles/*`
- 如有需要，少量调整 `frontend/src/components/linghui/editors/components/LinghuiPromptEditor.tsx`

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Audit & Plan | complete | 审核当前编辑器结构、共用样式类和用户点名问题，形成统一改造路径 |
| 2. Shared Shell Cleanup | complete | 优化 NodeEditor 顶栏、主面板、工具栏、字段区、提示区的共享视觉规范 |
| 3. Targeted Editor Fixes | complete | 修复图片、文生图、文本、音频、视频、脚本、Agent 的结构与易用性问题 |
| 4. Validation | complete | 运行构建并通过页面快照确认图片空态顶栏已收敛 |
| 5. Video Popup Simplification | complete | 将视频节点编辑弹窗收敛为极简主控 + 二级参数弹层，并补齐下载能力与空视频态顶栏收敛 |
| 6. Other Editor Minimalization | complete | 复用视频弹窗交互模型，压缩文本、脚本、Agent、图片、音频编辑器的一级结构，并进一步收掉脚本空态与音频结果预览冗余 |
| 7. Style Preprocessor Split | complete | 将 Linghui 页面样式迁移到 Sass，并按页面骨架、库面板、画布外壳、React Flow、紧凑节点、节点编辑器、媒体面板拆成多个 partial |
| 8. Sass Nested Convergence | complete | 抽离共享 tokens 与 mixins，并将页面骨架、侧栏/库面板、节点编辑器等核心 partial 重写为嵌套式 Sass 结构 |
| 9. Remaining Partial Convergence | complete | 将 `media-panels`、`compact-nodes`、`canvas-overlays`、`canvas-reactflow` 四个剩余 partial 也收敛到同一套嵌套式 Sass 命名空间与共享原语上，并通过生产构建验证 |

### Acceptance Criteria
- 所有节点编辑窗口的外壳与控件密度一致，不再出现重复边框和强分隔线。
- 提示词区域上下左右有合理留白，和外层容器融为一体。
- 图片导入节点无图片时不再显示无意义顶部操作区，只保留名称编辑能力。
- 各编辑器底部操作区、选择器、空态卡片在视觉上更扁平，操作触达更直接。
- 视频节点一级弹窗不再保留输入预览、冗余标题和提示文案；模型与参数改成摘要式交互。
- 视频节点在无当前视频时不展示顶部视频处理工具；有结果时支持直接下载。
- 其他节点编辑器优先保留主输入与动作，次级设置尽量折叠进 `Popover` / `Dropdown`，避免一级界面堆叠工具条与结果区。
- Linghui 页面样式不再依赖单个 5000+ 行大文件，而是通过 Sass 主入口聚合多个功能模块 partial。
- Linghui 核心样式模块不再只是 `.scss` 后缀的平铺 CSS，而是通过 `tokens + mixins + 嵌套命名空间` 组织共享视觉规则。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| `ArrowUp is not defined` 运行时报错 | 1 | 恢复 `ImageNodeEditor.tsx` 中的 `ArrowUp` 导入并重新构建验证 |
| `LinghuiPage.css: Unclosed block` 构建失败 | 1 | 修复新增通用编辑器样式时遗漏的 `}`，重新构建通过 |
