## ADDED Requirements

### Requirement: Video Node Inline Result Playback

灵绘 SHALL 将视频生成结果的预览与播放交互收口到节点卡片本身，而不是继续放在视频编辑框里重复渲染。

#### Scenario: 节点直接承载生成结果预览
- **WHEN** 视频节点已经拥有生成成功的结果视频
- **THEN** 节点卡片 MUST 直接渲染该视频结果的预览与播放入口
- **AND** 编辑框 MainSurface MUST NOT 再渲染单独的结果预览区域

#### Scenario: 点击播放按钮不弹出编辑框
- **WHEN** 用户点击视频节点卡片上的播放按钮或播放覆盖控件
- **THEN** 系统 MUST 只执行播放或暂停交互
- **AND** MUST NOT 因该次点击而弹出视频编辑框

### Requirement: Concise Video Editor Guidance

灵绘 SHALL 移除视频编辑框中的常驻长文说明，并将必要解释统一收口为简洁标签配合 Ant Design Tooltip。

#### Scenario: 需要解释能力或参数时
- **WHEN** 视频编辑框中的能力、输入摘要、工具入口或参数项需要补充解释
- **THEN** 系统 MUST 使用简洁标签或图标展示主信息
- **AND** MUST 通过 Ant Design Tooltip 提供补充说明

#### Scenario: 打开视频编辑框
- **WHEN** 用户打开生成态的视频节点编辑框
- **THEN** MainSurface MUST NOT 展示大段说明文案、教程式段落或难以理解的描述块
- **AND** 仅保留执行当前生成任务必需的输入、提示词与参数控件

## MODIFIED Requirements

### Requirement: Mode-Adaptive Video Node Editing

系统 SHALL 根据视频节点的来源和所选视频模型能力隐式渲染不同的视频节点交互，不提供显式的“导入输出”模式切换，也不在编辑框中保留结果预览。

#### Scenario: 视频生成节点处于生成状态且模型仅支持一种能力
- **WHEN** 用户打开未挂载本地视频素材的视频节点
- **AND** 当前视频模型仅声明一种视频生成能力
- **THEN** 系统 MUST 直接展示该能力对应的精简编辑变体
- **AND** MUST 仅显示该能力所需的上游输入摘要、提示词区域和参数面板
- **AND** 比例、分辨率、时长 MUST 分别使用独立选择器

#### Scenario: 视频生成节点处于生成状态且模型支持多种能力
- **WHEN** 用户打开未挂载本地视频素材的视频节点
- **AND** 当前视频模型支持多种视频生成能力
- **THEN** 系统 MUST 展示能力切换器
- **AND** 切换器 MUST 只列出该模型真实支持的能力模式
- **AND** 切换能力后 MUST 更新必填输入、参数面板和校验结果
- **AND** 比例、分辨率、时长 MUST 始终保持为三个独立控件

#### Scenario: 画布导入视频直接成为透传节点
- **WHEN** 用户通过拖拽到画布、上传到画布或其他画布导入路径创建视频节点
- **THEN** 系统 MUST 直接创建持有本地视频源的透传视频节点
- **AND** 该节点 MUST 可立即连接给下游节点使用
- **AND** 系统 MUST NOT 要求用户先在编辑框中切换到“导入输出”模式

#### Scenario: 透传视频节点不进入生成编辑态
- **WHEN** 用户选中一个由画布导入创建的透传视频节点
- **THEN** 系统 MUST NOT 渲染提示词编辑器、能力切换器、工具预设或生成参数
- **AND** 该节点 MUST 继续作为直接给下游复用的既有视频产物

### Requirement: Detached Image and Video Tool Surfaces

系统 SHALL 将图片节点和视频节点的工具预设面板统一为 TopBar 按钮的 hover 悬浮下拉，并把工具说明收口到 Tooltip，不占用 MainSurface 空间。

#### Scenario: hover 触发工具预设面板
- **WHEN** 用户将鼠标移入 TopBar 上的图片工具或视频工具按钮
- **THEN** 系统在该按钮正下方弹出紧凑的悬浮预设面板
- **AND** 面板只展示工具标题、预设列表与应用操作
- **AND** MainSurface 内容不发生任何变化

#### Scenario: 鼠标移出收起悬浮面板
- **WHEN** 用户将鼠标从工具按钮和悬浮面板区域完全移出
- **THEN** 系统立即收起悬浮面板
- **AND** 无需点击关闭

#### Scenario: 工具说明通过 Tooltip 暴露
- **WHEN** 用户需要了解某个视频工具或参数的用途
- **THEN** 系统 MUST 使用 Tooltip 展示补充说明
- **AND** MUST NOT 在 MainSurface 中长期占用说明性文本区域
