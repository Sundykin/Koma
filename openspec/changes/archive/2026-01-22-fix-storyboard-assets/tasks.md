# Tasks: 分镜编辑器资产引用与资产管理优化

## Phase 1: 修复 @mention ID 问题

- [x] **1.1** 修改 `Storyboard.tsx` 中的 `actualMentionItems` 构建逻辑
  - 角色: 使用 `sora2CharacterId` 作为 MentionItem.id
  - 只有已绑定 Sora2 的角色才加入列表
  - 场景: 保持使用自定义 ID（场景不需要 Sora2 绑定）

- [x] **1.2** 修改 `mentionTypes.ts`
  - 更新 MentionItem 注释说明
  - 更新 `createMentionString` 文档说明

- [x] **1.3** 修改 `ShotListEditor.tsx` 传递的 mentionItems
  - 与 Storyboard.tsx 保持一致的过滤逻辑（已通过 props 传递）

- [x] **1.4** 验证: 分镜编辑器中输入 @ 只显示已绑定的角色

## Phase 2: 道具 Sora2 绑定

- [x] **2.1** 扩展 `types.ts` 中的 Prop 类型
  ```typescript
  previewVideoPath?: string;
  previewVideoTaskId?: string;
  sora2PropId?: string;
  customPrompt?: string;
  ```

- [x] **2.2** 创建道具预览视频生成工作流
  - 在 `scenePropAssetWorkflow.ts` 中添加 `generatePropPreviewVideo`
  - 调用 ITV 服务生成预览视频

- [x] **2.3** 创建道具提取 API 调用
  - 在 `itv/types.ts` 中添加 `extractProp` 方法定义
  - 在 `Sora2Provider.ts` 中实现 `extractProp` 方法
  - 在 `scenePropAssetWorkflow.ts` 中添加 `extractAndBindProp` 函数

- [x] **2.4** 更新 `Storyboard.tsx` 的 `actualMentionItems`
  - 道具: 使用 `sora2PropId` 作为 MentionItem.id
  - 只有已绑定 Sora2 的道具才加入列表

- [x] **2.5** 创建 `PropDetailModal.tsx`
  - 支持道具信息编辑
  - 支持道具图片生成/上传
  - 支持预览视频生成/上传
  - 支持 Sora2 道具提取和绑定

- [x] **2.6** 在 `AssetManager.tsx` 中集成 `PropDetailModal`
  - 添加道具弹窗状态管理
  - 点击道具卡片打开详情弹窗

## Phase 3: 资产管理 UI 重构

> 已完成：使用左侧列表 + 右侧详情面板布局替代弹窗方案

- [x] **3.1** 创建布局容器组件
  - 新建 `AssetManagerPanel.tsx`
  - 左侧列表区 (280px 固定宽度)
  - 右侧属性面板区 (flex 自适应)

- [x] **3.2** 创建资产列表组件 `AssetListPanel.tsx`
  - 支持三种类型切换 (Tabs)
  - 列表项显示: 缩略图、名称、类型标签、绑定状态图标
  - 点击选中，高亮当前项
  - 底部新建按钮

- [x] **3.3** 创建角色属性面板 `CharacterDetailPanel.tsx`
  - 基础信息编辑区（名称、年龄、角���类型、描述、外貌）
  - 定妆照预览和生成区
  - Sora2 绑定状态和操作区
  - 自定义提示词编辑区
  - 保存/删除按钮

- [x] **3.4** 创建场景属性面板 `SceneDetailPanel.tsx`
  - 基础信息编辑区（名称、位置、时间、氛围、描述）
  - 场景图预览和生成区
  - 自定义提示词编辑区
  - 保存/删除按钮

- [x] **3.5** 创建道具属性面板 `PropDetailPanel.tsx`
  - 基础信息编辑区（名称、类型、描述）
  - 道具图预览和生成区
  - 预览视频生成和播放区
  - Sora2 绑定状态和操作区
  - 自定义提示词编辑区
  - 保存/删除按钮

- [x] **3.6** 重构 `AssetManager.tsx`
  - 替换为新的面板布局
  - 移除现有弹窗逻辑
  - 保留批量生成功能

- [x] **3.7** 样式调整
  - 更新 `AssetManager.css`
  - 确保暗色主题一致性

- [x] **3.8** 验证: 资产管理页面交互流畅，无弹窗

## Phase 4: AI 分镜自动匹配资产

- [x] **4.2** 修改 `ShotAnalysisService.ts`
  - 角色名映射优先使用 `sora2CharacterId`
  - 道具名映射优先使用 `sora2PropId`
  - AI 生成的分镜自动使用已绑定的 Sora2 ID
  - 支持预选资产参数，优先使用预选的 Sora2 ID

- [x] **4.1** 创建预选资产对话框 `ShotAssetPresetModal.tsx`
  - 显示已绑定 Sora2 的角色列表（可多选）
  - 显示已绑定 Sora2 的道具列表（可多选）
  - 确认按钮返回预选的资产

- [x] **4.3** 修改 `Storyboard.tsx` 的 AI 生成入口
  - 点击「AI 智能生成分镜」先弹出预选对话框
  - 用户选择后再调用 `startShotAnalysis`

- [x] **4.4** AI 分镜结果自动匹配
  - 解析 AI 返回的分镜描述
  - 自动识别并关联预选的角色/道具

- [x] **4.5** 验证: AI 生成的分镜自动带上角色/道具引用

## Dependencies

```
Phase 1 → Phase 2 (道具绑定依赖 ID 修复)
Phase 1 → Phase 4 (AI 分镜依赖 ID 修复)
Phase 2 → Phase 3 (UI 需要显示道具绑定状态)
Phase 3 独立进行
Phase 4 依赖 Phase 1 + Phase 2
```

## Validation

- [x] 分镜编辑器 @ 只显示已绑定资产
- [x] 选择角色后生成正确的 mention 格式（无重复前缀）
- [x] 道具可完成完整的 Sora2 绑定流程
- [x] 资产管理 UI 支持列表+面板交互
- [x] AI 分镜预选资产后自动匹配
- [x] npm run build 无报错
