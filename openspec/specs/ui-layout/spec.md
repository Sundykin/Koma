# ui-layout Specification

## Purpose
TBD - created by archiving change optimize-ui-layout. Update Purpose after archive.
## Requirements
### Requirement: Antd v6 API 兼容性

系统 SHALL 使用 Antd v6 正确的 API，避免废弃警告。

#### Scenario: Divider 垂直分隔

- **WHEN** 需要在工具栏或表单中使用垂直分隔线
- **THEN** 不使用 `type="vertical"`（已废弃）
- **AND** 使用内联样式或 Tailwind 类实现

#### Scenario: Space 垂直方向

- **WHEN** 需要垂直排列子元素
- **THEN** 使用 `direction="vertical"` 而非 `orientation`

#### Scenario: Modal 销毁行为

- **WHEN** Modal 关闭时需要销毁内容
- **THEN** 使用 `destroyOnHidden` 而非 `destroyOnClose`

### Requirement: 分镜编辑器布局

分镜编辑器 SHALL 提供清晰、高效的三列布局。

#### Scenario: ShotCard 列比例

- **WHEN** 显示分镜卡片
- **THEN** 使用 `grid-template-columns: 3fr 4fr 4fr` 布局
- **AND** 每列设置最小宽度（剧本 200px，提示词 240px，媒体 280px）

#### Scenario: 列表容器

- **WHEN** 显示分镜列表
- **THEN** 不显示独立表头行（避免与卡片布局不一致）
- **AND** 使用卡片内部标签指示各列功能

#### Scenario: 响应式折叠

- **WHEN** 视口宽度小于 1024px
- **THEN** 媒体列可折叠或移至下方
- **AND** 保持剧本和提示词列可见

### Requirement: 设置页面布局

设置页面 SHALL 自适应内容高度，支持滚动。

#### Scenario: Tab 内容区域

- **WHEN** 显示设置 Tab 内容
- **THEN** 内容区域使用 flex 布局自适应高度
- **AND** 不使用固定 maxHeight 硬编码

#### Scenario: 模板列表滚动

- **WHEN** Prompt 模板列表超出可视区域
- **THEN** 该区域可独立滚动
- **AND** Tab 切换后保持滚动位置

### Requirement: 视频编辑器布局

视频编辑器 SHALL 合理分配素材面板、播放器、属性面板和时间线区域。

#### Scenario: 素材面板宽度

- **WHEN** 显示素材面板
- **THEN** 宽度使用 `clamp(220px, 20vw, 320px)` 自适应
- **AND** 可折叠隐藏

#### Scenario: 时间线高度

- **WHEN** 显示时间线区域
- **THEN** 高度使用 `clamp(200px, 30vh, 400px)` 自适应
- **AND** 未来可支持拖拽调整

#### Scenario: 播放器居中

- **WHEN** 显示播放器区域
- **THEN** 播放器画布居中显示
- **AND** 周围留有操作空间

### Requirement: 设计 Token 系统

系统 SHALL 使用 CSS 变量定义设计 token，确保样式一致性。

#### Scenario: 颜色变量

- **WHEN** 组件需要使用颜色
- **THEN** 优先使用 CSS 变量（如 `var(--bg-raised)`）
- **AND** 变量与 Tailwind 和 Antd 主题保持一致

#### Scenario: 间距变量

- **WHEN** 组件需要设置间距
- **THEN** 使用 CSS 变量（如 `var(--space-md)`）
- **AND** 与 Tailwind 的 spacing scale 对齐

### Requirement: 项目列表布局

项目列表 SHALL 提供响应式网格布局。

#### Scenario: 卡片网格

- **WHEN** 显示项目卡片列表
- **THEN** 使用 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` 响应式网格
- **AND** 卡片尺寸一致

#### Scenario: 搜索和筛选

- **WHEN** 视口宽度小于 640px
- **THEN** 搜索框和筛选器可折叠或堆叠显示
- **AND** 保持可用性

