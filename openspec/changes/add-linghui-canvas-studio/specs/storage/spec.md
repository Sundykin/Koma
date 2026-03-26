## ADDED Requirements

### Requirement: Linghui Workspace Storage Structure

系统 SHALL 为灵绘工作区维护独立存储域，而不是复用现有短剧项目目录。

#### Scenario: 创建灵绘工作区目录
- **WHEN** 用户首次保存某个灵绘工作区
- **THEN** 系统在 `{storageRoot}/linghui-workspaces/{workspaceId}/` 下创建目录
- **AND** 在 `{storageRoot}/linghui-workspaces-index.json` 中登记该工作区摘要信息
- **AND** 不写入现有 `projects-index.json`

#### Scenario: 保存工作区画布状态
- **WHEN** 用户保存灵绘工作区
- **THEN** 系统将节点、连线、分组、视口、节点结果引用与运行记录保存到工作区数据文件
- **AND** 下次打开时可恢复相同的画布布局与结果关联

### Requirement: Linghui Output Asset Storage

系统 SHALL 为灵绘的批量结果和中间产物维护结构化输出目录。

#### Scenario: 存储 4 宫格结果
- **WHEN** 4 宫格节点生成完成
- **THEN** 系统保存宫格组合图与拆分单图
- **AND** 记录每张单图与其所属节点运行的关联关系

#### Scenario: 存储多角度结果
- **WHEN** 多角度节点生成完成
- **THEN** 系统按角度标签保存输出图片
- **AND** 为每个角度记录预设名或自定义角度值

#### Scenario: 存储分镜序列结果
- **WHEN** 分镜组节点生成完成
- **THEN** 系统保存分镜顺序、时长和画面引用
- **AND** 允许预览器按顺序读取结果

### Requirement: Linghui Workspace Export Package

系统 SHALL 支持导出和导入独立的灵绘工作区包。

#### Scenario: 导出灵绘工作区
- **WHEN** 用户执行灵绘工作区导出
- **THEN** 系统打包工作区数据文件、素材文件与输出结果
- **AND** 导出包不依赖现有短剧项目目录结构

#### Scenario: 导入灵绘工作区
- **WHEN** 用户导入灵绘工作区包
- **THEN** 系统恢复工作区目录和索引信息
- **AND** 导入后的工作区可以继续编辑和运行
