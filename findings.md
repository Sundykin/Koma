# 發現與決策

## 需求
- 用户希望查找 `LibTV` 相关功能和文档。
- 用户希望对照当前灵绘，列出缺失能力。
- 用户希望在差异基础上制定补齐计划，而不是直接进入实现。

## 新需求：2026-03-28 节点编辑弹窗变更提案
- 用户希望为灵绘中的节点编辑弹窗制定新的 OpenSpec 变更，而不是直接编码。
- 用户要求节点编辑弹窗更融入画布，不要挡住被编辑节点。
- 用户要求围绕节点形成上下两部分布局：上方紧凑工具条、下方主编辑区，中间保留节点本体可见。
- 用户要求图片节点和视频节点按模式裁剪内容：
  - 图片生成模式弱化上传区，重点来自上游输入和提示词
  - 图片导入输出模式无需编辑提示词
  - 视频导入模式同样应隐藏无关生成控件
- 用户要求多角度等工具改成独立能力入口，而不是和主编辑区混成一块。
- 用户要求提示词编辑器视觉上与弹窗背景融合，减少割裂感。

## 新需求：2026-03-28 图片节点多图集合与宫格切分
- 用户希望图片节点支持多张图片，但单节点最多保留 4 张。
- 用户希望图片节点同时支持“多张生成”和“多张导入输出”。
- 用户要求同一图片节点中的图片必须保持相同比例。
- 用户希望图片节点在有图时直接展示图片，多图时可以展开平铺，并带有动画效果。
- 用户要求只有被设为主图的图片才能被下游节点继续使用。
- 用户希望为图片节点增加“宫格操作”：
  - 支持 4 / 9 / 16 / 25 宫格
  - 分割线显示在放大的图片预览上
  - 用户可多选若干格子
  - 选中后通过 IPC 调用 FFmpeg 做高清化
  - 最终自动生成对应数量的导入图片节点

## 本輪研究發現：图片节点多图集合
- 当前图片节点属性层仍以单个 `source` 为核心，只能稳定表达“单张导入图片”。
  - 参考：`frontend/src/types/linghui.ts`
- 当前图片节点执行层虽然支持 `batchCount` 和 `gridType` 返回多张结果，但：
  - 节点本体不会展示多张图
  - 下游引用不会区分“用户当前想用哪张”
  - 提示词引用默认会把整组结果都暴露出来
  - 参考：`frontend/src/components/linghui/linghuiExecutionNodeExecutors.ts`
  - 参考：`frontend/src/components/linghui/linghuiPromptReferences.ts`
- 当前图片节点编辑器仍以单图导入/单图预览为主：
  - 导入模式只支持 1 张图
  - 生成模式的批量结果没有节点内选图与主图切换
  - `gridType` 当前仍被当作生成数量辅助参数，而不是切图工具
  - 参考：`frontend/src/components/linghui/ImageNodeEditor.tsx`
- 当前图片节点卡片只显示单张缩略图，不支持多图展开或平铺动画。
  - 参考：`frontend/src/components/linghui/nodes/ImageNode.tsx`
  - 参考：`frontend/src/components/linghui/LinghuiPage.css`

## 本輪研究發現：宫格切分能力
- Electron 侧已经存在 FFmpeg IPC 和前端封装，不需要重新搭建图像处理通道。
  - 参考：`electron/controller/ffmpeg.ts`
  - 参考：`electron/service/ffmpeg.ts`
  - 参考：`frontend/src/services/ffmpegManager.ts`
- 当前 FFmpeg 只支持 `splitGridImage` 的 3x3 场景，本质上是九宫格专用实现。
  - 参考：`electron/service/ffmpeg.ts`
- Storyboard 场景里已经有“先确保本地文件、再切图、再生成新图片资产”的成熟路径，可以借鉴到灵绘。
  - 参考：`frontend/src/components/storyboard/ShotCard.tsx`

## 本輪设计决策
- 图片节点升级为“图片集合容器”，但集合大小限制在 4，避免节点膨胀失控。
- 下游只消费主图，不默认消费整组图片，保证提示词编译和执行顺序稳定。
- 多张生成继续使用批量生成语义，宫格切分改为独立工具，不再与生成数量混用。
- 宫格切分始终作用于当前主图；切分结果不回写原节点，而是自动生成新的导入图片节点。

