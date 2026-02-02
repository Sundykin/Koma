# Change: 重构编辑器工作流界面

## Why

当前编辑器界面存在以下问题：
1. **剧本创作页**：顶部工具栏按钮（粗体、斜体、场景、角色等）无实际功能，占用空间
2. **步骤条**：占用高度过大（py-8），视觉上不够简洁
3. **AI分镜页**：采用卡片+导演控制台模式，编辑效率低，无法直接在列表中编辑
4. **分镜操作**：景别/运镜通过下拉框选择，应该通过提示词关键字自动识别
5. **分镜流程耦合**：AI分镜时同时生成提示词，用户无法控制生成时机

需要打破现有框架，重新设计更高效的编辑体验。

## What Changes

### 1. 剧本创作页改造
- **BREAKING** 删除 `ScriptToolbar` 组件（无实际功能的按钮）
- 编辑器填满整个左侧容器
- "开始智能拆解剧本"按钮移动到步骤条上

### 2. 步骤条精简
- 减小步骤条高度（py-8 → py-3）
- 缩小图标尺寸（w-14 h-14 → w-10 h-10）
- 在当前步骤旁边显示主操作按钮（如"开始解析"、"下一步"）
- 移除底部光晕装饰

### 3. AI分镜流程解耦
- **BREAKING** 分镜拆解只生成结构（剧本文案、角色、场景关联），不生成提示词
- 提示词生成由用户手动触发
- 提供**批量生成提示词**按钮（顶部工具栏）
- 每行提供**AI生成提示词**按钮

### 4. 提示词AI生成增强
- 注入角色变量：生成的提示词自动 `@角色id`（Sora2 角色引用）
- 注入运镜描述：使用预定义运镜关键字（pan, zoom, tracking 等）
- 注入景别描述：使用预定义景别关键字（close-up, wide 等）
- 新增 `prompt_shot_description` 模板

### 5. AI分镜页重构
- **BREAKING** 删除 `DirectorPanel`（导演控制台）
- **BREAKING** 删除 `ShotCard` 卡片视图
- 新增 `ShotListEditor` 列表编辑模式
- 每行布局：`剧本文案 | 提示词编辑器 | 参考图 | 视频片段`

### 6. 分镜行编辑器
- 删除景别/运镜下拉选择器
- 提示词编辑器支持关键字高亮：
  - 运镜关键字：`pan`, `zoom`, `tracking`, `static`, `dolly`, `crane`
  - 景别关键字：`close-up`, `medium`, `wide`, `extreme-wide`, `full shot`
- 参考图支持：选择已有资产 或 上传新图片
- 视频片段区：支持多次生成，显示生成历史，可选择使用哪个片段

## Impact

- Affected files:
  - `App.tsx` - 删除 ScriptToolbar，调整剧本编辑器布局
  - `StepNavigator.tsx` - 精简样式，添加操作按钮插槽
  - `Storyboard.tsx` - 完全重构，删除 ShotCard/DirectorPanel，新增 ShotListEditor
  - `Storyboard.css` - 重写样式
  - `mentionPlugin.ts` - 扩展支持运镜/景别关键字高亮
  - `types.ts` - Shot 类型调整（增加 videoVersions，description 改为可选）
  - `promptTemplates.ts` - 新增 `shot_prompt_generation` 模板
  - `ShotAnalysisService.ts` - 修改分镜拆解逻辑，不生成提示词
  - 新增 `ShotPromptService.ts` - 独立的提示词生成服务

- Breaking changes:
  - 分镜页完全重构，原有卡片视图和导演控制台移除
  - 剧本页工具栏移除
  - 分镜拆解不再自动生成提示词
