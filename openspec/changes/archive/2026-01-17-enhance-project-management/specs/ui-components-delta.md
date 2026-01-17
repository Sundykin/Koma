# Delta: ui-components/spec.md

## ADDED Requirements

### Requirement: Theme Selection UI
系统 SHALL 提供主题选择界面。

#### Scenario: 预设主题选择
- **WHEN** 用户打开项目设置
- **THEN** 显示主题选择区域
- **AND** 展示预设主题卡片（带预览图和描述）
- **AND** 选中主题高亮显示

#### Scenario: 自定义风格输入
- **WHEN** 用户选择「自定义」主题
- **THEN** 显示文本输入框
- **AND** 用户可输入自定义风格描述
- **AND** 描述将追加到 TTI 提示词

### Requirement: Episode Management UI
系统 SHALL 提供分集管理界面。

#### Scenario: 分集列表显示
- **WHEN** 项目有多个分集
- **THEN** 显示分集列表（编号、标题、状态）
- **AND** 支持点击切换当前编辑的分集
- **AND** 支持拖拽调整顺序

#### Scenario: 添加分集
- **WHEN** 用户点击「添加分集」
- **THEN** 创建新分集
- **AND** 自动编号
- **AND** 进入分集编辑状态

#### Scenario: 删除分集
- **WHEN** 用户删除分集
- **THEN** 显示确认对话框
- **AND** 删除后重新编号剩余分集

#### Scenario: 自动分集按钮
- **WHEN** 剧本字数超过阈值
- **THEN** 显示「LLM 自动分集」按钮
- **AND** 点击后调用分集服务

### Requirement: Character Asset Editor UI
系统 SHALL 提供角色资产编辑界面。

#### Scenario: 定妆照区域
- **WHEN** 编辑角色时
- **THEN** 显示定妆照预览区域
- **AND** 无图片时显示占位图和「生成」按钮
- **AND** 有图片时显示图片、「重新生成」和「上传」按钮

#### Scenario: 三视图区域
- **WHEN** 编辑角色时
- **THEN** 显示三视图网格（正面/侧面/背面）
- **AND** 每个视图独立支持生成/重新生成/上传
- **AND** 支持「一键生成三视图」

#### Scenario: 预览视频区域
- **WHEN** 编辑角色时
- **THEN** 显示预览视频播放器
- **AND** 无视频时显示「生成预览视频」按钮
- **AND** 有视频时支持播放、重新生成

#### Scenario: 角色提取绑定
- **WHEN** 角色有预览视频
- **THEN** 显示「提取角色」按钮
- **AND** 已绑定时显示 sora2CharacterId
- **AND** 支持重新提取

### Requirement: Scene Asset Editor UI
系统 SHALL 提供场景资产编辑界面。

#### Scenario: 场景预览图
- **WHEN** 编辑场景时
- **THEN** 显示预览图区域
- **AND** 支持生成/重新生成/上传

### Requirement: Prop Asset Editor UI
系统 SHALL 提供道具资产编辑界面。

#### Scenario: 道具参考图
- **WHEN** 编辑道具时
- **THEN** 显示参考图区域
- **AND** 支持生成/重新生成/上传

### Requirement: Asset Generation Wizard UI
系统 SHALL 提供资产生成向导界面。

#### Scenario: 向导步骤
- **WHEN** 用户启动资产生成向导
- **THEN** 分步引导：
  1. 角色定妆照生成
  2. 角色三视图生成
  3. 场景预览图生成
  4. 道具参考图生成
  5. 角色预览视频生成
  6. 角色提取绑定

#### Scenario: 步骤进度
- **WHEN** 向导进行中
- **THEN** 显示步骤进度条
- **AND** 已完成步骤显示勾选
- **AND** 当前步骤高亮

#### Scenario: 步骤内编辑
- **WHEN** 某个步骤生成完成
- **THEN** 显示生成结果列表
- **AND** 每项支持：查看、重新生成、跳过
- **AND** 确认后进入下一步

#### Scenario: 批量生成
- **WHEN** 步骤内有多个待生成项
- **THEN** 显示「全部生成」按钮
- **AND** 并发或串行生成（根据配置）
- **AND** 显示整体进度

