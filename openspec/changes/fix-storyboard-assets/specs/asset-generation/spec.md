## ADDED Requirements

### Requirement: Prop Preview Video Generation
系统 SHALL 支持道具预览视频的生成。

#### Scenario: 生成道具预览视频
- **GIVEN** 道具已有参考图片
- **WHEN** 用户点击「生成预览视频」按钮
- **THEN** 使用道具图片 + ITV 服务生成短视频
- **AND** 显示生成进度
- **AND** 生成完成后视频保存到道具目录

#### Scenario: 预览视频播放
- **WHEN** 道具已有预览视频
- **THEN** 在属性面板显示视频缩略图
- **AND** 点击可播放视频

### Requirement: Prop Extraction API
系统 SHALL 支持通过 Sora2 API 提取道具。

#### Scenario: 调用道具提取 API
- **GIVEN** 道具已有预览视频
- **AND** 视频已上传到可访问的 URL
- **WHEN** 用户点击「提取道具」按钮
- **THEN** 调用 Sora2 的道具提取接口
- **AND** 返回的 propId 保存到道具数据的 `sora2PropId` 字段

#### Scenario: 提取失败处理
- **WHEN** 道具提取 API 调用失败
- **THEN** 显示错误信息
- **AND** 保留原有绑定状态（如有）
- **AND** 允许用户重试
