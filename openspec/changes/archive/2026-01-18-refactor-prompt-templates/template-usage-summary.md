# Prompt 模板使用情况总结

> 生成时间：2026-01-18
> 最后更新：2026-01-18（集成未使用模板完成）
> 用途：跟踪所有 Prompt 模板的使用位置，便于运维和审计

## 模板使用状态一览

| 模板 ID | 状态 | 使用次数 | 主要场景 |
|---------|------|----------|----------|
| `shot_prompt_system` | ✅ 已使用 | 1 | 分镜提示词生成系统提示 |
| `shot_breakdown_system` | ✅ 已使用 | 1 | 分镜拆解系统提示 |
| `script_analysis_system` | ✅ 已使用 | 1 | 剧本解析系统提示 |
| `script_generation` | ✅ 已使用 | 1 | 剧本生成 |
| `script_polish` | ✅ 已使用 | 1 | 剧本润色 |
| `shot_breakdown` | ✅ 已使用 | 3 | 分镜拆解 |
| `shot_prompt_generation` | ✅ 已使用 | 1 | 分镜提示词生成 |
| `character_extraction` | ✅ 已使用 | 2 | 角色提取 |
| `character_design` | ⚠️ 未使用 | 0 | 角色视觉设计（保留备用） |
| `scene_extraction` | ✅ 已使用 | 2 | 场景提取 |
| `prop_extraction` | ✅ 已使用 | 2 | 道具提取 |
| `dialogue_generation` | ⚠️ 未使用 | 0 | 对话生成（保留备用） |
| `tti_character_costume` | ✅ 已使用 | 1 | 角色定妆照生成 |
| `tti_scene_preview` | ✅ 已使用 | 1 | 场景预览图生成 |
| `tti_prop_reference` | ✅ 已使用 | 1 | 道具参考图生成 |
| `tti_shot_image` | ✅ 已使用 | 1 | 分镜图片生成 |
| `itv_shot_video` | ✅ 已使用 | 1 | 分镜视频生成 |
| `itv_character_motion` | ⚠️ 未使用 | 0 | 角色动态视频（保留备用） |

---

## 详细使用位置

### 系统提示模板（新增）

#### 1. `shot_prompt_system` - 分镜提示词系统提示

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `services/ShotPromptService.ts` | 117-118 | 分镜提示词生成时的 LLM 系统角色定义 |

#### 2. `shot_breakdown_system` - 分镜拆解系统提示

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `services/ShotAnalysisService.ts` | 137-139 | 分镜拆解时的 LLM 系统角色定义 |

#### 3. `script_analysis_system` - 剧本解析系统提示

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `services/ScriptAnalysisService.ts` | 181-183 | 剧本解析时的 LLM 系统角色定义 |

### LLM 任务模板

#### 4. `script_generation` - 剧本生成

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `workflow/scriptGenerator.ts` | 48-50 | 根据用户创意生成完整剧本 |

#### 5. `script_polish` - 剧本润色

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `workflow/scriptGenerator.ts` | 80-82 | 优化现有剧本语言和结构 |

#### 6. `shot_breakdown` - 分镜拆解

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `workflow/shotListGenerator.ts` | 32-33 | 快速分镜列表生成 |
| `services/ScriptAnalysisService.ts` | 322-323 | 剧本解析流程中的分镜生成 |
| `services/ShotAnalysisService.ts` | 119-120 | 独立分镜分析服务 |

#### 7. `shot_prompt_generation` - 分镜提示词生成

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `services/ShotPromptService.ts` | 98-99 | 为分镜生成视频/图片提示词 |

#### 8. `character_extraction` - 角色提取

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `services/entityExtractor.ts` | 40-42 | 实体提取服务 - 角色 |
| `services/ScriptAnalysisService.ts` | 223-224 | 剧本解析服务 - 角色提取 |

#### 9. `scene_extraction` - 场景提取

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `services/entityExtractor.ts` | 88-90 | 实体提取服务 - 场景 |
| `services/ScriptAnalysisService.ts` | 255-256 | 剧本解析服务 - 场景提取 |

#### 10. `prop_extraction` - 道具提取

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `services/entityExtractor.ts` | 136-138 | 实体提取服务 - 道具 |
| `services/ScriptAnalysisService.ts` | 287-288 | 剧本解析服务 - 道具提取 |

### TTI 图片生成模板

#### 11. `tti_character_costume` - 角色定妆照

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `workflow/characterAssetWorkflow.ts` | 56-57 | 角色资产工作流 - 生成定妆照 |

