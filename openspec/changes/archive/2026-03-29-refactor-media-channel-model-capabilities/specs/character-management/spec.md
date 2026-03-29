## MODIFIED Requirements

### Requirement: Preview Video Generation
系统 SHALL 通过统一的视频模型能力解析生成角色预览视频。

#### Scenario: 生成预览视频
- **GIVEN** 角色已有定妆照
- **WHEN** 用户点击"生成预览视频"按钮
- **THEN** 系统 MUST 解析当前项目选中的视频模型
- **AND** 该模型 MUST 支持 `video.image-to-video`
- **AND** 系统 MUST 使用定妆照和能力级标准请求生成视频
- **AND** 生成完成后可在弹窗中播放

#### Scenario: 预览视频前置条件
- **WHEN** 用户尝试生成预览视频但无定妆照
- **THEN** 提示"请先生成定妆照"
- **AND** 生成按钮禁用

#### Scenario: 当前模型不支持角色预览视频
- **WHEN** 当前项目选择的视频模型不支持 `video.image-to-video`
- **THEN** 系统 MUST 禁用角色预览视频生成入口
- **AND** MUST 提示用户切换到支持该能力的模型
