## ADDED Requirements

### Requirement: Prop Sora2 Binding
系统 SHALL 支持道具的 Sora2 绑定流程，与角色绑定流程一致。

#### Scenario: 道具预览视频生成
- **GIVEN** 道具已有参考图片
- **WHEN** 用户点击「生成预览视频」按钮
- **THEN** 使用参考图 + ITV 服务生成视频
- **AND** 显示生成进度
- **AND** 生成完成后可在面板中播放

#### Scenario: 道具提取
- **GIVEN** 道具已有预览视频
- **AND** 配置了 Sora2 ITV 服务
- **WHEN** 用户点击「提取道具」按钮
- **THEN** 调用 `Sora2Provider.extractProp` API
- **AND** 保存返回的 propId 到道具数据

#### Scenario: 显示道具绑定状态
- **WHEN** 道具已绑定 Sora2 Prop ID
- **THEN** 显示「已绑定」状态和 ID
- **AND** 显示「重新提取」按钮

### Requirement: Prop Custom Prompt
系统 SHALL 支持道具的自定义生成提示词。

#### Scenario: 预览提示词
- **WHEN** 用户在道具属性面板中
- **THEN** 显示自动生成的道具图提示词
- **AND** 基于道具类型和描述生成

#### Scenario: 自定义提示词
- **WHEN** 用户点击「编辑」按钮
- **THEN** 提示词变为可编辑状态
- **AND** 用户可修改提示词内容
- **AND** 修改后的提示词用于后续生成
