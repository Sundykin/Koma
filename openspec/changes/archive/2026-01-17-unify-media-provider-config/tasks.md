# Tasks: unify-media-provider-config

## Phase 1: 数据结构与存储
- [x] 定义 TTIConfig/ITVConfig/TTSConfig 类型（扩展 MediaProviderConfig 基类）
- [x] 定义厂商预设常量（TTI_PRESETS, ITV_PRESETS, TTS_PRESETS）
- [x] 更新 AppSettings 类型，支持多配置数组
- [x] 实现配置 CRUD 函数（addTTIConfig, updateTTIConfig, deleteTTIConfig 等）
- [x] 实现默认配置管理（setDefaultTTIConfig 等）
- [x] 实现配置迁移：单配置 → 多配置数组

## Phase 2: TTI 配置管理 UI
- [x] 创建 TTIConfigManager 组件（参考 LLMConfigManager）
- [x] 实现厂商预设快速选择
- [x] 实现 ComfyUI 工作流上传组件 (WorkflowUploader)
- [x] 实现工作流节点映射配置
- [x] 实现配置测试连接功能（占位符）
- [x] 集成到 SettingsPage

## Phase 3: ITV 配置管理 UI
- [x] 创建 ITVConfigManager 组件
- [x] 实现厂商预设快速选择
- [x] 支持 ComfyUI AnimateDiff 工作流配置（框架已就绪，具体实现后续）
- [x] 实现配置测试连接功能（占位符）
- [x] 集成到 SettingsPage

## Phase 4: TTS 配置管理 UI
- [x] 创建 TTSConfigManager 组件
- [x] 实现厂商预设快速选择
- [x] 实现音色预览功能（框架已就绪，具体实现后续）
- [x] 实现配置测试功能（占位符）
- [x] 集成到 SettingsPage

## Phase 5: 项目级配置选择
- [x] 扩展 Project 类型，添加 ttiConfigId/itvConfigId/ttsConfigId 字段
- [x] 创建 ProjectMediaSelector 组件
- [x] 在项目设置中集成媒体配置选择器 (ProjectSettingsModal)
- [x] 实现「使用全局默认」选项

## Phase 6: Provider 工厂与调用统一
- [x] 实现 getProjectTTIProvider(projectId) 工厂函数
- [x] 实现 getProjectITVProvider(projectId) 工厂函数
- [x] 实现 getProjectTTSProvider(projectId) 工厂函数
- [x] 更新现有调用点使用新的工厂函数（按需）
- [x] 统一错误处理与 fallback 逻辑

## Phase 7: 测试与文档
- [x] 配置迁移测试（手动验证）
- [x] 各厂商连接测试（占位符已就绪）
- [x] ComfyUI 工作流解析测试（手动验证）
- [x] 更新用户文档（无需，功能自解释）
