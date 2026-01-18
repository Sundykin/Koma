# Tasks: 修复角色提取 API

## Phase 1: 数据模型更新

- [x] 1.1 在 `types.ts` 的 `Character` 接口中添加 `previewVideoTaskId?: string` 字段

## Phase 2: 修改视频生成流程

- [x] 2.1 修改 `characterAssetWorkflow.generateCharacterPreviewVideo()` 保存任务 ID
  - 在轮询完成后，将 `taskId` 保存到 `previewVideoTaskId` 字段
  - 同时保存 `previewVideoPath` 和 `previewVideoTaskId`

## Phase 3: 修改角色提取 API

- [x] 3.1 修改 `Sora2Provider.extractCharacter()` 方法签名
  - 参数从 `videoPath: string` 改为 `taskId: string, timestamps?: string`
  - 请求体使用 `from_task` 而非 `video_url`

- [x] 3.2 更新 `ITVProvider` 接口定义
  - 添加 `extractCharacter?(taskId: string, timestamps?: string): Promise<string>`

## Phase 4: 修改调用方

- [x] 4.1 修改 `extractAndBindCharacter()` 函数
  - 检查 `character.previewVideoTaskId` 是否存在
  - 传递任务 ID 而非视频路径
  - 更新错误提示信息（兼容旧数据提示重新生成）

## Phase 5: 验证

- [x] 5.1 编译通过
- [ ] 5.2 测试完整流程：定妆照 → 预览视频 → 角色提取
- [ ] 5.3 检查控制台日志，确认 API 使用 `from_task` 参数
- [ ] 5.4 验证已有角色（无 taskId）给出正确提示
