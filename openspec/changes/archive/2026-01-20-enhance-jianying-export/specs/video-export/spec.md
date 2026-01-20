# video-export Spec Delta

## Change ID
enhance-jianying-export

## ADDED Requirements

### Requirement: REQ-EXP-005 Jianying Draft Directory Structure
系统 MUST 正确创建剪映草稿目录结构。

#### Scenario: 导出到用户选择的目录
Given 用户选择导出路径 `/path/to/export`
And 项目名为 "我的项目"
When 用户选择"导出到选择的目录"
Then 在 `/path/to/export/` 下直接创建：
  - `draft_content.json`
  - `draft_meta_info.json`
  - `materials/` 目录

#### Scenario: 导出到新建子目录
Given 用户选择导出路径 `/path/to/export`
And 项目名为 "我的项目"
When 用户选择"创建项目子目录"
Then 在 `/path/to/export/我的项目/` 下创建：
  - `draft_content.json`
  - `draft_meta_info.json`
  - `materials/` 目录

### Requirement: REQ-EXP-006 Keyframe Export
系统 MUST 支持导出关键帧动画到剪映草稿格式。

#### Scenario: 导出位置关键帧
Given 一个片段有位置关键帧
And 从 (0,0) 移动到 (100,200)
When 导出为剪映草稿
Then `common_keyframes` 包含 `KFTypePositionX` 和 `KFTypePositionY` 轨道
And 关键帧时间正确转换为微秒
And 坐标值转换为半画布单位

#### Scenario: 导出缩放关键帧
Given 一个片段有缩放关键帧
And 从 scale=1.0 变化到 scale=2.0
When 导出为剪映草稿
Then `common_keyframes` 包含 `UNIFORM_SCALE` 轨道
And 值正确映射

#### Scenario: 导出透明度关键帧
Given 一个片段有透明度关键帧
And 从 alpha=1.0 变化到 alpha=0.5
When 导出为剪映草稿
Then `common_keyframes` 包含 `KFTypeAlpha` 轨道

#### Scenario: 导出音量关键帧
Given 一个音频片段有音量关键帧
When 导出为剪映草稿
Then `common_keyframes` 包含 `KFTypeVolume` 轨道

### Requirement: REQ-EXP-007 Filter Export
系统 MUST 支持导出滤镜效果到剪映草稿格式。

#### Scenario: 导出滤镜
Given 一个片段应用了"复古"滤镜
And 滤镜强度为 80%
When 导出为剪映草稿
Then 片段包含 `filter` 对象
And `filter.intensity` 值为 0.8
And `filter.effect_id` 对应剪映滤镜 ID

### Requirement: REQ-EXP-008 Animation Export
系统 MUST 支持导出动画效果到剪映草稿格式。

#### Scenario: 导出入场动画
Given 一个片段设置了"淡入"入场动画
And 动画时长 0.5 秒
When 导出为剪映草稿
Then 片段包含 `animation.anim_in` 对象
And `duration` 为 500000 微秒

#### Scenario: 导出出场动画
Given 一个片段设置了"缩小"出场动画
And 动画时长 0.3 秒
When 导出为剪映草稿
Then 片段包含 `animation.anim_out` 对象
And `duration` 为 300000 微秒

### Requirement: REQ-EXP-009 Audio Fade Export
系统 MUST 支持导出音频淡入淡出到剪映草稿格式。

#### Scenario: 导出音频淡入
Given 一个音频片段设置了 1 秒淡入
When 导出为剪映草稿
Then 片段包含 `audio_fade.fade_in` 值为 1000000 微秒

#### Scenario: 导出音频淡出
Given 一个音频片段设置了 0.5 秒淡出
When 导出为剪映草稿
Then 片段包含 `audio_fade.fade_out` 值为 500000 微秒

### Requirement: REQ-EXP-010 Mask Export
系统 MUST 支持导出蒙版效果到剪映草稿格式。

#### Scenario: 导出圆形蒙版
Given 一个片段应用了圆形蒙版
And 中心点 (0.5, 0.5)，半径 0.3
When 导出为剪映草稿
Then 片段包含 `mask` 对象
And `mask.type` 为 "circle"
And 包含正确的中心和半径参数

#### Scenario: 导出线性蒙版
Given 一个片段应用了线性渐变蒙版
And 旋转角度 45 度
When 导出为剪映草稿
Then 片段包含 `mask` 对象
And `mask.type` 为 "linear"
And `mask.rotation` 为 45

### Requirement: REQ-EXP-011 Export Capability Indicator
系统 MUST 在导出对话框中显示功能兼容性提示。

#### Scenario: 检测高级特性使用
Given 项目使用了关键帧动画和蒙版
When 打开导出对话框
Then 显示提示："项目使用了以下仅剪映支持的特性：关键帧动画、蒙版"
And 建议使用剪映草稿导出

#### Scenario: 无高级特性
Given 项目只有基础剪辑（无关键帧、滤镜、蒙版）
When 打开导出对话框
Then 不显示兼容性警告
And 用户可自由选择导出格式

## MODIFIED Requirements

### Requirement: REQ-EXP-004 Track Composition (Modified)
系统 MUST 在导出时正确合成所有轨道，包括高级效果。

#### Scenario: 关键帧动画导出 (Enhanced)
Given 一个片段有关键帧动画
And 包含位置、旋转、缩放、透明度关键帧
When 导出为剪映草稿
Then 所有关键帧属性正确转换
And 插值类型映射为剪映格式（Line/Bezier）

#### Scenario: 滤镜和蒙版组合导出
Given 一个片段同时应用了滤镜和蒙版
When 导出为剪映草稿
Then 片段同时包含 `filter` 和 `mask` 对象
And 效果可在剪映中正确显示