### Requirement: Asset Generation Progress
系统 SHALL 显示资产生成进度。

#### Scenario: 单个资产生成进度
- **WHEN** 生成单个资产
- **THEN** 显示加载动画
- **AND** 显示当前状态（排队中/生成中/完成）
- **AND** 生成完成后自动显示结果

#### Scenario: 批量生成进度
- **WHEN** 批量生成资产
- **THEN** 显示总进度条
- **AND** 显示已完成/总数量
- **AND** 显示当前正在生成的项目名称

### Requirement: Task Status Notifications
系统 SHALL 显示异步任务状态通知。

#### Scenario: 任务开始通知
- **WHEN** 创建新的生成任务
- **THEN** 显示 Toast 通知 "正在生成 {资产名称}..."
- **AND** 通知自动消失（3秒）

#### Scenario: 任务完成通知
- **WHEN** 任务状态变为 completed
- **THEN** 显示成功 Toast "XXX 生成成功"
- **AND** 通知带有查看按钮
- **AND** 点击查看按钮跳转到对应资产

#### Scenario: 任务失败通知
- **WHEN** 任务状态变为 failed
- **THEN** 显示错误 Toast "XXX 生成失败: {错误原因}"
- **AND** 通知带有重试按钮
- **AND** 点击重试按钮触发任务重试
- **AND** 通知不自动消失，需手动关闭

#### Scenario: 任务恢复通知
- **WHEN** 项目打开时检测到未完成任务
- **THEN** 显示提示 "检测到 {N} 个未完成任务，正在恢复..."
- **AND** 恢复完成后显示结果摘要

#### Scenario: 彻底失败通知
- **WHEN** 任务重试次数超过上限
- **THEN** 显示错误 Toast "XXX 生成失败，已达最大重试次数"
- **AND** 提示用户手动重新生成

### Requirement: Task List Panel
系统 SHALL 提供任务列表面板。

#### Scenario: 任务列表入口
- **WHEN** 有进行中或失败的任务
- **THEN** 在状态栏显示任务图标和数量
- **AND** 点击图标展开任务面板

#### Scenario: 任务列表内容
- **WHEN** 展开任务面板
- **THEN** 显示所有任务列表
- **AND** 每个任务显示：类型图标、目标名称、状态、进度
- **AND** 支持按状态筛选（全部/进行中/已完成/失败）

#### Scenario: 任务操作
- **WHEN** 查看任务列表
- **THEN** 进行中任务显示进度条
- **AND** 失败任务显示重试按钮
- **AND** 已完成任务显示查看按钮
- **AND** 支持清除已完成任务

### Requirement: Save Status Indicator
系统 SHALL 显示保存状态指示器。

#### Scenario: 指示器位置
- **WHEN** 用户在编辑器中
- **THEN** 在标题栏右侧显示保存状态

#### Scenario: 未保存状态
- **WHEN** 项目有未保存的变更
- **THEN** 显示圆点指示器 "●"
- **AND** 鼠标悬停显示 "有未保存的更改"

#### Scenario: 保存中状态
- **WHEN** 正在保存项目
- **THEN** 显示加载动画
- **AND** 文字显示 "保存中..."

#### Scenario: 已保存状态
- **WHEN** 项目已保存且无新变更
- **THEN** 显示勾选图标 "✓"
- **AND** 鼠标悬停显示 "所有更改已保存"

#### Scenario: 保存失败状态
- **WHEN** 保存操作失败
- **THEN** 显示错误图标
- **AND** 鼠标悬停显示错误原因
- **AND** 点击可重试保存

#### Scenario: 手动保存
- **WHEN** 用户点击保存状态指示器
- **THEN** 触发手动保存
- **AND** 显示保存结果

### Requirement: Keyboard Shortcuts
系统 SHALL 支持保存快捷键。

#### Scenario: Ctrl+S 保存
- **WHEN** 用户按下 Ctrl+S (Windows) 或 Cmd+S (Mac)
- **THEN** 触发项目保存
- **AND** 显示短暂的保存成功提示
- **AND** 阻止浏览器默认保存行为
