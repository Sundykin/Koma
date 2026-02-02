## MODIFIED Requirements

### Requirement: Character Costume Photo Generation
系统 SHALL 生成包含三视图的角色定妆照。

#### Scenario: 统一生成入口
- **WHEN** 从任何入口触发角色定妆照生成
- **THEN** 统一调用 `characterAssetWorkflow.generateCostumePhoto()`
- **AND** 不再使用 `AssetGenerationService.generateCharacterImage()`
- **AND** 所有入口生成的图片都包含三视图

#### Scenario: 项目风格应用
- **WHEN** 生成任何 TTI 图片
- **THEN** 从项目配置读取 `theme` 和 `stylePrompt`
- **AND** 调用 `getThemeStylePrefix()` 获取风格前缀
- **AND** 将风格前缀添加到提示词开头

## ADDED Requirements

### Requirement: Shot Image Style Application
系统 SHALL 在分镜图片生成时应用项目风格。

#### Scenario: ShotGenerationService 风格应用
- **WHEN** 通过 `ShotGenerationService` 生成分镜图片
- **THEN** 接受 `theme` 和 `stylePrompt` 参数
- **AND** 在 `buildShotPrompt()` 中调用 `getThemeStylePrefix()`
- **AND** 将风格前缀添加到分镜提示词开头

### Requirement: Deprecated Service Warning
系统 SHALL 对废弃服务提供警告。

#### Scenario: AssetGenerationService 废弃标记
- **WHEN** 开发者引用 `AssetGenerationService`
- **THEN** 文件顶部有 `@deprecated` 注释说明
- **AND** 注释指向替代方案 `characterAssetWorkflow`
