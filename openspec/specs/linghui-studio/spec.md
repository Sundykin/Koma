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

### Requirement: Executable Linghui Agent Node
灵绘 SHALL 提供可执行的 `linghui/agent` 节点，使工作流中的节点可以触发 Agent 推理与工具调用，并输出文本结果给下游节点消费。

#### Scenario: 创建并运行 agent 节点
- **WHEN** 用户在灵绘画布中创建一个 agent 节点并填写提示词后执行
- **THEN** 系统 MUST 调用 Agent 执行链路而不是普通 LLM 文本生成链路
- **AND** 节点执行完成后 MUST 产出文本结果
- **AND** 该文本结果 MUST 可以继续作为下游文本输入被其他节点消费

#### Scenario: 消费上游文本与图片参考
- **WHEN** agent 节点连接了上游文本节点或图片节点后执行
- **THEN** 系统 MUST 将上游文本内容并入当前 Agent 输入
- **AND** MUST 将上游图片作为图片参考发送给 Agent

### Requirement: Agent Tooling And Trace Metadata
灵绘 SHALL 允许 agent 节点配置工具白名单，并将推理与工具调用轨迹保存在节点结果 metadata 中。

#### Scenario: 仅启用选中的工具
- **WHEN** 用户在 agent 节点中只选择了部分工具
- **THEN** 系统 MUST 仅向当前 Agent 执行暴露这些工具
- **AND** 未被选中的工具 MUST 不可被当前节点调用

#### Scenario: 保存 reasoning 与工具轨迹
- **WHEN** agent 节点执行过程中产生 reasoning、工具调用或工具结果
- **THEN** 系统 MUST 将这些轨迹写入当前节点结果的 metadata
- **AND** 最终文本结果 MUST 继续保持可读的最终回答内容

### Requirement: Agent Execution Safety Boundaries
灵绘 SHALL 为 agent 节点的首版执行能力提供显式边界和失败提示，避免静默回退或无限循环。

#### Scenario: LLM 渠道不兼容 chat agent
- **WHEN** 用户为 agent 节点选择了当前 chat agent 不支持映射的 LLM 渠道
- **THEN** 系统 MUST 阻止该节点执行
- **AND** MUST 明确提示当前渠道无法用于 Agent 节点

#### Scenario: 超过最大迭代次数
- **WHEN** agent 节点执行过程中超过配置的最大迭代次数
- **THEN** 系统 MUST 主动取消当前 Agent 执行
- **AND** MUST 将该节点标记为失败并告知用户超过迭代上限

### Requirement: Portable Linghui File Access

灵绘 SHALL 通过可替换的文件系统端口解析本地资源预览、落盘中间素材并写出结果，而不是在功能模块中直接依赖单一宿主文件系统实现。

#### Scenario: 通过文件系统端口解析本地预览 URL

- **WHEN** 灵绘节点、提示词引用或结果面板需要展示本地文件资源
- **THEN** 系统 MUST 通过当前激活的文件系统端口生成可展示的 URL
- **AND** 对于远程 URL、`data:` URL、`blob:` URL 和 `koma-local://` 资源 MUST 保持原值不变

#### Scenario: 通过文件系统端口落盘中间素材和导出结果

- **WHEN** 灵绘执行宫格切分输入持久化或结果导出写盘
- **THEN** 系统 MUST 通过当前激活的文件系统端口完成目录创建、文件写入、复制或下载
- **AND** 调用方 MUST 不再直接依赖宿主级 `electronService.fs` API

### Requirement: Explicit Runtime Capability Boundaries For Linghui File Actions

灵绘 SHALL 为依赖特定文件系统能力的操作提供显式边界提示，避免在非支持运行时中静默失败。

#### Scenario: 当前运行时不支持目录选择导出

- **WHEN** 用户在不支持目录选择能力的运行时中执行灵绘结果导出
- **THEN** 系统 MUST 阻止导出
- **AND** MUST 明确提示当前文件系统实现不支持结果导出

#### Scenario: 当前运行时不支持本地路径型宫格切分

- **WHEN** 用户在不支持原生本地路径能力的运行时中执行宫格切分
- **THEN** 系统 MUST 阻止该操作
- **AND** MUST 明确提示当前文件系统实现不支持宫格切分

### Requirement: Built-In Recipe Templates In Linghui Workflow Library

灵绘 SHALL 在工作流模板库中提供系统级 Recipe 模板，使用户可以直接把预设工作流骨架发送到画布继续编辑。

#### Scenario: 打开工作流模板库时展示系统 Recipe

- **WHEN** 用户打开灵绘的“添加到画布”或“工作流模板”抽屉
- **THEN** 系统 MUST 展示内置 Recipe 模板
- **AND** 首版 MUST 至少包含“角色设计流”“分镜创作流”“配音工作流”三类 Recipe
- **AND** 每个 Recipe MUST 包含节点快照、连线关系和默认参数预设

