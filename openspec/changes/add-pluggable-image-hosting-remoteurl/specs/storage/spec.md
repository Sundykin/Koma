## MODIFIED Requirements

### Requirement: Media Asset Metadata
系统 SHALL 在项目数据中保存媒体资产的结构化信息（包含本地与远程来源）。

#### Scenario: 保存 remoteUrl
- **GIVEN** 系统生成或上传了一张图片
- **WHEN** 图片已经被上传到图床并获得可访问 URL
- **THEN** 系统 MUST 将该 URL 保存到资产字段 `remoteUrl`
- **AND** 同时保留 `localPath` 作为本地缓存来源

#### Scenario: 自动补齐 remoteUrl（可配置）
- **GIVEN** TTI 生成图片输出为 base64/data-url 或仅本地路径
- **WHEN** 图片已落盘到项目目录
- **THEN** 若图床渠道启用，系统 SHOULD 自动上传并补齐 `remoteUrl`
- **AND** 上传失败时系统 SHALL 按策略降级（best-effort 不阻断，required 直接报错）

