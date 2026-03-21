## MODIFIED Requirements

### Requirement: Image To Video Generation Inputs
系统 SHALL 在图生视频调用中保证 primaryImage（以及可选 refs）可被远程服务访问。

#### Scenario: primaryImage 优先 remoteUrl
- **GIVEN** primaryImage 为 `StoredMediaAsset{remoteUrl}`
- **WHEN** 系统调用远程 ITV Provider
- **THEN** 系统 MUST 使用 `remoteUrl` 作为图片输入

#### Scenario: primaryImage 自动上传以获取 remoteUrl
- **GIVEN** primaryImage 缺少 `remoteUrl`（仅 localPath 或 data-url）
- **WHEN** 系统调用远程 ITV Provider 且图床启用
- **THEN** 系统 MUST 上传 primaryImage 并使用得到的 `remoteUrl`

#### Scenario: 图床禁用时的失败策略（required）
- **GIVEN** primaryImage 缺少 `remoteUrl`
- **AND** 目标 ITV Provider 不接受 data-url 或强制 URL
- **WHEN** 图床未启用或上传失败
- **THEN** 系统 MUST 失败并提示用户启用图床或检查图床配置

#### Scenario: Provider 支持 data-url 时的失败策略（best-effort）
- **GIVEN** primaryImage 缺少 `remoteUrl`
- **AND** 目标 ITV Provider 允许 data-url 输入
- **WHEN** 图床未启用或上传失败
- **THEN** 系统 SHOULD 回退为 data-url（base64）并继续提交 ITV 任务