#### Scenario: 将系统 Recipe 发送到画布

- **WHEN** 用户从模板库中选择任一内置 Recipe 并发送到画布
- **THEN** 系统 MUST 复用现有模板插入协议把完整子图发送到画布
- **AND** 插入后的节点关系和默认参数 MUST 保持与 Recipe 定义一致

### Requirement: Workflow Template Metadata Distinguishes Recipes And Workspace Saves

灵绘 SHALL 为工作流模板提供显式来源元数据，区分系统 Recipe 和工作区自建模板。

#### Scenario: 读取模板列表时暴露模板来源与类型

- **WHEN** 系统读取当前工作区的工作流模板列表
- **THEN** 每条模板记录 MUST 暴露来源与类型元数据
- **AND** 系统 Recipe MUST 被标记为系统来源
- **AND** 用户保存的工作流模板 MUST 被标记为工作区来源

#### Scenario: 保存工作流块为模板

- **WHEN** 用户将选中的节点或工作流块保存为工作流模板
- **THEN** 系统 MUST 继续保存该模板的 snapshot、统计信息和名称
- **AND** 新保存的模板记录 MUST 显式标记为工作区模板

### Requirement: Explain-Style Execution Plan Before Batch Run

灵绘 SHALL 在批量执行前生成可确认的执行计划，使用户能在真正提交前看到本轮执行规模、并行结构与预计耗时。

#### Scenario: 运行全部前展示执行计划

- **WHEN** 用户在灵绘中触发“运行全部”
- **THEN** 系统 MUST 在真正开始执行前展示当前工作流的执行计划
- **AND** 计划中 MUST 包含目标节点规模、依赖补跑范围、执行波次数与最大并行度
- **AND** 用户确认后系统才开始真正执行

#### Scenario: 运行选中前展示执行计划

- **WHEN** 用户在灵绘中触发“运行选中”或执行工作流块
- **THEN** 系统 MUST 基于解析后的目标节点生成执行计划
- **AND** 计划中 MUST 展示本轮实际会执行的节点而不是仅展示原始选中项

### Requirement: Execution Plan Summarizes Duration, Bottlenecks And Cost Availability

灵绘 SHALL 在执行计划中给出预估时长、瓶颈节点和成本可估状态，避免用户在复杂工作流上盲跑。

#### Scenario: 基于历史运行与波次估算总耗时

- **WHEN** 系统为一组目标节点生成执行计划
- **THEN** 系统 MUST 基于节点历史运行时长或节点类型兜底估算每个执行波次的时长
- **AND** MUST 生成整轮执行的总耗时估算
- **AND** MUST 标记本轮的瓶颈节点

#### Scenario: 当前缺少稳定价格元数据

- **WHEN** 系统当前无法从运行时上下文中获得稳定的 provider 定价信息
- **THEN** 执行计划 MUST 明确显示当前成本暂不可估
- **AND** MUST 不得伪造价格数字

### Requirement: Capability-Aware Provider Fallback For Image And Video Execution

灵绘 SHALL 为图片与视频节点执行生成同能力 Provider fallback 计划，并在首选 Provider 不可用或运行失败时自动切换到备选。

#### Scenario: 首选当前选择并限制候选范围

- **WHEN** 系统准备执行图片或视频生成请求
- **THEN** 系统 MUST 优先尝试节点显式选择的 Provider，若未显式选择则优先尝试当前默认 Provider
- **AND** MUST 仅从同一媒体类别下、已启用且支持当前 capability 的其他 Provider / model 中选择备选
- **AND** MUST 对本轮总尝试次数设置上限，避免无限重试

#### Scenario: Provider 在运行阶段失败后自动切换

- **WHEN** 当前图片或视频 Provider 创建失败、校验失败、任务提交失败或异步轮询失败 / 超时
- **THEN** 系统 MUST 自动切换到下一个备选 Provider 重试同一执行请求
- **AND** 在备选耗尽前 MUST 不立即终止当前节点执行

### Requirement: Provider Fallback Outcomes Stay Transparent

灵绘 SHALL 在 Provider fallback 成功或失败后保留可追踪的尝试摘要，避免自动切换变成黑盒。

#### Scenario: 备选 Provider 接管成功

- **WHEN** 节点在首选 Provider 失败后由备选 Provider 成功完成
- **THEN** 系统 MUST 在节点结果 metadata 中记录本轮尝试过的 Provider 列表、失败原因摘要与最终成功 Provider
- **AND** MUST 使用最终成功 Provider 的结果继续写回节点

#### Scenario: 全部备选耗尽

- **WHEN** 当前执行请求的所有 Provider 尝试都失败
- **THEN** 系统 MUST 将该节点标记为失败
- **AND** MUST 在失败信息中包含已尝试 Provider 摘要与最后一次错误
