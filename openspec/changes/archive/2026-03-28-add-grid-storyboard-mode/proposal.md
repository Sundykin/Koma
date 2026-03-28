# Change: 增加九宫格分镜模式

## Why
当前分镜流程每个 Shot 生成单张图片，角色外观和场景风格容易在多次生成之间出现不一致（角色变形、服装漂移、美术风格断裂）。九宫格（3×3 Grid）模式通过将单个分镜的描述扩展为 9 个具有剧情递进关系的连续画面，在一张 3×3 网格图中一次性生成，强制 TTI 模型在同一张图内保持角色一致性、场景连贯性和美术统一性。

**核心理念：** 九宫格不是将 9 个分镜合并为一张图，而是从根源上丰富每个分镜的表现力——将一个分镜的剧情内容展开为 9 个连续画面，呈现角色的连续动作、表情变化、视角切换和情绪推进。

## What Changes

### 1. Shot 模型扩展
- Shot 增加 `imageMode: 'normal' | 'grid'` 字段，默认 `'normal'`
- 每个 Shot 可独立选择生成模式

### 2. 新增九宫格提示词生成步骤（LLM 层）
- 新增 `grid_shot_prompt_generation` 模板：LLM 接收单个分镜的剧本内容 + 角色/场景/道具资产，将该分镜描述扩展为 9 个连续画面的分镜提示词（镜头01~镜头09）
- 9 个画面之间 MUST 具有明确的叙事推进关系，包含远景/中景/近景/特写等景别变化，形成电影分镜的流动感
- 生成结果写回该 Shot 的 `imagePrompt` 字段（包含完整的 9 条镜头描述）

### 3. 新增九宫格图片生成步骤（TTI 层）
- 新增 `tti_grid_shot_image` 模板：将该 Shot 的 9 条镜头提示词组装为一条九宫格 TTI 提示词
- 指定 3×3 网格布局，每个格子的画面比例与整体图片比例保持一致
- 统一环境、一致的角色/服装/光线，8K 分辨率

### 4. 预设模板中增加模式切换
- 分镜页面工具栏增加「普通模式 / 九宫格模式」切换
- 单个 Shot 也可独立切换 imageMode
- 九宫格模式下，提示词生成和图片生成走九宫格专用流程

### 5. 九宫格生成后的视频衔接
- 九宫格图片生成后，仍沿用现有 ITV 视频流程
- 使用九宫格原图作为参考图输入 ITV，配合 videoPrompt 生成视频

## Impact
- Affected specs: `prompt-templates`、`asset-generation`、`script-processing`
- Affected code: `types.ts`（Shot 接口）、`promptTemplates.ts`（新模板）、`ShotPromptService.ts`（九宫格提示词生成）、`shotImageWorkflow.ts`（九宫格图片生成 workflow）、`ShotListEditor.tsx` / `ShotCard.tsx`（UI 模式切换）
