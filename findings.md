# Findings

## 2026-05-10 Storyboard Image Mode

- 故事板模式应复用现有分镜引用 bundle，而不是新增独立上传/引用协议。这样 `@storyboard_anchor` / `@previous_storyboard_anchor` 会和角色、场景、道具、用户参考图共享同一个 references 顺序，并由 `compileShotPromptToBundle()` 统一编译成 `@Image N`。
- “继承上一故事板”必须落到真实图片引用：实现时从同剧集 `allShots` 中向前查找最近一张 `imageMode === 'storyboard'` 且有当前图片的分镜；若用户关闭 `inheritPreviousStoryboard`，则不注入该 reference，也不允许模板输出 `@previous_storyboard_anchor`。
- 上一故事板不是当前分镜锚点，所以 `previous-storyboard-anchor` 不参与 `hasShotImage`；当前 `storyboard-anchor` 才表示本分镜已有生成图，可作为多参考锚定。
- 故事板模式和九/四宫格一样是多面板图片。视频链路不能把整张故事板当作单一首帧延展；UI 和 workflow 都应把它修正为多参 / reference-to-video 语义，并在视频提示词里提醒不要生成面板边框、箭头、制作表文本。
- 提示词模板需要分两层：推理模板 `storyboard_shot_prompt_generation` 负责把用户分镜整理成电影级故事板 brief；TTI 模板 `tti_storyboard_shot_image` 负责最终出图包装，并再次强调不要渲染可读字幕、对白气泡、标题、项目符号、logo、水印。
- 用户给的四类样例可以抽象为版式选择空间：电影制作方案表、4x4 连续故事板、非对称角色设计表、四格漫画信息图。但当前项目分镜不应固定某一种样式，应该按本分镜剧情自动选择最合适结构，并始终继承项目整体风格。

## 2026-05-10 Storyboard Script Line Editing Stability

- 分镜文本编辑入口在 `ShotScriptLines.tsx`：每行是受控 `<input value={line.text}>`，`onChange` 每个字符调用 `onLinesChange(shotId, lines.map(...))`。
- 父级 `Storyboard.handleScriptLinesChange()` 每次都基于当前 `shots` 构造 `updatedShots` 并调用 `saveAllShots()`；`saveAllShots()` 会同步 `setShots(normalizedShots)` 并排队 `saveEpisodeShots()`。因此一个字符会触发整组 shots 引用更新、Virtuoso data 更新、ShotCard/ShotScriptLines 重渲染和异步保存排队。
- `ShotListEditor` 已经用 `shotsForScrollRef` 避免 active shot 滚动 effect 在输入时重跑，说明该区域已有“输入时被 shots 状态刷新干扰”的历史问题。当前光标跳尾更像受控 input 在每个字符后收到父级重渲染值，浏览器 selection 被重置。
- 最小修复方向：字幕行文本编辑在行组件内维护本地草稿，输入时只更新草稿；失焦/Enter 等提交时才调用父级保存。外部 line.text 变化时，如果该 input 未聚焦再同步草稿。添加/删除/插入/拖拽仍走父级即时保存。

## 2026-05-09 Linghui Prompt Upload Deduplication

- 本轮目标：灵绘提示词编译上传协议必须按“唯一图片源”去重，不应按 `@` 引用次数上传；上传后的远程地址需要写回本地元数据并与文件对应，只有链接失效时重新上传。
- 初始搜索显示相关入口集中在 `frontend/src/components/linghui/**`、`frontend/src/services/promptCompilation/**`、`frontend/src/services/imageHostingService.ts` 和 `frontend/src/services/mediaRemoteUrlService.ts`；项目分镜近期也改过 ITV 上传协议，需要对照检查。
- 当日日志 `logs/koma-20260509.log` / `logs/koma-error-20260509.log` / `logs/ee-core-20260509.log` 用宽泛关键词未直接命中上传错误，需要根据代码里的日志 tag 继续精确查找。
- 根因一：`ensureRemoteUrlForImageSources()` 原来逐项调用 `ensureRemoteUrlForImageSource()`，没有按图片源 key 做批量去重，也没有本地远程 URL 缓存；同一个 data-url / local path 重复出现时会重复上传。
- 根因二：灵绘图片 grok-image-index 路径把显式 `referenceSources` 和静默上游 `silentReferenceSources` 分两次远程归一化；同一张图同时作为 `@ref` 与静默上游参考时，会在同一个节点里触发多次上传，并且 provider references 可能重复携带同一张图。
- 远程 URL 缓存现在写入项目目录 `metadata/media-remote-url-cache.json`，按本地路径、data-url 稳定 hash、provider input 或 StoredMediaAsset key 关联源图；复用缓存前会 HEAD 检测，遇到 403/405 再用 Range GET 兜底，失效则删除缓存并重传。
- 项目分镜视频链路最终也走 `mapVideoRequestToProviderRequest()`；修复后 image-to-video 的主图+额外参考、start-end 的首尾帧在两边都需要 remote-url 时会合并为一次批量归一化，避免同一请求内靠磁盘缓存兜底去重。
- 分镜引用 bundle 构造器本身已经对角色/场景/道具/锚点源做去重；本轮额外补的是 provider 映射阶段的上传去重，覆盖主图/参考图或首尾帧字段之间重复的情况。
- 用户后续日志显示“缓存未生效”的直接原因是 `ensureRemoteUrlForImageAsset()` 对带 `localPath + remoteUrl` 的资产先检测旧 `asset.remoteUrl`，再查本地 sourceKey 缓存；旧链接每次 HEAD 卡 5 秒后才复用缓存，看起来像每次重新上传。修复后本地路径缓存优先，缓存命中时不再触碰旧 `remoteUrl`；无缓存但资产远程地址可访问时会把该地址写入本地缓存。

## 2026-05-08 Linghui Panorama + Director3D Stabilization