#### 12. `tti_scene_preview` - 场景预览图

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `workflow/scenePropAssetWorkflow.ts` | 55-56 | 场景资产工作流 - 生成预览图 |

#### 13. `tti_prop_reference` - 道具参考图

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `workflow/scenePropAssetWorkflow.ts` | 201-202 | 道具资产工作流 - 生成参考图 |

#### 14. `tti_shot_image` - 分镜图片

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `workflow/shotRenderWorkflow.ts` | 94-95 | 分镜渲染工作流 - 生成分镜图片 |

### ITV 视频生成模板

#### 15. `itv_shot_video` - 分镜视频

| 文件 | 行号 | 场景描述 |
|------|------|----------|
| `workflow/shotRenderWorkflow.ts` | 242-248 | 分镜渲染工作流 - 生成分镜视频 |

---

## 未使用的模板

### `dialogue_generation`
- **定义位置**：`store/promptTemplates.ts`
- **预期用途**：为分镜生成角色对话
- **状态**：⚠️ 未被任何代码引用
- **建议**：保留，未来对话生成功能可能使用

### `character_design`
- **定义位置**：`store/promptTemplates.ts`
- **预期用途**：角色视觉形象设计
- **状态**：⚠️ 未被任何代码引用
- **建议**：保留，用于角色定妆照优化时使用

### `itv_character_motion`
- **定义位置**：`store/promptTemplates.ts`
- **预期用途**：生成角色动态展示视频
- **状态**：⚠️ 未被任何代码引用
- **建议**：保留，角色预览视频功能可能使用

---

## 已删除的模板

### `tti_prompt`（已删除）
- **原定义位置**：`store/promptTemplates.ts`
- **原用途**：为分镜生成 AI 绘图 Prompt
- **删除原因**：功能与 `shot_prompt_generation` 重复
- **删除时间**：2026-01-18

---

## 硬编码提示词迁移记录

以下硬编码提示词已迁移到模板系统：

| 文件 | 原行号 | 迁移到 | 状态 |
|------|--------|--------|------|
| `services/ShotPromptService.ts` | 117-123 | `shot_prompt_system` | ✅ 已迁移 |
| `services/ShotAnalysisService.ts` | 138-150 | `shot_breakdown_system` | ✅ 已迁移 |
| `services/ScriptAnalysisService.ts` | 135-136 | `script_analysis_system` | ✅ 已迁移 |

### 语言修改记录

| 文件 | 行号 | 修改内容 |
|------|------|----------|
| `services/ScriptAnalysisService.ts` | 60 | "英文" → "中文" |
| `services/ScriptAnalysisService.ts` | 81 | "英文" → "中文" |
| `services/ScriptAnalysisService.ts` | 100 | "英文" → "中文" |
| `services/ScriptAnalysisService.ts` | 121 | "英文" → "中文" |
| `store/promptTemplates.ts` | shot_prompt_generation | "英文" → "中文" |
| `store/promptTemplates.ts` | tti_prompt | "英文" → "中文" |
| `components/CreateProjectModal.tsx` | 172 | 移除 "(英文)" |
| `components/ThemeSelector.tsx` | 101 | 移除 "(英文)" |

---

## 设置页面支持

SettingsPage.tsx 已更新，支持以下模板分类展示：

1. **系统提示 (System Prompts)** - 以 `_system` 结尾的模板
2. **LLM 任务模板** - 剧本解析、角色提取等
3. **TTI 模板（图片生成）** - 以 `tti_` 开头的模板
4. **ITV 模板（视频生成）** - 以 `itv_` 开头的模板

---

## 维护说明

### 如何更新此文件

1. 当新增或修改模板时，运行以下命令检查使用情况：
```bash
grep -rn "getPromptTemplate\|fillTemplate" frontend/src --include="*.ts" --include="*.tsx"
```

2. 检查硬编码提示词：
```bash
grep -rn "你是一个\|你是一位\|You are" frontend/src --include="*.ts" --include="*.tsx"
```

3. 更新本文件中的表格和详细信息

### 版本记录

| 日期 | 更新内容 |
|------|----------|
| 2026-01-18 | 初始版本，记录 15 个模板的使用情况 |
| 2026-01-18 | 实施完成：新增 4 个系统提示模板，迁移所有硬编码提示词，更新语言为中文 |
| 2026-01-18 | 集成未使用模板：`itv_shot_video` 已集成到视频生成流程，删除冗余的 `tti_prompt` |
