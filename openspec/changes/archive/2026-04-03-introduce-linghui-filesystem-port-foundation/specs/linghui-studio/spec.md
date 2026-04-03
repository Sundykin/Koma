## ADDED Requirements

### Requirement: Portable Linghui File Access

灵绘 SHALL 通过可替换的文件系统端口解析本地资源预览、落盘中间素材并写出结果，而不是在功能模块中直接依赖单一宿主文件系统实现。

#### Scenario: 通过文件系统端口解析本地预览 URL

- **WHEN** 灵绘节点、提示词引用或结果面板需要展示本地文件资源
- **THEN** 系统 MUST 通过当前激活的文件系统端口生成可展示的 URL
- **AND** 对于远程 URL、`data:` URL、`blob:` URL 和 `koma-local://` 资源 MUST 保持原值不变

#### Scenario: 通过文件系统端口落盘中间素材和导出结果

- **WHEN** 灵绘执行宫格切分输入持久化或结果导出写盘
- **THEN** 系统 MUST 通过当前激活的文件系统端口完成目录创建、文件写入、复制或下载
- **AND** 调用方 MUST 不再直接依赖宿主级 `electronService.fs` API

### Requirement: Explicit Runtime Capability Boundaries For Linghui File Actions

灵绘 SHALL 为依赖特定文件系统能力的操作提供显式边界提示，避免在非支持运行时中静默失败。

#### Scenario: 当前运行时不支持目录选择导出

- **WHEN** 用户在不支持目录选择能力的运行时中执行灵绘结果导出
- **THEN** 系统 MUST 阻止导出
- **AND** MUST 明确提示当前文件系统实现不支持结果导出

#### Scenario: 当前运行时不支持本地路径型宫格切分

- **WHEN** 用户在不支持原生本地路径能力的运行时中执行宫格切分
- **THEN** 系统 MUST 阻止该操作
- **AND** MUST 明确提示当前文件系统实现不支持宫格切分