- `docs/linghui-panorama-and-3d-director-workbench-plan.md` 已把近期优先级写清楚：先修全景 projection/prompt/viewer 契约，再做 `linghui/director3d` MVP；当前用户的阻塞点是 director3d 无法进入编辑，因此本轮先处理编辑入口。
- 当前工作树已有未提交 director3d 半成品：`frontend/src/types/linghui.ts` 已包含 `linghui/director3d` 类型，且存在 `frontend/src/components/linghui/director3d/`、`Director3DNodeEditor.tsx`、`Director3DNode.tsx` 和 `_director3d.scss` 未跟踪文件；这些应视为已有工作继续接入，不回滚。
- `git status --short` 同时显示大量全景与图片节点相关修改，说明本轮修复必须保持小范围，避免覆盖全景半成品。
- `linghui/director3d` 无法进入编辑的直接原因是 `useLinghuiCanvasNodeInteractions.openNodeEditor` 的节点类型白名单漏了 `linghui/director3d`；点击节点时 selection 被清空，`Director3DNode` 内部的 `useLinghuiNodeEditorVisibility` 永远为 false。
- 前端持久化快照的 `LINGHUI_RF_TYPE_TO_NODE_TYPE` 也漏了 `linghui-director3d`，Electron 文档 normalize 的 `CURRENT_LINGHUI_TYPES` / `CURRENT_RF_TYPES` 同样漏了 director3d；即使节点能打开，保存/恢复路径也会不稳定。
- 新增 director3d 视口半成品里有硬编码颜色，会被当前样式纪律脚本拦截；本轮将其收敛到 CSS token 解析工具，并把全景 seam 诊断里的 inline color 移到 Sass class。
- DevTools MCP 当前被已有 Chrome profile 占用，无法做真实浏览器点击烟测；本轮补了 hook 级测试，直接覆盖“打开 director3d 节点编辑器会设置 editor selection”的入口行为。
- 用户进一步明确：3D 导演台编辑界面不能挂在节点下方，必须是独立全屏工作台；相机也不能以“虚拟机位”物体标注在场景中，工作台编辑视角本身就是最终相机。
- 因此 director3d 保持由节点 selection 触发，但 `LinghuiNodeEditor` 对 `linghui/director3d` 直接渲染 antd fullscreen Modal；节点卡片不再使用 `hasInlineEditor` 状态。
- `Director3DViewport` 已从“编辑相机 + 虚拟 stage camera marker”改为单一工作台相机：orbit/pan/zoom 后写回 scene camera，导出线稿时 `captureCurrentView` 使用当前视角，而不是另一个虚拟相机参数。
- 右侧属性面板不再暴露 camera position/lookAt 表单；未选中假人时只编辑 FOV、比例和背景，视角预设从左侧“视角” tab 触发。
- 进一步排查确认：假人点击后立刻失活，是 R3F actor pointer down 后仍触发外层 viewport `onClick`，调用 `onCanvasClick` 把 selection 清空；需要在 actor pointer down 后抑制下一次 viewport click。
- 假人拖动不自由的根因是拖动计算用了“本次 pointer move 的 dx/dy + 初始位置”，每帧都会围绕初始点小幅重算；改成“累计 pointer 位移 + 初始位置”后可连续拖动。
- 全屏高度不满的风险点在 AntD Modal 多层结构：只设 `.ant-modal-content` 不够，必须同时覆盖 root / wrap / modal / content / body，并让 director3d editor panel/layout 用 100vh。
- 用户继续反馈 X 方向相反且“不跟手”，说明 delta 映射仍然不够。更稳的拖动模型是把鼠标屏幕坐标通过当前工作台相机反投影成 ray，再与假人脚底所在的水平平面求交；假人位置 = 当前鼠标地面交点 + 点击时的偏移量。这样不依赖 yaw/right/forward 的手写方向映射，鼠标在哪，脚底平面上的目标点就在哪。
- 继续排查当前代码后发现：ray-plane 版本的拖动仍然在 React 外层 div 里用 `cameraStateRef` 重建 `PerspectiveCamera`，而真实视口相机在 `EditorCameraRig.useFrame` 中用 lerp 追目标；快速移动或刚切视角后，重建相机与真实 R3F camera 会不一致，表现就是假人不跟手或方向感错误。拖动应放进 R3F 子组件，直接读 `useThree()` 的 live `camera` 和 `gl.domElement`。
- 新拖动层 `ActorDragLayer` 放在 R3F Canvas 内部：actor pointer down 时记录 actor 位置与鼠标落点偏移，window pointermove 期间用 live camera 对鼠标坐标做 ray-plane 求交，并用本地 `dragPreview` 立即渲染位置，避免等父级 React 状态写回造成拖动延迟。
- 拖动写回策略进一步调整为：pointermove 只更新 `ActorDragLayer` 内部 preview，不再每帧调用 `updateNodeData`；pointerup / cancel / blur 时把最终位置一次性提交到 scene。这能避免全局节点数据频繁变更导致 editor/store/React Flow 重渲染。
- 保存后退出再进，panorama/director3d 不可操作的高概率原因有三类：早期半成品可能把 `linghui/panorama` 保存成 `type: linghui-image`；恢复 RF 节点时只 clone snapshot，没有用当前 `createNewNodeData` 补齐 inputs/outputs/properties；如果退出前节点运行态是 `running`，重新进入后 UI/执行链路会继续认为仍在执行中。
- 后端文档 normalize 现在对“已知语义类型 + 已知 RF 类型但不匹配”的节点采用修复式规范化，直接改成语义类型对应的当前 RF type；仍然拒绝真正未知旧类型。
- 前端 `buildRFNodesFromSnapshot` 现在恢复节点时合并当前默认 data：旧 panorama 会补回 `21:9`、`panoramaTemplate`、`projectionMode` 和连接点；旧 director3d 会补回默认 `scene` 和输入/输出连接点。
- `LinghuiPage` 激活工作区时把恢复出来的 `running` nodeRuns 标为 `stale` 并提示“上次执行已中断，可重新运行”，但保存中的运行态不会被此逻辑打断。
- 重新进入后全景/3D 导演台退化为普通文本节点的直接根因不在前端 restore，而在 Electron SQLite persistence helper：`electron/service/linghui/persistenceHelpers.ts` 的 `rfTypeToLinghuiType()` 仍只认识 text/agent/image/video/audio/script，`linghui-panorama` 和 `linghui-director3d` 从数据库读出时走 default，写成了 `linghui/text`。
- 为避免用户已经在退化状态下二次保存，`nodeRowToSnapshot()` 现在还会根据 stored `properties` 做语义恢复：`scene.version === 1` 恢复为 `linghui/director3d`，`projectionMode` / `panoramaTemplate` 恢复为 `linghui/panorama`，并同步把 RF type 规范化回 `linghui-director3d` / `linghui-panorama`。

## 2026-05-08 Unified Linghui Node Ports

- 需求可接受，但必须从“端口语义”改为“节点语义”：画布只展示一个输入点/输出点；执行层仍保留按 result kind 过滤，节点自行从全部上游中挑选图片、文本、视频、音频、storyboard 等需要的数据。
- 当前多端口来源有三处：节点组件按 `nodeData.inputs/outputs` 渲染多个 `LinghuiNodeHandle`；`isLinghuiConnectionValid()` 按 handle index 做 slot type 校验；`createExecutionNodeView()` 的 `getInputResult(slot)` / `getAllInputResults(slot)` 只读对应 `input-N` 的上游。
- 当前性能已有一层保护：`LinghuiCanvasStage` 在 `nodes.length + edges.length >= 120` 时开启 React Flow culling。统一端口可进一步减少 DOM handle 数量和无意义分叉边，但仍要保留 DAG 边本身用于执行依赖。
- 旧工作区里已经持久化的 `input-1` / `output-1` 边不能直接丢；需要读取/保存时兼容，执行聚合应把所有直接上游边都视为同一个输入集合。
- 实施后端口 UI 已收敛成 `LinghuiNodePorts`：节点能力声明仍保留在 `inputs/outputs`，但 React Flow 物理 handle 只渲染 `input-0` / `output-0`，端口 tooltip 汇总该节点可消费/输出的语义槽位。
- 连接校验现在只看节点级约束，不再用 handle 编号推断 slot 类型；这允许图片接文本、图片接脚本等链路成立，真正是否消费由目标节点执行时的 `dataType` 过滤决定。
- 执行层不能简单把所有上游结果原样返回给每个 slot，否则文本/脚本/视频节点会因为多次调用 `getAllInputResults(1/2/3)` 重复拼接同一段文本；正确模型是先收集全链路上游，再按目标 slot 的 `dataType` 返回子集。
- 编辑器侧也有旧端口依赖：参考视频/音频原来分别筛 `input-3` / `input-2`。统一端口后改为遍历全链路上游节点并按媒体 kind/节点属性收集参考资源，避免保存恢复后编辑器参考区丢失。
- 画布保存和恢复都把 edge handles 规范化到统一端口；旧测试 fixture 中的 `input-1` 等仍保留用于验证执行/提示词引用对历史边兼容，但运行时新建/保存的边不再产生多 slot handle。
- 下游引用数量统计必须和执行过滤一样按媒体 kind 分桶；仅遍历全链路上游不够。`referenceImages/referenceVideos/referenceAudios` 如果直接取 `primary.source`，4 张图片 + 2 个视频会同时被三类列表各计为 6 个。

## 2026-05-08 Full TSC Debt Cleanup

- `frontend npx tsc --noEmit --project tsconfig.json` 当前失败集中在 13 类：Electron timeline 持久化 viewMode union、Canvas context union、GPUCanvasContext 测试 mock、Antd message API 调用参数、InputNumber ref 类型、ES2023 `findLastIndex`、不可能的状态比较、Electron project bridge 类型缺 `setStorageRoot`、测试 spread 参数、TimelineData fixture、AsyncTask fixture cast、storageConfig bridge 类型、视频生成媒体输入 union。
- 处理原则：业务代码用类型保护/接口补齐/安全收窄，不用 `any` 掩盖真实数据结构；测试代码只收紧 mock/fixture 类型，不改变测试目标。
- frontend tsc 已清零后，root `tsconfig.json` 仍会通过 Electron 导入链路触达部分 frontend 文件；根因是 root include 只覆盖 `electron/**/*`，没有加载 `frontend/src/types/electron-window.d.ts` 的 Window declaration merging。最终采用局部 `ElectronBridgeWindow`/window cast 收窄，避免扩大 root tsconfig include 半径。
- `linghuiRecipeTemplates.ts` 的内置模板已经按用户方向隐藏，旧 builder 函数不再被引用；删除未使用构造函数比恢复空列表不可见模板更符合“不需要工作流模板”的现状。
- activation 默认管理渠道当前实际为 5 个：llm / tti / itv(grok) / itvJimeng / tts；测试仍按 4 个断言属于历史债务。
- `mediaTaskBindingService.test.ts` 的 `vi.mock` factory 必须使用 `vi.hoisted` mocks，否则 Vitest hoist 后会在初始化前读取普通顶层 mock 变量。
- 当前验证结果：root `npx tsc --noEmit --project tsconfig.json` 通过；frontend `npx tsc --noEmit --project tsconfig.json` 通过；11 个目标测试文件共 54 个测试通过；frontend build、Electron build、`git diff --check` 通过。

