## ADDED Requirements

### Requirement: Storyboard Editable Script Content
系统 SHALL 支持在分镜列表中直接编辑剧本文案。

#### Scenario: 内联编辑剧本
- **WHEN** 用户点击分镜行的剧本文案区域
- **THEN** 该区域变为可编辑状态
- **AND** 用户可以直接修改文案内容
- **AND** 失去焦点时自动保存

### Requirement: Enhanced Row Height
系统 SHALL 增加分镜列表每行的高度以改善内容展示。

#### Scenario: 行高配置
- **WHEN** 显示分镜列表
- **THEN** 每行最小高度为 180px
- **AND** 内容可自适应撑开高度

### Requirement: Optimized Prompt Editor Layout
系统 SHALL 调整提示词编辑器的布局，减少宽度增加高度。

#### Scenario: 提示词编辑器尺寸
- **WHEN** 显示分镜行的提示词编辑器
- **THEN** 编辑器宽度固定为 280px
- **AND** 编辑器默认高度为 5 行（约 120px）
- **AND** 内容超出时可滚动

### Requirement: Multi-Image Card Grid
系统 SHALL 支持分镜的多张参考图管理，以卡片网格形式展示。

#### Scenario: 图片卡片网格展示
- **WHEN** 显示分镜的参考图区域
- **THEN** 以卡片网格形式展示所有候选图片
- **AND** 每张卡片显示缩略图
- **AND** 最后显示添加按钮卡片

#### Scenario: 图片选中状态
- **WHEN** 用户点击某张图片卡片
- **THEN** 该图片被标记为当前使用的参考图
- **AND** 显示绿色边框和勾选标记

#### Scenario: 图片添加
- **WHEN** 用户点击添加按钮或从资产选择图片
- **THEN** 新图片添加到候选列表
- **AND** 可从角色、场景、道具资产中选择

#### Scenario: 图片删除
- **WHEN** 用户删除某张候选图片
- **THEN** 该图片从列表移除
- **AND** 如果删除的是当前选中图片，自动选中第一张

### Requirement: Multi-Video Card Grid
系统 SHALL 支持分镜的多版本视频管理，以卡片网格形式展示。

#### Scenario: 视频卡片网格展示
- **WHEN** 显示分镜的视频区域
- **THEN** 以卡片网格形式展示所有视频版本
- **AND** 每个卡片显示版本号和缩略图

#### Scenario: 视频选中状态
- **WHEN** 用户点击某个视频卡片
- **THEN** 该视频被标记为当前使用的版本
- **AND** 显示绿色边框和勾选标记

#### Scenario: 视频弹窗播放
- **WHEN** 用户点击视频卡片的播放按钮
- **THEN** 弹出视频播放窗口
- **AND** 视频自动播放
- **AND** 可关闭弹窗

#### Scenario: 行内生成视频
- **WHEN** 用户点击视频区域的「AI生成视频」按钮
- **THEN** 启动该分镜的视频生成任务
- **AND** 按钮显示加载状态
- **AND** 生成完成后新版本添加到卡片网格

### Requirement: Batch Selection
系统 SHALL 支持分镜的批量选择操作。

#### Scenario: 行选择复选框
- **WHEN** 显示分镜列表
- **THEN** 每行左侧显示复选框
- **AND** 点击复选框切换选中状态

#### Scenario: 全选功能
- **WHEN** 用户点击表头的全选复选框
- **THEN** 选中或取消选中所有分镜

#### Scenario: 批量操作工具栏
- **WHEN** 有分镜被选中
- **THEN** 工具栏显示批量操作按钮
- **AND** 包括批量删除、批量确认、批量取消确认

### Requirement: Shot Merge Operation
系统 SHALL 支持分镜的向上合并和向下合并操作。

#### Scenario: 向上合并
- **WHEN** 用户点击「向上合并」操作
- **AND** 当前行不是第一行
- **THEN** 当前行与上一行合并
- **AND** 合并后的分镜保留在上一行的位置
- **AND** 当前行被删除

#### Scenario: 向下合并
- **WHEN** 用户点击「向下合并」操作
- **AND** 当前行不是最后一行
- **THEN** 当前行与下一行合并
- **AND** 合并后的分镜保留在当前行的位置
- **AND** 下一行被删除

#### Scenario: 合并内容计算
- **WHEN** 两个分镜合并
- **THEN** 剧本文案拼接（换行分隔）
- **AND** 提示词拼接（双换行分隔）
- **AND** 时长相加
- **AND** 涉及角色去重合并
- **AND** 台词拼接（换行分隔）
- **AND** 候选图片合并
- **AND** 视频版本合并

### Requirement: Shot Reorder Operation
系统 SHALL 支持分镜的顺序调整操作。

#### Scenario: 上移分镜
- **WHEN** 用户点击「上移」操作
- **AND** 当前行不是第一行
- **THEN** 当前分镜与上一个分镜交换位置

#### Scenario: 下移分镜
- **WHEN** 用户点击「下移」操作
- **AND** 当前行不是最后一行
- **THEN** 当前分镜与下一个分镜交换位置

## MODIFIED Requirements

### Requirement: Interactive Components
系统 SHALL 使用 Antd 交互组件提升用户体验。

#### Scenario: Tab 导航
- **WHEN** 用户在资产管理页面切换标签
- **THEN** 使用 Antd Tabs 组件
- **AND** 支持动画过渡

#### Scenario: 图片预览
- **WHEN** 用户点击资产缩略图
- **THEN** 使用 Antd Image 组件显示预览
- **AND** 支持缩放和关闭

#### Scenario: 通知提示
- **WHEN** 操作成功或失败时
- **THEN** 使用 Antd message 或 notification 显示提示
- **AND** 自动消失或可手动关闭

#### Scenario: 视频播放弹窗
- **WHEN** 用户触发视频预览
- **THEN** 使用 Antd Modal 显示视频播放器
- **AND** 支持全屏播放
- **AND** 点击遮罩可关闭
