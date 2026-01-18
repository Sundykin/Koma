# Proposal: 统一提示词模板与调试日志

## Why

当前存在以下问题：

1. **角色定妆照生成不一致**
   - `CharacterDetailModal` 和 `AssetGenerationWizard` 调用 `characterAssetWorkflow.generateCostumePhoto()`，使用内置三视图模板
   - `AssetGenerationService.generateCharacterImage()` 使用简单的 portrait 提示词，没有三视图规范

2. **提示词模板来源分散**
   - `promptTemplates.ts` 定义了 LLM 用的模板（剧本解析、角色/场景/道具提取）
   - TTI 提示词分散在各个 workflow 文件中硬编码
   - 没有统一的配置入口

3. **项目风格未统一应用**
   - `characterAssetWorkflow` 使用 `getThemeStylePrefix()` 正确应用风格
   - `AssetGenerationService` 完全忽略项目主题/风格配置
   - `ShotGenerationService` 也忽略项目风格
   - 分镜渲染 `shotRenderWorkflow` 正确应用了风格

4. **缺少调试日志**
   - 部分服务有 console.log 输出 prompt（如 `AssetGenerationService`）
   - 但没有统一的日志格式和完整输出
   - ITV/TTS 调用没有打印完整提示词

## What Changes

1. **统一角色定妆照生成**：废弃 `AssetGenerationService`，统一使用 `characterAssetWorkflow`

2. **创建 TTI 提示词模板配置**：在 `promptTemplates.ts` 中增加 TTI 相关模板类型

3. **统一风格应用**：所有 TTI 调用都从项目配置读取 theme/stylePrompt

4. **添加完整调试日志**：创建统一的 AI 调用日志工具，打印完整提示词

## Scope

- `frontend/src/services/AssetGenerationService.ts` - 废弃或重构
- `frontend/src/services/ShotGenerationService.ts` - 增加风格应用
- `frontend/src/workflow/*.ts` - 添加调试日志
- `frontend/src/store/promptTemplates.ts` - 增加 TTI 模板类型
- `frontend/src/store/logger.ts` - 增强日志功能

## Risks

- 修改现有生成逻辑可能影响已有项目的图片风格
- 需要确保向后兼容
