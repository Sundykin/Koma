# UI/UX 全面优化实施计划

> 基于多模型协作分析（Codex + Gemini + Claude）
> 方案：分阶段升级（Phase 1 UI → Phase 2 数据模型）
> **状态：✅ 全部完成**

---

## 📋 需求总览

1. ✅ **全局样式统一** - 设置页面/弹窗样式一致性、按钮对齐
2. ✅ **项目管理重构** - 项目设置从弹窗改为独立页面
3. ✅ **角色/场景/道具精简** - 移除冗余字段，只保留提示词
4. ✅ **AI分镜重构** - 西瓜播放器、舞台区域、双提示词
5. ✅ **提示词编辑器** - 运镜中英文高亮

---

## 🏗️ Phase 1：UI/布局重构 ✅ 完成

### 1.1 新增组件 ✅

| 组件 | 路径 | 状态 |
|------|------|------|
| `SharedConfigLayout` | `components/common/SharedConfigLayout.tsx` | ✅ |
| `StagePlayer` | `components/video/StagePlayer.tsx` | ✅ |
| `StoryboardStudio` | `components/storyboard/StoryboardStudio.tsx` | ✅ |

### 1.2 组件改造 ✅

| 组件 | 状态 |
|------|------|
| `ProjectOverview.tsx` Tab 布局 | ✅ |
| `CharacterDetailModal.tsx` 精简字段 | ✅ |
| `SceneAssetEditor.tsx` 精简字段 | ✅ |
| `PropAssetEditor.tsx` 精简字段 | ✅ |
| `keywordHighlightPlugin.ts` 中文高亮 | ✅ |
| `ShotCard.css` 宽度调整 | ✅ |
| `ShotListEditor.css` 宽度调整 | ✅ |

### 1.3 xgplayer 集成 ✅

- 依赖已添加到 package.json
- StagePlayer 组件已实现

---

## 🔧 Phase 2：数据模型与逻辑升级 ✅ 完成

### 2.1 类型定义变更 ✅

- `AssetTimestampRange` 类型已添加
- `Character` 新增 `timestampRange` 字段
- `Shot` 新增 `imagePrompt` / `videoPrompt` 字段
- `Scene` / `Prop` 字段已精简为可选

### 2.2 Store 迁移逻辑 ✅

- `entities.ts` 添加 `normalizeCharacter` / `normalizeScene` / `normalizeShot`
- 旧数据自动兼容

### 2.3 Workflow 变更 ✅

| 文件 | 状态 |
|------|------|
| `characterAssetWorkflow.ts` 支持 timestampRange | ✅ |
| `ShotPromptService.ts` 双提示词生成 | ✅ |
| `ShotGenerationService.ts` 使用 imagePrompt | ✅ |
| `shotRenderWorkflow.ts` 使用 videoPrompt | ✅ |
| `scenePropAssetWorkflow.ts` 导出 prompt 函数 | ✅ |

---

## 📁 完成文件清单

### Phase 1 新增
- ✅ `frontend/src/components/common/SharedConfigLayout.tsx`
- ✅ `frontend/src/components/video/StagePlayer.tsx`
- ✅ `frontend/src/components/storyboard/StoryboardStudio.tsx`

### Phase 1 修改
- ✅ `frontend/src/components/project/ProjectOverview.tsx`
- ✅ `frontend/src/components/asset/CharacterDetailModal.tsx`
- ✅ `frontend/src/components/asset/SceneAssetEditor.tsx`
- ✅ `frontend/src/components/asset/PropAssetEditor.tsx`
- ✅ `frontend/src/editor/keywordHighlightPlugin.ts`
- ✅ `frontend/src/components/storyboard/ShotCard.css`
- ✅ `frontend/src/components/storyboard/ShotListEditor.css`
- ✅ `frontend/package.json` (xgplayer 依赖)

### Phase 2 修改
- ✅ `frontend/src/types.ts`
- ✅ `frontend/src/store/project/entities.ts`
- ✅ `frontend/src/workflow/characterAssetWorkflow.ts`
- ✅ `frontend/src/services/ShotPromptService.ts`
- ✅ `frontend/src/services/ShotGenerationService.ts`
- ✅ `frontend/src/workflow/shotRenderWorkflow.ts`
- ✅ `frontend/src/workflow/scenePropAssetWorkflow.ts`

---

## ✅ 构建验证

最终构建于 2026-01-24 通过，无类型错误。
