# 任务清单

## 阶段 1：集成 itv_shot_video 模板

- [x] 1.1 修改 `shotRenderWorkflow.ts`
  - 在视频生成步骤（约第 240 行）添加模板获取逻辑
  - 使用 `getPromptTemplate('itv_shot_video')` 获取模板
  - 使用 `fillTemplate` 填充变量
  - 保留 `buildVideoPrompt` 作为 fallback

- [x] 1.2 优化 `itv_shot_video` 模板
  - 添加 `getCameraMovementDesc` 辅助函数
  - 添加 `appendCharacterRefs` 辅助函数支持角色引用

## 阶段 2：删除冗余模板

- [x] 2.1 修改 `promptTemplates.ts`
  - 从 `PromptTemplateType` 中删除 `tti_prompt`
  - 从 `DEFAULT_TEMPLATES` 中删除 `tti_prompt`

## 阶段 3：更新文档

- [x] 3.1 更新 `template-usage-summary.md`
  - 标记 `itv_shot_video` 为已使用
  - 标记 `tti_prompt` 为已删除
  - 更新版本记录

## 依赖关系

```
阶段 1 → 阶段 2 → 阶段 3
```

## 实施完成

所有任务已于 2026-01-18 完成。

### 变更摘要

1. **集成 `itv_shot_video` 模板**
   - `shotRenderWorkflow.ts:242-248` 使用模板生成视频 prompt
   - 新增 `getCameraMovementDesc` 和 `appendCharacterRefs` 辅助函数

2. **删除 `tti_prompt` 模板**
   - 从 `PromptTemplateType` 类型定义中移除
   - 从 `DEFAULT_TEMPLATES` 对象中移除

3. **文档更新**
   - `template-usage-summary.md` 已更新
