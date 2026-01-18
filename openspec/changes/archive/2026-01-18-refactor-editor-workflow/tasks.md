# Tasks: 编辑器工作流重构

## Phase 1: 剧本创作页精简

- [x] 1.1 删除 `ScriptToolbar` 组件（App.tsx 中的辅助组件）
- [x] 1.2 调整剧本编辑器容器样式，填满左侧空间
- [x] 1.3 移除编辑器外层多余装饰

## Phase 2: 步骤条重构

- [x] 2.1 减小步骤条高度（py-8 → py-3）
- [x] 2.2 缩小步骤图标（w-14 h-14 → w-8 h-8）
- [x] 2.3 移除副标题（英文 subLabel）
- [x] 2.4 移除底部光晕装饰
- [x] 2.5 添加 `actionButton` 插槽 prop
- [x] 2.6 App.tsx 中为每个步骤配置操作按钮

## Phase 3: 分镜流程解耦

- [x] 3.1 修改 `shot_breakdown` 模板，移除 description 字段输出
- [x] 3.2 修改 `ShotAnalysisService.ts`，分镜拆解不生成提示词
- [x] 3.3 Shot 类型 description 改为可选字段

## Phase 4: 提示词生成服务

- [x] 4.1 新增 `shot_prompt_generation` 模板到 promptTemplates.ts
- [x] 4.2 定义运镜关键字列表 CAMERA_OPTIONS
- [x] 4.3 定义景别关键字列表 SHOT_TYPE_OPTIONS
- [x] 4.4 新建 `ShotPromptService.ts`
  - [x] 4.4.1 实现 `generateShotPrompt` 单条生成
  - [x] 4.4.2 实现 `batchGenerateShotPrompts` 批量生成
  - [x] 4.4.3 角色引用注入逻辑（@sora2CharacterId）
  - [x] 4.4.4 运镜/景别关键字注入
- [ ] 4.5 测试单条提示词生成
- [ ] 4.6 测试批量提示词生成

## Phase 5: 提示词关键字高亮

- [x] 5.1 新建 `keywordHighlightPlugin.ts` 装饰器
- [x] 5.2 实现运镜关键字高亮（紫色）
- [x] 5.3 实现景别关键字高亮（蓝色）
- [x] 5.4 集成到 ScriptEditor
- [ ] 5.5 测试关键字正确高亮

## Phase 6: 分镜列表编辑器

- [x] 6.1 新建 `ShotListEditor.tsx` 组件
- [x] 6.2 实现顶部工具栏
  - [x] 6.2.1 批量生成提示词按钮
  - [x] 6.2.2 批量生成图片按钮
  - [x] 6.2.3 批量生成视频按钮
  - [x] 6.2.4 进度统计显示
- [x] 6.3 实现列表表头布局
- [x] 6.4 实现 `ShotRow` 单行组件
  - [x] 6.4.1 剧本文案显示（只读）
  - [x] 6.4.2 提示词编辑器（ScriptEditor inline）
  - [x] 6.4.3 AI生成提示词按钮
  - [x] 6.4.4 参考图显示（简化版）
  - [x] 6.4.5 视频版本显示（简化版）
- [x] 6.5 实现行内编辑保存逻辑
- [x] 6.6 新建 `ShotListEditor.css` 样式

## Phase 7: 参考图选择器

- [x] 7.1 新建 `ReferenceImagePicker.tsx` 组件
- [x] 7.2 实现资产下拉选择（角色、场景、道具）
- [x] 7.3 实现本地上传功能
- [x] 7.4 实现拖拽上传
- [x] 7.5 缩略图预览显示

## Phase 8: 视频版本管理

- [x] 8.1 扩展 Shot 类型，添加 `videoVersions` 字段
- [x] 8.2 修改 `saveShotVersion` 支持多版本
- [x] 8.3 实现 `VideoVersionList` 组件
- [x] 8.4 版本选择和预览功能
- [x] 8.5 生成新版本按钮

## Phase 9: 整合与清理

- [x] 9.1 Storyboard.tsx 替换为 ShotListEditor
- [x] 9.2 删除 ShotCard 组件
- [x] 9.3 删除 DirectorPanel 组件
- [x] 9.4 更新 Storyboard.css
- [x] 9.5 编译验证
- [ ] 9.6 功能测试

## Dependencies

- Phase 3-4 可与 Phase 1-2 并行
- Phase 5 可与 Phase 3-4 并行
- Phase 6 依赖 Phase 4（提示词服务）和 Phase 5（关键字高亮）
- Phase 7-8 可与 Phase 6 并行
- Phase 9 依赖所有前置任务
