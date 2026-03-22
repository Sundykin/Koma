## Context
当前提示词模板系统已经支持默认模板与自定义 override，但模板变量仍是简单字符串数组，导致：

- 运行时只能校验变量名，无法表达变量的语义与格式
- Prompt Studio 只能展示 `{{variable}}` 标签，无法说明变量该填什么
- 视觉模板输入边界模糊，工作流容易直接把剧情文本塞给生图/生视频模板

同时，分镜图片与分镜视频链路同时存在两层模板：

1. LLM 生成图片/视频提示词的模板
2. TTI / ITV 实际调用时的 fallback 模板

如果两层约束不一致，就会出现“上游要求客观，下游 fallback 又重新带剧情”的问题。

## Goals
- 用统一的变量元数据模型替代裸字符串变量列表
- 让内置视觉模板只消费客观视觉事实，不直接鼓励剧情复述
- 让分镜视频模板具备明确时间片段结构
- 将工作流的 prompt 变量传递收口到少量标准化构建函数中

## Non-Goals
- 不改第三方模型协议
- 不引入旧模板兼容映射层
- 不改图床、媒体存储或 provider 请求格式

## Decisions

### 1. 模板变量改为结构化元数据
`PromptTemplate.variables` 从 `string[]` 升级为结构化对象数组：

```ts
type PromptTemplateVariable = {
  name: string;
  label: string;
  description: string;
  format: string;
  example?: string;
  required?: boolean;
};
```

运行时校验统一通过变量 `name` 工作；UI 与编辑器展示使用其余元数据。

### 2. 废弃模板直接删除，不保留系统表面兼容
`random_idea_generation` 从默认模板集合和模板类型中删除，不再出现在 Prompt Studio。

保留 `generateRandomIdea()` 函数接口，但其内部不再依赖独立模板，而是通过现有随机剧本生成功能推导 metadata，避免前端调用点瞬时破坏。

### 3. 视觉模板统一遵守“客观事实优先”
以下模板统一执行客观化规则：

- `tti_character_costume`
- `tti_scene_preview`
- `tti_prop_reference`
- `tti_shot_image`
- `itv_shot_video`
- `shot_image_prompt_generation`
- `shot_video_prompt_generation`

规则包括：

- 不描述剧情摘要
- 不描述心理活动
- 不描述因果解释
- 仅描述可见外观、姿态、动作、空间、镜头、光线、材质、环境变化

### 4. 分镜视频提示词必须包含时间片段
`shot_video_prompt_generation` 与 `itv_shot_video` 的内置规则都要求按 `[start,end]秒` 输出片段化动作。

工作流 fallback 变量中增加时间范围说明字符串，让模板对时长有明确锚点。

### 5. 工作流通过标准化视觉输入函数收口
新增一组构建函数，把角色、场景、道具、分镜信息收口为模板变量，而不是在多个 workflow 内部散落字符串拼接。

## Risks
- 用户已有自定义模板如果沿用旧变量语义，可能仍能通过变量名校验，但内容质量不会自动提升
- 分镜 fallback 仍然依赖已有 shot 数据质量，如果 shot 自身缺少足够视觉信息，输出质量受限

## Mitigations
- 保持变量名尽量稳定，减少 override 因变量改名而失效
- 通过 Prompt Studio 展示变量说明，帮助用户校正自定义模板
- 在 fallback 侧优先使用角色/场景/道具已存在的视觉 prompt，而不是直接拼接剧情原文
