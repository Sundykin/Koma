# 提案：重构 Prompt 模板系统

## 概述

将代码中所有硬编码的提示词迁移到可配置的 Prompt 模板系统中，优化默认模板质量，并将输出语言从英文改为中文。

## 背景

当前代码存在以下问题：

1. **硬编码提示词散落各处**：
   - `ShotPromptService.ts:117-123` - 分镜提示词生成的 systemPrompt
   - `ShotAnalysisService.ts:138-150` - 分镜拆解的 systemPrompt
   - `ScriptAnalysisService.ts:135-136` - 剧本解析的 SYSTEM_PROMPT_BASE
   - `ScriptAnalysisService.ts:60,81,100,121` - JSON Schema 中要求"英文"输出
   - 其他服务文件中的各种 prompt

2. **要求英文输出不符合用户需求**：多处要求"AI绘图用的外貌描述，英文"等

3. **默认模板质量一般**：参考的三个 txt 文件提供了更专业的提示词方案

## 目标

1. 删除所有硬编码的提示词，统一使用 `promptTemplates.ts` 管理
2. 优化默认模板，参考提供的专业提示词模板
3. 将所有"英文"要求改为"中文"
4. 新增缺失的模板类型（如 system_prompt 类模板）

## 影响范围

### 需要修改的文件

1. **`frontend/src/store/promptTemplates.ts`**
   - 新增模板类型：`shot_prompt_system`, `shot_breakdown_system`, `script_analysis_system`, `character_design`
   - 优化所有默认模板内容
   - 将英文要求改为中文

2. **`frontend/src/services/ShotPromptService.ts`**
   - 删除硬编码的 systemPrompt (117-123行)
   - 改用 `getPromptTemplate('shot_prompt_system')` 获取

3. **`frontend/src/services/ShotAnalysisService.ts`**
   - 删除硬编码的 systemPrompt (138-150行)
   - 改用 `getPromptTemplate('shot_breakdown_system')` 获取

4. **`frontend/src/services/ScriptAnalysisService.ts`**
   - 删除硬编码的 SYSTEM_PROMPT_BASE (135-136行)
   - 将 Schema 中的"英文"改为"中文"
   - 改用模板系统

5. **`frontend/src/workflow/shotRenderWorkflow.ts`**
   - 检查并移除硬编码的 fallback prompt

6. **`frontend/src/components/SettingsPage.tsx`**
   - 确保新模板类型在设置页面可编辑

7. **UI 组件**
   - `CreateProjectModal.tsx` - 修改"英文"提示
   - `ThemeSelector.tsx` - 修改"英文"提示

## 新增模板类型

| 模板 ID | 名称 | 用途 |
|---------|------|------|
| `shot_prompt_system` | 分镜提示词系统提示 | ShotPromptService 的 systemPrompt |
| `shot_breakdown_system` | 分镜拆解系统提示 | ShotAnalysisService 的 systemPrompt |
| `script_analysis_system` | 剧本解析系统提示 | ScriptAnalysisService 的 systemPrompt |
| `character_design` | 角色视觉设计 | 参考"角色设计.txt"的角色定妆照提示词 |

## 默认模板优化方向

### 角色提取 (`character_extraction`)

参考"角色设计（1）.txt"：
- 强调视觉化描述
- 包含脸型、瞳色、发型发色、服装配饰
- 多场景着装变化
- 禁止抽象词汇

### 分镜拆解 (`shot_breakdown`)

参考"小说转剧本无旁白.txt"：
- 时长控制在10秒以内
- 包含角色配音情绪词
- 表格化输出格式

### 分镜提示词 (`shot_prompt_generation`)

参考"Sora2一本成剧大师版.txt"：
- 详尽的画面描述
- 景别与运镜设计
- 音效与对白同步
- 动态叙事连贯性

## 不在此提案范围

- Prompt 模板的导入/导出功能
- 模板版本管理
- 模板分享功能

## 验收标准

1. 代码中不存在硬编码的 LLM 提示词（systemPrompt 等）
2. 所有"英文"要求改为"中文"
3. 默认模板经过优化，提升生成质量
4. 全局设置页面可编辑所有新增模板
5. 现有功能正常运行
6. `template-usage-summary.md` 文件已更新，所有模板使用情况记录准确

## 附件

- `template-usage-summary.md` - 模板使用情况总结文件，记录所有模板的使用位置、行号、场景，以及未使用模板和硬编码提示词位置
