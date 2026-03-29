## MODIFIED Requirements

### Requirement: Mode-Adaptive Video Node Editing
系统 SHALL 根据视频节点当前的“导入/生成”状态以及所选视频模型能力裁剪展示内容，而不是把所有视频模式混在同一张表单里。

#### Scenario: 视频节点处于生成状态且模型仅支持一种能力
- **WHEN** 用户打开未挂载本地视频素材的视频节点
- **AND** 当前视频模型仅声明一种视频生成能力
- **THEN** 系统 MUST 直接展示该能力对应的编辑变体
- **AND** MUST 仅显示该能力所需的上游输入摘要、提示词区域和参数面板

#### Scenario: 视频节点处于生成状态且模型支持多种能力
- **WHEN** 用户打开未挂载本地视频素材的视频节点
- **AND** 当前视频模型支持多种视频生成能力
- **THEN** 系统 MUST 展示能力切换器
- **AND** 切换器 MUST 只列出该模型真实支持的能力模式
- **AND** 切换能力后 MUST 更新必填输入、参数面板和校验结果

#### Scenario: 视频节点处于导入状态
- **WHEN** 用户打开已挂载本地视频素材的视频节点
- **THEN** 系统展示视频预览、上传、替换和清空操作
- **AND** 隐藏仅生成模式有意义的提示词和能力参数

## ADDED Requirements

### Requirement: Capability-Aware Video Node Execution
灵绘 SHALL 将视频节点执行编译为能力级标准请求，再交给统一模型解析器和渠道适配器执行。

#### Scenario: 编译视频节点请求
- **WHEN** 用户执行一个处于生成态的视频节点
- **THEN** 系统 MUST 根据当前所选能力将节点内容编译为标准视频请求
- **AND** MUST 在请求中显式写入能力类型

#### Scenario: 校验上游输入
- **WHEN** 视频节点执行前发现当前输入不满足所选能力契约
- **THEN** 系统 MUST 阻止执行
- **AND** MUST 告知用户缺失的是主图、参考图还是首尾帧

### Requirement: Video Model Switching Safety
灵绘 SHALL 在视频模型或能力切换时处理不兼容的节点状态。

#### Scenario: 模型切换导致当前能力失效
- **WHEN** 用户切换到不再支持当前能力的模型
- **THEN** 系统 MUST 自动重置为该模型支持的默认能力
- **AND** MUST 提示当前已失效的输入和参数将被清理

#### Scenario: 切换后保留兼容字段
- **WHEN** 用户切换到仍兼容部分字段的能力或模型
- **THEN** 系统 MUST 保留仍然合法的提示词和公共参数
- **AND** MUST 清理不再合法的图片输入和模式特有参数
