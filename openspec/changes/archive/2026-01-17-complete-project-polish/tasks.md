# Tasks: 完成项目管理增强功能的收尾优化

## Phase 1: 失败任务重试按钮

- [x] 1.1 在 TaskNotifications 组件中为失败任务添加重试按钮
- [x] 1.2 实现重试回调机制（通过 TaskNotification 的 onRetry 属性）
- [x] 1.3 在异步任务服务中支持任务重试

## Phase 2: ScriptAnalysisService 剧集拆分模式

- [x] 2.1 更新 ScriptAnalysisService 支持剧集拆分模式
- [x] 2.2 添加剧集上下文参数（episodeId, episodeScript）
- [x] 2.3 修改提取逻辑，支持单集或全剧本两种模式

## Phase 3: 角色提取后生成定妆照入口

- [x] 3.1 在 ScriptAnalysisWizard 角色提取完成步骤添加"生成定妆照"按钮
- [x] 3.2 点击后跳转到 CharacterAssetEditor 或打开资产生成向导

## Phase 4: ScriptEditor 组件集成

- [x] 4.1 在剧本编辑场景使用 ScriptEditor（替换现有 textarea）
- [x] 4.2 在分镜提示词编辑场景使用 ScriptEditor
- [x] 4.3 配置合适的语法高亮和编辑器选项

## Checklist

- [x] All tasks completed
- [ ] Manual testing passed
