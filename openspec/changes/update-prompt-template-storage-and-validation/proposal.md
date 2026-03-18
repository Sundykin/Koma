# Change: 统一 Prompt 模板存储并强化变量校验

## Why

当前 Prompt 模板系统存在三类核心问题：

1. 自定义模板存储在独立的 `prompt-templates.json`，与 `settings.json` 分离，导致设置源分散、迁移复杂、调试困难。
2. 模板编辑缺少严格的变量校验，未知占位符、遗漏关键变量或未替换变量会静默流入模型调用。
3. 若干关键媒体链路仍未接入模板系统，尤其是分镜文生图、角色图生视频、道具图生视频，导致用户修改模板后下游提示词不生效。

这会直接影响“设置中的 Prompt 模板 -> LLM/TTI/ITV 实际调用”这条链路的可追踪性和可靠性。

## What Changes

- 将自定义 Prompt 模板 overrides 统一收口到 `settings.json`
- 启动时迁移旧的 `prompt-templates.json` / 浏览器本地模板存储到 `settings.json`
- 为模板定义显式变量契约，保存时校验：
  - 不允许未声明变量
  - 不允许缺失必需变量
  - 返回结构化错误信息
- 在运行时再次校验模板解析结果：
  - 不允许未替换占位符流入模型调用
  - 解析失败时中断调用并记录模板 ID / 缺失变量
- 补齐当前未接线的模板消费链路：
  - `tti_shot_image` 接入分镜文生图 fallback
  - `itv_character_motion` 接入角色预览视频
  - 新增 `itv_prop_motion` 接入道具预览视频
- 保持已保存的 `shot.imagePrompt` / `shot.videoPrompt` 作为定稿提示词，不自动 retroactive 重写历史分镜

## Impact

- Affected specs:
  - `prompt-templates`
  - `storage`
  - `asset-generation`
- Affected code:
  - `frontend/src/store/promptTemplates.ts`
  - `frontend/src/store/settings/*`
  - `frontend/src/types.ts`
  - `frontend/src/components/settings/PromptStudio.tsx`
  - `frontend/src/services/ShotGenerationService.ts`
  - `frontend/src/workflow/characterAssetWorkflow.ts`
  - `frontend/src/workflow/scenePropAssetWorkflow.ts`

## Out of Scope

- 不在本次变更中全面清理所有历史 LLM 硬编码 Prompt
- 不提供模板版本管理、导入导出或分享能力
- 不自动重写已保存到分镜/资产记录中的历史 prompt
