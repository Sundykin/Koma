# prompt-templates (delta)

## MODIFIED Requirements

### Requirement: AI Call Debug Logging
系统 SHALL 打印所有 AI 调用的完整提示词。

#### Scenario: 渠道启用编译时打印编译详情与请求体
- **GIVEN** 当前渠道启用了 prompt compilation protocol（例如 Grok `@imageN` 协议）
- **WHEN** 系统向该渠道发起 start 请求（TTI/ITV）
- **THEN** 系统 MUST 打印编译前 prompt 与编译后 prompt
- **AND** 系统 MUST 打印引用映射（资产 ID → imageN 索引）
- **AND** 系统 MUST 打印最终请求体（request body）用于精细调参
- **AND** 日志 MUST 脱敏敏感字段（例如 Authorization）
- **AND** 对超长 base64 或 data-url 内容，日志 SHOULD 以摘要/截断形式输出，避免刷屏与泄露风险

