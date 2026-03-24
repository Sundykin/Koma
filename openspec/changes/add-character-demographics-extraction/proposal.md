# Change: add character demographics extraction

## Why
当前角色提取链路对年龄支持不完整、对性别没有正式字段，导致默认提示词、JSON Schema、落库类型和角色编辑 UI 不一致，角色基础画像信息无法稳定提取与维护。

## What Changes
- 为 `character_extraction` 默认模板补充年龄、性别、角色定位、客观外貌的明确输出要求
- 为角色提取 JSON Schema 增加 `gender` 字段，并统一角色提取结果的必填契约
- 扩展 `Character` 数据模型，正式支持 `gender`
- 在角色创建与角色详情编辑界面中展示并保存年龄、性别字段
- 统一角色提取后的落库逻辑，避免年龄/性别只存在于提示词文本而未结构化保存

## Impact
- Affected specs: `script-processing`, `prompt-templates`, `character-management`
- Affected code:
  - `frontend/src/store/promptTemplates.ts`
  - `frontend/src/services/ScriptAnalysisService.ts`
  - `frontend/src/types.ts`
  - `frontend/src/components/asset/CreateCharacterModal.tsx`
  - `frontend/src/components/asset/CharacterDetailPanel.tsx`
  - `frontend/src/components/asset/CharacterDetailModal.tsx`
