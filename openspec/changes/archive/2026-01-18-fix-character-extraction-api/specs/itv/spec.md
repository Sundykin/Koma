# ITV Specification Delta

## ADDED Requirements

### Requirement: Sora2 Character Extraction API
系统 SHALL 支持 Sora2 角色提取 API 使用视频生成任务 ID。

#### Scenario: 角色提取参数
- **WHEN** 调用 Sora2 角色提取 API
- **THEN** 使用 `from_task` 参数传递视频生成任务 ID
- **AND** 可选传递 `timestamps` 参数指定提取时间段（如 "3,6"）
- **AND** API 返回角色 ID 用于后续视频生成引用

#### Scenario: 提取时间戳
- **WHEN** 指定 `timestamps` 参数
- **THEN** 从视频指定时间段提取角色特征
- **AND** 格式为 "开始秒,结束秒"（如 "3,6" 表示 3-6 秒）

### Requirement: 预览视频任务 ID 保存
系统 SHALL 在角色预览视频生成后保存任务 ID。

#### Scenario: 任务 ID 存储
- **WHEN** 角色预览视频生成完成
- **THEN** 保存视频生成任务 ID 到 `previewVideoTaskId` 字段
- **AND** 同时保存本地视频路径到 `previewVideoPath` 字段
- **AND** 两个字段均可用于后续操作

#### Scenario: 角色提取依赖
- **WHEN** 用户触发角色提取
- **THEN** 检查 `previewVideoTaskId` 是否存在
- **AND** 若不存在则提示用户重新生成预览视频
- **AND** 使用任务 ID 调用角色提取 API
