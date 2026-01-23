# fix-antd-deprecations

## Summary
修复项目中 Ant Design 组件的废弃 API 警告，升级到推荐的新 API。

## Motivation
控制台出现多个 Ant Design 废弃警告，影响开发体验，且在未来版本中这些 API 将被移除。

## Scope

### 1. Card 组件 - bodyStyle/headStyle 废弃
- `bodyStyle` → `styles.body`
- `headStyle` → `styles.header`
- 影响文件：
  - `ProjectAssetOverview.tsx`
  - `AssetGenerationWizard.tsx`

### 2. Space 组件 - direction 废弃
- `direction` → `orientation`
- 影响文件：
  - `CreateProjectModal.tsx`
  - `ProjectLLMSelector.tsx`
  - `EpisodeSplitWizard.tsx`
  - `AssetGenerationWizard.tsx`

### 3. List 组件废弃
- `List` → `Flex` + 自定义渲染
- 影响文件（5个）：
  - `EpisodeManager.tsx`
  - `AssetGenerationWizard.tsx`
  - `ProjectAssetOverview.tsx`
  - `EpisodeSplitWizard.tsx`
  - `AssetMatchConfirm.tsx`

### 4. Image.PreviewGroup - onVisibleChange 废弃
- `onVisibleChange` → `onOpenChange`
- `visible` → `open`
- 影响文件：
  - `ImageCardGrid.tsx`
  - `ReferenceImagePicker.tsx`

## Out of Scope
- Form 实例未连接警告（需要具体分析逻辑问题，属于代码 bug 而非 API 废弃）
- 其他非废弃相关的代码优化
