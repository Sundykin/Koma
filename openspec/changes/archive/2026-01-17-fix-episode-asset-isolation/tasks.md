# Tasks: fix-episode-asset-isolation

## Phase 1: 数据结构变更

### Task 1.1: Character 类型修改
- [x] 在 `types.ts` 中添加 `costumePhotoUrl?: string` 字段
- [x] 删除 `threeViewPaths` 字段
- [x] 删除 `avatarUrl` 字段（已废弃）

## Phase 2: 生成流程修改

### Task 2.1: 定妆照提示词模板化
- [x] 在 `characterAssetWorkflow.ts` 中修改 `buildCostumePhotoPrompt`
- [x] 内置三视图规范到提示词模板
- [x] 只保留 appearance 作为可变部分
- [x] 删除 `buildThreeViewPrompt` 函数
- [x] 删除 `generateThreeView` 函数

### Task 2.2: 远程 URL 保存
- [x] 修改 `generateCostumePhoto` 保存远程 URL 到 `costumePhotoUrl`
- [x] 同步模式：判断返回值是否为 URL
- [x] 异步模式：从 `progress.resultUrl` 获取
- [x] 更新 `updateCharacterAsset` 调用同时保存两个字段

### Task 2.3: 预览视频生成使用远程 URL
- [x] 修改 `generateCharacterPreviewVideo` 优先使用 `costumePhotoUrl`
- [x] 若无远程 URL 则提示用户重新生成定妆照

## Phase 3: UI 修改

### Task 3.1: CharacterDetailModal 简化
- [x] 删除三视图区域 UI
- [x] 删除三视图上传功能
- [x] 定妆照显示调整为横版（包含三视图）
- [x] 提示词编辑保留原有功能

### Task 3.2: AssetManager 剧集筛选
- [x] 添加 `episodeId` prop（已存在）
- [x] 添加 `showCurrentEpisodeOnly` state 和 Switch
- [x] 加载当前剧集的 `EpisodeAnalysis`
- [x] 筛选 characters/scenes/props 只显示关联的

### Task 3.3: App.tsx 传递 episodeId
- [x] 确保 AssetManager 接收当前 episodeId（已实现）
- [x] 切换剧集时刷新资产列表

## Phase 4: 清理

### Task 4.1: 删除废弃代码
- [x] 删除 `saveCharacterThreeView` 函数
- [x] 删除 CharacterDetailModal 中三视图相关 handlers
- [x] 删除 CharacterAssetEditor.tsx（未使用的废弃组件）
- [x] 清理未使用的导入
- [x] 更新 manju-dsl 转换器（avatarUrl -> costumePhotoPath）

## Checklist

- [x] Phase 1 completed
- [x] Phase 2 completed
- [x] Phase 3 completed
- [x] Phase 4 completed
- [x] 构建通过
- [ ] 手动测试通过
