# 提案：集成未使用的模板并清理冗余

## 概述

在 `refactor-prompt-templates` 提案实施后，发现部分模板未被正确使用。本提案旨在：
1. 在 `shotRenderWorkflow.ts` 中集成 `itv_shot_video` 模板
2. 删除功能重复的 `tti_prompt` 模板

## 背景

当前 `shotRenderWorkflow.ts` 的视频生成步骤使用硬编码的 `buildVideoPrompt` 函数，而非配置化的 `itv_shot_video` 模板。这与提示词模板系统的设计初衷不符。

### 当前代码（第 240 行）

```typescript
// 构建视频生成的 prompt，支持 @sora2CharacterId 引用
const videoPrompt = buildVideoPrompt(shot, characters);
```

### 问题分析

| 模板 | 当前状态 | 问题 |
|------|----------|------|
| `itv_shot_video` | 未使用 | 视频生成使用硬编码函数而非模板 |
| `tti_prompt` | 未使用 | 功能与 `shot_prompt_generation` 重复 |

## 目标

1. 使 `itv_shot_video` 模板在视频生成时被正确使用
2. 删除冗余的 `tti_prompt` 模板
3. 保持 `buildVideoPrompt` 作为 fallback

## 影响范围

### 需要修改的文件

1. **`frontend/src/workflow/shotRenderWorkflow.ts`**
   - 视频生成步骤改用 `getPromptTemplate('itv_shot_video')`
   - 保留 `buildVideoPrompt` 作为 fallback

2. **`frontend/src/store/promptTemplates.ts`**
   - 删除 `tti_prompt` 模板类型
   - 从 `PromptTemplateType` 和 `DEFAULT_TEMPLATES` 中移除

## 验收标准

1. 视频生成时使用 `itv_shot_video` 模板
2. `tti_prompt` 模板已从代码中删除
3. 用户可在设置页面编辑 `itv_shot_video` 模板
4. `template-usage-summary.md` 已更新