## 2026-05-08 Storyboard Video Prompt Template Cleanup

- 视频提示词出现 `【自检】` 的直接来源是 8 个 `frontend/src/store/templates/videoReasoning/shot_video_*.md` 模板末尾的 `## 输出前自检（全过才提交）` 和 checkbox 列表；模型会把这类段落当成需要交付的内容一起输出。
- `frontend/src/services/shotReference/shotsOutputFormat.ts` 的 grid shots section 也有 `【自检】输出前确认...`，虽然它是结构约束，但措辞会增加泄漏概率；改成 `【结构约束】` 并明确最终答案不要输出检查清单。
- 视频提示词缺台词的根因在 `ShotPromptService.generateVideoPrompt()`：模板变量 `scriptContent` 原来只来自 `getShotScriptText(shot)`，没有把 `shot.dialogue` 作为独立事实输入；如果拆分结果把台词放在 `dialogue` 字段而不是 `scriptLines`，视频模板就看不到台词。
- 修复后视频路径会构造 `videoScriptContent = scriptLines + 【分镜台词字段】 + shot.dialogue`，并把显式台词传给 `buildDialogueGuardNote()`；最终输出边界要求 DIALOGUE 必须进入 `对白提示词`。
- 服务层保留两道兜底：`sanitizeVideoPromptResult()` 删除模型泄漏的 `【自检】` / checkbox 段落，`ensureExplicitDialogueInVideoPrompt()` 在模型漏写显式台词时直接补入或追加到 `对白提示词`。
- 为避免 `shot.dialogue` 同时出现在脚本文案和显式保护里时重复，角色名前缀台词解析现在保留 `角色名：台词`，可与显式台词做精确去重，也更贴合目标输出格式。

## 2026-05-08 Storyboard Image/Video Prompt Visual Alignment

- 用户给的三段目标样例核心不是单纯换字段名，而是要求提示词具备可执行画面层次：主空间 + 背景/远景 + 前景/近景、特写对象、角色可见状态、道具位置、动作节奏、光影变化和上下文呼应。
- 原 `shot_image_prompt_generation` 仍是旧“一段静态图提示词”结构，缺少 `对白视觉提示词`、`呼应提示词` 和视频结构参考；这会导致生图锚点和视频动作/对白不对应。
- 生图推理现在接入 `shot.dialogue`，但只把它用于口型、表情、字幕/系统气泡判断；普通对白明确禁止画成文字，避免 TTI 把台词直接渲成乱字。
- 首帧延展视频模板之前输出 `道具提示词`，但输入资产基准库没有 `{{props}}` 且模板变量也未声明 `props`；本轮补齐后首帧图/视频都能看到道具上下文。
- 多参视频模板和首帧视频模板统一字段：`画面描述` 取代旧 `场景描述`，`多机位运镜` 取代旧泛化 `运镜`，新增 `呼应提示词`，强化前中后景、特写对象、系统气泡和物理反馈。
- 九宫格/四宫格推理和 TTI 直拼模板也同步增强：每格必须是连续动作锚点，保持同一空间/服装/光影，并写清画面层次、手部姿态和光影方向。

## 2026-05-08 First-Person Narration To Scene Dialogue

- 用户纠正了关键语义：`她自称天道，说要帮我夺回气运` 不能作为旁白输出，也不能逐字变成 `小白 对 我 台词：她自称...`；它是第一人称叙述素材，需要被改写成真实剧情和正确人称对白，例如 `小白：我是天道，我可以帮你夺回气运`。
- 旧服务兜底 `ensureExplicitDialogueInVideoPrompt()` 会把 `shot.dialogue` 逐字补进 `对白提示词`，这对真正对白有效，但对第一人称转述会放大错误；现在它只补显式直接对白。
- `buildDialogueGuardNote()` 现在把台词证据分为 `DIALOGUE`、`NARRATIVE_TO_SCENE`、`VOICEOVER`、`COMMENTARY`。第一人称转述不会进 spoken，也不会把来源叙述句或“改写说明”暴露给模型最终输出，只给已经转写后的本源剧情对白/动作素材。
- 新增启发式转写：当角色列表有 `我` 和另一个角色时，第一人称转述会转成对方当场开口的真实对白，例如让“小白”以自己的身份说出“我是天道，我可以帮你夺回气运”，用于压住模型照抄叙述句。
- 8 个视频模板都新增 `NARRATIVE_TO_SCENE` 规则，并把原“台词逐字一致”改成“显式直接对白保留语义；第一人称叙述/转述必须先改写成人称正确的剧情对白”；模板中不再写具体坏句示例，避免提示污染。
- `镜头1-镜头4` 出现两遍的根因是多参模板把 `{{shotsSection}}` 放在“镜头结构约束”中，虽然标了“不要原样输出”，模型仍可能把它复制为 `精确时长` 后的第二套逐镜头 Markdown 段。
- 本轮把多参模板的 `shotsSection` 明确标成“内部参考，严禁原样输出”，要求镜头1/2/3/4动作只合并到 `角色动作提示词` 字段；用户明确指出不能按 `精确时长` 截断以免误删有效内容，因此去重依靠提示词约束，不做尾部截断。
- 视频结果清洗还会移除开头的 `镜头1-镜头4 ` 前缀，以及 `对白提示词` 中的来源叙述片段；如果有可识别叙述转写，`ensureExplicitDialogueInVideoPrompt()` 会补回改写后的真实对白，而不是原句。

## 2026-05-08 Anchor Mention Highlight + No Fake Grid Anchor

- `@grid_anchor` / `@shot_anchor` 不是角色/场景/道具资产，而是只有真实分镜生成图存在时才有效的内置锚点。编辑器高亮需要认识它们，但资产同步和 selectedAssets 编译必须跳过它们。
- `frontend/src/editor/mentionTypes.ts` 原先只解析 `@char_` / `@scene_` / `@prop_`，所以 `@grid_anchor` 在 ScriptEditor 里不会变成 mention chip；本轮新增 anchor mention 类型和内置 item resolver 后，不需要把锚点塞进项目资产列表也能高亮。
- `mentionTooltip.ts` 不能继续手读 `MENTION_REGEX` 的固定分组；新增 anchor 备选分支后 `match[1]` / `match[2]` 对锚点为空，必须统一走 `parseMentions()`。
- `ShotPromptService` 之前从 `shot.imageMode` 派生 `explicitCellCount` 并传给 `decideShotsMode()`，导致没有真实生成图时也会输出 4/9 宫格 shotsSection；这会诱导模型使用不存在的 `@grid_anchor` / cell 对应关系。
- 正确规则是：`grid-4` / `grid-9` 只在 `referenceBundle.hasGridAnchor=true` 时启用；没有 `shot.media.images[currentImageIndex]` 的真实锚定图时，提示词走 normal shotsSection 和文生/多参考资产模式。
- `buildSpatialAnchorDirective()` 不能把 `shot.imagePrompt` 文本当作“视频模型会直接读图”的证据；真实图像锚定应以 `referenceBundle.hasShotImage` 为准。否则只生成了图片提示词、但尚未生图时，也会错误进入有图约束。
- `generateAndSaveShotPrompt()` 不再为了生成视频提示词而偷偷预生成并保存 grid imagePrompt。grid imagePrompt 只在本次确实要生成/优化图片提示词时更新，视频提示词不再靠假首帧文本触发锚定分支。
- `renderShotReferenceTable()` 现在在空 bundle 或仅资产参考时明确写“不要使用 `@shot_anchor` / `@grid_anchor`”；8 个视频推理模板和生图模板也新增锚点存在性判断，约束模型不要输出不存在的锚点 token。
- 锚点 tooltip 无图的根因是 `ScriptEditor` resolver 先返回静态 built-in mention item，导致 `ShotCard` 即使能提供当前分镜图片，也会被无 `previewImage` 的内置说明覆盖。应优先查调用方传入的 mentionItems，再 fallback 到 built-in。
- `ShotCard` 能为当前分镜的有效锚定图构造局部 mention item：grid 模式提供 `@grid_anchor` 预览，普通模式提供 `@shot_anchor` 预览；带 `metadata.gridCell` 的拆分子图不应作为锚点预览，保持和 `buildShotReferenceBundle` 一致。

