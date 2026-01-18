## ADDED Requirements

### Requirement: Character Costume Photo Generation
系统 SHALL 生成包含三视图的角色定妆照。

#### Scenario: 定妆照提示词模板
- **WHEN** 生成角色定妆照时
- **THEN** 使用固定模板：`{stylePrefix}, character turnaround sheet, front view | side view | back view, three poses in one image, full body, standing pose, white background, {appearance}`
- **AND** 用户只能编辑 `appearance` 部分
- **AND** 其他部分为内置规范

#### Scenario: 远程 URL 保存
- **WHEN** 定妆照生成完成
- **THEN** 保存远程 URL 到 `costumePhotoUrl` 字段
- **AND** 下载到本地保存路径到 `costumePhotoPath` 字段
- **AND** 两个字段同时存储

#### Scenario: 预览视频图片源
- **WHEN** 生成角色预览视频
- **THEN** 优先使用 `costumePhotoUrl` 作为输入
- **AND** 若无远程 URL 则提示用户重新生成定妆照

