# Change: 新增灵绘 AI 画布创作工作台

## Why

Koma Studio 当前核心流程围绕“剧本 → 资产 → 分镜 → 视频”展开，适合短剧生产，但并不适合需要可视化工作流、批量画面生成、多角度参考和分镜编排的创作者。现有分镜页与九宫格增强方案都属于既有短剧工作流的局部扩展，无法承载一个独立的、节点化的 AI 画布创作工具。

用户已经明确提出“灵绘”要作为独立菜单存在，因此这项功能需要在产品层面被定义为一级能力，而不是继续塞进现有分镜或插件页面中。

## What Changes

- 新增一级工作台入口 `灵绘`，与项目管理、AI 对话、设置等并列展示。
- 新增独立的 `LinghuiWorkspace` 工作区模型，不复用现有 `Project / Episode` 结构。
- 重定义“灵绘”的交互模型为“画布优先”而非固定四区壳层：
  - 顶部最小工具栏
  - 中部无限画布
  - 右键菜单、双击空白创建、文件拖入
  - 小地图、缩放比例和运行状态轻量浮层
  - 添加 / 工作流 / 资产 / 历史 / 教程抽屉
- 重定义“灵绘”的节点体系为 5 类基础节点：
  - 文本节点
  - 图片节点
  - 视频节点
  - 音频节点
  - 脚本节点
- 为节点补齐完整能力包：
  - 节点类型能力：输入方式、输出类型、节点语义
  - 节点操作能力：复制、粘贴、副本、删除、重命名、创建资产、运行当前节点
  - 节点工具能力：图片工具条、视频工具条、Slash 快捷动作、沉浸式工具面板
- 将当前分组升级为“工作流块”：
  - 框选创建
  - 工作流模板保存
  - 再次发送到画布
  - 整组执行
- 扩展工作流编排与结果复用：
  - typed 连线规则
  - 多模态输入聚合
  - 历史结果再次发送到画布
  - 局部重跑、失败定位和执行反馈
- 将运镜高级控制、完整视频时间轴、社区发布和多人协作定义为后续迭代，而非首版阻塞项。

## Impact

- Affected specs:
  - `ui-layout`
  - `storage`
  - `linghui-studio` (new)
- Affected code:
  - `frontend/src/App.tsx`
  - `frontend/src/components/common/Sidebar.tsx`
  - 新增 `frontend/src/components/linghui/` 或等价模块目录
  - 新增 `frontend/src/store/linghui*` / `frontend/src/services/linghui*` / `frontend/src/types/linghui*`
  - 重构 `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - 重构 `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - 重构 `frontend/src/types/linghui.ts`