## 2026-05-08 Prompt Compilation Fallback + Anchor Preview

- 当前 `compileShotPromptToBundle()` 只按 `bundle.items` 替换 token；而 `buildShotReferenceBundle()` 只会把有 `media.previewImage` 的道具放入 items。道具存在但无图时，`@prop_*` 会被记录到 `unmappedTokens`，但仍原样进入最终提示词。
- TTI/ITV 的 `compileGrokTTI()` / `compileGrokITV()` 也只用 `source` 存在的 selectedAssets 建立映射；有资产名但没有可用图片的道具会被视作 unmapped，当前同样保留 raw token。
- 用户给的失败提示词里 `@prop_... 红烧肉` 属于“资产存在、可读名称已在提示词中、但缺视觉引用”的情况。正确降级是移除机器 token，保留已有中文名；如果 token 单独出现，则用资产名替代。
- `@grid_anchor` tooltip 当前在 `ShotCard` 中仍排除了 `metadata.gridCell` 拆分子图。用户最新要求是悬浮图必须跟随“当前选中的图”，所以 UI tooltip 应使用 selected image；bundle 编译是否接受 split child 是另一层约束，不能影响悬浮预览。
- 道具明明高亮但最终没有编译成 `@Image N` 的实际根因之一是 token 生成不一致：提示词输出端使用 `createMentionString()`，真实 ID 如 `prop_177..._1` 会输出 `@prop_177..._1`；但 bundle builder 旧代码直接拼 `@prop_${prop.id}`，会生成 `@prop_prop_177..._1`，导致 compile 查不到同一个 token。
- 分镜视频旧的 `selectedAssetsForCompilation` 路径会在 Seedance 合并参考图时按角色/场景/道具旧顺序插队，可能打乱 `bundle.items` 的 @Image 顺序；分镜请求应只以 `ShotReferenceBundle.items` 为唯一索引事实来源。
- 分镜生图也不应再走 `MediaGenerationService.generateImage()` 里的旧 selectedAssets 编译。正确模型是 workflow 层先用 `compileShotPromptToBundle()` 编译一次，并把同一份 `compiledPrompt` / `references` 交给 provider，避免二次编译和 `@图片N` / `@Image N` 两套协议并存。
- `@grid_anchor` 在 bundle 中就是锚点图项，通常占 `@Image 1`；所谓“主图”只应来自该 bundle 顺序，不应再由旧 compiler 自动 prepend `@Image 1` 到正文开头。

## 2026-05-08 Tweet Narration Dialogue Mode

- 项目已有 `Project.mode?: 'drama' | 'narration'`，但 `CreationContext` 之前没有暴露给分镜和提示词服务，导致推文化第一人称解说在所有模式下都被同一套对白规则处理。
- 剧情模式的目标是“无解说也能看懂”：第一人称推文解说中的认知、决定、质问、反应、转述可以被改写成少量主角独白或角色对白，但必须短、当场可说、人称正确，不能把来源叙述句照搬进 `对白提示词`。
- 解说模式的目标不同：剧情主要由旁白/字幕承载，视频提示词不应主动把第一人称解说大规模对白化；只保留显式直接对白，或极少量确实需要口型同步的短反应。
- 分镜拆解模板需要同时保持“行号覆盖不改写 scriptLines”和“dialogue 可按模式生成”的边界：`scriptLineIndices` 仍只负责连续覆盖原字幕行，`dialogue` 字段才承载剧情模式下的少量对白补足。
- 生图、宫格生图和视频提示词必须共用同一 `dialogueModeDirective`，否则图片锚点可能按解说画面生成，而视频又按剧情对白推进，造成口型、表情和动作不一致。
- 服务兜底已按模式分支：`ensureExplicitDialogueInVideoPrompt()` 只在剧情模式把第一人称转述补成真实对白；解说模式不会把 `她自称.../我意识到...` 这类推文解说强塞进对白。

## 2026-05-08 Storyboard Video ITV Upload Protocol

- 分镜视频生成调用语音生成的根因在 `shotRenderWorkflow`：视频版本保存后如果 `normalizedShot.dialogue` 存在，会直接调用 `mediaGenerationService.generateAudio()`。这属于跨媒体副作用，已移除；分镜视频现在只负责 ITV 视频生成。
- Koma 官方 Grok provider 本身声明的是 URL-only 图片传输，应该触发 `ensureRemoteUrlForImageSource()` 和 qiniu/image-hosting 插件上传。之前 `openai-video` 等 provider 允许 `data-url` fallback，导致上传失败也可能继续把 data-url 或不完整图片数组发给上游。
- 新策略是：需要 remote-url 的 provider 默认不允许 required upload fallback。图床/qiniu 插件不可用时，本地会提前以上传失败结束，不再等上游返回 `Reference placeholders require uploaded images` 这类低信号错误。
- 自定义 `openai-video` 报错的另一层根因是 image-to-video 请求只把主图写入 `body.image`，附加参考写入 `body.images`；但 prompt 里的 `@Image 1` / `@Image 2` 占位符要求 `images` 数组本身包含完整上传图序列。现在 prompt 使用图片占位符时，`images` 会按 `[primary, ...additional]` 传入。
- 保留 `body.image = primary` 是为了兼容标准 image-to-video 起始帧字段；额外补 `body.images` 是为了让 OpenAI-compatible 网关能把 `@Image N` 对齐到实际上传图片。
- 用户最新日志说明 `MediaRemoteUrl` 已经进入 required 归一化，问题不再是“完全没上传”，而是 Grok `/v1/videos` URL-array 网关把 `@Image N` 识别成 multipart 上传图占位符；只有 URL 数组时就返回 `Reference placeholders require uploaded images`。
- 因此 Koma 官方 Grok 的 wire protocol 需要和内部协议分层：内部编译、编辑器和 bundle 仍统一使用 `@Image N`；最终发给 `/v1/videos` 的 JSON body.prompt 转成自然语言索引 `图片N`，body.images 继续按同一顺序传远程 URL。
- `metadata.function_mode` 对 Grok 视频也有必要：图生视频明确 `first_frame`，参考生视频明确 `omni_reference`，避免网关按纯文本或错误模式转发。
- 旧默认参考图上限 4 会让 `@grid_anchor + scene + 两个角色 + 两个道具` 这种正常分镜只传 4 张，造成日志里的 `unmappedTokens` 和道具降级；Grok provider 实际 cap 是 7，默认上限已同步到 7。
- 分镜视频执行时不能信任历史已保存的 `shot.videoPrompt` 一定干净。运行前需要再做非破坏性清洗和台词兜底，避免已持久化的来源叙述泄漏继续进入 provider。
- 验证覆盖了 Grok request images 数组、Grok URL-array prompt 转 `图片N`、OpenAI placeholder images 数组、URL-only 上传失败提前失败、Grok 参考图上限 7、分镜视频不触发 `generateAudio`；root/frontend tsc、frontend build、Electron build、diff check 均通过。

## 2026-05-06 Linghui Tapnow-Base Capability Audit

- 当前 Koma 工作树已有未提交灵绘改动，不能回滚：`linghui/panorama` 新编辑器/目录已出现，并且类型、节点定义、执行计划、共享执行、画布交互、图片节点和持久化文档都有修改。
- 参考项目 `/Users/sunmeng/workspace/tapnow-base` 是浏览器端轻量节点画布，文件结构集中：`App.tsx` + `components/Canvas.tsx` + `components/Nodes/*` + `services/mode/*`。
- tapnow-base 的基础节点能力包括：原始媒体节点、文生图、图生图、文生视频、图生视频、首尾帧视频、创意描述节点，以及本地媒体栈、节点历史产物、导入/导出工作流和缓存设置。
- Koma 灵绘已经具备更完整的工作区/资产/历史/模板/执行图基础设施，所以本轮不宜照搬 tapnow-base 的单页存储结构；更适合抽取其“基础节点能力覆盖面”和“图像/视频参数模型”的缺口。
- Koma 视频底层已经支持 `video.text-to-video`、`video.image-to-video`、`video.reference-to-video`、`video.start-end-to-video`；与 tapnow-base 差距不在执行层，而在“用户能否一键发现并创建图生视频/首尾帧视频基础骨架”。
- `linghui/panorama` 当前已接入类型、节点库、编辑器、执行器、渲染和持久化白名单，但静态解析路径仍只认 `linghui/image`；导入全景图或作为依赖被单输入读取时会丢失图片节点家族行为，需要同步修正。
- 新增 `PanoramaViewer` 使用了普通 inline style，当前 `frontend/scripts/check-style-discipline.ts` 会拦截；需要移入 Linghui Sass partial，以免主题纪律回退。
- 实施后确认：tapnow-base 的文生图、图生图、文生视频、图生视频、首尾帧视频与环境/创意描述入口，在 Koma 中更适合沉淀为 Recipe 模板，而不是新增一批重复节点类型。
- `linghui/panorama` 作为独立节点类型保留产品语义，但执行、静态导入、提示词引用和下游视频消费都必须按图片家族处理；这次已覆盖 `getInputResult`、`getAllInputResults`、静态 node result、fallback reference、result reference 主图选择。
- 全景预览样式已从普通 inline style 收回 Sass；`npm run check:style-discipline` 仍失败，但失败项均在既有 project/storyboard/chat/theme/index.scss 路径，新 Linghui panorama/Recipe 路径局部检查为 0 命中。
- 验证结果：5 个目标 Vitest 文件共 21 个测试通过，`npm run build` 通过，`git diff --check` 通过；构建只保留既有 Vite dynamic import/chunk size warnings。

