# Task Plan

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
