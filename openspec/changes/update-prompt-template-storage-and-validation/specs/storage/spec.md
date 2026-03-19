## MODIFIED Requirements

### Requirement: Global Settings Storage
系统 SHALL 在存储根目录保存全局配置。

#### Scenario: 全局存储结构
- **WHEN** 应用运行时
- **THEN** 在 `{storageRoot}/` 下维护：
```
{storageRoot}/
├── settings.json         # 全局设置（模型配置列表、Prompt 模板 overrides、主题、快捷键等）
├── recent-projects.json  # 最近项目列表
├── model-presets/        # 模型预设导出
│   └── {presetName}.json
├── licenses/             # 许可证文件
└── logs/                 # 应用日志
    └── {date}.log
```

#### Scenario: Prompt template overrides stored in settings
- **WHEN** 用户保存自定义 Prompt 模板
- **THEN** 系统 MUST 将模板 override 写入 `settings.json.promptTemplates`
- **AND** 系统 SHALL 不再以运行时真源依赖独立 `prompt-templates.json`

#### Scenario: Legacy prompt template storage migration
- **WHEN** 系统检测到旧的 `prompt-templates.json` 或旧浏览器模板存储
- **THEN** 系统 MUST 将旧模板 overrides 迁移到 `settings.json.promptTemplates`
- **AND** 若同一模板在新旧位置同时存在，系统 MUST 以 `settings.json` 为准
- **AND** 系统 SHALL 备份或清理旧模板存储，避免重复真源
