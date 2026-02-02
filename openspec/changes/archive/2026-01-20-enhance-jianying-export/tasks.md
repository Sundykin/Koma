# Tasks: enhance-jianying-export

## 阶段 1：修复目录结构问题

### 1.1 分析当前目录结构逻辑
- [x] 确认 `SimpleExportDialog.tsx` 中目录创建逻辑
- [x] 确认 `JianyingExporter.ts` 中输出路径处理
- [x] 对比 `pyJianYingDraft/draft_folder.py` 的正确结构

### 1.2 修复导出目录结构
- [x] 修改 `SimpleExportDialog.tsx` 的路径计算逻辑
- [x] 确保 `draft_content.json` 和 `draft_meta_info.json` 直接在选择的目录下
- [x] 确保 `materials/` 目录在正确位置
- [x] 添加选项：是否创建以项目名命名的子目录

## 阶段 2：扩展数据模型

### 2.1 定义类型
- [x] 在 `types/editor.ts` 中添加 `JianyingKeyframe` 和 `JianyingKeyframeTrack` 类型
- [x] 添加 `ClipFilter` 类型
- [x] 添加 `ClipAnimation` 类型
- [x] 添加 `AudioFade` 类型
- [x] 添加 `ClipMask` 类型
- [x] 添加 `ClipTransition` 类型

### 2.2 扩展 Shot/Clip 类型
- [x] 在 `Clip` 类型中添加可选的高级属性字段
  - jianyingKeyframeTracks
  - filter
  - animations
  - audioFade
  - mask
  - transition

## 阶段 3：实现剪映格式转换

### 3.1 创建转换工具函数
- [x] 创建 `jianyingUtils.ts` 文件
- [x] 实现 `pixelToHalfCanvas()` 坐标转换
- [x] 实现 `secondsToMicroseconds()` 时间转换
- [x] 实现关键帧曲线类型映射

### 3.2 实现关键帧导出
- [x] 参考 `pyJianYingDraft/keyframe.py` 实现 `buildKeyframeLists()`
- [x] 支持所有关键帧属性类型
- [x] 正确生成 `common_keyframes` 数组

### 3.3 实现滤镜导出
- [x] 实现 `buildFilter()` 函数
- [x] 支持滤镜强度参数

### 3.4 实现动画导出
- [x] 参考 `pyJianYingDraft/video_segment.py` 的 `VideoAnimation` 结构
- [x] 实现 `buildAnimations()` 函数

### 3.5 实现音频淡入淡出导出
- [x] 参考 `pyJianYingDraft/audio_segment.py` 的 `AudioFade` 结构
- [x] 实现 `buildAudioFade()` 函数

### 3.6 实现蒙版导出
- [x] 参考 `pyJianYingDraft/video_segment.py` 的 `Mask` 结构
- [x] 实现 `buildMask()` 函数
- [x] 支持各类型蒙版（线性、镜像、圆形、矩形、心形、星形）

### 3.7 实现转场导出
- [x] 实现 `buildTransition()` 函数

### 3.8 更新 JianyingExporter
- [x] 集成所有转换函数
- [x] 修改 `extractMaterials()` 收集高级属性素材
- [x] 修改 `convertClip()` 添加关键帧

## 阶段 4：编辑器 UI 支持

### 4.1 关键帧编辑器
- [x] 已有现成的关键帧编辑功能（在 `SimplePropertiesPanel.tsx` 中）

### 4.2 滤镜面板
- [x] 在 `SimplePropertiesPanel.tsx` 中添加滤镜选择和强度控制
- [x] 支持预设滤镜列表（暖色、冷色、复古、黑白、鲜艳）
- [x] 滤镜强度滑块控制

### 4.3 动画面板
- [x] 在 `SimplePropertiesPanel.tsx` 中添加动画选择
- [x] 入场动画选择（淡入、左滑入、右滑入、放大入）
- [x] 出场动画选择（淡出、左滑出、右滑出、缩小出）
- [x] 动画时长设置

### 4.4 音频控制
- [x] 在 `SimplePropertiesPanel.tsx` 中添加音频淡入淡出控制
- [x] 淡入时长滑块（0-3秒）
- [x] 淡出时长滑块（0-3秒）

### 4.5 蒙版编辑器
- [x] 在 `SimplePropertiesPanel.tsx` 中添加蒙版编辑
- [x] 蒙版类型选择（线性、镜像、圆形、矩形、心形、星形）
- [x] 蒙版参数调整（大小、羽化、旋转、反转）

### 4.6 集成到属性面板
- [x] 所有控件已集成到 `SimplePropertiesPanel.tsx`
- [x] 根据片段类型显示相应控件：
  - 视频/图片：滤镜、动画、蒙版
  - 音频：淡入淡出
  - 文本：动画

## 阶段 5：功能兼容性提示

### 5.1 导出能力检测
- [x] 创建 `exportCapabilityChecker.ts`
- [x] 检测项目中使用的高级特性
- [x] 返回兼容性报告

### 5.2 更新导出对话框
- [x] 在 `SimpleExportDialog.tsx` 中显示兼容性提示
- [x] 如果有仅剪映支持的特性，提示用户

## 阶段 6：测试与验证

### 6.1 单元测试
- [ ] 测试坐标/时间转换函数
- [ ] 测试关键帧格式生成
- [ ] 测试滤镜/动画/蒙版格式生成

### 6.2 集成测试
- [ ] 测试完整导出流程
- [ ] 测试目录结构正确性

### 6.3 兼容性验证
- [ ] 在剪映中打开导出的草稿
- [ ] 验证关键帧动画效果
- [ ] 验证滤镜效果
- [ ] 验证蒙版效果
- [ ] 验证音频淡入淡出效果

## 依赖关系

```
阶段1 (目录修复) - 已完成 ✅
阶段2 (数据模型) - 已完成 ✅
阶段3 (格式转换) - 已完成 ✅
阶段4 (编辑器UI) - 已完成 ✅
阶段5 (兼容性提示) - 已完成 ✅
阶段6 (测试) - 待用户手动验证
```

## 完成状态

✅ **全部核心功能已完成**

- 阶段1：目录结构修复 - 完成
- 阶段2：数据模型扩展 - 完成
- 阶段3：剪映格式转换 - 完成
- 阶段4：编辑器UI - 完成
- 阶段5：功能兼容性提示 - 完成
- 阶段6：测试验证 - 待用户手动验证
