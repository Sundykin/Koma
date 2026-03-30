## ADDED Requirements

### Requirement: Grid Shot Image Generation Workflow
系统 MUST 提供 `gridShotImageWorkflow()` 函数，在九宫格模式下为单个 Shot 生成一张 3×3 网格图。

该函数 MUST 读取 Shot 的 imagePrompt（包含 9 条连续画面描述），使用 `tti_grid_shot_image` 模板组装为九宫格 TTI 提示词，调用 TTI 服务生成图片。

生成的九宫格图片 MUST 存储到该 Shot 的 `media.gridImage` 字段。九宫格中每个格子的画面比例 MUST 与整体图片比例保持一致。

#### Scenario: 九宫格图片生成
- **WHEN** 用户对一个 `imageMode === 'grid'` 的 Shot 触发图片生成
- **THEN** 系统读取该 Shot 的 imagePrompt（含 9 条镜头描述）
- **THEN** 使用 `tti_grid_shot_image` 模板组装为九宫格提示词
- **THEN** 调用 TTI 服务生成一张 3×3 网格图
- **THEN** 将结果存储到该 Shot 的 `media.gridImage`

#### Scenario: imagePrompt 为空时提示先生成
- **WHEN** Shot 的 imagePrompt 为空
- **THEN** 系统提示用户「请先生成分镜提示词」
- **THEN** 不调用 TTI

### Requirement: Shot Image Mode Field
Shot 数据模型 MUST 包含 `imageMode` 字段，类型为 `'normal' | 'grid'`，默认值为 `'normal'`。

`ShotMediaState` MUST 增加 `gridImage?: StoredMediaAsset` 字段用于存储九宫格原图。

每个 Shot 可独立选择 imageMode，互不影响。

#### Scenario: 默认 imageMode
- **WHEN** 创建新 Shot 或打开旧项目中无 imageMode 字段的 Shot
- **THEN** `imageMode` 默认为 `'normal'`
- **THEN** 所有现有流程行为不变

## MODIFIED Requirements

### Requirement: Shot Image Generation Workflow
系统 MUST 根据 Shot 的 `imageMode` 选择不同的图片生成流程：

- `imageMode === 'normal'`：调用现有 `shotImageWorkflow()`，为单个 Shot 生成单张图片
- `imageMode === 'grid'`：调用新增 `gridShotImageWorkflow()`，为该 Shot 生成 3×3 九宫格图

两种模式共享相同的风格前缀来源（`styleSnapshot.ttiStylePrefix`）和资产引用构建逻辑（`buildShotAssetReferences`）。

#### Scenario: Normal 模式图片生成
- **WHEN** Shot 的 `imageMode === 'normal'`
- **THEN** 调用 `shotImageWorkflow()` 生成单镜头图片
- **THEN** 行为与改动前完全一致

#### Scenario: Grid 模式图片生成
- **WHEN** Shot 的 `imageMode === 'grid'`
- **THEN** 调用 `gridShotImageWorkflow()` 生成九宫格图片
- **THEN** 九宫格图片存储到该 Shot 的 `media.gridImage`