## 2026-05-06 Linghui Canvas Interaction Audit

- 用户明确反馈“不需要工作流模板”，说明把基础能力映射成 Recipe 是错位方案；本轮已暂时隐藏内置系统 Recipe，后续应把能力入口放在节点创建、连线辅助、上下文操作和执行体验里。
- 当前灵绘画布的基础操作比节点能力更影响可用性：锚点命中区小、运行入口分散、失败原因不易回看、执行流连线反馈偏弱。
- HUD 是最适合放一键执行完整流程的位置：它常驻、接近执行状态摘要，并且已有失败/待重跑操作；把“运行全部 / 运行选中”放到这里比藏在右键菜单里更符合高频操作。
- 连接失败不应该只 toast，一旦用户连续试错会丢上下文；写入 executionLogs 后，错误连线规则可以被回看，也能作为后续优化连接规则的证据。
- 连线状态本身已经有 `edgeStatuses`，不需要重做执行图；第一批只需强化视觉：扩大 interactionWidth、增加 glow path、运行 dash animation 和连接预览动画。
- 本轮新增的 `LinghuiEdge` 样式变量必须走 `cssVars(...)`；直接 `style={edgeStyle}` 会被主题纪律脚本拦截。修正后 `check:style-discipline` 不再命中新改的画布文件。
- 只写日志仍然不够：用户真正需要的是“错误发生时画布自己带我到出错节点”。因此失败后自动聚焦首个失败节点，并让日志项可点击定位相关节点，比单纯增加日志条目更有用。
- 节点卡片上的失败原因必须做成共用组件，否则图片/视频这类媒体节点和文本/脚本这类信息节点会再次分裂；`LinghuiNodeRunError` 作为低成本共享层可以覆盖当前所有节点族。
- React Flow 当前版本支持 `connectionRadius`，默认 store 值是 20；灵绘应显式提高到更大的半径来实现“不完全接触即可连接”。样式层还要让所有端口共享同一类名和磁吸圈，否则输入/输出点仍会给用户两套手感。
- 磁吸实现不需要手写全局 pointer 距离检测：React Flow 在拖线进入 `connectionRadius` 后会把最近可连接端口标记为 `connectingto` / `valid`，灵绘只要显式提高 `connectionRadius` 并把这些状态映射为连接点吸附动画即可。
- 所有节点端口已经收敛到 `LinghuiNodeHandle` 和 `.linghuiNodeMagnetHandle`；旧的 `.linghuiCompactHandle` / `.linghuiRFHandle` 保留为 Sass 兼容别名，但不再维护独立尺寸/边框规则，避免输入点、输出点手感分裂。
- 灵绘视频节点漏接了项目已有的 `VideoDurationSpec`：聊天/分镜已经按当前 ITV selection 处理 enum/range，灵绘仍固定展示 5/10/15/30 slider 并把 `props.duration` 原样传执行。
- `durationSpec.ts` 中 Koma 官方即梦已能按 `seedance-2.0` / `seedance-2.0-fast` modelId 解析 4-15 / 4-12 秒范围；Grok provider 的注释写上游枚举是 6/12/16/20，但旧兜底仍包含历史 10 秒，需要避免灵绘 UI 和执行继续暴露 10。
- 画布 HUD 自动展示执行日志会带来两个问题：用户不知道如何关闭，并且日志会和一键执行/状态控件抢画布空间。更合理的模型是把日志作为左侧菜单里的可选面板，默认不打扰画布操作。
- 左侧浮层需要互斥：项目列表、资源/工作流/历史抽屉、执行日志同时打开会叠层遮挡画布；打开其中一个时应主动收起其它浮层。
- `LinghuiPropertiesPanel` 里仍有一个未挂载的旧执行日志展示组件；当前实际画布入口已经不使用它，本轮不删除未挂载组件以避免扩大影响面。
- 同一页面内的重复执行已有 `executionAbortControllerRef` 拦截，但页面刷新/状态恢复后，单个节点的 `running` 状态不包含可恢复的远端 taskId；如果用户再次触发执行，旧实现会覆盖 running state 并再次调用 provider `start()`。
- 防重复提交最稳的第一层应放在工作流执行目标计算后：只要本次目标链路所需节点里存在仍在默认轮询窗口内更新过的 `running` 节点，就阻止新提交并聚焦该节点。这样视频、生图、音频、文本等节点统一受保护。
- 旧 running 状态不能永久挡住用户：默认轮询窗口是 10 分钟，本轮加 1 分钟宽限；超过这个窗口的运行态被视为过期，可重新执行。
- 仅依赖 `nodeRun` / executionQueue 的运行态禁用仍有点击竞态：连续双击可能在 React 状态刷新前连续触发 `onRun`。节点编辑器提交按钮需要首击即时锁，和执行链路级 duplicate guard 形成两层保护。
- 生图/生视频是最高风险入口，但文本、音频、Agent、脚本生成和脚本派生出的分镜图/视频流程也会提交任务或批量创建后续节点，应该共享同一套短冷却锁，而不是各自写 ad hoc 防抖。
- Electron 官方提供 `app.setAppLogsPath()` / `app.getPath('logs')` 和 `webContents` 的 `console-message` 事件；比纯 renderer 劫持 `console` 更适合做桌面应用日志收集的底层入口。
- 当前前端已有 `frontend/src/store/logger.ts`，但旧实现通过通用 fs IPC 读取完整日志文件再重写追加，既低效也扩大了 renderer 文件写权限；应改为主进程专用 diagnostics IPC。
- 日志目录必须跟随用户可设置的 `storageRoot`，不能固定 Electron `userData`。本轮把 `diagnosticsService` 初始化到 `${storageRoot}/logs`，并在 `project.setStorageRoot` 时同步 `app.setAppLogsPath`。
- IPC 安全边界采用显式白名单：renderer 只能调用 `controller/diagnostics/appendRendererLog`、`listLogs`、`clearRendererLogs`、`exportLogs`，不能指定任意写入路径或任意打包目录。
- 导出 zip 由主进程扫描固定日志根生成，包含 `manifest.json`、renderer/console/main/Electron 日志；单文件大小和递归深度都受限，避免把用户目录任意内容打进诊断包。
- 本次“打开两个空节点画布后新建报错”的根因是空壳 React Flow 节点进入了 `graphData.nodes`：这些节点没有 `type` / `data.linghuiType`，后端 `normalizeLinghuiWorkspaceDocument` 严格校验后抛错，而 ee-core controller 异常会被吞成 `undefined`，前端因此只能看到“未返回工作区文档”。
- 修复需要三层同时做：画布快照只持久化可识别灵绘节点并过滤悬空边；后端 normalize 对空壳节点做兼容丢弃、继续拒绝真正不支持的旧节点类型；`LinghuiController` 与 `linghuiStorage` 把结构化错误返回/空返回转成可读异常。
- 灵绘项目导出不能只写 JSON：真实画布引用会散落在节点属性、运行结果、资产库、历史记录和模板快照里，因此导出包采用 `koma-archive://` 中间引用统一收集资源，导入时再重写到新的工作区目录。
- 导入灵绘工作区必须重分配节点/边/分组以及模板、资产、历史记录 id；否则 SQLite 主键和画布节点 id 都可能与本机已有工作区冲突。

