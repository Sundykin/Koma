## MODIFIED Requirements

### Requirement: Speech Synthesis
系统 SHALL 通过统一 TTS 服务生成并绑定结构化音频资产。

#### Scenario: Single shot synthesis uses TTS service boundary
- **When** 用户触发分镜配音生成
- **Then** 系统 MUST 提取分镜 dialogue 文本
- **And** 系统 MUST 通过统一 TTS 服务解析角色音色或项目默认音色
- **And** 工作流 SHALL 不再直接调用底层 TTS Provider 选择 `voices[0]`
- **And** 生成完成后系统 MUST 将音频持久化为结构化媒体资产并绑定到分镜版本

#### Scenario: Provider output is normalized before persistence
- **Given** TTS Provider 返回本地路径、远程 URL、`blob:` URL、`data:` URL 或等价瞬态结果
- **When** 语音合成完成
- **Then** 系统 MUST 先通过统一持久化边界物化文件
- **And** 工作流获得的结果 SHALL 是结构化音频资产，而不是裸字符串路径
