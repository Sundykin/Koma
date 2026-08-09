## MODIFIED Requirements

### Requirement: Character Costume Photo Generation

系统 SHALL 生成包含三视图的角色定妆照，并允许项目工作台和资产面板共享同一批量生成工作流。

#### Scenario: 统一生成入口

- **WHEN** 从任何入口触发角色定妆照生成
- **THEN** 统一调用 `characterAssetWorkflow.generateCostumePhoto()`
- **AND** 不再使用 `AssetGenerationService.generateCharacterImage()`
- **AND** 所有入口生成的图片都包含三视图

#### Scenario: 批量入口保持一致

- **WHEN** 项目工作台或资产面板批量生成角色定妆照
- **THEN** 两个入口 SHALL 使用同一生成工作流、项目风格快照和参考图归一化策略
- **AND** 单项失败不得覆盖其他成功项
- **AND** 成功项写回项目资产库后可被 readiness 立即识别