## 2026-05-03 Theme System Architecture

- 当前 worktree 为 `/Users/sunmeng/workspace/Koma-theme-worktree`，分支 `codex/theme-system-architecture`，从主目录 `feat/panel-restore2` 的 `5a5ac03` 创建；主目录有未提交改动，本轮不触碰。
- 现有主题入口很窄：`frontend/src/theme/tokens.ts` 被 `antdTheme.ts` 使用，`frontend/src/index.tsx` 从 `./theme` 取 `antdTheme` 挂到 `<ConfigProvider>`；业务代码基本没有直接 import UI theme tokens。
- `frontend/src/index.css` 原本同时持有 Tailwind v4 `@theme` 真实 hex、`:root` 兼容变量别名、全局 Antd 覆盖和 Settings 页面样式；本轮已迁移为 `frontend/src/index.scss`，`@theme` 只转发 `var(--token-*)`，并保留 `:root` 默认 token 快照作为首屏兜底。
- 设置存储实际在 `frontend/src/store/settings/core.ts`：非 Electron 用 `localStorage[STORAGE_KEYS.SETTINGS]`，Electron 用 `settings.json`，渠道配置另由 SQLite 覆盖。UI 主题字段适合放入 `AppSettings` 并通过 `loadSettings/saveSettings` 持久化。
- 项目已有 `ThemeSelector` / `themePresets`，语义是“图片/视频生成视觉风格”，不是 UI 外观主题；新增 UI 主题命名必须避开 `ThemePreset`，建议使用 `uiThemeId` 或清晰文案“界面主题”。
- `globalStore.ts` 只是 `store/settings` 的 re-export，新增持久化 helpers 应该优先放到 `store/settings/core.ts` 或独立 runtime persistence，`globalStore` 只透传。
- `SettingsPage.tsx` 目前有明显 inline style 与 hex 遗留，本轮只在新增/必要触点用 token 变量，避免扩大到 Phase 5。
- 源代码内项目自有 `*.css` / `*.module.css` 已清零；TS/TSX 中 `.css` import 仅剩第三方库样式：`ds-markdown/style.css`、`xgplayer/dist/index.min.css`、`@xyflow/react/dist/style.css`。
- CSS→SCSS 迁移不能只看扩展名：这次额外修掉了迁移后 `.module.scss` 中残留的 CSS-in-JS camelCase 属性，并把 asset/chat/storyboard/index 新迁移样式里的颜色消费收敛到 `var(--token-*)` / `color-mix(...)`。
- 文档的全量主题纪律目标尚未完成：Linghui 既有 SCSS 仍有 `$lh-*` 硬编码色值，业务 TS/TSX 中仍存在大量 inline style、Tailwind arbitrary hex 和硬编码颜色；这属于 Phase 5/9 之后的工作。
- `light-business` 已能通过同一套主题 registry、Settings UI、settings 持久化、CSS vars 和 Antd `defaultAlgorithm` 生效；`darkTheme={true}` / `colorMode="dark"` 这类显式暗色运行时 flag 已在 Linghui Canvas、Storyboard、ShotCard、ScriptWorkbench、ScriptImportDialog 的关键调用点改成读取当前 theme mode。
- 仅新增 `light-business` 不等于完成文档 Phase 7 全部验收：项目/分镜/灵绘页面仍有大量 `bg-zinc-*` / `text-zinc-*` / inline rgba/hex，light 模式下局部区域仍可能保留暗色视觉，需要后续 Phase 5 与 Linghui token 化继续清理。

## 2026-04-04 Linghui 编辑器样式整治

- `LinghuiNodeEditor.tsx` 负责顶部浮层和主体浮层，视觉基线由 `LinghuiPage.css` 中的 `.linghuiNodeEditor*` 与 `.linghuiEditor*` 控制。
- 目前编辑器“厚重感”主要来自多层 `border`、不同深浅背景和多段 header/toolbar 分割线叠加。
- `ImageNodeEditor.tsx` 的导入模式即使没有图片，也会渲染内部工具栏，和用户期望不符。
- 文生图使用 `LinghuiPromptEditor` 的 `fusion` 表面样式，但外层 `.linghuiEditorPrompt` 与面板头部的节奏仍然导致提示词区显得贴顶、块感重。
- 文本、脚本、Agent、音频、视频等编辑器结构不一致，有的先 header 再内容，有的直接 dropzone/field，导致共用样式很难自然收敛，需要先统一共享容器节奏。

## 2026-04-04 实施后补充

- 统一视觉收敛最有效的入口是 `LinghuiPage.css` 里的 `.linghuiNodeEditor*`、`.linghuiEditor*`、表单输入和 Ant Design 控件覆盖层；改共享层比逐组件单修收益更高。
- 图片节点空态现在会把顶部工具收成“仅名称 + 关闭”，避免无图时出现扩图、打光、重绘等不可用操作。
- `ImageNodeEditor.tsx` 的导入模式改成了更轻的空态/预览态面板，并去掉了不必要的执行按钮。
- 所有提示词编辑器已统一切到 `fusion` 表面样式，`LinghuiPromptEditor.tsx` 本身也改成无硬边框的内嵌式表现。
- DevTools 页面快照确认：当前灵绘画布里的空图片节点会显示极简顶栏，编辑主面板仍正常挂载在节点下方。

## 2026-04-04 视频弹窗极简化补充

- 视频节点顶部处理工具是否显示，不能只看“是不是透传节点”，还需要看“当前是否真的已有视频产物”；否则空视频态会暴露一排无法产生即时反馈的处理按钮。
- 视频编辑一级界面收敛最有效的方式不是继续堆 section，而是改成“能力摘要 + 提示词 + 模型摘要 + 参数摘要 + 动作按钮”。
- 二级参数弹层比一级面板里的多组 Select 更适合视频参数：比例和分辨率适合平铺按钮，时长适合 `Slider`，一级界面只回显摘要即可。
- 视频下载能力可以直接复用图片节点的保存策略，但要额外覆盖本地文件、远程 URL、`data:`、`blob:` 四类视频源。
- DevTools 实测确认：当前无视频输出的节点顶部已不再显示“高清 / 解析 / 合成”工具；一级弹窗只保留模型摘要、参数摘要和生成按钮，二级弹层会展示比例/分辨率/时长选择。
- 这类编辑器弹层如果挂在节点容器内部，很容易被 `transform` / `overflow` / 缩放后的编辑壳层裁切；视频参数弹层改挂到 `document.body` 后，层级和可见范围都会稳定很多。

## 2026-04-04 其他节点跟随视频模板补充

- 图片节点已经很适合做极简模板的第一批受益者：只保留提示词、模型摘要、参数摘要和生成动作后，一级编辑器的密度明显更接近视频节点。
- 文本、Agent、脚本三类“以文本输入为主”的节点，最适合共享 `Dropdown + Popover + ActionRow` 这组结构；比保留整段表单标题、提示文案和底部工具栏更轻。
- 脚本节点如果在空态时继续展示视图切换工具条和 Ant Design `Empty` 插图，会明显比视频节点更重；改成仅在有镜头结果时展示视图切换，并把空态改成一行轻提示，更符合极简方向。
- 音频节点编辑区里保留“最近生成结果”的整块播放器预览，会和“节点本身承担结果消费”这条原则冲突；改成摘要回显 + 写回/保存动作，更符合当前画布极简策略。
- 通用编辑器样式扩展时，最容易出问题的是 `LinghuiPage.css` 这类长文件中的分组选择器；这次新增 `.linghuiEditor*` 别名时就踩到了未闭合样式块，后续继续演化时需要优先做构建验证。

## 2026-04-04 Sass 模块化补充

- `LinghuiPage.css` 已经达到 5000+ 行，继续在一个文件里维护会让“节点编辑器 / 画布壳层 / React Flow / 媒体面板”这些本来独立的样式层互相污染，改动时也很难判断影响面。
- 对 Linghui 这种单页面但高密度样式系统，`sass partial + 单入口聚合` 比单纯继续拆成多个 `.css` 文件更稳：既能按模块拆文件，又不会把样式加载关系分散到多个组件里。
- 这次按功能拆分后，最清晰的边界是：
  - 页面骨架与执行计划弹窗
  - 侧栏 / 资源库 / 资产抽屉
  - 画布外壳 / HUD / 快捷创建 / 右键菜单
  - React Flow 基础节点与预览
  - 紧凑节点样式
  - 节点编辑器壳层、通用面板、控件层、表单/脚本层
  - 多角度弹窗、媒体面板与响应式补丁
