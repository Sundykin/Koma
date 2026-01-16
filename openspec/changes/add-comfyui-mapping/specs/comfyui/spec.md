## ADDED Requirements

### Requirement: Workflow JSON Import
系统 SHALL 支持导入 ComfyUI 工作流 JSON 文件。

#### Scenario: 上传工作流
- **WHEN** 用户上传 ComfyUI 导出的 workflow JSON
- **THEN** 系统解析 JSON 结构
- **AND** 识别所有节点及其连接关系
- **AND** 显示解析结果摘要

#### Scenario: 验证工作流
- **WHEN** 解析工作流时
- **THEN** 系统验证 JSON 格式正确性
- **AND** 检查必要节点是否存在
- **AND** 无效时显示具体错误

### Requirement: Node Auto-Mapping
系统 SHALL 自动识别可映射的输入节点。

#### Scenario: 识别输入节点
- **WHEN** 工作流解析完成后
- **THEN** 系统识别以下类型节点：
  - LoadImage → 图片输入
  - CLIPTextEncode → 提示词输入
  - KSampler → 采样参数
  - EmptyLatentImage → 尺寸参数
- **AND** 生成默认映射配置

#### Scenario: 区分正负提示词
- **WHEN** 存在多个 CLIPTextEncode 节点
- **THEN** 根据连接关系判断 positive/negative
- **AND** 连接到 KSampler.positive 的为正向
- **AND** 连接到 KSampler.negative 的为负向

#### Scenario: 手动调整映射
- **WHEN** 用户在映射配置面板调整
- **THEN** 可修改节点绑定关系
- **AND** 可设置默认参数值
- **AND** 保存自定义映射

### Requirement: Service Connection
系统 SHALL 支持连接本地或远程 ComfyUI 服务。

#### Scenario: 配置服务地址
- **WHEN** 用户在设置中配置 ComfyUI 服务
- **THEN** 可输入服务地址（默认 http://127.0.0.1:8188）
- **AND** 支持 HTTPS 和自定义端口

#### Scenario: 连接测试
- **WHEN** 用户点击「测试连接」
- **THEN** 系统发送测试请求到 /system_stats
- **AND** 显示连接成功/失败状态
- **AND** 失败时显示错误原因

#### Scenario: 服务发现
- **WHEN** 应用启动时
- **THEN** 自动检测本地 ComfyUI 服务
- **AND** 服务可用时显示状态指示

### Requirement: Task Execution
系统 SHALL 支持向 ComfyUI 提交执行任务。

#### Scenario: 提交任务
- **WHEN** 触发图片/视频生成
- **THEN** 系统将参数注入工作流
- **AND** 通过 /prompt API 提交任务
- **AND** 获取 prompt_id 用于跟踪

#### Scenario: 参数注入
- **WHEN** 准备执行工作流
- **THEN** 根据映射配置注入：
  - 图片数据 → LoadImage 节点
  - 正向提示词 → positive CLIPTextEncode
  - 负向提示词 → negative CLIPTextEncode
  - 种子值 → KSampler.seed
  - 其他配置参数

#### Scenario: 任务取消
- **WHEN** 用户点击「取消」
- **THEN** 系统发送中断请求到 /interrupt
- **AND** 清理未完成的任务

### Requirement: Progress Monitoring
系统 SHALL 通过 WebSocket 实时监控执行进度。

#### Scenario: 建立连接
- **WHEN** 提交任务后
- **THEN** 建立 WebSocket 连接到 /ws?clientId={clientId}
- **AND** 监听进度消息

#### Scenario: 进度更新
- **WHEN** 收到 progress 消息
- **THEN** 更新进度条显示
- **AND** 显示当前执行的节点名称

#### Scenario: 执行完成
- **WHEN** 收到 executed 消息（输出节点）
- **THEN** 下载生成的文件
- **AND** 关闭 WebSocket 连接
- **AND** 通知生成完成

#### Scenario: 错误处理
- **WHEN** 执行过程中发生错误
- **THEN** 显示错误信息
- **AND** 记录到日志
- **AND** 提供重试选项

### Requirement: Workflow Presets
系统 SHALL 支持工作流预设管理。

#### Scenario: 保存预设
- **WHEN** 用户配置好工作流和映射后点击「保存预设」
- **THEN** 保存工作流 JSON + 映射配置 + 默认参数
- **AND** 可设置预设名称和分类
- **AND** 存储到 comfyui-presets/{category}/

#### Scenario: 加载预设
- **WHEN** 用户选择已保存的预设
- **THEN** 自动加载工作流和映射配置
- **AND** 应用默认参数

#### Scenario: 预设分类
- **WHEN** 管理预设时
- **THEN** 按类型分类：TTI、ITV、Upscale、Other
- **AND** 支持筛选和搜索

#### Scenario: 预设导入/导出
- **WHEN** 用户导出预设
- **THEN** 打包为 .comfy-preset.json 文件
- **AND** 包含完整的工作流和配置
- **WHEN** 用户导入预设
- **THEN** 验证文件格式
- **AND** 处理同名冲突

### Requirement: Result Handling
系统 SHALL 处理 ComfyUI 生成的结果文件。

#### Scenario: 下载结果
- **WHEN** 任务执行完成
- **THEN** 从 /view API 下载生成的图片/视频
- **AND** 保存到项目对应目录

#### Scenario: 临时文件清理
- **WHEN** 结果下载完成后
- **THEN** 可选择清理 ComfyUI output 目录中的临时文件
