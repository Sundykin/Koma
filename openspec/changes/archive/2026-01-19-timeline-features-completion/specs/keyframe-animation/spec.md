# keyframe-animation Specification

## Purpose
定义关键帧动画系统的快捷操作需求。

## ADDED Requirements

### Requirement: REQ-KF-SHORTCUT-001 Add Keyframe Shortcut
系统 MUST 支持 K 键快捷添加关键帧。

#### Scenario: K 键添加关键帧
Given 用户选中一个视频/图片片段
And 播放头在片段范围内
When 用户按下 K 键
Then 在播放头位置添加关键帧
And 关键帧使用当前属性值
And 显示成功提示

#### Scenario: K 键添加失败（无选中片段）
Given 没有选中任何片段
When 用户按下 K 键
Then 显示提示"请先选中一个片段"
And 不添加关键帧

#### Scenario: K 键添加失败（播放头不在范围内）
Given 用户选中一个片段
And 播放头不在片段时间范围内
When 用户按下 K 键
Then 显示提示"播放头不在片段范围内"
And 不添加关键帧

### Requirement: REQ-KF-COPY-001 Keyframe Copy Paste
系统 SHALL 支持关键帧复制粘贴功能。

#### Scenario: 复制关键帧
Given 用户选中一个关键帧
When 用户右键点击选择"复制"
Then 关键帧数据被复制到剪贴板
And 显示"关键帧已复制"提示

#### Scenario: 粘贴关键帧
Given 剪贴板中有关键帧数据
And 用户选中一个片段
And 播放头在片段范围内
When 用户右键点击选择"粘贴关键帧"
Then 在播放头位置创建关键帧
And 使用复制的属性值

## MODIFIED Requirements

### Requirement: REQ-KF-MENU-001 Keyframe Context Menu (Modified)
系统 MUST 提供完整的关键帧右键菜单。

#### Scenario: 关键帧右键菜单包含复制
Given 用户右键点击关键帧
Then 菜单包含"复制"选项
And 菜单包含"删除"选项
And 菜单包含缓动类型选择
