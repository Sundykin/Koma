## MODIFIED Requirements

### Requirement: Global Settings Storage
系统 SHALL 在存储根目录保存全局配置。

#### Scenario: 全局存储结构
- **WHEN** 应用运行时
- **THEN** 在 `{storageRoot}/` 下维护：
```
{storageRoot}/
├── settings.json         # 全局设置（模型配置列表、主题、快捷键等）
├── recent-projects.json  # 最近项目列表
├── model-presets/        # 模型预设导出
│   └── {presetName}.json
├── licenses/             # 许可证文件
└── logs/                 # 应用日志
    └── {date}.log
```

#### Scenario: LLM 配置存储结构
- **WHEN** 存储 LLM 配置时
- **THEN** settings.json 中使用以下结构：
```json
{
  "llmConfigs": [
    {
      "id": "uuid",
      "name": "DeepSeek Chat",
      "provider": "openai-compatible",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "encrypted:xxx",
      "modelName": "deepseek-chat",
      "isDefault": true,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ],
  "defaultLLMConfigId": "uuid"
}
```
- **AND** apiKey 字段使用加密存储

#### Scenario: 设置加密
- **WHEN** 存储敏感信息（API Key）
- **THEN** 使用 AES-256-GCM 加密
- **AND** 密钥派生自机器唯一标识
- **AND** 加密字段值以 `encrypted:` 前缀标识

#### Scenario: 旧配置迁移
- **WHEN** 检测到旧的单模型配置格式（llm 字段为对象）
- **THEN** 自动迁移为新的数组格式
- **AND** 原配置作为第一个配置项且设为默认
- **AND** 备份原 settings.json 为 settings.json.bak

### Requirement: Project Storage Structure
系统 SHALL 为每个项目创建独立的存储目录。

#### Scenario: 项目完整数据文件 (project.json)
- **WHEN** 保存项目完整数据时
- **THEN** project.json 包含：
  - 剧本文本 (scriptText)
  - 角色列表 (characters)
  - 场景列表 (scenes)
  - 道具列表 (props)
  - 分镜列表 (shots)
  - 项目级设置 (settings)
  - **llmConfigId**: 关联的 LLM 配置 ID（可选，null 表示使用全局默认）
- **AND** 此文件在打开项目时加载

#### Scenario: 项目元数据文件 (meta.json)
- **WHEN** 保存项目元数据时
- **THEN** meta.json 包含：
  - id, title, genre, mode
  - status: 'script' | 'storyboard' | 'generating' | 'completed'
  - thumbnail: 项目封面路径
  - episodes: 集数
  - createdAt, updatedAt
  - **llmConfigId**: 关联的 LLM 配置 ID（可选）
- **AND** 此文件用于快速列表显示，不包含完整项目数据

## ADDED Requirements

### Requirement: Project LLM Configuration
系统 SHALL 支持项目级别的 LLM 模型配置。

#### Scenario: 新建项目默认配置
- **WHEN** 创建新项目时
- **THEN** 自动关联全局默认 LLM 配置
- **AND** 如果没有全局默认配置，llmConfigId 为 null

#### Scenario: 切换项目模型
- **WHEN** 用户在项目设置中选择不同的 LLM 模型
- **THEN** 更新项目的 llmConfigId
- **AND** 后续该项目的 LLM 调用使用新选择的模型

#### Scenario: 使用全局默认
- **WHEN** 用户选择「使用全局默认」选项
- **THEN** 将 llmConfigId 设为 null
- **AND** 项目将动态使用当前的全局默认配置

#### Scenario: 引用的配置被删除
- **WHEN** 项目引用的 LLM 配置被删除
- **THEN** 系统检测到无效引用
- **AND** 自动回退到使用全局默认配置
- **AND** 显示提示告知用户
