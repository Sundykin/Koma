## ADDED Requirements

### Requirement: Image Hosting Provider Directory Structure
系统 SHALL 支持一类新的媒体 Provider：`image-hosting`（图床）。

#### Scenario: 目录结构一致性
- **GIVEN** providers 目录结构
- **WHEN** 开发者需要添加新的 image-hosting Provider
- **THEN** 应在 `providers/imageHosting/` 目录下创建
- **AND** 包含 `index.ts`（注册/工厂）和 `types.ts`（类型定义）
- **AND** Provider MUST 声明 `kind: 'image-hosting'`
- **AND** Provider MUST 声明 capability `'image-hosting'`

### Requirement: Image Hosting Provider Selection
系统 SHALL 通过 `channelConfigs` 选择默认图床 Provider。

#### Scenario: 选择默认图床渠道
- **GIVEN** 存在多个具有 capability `'image-hosting'` 的渠道配置
- **WHEN** 系统需要上传图片并获取 remoteUrl
- **THEN** 系统 MUST 优先使用 `isDefault = true` 的渠道
- **AND** 若不存在默认渠道，则使用第一个启用渠道

