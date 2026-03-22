# Change: Add Grok Prompt Compilation For Shot Asset Mentions

## Why
分镜在「图像设计 → 图像生成」的链路中，提示词与分镜已选择的资产（角色/场景/道具）没有形成稳定的可编译引用关系，导致：
- 生成的分镜图片/视频与角色、场景、道具资产割裂；
- `@scene_*` / `@prop_*` 在提示词编辑器与渲染侧无法稳定匹配到资产；
- 自定义 Grok 渠道需要的 `@imageN` 协议无法在发送到渠道前统一生成与对齐参考图数组。

## What Changes
- **统一 Mention 规范**：`@{type}_{assetId}` 中的 `{assetId}` 使用资产的真实 ID（不再对 scene/prop 做前缀裁剪），确保 `parseMentions()` 能直接与资产 ID 匹配。
- **分镜提示词生成补全**：分镜图片/视频提示词生成（LLM）在变量中提供角色/场景/道具的可用引用清单，并要求模型在提示词中使用 `@char_*`、`@scene_*`、`@prop_*`。
- **增加编译步骤（先实现 Grok）**：
  - 对标 “Grok image-index protocol”：将提示词中的 `@char/@scene/@prop` 统一编译为 `@imageN`，其中 `N` 来自该分镜「已选择资产」的顺序（从 1 开始）。
  - ITV Grok 编译时，`@image1` 固定为分镜上一阶段生成的分镜图片（primary image），其余资源从 `@image2` 起按分镜资产顺序排列。
  - 编译仅对显式启用该协议的渠道生效（通过 channelConfig.providerConfig 声明）。
- **增强日志**：针对启用编译的渠道，打印编译前/后 prompt、引用映射与最终请求体（脱敏 Authorization，且对超长 base64 做截断/摘要）。

## Impact
- Affected specs:
  - `script-processing`（分镜提示词生成需包含 scene/prop refs）
  - `model-providers`（媒体生成链路新增 provider/channel 级 prompt compilation）
  - `prompt-templates`（AI 调用 debug logging 扩展到可审计请求体）
- Affected code (expected):
  - `frontend/src/editor/mentionTypes.ts`
  - `frontend/src/components/storyboard/Storyboard.tsx`
  - `frontend/src/services/ShotPromptService.ts`
  - `frontend/src/store/promptTemplates.ts`
  - `frontend/src/workflow/shotImageWorkflow.ts`
  - `frontend/src/workflow/shotRenderWorkflow.ts`
  - `frontend/src/services/MediaGenerationService.ts`
  - new: `frontend/src/services/promptCompilation/*`

## Breaking / Migration Notes
- Mention 规范收口后，新的提示词将以 `@scene_{scene.id}` / `@prop_{prop.id or sora2PropId}` 为准。
- 旧数据中的提示词如果存在 `@scene_xxx` 且 `xxx` 为被裁剪过的短 ID，将无法自动回写为正确资产 ID；用户可通过编辑器重新插入 @ 场景/道具完成修正。

