## MODIFIED Requirements

### Requirement: Character Costume Photo Generation

系统 SHALL 生成包含三视图的角色定妆照，并让当前剧集的素材缺口在统一项目工作台可见、可处理。

#### Scenario: 统一生成入口

- **WHEN** 从任何入口触发角色定妆照生成
- **THEN** 统一调用 `characterAssetWorkflow.generateCostumePhoto()`
- **AND** 不再使用 `AssetGenerationService.generateCharacterImage()`
- **AND** 所有入口生成的图片都包含三视图

#### Scenario: 项目工作台显示缺口

- **WHEN** 当前剧集已引用角色但至少一个角色缺少可用定妆照
- **THEN** 项目工作台按当前剧集统计缺失素材数量
- **AND** 提供进入资产生成/编辑的动作
- **AND** 不把缺少图片误报为资产阶段已完成
