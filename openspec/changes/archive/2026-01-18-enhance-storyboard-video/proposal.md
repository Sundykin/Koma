# Proposal: 完善 AI 分镜视频生成与编辑器角色提示

## Why

AI 分镜生成后，用户无法直接生成视频，需要完善以下功能：

1. **分镜页面缺少视频生成入口**：导演面板的"生成此镜头"按钮实际只生成图片，没有视频生成功能
2. **提示词编辑器无法使用 @ 引用角色**：`mentionItems` 未传递给 Storyboard，编辑器的自动补全不可用
3. **用户无法看到 Sora2 绑定的角色 ID**：编辑器不支持显示/输入 `@sora2CharacterId`

## What Changes

### Phase 1: 修复编辑器 @ 功能
1. App.tsx 传递 `mentionItems` 给 Storyboard
2. MentionItem 增加 `sora2CharacterId` 字段
3. 编辑器支持显示 Sora2 角色 ID（有绑定的角色显示特殊标记）

### Phase 2: 添加视频生成入口
1. 分镜卡片添加视频生成按钮（区分图片生成）
2. 导演面板改为完整渲染（图片 → 语音 → 视频）
3. 调用 `shotRenderWorkflow` 而非仅生成图片

### Phase 3: 完善批量渲染
1. 批量渲染按钮调用 `batchRenderShots`
2. 显示整体进度和单个分镜状态

## Success Criteria
- [ ] 分镜描述编辑器 @ 输入弹出角色列表
- [ ] 有 Sora2 绑定的角色显示特殊标记（如角色 ID）
- [ ] 单个分镜可生成视频
- [ ] 批量渲染分镜生成视频
