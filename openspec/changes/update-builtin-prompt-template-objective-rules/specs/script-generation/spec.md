## MODIFIED Requirements
### Requirement: Random Script Generation
系统 SHALL 提供随机剧本生成功能，用户可以一键让AI随机生成完整剧本。

#### Scenario: User clicks random generate button
- **Given** 用户在剧本工作室界面
- **When** 用户点击"随机生成剧本"按钮
- **Then** 系统 SHALL 直接调用随机剧本生成模板生成完整剧本
- **And** 系统 SHALL 从生成结果中解析主题、风格、关键元素等 metadata
- **And** 生成过程 MUST 显示进度提示
- **And** 生成完成后剧本 SHALL 自动填充到编辑器

## REMOVED Requirements
### Requirement: Random Idea Generation Template
**Reason**: 随机创意模板已废弃，系统改为直接通过随机剧本生成模板输出完整剧本，再从结果中解析 metadata。

**Migration**: 不再暴露 `random_idea_generation` 内置模板；保留调用层兼容函数时，应改为复用随机剧本生成结果而不是依赖独立模板。
