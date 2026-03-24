# Change: 收口系统内置提示词模板并强化客观视觉规则

## Why
当前系统内置提示词模板存在三类问题：一是仍暴露废弃模板 `random_idea_generation`；二是角色、场景、道具、分镜图片、分镜视频等模板对“剧情复述”和“客观视觉事实”边界不清，容易把剧情、心理和因果直接带入生图/生视频提示词；三是模板变量只有名字，没有含义、格式和示例，导致编辑时难以正确使用。

这些问题已经开始影响生成质量和维护成本。需要把系统内置提示词模板升级为“变量元数据完整、视觉事实优先、时间结构明确”的统一体系。

## What Changes
- 删除废弃内置模板 `random_idea_generation`，并清理其调用与规范要求
- 为内置提示词模板引入结构化变量元数据，至少包含变量名、展示名、含义、数据格式、示例、是否必填
- 收紧角色视觉、场景视觉、道具视觉模板，明确只允许描述客观可见信息
- 收紧分镜图片提示词生成模板，要求从剧情中提炼当前镜头的可见事实、人物姿态、物理动作、空间、光照与构图，不复述剧情
- 收紧分镜视频提示词生成模板，要求输出按时间片段组织的动作与镜头描述，时间范围格式为 `[start,end]秒`
- 调整分镜图片/视频的 fallback 模板，使其消费标准化视觉输入而非松散剧情文本
- 在 Prompt Studio 中展示变量说明，帮助用户理解变量含义与数据格式

## Impact
- Affected specs:
  - `prompt-templates`
  - `script-generation`
- Affected code:
  - `frontend/src/store/promptTemplates.ts`
  - `frontend/src/components/settings/PromptStudio.tsx`
  - `frontend/src/workflow/characterAssetWorkflow.ts`
  - `frontend/src/workflow/scenePropAssetWorkflow.ts`
  - `frontend/src/workflow/shotImageWorkflow.ts`
  - `frontend/src/workflow/shotRenderWorkflow.ts`
  - `frontend/src/workflow/scriptGenerator.ts`