## 本輪实现补充发现
- 图片节点多图体验除了数据模型，还依赖节点卡片层的“展开态”视觉提示；仅有缩略图堆叠不足以表达集合浏览，因此补成了 hover / selected 时展开为平铺网格的动画。
  - 参考：`frontend/src/components/linghui/nodes/ImageNode.tsx`
  - 参考：`frontend/src/components/linghui/LinghuiPage.css`
- 用户对“多图节点”的预期更接近一张张图片直接叠成节点本体，而不是“主图 + 额外漂浮缩略图”；因此节点 DOM 需要以多层完整图片为基础，而不是附加装饰层。
  - 参考：`frontend/src/components/linghui/nodes/ImageNode.tsx`
  - 参考：`frontend/src/components/linghui/LinghuiPage.css`
- 宫格工具在结构接入后如果没有独立样式，用户几乎感知不到分割线与选择状态；因此需要专门的网格预览、编号、选中高亮和“未单选时默认全选”提示。
  - 参考：`frontend/src/components/linghui/ImageNodeEditor.tsx`
  - 参考：`frontend/src/components/linghui/LinghuiPage.css`
- 仅规范化 `getAllInputResults()` 还不够，`getInputResult()` 也需要对图片节点运行结果做主图归一，否则少数按单槽读取的执行路径仍可能绕过主图选择。
  - 参考：`frontend/src/components/linghui/linghuiExecutionShared.ts`
- 宫格切分产生的导入图片节点如果不自动回连源节点，会丢失来源关系和后续整理线索；回写节点时需要同时创建对应连线。
  - 参考：`frontend/src/components/linghui/useLinghuiCanvasDocumentOps.ts`
- 当前灵绘连线之前只承担展示作用，缺少独立删除入口；把连线纳入右键菜单和键盘删除后，画布编排会更接近节点编辑器的基本操作预期。
  - 参考：`frontend/src/components/linghui/LinghuiCanvas.tsx`
  - 参考：`frontend/src/components/linghui/LinghuiCanvasContextMenu.tsx`
  - 参考：`frontend/src/components/linghui/LinghuiEdge.tsx`

## 研究發現
- `LibTV` 相关公开资料在通用搜索里噪音较大，但在 LiblibAI 官方域名下可以确认它属于同一产品体系的一部分，而不是孤立的单点产品。
- LiblibAI 当前公开出来的能力不是“单一画布工具”，而是覆盖图片生成、视频生成、WebUI、ComfyUI 工作流、LoRA 训练、AI 应用、资产、创作中心、教程、API 的完整创作平台。
- 官方教程明确展示了平台入口与内容面：
  - 图片生成、视频生成、WebUI、ComfyUI、训练 LoRA、AI 应用、资产、创作中心、教程、API
  - 参考：`https://www.liblib.art/tutorial/1`
- 官方教程明确展示了模型广场/模型库思路，以及 WebUI 侧的模型选择、文生图/图生图切换、参数编辑、提示词翻译、社区推荐：
  - 超过 `10w+` 模型
  - `文生图 / 图生图`
  - 宽高、图片数量、采样器、步数等参数
  - 中文提示词自动翻译
  - 社区推荐参数
  - 参考：`https://www.liblib.art/tutorial/1`
- 官方 API 服务条款明确证明 LiblibAI 已将“模型/工作流能力”包装为 API 开放平台：
  - API 以“基于模型、工作流的图像生成”形式对外提供
  - 服务内容可包含文生图、图生图、工作流等
  - 要求接入方遵循接口文档、使用指南、错误码、安全审核等规则
  - 参考：`https://www.liblib.art/activities/API-Service-Agreement`
- 官方原创工作流许可协议表明“工作流”本身是可展示、销售、授权的资产类型，说明平台不只是运行工作流，还支持工作流商品化和创作者收益分发：
  - 平台可展示、推广、销售原创工作流
  - 支持工作流授权许可、收益结算
  - 参考：`https://www.liblib.art/activities/dd75ccf1b2674157ba11be35cb6a4a89/Original_ComfyUI_License_Agreement`
- 官方模型/工作流页表明其内容生态已经联动模型、工作流、LoRA 与视频创作场景：
  - 模型页可直接挂接工作流、LoRA、ComfyUI 模板、API 可用性说明
  - 参考：`https://www.liblib.art/modelinfo/9f59fd019aa84ac7888002a340d42a3b`
