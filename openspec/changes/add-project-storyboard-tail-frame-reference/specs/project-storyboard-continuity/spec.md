## ADDED Requirements

### Requirement: Project shot continuity decision

项目分镜 SHALL 为每个 Shot 保存相邻镜头连续性决策，包括生效模式、是否使用上一镜视频尾帧、自动判断建议、判断理由和来源 Shot；第一镜 SHALL 始终不使用上一镜尾帧。

#### Scenario: First shot is independent

- **WHEN** 项目分镜列表中的 Shot 没有前置 Shot
- **THEN** 系统将其连续性决策规范化为独立
- **AND** UI 不显示可用的上一镜截取操作

#### Scenario: Automatic continuity is persisted

- **WHEN** 分镜拆解完成并合并为最终顺序
- **THEN** 系统为每个非首镜保存自动继承或自动独立建议及可解释理由
- **AND** 手动覆盖前保留原始自动建议

#### Scenario: Legacy shot receives deterministic fallback

- **WHEN** 旧项目 Shot 缺少连续性字段
- **THEN** 系统按场景、角色、动作、视线、机位和转场信号运行确定性规则
- **AND** 明确场景切换、时间跳跃、闪回或平行叙事默认判定为独立

### Requirement: Manual tail-frame controls

项目 AI 分镜卡片 SHALL 支持用户手动继承、手动独立、截取、重新截取、取消继承和恢复自动判断。

#### Scenario: Manually enable continuity

- **WHEN** 用户在有上一镜真实视频的 Shot 上选择“继承上一镜尾帧”
- **THEN** Shot 进入手动继承模式并触发尾帧截取或复用有效缓存
- **AND** 尾帧成为当前视频参考

#### Scenario: Manually disable continuity

- **WHEN** 用户选择“本镜独立”
- **THEN** Shot 进入手动独立模式
- **AND** 生成视频时不读取上一镜尾帧

#### Scenario: Restore automatic decision

- **WHEN** 用户选择“恢复自动”
- **THEN** 系统清除手动覆盖并恢复保存的自动建议
- **AND** 若自动建议继承则按当前上一镜视频版本重新校验尾帧

#### Scenario: Capture unavailable without real video

- **WHEN** 上一镜没有已完成的真实视频媒体
- **THEN** 截取和重新截取操作不可用或返回明确的“请先生成上一镜视频”错误

### Requirement: Real tail-frame extraction

系统 SHALL 从上一 Shot 当前已完成的视频提取真实尾帧并以 `StoredMediaAsset` 保存，且不得用视频封面或本镜分镜图替代。

#### Scenario: Extract and cache tail frame

- **WHEN** 上一镜视频存在且连续性 Shot 需要尾帧
- **THEN** FFmpeg 在视频结束前的安全窗口提取单帧图片
- **AND** 结果按来源 Shot 和视频版本键缓存并绑定到当前 Shot

#### Scenario: Tail-frame extraction failure

- **WHEN** 视频读取、物化或 FFmpeg 抽帧失败
- **THEN** 当前 Shot 的生成任务失败并返回可读错误
- **AND** 系统不回退到 poster/首帧

### Requirement: Tail frame is primary video reference

尾帧 SHALL 在现有参考 bundle 中拥有最高优先级，并适配不同视频能力。

#### Scenario: Reference-to-video compilation

- **WHEN** 当前模型使用 `video.reference-to-video`
- **THEN** 尾帧被编译为 `referenceImages[0]`
- **AND** 当前分镜图、角色、场景、道具和用户参考按优先级作为补充

#### Scenario: Image-to-video compilation

- **WHEN** 当前模型使用 `video.image-to-video`
- **THEN** 尾帧被编译为 `primaryImage`
- **AND** 其它可用视觉参考进入 `additionalReferences`

#### Scenario: Continuity token is compiled

- **WHEN** 视频 prompt 包含 `@previous_tail_frame`
- **THEN** 编译器将其映射为尾帧在请求中的实际 `@Image N` 编号
- **AND** 没有真实尾帧时不得生成虚假的索引

### Requirement: Dependency-aware batch rendering

项目批量视频生成 SHALL 感知连续性依赖；有尾帧依赖的 Shot 必须等待上一镜成功，其它无依赖 Shot 可以按并发限制执行。

#### Scenario: Dependent shot waits for predecessor

- **WHEN** 批量生成同时包含相邻且需要尾帧的两个 Shot
- **THEN** 后一 Shot 只有在前一 Shot 视频生成成功并可读取后才开始抽帧和生成

#### Scenario: Independent shots remain parallel

- **WHEN** 批量中存在没有尾帧依赖的 Shot
- **THEN** 这些 Shot 不因其它分支等待而被串行阻塞
- **AND** 仍遵守现有并发上限

#### Scenario: Missing dependency fails explicitly

- **WHEN** 依赖 Shot 不在本批次且没有已完成的当前视频，或依赖任务失败
- **THEN** 当前 Shot 标记失败
- **AND** 错误明确指出缺少上一镜真实视频或尾帧
