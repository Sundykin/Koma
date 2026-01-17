# Tasks: enhance-project-management

## Phase 1: Data Structure (数据结构扩展)

### Task 1.1: Extend Project Type
- [x] 在 `types.ts` 扩展 `Project` 接口：
  - `theme?: string` - 主题风格
  - `stylePrompt?: string` - 自定义风格描述
  - `episodeCount?: number` - 实际分集数
- [x] 创建 `Episode` 接口
- [x] 创建 `ThemePreset` 接口

### Task 1.2: Extend Character Type
- [x] 在 `types.ts` 扩展 `Character` 接口：
  - `costumePhotoPath?: string` - 定妆照路径
  - `threeViewPaths?: { front?: string; side?: string; back?: string }` - 三视图
  - `previewVideoPath?: string` - 预览视频路径
  - `sora2CharacterId?: string` - 角色提取ID

### Task 1.3: Extend Scene/Prop Types
- [x] 在 `types.ts` 扩展 `Scene` 接口：
  - `imagePath?: string` - 场景预览图
- [x] 在 `types.ts` 扩展 `Prop` 接口：
  - `imagePath?: string` - 道具参考图

### Task 1.4: Create Theme Presets
- [x] 创建 `themePresets.ts`，定义预设主题
- [x] 每个主题包含：id, name, description, ttiStylePrefix, llmPromptSuffix

## Phase 2: Storage Layer (存储层)

### Task 2.1: Asset Download Service
- [x] 创建 `assetDownloadService.ts`
- [x] 实现 `downloadRemoteAsset(url, localPath)` 函数
- [x] 支持图片和视频下载
- [x] 返回本地路径

### Task 2.2: Episode Storage
- [x] 在 `projectStore.ts` 添加分集相关函数：
  - `createEpisode(projectId, episode)`
  - `loadEpisode(projectId, episodeId)`
  - `saveEpisode(projectId, episodeId, data)`
  - `deleteEpisode(projectId, episodeId)`
  - `listEpisodes(projectId)`

### Task 2.3: Character Asset Storage
- [x] 在 `projectStore.ts` 添加角色资产函数：
  - `saveCharacterCostumePhoto(projectId, characterId, imagePath)`
  - `saveCharacterThreeView(projectId, characterId, view, imagePath)`
  - `saveCharacterPreviewVideo(projectId, characterId, videoPath)`

### Task 2.4: Scene/Prop Asset Storage
- [x] 在 `projectStore.ts` 添加场景/道具资产函数：
  - `saveSceneImage(projectId, sceneId, imagePath)`
  - `savePropImage(projectId, propId, imagePath)`

## Phase 3: Asset Generation (资产生成)

### Task 3.1: Character Costume Photo Generation
- [x] 创建 `characterAssetWorkflow.ts`
- [x] 实现 `generateCostumePhoto(projectId, character, theme)` 函数
- [x] 使用 TTI Provider 生成
- [x] 下载结果到本地并更新角色数据

### Task 3.2: Character Three View Generation
- [x] 实现 `generateThreeView(projectId, character, theme)` 函数
- [x] 分别生成正面/侧面/背面
- [x] 下载结果到本地并更新角色数据

### Task 3.3: Scene Image Generation
- [x] 实现 `generateSceneImage(projectId, scene, theme)` 函数
- [x] 使用 TTI Provider 生成
- [x] 下载结果到本地并更新场景数据

### Task 3.4: Prop Image Generation
- [x] 实现 `generatePropImage(projectId, prop, theme)` 函数
- [x] 使用 TTI Provider 生成
- [x] 下载结果到本地并更新道具数据

### Task 3.5: Character Preview Video Generation
- [x] 实现 `generateCharacterPreviewVideo(projectId, character)` 函数
- [x] 使用定妆照 + ITV Provider (sora2) 生成
- [x] 下载结果到本地并更新角色数据

### Task 3.6: Character Extraction API
- [x] 在 `Sora2Provider.ts` 添加 `extractCharacter(videoPath)` 方法
- [x] 调用 `POST /v1/characters` API
- [x] 返回 characterId
- [x] 实现 `extractAndBindCharacter()` 函数

