# 设计文档：Prompt 模板系统重构

## 1. 架构概述

### 当前架构

```
┌─────────────────────────────────────────────────────────────┐
│                     服务层                                   │
├─────────────────────────────────────────────────────────────┤
│ ShotPromptService     → 硬编码 systemPrompt                 │
│ ShotAnalysisService   → 硬编码 systemPrompt                 │
│ ScriptAnalysisService → 硬编码 SYSTEM_PROMPT_BASE           │
│ shotRenderWorkflow    → 硬编码 fallback prompt              │
└──────────────────────────┬──────────────────────────────────┘
                           │ 部分使用
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  promptTemplates.ts                          │
│  - 用户可见模板（如 shot_breakdown）                         │
│  - 不含 system prompt 类模板                                 │
└─────────────────────────────────────────────────────────────┘
```

### 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                     服务层                                   │
├─────────────────────────────────────────────────────────────┤
│ ShotPromptService     → getPromptTemplate('shot_prompt_system')     │
│ ShotAnalysisService   → getPromptTemplate('shot_breakdown_system')  │
│ ScriptAnalysisService → getPromptTemplate('script_analysis_system') │
│ shotRenderWorkflow    → getPromptTemplate('tti_shot_image')         │
└──────────────────────────┬──────────────────────────────────┘
                           │ 统一使用
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  promptTemplates.ts                          │
│                                                              │
│  系统提示类：                                                │
│  - shot_prompt_system    (分镜提示词系统提示)                │
│  - shot_breakdown_system (分镜拆解系统提示)                  │
│  - script_analysis_system(剧本解析系统提示)                  │
│                                                              │
│  LLM 任务类：                                                │
│  - script_generation     (剧本生成)                          │
│  - shot_breakdown        (分镜拆解用户提示)                  │
│  - shot_prompt_generation(分镜提示词用户提示)                │
│  - character_extraction  (角色提取)                          │
│  - scene_extraction      (场景提取)                          │
│  - prop_extraction       (道具提取)                          │
│  - character_design      (角色视觉设计 - 新增)               │
│                                                              │
│  TTI/ITV 类：                                                │
│  - tti_character_costume (角色定妆照)                        │
│  - tti_scene_preview     (场景预览图)                        │
│  - tti_shot_image        (分镜图片)                          │
│  - itv_shot_video        (分镜视频)                          │
└─────────────────────────────────────────────────────────────┘
```

## 2. 模板分类

### 2.1 系统提示模板（System Prompt）

这类模板定义 LLM 的角色和行为准则，不包含用户输入变量。

| 模板 ID | 用途 | 变量 |
|---------|------|------|
| `shot_prompt_system` | 分镜提示词生成时的系统角色定义 | 无 |
| `shot_breakdown_system` | 分镜拆解时的系统角色定义 | 无 |
| `script_analysis_system` | 剧本解析时的系统角色定义 | 无 |

### 2.2 用户提示模板（User Prompt）

这类模板包含变量占位符，由运行时填充。

| 模板 ID | 用途 | 变量 |
|---------|------|------|
| `character_extraction` | 从剧本提取角色 | `script` |
| `character_design` | 生成角色视觉描述 | `character`, `context` |
| `shot_breakdown` | 拆解分镜结构 | `script`, `characters`, `scenes`, `props` |
| `shot_prompt_generation` | 生成分镜提示词 | `scriptContent`, `characters`, `emotion`, ... |

### 2.3 TTI/ITV 模板

这类模板用于直接生成图片/视频，变量直接拼接。

| 模板 ID | 用途 | 变量 |
|---------|------|------|
| `tti_shot_image` | 分镜图片生成 | `stylePrefix`, `description`, `shotType`, `emotion` |
| `itv_shot_video` | 分镜视频生成 | `description`, `cameraMovement` |

## 3. 优化后的默认模板内容

### 3.1 `character_design`（参考"角色设计.txt"）

```
你是一名顶尖的角色概念设计师，专为小说进行视觉化开发。

【核心任务】
为角色设计视觉形象方案，建立基准形象（日常/标志性穿着），并补充特殊场景下的着装。

【红线规则】
1. 严禁任何形式的暴露或性暗示着装
2. 严禁非视觉元素（性格、情绪等抽象词汇）
3. 严禁动作与环境描述，仅描述外观本身

【描述模板】
姓名(性别)年龄，[脸型]，[眼型/瞳色]，[发型]，[发色]，[服装与配饰描述]。

【服装描述要求】
必须包含【颜色】、【款式】、【材质】三个维度。
禁止使用"职业套装"、"休闲服"等模糊词汇。

角色信息：{{character}}
剧本上下文：{{context}}
```

### 3.2 `shot_prompt_system`

```
你是一个专业的视频提示词生成专家。你的任务是为视频生成模型编写高质量的中文提示词。

