# 发现与决策

## 需求
- 用户要求先规划一个名为“灵绘”的新功能，不做实现。
- “灵绘”必须是一个独立菜单，而不是挂在现有分镜页里的二级能力。
- 需求文档覆盖节点画布、分组、4/9 宫格、多角度生成、分镜组、运镜、资源管理、预览导出等内容。
- 当前优先级是输出一份可落地的 MVP 方案和 OpenSpec 提案。

## 研究发现
- 当前应用一级视图由 `frontend/src/App.tsx` 的 `view` 切换控制，现有内建视图主要是 `projects`、`overview`、`editor`、`chat`、`settings` 与 `plugin:*`。
- 侧边栏入口定义在 `frontend/src/components/common/Sidebar.tsx`，新增一级菜单的最短路径是扩展 `AppView` 联合类型并新增一个懒加载页面。
- 现有“全局插件”也支持独立导航入口，但 `PluginHost` 与 `PluginAPI` 更适合扩展工具或外挂页面，不适合作为首版承载复杂画布、存储、任务调度与媒体生成核心能力。
- 已存在的 `openspec/changes/add-grid-storyboard-mode` 只是在当前分镜工作流中增加九宫格模式，不等价于新的独立“灵绘”工作台。
- 现有存储模型围绕 `Project / Episode` 组织，直接复用会把“灵绘”硬塞进短剧项目流，和“独立菜单”的产品要求冲突。
- `add-linghui-canvas-studio` 变更已创建，并通过 `openspec validate --strict` 校验。

## 技术决策
| 决策 | 理由 |
|------|------|
| `灵绘` 首版定义为内建一级页面，而不是全局插件 | 需要深度集成侧边栏导航、媒体服务、任务队列、存储与导出，插件边界太薄 |
| `灵绘` 使用独立 `LinghuiWorkspace` 存储域 | 避免污染现有 `Project / Episode` 数据模型，并保持入口与心智独立 |
| MVP 先覆盖画布、分组、基础节点、4 宫格、多角度、分镜组、预览导出 | 与用户文档的 MVP 范围一致，同时控制首版复杂度 |
| 运镜节点、9 宫格、自定义角度、视频拼接/音频混流进入后续迭代 | 这些能力跨模型能力差异更大，首版不应阻塞独立菜单落地 |
| 画布底座采用 `@litegraph-ts/core` | MIT 协议、明确基于 HTML5 Canvas，并自带节点、连线、分组和序列化能力，适合二次改造 |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 根目录已有旧 `task_plan.md`，但缺少配套规划日志文件 | 保留旧内容不删，只补充本次任务的附加计划，并新建 `progress.md` / `findings.md` |
| 现有项目中已有分镜九宫格提案，容易与“灵绘”混淆 | 在新提案中明确“灵绘”是独立工作台，不替代现有分镜页 |

## 资源
- `openspec/AGENTS.md`
- `openspec/project.md`
- `openspec/changes/add-grid-storyboard-mode/*`
- `frontend/src/App.tsx`
- `frontend/src/components/common/Sidebar.tsx`
- `frontend/src/components/plugins/PluginHost.tsx`
- `openspec/specs/ui-layout/spec.md`
- `openspec/specs/storage/spec.md`

## 视觉/浏览器发现
- 一级菜单当前使用 72px 宽的图标侧边栏，适合直接新增一个“灵绘”入口。
- `App.tsx` 通过懒加载页面切换主工作区，说明“灵绘”可作为完整工作台页面接入，而不必嵌进编辑器步骤。
- `ChatPage` 已经证明项目支持独立全屏工作台页面模式，这为“灵绘”的左栏/中栏/右栏/底栏布局提供了可参考形态。

---
*每执行2次查看/浏览器/搜索操作后更新此档案*
*防止视觉信息遗失*