## Phase 4: UI Components (UI组件)

### Task 4.1: Project Settings - Theme Selection
- [x] 创建 `ThemeSelector.tsx` 组件
- [x] 支持预设主题和自定义风格描述
- [x] 集成到 `ProjectSettingsModal.tsx`

### Task 4.2: Project Settings - Episode Management
- [x] 在 `ProjectSettingsModal.tsx` 添加分集管理
- [x] 显示分集列表，支持添加/删除/编辑
- [x] 支持 LLM 自动分割剧本到多集

### Task 4.3: Character Editor - Asset Generation
- [x] 创建 `CharacterAssetEditor.tsx` 组件
- [x] 显示定妆照、三视图、预览视频
- [x] 支持一键生成、单独重新生成
- [x] 显示角色提取绑定状态
- [x] 支持手动上传替代

### Task 4.4: Scene/Prop Editor - Image Generation
- [x] 创建 `SceneAssetEditor.tsx` 组件
- [x] 创建 `PropAssetEditor.tsx` 组件
- [x] 添加图片预览和生成按钮
- [x] 支持手动上传替代

### Task 4.5: Asset Generation Wizard
- [x] 创建 `AssetGenerationWizard.tsx` 组件
- [x] 分步引导：角色 → 场景 → 道具 → 预览视频
- [x] 每步支持编辑调整和重新生成
- [x] 显示整体进度

### Task 4.6: UI 辅助组件
- [x] 创建 `SaveStatusIndicator.tsx` 组件
- [x] 创建 `TaskNotifications.tsx` 组件

## Phase 5: Task Queue & Recovery (任务队列与恢复)

### Task 5.1: AsyncTask Type Definition
- [x] 在 `types.ts` 创建 `AsyncTask` 接口：
  - id, projectId, type, targetType, targetId
  - remoteTaskId, status, progress
  - resultUrl, localPath, error
  - retryCount, maxRetries, createdAt, updatedAt
- [x] 创建 `AsyncTaskType` 类型：'tti' | 'itv' | 'tts' | 'character-extraction'
- [x] 创建 `AsyncTaskStatus` 类型：'pending' | 'processing' | 'completed' | 'failed'

### Task 5.2: Task Queue Storage
- [x] 创建 `taskQueueStore.ts`
- [x] 实现 `createTask(projectId, task)` - 创建任务并持久化
- [x] 实现 `updateTask(projectId, taskId, updates)` - 更新任务状态
- [x] 实现 `getTask(projectId, taskId)` - 获取单个任务
- [x] 实现 `listTasks(projectId, filter?)` - 列出任务（可按状态过滤）
- [x] 实现 `deleteTask(projectId, taskId)` - 删除任务
- [x] 任务存储到 `projects/{id}/tasks.json`

### Task 5.3: Task Recovery Service
- [x] 创建 `taskRecoveryService.ts`
- [x] 实现 `recoverPendingTasks(projectId)` - 恢复未完成任务
- [x] 实现 `checkTaskProgress(task)` - 查询单个任务远程状态
- [x] 实现 `processCompletedTask(task)` - 处理完成的任务（下载资产、更新数据）
- [x] 实现 `handleFailedTask(task)` - 处理失败的任务
- [x] 实现轮询逻辑（间隔3秒，最大重试次数）

### Task 5.4: Task Status Notifications
- [x] 创建 `useTaskNotifications` Hook
- [x] 任务开始时显示 "正在生成 XXX..."
- [x] 任务完成时显示 "XXX 生成成功"
- [x] 任务失败时显示 "XXX 生成失败: 错误原因"
- [x] 支持点击通知跳转到对应资产

### Task 5.5: Task Retry Logic
- [x] 实现 `retryTask(projectId, taskId)` - 重试失败任务
- [x] 重试时重置 status 为 pending，增加 retryCount
- [x] 超过 maxRetries 后标记为彻底失败
- [ ] UI 显示重试按钮（仅对失败任务）

## Phase 6: Auto-Save (自动保存)

