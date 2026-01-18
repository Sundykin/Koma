# Tasks: enhance-storyboard-ui

## 阶段 1: 数据结构改造
- [x] 扩展 `Shot` 类型，添加 `imagePaths`、`currentImageIndex`、`videoVersions`、`currentVideoIndex` 字段
- [x] 在 `types.ts` 中添加 `ShotVideo` 接口

## 阶段 2: 新组件开发
- [x] 创建 `ImageCardGrid` 组件
  - 支持多图片卡片网格展示
  - 点击选中功能
  - 添加/删除图片功能
  - 放大预览功能
- [x] 创建 `VideoCardGrid` 组件
  - 支持多视频卡片网格展示
  - 点击选中功能
  - 弹窗播放功能
  - AI生成视频按钮

## 阶段 3: ShotListEditor 改造
- [x] 剧本文案改为可编辑（使用 TextArea）
- [x] 调整每行高度到 180px
- [x] 调整提示词输入框：宽度 280px，高度 5 行（约 120px）
- [x] 替换 ReferenceImagePicker 为 ImageCardGrid
- [x] 替换 VideoVersionList 为 VideoCardGrid
- [x] 添加每行复选框
- [x] 行操作菜单移至行前方
- [x] 更新 CSS 样式

## 阶段 4: 批量操作与行操作
- [x] 添加选中状态管理
- [x] 工具栏添加批量操作按钮区域
- [x] 实现批量删除
- [x] 实现批量确认/取消确认
- [x] 行操作菜单添加：向上合并、向下合并、上移、下移
- [x] 实现合并逻辑（mergeShots 函数）
- [x] 实现排序逻辑

## 阶段 5: Storyboard 主组件适配
- [x] 添加 `onScriptChange` 回调
- [x] 添加 `onMergeUp`、`onMergeDown` 回调
- [x] 添加 `onMoveUp`、`onMoveDown` 回调
- [x] 添加 `onBatchDelete`、`onBatchConfirm` 回调
- [x] 添加 `onImagesChange`、`onVideosChange` 回调
- [x] 保存逻辑适配新字段

## 阶段 6: 测试与优化
- [ ] 功能测试：编辑、选择、合并、排序
- [ ] 样式测试：不同屏幕尺寸
- [ ] 性能测试：大量分镜时的渲染性能
