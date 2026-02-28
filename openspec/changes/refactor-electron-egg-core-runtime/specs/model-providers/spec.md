## MODIFIED Requirements

### Requirement: Provider Registry
系统 SHALL 由后端统一 Provider Registry 管理模型提供者，并作为唯一注册与获取入口。

#### Scenario: 注册提供者
- **WHEN** 应用启动时
- **THEN** 主进程注册所有启用的内置提供者并完成初始化
- **AND** 前端仅通过 IPC 读取可用 Provider 列表与状态

#### Scenario: 获取提供者
- **WHEN** 需要调用模型能力时
- **THEN** 根据当前生效配置从后端 Provider Registry 获取实例
- **AND** 如果配置无效则返回结构化错误
- **AND** 不通过前端本地注册表直接构造 Provider

### Requirement: Official Providers Only
系统 SHALL 默认仅展示并启用官方渠道配置选项。

#### Scenario: TTI 渠道列表
- **WHEN** 用户打开 TTI 配置
- **THEN** TTI_PRESETS 仅包含 nano-banana（官方）
- **AND** 不展示第三方渠道选项

#### Scenario: ITV 渠道列表
- **WHEN** 用户打开 ITV 配置
- **THEN** ITV_PRESETS 仅包含 sora2（官方）
- **AND** 不展示第三方渠道选项

#### Scenario: 无兼容映射
- **WHEN** 旧项目包含历史第三方 provider key
- **THEN** 系统在迁移阶段将其标记为无效并提示用户重新选择
- **AND** 不保留旧 key 到新 key 的运行时兼容映射

## ADDED Requirements

### Requirement: Provider Runtime Single Path
系统 SHALL 在一次性切换后仅保留单一路径的 Provider 运行时调用链。

#### Scenario: 调用路径唯一
- **WHEN** 任意模块触发模型调用
- **THEN** 请求统一进入后端 Provider Registry -> Provider 实例 -> 响应回传链路
- **AND** 不允许并存的 legacy provider 调用分支

#### Scenario: 健康检查失败处理
- **WHEN** Provider 初始化或健康检查失败
- **THEN** 返回可诊断错误并阻止该 Provider 被选为可用项
- **AND** 不通过兼容降级分支继续执行