### Task 6.1: Auto-Save Service
- [x] 创建 `autoSaveService.ts`
- [x] 实现防抖保存（数据变更后1秒自动保存）
- [x] 实现 `saveProject(projectId)` - 保存项目所有数据
- [x] 实现 `markDirty(projectId)` - 标记项目有未保存变更

### Task 6.2: Save on Exit
- [x] 监听 `beforeunload` 事件，应用关闭前保存
- [x] 监听项目切换事件，切换前保存当前项目
- [x] 保存失败时阻止关闭并提示用户

### Task 6.3: Save Status Indicator
- [x] 创建 `SaveStatusIndicator.tsx` 组件
- [x] 显示三种状态：已保存 ✓ / 保存中... / 未保存 •
- [x] 放置在编辑器标题栏或状态栏
- [x] 点击可手动触发保存

### Task 6.4: Keyboard Shortcut
- [x] 实现 Ctrl+S / Cmd+S 快捷键保存
- [x] 保存成功后显示短暂提示

## Phase 7: Integration (集成)

### Task 7.1: Shot Workflow Integration
- [x] 更新 `shotRenderWorkflow.ts`
- [x] 在分镜提示词中支持 @sora2CharacterId 引用
- [x] 使用项目主题风格前缀
- [x] 生成任务创建 AsyncTask 记录

### Task 7.2: Script Analysis Integration
- [ ] 更新 `ScriptAnalysisService.ts`
- [ ] 支持分集拆分模式
- [ ] 在角色提取后提供生成定妆照入口

### Task 7.3: Project Open Hook
- [x] 创建 `projectOpenService.ts`
- [x] 在项目打开时调用 `recoverPendingTasks()`
- [x] 显示恢复中的任务数量
- [x] 恢复完成后更新 UI

## Checklist
- [x] Phase 1 completed
- [x] Phase 2 completed
- [x] Phase 3 completed
- [x] Phase 4 completed
- [x] Phase 5 completed
- [x] Phase 6 completed
- [x] Phase 7 completed
- [x] Phase 8 completed (智能编辑器核心)
- [ ] All tests passing
- [ ] Code review approved

## Phase 8: Smart Script Editor (智能编辑器)

### Task 8.1: Install CodeMirror Dependencies
- [x] 安装 `@codemirror/state`
- [x] 安装 `@codemirror/view`
- [x] 安装 `@codemirror/autocomplete`
- [x] 安装 `@codemirror/language`
- [x] 安装 `@codemirror/commands`

### Task 8.2: Create Mention Extension
- [x] 创建 `mentionTypes.ts` - 类型定义和解析函数
- [x] 创建 `mentionPlugin.ts` - Decoration 和 Widget
- [x] 实现正则匹配 `@(char|prop|scene)_[a-z0-9]+`
- [x] 实现 `MentionWidget` 显示名称标签
- [x] 支持角色、道具、场景三种类型

### Task 8.3: Create Autocomplete Extension
- [x] 创建 `mentionAutocomplete.ts`
- [x] 监听 `@` 输入触发补全
- [x] 渲染补全列表（名称 + 类型标签）
- [x] 选择后插入 `@{type}_{id}` 格式
- [x] 支持键盘导航

### Task 8.4: Create Tooltip Extension
- [x] 创建 `mentionTooltip.ts`
- [x] 悬浮时显示详情（名称、描述、预览图）
- [x] 支持点击跳转回调

### Task 8.5: Create ScriptEditor Component
- [x] 创建 `ScriptEditor.tsx` 组件
- [x] 封装 CodeMirror EditorView
- [x] 配置基本扩展（行号、高亮、快捷键）
- [x] 集成 Mention、Autocomplete、Tooltip 扩展
- [x] 暴露 `value`/`onChange`/`onMentionClick` props

### Task 8.6: Context and Integration
- [x] 创建 `MentionContext.tsx` - 提供 mention 数据
- [x] 创建 `index.ts` - 模块导出
- [ ] 在剧本编辑场景使用 ScriptEditor
- [ ] 在分镜提示词编辑场景使用 ScriptEditor
