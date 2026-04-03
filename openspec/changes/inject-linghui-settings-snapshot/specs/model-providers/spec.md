## ADDED Requirements

### Requirement: Snapshot-Aware Project Provider Resolution

系统 SHALL 支持调用方在解析项目级 LLM、TTI、ITV、TTS provider 时显式传入 settings snapshot。

#### Scenario: 使用显式 settings snapshot 解析 provider

- **WHEN** 调用方在解析项目级 provider 时提供 settings snapshot
- **THEN** provider factory MUST 使用该 snapshot 解析渠道与模型
- **AND** MUST NOT 为这次解析再读取全局 settings store

#### Scenario: 未提供 settings snapshot 时保持兼容

- **WHEN** 调用方在解析项目级 provider 时未提供 settings snapshot
- **THEN** provider factory MUST 保持现有行为
- **AND** MUST 从全局 settings store 读取当前配置后继续解析
