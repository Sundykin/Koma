# storage Spec Delta

## ADDED Requirements

### Requirement: Multi-Media Config Storage
系统 SHALL 支持多媒体配置的持久化存储。

#### Scenario: 配置数组存储
- **WHEN** 保存 AppSettings 时
- **THEN** ttiConfigs、itvConfigs、ttsConfigs 作为数组存储
- **AND** 每个配置项的 apiKey 字段加密存储
- **AND** 保持数组格式不被转换为对象

#### Scenario: ComfyUI 工作流存储
- **WHEN** 用户上传 ComfyUI 工作流
- **THEN** 工作流 JSON 存储到 `~/.koma/workflows/{configId}.json`
- **AND** 配置中保存文件路径引用
- **AND** 删除配置时同步删除工作流文件

### Requirement: Config Migration
系统 SHALL 支持旧版单配置到多配置的迁移。

#### Scenario: TTI 配置迁移
- **WHEN** 检测到旧版 tti 单配置
- **THEN** 自动转换为 ttiConfigs 数组的第一项
- **AND** 设置 isDefault 为 true
- **AND** 清除旧版 tti 字段

#### Scenario: ITV 配置迁移
- **WHEN** 检测到旧版 itv 单配置
- **THEN** 自动转换为 itvConfigs 数组的第一项
- **AND** 设置 isDefault 为 true

#### Scenario: TTS 配置迁移
- **WHEN** 检测到旧版 tts 单配置
- **THEN** 自动转换为 ttsConfigs 数组的第一项
- **AND** 设置 isDefault 为 true

## MODIFIED Requirements

### Requirement: AppSettings Structure
系统 SHALL 使用统一的应用设置结构。

#### Scenario: 设置字段
- **WHEN** 加载 AppSettings 时
- **THEN** 包含以下媒体配置数组：
  - llmConfigs: LLMModelConfig[]
  - ttiConfigs: TTIConfig[]
  - itvConfigs: ITVConfig[]
  - ttsConfigs: TTSConfig[]
- **AND** 兼容处理旧版单配置字段
