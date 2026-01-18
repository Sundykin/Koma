# UI Components Specification Delta

## ADDED Requirements

### Requirement: Storyboard Video Generation
系统 SHALL 在分镜页面提供视频生成入口。

#### Scenario: 单个分镜视频生成
- **WHEN** 用户在分镜卡片点击视频生成按钮
- **THEN** 调用 `shotRenderWorkflow` 执行完整渲染
- **AND** 显示渲染进度（图片 → 语音 → 视频）
- **AND** 完成后更新分镜预览

#### Scenario: 导演面板渲染
- **WHEN** 用户在导演面板点击"渲染此镜头"
- **THEN** 执行完整的分镜渲染流程
- **AND** 包含图片生成、语音合成、视频生成

### Requirement: Mention Editor Character Support
系统 SHALL 在分镜描述编辑器中支持角色 @ 引用。

#### Scenario: 角色补全列表
- **WHEN** 用户在编辑器中输入 `@`
- **THEN** 显示角色补全列表
- **AND** 有 Sora2 绑定的角色显示特殊标记

#### Scenario: Sora2 角色标记
- **WHEN** 角色已绑定 `sora2CharacterId`
- **THEN** 补全列表显示 🎬 标记
- **AND** 选择后显示角色 Sora2 ID 提示
