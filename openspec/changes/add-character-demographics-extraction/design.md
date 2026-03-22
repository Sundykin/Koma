## Context
当前角色提取相关信息分散在三个层面：
- Prompt 模板要求不完整，缺少年龄、性别的强制输出约束
- ScriptAnalysisService 的 Schema 接收 `age` 但不接收 `gender`
- `Character` 类型和角色编辑 UI 没有正式的性别字段

这会导致同一次角色提取中，一部分人口属性只能混在自然语言 `prompt` 里，无法作为结构化字段被后续功能稳定复用。

## Goals
- 让默认角色提取链路稳定输出并保存 `name`、`age`、`gender`、`role`、`appearance`
- 让角色创建和角色编辑使用相同的结构化字段
- 保持视觉提示词仍然以 `prompt` 为唯一生成入口

## Non-Goals
- 不为场景、道具增加新的身份属性
- 不恢复旧的 `customPrompt` 或分镜 `description` 兼容层
- 不引入新的迁移脚本

## Decisions

### 1. `gender` 成为 `Character` 的正式字段
`gender` 将作为与 `age` 同级的结构化字段进入 `Character` 类型，而不是继续混入 `prompt` 文本。

### 2. 角色提取以“结构化人口属性 + 视觉外观”双层输出
提取模板与 Schema 将显式要求：
- `name`
- `age`
- `gender`
- `role`
- `appearance`
- `description`

其中：
- `appearance` 负责客观外观
- `description` 保留角色小传/识别说明
- `prompt` 在落库时由 `appearance + description` 组合，继续作为唯一视觉生成入口

### 3. 角色 UI 仅编辑正式字段
角色创建和角色详情不再依赖隐式文本推断年龄/性别，而是直接编辑：
- `name`
- `role`
- `age`
- `gender`
- `prompt`

## Affected Files
- `frontend/src/store/promptTemplates.ts`
- `frontend/src/services/ScriptAnalysisService.ts`
- `frontend/src/types.ts`
- `frontend/src/components/asset/CreateCharacterModal.tsx`
- `frontend/src/components/asset/CharacterDetailPanel.tsx`
- `frontend/src/components/asset/CharacterDetailModal.tsx`