- 社区页还能看到较成熟的工作流与可控生成生态：
  - ControlNet 工作流
  - 图生图、换背景、角色一致性、视频换脸/换装
  - 参数推荐、模板复用、教程联动
  - 参考：`https://www.liblib.art/modelinfo/668e78793c2144d6b091a1d06f63d3bc`
  - 参考：`https://www.liblib.art/modelinfo/e1a1d556aecc48f58c0f3ec5a5890fea?from=feed`
- 基于以上官方资料，我推断当前对标 `LibTV/LiblibAI` 时，至少要按 7 个能力层看：
  - 生成层：图片、视频、图生图、图生视频、可控生成
  - 工作流层：ComfyUI/在线工作流、模板化、参数化、可复用
  - 模型层：模型广场、LoRA、模型库、推荐参数
  - 资产层：图片/视频/参考资产沉淀与复用
  - 创作者层：发布、授权、变现、创作中心
  - 协作分发层：API/SDK/开放平台
  - 内容生态层：教程、社区、一键复刻、经验沉淀

## 当前灵绘现状
- OpenSpec 把灵绘定位为“独立工作台 + 无限画布 + 分组 + 节点执行 + 预览导出”的图形工作流编辑器，而不是平台级创作生态。
  - 参考：`openspec/changes/add-linghui-canvas-studio/specs/linghui-studio/spec.md`
- 当前类型系统和节点定义里，灵绘的节点集合仍然很小：
  - `linghui/reference`
  - `linghui/image`
  - `linghui/video`
  - `linghui/storyboard-shot`
  - `linghui/storyboard-group`
  - 参考：`frontend/src/types/linghui.ts`
  - 参考：`frontend/src/components/linghui/linghuiNodeDefs.ts`
- 图片节点和视频节点当前主要是“单节点统一配置”，还不是多模板、多算子、多控制链路的工作流系统：
  - 图片：提示词、渠道、比例、分辨率、宫格、批量
  - 视频：提示词、渠道、参考模式、比例、分辨率、时长
  - 参考：`frontend/src/components/linghui/ImageNodeEditor.tsx`
  - 参考：`frontend/src/components/linghui/VideoNodeEditor.tsx`
- 提示词编辑器已经支持从上游产物注入 `@ref_xxx` 引用，并在执行前编译为 provider 需要的引用顺序，这是灵绘里相对先进的一块。
  - 参考：`frontend/src/components/linghui/LinghuiPromptEditor.tsx`
  - 参考：`frontend/src/components/linghui/linghuiPromptReferences.ts`
  - 参考：`frontend/src/components/linghui/linghuiExecution.ts`
- 工作区存储目前是本地工作区 JSON + 资源文件导入，导出也是 `.linghui.json`，属于“可恢复编辑状态”的本地工程导出，不是可发布、可分享、可交易、可远程执行的工作流资产。
  - 参考：`frontend/src/store/linghuiStorage.ts`
- 工具栏层面目前也仍是本地工作区导向：
  - 新建、打开、重命名、保存、导出
  - 没有模型广场、工作流模板、发布、市场、协作入口
  - 参考：`frontend/src/components/linghui/LinghuiToolbar.tsx`

## 差异與缺口

### P0：核心能力缺口
- 缺少平台级“工作流模板/预设”体系。
  - 当前灵绘只有自由搭图，没有官方模板库、推荐流、行业方案流、可一键落图的预设。
- 缺少模型层配置能力。
  - 当前只选择渠道配置 `ttiConfigId / itvConfigId`，没有显式模型、LoRA、ControlNet、采样器、种子、负面提示词、Hires、预处理链路。
- 缺少图生图/可控生成的细粒度编排。
  - 现在参考图更多是“上游参考输入”，不是 Liblib 那种图生图、ControlNet、IP-Adapter、局部修复、外扩、风格迁移等清晰能力面。
- 缺少工作流可复用与一键复刻能力。
  - 当前灵绘可以保存当前工作区，但没有“把某次成功运行沉淀成模板/配方/可分享工作流”的机制。
- 缺少结果可追溯元数据能力。
  - 当前没有 PNG 信息解析/反查、推荐参数回填、出图配方回放。

### P1：竞争力缺口
- 缺少模型/工作流/LoRA 生态入口。
  - 用户无法在灵绘内浏览、收藏、应用社区模型和工作流。
- 缺少素材/资产中心。
  - 当前参考图是工作区内局部资源，不是跨工作区可检索、可标注、可复用的资产层。
