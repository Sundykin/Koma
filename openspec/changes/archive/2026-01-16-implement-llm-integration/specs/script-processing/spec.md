## ADDED Requirements

### Requirement: Script Analysis Service
系统 SHALL 提供完整的剧本解析服务。

#### Scenario: 服务初始化
- **WHEN** 初始化 ScriptAnalysisService
- **THEN** 接受 LLMModelConfig 作为参数
- **AND** 创建对应的 LLM Provider 实例

#### Scenario: 完整解析流程
- **WHEN** 调用 analyzeScript 方法
- **THEN** 按顺序执行：角色提取 → 场景提取 → 道具提取 → 分镜生成
- **AND** 每个步骤返回中间结果
- **AND** 支持在任意步骤暂停等待用户确认

### Requirement: Character Extraction with Preview
系统 SHALL 展示角色提取的中间结果。

#### Scenario: 角色提取
- **WHEN** 执行角色提取步骤
- **THEN** 调用 LLM 分析剧本中的角色
- **AND** 返回结构化的角色列表
- **AND** 每个角色包含：name, description, personality, appearance

#### Scenario: 角色结果编辑
- **WHEN** 展示角色提取结果
- **THEN** 用户可编辑角色名称和描述
- **AND** 用户可删除错误识别的角色
- **AND** 用户可手动添加遗漏的角色
- **AND** 确认后进入下一步

### Requirement: Scene Extraction with Preview
系统 SHALL 展示场景提取的中间结果。

#### Scenario: 场景提取
- **WHEN** 执行场景提取步骤
- **THEN** 调用 LLM 分析剧本中的场景
- **AND** 返回结构化的场景列表
- **AND** 每个场景包含：name, description, atmosphere, timeOfDay

#### Scenario: 场景结果编辑
- **WHEN** 展示场景提取结果
- **THEN** 用户可编辑场景名称和描述
- **AND** 用户可删除或添加场景
- **AND** 确认后进入下一步

### Requirement: Props Extraction with Preview
系统 SHALL 展示道具提取的中间结果。

#### Scenario: 道具提取
- **WHEN** 执行道具提取步骤
- **THEN** 调用 LLM 分析剧本中的道具
- **AND** 返回结构化的道具列表
- **AND** 每个道具包含：name, description, usage, relatedScenes

#### Scenario: 道具结果编辑
- **WHEN** 展示道具提取结果
- **THEN** 用户可编辑道具信息
- **AND** 用户可删除或添加道具
- **AND** 确认后进入下一步

### Requirement: Shot Generation with Preview
系统 SHALL 展示分镜生成的中间结果。

#### Scenario: 分镜生成
- **WHEN** 执行分镜生成步骤
- **THEN** 调用 LLM 基于剧本和已确认的角色/场景/道具生成分镜列表
- **AND** 每个分镜包含 shotId, sceneIndex, content, dialogue, duration, characters, emotion, cameraAngle

#### Scenario: 分镜结果调整
- **WHEN** 展示分镜列表预览
- **THEN** 用户可拖拽调整分镜顺序
- **AND** 用户可编辑分镜描述和参数
- **AND** 用户可删除或合并分镜
- **AND** 用户可插入新分镜
- **AND** 确认后完成解析流程

### Requirement: Analysis Progress Feedback
系统 SHALL 在解析过程中提供详细的进度反馈。

#### Scenario: 进度展示
- **WHEN** 剧本解析进行中
- **THEN** 显示当前步骤名称（角色提取/场景提取/道具提取/分镜生成）
- **AND** 显示总步骤数和当前步骤序号（如 2/4）
- **AND** 显示步骤状态（进行中/等待确认/已完成）

#### Scenario: 单步重试
- **WHEN** 某个步骤的结果不满意
- **THEN** 用户可点击「重新生成」
- **AND** 重新调用 LLM 生成该步骤结果
- **AND** 不影响之前步骤的确认结果

#### Scenario: 取消解析
- **WHEN** 用户点击「取消」按钮
- **THEN** 中断当前 LLM 调用
- **AND** 返回解析前状态
- **AND** 已确认的中间结果不保存

### Requirement: Structured Output Schema
系统 SHALL 使用 JSON Schema 约束 LLM 输出格式。

#### Scenario: 角色提取 Schema
- **WHEN** 调用 LLM 提取角色
- **THEN** 使用预定义的 JSON Schema 约束输出
- **AND** Schema 定义角色数组结构和必填字段
- **AND** 解析失败时进行重试或降级处理

#### Scenario: 分镜生成 Schema
- **WHEN** 调用 LLM 生成分镜
- **THEN** 使用预定义的 JSON Schema 约束输出
- **AND** Schema 定义分镜数组结构和字段类型
- **AND** 验证 duration 为正数，characters 引用有效角色

## MODIFIED Requirements

### Requirement: Progress Feedback
系统 SHALL 在 LLM 处理时显示进度。

#### Scenario: 分镜生成进度
- **WHEN** 分镜拆解进行中
- **THEN** 显示处理阶段（角色提取/场景提取/道具提取/分镜生成）
- **AND** 显示当前步骤的等待确认状态
- **AND** 支持取消操作
- **AND** 错误时显示具体原因并支持重试
