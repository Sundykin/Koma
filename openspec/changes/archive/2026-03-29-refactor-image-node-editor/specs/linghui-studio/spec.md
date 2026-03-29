## MODIFIED Requirements

### Requirement: Image Node Collections

灵绘 SHALL 区分导入节点和生成节点的图片集合规则：导入节点限制为单张图片，生成节点保持最多 4 张批量生成结果。

#### Scenario: 导入节点只允许单张图片
- **WHEN** 用户通过拖图到画布、右键上传或宫格派生创建导入图片节点
- **THEN** 该节点只持有 1 张图片
- **AND** 替换图片操作会覆盖当前图片而非追加

#### Scenario: 生成节点批量生成
- **WHEN** 用户把生成图片节点的生成数量设置为 2 到 4 张并执行
- **THEN** 系统输出对应数量的图片结果
- **AND** 这些结果在节点内作为同一组图片集合展示

### Requirement: Image Node Collection Presentation

灵绘 SHALL 在图片节点卡片上完成所有图片查看和主图操作，编辑弹窗不再承担图片展示职责。

#### Scenario: 生成节点展示多张结果
- **WHEN** 生成图片节点包含 2 到 4 张结果图片
- **THEN** 节点卡片提供展开平铺态来浏览这组图片
- **AND** 用户在展开态中可以设为主图和下载
- **AND** 编辑弹窗 MainSurface 内不渲染主图预览和结果集合

#### Scenario: 导入节点展示单张图片
- **WHEN** 导入图片节点持有 1 张图片
- **THEN** 节点卡片直接显示该图片预览
- **AND** 无展开按钮（只有一张）

### Requirement: Mode-Adaptive Image Node Editing

系统 SHALL 根据图片节点的 `generate` 或 `import` 模式隐式渲染不同编辑器，不提供显式模式切换入口。

#### Scenario: 图片节点处于生成模式
- **WHEN** 用户点击收起状态的生成图片节点
- **THEN** 系统弹出编辑框，MainSurface 展示上游参考摘要、提示词编辑器和生成参数（渠道、比例、分辨率、批量数）
- **AND** 不渲染模式切换 tabs、主图预览和结果集合
- **AND** 比例和分辨率 SHALL 分别使用独立的下拉选择器

#### Scenario: 图片节点处于导入模式
- **WHEN** 用户点击收起状态的导入图片节点
- **THEN** 系统弹出编辑框，MainSurface 只渲染单行工具栏：[替换图片] [清空] [运行]
- **AND** 不渲染提示词编辑器、生图渠道、比例、分辨率、批量数和模式切换 tabs

#### Scenario: 展开态阻止编辑框弹出
- **WHEN** 用户点击处于展开态的图片节点
- **THEN** 系统不弹出编辑框
- **AND** 用户可以继续在展开态中操作（设主图、下载）
- **AND** 只有收起节点后再点击才会弹出编辑框

### Requirement: Detached Image and Video Tool Surfaces

系统 SHALL 将图片节点的工具预设面板改为 TopBar 按钮的 hover 悬浮下拉，不占用 MainSurface 空间。

#### Scenario: hover 触发工具预设面板
- **WHEN** 用户将鼠标移入 TopBar 上的多角度、扩图、打光或重绘按钮
- **THEN** 系统在该按钮正下方弹出悬浮预设面板
- **AND** 面板展示工具标题、描述和预设列表（含应用按钮）
- **AND** MainSurface 内容不发生任何变化

#### Scenario: 鼠标移出收起悬浮面板
- **WHEN** 用户将鼠标从工具按钮和悬浮面板区域完全移出
- **THEN** 系统立即收起悬浮面板
- **AND** 无需点击关闭

### Requirement: Grid Split Tool For Image Nodes

灵绘 SHALL 将宫格切分的格子选择操作移到节点卡片本身，TopBar 悬浮下拉只展示已选摘要和执行按钮。

#### Scenario: 激活宫格切分工具
- **WHEN** 用户将鼠标移入 TopBar 上的宫格按钮
- **THEN** 系统在节点卡片的图片上叠加可交互的宫格网格 overlay
- **AND** 在宫格按钮下方弹出悬浮面板展示宫格类型选择器（4/9/16/25格）、已选格子编号和执行按钮
- **AND** 不渲染全选按钮

#### Scenario: 在节点上选择宫格格子
- **WHEN** 用户在节点图片的宫格 overlay 上点击格子
- **THEN** 该格子切换选中/取消状态
- **AND** TopBar 悬浮面板实时更新已选格子编号列表

#### Scenario: 执行宫格切分
- **WHEN** 用户选中若干宫格并在悬浮面板中确认执行
- **THEN** 系统切分当前主图并自动在画布生成对应数量的导入图片节点

### Requirement: Node-Centric Split Editor Overlay

灵绘 SHALL 调整双层浮动面板的定位规则，使 MainSurface 贴合节点底边、TopBar 远离节点上方，且两个面板永不遮挡节点。

#### Scenario: 正常定位
- **WHEN** 用户点击画布上的图片节点打开编辑器
- **THEN** TopBar 距节点上方保持约 22px 间距
- **AND** MainSurface 顶边贴合节点底边（0px 间距）
- **AND** 节点主体在两个面板之间完全可见

#### Scenario: 节点靠近视口边缘
- **WHEN** 当前节点部分滚出画布可视区域
- **THEN** 面板跟随节点位置调整，宁可被裁剪也不覆盖节点
- **AND** TopBar 和 MainSurface 各自独立约束，不因另一方避让而覆盖节点

## REMOVED Requirements

### Requirement: Primary Image Governs Downstream Consumption
**Reason**: 导入节点改为单张图片后，不再需要"主图"概念。生成节点的主图选择行为不变但由节点卡片展开态承担，不属于编辑器 spec 范围。原有下游消费行为不受影响。
**Migration**: 生成节点的主图选择从编辑器内移到节点卡片展开态，功能等价。导入节点只有一张图，自动作为主图。