- 缺少发布与分享闭环。
  - 无工作流发布、模板发布、结果发布、分享链接、版本管理。
- 缺少创作者商业化能力。
  - 无工作流授权、收益分账、权限控制、会员资产等。
- 缺少高级视频工作流。
  - 当前视频节点配置较浅，离角色一致性、视频换装/换脸、动作驱动、首尾帧插值、多阶段视频链路仍有距离。

### P2：平台化缺口
- 缺少开放平台层。
  - 当前没有把灵绘工作流包装为对外 API/SDK 调用能力。
- 缺少教程/社区/推荐系统联动。
  - 当前灵绘是编辑器孤岛，没有“从案例进入模板”“从模板进入画布”“从产物回流教程”的内容闭环。
- 缺少协作与远程执行能力。
  - 没有多人协作、队列、云端运行、作业管理、权限审计。

## 補強方向
- 如果目标是“把灵绘补到能和 LibTV/LiblibAI 正面对标”，建议不要继续只做画布交互细修，而要切到“编辑器内核 + 模板生态 + 模型生态 + 资产生态 + 发布分发”五层设计。
- 如果只追求近期可见价值，优先做 `工作流模板化 + 模型/LoRA/ControlNet 显式配置 + 资产中心 + 结果复刻`，这是最接近用户心智、也最能快速拉开差异的部分。

## 仅画布能力视角

### LibTV / LiblibAI 画布侧可确认的能力信号
- 官方工作流页明确体现出其画布核心不是“单个节点编辑”，而是“可二次创作的模块化工作流”：
  - 包含 IPAdapter、ControlNet、局部重绘、扩图等能力模块
  - 允许根据目的“手动调整节点连线”
  - 允许“增减模块、重新连线”，把某项能力固化成特殊目的工作流
  - 参考：`https://www.liblib.art/modelinfo/39b0c271ddc7477fa9f465b0de3c21db`
- 官方模板页明确体现出模板工作流的载入与复用体验：
  - 工作流以图片和 JSON 为主
  - 可将图片或 JSON 直接拖入 ComfyUI 主界面加载
  - 模板可以继续扩展出 control-lora 等更多变体
  - 参考：`https://www.liblib.art/modelinfo/805547f47d3f49269d43adb28c922132`
- 官方视频工作流页体现出更成熟的模块拆分和队列执行心智：
  - 首尾帧、控制生成、图生视频、补帧、放大等模块独立
  - 页面直接出现 `执行队列(queue)`、缺失节点安装、工作流重构说明
  - 参考：`https://www.liblib.art/modelinfo/7a8e24ec7619494381099900fb2b27c2`

### 当前灵绘画布实现现状
- 灵绘当前的画布交互核心基本都集中在 `LinghuiCanvas.tsx`，已经具备：
  - 鼠标/手模式切换
  - 框选
  - 右键菜单
  - 节点右键删除/运行
  - 选区转分组
  - 分组取消、分组重命名、分组 resize
  - 节点点击打开弹窗、长按拖动
  - 最近日志内嵌到右键菜单
  - 参考：`frontend/src/components/linghui/LinghuiCanvas.tsx`
- 当前节点层是“紧凑卡片 + 左右 Handle + 状态条”的简化画布节点：
  - 有执行状态徽标和进度条
  - 但没有模块级折叠、子节点展开、端口命名可视化、边在线路中途的 reroute 点
  - 参考：`frontend/src/components/linghui/nodes/LinghuiNodeShell.tsx`
- 当前分组层已支持：
  - NodeResizer
  - 双击标题重命名
  - 右键取消分组
  - 但仍是 React Flow 的 group 容器模型，不是工作流级 subgraph
  - 参考：`frontend/src/components/linghui/nodes/CanvasGroupNode.tsx`

### 纯画布缺口

#### P0：工作流画布基本盘仍不够
- 缺少“工作流模板载入/保存”为画布一等能力。
  - 当前只能保存整个工作区 JSON，不能像 ComfyUI 那样围绕工作流模板做拖入加载、模板复用、局部复用。
- 缺少“模块化子流程”能力。
  - 现在分组只是视觉容器，不是可折叠、可复用、可单独运行、可导出的子流程。
- 缺少更强的连线编辑能力。
  - 目前仅支持连/断和校验，不支持 reroute、批量改线、连线重排、端口重命名可视化、线束整理。
