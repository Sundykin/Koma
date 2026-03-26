# Change: 新增灵绘 AI 画布创作工作台

## Why

Koma Studio 当前核心流程围绕“剧本 → 资产 → 分镜 → 视频”展开，适合短剧生产，但并不适合需要可视化工作流、批量画面生成、多角度参考和分镜编排的创作者。现有分镜页与九宫格增强方案都属于既有短剧工作流的局部扩展，无法承载一个独立的、节点化的 AI 画布创作工具。

用户已经明确提出“灵绘”要作为独立菜单存在，因此这项功能需要在产品层面被定义为一级能力，而不是继续塞进现有分镜或插件页面中。

## What Changes

- 新增一级工作台入口 `灵绘`，与项目管理、AI 对话、设置等并列展示。
- 新增独立的 `LinghuiWorkspace` 工作区模型，不复用现有 `Project / Episode` 结构。
- 定义“灵绘”MVP 的核心能力：
  - 无限画布、缩放/平移、网格吸附、节点框选
  - 节点分组、折叠/展开、整体运行
  - 基础节点：参考图、提示词
  - 生成节点：图生图、图生视频、4 宫格、多角度（预设角度）
  - 分镜节点、分镜组节点
  - typed 连线规则、一对多/多对一分发、局部重跑
  - 结果预览、批量下载、工作区保存/加载/导出
- 将运镜节点、9 宫格、自定义角度、视频拼接、音频合成、模板中心等定义为后续迭代，而非首版阻塞项。

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
