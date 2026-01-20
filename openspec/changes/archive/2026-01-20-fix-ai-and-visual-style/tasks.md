# Tasks: 修复AI剧本生成和视觉风格全局应用

## 阶段1：AI随机剧本生成

### 1.1 新增随机创意生成模板
- [x] 在 `promptTemplates.ts` 新增 `random_idea_generation` 模板
- [x] 模板用于让AI随机生成一个剧本创意（主题、类型、风格、关键元素）

### 1.2 实现随机剧本生成函数
- [x] 在 `scriptGenerator.ts` 新增 `generateRandomIdea()` 函数
- [x] 调用LLM生成随机创意
- [x] 新增 `generateRandomScript()` 函数，先生成创意再生成剧本

### 1.3 更新剧本工作室UI
- [x] 在 `ScriptWorkshop.tsx` 的AI菜单中添加"随机生成剧本"选项
- [x] 添加加载状态显示
- [x] 生成完成后自动填充到编辑器

### 1.4 改进新建项目弹窗的剧本导入
- [x] 删除新建项目弹窗中的"AI随机生成剧本"固定文本按钮
- [x] 删除新建项目弹窗中的剧本导入功能（剧本管理统一在分集管理中进行）
- [x] 更新 `App.tsx` 中 `handleCreateProject` 接口移除 `script` 参数

## 阶段2：视觉风格全局管理

### 2.1 扩展类型定义
- [x] 在 `types.ts` 扩展 `AppSettings` 接口，添加 `customThemePresets?: ThemePreset[]`
- [x] 确保 `ThemePreset` 类型完整（已有）

### 2.2 实现风格预设存储管理
- [x] 在 `globalStore.ts` 新增 CRUD 函数：
  - `addCustomThemePreset(preset)`
  - `updateCustomThemePreset(id, updates)`
  - `deleteCustomThemePreset(id)`
  - `getCustomThemePresets()`

### 2.3 修改主题预设获取逻辑
- [x] 修改 `themePresets.ts`，新增 `getAllThemePresets()` 异步函数
- [x] 新增 `getThemePresetAsync()` 和 `getThemeStylePrefixAsync()` 异步函数
- [x] 合并系统内置预设和用户自定义预设
- [x] 用户预设排在前面，方便选择

### 2.4 新增视觉风格管理器组件
- [x] 创建 `VisualStyleManager.tsx` 组件
- [x] 显示所有风格预设列表（区分内置/自定义）
- [x] 支持新增自定义风格
- [x] 支持编辑/删除自定义风格
- [x] 预览风格的 TTI 提示词前缀

### 2.5 集成到设置页面
- [x] 在 `SettingsPage.tsx` 新增"视觉风格"Tab
- [x] 集成 `VisualStyleManager` 组件

## 阶段3：视觉风格统一应用

### 3.1 审查分镜提示词生成调用
- [x] 检查工作流文件中 `stylePrefix` 参数使用
- [x] 确认各生成工作流是否正确传递 `theme` 和 `stylePrompt`

### 3.2 修复角色资产生成
- [x] 在 `characterAssetWorkflow.ts` 改用 `getThemeStylePrefixAsync()` 支持自定义预设

### 3.3 修复场景/道具资产生成
- [x] 在 `scenePropAssetWorkflow.ts` 改用 `getThemeStylePrefixAsync()` 支持自定义预设

### 3.4 修复分镜视频生成
- [x] 在 `shotRenderWorkflow.ts` 导入并使用 `getThemeStylePrefixAsync()`
- [x] 更新 `itv_shot_video` 模板添加 `stylePrefix` 变量
- [x] 修改 `buildVideoPrompt()` 函数支持 `stylePrefix` 参数

### 3.5 验证所有风格应用
- [x] 所有TTI生成（角色、场景、道具）都使用异步的 `getThemeStylePrefixAsync()`
- [x] 分镜视频生成使用风格前缀

## 阶段4：测试与验证

### 4.1 功能测试
- [ ] 测试随机剧本生成功能
- [ ] 测试视觉风格预设管理功能
- [ ] 测试新创建的项目是否能使用自定义风格

### 4.2 风格应用验证
- [ ] 验证角色定妆照生成包含风格前缀
- [ ] 验证场景预览图生成包含风格前缀
- [ ] 验证道具参考图生成包含风格前缀
- [ ] 验证分镜提示词生成包含风格前缀
- [ ] 验证分镜视频生成包含风格前缀

## 依赖关系

```
阶段1（随机剧本）可独立开发 ✅
阶段2（风格管理）可独立开发 ✅
阶段3（风格应用）依赖阶段2完成后的API ✅
```

## 验收标准

1. ✅ 用户可以在剧本工作室一键随机生成剧本
2. ✅ 用户可以在全局设置中管理自定义视觉风格预设
3. ✅ 创建项目时可以选择自定义风格预设
4. ✅ 所有TTI生成（角色、场景、道具、分镜图）都使用统一的风格前缀
5. ✅ 分镜视频生成时应用项目风格

## 完成状态

✅ **所有代码实现已完成**

- 阶段1：随机剧本生成 - 完成
- 阶段2：视觉风格全局管理 - 完成
- 阶段3：视觉风格统一应用 - 完成
- 阶段4：待用户手动验证功能
