## MODIFIED Requirements

### Requirement: 分集级数据存储
系统 SHALL 支持按分集存储和加载创作数据，实现项目-资产-分集的层级关联。

#### Scenario: 分集目录结构
- **WHEN** 创建新分集
- **THEN** 在 episodes/{episodeId}/ 下创建目录结构
- **AND** 包含 metadata.json、script.md、analysis.json、shots/、timeline/

#### Scenario: 分集剧本存储
- **WHEN** 用户编辑某集剧本
- **THEN** 保存到 episodes/{episodeId}/script.md
- **AND** 更新 metadata.json 中的 scriptHash

#### Scenario: 分集解析结果存储
- **WHEN** 完成分集解析
- **THEN** 保存到 episodes/{episodeId}/analysis.json
- **AND** 包含 characterRefs、sceneRefs、propRefs（引用而非复制）
- **AND** 包含 shots 分镜列表

### Requirement: 项目级资产存储
系统 SHALL 将角色/场景/道具作为项目级共享资产存储，支持跨集引用。

#### Scenario: 资产存储位置
- **WHEN** 创建新资产
- **THEN** 存储在 assets/{type}/{assetId}/ 目录
- **AND** 包含 metadata.json 和相关文件

#### Scenario: 资产引用追踪
- **WHEN** 分集引用某资产
- **THEN** 更新资产的 episodeRefs 数组
- **AND** 记录 episodeId、episodeName、firstAppearance、shotIds

#### Scenario: 资产引用解除
- **WHEN** 分集不再使用某资产
- **THEN** 从资产的 episodeRefs 中移除该分集
- **AND** 资产本身不删除（可能被其他分集使用）

### Requirement: 资产元数据增强
系统 SHALL 增强资产元数据以支持去重和引用追踪。

#### Scenario: 资产指纹
- **WHEN** 创建或更新资产
- **THEN** 计算并存储 fingerprint
- **AND** 用于快速去重比对

#### Scenario: 分集引用列表
- **WHEN** 查询资产详情
- **THEN** 返回完整的 episodeRefs 列表
- **AND** 可按此筛选资产
