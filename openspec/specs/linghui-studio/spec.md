# linghui-studio Specification

## Purpose
TBD - updated by archiving changes refactor-image-node-editor and refactor-media-channel-model-capabilities. Refine Purpose after archive.

## Requirements

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

### Requirement: Grid Split Uses Persisted Local Sources
灵绘 SHALL 在宫格切分前确保源图可被本地 FFmpeg 访问。

#### Scenario: 当前主图不是稳定的本地文件
- **WHEN** 用户对远程 URL、data URL 或临时图像执行宫格切分
- **THEN** 系统先把当前主图持久化为工作区内的本地素材
- **AND** 再将该本地文件交给 FFmpeg 切分和高清化
- **AND** 生成的新图片节点引用持久化后的本地输出文件

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

### Requirement: Mode-Adaptive Video Node Editing
系统 SHALL 根据视频节点当前的“导入/生成”状态以及所选视频模型能力裁剪展示内容，而不是把所有视频模式混在同一张表单里。

#### Scenario: 视频节点处于生成状态且模型仅支持一种能力
- **WHEN** 用户打开未挂载本地视频素材的视频节点
- **AND** 当前视频模型仅声明一种视频生成能力
- **THEN** 系统 MUST 直接展示该能力对应的编辑变体
- **AND** MUST 仅显示该能力所需的上游输入摘要、提示词区域和参数面板

#### Scenario: 视频节点处于生成状态且模型支持多种能力
- **WHEN** 用户打开未挂载本地视频素材的视频节点
- **AND** 当前视频模型支持多种视频生成能力
- **THEN** 系统 MUST 展示能力切换器
- **AND** 切换器 MUST 只列出该模型真实支持的能力模式
- **AND** 切换能力后 MUST 更新必填输入、参数面板和校验结果

#### Scenario: 视频节点处于导入状态
- **WHEN** 用户打开已挂载本地视频素材的视频节点
- **THEN** 系统展示视频预览、上传、替换和清空操作
- **AND** 隐藏仅生成模式有意义的提示词和能力参数

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

### Requirement: Integrated Prompt Editing Surface
系统 SHALL 让节点弹窗中的提示词编辑器与外层浮层共享统一的视觉层级，并保留现有 `@` 引用能力。

#### Scenario: 在生成模式中编辑提示词
- **WHEN** 用户在图片节点或视频节点的生成模式中打开提示词区域
- **THEN** 提示词编辑器与节点弹窗共享同一背景层次和圆角体系
- **AND** 不再呈现明显的“卡片中再套卡片”割裂感
- **AND** `@` 引用补全和引用预览能力继续可用

#### Scenario: 导入模式下打开节点弹窗
- **WHEN** 用户打开图片节点或视频节点的导入模式
- **THEN** 系统不渲染当前模式无效的提示词编辑区
- **AND** 节点弹窗整体视觉密度保持紧凑

### Requirement: Capability-Aware Video Node Execution
灵绘 SHALL 将视频节点执行编译为能力级标准请求，再交给统一模型解析器和渠道适配器执行。

#### Scenario: 编译视频节点请求
- **WHEN** 用户执行一个处于生成态的视频节点
- **THEN** 系统 MUST 根据当前所选能力将节点内容编译为标准视频请求
- **AND** MUST 在请求中显式写入能力类型

#### Scenario: 校验上游输入
- **WHEN** 视频节点执行前发现当前输入不满足所选能力契约
- **THEN** 系统 MUST 阻止执行
- **AND** MUST 告知用户缺失的是主图、参考图还是首尾帧

### Requirement: Video Model Switching Safety
灵绘 SHALL 在视频模型或能力切换时处理不兼容的节点状态。

#### Scenario: 模型切换导致当前能力失效
- **WHEN** 用户切换到不再支持当前能力的模型
- **THEN** 系统 MUST 自动重置为该模型支持的默认能力
- **AND** MUST 提示当前已失效的输入和参数将被清理

#### Scenario: 切换后保留兼容字段
- **WHEN** 用户切换到仍兼容部分字段的能力或模型
- **THEN** 系统 MUST 保留仍然合法的提示词和公共参数
- **AND** MUST 清理不再合法的图片输入和模式特有参数
