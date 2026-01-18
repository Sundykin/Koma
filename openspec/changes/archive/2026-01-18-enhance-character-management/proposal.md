# Proposal: enhance-character-management

## Summary
完善角色管理功能，将已有的 `CharacterAssetEditor` 集成到 `AssetManager`，并增加角色编辑、新建、提示词调整等缺失功能。

## Problem
当前 `AssetManager` 组件：
1. **角色属性不可编辑** - 只能查看，无法修改名称、描述、外貌等
2. **无法新建角色** - "新建角色"按钮无实际功能
3. **只生成单张图片** - 未生成三视图（前/侧/后）
4. **提示词不可调整** - 生成时无法自定义提示词
5. **缺少预览视频** - `CharacterAssetEditor` 支持但未集成
6. **缺少角色提取** - `Sora2Provider.extractCharacter` 已实现但未集成

## Solution
1. 点击角色卡片时打开详情弹窗（`CharacterDetailModal`）
2. 弹窗内集成 `CharacterAssetEditor` 的所有功能
3. 支持编辑角色基础属性
4. 新建角色弹窗
5. 生成前可预览/编辑提示词

## Scope
- **In Scope:**
  - 角色详情编辑弹窗
  - 角色新建弹窗
  - 提示词预览/编辑
  - 三视图生成
  - 预览视频生成
  - 角色提取(Sora2)集成

- **Out of Scope:**
  - 场景/道具的类似增强（后续提案）
  - TTS 音色配置（已有其他入口）

## Acceptance Criteria
- [ ] 点击角色卡片打开详情弹窗
- [ ] 可编辑角色名称、描述、外貌、角色类型
- [ ] 可调整生成提示词后再生成
- [ ] 支持三视图独立生成/上传
- [ ] 支持预览视频生成/上传
- [ ] 支持角色提取绑定
- [ ] 新建角色功能正常工作
- [ ] 删除角色需确认

## Dependencies
- 已有 `CharacterAssetEditor.tsx` 组件
- 已有 `characterAssetWorkflow.ts` 工作流
- 已有 `Sora2Provider.extractCharacter` API
