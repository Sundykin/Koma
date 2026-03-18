# Change: 统一项目风格来源与生成链路

## Why
当前仓库同时存在项目级 `theme/stylePrompt`、全局 `customThemePresets`、遗留 `stylePrompts` 三套风格来源。项目创建、提示词生成、文生图、图生视频、脚本/分镜 LLM 使用的来源不一致，导致风格在进入编辑器后断传，且不同工作流会读取不同的风格配置。

用户希望不考虑历史项目兼容，直接打通“全局预设风格 + 全局自定义风格 + 项目选用全局风格 + 项目自身快照驱动后续所有生成”的完整链路，保证来源统一、链路闭环、结果可复现。

## What Changes
- 将项目风格来源统一为“全局风格目录”：
  - 系统内置风格
  - 用户在全局设置中创建的自定义风格
- 项目创建与项目风格修改仅允许从全局风格目录中选择，不再直接写入项目级自由文本风格。
- 为项目新增不可变的 `styleSnapshot` 概念，项目在选择风格时保存已解析完成的快照。
- 所有后续 LLM、TTI、ITV 工作流统一只读取项目 `styleSnapshot`，不再直接读取全局风格配置或遗留 `settings.stylePrompts`。
- 统一风格注入策略：
  - LLM 类工作流读取 `llmPromptSuffix`
  - TTI/ITV 类工作流读取 `ttiStylePrefix`
  - 已生成的镜头提示词作为已定稿输入时，不在渲染阶段重复追加风格
- 废弃 `settings.stylePrompts` 作为项目生成链路的运行时输入。
- **BREAKING**: 不提供历史项目兼容与迁移逻辑；仅保证新建/修改后的项目走统一模型。

## Impact
- Affected specs:
  - `visual-style-management`
  - `asset-generation`
  - `script-processing`
  - `script-generation`
- Affected code:
  - `frontend/src/components/project/CreateProjectModal.tsx`
  - `frontend/src/components/settings/VisualStyleManager.tsx`
  - `frontend/src/config/themePresets.ts`
  - `frontend/src/types.ts`
  - `frontend/src/components/editor/EditorView.tsx`
  - `frontend/src/components/storyboard/Storyboard.tsx`
  - `frontend/src/components/asset/AssetManager*.tsx`
  - `frontend/src/workflow/*`
  - `frontend/src/services/*`
  - `electron/service/project.ts`
