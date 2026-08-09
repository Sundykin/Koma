## ADDED Requirements

### Requirement: Continuity-aware shot video generation

项目分镜视频生成 SHALL 根据 Shot 的生效连续性决策编译上一镜尾帧输入，并继续使用项目风格快照及既有角色、场景、道具参考。

#### Scenario: Automatic inherited video

- **WHEN** Shot 的自动建议为继承且上一镜存在当前已完成视频
- **THEN** 工作流提取或复用上一镜尾帧
- **AND** 尾帧按当前模型能力进入 primary image 或 reference images

#### Scenario: Manual frame wins

- **WHEN** Shot 绑定了手动截取的尾帧
- **THEN** 工作流优先使用该手动帧
- **AND** 不因自动建议变化而替换手动帧

#### Scenario: Independent shot omits tail frame

- **WHEN** Shot 为首镜、自动独立或手动独立
- **THEN** 工作流不抽取也不发送上一镜尾帧
- **AND** 其它合法参考仍按既有规则编译

#### Scenario: Unsupported capability fails fast

- **WHEN** 当前视频模型不支持带尾帧输入所需的能力
- **THEN** 生成在提交前失败
- **AND** 提示用户选择支持该能力的模型

### Requirement: Tail-frame refresh follows source video version

系统 SHALL 识别上一镜当前视频版本变化，并在自动继承模式下重新提取尾帧；手动尾帧 SHALL 保持稳定直到用户重新截取或取消。

#### Scenario: Automatic frame refresh

- **WHEN** 自动继承 Shot 记录的 `sourceVideoKey` 与上一镜当前视频键不一致
- **THEN** 工作流重新提取尾帧并更新绑定

#### Scenario: Manual frame remains stable

- **WHEN** 上一镜生成了新视频但当前 Shot 仍为手动继承
- **THEN** 工作流继续使用原手动尾帧
- **AND** UI 提示来源视频已有更新并提供重新截取入口
