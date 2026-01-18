# Proposal: 修复角色提取 API 使用方式

## Summary
当前角色提取实现使用了错误的 API 参数。根据 `视频文档.md`，Sora2 角色提取 API 应使用 `from_task`（视频生成任务ID）而非 `video_url`。同时分集详情页显示的资产未按分集正确过滤。

## Problem Statement
1. **角色提取 API 参数错误**：
   - 当前 `Sora2Provider.extractCharacter(videoPath)` 使用 `video_url` 参数
   - 正确方式应使用 `from_task` 参数，传入视频生成任务的 ID
   - 这导致角色提取可能失败或无法正确关联

2. **任务 ID 未保存**：
   - 角色预览视频生成后，未保存生成任务的 ID
   - 后续角色提取无法获取正确的任务 ID

3. **分集详情资产显示问题**（次要）：
   - 分集详情页未正确过滤按分集关联的角色/场景资产
   - 导致所有分集显示相同的资产列表

## Proposed Solution

### Phase 1: 修复角色提取 API
1. 修改 `Sora2Provider.extractCharacter()` 方法，使用 `from_task` 参数
2. 增加可选的 `timestamps` 参数支持

### Phase 2: 保存视频任务 ID
1. 在 `Character` 类型中添加 `previewVideoTaskId` 字段
2. 修改 `generateCharacterPreviewVideo()` 保存任务 ID
3. 修改 `extractAndBindCharacter()` 使用任务 ID

### Phase 3: 分集资产过滤（可选）
1. 修复分集详情页资产显示逻辑
2. 根据 `EpisodeAnalysis.characterRefs` 过滤角色列表

## Success Criteria
- [ ] 角色提取使用 `from_task` 参数（视频生成任务 ID）
- [ ] 预览视频生成后保存任务 ID
- [ ] 角色提取流程正常工作
- [ ] 控制台打印正确的 API 调用参数

## References
- 视频文档.md（项目根目录）：正确的 API 参数格式
- `frontend/src/providers/itv/Sora2Provider.ts`：当前实现
- `frontend/src/workflow/characterAssetWorkflow.ts`：角色工作流
