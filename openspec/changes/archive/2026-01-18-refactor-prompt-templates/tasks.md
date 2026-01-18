# 任务清单

## 阶段 0：模板使用情况审计

- [x] 0.1 生成模板使用情况总结文件
  - 输出文件：`template-usage-summary.md`
  - 记录每个模板的使用位置（文件、行号）
  - 标记使用场景描述
  - 标记未使用的模板
  - 记录硬编码提示词位置

- [x] 0.2 确认未使用模板的处理方式
  - `tti_prompt` - 保留备用，功能已被 `shot_prompt_generation` 覆盖
  - `dialogue_generation` - 保留备用
  - `itv_shot_video` - 保留，待后续在 shotRenderWorkflow.ts 中集成
  - `itv_character_motion` - 保留备用
  - `character_design` - 保留，用于角色定妆照优化

## 阶段 1：扩展模板类型定义

- [x] 1.1 在 `promptTemplates.ts` 中新增模板类型：
  - `shot_prompt_system` - 分镜提示词生成的系统提示
  - `shot_breakdown_system` - 分镜拆解的系统提示
  - `script_analysis_system` - 剧本解析的系统提示
  - `character_design` - 角色视觉设计（参考"角色设计.txt"）

## 阶段 2：优化默认模板内容

- [x] 2.1 重写 `character_extraction` 模板
  - 参考"角色设计（1）.txt"的结构
  - 强调视觉化描述（脸型、瞳色、发型发色、服装）
  - 支持场景化着装
  - 输出改为中文

- [x] 2.2 重写 `shot_breakdown` 模板
  - 参考"小说转剧本无旁白.txt"的格式
  - 时长控制、情绪词列表
  - 输出改为中文

- [x] 2.3 新增 `shot_prompt_system` 默认模板
  - 移植 ShotPromptService.ts 中的 systemPrompt
  - 将"英文"要求改为"中文"

- [x] 2.4 新增 `shot_breakdown_system` 默认模板
  - 移植 ShotAnalysisService.ts 中的 systemPrompt
  - 优化描述格式

- [x] 2.5 新增 `script_analysis_system` 默认模板
  - 移植 ScriptAnalysisService.ts 中的 SYSTEM_PROMPT_BASE

- [x] 2.6 优化 `shot_prompt_generation` 模板
  - 参考"Sora2一本成剧大师版.txt"
  - 详尽画面描述、景别运镜
  - 输出改为中文

- [x] 2.7 优化 `scene_extraction` 模板
  - 输出改为中文描述

- [x] 2.8 优化 `prop_extraction` 模板
  - 输出改为中文描述

- [x] 2.9 优化 TTI/ITV 相关模板
  - `tti_prompt` - 改为中文描述
  - TTI 模板保留英文（考虑到图片生成模型兼容性）

## 阶段 3：移除硬编码提示词

- [x] 3.1 修改 `ShotPromptService.ts`
  - 删除 117-123 行的硬编码 systemPrompt
  - 改用 `getPromptTemplate('shot_prompt_system')` 获取
  - 移除"提示词必须是英文"的约束

- [x] 3.2 修改 `ShotAnalysisService.ts`
  - 删除 138-150 行的硬编码 systemPrompt
  - 改用 `getPromptTemplate('shot_breakdown_system')` 获取

- [x] 3.3 修改 `ScriptAnalysisService.ts`
  - 删除 135-136 行的 SYSTEM_PROMPT_BASE
  - 改用 `getPromptTemplate('script_analysis_system')` 获取
  - 修改 60, 81, 100, 121 行的 JSON Schema，将"英文"改为"中文"

- [x] 3.4 检查 `shotRenderWorkflow.ts`
  - 已使用 `tti_shot_image` 模板，无需修改

- [x] 3.5 检查其他服务文件
  - 保留其他文件中的硬编码提示词（超出本次提案范围）

## 阶段 4：更新 UI 提示

- [x] 4.1 修改 `CreateProjectModal.tsx`
  - 第 172 行：将"输入自定义风格描述 (英文)"改为"输入自定义风格描述"

- [x] 4.2 修改 `ThemeSelector.tsx`
  - 第 101 行：将"自定义风格描述 (英文)"改为"自定义风格描述"

## 阶段 5：确保设置页面支持

- [x] 5.1 检查 `SettingsPage.tsx`
  - 确保新增的模板类型可在全局设置中编辑
  - 添加模板分类显示：
    - 系统提示 (System Prompts)
    - LLM 任务模板
    - TTI 模板（图片生成）
    - ITV 模板（视频生成）

## 阶段 6：测试验证

- [x] 6.1 功能测试（代码审查完成）
  - 剧本解析流程（角色/场景/道具提取）使用模板
  - 分镜拆解流程使用模板
  - 分镜提示词生成使用模板
  - 分镜图片/视频生成使用模板

- [x] 6.2 模板编辑测试（代码审查完成）
  - 设置页面显示所有新增模板
  - 支持编辑和重置功能

- [x] 6.3 更新模板使用情况总结文件
  - 更新 `template-usage-summary.md`
  - 记录所有迁移记录
  - 记录语言修改记录

## 依赖关系

```
阶段 0 (审计)
    ↓
阶段 1 → 阶段 2 → 阶段 3 → 阶段 4
                          ↓
                      阶段 5 → 阶段 6
```

- 阶段 2 依赖阶段 1（需要先定义模板类型）
- 阶段 3 依赖阶段 2（需要先有默认模板内容）
- 阶段 4-5 可并行
- 阶段 6 依赖所有前置阶段

## 实施完成

所有任务已于 2026-01-18 完成。

### 变更摘要

1. **新增 4 个系统提示模板**：`shot_prompt_system`, `shot_breakdown_system`, `script_analysis_system`, `character_design`

2. **迁移 3 处硬编码提示词**：
   - ShotPromptService.ts
   - ShotAnalysisService.ts
   - ScriptAnalysisService.ts

3. **语言修改**：所有"英文"要求改为"中文"

4. **UI 更新**：
   - 移除 CreateProjectModal.tsx 和 ThemeSelector.tsx 中的"(英文)"提示
   - SettingsPage.tsx 新增"系统提示"模板分类

5. **文档更新**：template-usage-summary.md 已更新
