# Change: 修复分镜编辑器资产引用与资产管理优化

## Why

当前存在以下问题：

1. **分镜编辑器 @mention 角色 ID 重复**: 在 `Storyboard.tsx` 构建 `MentionItem` 时使用了自定义 ID (`char.id`)，但 mention 格式是 `@char_{id}`，导致出现 `@char_char_xxx` 的重复前缀

2. **未绑定 Sora2 的角色不应可选**: 只有绑定了 `sora2CharacterId` 的角色才能在视频生成时被正确引用，未绑定的角色不应出现在 @mention 列表中

3. **道具不支持 @mention 和 Sora2 绑定**: 道具当前没有 Sora2 绑定机制，无法在分镜提示词中被引用

4. **资产管理 UI 繁琐**: 当前角色/场景/道具的编辑需要多次弹窗操作，效率低

5. **AI 分镜缺少角色/道具预设**: 分镜生成时无法预选角色和道具，需手动编辑提示词

## What Changes

### 1. 修复 @mention ID 格式
- MentionItem 的 `id` 字段应使用 Sora2 返回的 ID（而非自定义 ID）
- 只有已绑定 Sora2 的角色/道具才注入到分镜编辑器
- 未绑定的资产在编辑器中显示提示引导用户去绑定

### 2. 道具增加 Sora2 绑定流程
- 道具类型增加 `sora2PropId`, `previewVideoPath`, `previewVideoTaskId` 字段
- 道具支持生成预览视频 → 调用提取 API → 获取 Sora2 ID
- 绑定后的道具可在分镜 @mention 中使用

### 3. 资产管理 UI 改造
- 将卡片网格 + 弹窗模式改为「左侧列表 + 右侧属性面板」模式
- 点击列表项直接在右侧显示详情，支持内联编辑
- 角色、场景、道具都支持调整生成提示词
- 属性面板显示 Sora2 绑定状态和操作按钮

### 4. AI 分镜增强
- 分镜生成前支��预选角色和道具
- 预选的资产自动注入到 AI 提示词
- AI 返回的分镜自动匹配已绑定的角色/道具

## Impact

- Affected specs: `character-management`, `ui-components`, `asset-generation`
- Affected code:
  - `frontend/src/types.ts` - Prop 类型增加 Sora2 相关字段
  - `frontend/src/editor/mentionTypes.ts` - MentionItem 增加 sora2PropId
  - `frontend/src/components/storyboard/Storyboard.tsx` - 修复 mentionItems 构建
  - `frontend/src/components/asset/AssetManager.tsx` - UI 重构
  - `frontend/src/workflow/characterAssetWorkflow.ts` - 增加道具工作流
  - `frontend/src/services/ShotAnalysisService.ts` - 增加预选资产参数
