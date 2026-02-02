# ui-components Spec Delta

## ADDED Requirements

### Requirement: TTI Config Manager Component
系统 SHALL 提供文生图配置管理组件。

#### Scenario: 配置列表展示
- **WHEN** 用户进入 TTI 设置页
- **THEN** 以卡片列表展示所有 TTI 配置
- **AND** 显示名称、厂商类型、默认标记
- **AND** 提供「添加配置」按钮

#### Scenario: 配置编辑
- **WHEN** 用户点击「添加」或「编辑」按钮
- **THEN** 打开配置编辑弹窗
- **AND** 显示厂商预设快速选择
- **AND** ComfyUI 类型显示工作流上传区域
- **AND** 填写完成后保存

#### Scenario: 测试连接
- **WHEN** 用户点击「测试连接」按钮
- **THEN** 系统验证 API 可用性
- **AND** 显示成功或失败状态

### Requirement: ITV Config Manager Component
系统 SHALL 提供图生视频配置管理组件。

#### Scenario: 配置列表展示
- **WHEN** 用户进入 ITV 设置页
- **THEN** 以卡片列表展示所有 ITV 配置
- **AND** 显示名称、厂商类型、默认时长

#### Scenario: 配置编辑
- **WHEN** 用户编辑 ITV 配置
- **THEN** 可选择厂商预设
- **AND** 配置默认时长、分辨率
- **AND** ComfyUI AnimateDiff 类型支持工作流上传

### Requirement: TTS Config Manager Component
系统 SHALL 提供语音合成配置管理组件。

#### Scenario: 配置列表展示
- **WHEN** 用户进入 TTS 设置页
- **THEN** 以卡片列表展示所有 TTS 配置
- **AND** 显示名称、厂商类型、默认音色

#### Scenario: 音色试听
- **WHEN** 用户配置 TTS 时
- **THEN** 可选择音色并试听效果
- **AND** 播放示例语音

### Requirement: Workflow Uploader Component
系统 SHALL 提供 ComfyUI 工作流上传组件。

#### Scenario: 文件上传
- **WHEN** 用户上传工作流 JSON 文件
- **THEN** 系统解析并验证格式
- **AND** 显示工作流名称和节点数量
- **AND** 提供「查看节点」和「删除」操作

#### Scenario: 节点映射配置
- **WHEN** 用户点击「配置映射」
- **THEN** 显示可映射的输入节点列表
- **AND** 用户为每个系统输入选择对应节点 ID
- **AND** 支持：正向提示词、负向提示词、图片输入、种子、尺寸等

### Requirement: Project Media Selector Component
系统 SHALL 提供项目级媒体配置选择组件。

#### Scenario: 配置选择
- **WHEN** 在项目设置中配置媒体服务
- **THEN** 显示 TTI/ITV/TTS 三个下拉选择器
- **AND** 选项包含「使用全局默认」+ 所有已配置项
- **AND** 显示当前选中配置的简要信息

#### Scenario: 快捷入口
- **WHEN** 用户需要添加新配置
- **THEN** 选择器提供「前往设置」快捷链接
- **AND** 点击后跳转到对应的全局设置页