- 缺少工作流调试态画布。
  - 目前只有节点运行状态，没有执行路径高亮、逐节点停留、失败链路定位、输入输出沿线回溯。
- 缺少模板/节点拖入导入体验。
  - 当前节点拖入只来自本地节点库，不支持把工作流包、图片元数据、JSON 直接拖进画布生成节点或整条流程。

#### P1：效率型画布能力不足
- 缺少快捷键体系。
  - 复制/粘贴、复制样式、重复节点、删除、框选后快速对齐/分布、缩放到选区、居中当前节点等都不明显。
- 缺少节点整理工具。
  - 没有自动布局、吸附、对齐线、等距分布、批量整理、模块折叠摘要。
- 缺少视口导航工具。
  - 没有 minimap、书签、返回上次视口、快速跳转到运行失败节点。
- 缺少多选编辑能力。
  - 现在多选后主要是运行和分组，缺少批量删、批量复制、批量改名、批量移动、批量禁用。
- 缺少更丰富的右键动作。
  - 当前右键菜单偏轻量，离成熟工作流编辑器的一键插入、断开上游、替换节点、复制节点子图、封装成模板还差很远。

#### P2：稳定性和一致性仍需补
- 节点拖动目前依赖长按判定，虽符合你的设定，但复杂节点内容下容易和点击、输入、框选交叉，需要继续收敛误触。
- 自动保存和画布渲染状态耦合仍是风险点。
  - 之前已经出现过自动保存触发重新渲染的问题，这类问题对画布编辑器伤害很大。
- 画布状态来源比较分散。
  - 选区、待分组区域、编辑弹窗、右键菜单、运行状态都在同一大组件里管理，继续叠功能会更容易互相覆盖。

## 基于操作手册的设计重写结论

- 根目录 `design.md` 不是技术设计稿，而是 `LibTV 使用指南 / 操作手册`。它更适合被当作“功能反推来源”，而不是直接照抄成灵绘设计。
- 基于该手册，最应进入灵绘新设计的画布能力有：
  - 双击空白快速建节点
  - 图片/视频/音频直接拖入画布自动建节点
  - 文本/图片/视频/音频/脚本 5 类基础节点
  - 节点复制、粘贴、副本、删除、撤销重做
  - 打组、保存为工作流、发送工作流到画布、整组执行
  - 添加/工作流/资产/历史/教程入口
  - 小地图、缩放比例、快捷键面板
  - 图片节点 Slash 快捷功能、图像工具条、视频工具条
- 当前灵绘最不适合保留的旧设计是“固定四区壳层”。
  - 该设计既不符合用户要更大画布的目标，也和当前已经完成的 UI 收缩方向冲突。
- 本轮已经将灵绘设计重写为“画布优先”方案：
  - 顶部最小工具栏
  - 中部画布主区域
  - 右键菜单 + 双击创建 + 文件拖入
  - 抽屉承载 添加 / 工作流 / 资产 / 历史 / 教程
  - 小地图和缩放比例作为轻量浮层
  - 分组升级为可保存模板、可整组运行的工作流块
  - 节点体系重构为 5 类基础节点
  - 自动保存与 UI 暂态解耦
- 已完成重写的设计文件：
  - `openspec/changes/add-linghui-canvas-studio/design.md`

## 节点能力补充结论

- 仅仅“增加节点种类”还不够，LibTV 手册里的节点能力是三层结构：
  - 节点类型能力：节点承载什么内容、怎么输入、输出什么
  - 节点操作能力：复制、粘贴、副本、删除、创建资产、整组复用
  - 节点工具能力：图片工具条、视频工具条、Slash 快捷动作等
- 当前灵绘在节点能力上的核心缺失有：
  - 缺少文本节点、音频节点、脚本节点
  - 图片节点仍然把“导入图片”和“生成图片”拆成了 `reference + image` 两种心智

## 节点编辑弹窗变更提案的现状发现

- `LinghuiNodeEditor.tsx` 当前轻编辑态仍然只是在节点上方或下方放一块大卡片：
  - 位置算法只有 `above / below + centered`
  - 没有“上方工具条 + 下方编辑区 + 节点主体可见”的空间规划
  - 节点很容易被面板直接挡住
- `ImageNodeEditor.tsx` 当前无论模式如何都保留大面积上传区：
  - `generate` 模式下仍突出拖拽上传，不符合“主要由上游驱动”的使用路径
  - `import` 模式下仍渲染提示词编辑器和生成参数，只是文案变化
  - 多角度、扩图、打光、重绘等工具直接作为大块 preset panel 插入主编辑区
