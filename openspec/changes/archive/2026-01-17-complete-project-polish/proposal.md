# Change: 完成项目管理增强功能的收尾优化

## Why
enhance-project-management 提案已完成主要功能，但仍有 6 个功能性任务未完成：
- 失败任务的重试按钮 UI
- ScriptAnalysisService 的剧集拆分模式
- 角色提取后生成定妆照入口
- ScriptEditor 组件在实际场景中的集成

## What Changes
- 在异步任务失败时显示重试按钮
- ScriptAnalysisService 支持剧集拆分模式
- 角色提取完成后提供生成定妆照的快捷入口
- 在剧本编辑场景集成 ScriptEditor 组件
- 在分镜提示词编辑场景集成 ScriptEditor 组件

## Impact
- Affected specs: ui-components, script-processing
- Affected code:
  - `frontend/src/components/ScriptWorkshop.tsx` - 集成 ScriptEditor
  - `frontend/src/components/ScriptAnalysisWizard.tsx` - 添加定妆照入口
  - `frontend/src/services/ScriptAnalysisService.ts` - 剧集拆分模式
  - `frontend/src/components/TaskNotifications.tsx` - 重试按钮
  - 分镜编辑相关组件
