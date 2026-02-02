# Tasks: 统一提示词模板与调试日志

## Phase 1: 基础设施

- [x] 1.1 创建 `aiCallLogger.ts` 日志工具，定义 `logAICall()` 函数
- [x] 1.2 在 `promptTemplates.ts` 中增加 TTI 模板类型定义
- [x] 1.3 添加默认 TTI 模板（角色定妆照、场景预览、道具参考、分镜图片）

## Phase 2: 统一角色定妆照生成

- [x] 2.1 检查 `AssetManager.tsx` 中的角色生成调用，替换为 `characterAssetWorkflow`
- [x] 2.2 检查 `ProjectAssetOverview.tsx` 中的角色生成调用（无需修改，仅展示）
- [x] 2.3 在 `AssetGenerationService.ts` 顶部添加 `@deprecated` 注释
- [x] 2.4 验证角色详情弹窗和列表项的生成按钮都使用三视图模板

## Phase 3: 统一风格应用

- [x] 3.1 修改 `ShotGenerationService`，添加 theme/stylePrompt 参数
- [x] 3.2 在 `ShotGenerationService.buildShotPrompt()` 中调用 `getThemeStylePrefix()`
- [x] 3.3 验证所有 TTI 调用都正确应用项目风格

## Phase 4: 集成调试日志

- [x] 4.1 在 `characterAssetWorkflow.generateCostumePhoto()` 中添加日志
- [x] 4.2 在 `characterAssetWorkflow.generateCharacterPreviewVideo()` 中添加日志
- [x] 4.3 在 `scenePropAssetWorkflow.generateSceneImage()` 中添加日志
- [x] 4.4 在 `scenePropAssetWorkflow.generatePropImage()` 中添加日志
- [x] 4.5 在 `shotRenderWorkflow.shotRenderWorkflow()` 中添加日志（TTI + ITV + TTS）
- [x] 4.6 在 `ScriptAnalysisService.callLLM()` 中添加日志
- [x] 4.7 在 TTS 调用点添加日志（已在 shotRenderWorkflow 中）

## Phase 5: 模板配置化

- [x] 5.1 将 workflow 中的硬编码模板替换为从 `promptTemplates` 读取
  - [x] characterAssetWorkflow
  - [x] scenePropAssetWorkflow
  - [x] shotRenderWorkflow
- [x] 5.2 在设置页面添加 TTI 模板编辑 UI（分组显示 LLM/TTI 模板）

## Phase 6: 验证

- [x] 6.1 编译通过
- [ ] 6.2 测试角色定妆照生成（弹窗 + 列表），确认都是三视图
- [ ] 6.3 测试场景/道具生成，确认应用了项目风格
- [ ] 6.4 测试分镜渲染，确认应用了项目风格
- [ ] 6.5 检查控制台日志输出，确认所有 AI 调用都打印了完整提示词