- `VideoNodeEditor.tsx` 也有相同问题：
  - 上传区在生成模式中同样过于显眼
  - 导入模式没有真正裁掉提示词和生成参数
  - 工具能力和主表单没有分层
- `LinghuiPromptEditor.tsx` 功能上已经支持 `@` 引用、补全和缩略预览：
  - 这部分能力不需要重写
  - 主要问题在于放入节点弹窗后，视觉上仍像第二层卡片
- `LinghuiPage.css` 中 `.linghuiEditorPanel` 与 `.linghuiEditorPrompt .cm-editor` 都有很强的边框和背景盒子感：
  - 容易形成“浮层里再嵌一个编辑器盒子”的割裂体验

## 本轮提案的设计判断

- 本轮应该创建新的 OpenSpec change，而不是直接改现有实现。
- 更适合新建 `linghui-studio` 相关变更，而不是并入 `ui-layout` 或 `ui-components`。
- 这次提案的核心不在“移除弹窗”，而在“重构弹窗与节点的空间关系”。
- 图片和视频节点都需要明确的模式裁剪规则，否则视觉负担和误操作会持续存在。
- 提示词编辑器应保留现有 `@` 能力，只重做在节点弹窗中的视觉容器和层级。

## 节点编辑弹窗实施结果

- `LinghuiNodeEditor.tsx` 已改成“非阻塞覆盖层 + 上方工具条 + 下方主编辑区”的结构：
  - 顶层覆盖层不再拦截整块画布
  - 只有工具条和主编辑面板能接收事件
  - 主编辑面板增加了底部优先、侧边降级的避让策略
- `ImageNodeEditor.tsx` 已按模式拆分：
  - `generate` 模式不再渲染大上传区，改为上游输入区 + 紧凑附加参考图卡片 + 提示词 + 生成参数
  - `import` 模式只保留图片预览、上传/替换、清空和运行
- `VideoNodeEditor.tsx` 已按生成/导入状态拆分：
  - 生成模式以输入摘要、参考组织、提示词和参数为主
  - 导入模式只保留视频预览、上传/替换、清空和运行
  - 生成型工具在导入模式下会明确提示并支持切回生成模式
- 图片和视频工具能力已从主表单中抽离：
  - 主编辑区和工具面板改成独立并列结构
  - 工具开关不再把整块预设卡插进主表单中间
- `LinghuiPromptEditor.tsx` 新增了 `surfaceStyle="fusion"` 视觉模式：
  - 节点弹窗里的提示词编辑器不再是明显的第二层盒子
  - `@` 引用 widget、补全列表和预览能力保持不变

## 实现验证结论

- `pnpm -s exec tsc --noEmit --pretty false -p frontend/tsconfig.json` 通过，说明前端改动类型正确。
- `frontend/` 下的 `pnpm exec vite build` 通过，说明这批 UI 改动可以完成生产构建。
- 仓库根目录全量 `tsc` 仍被 `electron/` 侧既有问题阻塞，不是本轮灵绘改动引入。
  - 视频节点仍然缺少上传模式、多模态输入和工具条能力
  - 节点通用操作还没有成为一等能力
  - 节点复杂能力仍然过度依赖弹窗，不适合继续扩展
- 本轮已把这些结论同步到 OpenSpec 文档层：
  - 重写 `openspec/changes/add-linghui-canvas-studio/design.md`，新增节点能力矩阵和每类节点能力设计
  - 重写 `openspec/changes/add-linghui-canvas-studio/specs/linghui-studio/spec.md`，新增核心节点体系、节点能力包、节点工具能力等 requirement
  - 重写 `openspec/changes/add-linghui-canvas-studio/tasks.md`，将节点能力补齐拆成可执行任务
- 后续又进一步完善了提案三件套的一致性：
  - 更新 `proposal.md`，让变更范围与新设计保持一致
  - 扩充 `spec.md`，补齐快捷键/剪贴板、节点专属能力、工作流与资产抽屉等场景
  - 细化 `tasks.md`，补齐历史栈、下游快速创建、资产/历史发送到画布、脚本派生执行等任务
- OpenSpec 校验结果：
  - `openspec validate add-linghui-canvas-studio --strict` 通过

### 逐节点缺失清单

