# Proposal: fix-episode-asset-isolation

## Summary

修复剧集资产隔离问题，重构角色生成流程，支持远程 URL 固化以及 Sora2 角色绑定。

## Problem

1. **剧集资产未隔离**：切换到第二集时，第一集的所有资产仍然显示，没有按剧集筛选
2. **缺少 AI 资产复用分析**：新剧集分析时没有调用 AI 识别可复用的已有资产
3. **角色生成流程冗余**：三视图分开生成（正面/侧面/背面各一次），应该一次生成包含三视图的单张图片
4. **远程 URL 未保留**：TTI 生成返回的远程 URL 直接下载后丢弃，但 Sora2 ITV 需要远程图片 URL 作为输入
5. **角色数据结构复杂**：`threeViewPaths` 包含三个路径字段，实际只需要一个定妆照路径

## Solution

### 1. 剧集资产筛选

- AssetManager 根据当前剧集的 `characterRefs/sceneRefs/propRefs` 筛选显示资产
- 提供"显示全部项目资产"开关，默认只显示当前剧集关联的资产

### 2. AI 资产复用分析

- 剧集分析时，LLM 提取的角色/场景/道具与项目已有资产进行匹配
- 高置信度自动复用，中置信度提示用户确认
- 复用时更新资产的 `episodeRefs`

### 3. 简化角色生成

- 删除三视图分别生成功能，只保留"定妆照"生成
- 定妆照提示词模板内置三视图规范（正面/侧面/背面排列）
- 用户只能自定义外貌描述部分，其他为固定模板

### 4. 远程 URL 固化

- Character 新增 `costumePhotoUrl?: string` 字段保存远程 URL
- 生成图片时同时保存远程 URL 和本地路径
- Sora2 生成预览视频时优先使用远程 URL

### 5. 数据结构简化

- 删除 `threeViewPaths` 字段
- 保留 `costumePhotoPath`（本地路径）和 `costumePhotoUrl`（远程 URL）

## Scope

### In Scope

- AssetManager 剧集资产筛选
- 角色生成提示词模板化（内置三视图规范）
- Character 新增 `costumePhotoUrl` 字段
- 生成流程保存远程 URL
- Sora2 预览视频生成使用远程 URL
- 删除三视图分别生成/上传功能

### Out of Scope

- AI 资产复用分析（需要 LLM 调用，复杂度高，单独提案）
- 场景/道具的类似改造

## Acceptance Criteria

1. 切换剧集时，AssetManager 只显示当前剧集关联的资产
2. 角色定妆照一次生成包含三视图的完整图片
3. 生成的图片同时保存远程 URL 和本地路径
4. Sora2 预览视频生成能正确使用远程图片 URL
5. CharacterDetailModal 不再显示三视图分别生成/上传的 UI

## Dependencies

- enhance-character-management（已完成）
