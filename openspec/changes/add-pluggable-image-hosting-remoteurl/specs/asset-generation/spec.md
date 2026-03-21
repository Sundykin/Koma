## MODIFIED Requirements

### Requirement: Reference Images For TTI
系统 SHALL 支持在文生图/图生图时传入参考图片，并在远程调用时优先使用 `remoteUrl`。

#### Scenario: references 优先 remoteUrl
- **GIVEN** references 中存在 `StoredMediaAsset{remoteUrl}`
- **WHEN** 系统调用远程 TTI Provider
- **THEN** 系统 MUST 优先使用 `remoteUrl` 作为参考输入

#### Scenario: references 自动上传以获取 remoteUrl
- **GIVEN** references 仅有本地路径或 data-url
- **WHEN** 系统调用远程 TTI Provider 且图床启用
- **THEN** 系统 SHOULD 上传 references 并使用得到的 `remoteUrl` 作为参考输入

