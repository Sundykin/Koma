# Tasks: enhance-character-management

## Phase 1: 准备工作

### Task 1.1: 暴露提示词生成函数
- [x] 在 `characterAssetWorkflow.ts` 导出 `buildCostumePhotoPrompt` 函数
- [x] 在 `characterAssetWorkflow.ts` 导出 `buildThreeViewPrompt` 函数
- [x] 添加 `getCharacterPrompt(character, theme, stylePrompt)` 便捷函数

## Phase 2: 角色详情弹窗

### Task 2.1: 创建 CharacterDetailModal 组件
- [x] 创建 `CharacterDetailModal.tsx` 组件框架
- [x] 包含 Modal 容器、标题、关闭按钮
- [x] 接收 `character`, `projectId`, `onUpdate`, `onClose` props

### Task 2.2: 基础信息编辑区
- [x] 添加角色基础信息表单
  - 名称 (Input)
  - 角色类型 (Select: 主角/反派/配角)
  - 年龄 (Input)
  - 描述 (TextArea)
  - 外貌 (TextArea)
- [x] 实现表单状态管理
- [x] 实现保存功能

### Task 2.3: 提示词预览/编辑区
- [x] 显示自动生成的提示词
- [x] 添加"编辑"按钮切换编辑模式
- [x] 支持自定义提示词覆盖
- [x] 在角色数据中添加 `customPrompt?: string` 字段

### Task 2.4: 集成资产生成功能
- [x] 定妆照生成/上传/预览
- [x] 三视图生成/上传/预览
- [x] 预览视频生成/上传/预览
- [x] Sora2 角色提取状态显示
- [x] 复用 `characterAssetWorkflow` 的逻辑

### Task 2.5: 删除功能
- [x] 添加"删除角色"按钮
- [x] 添加确认弹窗
- [x] 实现删除逻辑（从列表移除）

## Phase 3: 新建角色弹窗

### Task 3.1: 创建 CreateCharacterModal 组件
- [x] 创建 `CreateCharacterModal.tsx` 组件
- [x] 基础信息表单（名称、类型、年龄、描述、外貌）
- [x] 表单验证（名称必填）
- [x] 创建后自动打开详情弹窗

### Task 3.2: AssetManager 集成
- [x] "新建角色"卡片点击打开 CreateCharacterModal
- [x] 创建成功后刷新角色列表

## Phase 4: AssetManager 改造

### Task 4.1: 角色卡片点击行为
- [x] 角色卡片点击打开 CharacterDetailModal
- [x] 保留快捷生成按钮（悬浮时显示）
- [x] 更新样式指示可点击

### Task 4.2: 状态同步
- [x] CharacterDetailModal 保存后刷新列表
- [x] 生成完成后刷新列表
- [x] 删除后刷新列表

## Phase 5: 场景/道具对齐（可选）

### Task 5.1: 场景详情弹窗
- [ ] 创建 `SceneDetailModal.tsx`（与角色类似）

### Task 5.2: 道具详情弹窗
- [ ] 创建 `PropDetailModal.tsx`（与角色类似）

## Checklist
- [x] Phase 1 completed
- [x] Phase 2 completed
- [x] Phase 3 completed
- [x] Phase 4 completed
- [ ] Phase 5 completed (optional)
- [x] 构建通过
- [ ] 手动测试通过
