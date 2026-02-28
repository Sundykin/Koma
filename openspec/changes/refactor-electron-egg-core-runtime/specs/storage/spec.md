## MODIFIED Requirements

### Requirement: Global Settings Storage
系统 SHALL 在存储根目录保存全局配置，并采用一次性迁移后的单一配置结构。

#### Scenario: 全局存储结构
- **WHEN** 应用运行时
- **THEN** 在 `{storageRoot}/` 下维护：
```
{storageRoot}/
├── settings.json         # 全局设置（模型配置列表、主题、快捷键等）
├── recent-projects.json  # 最近项目列表
├── projects-index.json   # 项目索引
├── model-presets/        # 模型预设导出
├── licenses/             # 许可证文件
└── logs/                 # 应用日志
```
- **AND** settings.json 仅写入新版本字段结构

#### Scenario: LLM 配置存储结构
- **WHEN** 存储 LLM 配置时
- **THEN** settings.json 使用数组化配置结构（`llmConfigs` + `defaultLLMConfigId`）
- **AND** apiKey 字段使用加密存储

#### Scenario: 设置加密
- **WHEN** 存储敏感信息（API Key）
- **THEN** 使用 AES-256-GCM 加密
- **AND** 密钥派生自机器唯一标识
- **AND** 加密字段值以 `encrypted:` 前缀标识

#### Scenario: 一次性迁移后不保留兼容层
- **WHEN** 启动时检测到旧 settings 结构
- **THEN** 执行一次性迁移并生成迁移备份
- **AND** 迁移完成后仅读取/写入新结构
- **AND** 不保留旧结构运行时兼容解析分支

### Requirement: Storage Migration
系统 SHALL 在版本升级时执行一次性迁移并保证迁移结果可验证。

#### Scenario: 版本升级迁移
- **WHEN** 应用更新且存储格式变化
- **THEN** 检测存储版本号并执行对应迁移脚本
- **AND** 迁移成功后更新版本号并写入迁移记录
- **AND** 失败时返回结构化错误并终止继续运行

#### Scenario: 项目导入
- **WHEN** 用户导入外部项目包（.koma.zip）
- **THEN** 解压到项目目录
- **AND** 验证目录结构完整性
- **AND** 注册到项目列表

#### Scenario: 项目导出
- **WHEN** 用户导出项目为包
- **THEN** 打包整个项目目录为 .koma.zip
- **AND** 包含所有素材和生成文件
- **AND** 可选择排除缓存和临时文件

### Requirement: AppSettings Structure
系统 SHALL 使用统一的应用设置结构，不保留旧版单配置字段兼容读取逻辑。

#### Scenario: 设置字段
- **WHEN** 加载 AppSettings 时
- **THEN** 包含以下媒体配置数组：
  - llmConfigs: LLMModelConfig[]
  - ttiConfigs: TTIConfig[]
  - itvConfigs: ITVConfig[]
  - ttsConfigs: TTSConfig[]
- **AND** 读取失败时返回结构化错误
- **AND** 不再执行旧版单配置字段的运行时兼容转换

## ADDED Requirements

### Requirement: Cutover Data Integrity Gate
系统 SHALL 在一次性切换阶段执行数据完整性门禁，确保进入新运行时前数据可用。

#### Scenario: 启动门禁校验
- **WHEN** 应用完成迁移准备后
- **THEN** 校验 settings.json、projects-index.json 与项目元数据结构一致性
- **AND** 校验通过才继续启动主界面

#### Scenario: 门禁失败
- **WHEN** 任一关键文件校验失败
- **THEN** 阻断启动并输出可定位的错误明细
- **AND** 不通过兼容路径忽略错误继续运行