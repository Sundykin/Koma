## ADDED Requirements

### Requirement: Shot continuity metadata from script breakdown

项目分镜拆解 SHALL 允许结构化输出相邻镜头连续性建议，并在所有 chunk 合并、最终 Shot ID 分配后规范化为项目 `videoReference` 元数据。

#### Scenario: LLM returns continuity suggestion

- **WHEN** ShotAnalysisService 解析一个分镜块
- **THEN** 结构化结果可包含 `continuity`、`continuityReason` 或等价字段
- **AND** 解析器对缺失字段保持兼容

#### Scenario: Chunk boundaries do not decide continuity

- **WHEN** 长剧本被拆成多个 chunk 进行分镜生成
- **THEN** 系统先合并并排序全部分镜
- **AND** 连续性建议基于最终相邻 Shot 重新规范化，不因 chunk 首镜自动独立

#### Scenario: Explicit transition defaults to independent

- **WHEN** 分镜文本明确表示场景切换、时间跳跃、闪回、平行叙事或其它转场
- **THEN** 自动连续性建议为独立
- **AND** 理由被保存供 UI 展示

### Requirement: Continuity metadata survives project persistence

项目 Shot 的连续性元数据 SHALL 通过现有项目持久化读写路径往返保存，未知或非法字段 SHALL 被安全忽略。

#### Scenario: Round-trip metadata

- **WHEN** 项目保存包含自动建议、手动模式、尾帧资源和来源视频键的 Shot
- **THEN** 重新加载项目后这些字段保持等价

#### Scenario: Older metadata remains readable

- **WHEN** 数据库中只有旧版 Shot metadata_json
- **THEN** Shot 仍能正常加载
- **AND** 缺少连续性字段时使用确定性兜底而不是抛出解析异常
