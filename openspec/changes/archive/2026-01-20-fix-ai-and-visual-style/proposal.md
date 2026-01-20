# Proposal: 修复AI剧本生成和视觉风格全局应用

## 概述

本提案解决两个关键问题：
1. **AI随机生成剧本没有真正调用AI** - 现有的"随机生成剧本"功能只打开了一个输入框让用户填写创意，并没有提供一键随机生成的能力
2. **视觉风格控制不统一** - 视觉风格（theme/stylePrompt）虽然存在于项目配置中，但没有在全局设置中提供预设维护功能，且分镜提示词生成、分镜图片/视频生成时可能未正确应用风格前缀

## 问题分析

### 问题1：AI剧本随机生成

**现状**：
- `ScriptWorkshop.tsx` 中的"从创意生成剧本"功能 (`generateModalVisible`) 需要用户手动输入创意、风格、时长
- 没有"一键随机生成"的功能，用户每次都需要手动填写

**期望**：
- 增加"随机生成"按钮，AI自动生成一个创意并基于此生成剧本
- 或者提供预设的创意模板供用户快速选择

### 问题2：视觉风格全局管理

**现状**：
- `themePresets.ts` 定义了固定的主题预设（赛博朋克、古风武侠等）
- 用户只能在创建项目时选择预设主题或输入自定义风格
- 无法在全局设置中管理和自定义这些预设

**期望**：
- 在全局设置中增加"视觉风格预设"管理功能
- 用户可以新增、编辑、删除自定义风格预设
- 每个预设包含：名称、描述、TTI提示词前缀、LLM提示词后缀

### 问题3：视觉风格应用不统一

**现状**：
- 角色定妆照生成 (`characterAssetWorkflow.ts:53`) - ✅ 正确使用 `getThemeStylePrefix(theme, stylePrompt)`
- 场景预览图生成 (`scenePropAssetWorkflow.ts:52`) - ✅ 正确使用
- 道具参考图生成 (`scenePropAssetWorkflow.ts:207`) - ✅ 正确使用
- 分镜提示词生成 (`ShotPromptService.ts:99-103`) - ⚠️ 使用了 `stylePrefix` 参数，但需要确认调用方是否传入
- 分镜图片生成 - ❓ 需要确认是否应用了风格前缀
- 分镜视频生成 - ❓ 需要确认是否应用了风格前缀

**期望**：
- 确保所有TTI/ITV调用都正确使用项目的视觉风格设置
- 分镜提示词生成时自动注入 `stylePrefix`

## 解决方案

### 方案A：AI随机剧本生成

1. 在剧本工作室增加"随机生成"按钮
2. 调用LLM生成随机创意（主题、类型、关键元素）
3. 基于生成的创意自动调用剧本生成流程

**实现要点**：
- 新增 Prompt 模板 `random_idea_generation` 用于生成随机创意
- 在 `ScriptWorkshop.tsx` 添加随机生成按钮
- 在 `scriptGenerator.ts` 添加 `generateRandomScript` 函数

### 方案B：视觉风格全局管理

1. 在 `globalStore.ts` 中新增视觉风格预设的 CRUD 操作
2. 在 `SettingsPage.tsx` 中新增"视觉风格"Tab
3. 允许用户自定义预设，同时保留系统内置预设

**实现要点**：
- 扩展 `AppSettings` 类型，增加 `customThemePresets` 字段
- 修改 `themePresets.ts` 的 `THEME_PRESETS` 获取逻辑，合并内置和自定义预设
- 新增 `VisualStyleManager` 组件

### 方案C：视觉风格统一应用

1. 确认所有生成调用都正确传递 `stylePrefix`
2. 修复 `ShotListEditor` 等组件中缺失的风格参数传递
3. 分镜提示词、图片、视频生成时自动从项目配置读取风格

**实现要点**：
- 审查 `ShotListEditor.tsx` 和 `Storyboard.tsx` 中的生成调用
- 确保 `batchGenerateShotPrompts` 调用时传入正确的 `stylePrefix`
- 分镜图片/视频生成工作流中添加风格前缀应用

## 影响范围

- `frontend/src/store/globalStore.ts` - 新增风格预设管理
- `frontend/src/config/themePresets.ts` - 支持自定义预设
- `frontend/src/types.ts` - 扩展 AppSettings 类型
- `frontend/src/components/SettingsPage.tsx` - 新增视觉风格Tab
- `frontend/src/components/ScriptWorkshop.tsx` - 新增随机生成功能
- `frontend/src/workflow/scriptGenerator.ts` - 新增随机生成函数
- `frontend/src/store/promptTemplates.ts` - 新增随机创意模板
- `frontend/src/components/ShotListEditor.tsx` - 修复风格参数传递
- `frontend/src/components/Storyboard.tsx` - 修复风格参数传递