- 文本节点：
  - 当前完全缺失独立节点
  - 缺手动输入、粘贴、LLM 生成、文本结果预览、文本资产化
- 图片节点：
  - 缺上传与生成统一节点模型
  - 缺文件拖入建图节点
  - 缺多图参考融合显式能力
  - 缺 Slash 快捷动作
  - 缺图像工具条：增强、扩图、多角度、打光、重绘、擦除、抠图、标注、裁剪、宫格切分
  - 缺节点级创建资产与副本语义
- 视频节点：
  - 缺上传与生成统一节点模型
  - 缺文生视频、首尾帧、多模态参考的完整节点语义
  - 缺视频工具条：高清、解析、剪辑、合成、运镜
  - 缺与音频节点联合工作的节点能力
- 音频节点：
  - 当前完全缺失独立节点
  - 缺上传、TTS、音效/音乐生成、结果播放和作为下游输入的能力
- 脚本节点：
  - 当前完全缺失独立节点
  - 缺剧情/剧本/角色图/参考视频生成脚本
  - 缺表格/卡片/全屏、字段显隐、批量勾选
  - 缺脚本直出分镜图、批量出视频
- 所有节点通用：
  - 缺复制/粘贴/副本/删除/撤销重做
  - 缺创建资产
  - 缺从当前节点拉出下游新节点
  - 缺折叠态 / 轻编辑态 / 沉浸式态三层视图

## 技術決策
| 決策 | 理由 |
|------|------|
| 用 LiblibAI 官方教程、协议、模型/工作流页作为主要外部依据 | `LibTV` 关键词噪音大，但官方域名内已经足够证明产品面和平台边界 |
| 将本次对标维度提升到“平台能力”而不是“单画布功能” | 官方资料显示其核心竞争力来自模型/工作流/创作者/API/社区生态联动 |
| 当前回合只输出研究结论与补强计划，不直接进入实现 | 用户请求的是盘点差距与制定计划 |
| 后续若要补齐 P0/P1 能力，先走 OpenSpec proposal | 会涉及节点体系、存储模型、模板系统、资产中心、发布机制等结构性变更 |

## 遇到的問題
| 問題 | 解決方案 |
|------|---------|
| `LibTV` 关键字存在大量非目标产品噪音 | 优先缩窄到 LiblibAI 官方域名与官方托管页面 |
| `LiblibAI` 某些页面是动态内容，不一定能稳定抓到完整正文 | 优先使用能稳定打开的官方教程、协议、模型/工作流页作为证据 |

## 資源
- `openspec/AGENTS.md`
- `openspec/project.md`
- `openspec/changes/add-linghui-canvas-studio/*`
- `frontend/src/types/linghui.ts`
- `frontend/src/components/linghui/linghuiNodeDefs.ts`
- `frontend/src/components/linghui/LinghuiPromptEditor.tsx`
- `frontend/src/components/linghui/linghuiPromptReferences.ts`
- `frontend/src/components/linghui/linghuiExecution.ts`
- `frontend/src/components/linghui/ImageNodeEditor.tsx`
- `frontend/src/components/linghui/VideoNodeEditor.tsx`
- `frontend/src/components/linghui/LinghuiToolbar.tsx`
- `frontend/src/store/linghuiStorage.ts`
- `https://www.liblib.art/tutorial/1`
- `https://www.liblib.art/activities/API-Service-Agreement`
- `https://www.liblib.art/activities/dd75ccf1b2674157ba11be35cb6a4a89/Original_ComfyUI_License_Agreement`
- `https://www.liblib.art/modelinfo/9f59fd019aa84ac7888002a340d42a3b`
- `https://www.liblib.art/modelinfo/668e78793c2144d6b091a1d06f63d3bc`

## 視覺/瀏覽器發現
- LiblibAI 官方教程页和模型页顶部导航稳定出现“图片生成、视频生成、WebUI、ComfyUI、训练 LoRA、AI 应用、资产、创作中心、教程、API”等入口，能直接证明平台边界。
- 官方协议页能直接证明“API 开放平台”和“原创工作流商业许可”都已经是正式产品能力，不只是市场宣传。
- 从模型页能观察到“模型 <-> 工作流 <-> LoRA <-> API <-> 创作者页”的强联动结构，这也是当前灵绘最缺的部分。

---
*每執行2次查看/瀏覽器/搜尋操作後更新此檔案*
*防止視覺資訊遺失*
