## ADDED Requirements

### Requirement: Image Node Collections

灵绘 SHALL 让图片节点作为最多 4 张图片的集合容器工作，并要求集合内图片保持相同比例。

#### Scenario: 导入多张图片到图片节点
- **WHEN** 用户向图片节点导入第 2 到第 4 张图片
- **THEN** 系统允许这些图片进入同一个图片节点
- **AND** 校验所有图片与当前集合保持相同比例
- **AND** 当图片数量超过 4 张或比例不一致时阻止导入并提示原因

#### Scenario: 一次生成多张图片
- **WHEN** 用户把图片节点的生成数量设置为 2 到 4 张并执行
- **THEN** 系统输出对应数量的图片结果
- **AND** 这些结果在节点内作为同一组图片集合展示
- **AND** 结果集合保持同一比例

### Requirement: Primary Image Governs Downstream Consumption

灵绘 SHALL 要求图片节点显式维护当前主图，并且下游节点、提示词引用和执行编译只消费主图。

#### Scenario: 切换图片节点主图
- **WHEN** 用户在图片节点中把另一张图片设为主图
- **THEN** 节点当前显示更新为该主图
- **AND** 提示词引用与下游输入解析都改为使用新的主图
- **AND** 其他图片保留在节点集合中但不会被自动传递给下游

#### Scenario: 下游执行引用图片节点
- **WHEN** 图片节点连接到下游图片节点或视频节点
- **THEN** 系统只把当前主图作为该节点的视觉输入
- **AND** 不会把同节点中的其他非主图自动追加为参考图

### Requirement: Image Node Collection Presentation

灵绘 SHALL 在图片节点卡片与编辑态中直接展示当前图片，并在多图场景下支持展开平铺浏览。

#### Scenario: 节点存在单张图片
- **WHEN** 图片节点当前只有 1 张图片
- **THEN** 节点卡片直接显示该图片预览
- **AND** 不再退化为纯占位缩略图

#### Scenario: 节点存在多张图片
- **WHEN** 图片节点当前包含 2 到 4 张图片
- **THEN** 节点卡片提供展开平铺态来浏览这组图片
- **AND** 展开和收起使用轻量动画过渡
- **AND** 用户可以在编辑态中直接切换主图

### Requirement: Grid Split Tool For Image Nodes

灵绘 SHALL 为图片节点提供宫格切分工具，支持基于当前主图进行 4 / 9 / 16 / 25 宫格切分、选择和后续节点生成。

#### Scenario: 打开宫格切分工具
- **WHEN** 用户在图片节点中触发宫格切分工具
- **THEN** 系统展示当前主图的放大预览
- **AND** 在预览上叠加可见的宫格分割线
- **AND** 用户可以切换 4 / 9 / 16 / 25 宫格布局并多选若干格子

#### Scenario: 执行宫格切分
- **WHEN** 用户选中若干宫格并确认执行
- **THEN** 系统通过 IPC 调用 FFmpeg 切分当前主图
- **AND** 将选中的格子放大到与原图相同的比例和尺寸
- **AND** 自动在当前画布生成对应数量的导入图片节点

### Requirement: Grid Split Uses Persisted Local Sources

灵绘 SHALL 在宫格切分前确保源图可被本地 FFmpeg 访问。

#### Scenario: 当前主图不是稳定的本地文件
- **WHEN** 用户对远程 URL、data URL 或临时图像执行宫格切分
- **THEN** 系统先把当前主图持久化为工作区内的本地素材
- **AND** 再将该本地文件交给 FFmpeg 切分和高清化
- **AND** 生成的新图片节点引用持久化后的本地输出文件