- `LinghuiCanvas.tsx` 反向依赖页面样式文件会让目录边界变模糊；由 `LinghuiPage.tsx` 统一引入页面级样式入口更合理。

## 2026-04-04 Sass 第二层收敛补充

- 仅把 `.css` 改名成 `.scss` 价值有限；如果没有 `tokens`、`mixins` 和命名空间嵌套，后续维护时仍然是在写“分文件的传统 CSS”。
- Linghui 这类大体量样式最适合按前缀命名空间嵌套：
  - `.linghuiToolbar { &Left / &Right / &Meta }`
  - `.linghuiExecutionPlan { &Modal / &Body / &WaveCard }`
  - `.linghuiNodeEditor { &TopBar / &ToolButton / &DropdownMenu }`
  - `.linghuiEditor { &Panel / &ToolChip / &SummaryPill }`
  - `.linghuiScript { &Panel / &Shot / &Table }`
- 第二层收敛里最值得抽的不是“大而全主题系统”，而是高频视觉原语：
  - 文本层级
  - 玻璃面板
  - 软卡片
  - chip / pill
  - 按钮化 chip
  - 输入壳层
  - focus ring
- 这次收敛后，页面骨架、侧栏/资源库、节点编辑器壳层、节点编辑器面板、控件、表单脚本层都已经开始共享同一组 Sass 原语，后面继续清理 `canvas-overlays`、`compact-nodes`、`media-panels` 会更顺。

## 2026-04-04 Sass 第二层收敛收尾补充

- `media-panels` 适合按“多角度弹窗 / 引用区 / 图片 tile / 音频上传 / 沉浸弹窗 / 响应式补丁”分块；这样媒体面板的行为和视觉层次会比原来的长串平铺选择器更清晰。
- `compact-nodes` 的难点不是样式量本身，而是状态很多：折叠、沉浸、展开、多图、播放中、主图、网格选择。把这些规则统一收回 `.linghuiCompact` 根命名空间后，状态样式和基础样式终于在同一处可读。
- `canvas-overlays` 原本把左侧 rail、项目面板、状态 dock、工具条、快速创建、右键菜单、浮动面板交错写在一起；改成 `.linghuiCanvas`、`.linghuiPendingGroup`、`.linghuiQuickCreate`、`.linghuiContextMenu`、`.linghuiFloatingPanel` 之后，浮层层级和职责边界明显更稳定。
- `canvas-reactflow` 最适合按“Flow 基础层 / RFNode / CanvasGroup / 预览层 / 节点 widget / 镜头 / 日志 / 状态栏”拆语义前缀；比继续沿着视觉结果平铺选择器更利于后续维护和定位。
- 这轮收尾后，Linghui 页面样式已经不再存在“少数 partial 是嵌套 Sass，剩余几个还是传统 CSS”的断层，第二层 Sass 收敛已经覆盖页面样式入口下的全部核心 partial。

## 2026-05-03 Theme System Completion Findings

- The strict discipline target is now mechanically enforceable: `frontend/scripts/check-style-discipline.ts` checks ordinary CSS files, project CSS imports, inline `style={{...}}`, inline `style={expr}`, Tailwind arbitrary hex, dark-only flags, business imports from `theme/tokens`, SCSS color literals, and business hardcoded colors with a zero budget.
- `style={expr}` was the main hidden gap after the first cleanup. The final rule allows only `cssVars(...)` bridges, identifiers/functions proven to return `cssVars(...)`, and one documented React Flow `BaseEdge` forwarding exception in `LinghuiEdge.tsx`.
- Adding a new theme is now a theme-author-layer operation: add a default-exported `Theme` file under `frontend/src/theme/themes/`. `themes/index.ts` discovers it with Vite `import.meta.glob`; Settings options derive from discovered theme metadata.
- `light-business` uses the same runtime chain as other themes: ThemeProvider writes `--token-*` variables to `:root`, Antd config uses `defaultAlgorithm`, Settings persists `uiThemeId`, and dark-only flags are checked by script/lint.
- Source-owned `.css` / `.module.css` files in `frontend/src` are now zero. The only CSS imports in TS/TSX are third-party styles explicitly allowlisted by the discipline script.
- `npm run lint:theme` is intentionally theme-focused and does not try to clear the repository's broader historical ESLint unused-import/unused-vars debt. Full `eslint src` still has unrelated legacy issues, but theme CI runs the dedicated discipline config plus the stricter custom script.
- Browser smoke found and helped fix one runtime regression in `ScriptEditor.tsx` where `rootClassName` was accidentally left outside component scope. After the fix, the app mounted and root theme dataset/CSS variables were present.
- Remaining color literals are outside business UI: theme author files, the `index.scss` first-paint token snapshot, immutable `AppLogo` artwork, and media/export defaults in rendering/export engines. These are documented in `docs/INLINE_STYLE_EXCEPTIONS.md` and allowlisted by exact path.

## 2026-05-10 Storyboard Anchor Findings

- `ImageCardGrid` 切换图片版本会调用 `onImagesChange(shot.id, images, idx)`，`Storyboard.handleImagesChange` 会把 `media.currentImageIndex` 写回 shot，因此选中版本具备持久化入口。
- `buildShotReferenceBundle` 的 `pushPreviousStoryboardAnchor` 已经从上一故事板的 `previous.media.currentImageIndex ?? 0` 取图，生成链路理论上会跟随上一故事板当前选中版本。
- 当前缺口在 UI 层：`ShotCard.promptMentionItems` 只注入当前分镜锚定图，没有注入 `@previous_storyboard_anchor` 的真实 `previewImage`，所以悬浮提示会退回内置文案而没有上一分镜选中图片。
- UI 可用性应该和生成链路一致：只有当前分镜是 `storyboard` 且 `inheritPreviousStoryboard !== false` 时，才应给 `@previous_storyboard_anchor` 注入上一故事板预览。

## 2026-05-10 Shot Video Version Playback Findings

- `ShotCard` 的缩略格选择会调用 `onVideosChange(shot.id, videos, idx)`，`Storyboard.handleVideosChange` 会把 `media.currentVideoIndex` 写回，所以版本选择入口存在。
- 播放弹窗使用 `StagePlayer`，但播放器组件内部有 xgplayer/native video 两条路径；在切换版本后需要让播放器节点带源 key，避免浏览器或播放器实例继续复用旧媒体状态。
- 视频生成的异步任务路径需要显式透传 `destPath`。`shot-version` 视频应固定落到 `shots/<shotId>/versions/<versionId>/video.mp4`，否则主进程轮询恢复后可能走默认落盘路径，导致不同版本源身份不稳定。
- `mediaPollFulfillers` 之前没有把 task extra 里的目标路径传给 `persistMediaAsset`；这会让 async ITV 持久化无法使用业务指定的版本路径。

## 2026-05-10 Storyboard Batch Media Persistence

- 用户反馈：分镜批量出图 / 批量生成视频没有逐个落盘，一个失败后前面成功的结果也会丢。
- 排查：`Storyboard.handleBatchGenerate` / `handleBatchReGenerateImages` 在 `batchGenerateShotImages()` 整批返回后才一次性 `setShots`；如果父任务失败或用旧 `shots` 覆盖存储，成功项 UI/落盘都不可靠。
- 排查：`Storyboard.handleBatchRenderVideos` / `handleBatchReGenerateVideos` 在 `batchRenderShots()` 整批返回后才 `refreshShotsFromStore()`；中途成功的视频不会马上刷新。
- 排查：`batchRenderShots()` 顺序执行但没有外层 try/catch；`shotRenderWorkflow()` 大多会返回失败结果，但若其自身抛出未捕获异常会中断整批。
- 实施方向：批量图片服务增加单项完成回调并在每个任务内 catch；批量视频 workflow 增加单项完成回调与失败隔离；Storyboard 通过单项回调逐个 `refreshShotsFromStore()`，成功一条显示/保存一条。

- 实施结果：批量图片和批量视频现在都以单项完成回调驱动 UI 刷新；成功项在服务层已有媒体绑定落盘后会立即从项目存储重拉，不再等整批结束，也不再用旧 `shots` 合并覆盖最新媒体列表。
- 失败隔离：图片批量每个 `shotImageWorkflow` 独立 catch；视频批量每个 `shotRenderWorkflow` 外层 catch。一个分镜失败会计入失败结果，但后续分镜继续执行。