要求：
1. 提示词使用中文描述
2. 如果有角色引用，使用 @角色ID 格式（如 @abc123）
3. 包含运镜描述和景别描述
4. 描述要具体、生动，包含动作、光影、氛围
5. 直接输出提示词，不要有任何前缀或解释
```

### 3.3 `shot_breakdown`（参考"小说转剧本无旁白.txt"）

```
你是一位专业的分镜师。请将剧本拆解为分镜列表。

【时长要求】
每个镜头控制在10秒以内。

【情绪词列表】
高兴、愤怒、悲伤、恐惧、反感、低落、惊讶、自然、急切、平静、激动、呵斥、关心、严肃

【输出格式】
JSON 格式，包含：
- scriptContent: 对应剧本原文
- shotType: 景别（close-up/medium/wide/extreme-wide）
- cameraMovement: 运镜（static/pan/zoom-in/tracking/handheld）
- duration: 时长（秒）
- characters: 出场角色
- dialogue: 台词（格式：角色名（情绪）："台词内容"）
- emotion: 情绪氛围
- props: 道具

已知角色：{{characters}}
已知场景：{{scenes}}
已知道具：{{props}}

剧本：
{{script}}
```

## 4. 语言输出规范

### 修改点汇总

| 文件 | 位置 | 原内容 | 新内容 |
|------|------|--------|--------|
| ScriptAnalysisService.ts | 60行 | "AI绘图用的外貌描述，英文" | "AI绘图用的外貌描述，中文" |
| ScriptAnalysisService.ts | 81行 | "AI绘图用的场景描述，英文" | "AI绘图用的场景描述，中文" |
| ScriptAnalysisService.ts | 100行 | "AI绘图用的道具描述，英文" | "AI绘图用的道具描述，中文" |
| ScriptAnalysisService.ts | 121行 | "画面描述...英文" | "画面描述，中文" |
| promptTemplates.ts | 150行 | "使用英文输出" | "使用中文输出" |
| promptTemplates.ts | 264行 | "生成适合AI绘图的英文Prompt" | "生成适合AI绘图的中文Prompt" |
| CreateProjectModal.tsx | 172行 | "(英文)" | 删除 |
| ThemeSelector.tsx | 101行 | "(英文)" | 删除 |

## 5. 兼容性考虑

### 5.1 现有自定义模板

用户已保存的自定义模板不受影响，系统会优先使用用户自定义版本。

### 5.2 新增模板类型

新增的模板类型（如 `shot_prompt_system`）默认使用 DEFAULT_TEMPLATES 中定义的内容，用户可在设置中修改。

### 5.3 TTI/ITV 模板语言

考虑到部分图片/视频生成模型可能更适合英文输入：
- 保留 `tti_*` 和 `itv_*` 模板使用英文
- 用户如需中文，可自行在设置中修改
- 或新增一个"模板语言"选项，自动翻译

## 6. 设置页面 UI

### 模板分类展示

```
┌─────────────────────────────────────────────────────────────┐
│  Prompt 模板配置                                            │
├─────────────────────────────────────────────────────────────┤
│  ▼ 系统提示 (System Prompts)                               │
│    ├─ 分镜提示词系统提示 [编辑] [重置]                      │
│    ├─ 分镜拆解系统提示   [编辑] [重置]                      │
│    └─ 剧本解析系统提示   [编辑] [重置]                      │
│                                                              │
│  ▼ LLM 任务模板                                             │
│    ├─ 剧本生成           [编辑] [重置]                      │
│    ├─ 角色提取           [编辑] [重置]                      │
│    ├─ 角色视觉设计       [编辑] [重置]                      │
│    ├─ 场景提取           [编辑] [重置]                      │
│    ├─ 道具提取           [编辑] [重置]                      │
│    ├─ 分镜拆解           [编辑] [重置]                      │
│    └─ 分镜提示词生成     [编辑] [重置]                      │
│                                                              │
│  ▼ 图片/视频生成模板                                        │
│    ├─ 角色定妆照         [编辑] [重置]                      │
│    ├─ 场景预览图         [编辑] [重置]                      │
│    ├─ 分镜图片           [编辑] [重置]                      │
│    └─ 分镜视频           [编辑] [重置]                      │
│                                                              │
│  [全部重置为默认]                                           │
└─────────────────────────────────────────────────────────────┘
```

## 7. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 默认模板质量不如预期 | 生成效果下降 | 参考专业提示词模板，多次测试调优 |
| 中文输出影响图片生成 | TTI 模型可能不支持中文 | TTI 模板保留英文选项 |
| 用户自定义模板丢失 | 影响已有用户 | 仅修改默认值，不影响自定义 |