## 2026-05-10 Storyboard Prompt Template Production Board Upgrade

- 用户反馈：当前故事板生成不统一，缺少稳定的场景设计区、俯视镜头调度图、8镜头分镜故事区、灯光/情绪/声音/摄影/色彩方案等制作板模块。
- 排查：现有 `storyboard_shot_prompt_generation` 已强调“不固定 2x2”和制作笔记，但版式仍偏自由选择，没有把电影前期制作板作为默认骨架，也没有强制 8 镜头故事区与声音/摄影说明进入输出字段。
- 方向：把默认模板升级为“电影级制作板骨架优先”，保留非 2x2/非均匀网格能力，但强制大多数分镜包含场景设计区、俯视调度图、8镜头故事区、灯光与风格、情绪关键词、声音设计、摄影说明、色彩方案。
- 实施结果：故事板推理模板现在以“电影前期制作板”为默认骨架，不再只是自由选择版式；除非剧情极端适合四段宣传漫画，否则会引导模型生成多区块制作板。
- 关键统一点：强制包含场景设计区、俯视镜头调度图、8镜头分镜故事区、灯光与风格、情绪关键词、声音设计、摄影说明、色彩方案；TTI 终稿模板也同步要求这些区域进入最终图片结构。

## 2026-05-10 Storyboard Template Flexible Production Poster

- 用户反馈：上一版故事板模板过于机械，尤其固定 8 镜头/固定组成；需要参考电影分镜信息图海报风格，保留项目标题、角色设计、场景设计、俯视调度、分镜故事、灯光、情绪、声音、摄影、色彩等区块，但镜头数量和版式应由剧情决定。
- 方向：从“固定 8 镜头制作板”改为“剧情驱动的专业影视前期制作设定板”：用 X 个镜头 / X 个角色 / 1 个场景这类约束描述，而不是硬编码 8；TTI 终稿模板也改成 story-driven shot count。
- 实施结果：故事板模板已经从“固定 8 镜头制作板”改为“剧情驱动 N 镜头的信息图海报”。模块仍稳定，但镜头数、角色区、调度区和故事区的比例由剧情内容决定，避免机械拼表。

## 2026-05-10 Storyboard Project Title Metadata
- `storyboard_shot_prompt_generation` currently contains a textual 【项目标题】 requirement but has no runtime variables for project name/type/duration/constraints.
- `Shot.duration` is available on every shot and should be the source of storyboard duration, not project/script duration.
- Project type is `ProjectMeta.genre`; `ShotPromptService` currently imports only scenes/props/update/episode shots from `projectStore`, so storyboard prompt generation must load project meta or receive it through context.
- Implemented: project title header variables are now runtime data, not inferred prose. `projectType` comes from `ProjectMeta.genre`; `shotDurationSeconds` comes from `Shot.duration`.
- Fallback behavior: if project metadata cannot be loaded, the storyboard title falls back to the first script line/current shot and type becomes “未指定类型”; duration still comes from the shot when valid.

## 2026-05-10 Storyboard Anchor Highlight In Prompt Editors
- `MENTION_REGEX` / `parseMentions` already support `@storyboard_anchor` and `@previous_storyboard_anchor`.
- `ShotCard` passes the same `promptMentionItems` into both image and video `ScriptEditor`, so a fix there affects both prompt editors.
- Current `mentionTheme` styles `char/prop/scene/shot/grid`, but lacks explicit `.mention-storyboard` and `.mention-previous_storyboard`; storyboard anchors therefore do not stand out.
- `ShotCard` only adds current storyboard anchor mention when there is a selected current image. For prompt authoring in storyboard mode, adding a disabled/explanatory current storyboard item makes autocomplete/tooltip clearer even before first generation.

## 2026-05-10 Prompt Editor Snapshot Consistency
- `handleImagePromptChange` / `handleVideoPromptChange` update local state and queue `saveEpisodeShots`; if the user clicks generate immediately, persistence may still be queued.
- `generateShotImage()` reloads the shot from `loadEpisodeShots`, so it can use stale DB data instead of the text currently visible in the editor.
- `shotRenderWorkflow()` receives a `shot` object from React state, but click handlers can still close over a slightly stale `shots` array; a `shotsRef` should be the source of truth for immediate actions.
- `shotRenderWorkflow` always runs `ensureExplicitDialogueInVideoPrompt(sanitizeVideoPromptResult(videoPrompt), shot.dialogue, ...)`. If the user already wrote a non-empty `对白提示词`, old `shot.dialogue` gets appended and may be rewritten, producing repeated/incorrect character lines.
- Empty `videoPrompt` currently resolves `itv_shot_video` default prompt and sends it, which explains “没有视频提示词也能发送出去”。
- `sanitizeNarrativeDialogueLeakage()` 还有一个隐藏问题：它按分号拆 `对白提示词` 后，会把包含“自称天道 / 帮我”的显式 `叶赎 台词：...` 片段误判为旁白泄漏并删除。需要保留带 `台词：` 的手写台词，只清理明显以旁白转述开头的片段。
- 修复后，用户看见的提示词会作为唯一来源；发送前仍会把合法 mention 编译为 provider 协议 `@Image N`，所以 `@storyboard_anchor -> @Image 1` 是预期的协议转换，不是内容被改写。
- 图片生成也存在同类隐式兜底：`shotImageWorkflow()` 在 `imagePrompt` 为空时会套 `tti_shot_image` 默认模板。为保证“输入框即发送源”，空图片提示词现在也会被拒绝。
- 批量图片/视频生成如果紧跟编辑触发，也需要使用当前内存 `shotsRef` 快照并等待保存队列 flush；否则批量链路仍可能从旧 DB 或旧闭包取 prompt。

## 2026-05-12 Director3D Model Refinement And Open Model Catalog

- 当前 3D 导演工作台不走 GLTF / SkinnedMesh 资产链路，人物主要由 `Director3DMannequin.tsx`、`Director3DLiteMannequin.tsx`、`Director3DFormation.tsx` 的 procedural mesh 组成，骨骼是 group 层级和 `director3dRig.ts` 的欧拉旋转。
- 主角模型已有头、鼻尖、躯干、四肢和脚，但缺少眼睛、嘴、耳朵、胸前/背部方向标、关节可视化、手指/拇指等细节，正背面区分弱。
- 群演和方阵更简化，尤其方阵成员只有锥形躯干、头、腿；成员朝向主要靠整体旋转，单体正面不明显。
- 开源来源策略：不能把“所有网上开源模型”无差别打包进项目；应先接入带来源 URL / license / 用途说明的目录，再对许可证明确、体积可控、风格合适的模型做后续 GLB 导入。
- 适合进入目录的来源：
  - Kenney Blocky Characters：Kenney 官方资产，CC0，适合低多边角色模型参考/后续导入。
  - MakeHuman generated exports：官方授权说明中导出的角色模型可作为 CC0 / 公有领域方向使用，适合人体比例与面部/服装参考。
  - Poly Haven Models：官方标注 CC0，适合场景道具和环境模型来源。
  - Khronos glTF Sample Assets：适合作为 glTF / rig / animation 格式参考，但每个样例模型有独立 license，不能统一按一个许可证处理。
  - Three.js SkeletonHelper：适合作为骨骼可视化画法参考，骨骼线段用 helper 思路表现，不是模型资产来源。

## 2026-05-12 Director3D Procedural Detail Pass

- 用户确认不用额外引入资源，要求外部模型库先隐藏，继续细化 procedural 的动物、道具、人物。
- 当前 `Director3DCreatureMesh.tsx` 的四足动物通用模型可用，但物种差异主要靠比例/颜色/鬃毛/角，缺少老虎条纹、狼/狐耳、熊厚掌、马鬃尾、鹿斑、麒麟鳞片、鸟类羽片/爪、凤凰尾羽、龙鳞/胡须/爪等辨识细节。
- 当前 `Director3DProp.tsx` 根据 actor.type 只画 box/cylinder/plane/camera/arrow，具体“桌/椅/床/柜/车/树/岩石/麦克风”等语义只存在 label/promptHint 中，视口里还不够像具体物件。
- 最稳妥方案：不扩展 actor schema，直接在渲染组件里根据 `actor.label` 的中文/英文语义或 type 分支决定附加小几何；这样旧场景兼容，导出和拖拽逻辑不用变。
