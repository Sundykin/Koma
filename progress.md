# Progress Log

## Session: 2026-05-20 Koma Current Capability Requirements Spec

### Phase 1: Session Setup
- **Status:** complete
- Actions taken:
  - 使用 `pi-planning-with-files` 技能组织本次多步骤代码考古与规格文档产出。
  - 执行会话接续检查；当前继续使用根目录既有 `task_plan.md` / `findings.md` / `progress.md`。
  - 在 `task_plan.md` 追加本会话目标、范围、阶段和验收标准。

### Phase 2: Architecture Inventory
- **Status:** complete
- Actions taken:
  - 盘点 Electron 主进程、preload、storage、tasks、plugin、theme、settings、project、linghui 等目录。
  - 确认当前业务根、`settings.db`、`db/koma.db`、插件运行目录和灵绘工作区目录的职责分离。

### Phase 3: Capability Extraction
- **Status:** complete
- Actions taken:
  - 从代码中提取底层规划、持久化、文件存储、后台任务、插件系统、系统数据管理和主题系统能力。
  - 记录了任务、插件、主题、settings 以及灵绘工作区的当前实现边界。

### Phase 4: Requirements Draft
- **Status:** complete
- Actions taken:
  - 生成中文需求规格说明书：`docs/当前系统能力需求规格说明书.md`。
  - 文档按功能需求、实现依据和现状限制组织，避免把未实现能力写成现状。

### Phase 5: Review Pass
- **Status:** complete
- Actions taken:
  - 复核文档措辞与代码实现的一致性，特别是数据库分层、插件权限和主题数量。
  - `git diff --check` 通过。

## Session: 2026-05-18 Linghui LibTV Node Parity

### Phase 5.16: GridSliceNode Local Compose Pass
- **Status:** complete
- Actions taken:
  - 继续按 LibTV 区分 `九宫格 slash 生成` 与 `宫格切分 GridSplit` 的逻辑，处理灵绘本地 `image-grid-slice` 中间节点。
  - `GridSliceNode` 新增 `合成宫格` 节点内操作：读取当前 slots，用浏览器 canvas 按当前宫格维度重新拼成一张 PNG，并通过已有 `onCreateDerivedImportImages` 派生为图片节点。
  - `彻底切分` 保持原语义，只派生非空槽位为独立图片节点；空槽在合成图中保留轻背景和网格线，不改变槽位布局。
  - 节点槽位补本地重排能力：非空切片可拖拽到其他槽位交换位置，槽位也可接收拖入的本地图片/URL 并写回 `slots[]`。
  - 新增 `normalizeGridSliceSlots / buildGridSliceDerivedItems / composeGridSliceDataUrl` 纯函数边界，并补 `GridSliceNode.test.tsx` 覆盖槽位归一化、非空派生和空态禁用。
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/GridSliceNode.test.tsx`：1 file / 4 tests passed。
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
- Next:
  - 继续按节点矩阵推进下一个本地可实现节点；若回到 GridSplit，后续重点是拖入外部图片、拖拽排序和更接近 LibTV 的 slot 操作菜单。

### Phase 5.17: VideoNode In-node Resource Toolbar
- **Status:** complete
- Actions taken:
  - 继续对齐视频资源节点操作：选中已有视频资源时，视频预览内部显示 compact 工具条。
  - 工具条包含 `截图 / 剪辑 / 高清 / 解析 / 分离音频`，点击后调用已有 `openVideoToolPanel(nodeId, tool)`，进入现有真实执行面板。
  - 未迁入 `智能去字幕 / 人声分离` 到节点本体，因为本地没有对应服务；这两个仍不作为可执行本地能力展示。
  - `_compact-nodes.scss` 增加扁平小尺寸视频资源工具条样式，避免亮色主题下出现大阴影/双层卡片。
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/VideoNode.test.tsx`：1 file / 4 tests passed。
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续检查其他资源节点是否还有“真实操作只在外挂面板、节点本体不可达”的问题。

### Phase 5.18: AudioNode Resource Derivation Action
- **Status:** complete
- Actions taken:
  - 继续补音频资源节点本体操作：选中资源态音频时，播放器工具条显示 `生视频` 小按钮。
  - 该按钮调用已有真实 `onApplyAudioEmptyAction(nodeId, 'audio-to-video')`，复用 LibTV 式音频到视频派生链路，不新增伪功能。
  - 倍速切换和下载按钮保持原行为；新按钮只在选中资源态出现，避免常驻挤压播放器。
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/AudioNode.test.tsx`：1 file / 5 tests passed。
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续检查 `image / script / storyboard / group` 的节点本体操作是否还有可本地闭环的缺口。

### Phase 5.19: Storyboard Card Field Parity
- **Status:** complete
- Actions taken:
  - 继续修正故事板节点本体展示：卡片视图不再只显示一个 `description` 摘要。
  - `ScriptShotCards` 增加字段化展示：剧情摘要、画面描述、生图提示词、视频运动提示词在节点内分开可见。
  - 保留表格视图的完整字段列和节点内分镜/视频组派生操作。
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/ScriptNode.test.tsx`：1 file / 3 tests passed。
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续检查故事板行内编辑、字段 patch 和 LibTV 全屏表格能力，避免编辑器/节点两套视图割裂。

### Phase 5.20: Storyboard In-node Table Editing
- **Status:** complete
- Actions taken:
  - 继续对齐 LibTV 故事板/视频故事表格操作：节点本体表格从只读改为可编辑。
  - `ScriptNode` 表格视图开启 `editable`，字段修改写入 `properties.editedShots`，并保持 `生成分镜 / 生成视频组` 使用编辑后的镜头字段。
  - `LinghuiScriptNodeProperties` / `LinghuiStoryboardNodeProperties` 增加 `editedShots`，作为用户手动修正后的镜头数据源。
  - `StoryboardNodeEditor` 读取并写回同一份 `editedShots`，避免节点内编辑和外挂编辑器展示不一致。
  - 节点内聚合生成器补 `派生文本`，接入已有 `onDeriveScriptShots`，与编辑器的镜头文本/分镜图/视频组三类操作对齐。
  - 空态故事板节点新增节点内剧情输入和 `生成故事板` 按钮，直接调用 `onRunNode`。
  - 节点右上角补 `全选/清选`，收起态使用缩放总览避免滚动条和内容截断，展开态放大节点并在节点内看完整内容。
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/ScriptNode.test.tsx src/components/linghui/editors/tests/ScriptShotViews.test.tsx`：2 files / 7 tests passed。
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/ScriptNode.test.tsx`：1 file / 4 tests passed after adding `派生文本`。
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/ScriptNode.test.tsx`：1 file / 5 tests passed after adding in-node prompt/run.
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/ScriptNode.test.tsx src/components/linghui/editors/tests/ScriptShotViews.test.tsx`：2 files / 8 tests passed after adding full-select controls.
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续补 LibTV 式全屏表格的行级操作和批量选择/派生细节。

### Phase 5.9: Script / Storyboard Real Field + In-node Layout Fix
- **Status:** complete
- Actions taken:
  - 根据用户反馈重新反编 LibTV `ScriptNode` / `VideoStoryNode`，确认故事板主要内容和操作在节点本体内部，而不是只靠外挂编辑器。
  - 修正 `LinghuiStoryboardFrame` 数据结构，新增 `plotDescription / visualDescription / shotSize / characterAction / emotion / sceneTags / lightingAndAtmosphere / audioEffects / dialogue / imageGenerationPrompt / videoMotionPrompt`。
  - 修正 `parseLinghuiScriptContent()`：JSON 输出中的剧情、画面、生图提示词、视频运动提示词会分别保留；`formatLinghuiScriptShots()` 也按不同字段输出。
  - 修正故事板/脚本 system prompt：要求 LLM 输出不同的剧情描述、画面描述、生图提示词和视频运动提示词，避免再次生成一列多用的数据。
  - 修正 `ScriptShotViews`：表格列从真实字段读取，不再把所有列回填成 `description`。
  - 修正派生链路：`生成分镜图` 优先使用 `imageGenerationPrompt`，`生成视频流程` 优先使用 `videoMotionPrompt`。
  - `ScriptNode` / `StoryboardNode` 本体新增 LibTV 式节点内故事板区域：节点内卡片/表格切换、全屏打开入口、选中镜头后节点内直接触发 `分镜图 / 视频流程`。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/ScriptNode.test.tsx src/components/linghui/editors/tests/ScriptShotViews.test.tsx src/components/linghui/editors/tests/linghuiScriptNodeUtils.test.ts src/components/linghui/execution/tests/linghuiExecutionScriptNode.test.ts src/components/linghui/execution/tests/linghuiExecutionStoryboardNode.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx`：6 files / 24 tests passed。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续核对 LibTV `ScriptAggregatedGenerator` 和 full-screen table config：列显示/过滤、可编辑文本 cell、角色图和视频参考图上传，这些仍未完整迁移。

### Phase 5.8: Script / Storyboard / Agent Local Prompt Presets
- **Status:** complete
- Actions taken:
  - 继续按 LibTV 节点对齐思路处理可本地实现的预制提示词入口，而不是只做静态 UI。
  - 新增 `linghuiScriptPromptPresets.ts`：脚本 LLM 生成态提供 `剧情分镜 / 多机位 / 产品短片 / 情绪蒙太奇`，点击后合并进真实 `prompt/systemPrompt`，不会重复叠加同一内置提示词。
  - `StoryboardNodeEditor` 增加可见 compact scene preset 条：`四镜头 / 九镜头 / 16镜头 / 25镜头`，点击写入 `scene/targetShotCount`，底层继续由执行器拼入 LibTV scene 内置 prompt。
  - 新增 `linghuiAgentPromptPresets.ts`：Agent 节点提供 `素材分析 / 生成方案 / 分镜检查 / 提示词优化`，点击写入 `prompt/systemPrompt/maxIterations`。
  - 脚本、故事板和 Agent 统一复用扁平化 `linghuiScriptGeneratorPanel` / preset chip 尺度，减轻亮色主题下的大阴影和双层卡片感。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/linghuiPromptPresets.test.ts src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx src/components/linghui/execution/tests/linghuiExecutionStoryboardNode.test.ts src/components/linghui/execution/tests/linghuiExecutionScriptNode.test.ts`：5 files / 31 tests passed；保留既有 AntD/jsdom/Three.js warning。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续下一个节点聚焦：建议复核 `agent` 结果态/工具白名单显示是否与 LibTV custom/text 生成器状态更一致，或回到 `image` 的擦除/抠图面板做更深的真实能力评估。

### Phase 5.7: Image Generic Tools Preset + Crop Preview Pass
- **Status:** complete
- Actions taken:
  - 图片通用工具补齐更多 LibTV 风格 preset：`去水印字幕 / 透明底素材 / 封面裁剪 / 手机屏幕 / 局部重排 / 替换文字`。
  - `ImageNodeEditorGenericPanel` 对 `裁剪` 增加比例预览遮罩，跟随 `genericAspectRatio` 变化，明确它走本地 FFmpeg crop 链路。
  - 非本地工具显示当前 preset 说明，避免用户把 prompt 派生工具误解为本地处理。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：2 files / 22 tests passed；保留既有测试环境 warning。
  - `git diff --check`：passed。
- Next:
  - 没有本地模型的 `擦除 / 抠图 / 文字编辑` 继续保持图生图派生，不暴露成假本地按钮；后续如接入分割/修复服务再升级为真实本地/服务端执行。

### Phase 5.4: SpaceScene720 Panorama Viewer Parity
- **Status:** complete
- Actions taken:
  - 继续对标 LibTV `space-scene-720` / `SpaceScene360Viewer`，把反编出的全景 viewer 交互补到灵绘全景节点。
  - `PanoramaViewport` 增加可控的九宫格构图线、右下角 yaw/pitch/fov HUD、交互开关，并保持节点内缩略预览默认不显示这些额外 HUD。
  - `PanoramaViewer` 全屏 Modal 增加 LibTV 式底部紧凑工具条：快捷键面板、构图网格开关、拖拽交互开关、应用当前视角按钮；原 `应用此视角` 仍走真实 perspective 派生逻辑。
  - `panoramaDetailCrop.ts` 增加 LibTV 4 向 / 12 向截图命名 helper 和 `全景截图组 (N 张)` helper；全景编辑器增加 `切 12 方向` 入口。
  - `_media-panels.scss` 增加全景构图网格、HUD、底部工具条和快捷键面板样式，保持 26px 按钮和轻量扁平 HUD 尺度。
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/panorama/panoramaPerspectiveExtractor.test.ts`：1 file / 11 tests passed。
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续下一个 LibTV 节点差距，建议回到 `video` 的截图/解析/去字幕工具，或补 `image` 剩余擦除/抠图/crop 面板真实流程。

### Phase 5.1: VideoGroup Storyboard Video Flow
- **Status:** complete
- Actions taken:
  - 继续 `video_group` 迁移。根据 LibTV 反编结论，它不是裸露的普通节点，而是故事板图片组派生出的视频组容器。
  - 改造 `useLinghuiCanvasStoryboardVideoDerivation.ts`：`生成视频流程` 现在创建一个 `group`，label 为 `视频组 · {故事板名}`，并写入 `sourceScriptNodeId / storyboardTitle / storyboardGroupType:"video"`。
  - 每个镜头在 group 内生成一组分镜图节点 + 视频节点；图节点承接 shot.image/source 和描述，视频节点承接 shot.description / duration，并保留 script derivation metadata。
  - group 右侧自动创建 `linghui/video-clip` 节点，`clips` 绑定所有分镜视频节点，后续视频生成完成后可直接合成。
  - `LinghuiScriptDerivationKind` 增加 `video-clip`，`LinghuiVideoClipNodeProperties` 继承脚本派生 metadata，方便复用/刷新同一个合成节点。
  - `useLinghuiCanvasDocumentOps.test.tsx` 增加 LibTV video_group parity 测试，覆盖 group、子节点、clip 节点和边。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx src/components/linghui/execution/tests/linghuiExecutionVideoClipNode.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：3 files / 22 tests passed。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续 `video-story`：把 LibTV 的 rows/columns 表格和全屏只读视图对齐到灵绘 `storyboard` 的 table/fullscreen 视图。

### Phase 4-5: VideoClip Audit + Real FFmpeg Concat
- **Status:** complete
- Actions taken:
  - 继续按用户要求搜集 LibTV 节点操作逻辑，深挖 `template_/libtv/15gvxu-nayl4w.js` 中 `VideoClipNode`。
  - 记录 LibTV 证据：空态文案 `空空如也，请连接多个视频节点后操作` / `请连接2个及以上的视频/音频后操作`，可打开按钮 `打开视频合成`，资源态中央仍可打开合成并有下载按钮，节点不显示通用 generator 条。
  - 修掉灵绘 `VideoClipNode.tsx` 的假入口：移除 `Modal.info("executor 尚未接入")`，`合成视频` 按钮改为调用真实 `onRunNode(id)`，不足 2 段时禁用并给 title。
  - 新增 Electron FFmpeg `concatMediaClips` 桥：TS 与 public JS 镜像均包含 preload 白名单、controller 方法、service 队列任务和拼接实现。
  - `concatMediaClips` 实现策略：每个视频/图片先标准化为同尺寸、同 fps、yuv420p、带音轨的临时 mp4；图片按默认时长 loop；最后用 concat demuxer 输出 mp4。
  - 新增 `linghuiVideoClipExecutor.ts`，执行器读取显式 `properties.clips`，没有 clips 时回退上游 video/image 输入；少于 2 段时报 LibTV 同款输入不足文案；成功返回 `video` result。
  - `ffmpegManager.ts` 增加 `getCacheDir` 和 `concatMediaClips`，并新增 passthrough 测试；新增 `linghuiExecutionVideoClipNode.test.ts` 覆盖显式 clips、上游 fallback 和输入不足。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/execution/tests/linghuiExecutionVideoClipNode.test.ts src/services/ffmpegManager.test.ts`：2 files / 7 tests passed。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
- Next:
  - 已初步记录 `video_group` / `video-story`：下一步优先做“故事板/脚本 -> 分镜视频组”的派生流程，把多段视频生成后接到 `linghui/video-clip`。

### Phase 1-3: Node Inventory + Audio Node Start
- **Status:** complete
- Actions taken:
  - 按用户要求继续“搜集 LibTV 所有节点”，从 `template_/libtv` 打包产物中定位 `nodeTypes` 与 `wrapSelfVirtualizing`。
  - 抽出 LibTV ReactFlow 节点类型：`custom/text/image/video/audio/temp/group/script/storyboard/video-story/video_group/video-clip/space-scene-720`。
  - 对照灵绘当前节点：`text/agent/image/panorama/video/audio/script/storyboard/director3d/image-grid-slice/video-clip`。
  - 已把新计划和差距矩阵写入 `task_plan.md`，把节点清单和 AudioNode 反编结论写入 `findings.md`。
  - 选择 `audio` 作为本轮首个落地节点：LibTV 证据明确、灵绘已有空态派生但节点 UI / 资源态操作还没完整对齐。
  - 新增 `useLinghuiAudioNodeUpload.ts` 和 `LinghuiAudioNodeUploadFloat.tsx`，让音频节点上方“上传”浮按钮走与图片/视频一致的本地选择、workspace 导入、写回 source、清运行态链路。
  - `AudioNode.tsx` 改为使用 `resolveLinghuiAudioNodeViewState()`：支持 `empty_generate / pending / resource / generating / failed`，pending 态不显示等待文案，resource 态隐藏 target handle 并直接内嵌音频播放器。
  - `_compact-nodes.scss` 增加 compact 音频 resource stage / disc / player 样式，保持 HUD 尺度和亮色主题扁平化。
  - 新增 `AudioNode.test.tsx` 覆盖 empty、pending、resource 三个关键状态。
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/AudioNode.test.tsx`：1 file / 3 tests passed。
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续反编并迁移 `group / video_group / video-story / video-clip`，确认 LibTV 的组合节点操作和灵绘对应差距。

## Session: 2026-05-17 Linghui Large Component/Hook Refactor Plan

### Phase 5.1: P1 Image Floating Toolbar Menu Extraction
- **Status:** complete
- Actions taken:
  - 继续执行 P1 Image Node Editing Surface，先拆较小且风险低的 `LinghuiImageNodeFloatingToolbar.tsx`。
  - 新增 `linghuiImageToolbarMenus.tsx`，承接图片工具条的菜单 classNames、Dropdown menu factory、active tool 判断、高清 / 九宫格 / 宫格切分 / 重绘 / 更多菜单构造。
  - `LinghuiImageNodeFloatingToolbar.tsx` 保留组件状态、剧情编辑 Modal 编排、工具条 JSX 和节点 API 调用；按钮文案、className、Dropdown `document.body` 挂载和菜单顺序保持不变。
  - 原文件从 552 行降到 362 行，新菜单文件 316 行；重新扫描后剩余 >500 的组件 15 个，hooks 0 个。
  - 恢复脚本提示存在上一会话未同步的全景视角修复上下文，已用 `git diff --stat` 确认对应现有修改在 `ImageNode.tsx` 与 `panoramaPerspectiveExtractor.ts`，本轮没有触碰这两个文件。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：1 file / 10 tests passed；保留既有 AntD shadow-root / jsdom getComputedStyle warning。
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx`：1 file / 12 tests passed；保留既有 Three.js duplicate warning。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续 P1，建议转入 `ImageNodeEditor.tsx` 的只读子面板抽取；优先拆 `MultiAngleToolPanel / RelightToolPanel / OutpaintToolPanel / RepaintToolPanel`，不改任何样式和交互。

### Phase 5.2: P1 ImageNodeEditor Panel Extraction
- **Status:** complete
- Actions taken:
  - 继续拆 `ImageNodeEditor.tsx`，先抽不改变业务状态归属的纯渲染面板。
  - 新增 `ImageNodeEditorLibTVPanels.tsx`，承接 LibTV 面板壳、生成 footer、预览 stage，以及 `扩图 / 重绘 / 通用 preset 工具` 三类 compact 面板。
  - 新增 `ImageNodeEditorSettingsPopovers.tsx`，承接图片参数 Popover 和独立镜头 Popover；`ImageNodeEditorExtraSettingsBlock` 继续从 `ImageNodeEditor.tsx` re-export，保持外部 API。
  - 新增 `ImageNodeEditorFocusMarkPanels.tsx`，承接 `聚焦 / 标记` 两个面板；主 editor 仍持有节点写入、message 和创建标记点逻辑。
  - `ImageNodeEditor.tsx` 从 1976 行降到 1516 行；新面板文件分别为 405 / 182 / 228 行。功能、样式类、文案、DOM 语义和状态写入链路保持不变。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：2 files / 22 tests passed；保留既有 Three.js duplicate warning 与 AntD/jsdom warning。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
  - 重新扫描 >500 组件/hooks：剩余 15 个组件，hooks 0 个；`ImageNodeEditor.tsx` 仍在清单中但已降到 1516 行。
- Next:
  - 下一片继续 `ImageNodeEditor.tsx`，建议拆 `MultiAngleToolPanel` 和 `RelightToolPanel`；这两块是当前文件中最大的剩余 JSX 区域。

### Phase 5.3: P1 ImageNodeEditor MultiAngle/Relight Extraction
- **Status:** complete
- Actions taken:
  - 继续拆 `ImageNodeEditor.tsx` 中最大的两个剩余 JSX 岛：`多角度编辑器` 与 `打光效果`。
  - 新增 `ImageNodeEditorAngleRelightPanels.tsx`，承接 `ImageNodeEditorMultiAnglePanel` 与 `ImageNodeEditorRelightPanel`。
  - 主 editor 仍保留 multi-angle / relight 的状态、normalize、preset 应用、提交和文件选择逻辑；新组件只负责渲染和回调转发。
  - `ImageNodeEditor.tsx` 从 1516 行降到 1268 行；新增 angle/relight 面板文件 368 行。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：2 files / 22 tests passed；保留既有 Three.js duplicate warning 与 AntD/jsdom warning。
  - `git diff --check`：passed。
- Next:
  - `ImageNodeEditor.tsx` 仍 >500，下一片建议拆 provider/settings/prompt 主体区域或把 image tool 状态提交逻辑抽成 hook。

### Phase 5.4: P1 LinghuiNodeEditor Shell Extraction
- **Status:** complete
- Actions taken:
  - 继续拆 `LinghuiNodeEditor.tsx`，优先处理纯渲染和纯布局边界，不改变节点编辑行为、文案、className 或样式。
  - 新增 `LinghuiNodeEditorVideoToolbar.tsx`，承接 LibTV 视频工具条、视频工具按钮、音频分离下拉菜单和 `VIDEO_TOOLBAR_ITEMS`。
  - 新增 `LinghuiNodeEditorGridSplitToolbar.tsx`，承接宫格切分模式的档位、已选数量、创建生图节点、高清倍率和回退工具条。
  - 新增 `linghuiNodeEditorLayout.ts`，承接节点类型 label、面板宽高和 viewport bound helper。
  - 新增 `LinghuiNodeEditorSurface.tsx`，承接按 `nodeType` 分发具体编辑器组件的 JSX；主文件继续持有 selection、引用素材、activeTool、portal 和弹层尺寸状态。
  - `LinghuiNodeEditor.tsx` 从 778 行降到 476 行，退出本轮 >500 组件清单。
  - 复扫时发现拆分 carryover 新 hook `useLinghuiCanvasContextMenuActions.ts` 为 501 行；收短两段注释后降到 493 行，当前 >500 hook 清单清零。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx src/components/linghui/editors/tests/VideoNodeEditor.test.tsx src/components/linghui/editors/tests/ImageNodeEditor.test.tsx`：3 files / 32 tests passed；保留既有 Three.js duplicate warning 与 AntD/jsdom warning。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续拆剩余 >500 组件，优先级可在 `ImageNodeEditor.tsx` 的状态/提交 hook 与 `LinghuiPromptEditor.tsx` 的 CodeMirror reference widget 之间选择；Director3D 超大文件建议单独分片。

### Phase 6.1: Largest Components Surface Extraction
- **Status:** in_progress
- Actions taken:
  - 按用户要求“拆最大的”继续推进，先处理当前最大组件。
  - `LinghuiPage.tsx`：新增 `LinghuiCanvasFloatingRail.tsx`，把项目列表 / 保存 / 新建 / 工作流 / 资产 / 历史 / 执行日志这整段浮动 rail 和项目/日志弹层 JSX 拆出；主页面继续持有 workspace、drawer、日志、保存和导入导出回调。
  - `LinghuiPage.tsx` 从约 2087 行降到 1782 行，`LinghuiCanvasFloatingRail.tsx` 为 414 行。
  - 继续按最大文件转到 `Director3DNodeEditor.tsx`：新增 `Director3DAssetLibraryPanel.tsx`，把左侧人物/生物/道具/镜头/模板资产库和派兵布阵 popover 拆出；新增 `Director3DTopBar.tsx`，承接顶部 HUD 状态条。
  - `Director3DNodeEditor.tsx` 从 2058 行降到 1717 行；新增 `Director3DAssetLibraryPanel.tsx` 437 行、`Director3DTopBar.tsx` 74 行。
  - 回到 `LinghuiPage.tsx`，新增 `useLinghuiPageLibraries.ts`，把资产库 / 工作流库 / 历史库加载、刷新和发送到画布动作从页面中抽出。
  - `LinghuiPage.tsx` 进一步降到约 1701 行，`useLinghuiPageLibraries.ts` 为 148 行。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dExportGeometry.test.ts src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx src/components/linghui/editors/tests/ImageNodeEditor.test.tsx`：5 files / 56 tests passed；保留既有 Three.js duplicate warning 与 AntD/jsdom warning。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 当前最大组件为 `Director3DNodeEditor.tsx`（约 1718 行），下一片建议拆右 rail inspector；`LinghuiPage.tsx` 下一片可拆 workspace 持久化 / 项目操作 hook。

### Phase 6.2: Director3D Inspector Extraction
- **Status:** complete
- Actions taken:
  - 继续按最大组件拆 `Director3DNodeEditor.tsx`。
  - 新增 `Director3DInspectorPanel.tsx`，把右侧属性 popover 的 actor/camera inspector、骨骼微调、物种/动作、方阵参数、保存到全局库与删除动作 UI 拆出。
  - 父组件仍保留 `selectedActor`、`handleActorChange`、保存全局资产、相机字段、背景模式和删除 actor 逻辑；新组件只渲染表单并透传回调。
  - `Director3DNodeEditor.tsx` 从约 1717 行降到 1341 行；`Director3DInspectorPanel.tsx` 为 433 行。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dExportGeometry.test.ts src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx src/components/linghui/editors/tests/ImageNodeEditor.test.tsx`：5 files / 56 tests passed；保留既有 Three.js duplicate warning 与 AntD/jsdom warning。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 当前最大组件为 `LinghuiPage.tsx`（约 1702 行），下一片建议拆 workspace/project 操作 hook；随后继续 `ImageNodeEditor.tsx` 或 `Director3DViewport.tsx`。

### Phase 7/8 Carryover: Canvas, Context Menu, Video, Script, Panorama, Prompt Helper Extractions
- **Status:** in_progress
- Actions observed:
  - 当前工作树已有上一段未提交拆分增量，已接住并通过 frontend TypeScript：
    - `LinghuiCanvas.tsx` 824 → 56 行，新增 `LinghuiCanvasInner.tsx` 与 canvas interaction/layout/node-api hooks。
    - `LinghuiCanvasContextMenu.tsx` 521 → 257 行，新增 pane/node context menu 子组件。
    - `ScriptNodeEditor.tsx` 502 → 420 行，新增 `ScriptShotViews.tsx`。
    - `VideoNodeEditorPanels.tsx` 610 → 383 行，新增 `VideoAccessCard.tsx`、`VideoParameterPanel.tsx`。
    - `VideoNode.tsx` 510 → 433 行，新增 `videoNodeUtils.ts`。
    - `PanoramaViewer.tsx` 626 → 197 行，新增 `PanoramaCameraRig.tsx`、`PanoramaGeometryComponents.tsx`、`usePanoramaTexture.ts`、`panoramaViewerConstants.ts`。
    - `linghuiPromptReferences.ts` 644 → 97 行，新增 prompt reference edges/helpers。
    - `linghuiResultExport.ts` 565 → 101 行，新增 `linghuiResultExportUtils.ts`。
    - `linghuiNodeDefs.ts` 555 → 333 行，新增 `linghuiConnectionValidation.ts`。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed after observing this carryover state.
- Next:
  - 补这些 carryover slice 的目标测试；再继续拆剩余 >500 清单。

### Phase 4.5: P0 OverlayProps Extraction
- **Status:** complete
- Actions taken:
  - 拆 `useLinghuiCanvasOverlayProps.ts`，把纯 helper、右键菜单媒体状态、图片工具执行链路、右键菜单动作和右键菜单 props 组装拆出。
  - 新增 `linghuiCanvasOverlayMediaHelpers.ts`，承接媒体结果转图片项、视频去重、剪贴板写入、宫格/高清/裁剪输入物化、文件名清理等纯 helper。
  - 新增 `useLinghuiCanvasContextMenuMediaState.ts`，承接当前右键节点的图片/视频/复制状态推导。
  - 新增 `useLinghuiCanvasImageToolExecutions.ts`，承接图片工具 preset、宫格切分、高清放大、裁剪、多角度执行触发。
  - 新增 `useLinghuiCanvasContextMenuActions.ts`，承接创建资产/主体、复制结果/图片、展开/只保留媒体、视频音轨分离、保存工作流等动作。
  - 新增 `useLinghuiCanvasContextMenuOverlayProps.ts`，承接右键菜单 overlay props 组装和菜单命令闭包。
  - `useLinghuiCanvasOverlayProps.ts` 从 1869 行降到 462 行，已退出 >500 hook 清单；新增 hooks/helpers 均不超过 500 行。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/canvas/tests`：14 files / 71 tests passed。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
  - 重新扫描 >500 清单：已无 hooks；剩余 16 个目标全是组件。
- Next:
  - P0 Canvas Operations Hooks 完成。下一阶段进入 P1 Image Node Editing Surface，优先拆 `ImageNodeEditor.tsx` 或较小的 `LinghuiImageNodeFloatingToolbar.tsx`。

### Phase 4.4: P0 DocumentOps Media + Group Extraction
- **Status:** complete
- Actions taken:
  - 继续收口 `useLinghuiCanvasDocumentOps.ts`，把媒体结果派生和图片工具派生从主 hook 中拆出。
  - 新增媒体派生 hooks：`useLinghuiCanvasImageResultDerivation.ts`、`useLinghuiCanvasPanoramaDerivation.ts`、`useLinghuiCanvasVideoResultDerivation.ts`、`useLinghuiCanvasAudioFromVideoDerivation.ts`、`useLinghuiCanvasMultiAngleImageDerivation.ts`、`useLinghuiCanvasImageToolDerivation.ts`。
  - 新增 `useLinghuiCanvasMediaDerivations.ts` 薄聚合入口和 `linghuiCanvasMediaDerivationShared.ts` 参数类型；原 `createDerivedImageNodesFromNode / createDerivedPanoramaNodeFromNode / createDerivedVideoNodesFromNode / createDerivedAudioNodeFromVideo / createDerivedMultiAngleImageNodeFromNode / createDerivedImageToolNodeFromNode` 方法名保持不变。
  - 新增 `useLinghuiCanvasGroupOps.ts`，承接删除节点、删边、解组、选中成组和 `clearPendingGroupFrame`。
  - `useLinghuiCanvasDocumentOps.ts` 从 1107 行降到 472 行，已退出本轮 >500 hook 清单；新建 hooks 均低于 300 行。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx`：1 file / 9 tests passed。
  - `cd frontend && npm run test -- --run src/components/linghui/canvas/tests`：14 files / 71 tests passed。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
  - 重新扫描 >500 清单：P0 hooks 只剩 `useLinghuiCanvasOverlayProps.ts` 1869 行；`useLinghuiCanvasMediaImport.ts` 479 行、`useLinghuiCanvasDocumentOps.ts` 472 行已达标。
- Next:
  - 继续 P0 最后一项：拆 `useLinghuiCanvasOverlayProps.ts`，优先寻找不碰 DOM/className 的 action/helper 边界。

### Phase 4.3: P0 DocumentOps Storyboard Derivation Extraction
- **Status:** complete
- Actions taken:
  - 继续拆 `useLinghuiCanvasDocumentOps.ts`，把脚本节点派生分镜、分镜图片、分镜视频三组动作抽出。
  - 新增 `linghuiCanvasDocumentOpsShared.ts`，承接 `getDerivedNodeMeta()` 和 `hasMatchingEdge()` 两个跨派生动作共享 helper。
  - 新增 `linghuiCanvasStoryboardDerivationShared.ts`，统一 storyboard 派生 hook 参数类型。
  - 新增 `useLinghuiCanvasStoryboardTextDerivation.ts`、`useLinghuiCanvasStoryboardImageDerivation.ts`、`useLinghuiCanvasStoryboardVideoDerivation.ts` 和薄聚合 hook `useLinghuiCanvasStoryboardDerivations.ts`。
  - 保持 `useLinghuiCanvasDocumentOps.ts` 对外返回 API 不变：`deriveStoryboardShotsFromScript / deriveStoryboardImagesFromScript / deriveStoryboardVideosFromScript` 仍由原 hook 暴露。
  - `useLinghuiCanvasDocumentOps.ts` 从 1624 行降到 1107 行；新增 storyboard hooks 均低于 300 行。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx`：1 file / 9 tests passed。
  - `cd frontend && npm run test -- --run src/components/linghui/canvas/tests`：14 files / 71 tests passed。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - P0 仍剩 `useLinghuiCanvasDocumentOps.ts` 1107 行和 `useLinghuiCanvasOverlayProps.ts` 1869 行。下一片继续抽 DocumentOps 媒体结果派生，之后再转入 OverlayProps。

### Phase 4.2: P0 MediaImport Helper Extraction
- **Status:** complete
- Actions taken:
  - 继续执行 P0 Canvas Operations Hooks 拆分，处理 `useLinghuiCanvasMediaImport.ts`。
  - 新增 `linghuiCanvasUploadedNodeFactories.ts`，抽出图片/视频/音频上传节点创建逻辑。
  - 新增 `linghuiCanvasMediaImportSources.ts`，抽出拖拽 source 解析和图床/工作区 fallback source 解析。
  - 保持原 hook 对外返回值不变：`handleUploadImagesToCanvas / handleUploadVideosToCanvas / handleUploadAudiosToCanvas / handleDragOver / handleDrop`。
  - `useLinghuiCanvasMediaImport.ts` 从 582 行降到 479 行；两个 helper 分别 47 / 73 行。
  - 保留上传占位节点必须在 `setNodes` updater 外创建的 Strict Mode 防护。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/canvas/tests`：14 files / 71 tests passed。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - P0 仍剩 `useLinghuiCanvasDocumentOps.ts` 1624 行和 `useLinghuiCanvasOverlayProps.ts` 1869 行。下一片建议优先抽 DocumentOps 的 storyboard 派生或媒体结果派生。

### Phase 4.1: P0 DocumentOps EmptyState Action Extraction
- **Status:** complete
- Actions taken:
  - 开始执行 P0 Canvas Operations Hooks 拆分，先处理 `useLinghuiCanvasDocumentOps.ts` 中边界最清晰的 Text / Video / Audio EmptyState 派生动作。
  - 新增薄聚合 hook `useLinghuiCanvasEmptyActions.ts`，保持 `applyTextEmptyAction / applyVideoEmptyAction / applyAudioEmptyAction` 三个原对外方法名。
  - 新增 `useLinghuiCanvasTextEmptyAction.ts`、`useLinghuiCanvasVideoEmptyAction.ts`、`useLinghuiCanvasAudioEmptyAction.ts`，分别承接原先的文本、视频、音频空态派生逻辑。
  - 新增 `linghuiCanvasEmptyActionShared.ts`，只放共享参数类型和边去重 helper。
  - `useLinghuiCanvasDocumentOps.ts` 从 2196 行降到 1624 行；新增 hooks 均低于 300 行，未修改 className、DOM、样式或业务文案。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
  - `cd frontend && npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx`：1 file / 9 tests passed。
  - `npx tsc --noEmit --project tsconfig.json --pretty false`：passed。
  - `git diff --check`：passed。
- Next:
  - 继续 P0 的下一片：从 `useLinghuiCanvasDocumentOps.ts` 抽 storyboard 派生或媒体结果派生；或者转到 `useLinghuiCanvasMediaImport.ts` 做上传/拖拽导入拆分。

### Phase 1-3: Inventory, Boundary Review, Guardrails
- **Status:** complete
- Actions taken:
  - 使用 `planning-with-files-zht` 恢复并继续维护 `task_plan.md`、`findings.md`、`progress.md`。
  - 运行 planning catchup；它报告了上一会话历史上下文，但 `git status --short --branch` 与 `git diff --stat` 显示本轮开始时工作树干净。
  - 扫描 `frontend/src/components/linghui` 下非测试 `.ts/.tsx` 文件，按“组件 `.tsx` / hook `use*.ts(x)` / 超过 500 行”过滤。
  - 确认 19 个本轮目标：3 个 hooks、16 个组件。最大文件为 `useLinghuiCanvasDocumentOps.ts` 2196 行、`Director3DNodeEditor.tsx` 2091 行、`LinghuiPage.tsx` 2086 行、`ImageNodeEditor.tsx` 1976 行、`useLinghuiCanvasOverlayProps.ts` 1869 行。
  - 抽查超大文件顶层函数和 JSX/render 区块，按业务边界制定 P0-P4 拆分顺序。
  - 将新 session、完整 inventory、拆分 phases、acceptance criteria 写入 `task_plan.md`；将结构发现和优先级判断写入 `findings.md`。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。
- Next:
  - 用户确认后从 P0 开始拆 `useLinghuiCanvasDocumentOps.ts`：先抽纯 helper 和派生/empty-action hooks，保持原 hook 对外返回值不变。

## Session: 2026-05-16 Linghui Canvas LibTV Recreation

### Phase 32: Restore Add Node Spatial Entries & Panorama Slash Defaults
- **Status:** complete
- Actions taken:
  - 继续处理用户最新反馈：空白画布“添加节点”里 `导演工作台` 和 `全景节点` 消失；同时要求继续深挖 LibTV 全景生图是否有内置提示/场景配置并迁移。
  - 恢复 `task_plan.md` / `progress.md` / `findings.md`，运行 planning catchup，并确认当前工作树有上一阶段 Linghui 改动，后续只做相关增量。
  - 初步定位根因：`LINGHUI_CANVAS_CREATE_MENU_CATALOG` 已包含 `spatial-panorama` 和 `spatial-director3d`，但 `LinghuiCanvasQuickCreate` 在空白“添加节点”场景也固定渲染 `LINGHUI_REFER_NODE_PRESETS` 六项引用菜单，完全忽略传入 catalog，导致空间节点不可见。
  - 已格式化 LibTV `template_/libtv/0c7etgphqc14l.js` 到 `/tmp/libtv-panorama-0c7.beautified.js`；确认全景 slash 常量：`PANORAMIC_SLASH_SCENE = "720_panoramic"`、`PANORAMIC_SLASH_SUBMIT_MODEL_KEY = "lib-image-2"`、`buildPanoramicWithPromptEnablePatch` 使用 `"720_panoramic_with_prompt"`，`mergeSettingsForPanoramicSlashScene` 对 `720_panoramic` 强制 `quality: "medium"` 和按模型取 `ratio`。
  - `LinghuiCanvasQuickCreate` 改为按场景分流：空白“添加节点”渲染完整 catalog 并按 `素材 / 生成 / 剧情 / 空间` 分组；拖线松开仍渲染 LibTV 六项引用菜单。
  - 空白添加目录恢复 `全景节点` 和 `3D 导演工作台`；全景可见文案按用户反馈去掉 `LibTV / 2:1` 内部实现措辞，改成“生成或导入全景环境图，并在画布中预览空间关系”。
  - 全景节点默认属性接入 LibTV 反编译出的 slash 语义：`panoramaSlashScene=720_panoramic`、`panoramaWithPromptScene=720_panoramic_with_prompt`、`panoramaModelKey=lib-image-2`、`panoramaQuality=medium`、默认 `aspectRatio=2:1`、`projectionMode=equirectangular-2to1`。
  - `executePanoramaNode()` 执行时把上述全景默认值写入 provider 参数/结果 metadata，用户 prompt 继续走现有全景模板追加。
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/canvas/tests/LinghuiCanvasQuickCreate.test.tsx src/components/linghui/canvas/tests/linghuiCanvasQuickCreateCatalog.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts src/components/linghui/execution/tests/linghuiExecutionPanoramaNode.test.ts src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts`：5 files / 34 tests passed。
  - frontend `npx tsc --noEmit --project tsconfig.json`：passed。
  - root `npx tsc --noEmit --project tsconfig.json`：passed。
  - `git diff --check`：passed。
  - frontend `npm run build`：passed；保留既有 Vite dynamic import / chunk size warnings。
  - Electron CDP `127.0.0.1:9333` 验证：在灵绘画布空白处右键 `添加节点`，quickCreate 面板显示 `全景节点` 与 `3D 导演工作台`，无 `LibTV / 2:1 空间环境板 / 按 LibTV` 等内部文案；面板约 `304×420`。

### Phase 31: Nine Grid Storyboard Slash Generation
- **Status:** complete
- Actions taken:
  - 继续处理用户最新纠正：`剧情推演九宫格 / 多机位九宫格 / 16宫格 / 25宫格` 不是 `宫格切分`，而是基于用户图片和手动 prompt 的内置分镜生成能力；`宫格切分` 是另一条切图逻辑。
  - 深挖格式化 LibTV 打包文件：确认 `九宫格` 工具条取 `slashImage` command，点击后走 `submitSlashImageCommand(..., promptOverride: "/")`，不是直接本地 split；真正的 `宫格切分` 才是 `GridSplit` editor。
  - 新增 `LINGHUI_IMAGE_NINE_GRID_PRESETS`：`剧情推演九宫格 / 多机位九宫格 / 16宫格连贯分镜 / 25宫格连贯分镜`，每个 preset 都要求生成单张完整宫格分镜图、继承参考图主体/风格、结合用户 prompt，并避免文字/水印/编号。
  - `LinghuiImageNodeFloatingToolbar` 的 `九宫格` 子菜单改为调用 `onApplyImageToolPreset` 派生 image-to-image 节点并自动运行；不再调用 `openGridSplit()`，不会误入 `multi-angle` / `relight`。
  - `宫格切分` 子菜单继续写入 `2x2 / 3x3 / 4x4 / 5x5` 并打开 `grid-split`，保持已有选格裁剪流程。
  - 从 `重绘` 下拉菜单移除重复 `高清`；高清保留在 `更多 -> 高清`，避免同一功能出现两处入口。
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx src/components/linghui/editors/tests/ImageNodeEditor.test.tsx`：2 files / 22 tests passed。保留既有 Three.js duplicate warning 与 AntD shadow-root warning。
  - frontend `npx tsc --noEmit --project tsconfig.json`：passed。
  - root `npx tsc --noEmit --project tsconfig.json`：passed。
  - `git diff --check`：passed。
  - `npm run build`：passed；保留既有 Vite dynamic import / chunk size warnings。
  - Electron CDP `127.0.0.1:9333` 验证：页面无 dynamic import error / ErrorBoundary；进入灵绘画布后图片工具条 `487×36`；`更多 -> 九宫格` 子菜单显示 `剧情推演九宫格 / 多机位九宫格 / 16宫格连贯分镜 / 25宫格连贯分镜`；单独打开 `重绘` 菜单仅显示 `扩图 / 重绘 / 擦除 / 抠图 / 裁剪`，无重复 `高清`。为避免触发真实外部生图任务，Electron 只验证菜单和错误状态，点击生成链路由单元测试覆盖。

### Phase 30: Prompt & Generation Control LibTV Alignment
- **Status:** complete
- Actions taken:
  - 继续处理用户最新反馈：提示词输入区域、生图/生视频模型选择和参数弹层要参考 LibTV；图片比例/分辨率菜单去掉 `打光`，`焦距 / 镜头 / 光圈` 拆成独立菜单；打光、多角度编辑器和工具面板全部去掉积分/消耗。
  - 恢复 `task_plan.md` / `progress.md` / `findings.md`，运行 planning catchup，并确认当前工作树已有大量 Linghui 改动，后续只在相关文件上增量处理。
  - 用已格式化反编译文件 `/tmp/libtv-0gg5ir.beautified.js` 复查 `选择模型`、`视频参数`、多角度 Camera UI、积分 `credits/calculatePower` 等实现；结论已写入 `findings.md`。
  - `ImageNodeEditor` 拆分图片参数和镜头菜单：参数菜单只保留 `比例 / 分辨率 / 出图数量 / extraSettings`；`焦距 / 镜头` 与 `光圈 / 景深` 迁到独立 `镜头` Popover；参数摘要不再混入电影感/打光文案。
  - `renderLibTVToolFooter()` 删除 `⚡ count` 与 `.linghuiImageLibTVCost`，多角度、打光、扩图、重绘工具面板都不再渲染积分/消耗。
  - 图片/视频模型菜单改成 LibTV 式 `370px` 卡片列表：36px 图标卡、57px 行高、模型名 + 渠道/模型说明；视频参数与图片参数 Popover 收敛到约 `344px` HUD 尺寸。
  - 图片/视频提示词编辑区域高度从 `76/176px` 收敛到 `64/152px`，更接近 LibTV 输入区尺度。
- Validation:
  - `npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/VideoNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：3 files / 31 tests passed。保留既有 AntD shadow-root warning 与 Three.js duplicate warning。
  - frontend `npx tsc --noEmit --project tsconfig.json`：passed。
  - root `npx tsc --noEmit --project tsconfig.json`：passed。
  - `git diff --check`：passed。
  - `npm run lint:theme:scss`：failed only on existing `src/chat/components/ChatRenderer.module.scss:525-526` hardcoded color debts; no Linghui SCSS violation from this phase.
  - `npm run build`：passed；保留既有 Vite dynamic import / chunk size warnings。
  - Electron CDP `127.0.0.1:9333` 验证：图片参数菜单 `344×328` 且不含 `打光 / 焦距 / 光圈`；独立镜头菜单 `359×222` 且不含打光；模型菜单 `370×303`、首行 `352×57` 且无积分；视频参数菜单约 `343×300` 且无积分；页面无 dynamic import error / ErrorBoundary。

### Phase 29: Image Toolbar Menu Routing Fix
- **Status:** complete
- Actions taken:
  - 继续处理用户反馈：`宫格切分 / 九宫格` 下拉被工具条自身挡住、菜单项换行、宫格入口误触 `多角度 / 打光`、部分无功能入口暴露。
  - `LinghuiImageNodeFloatingToolbar` 的所有 AntD Dropdown 改为挂到 `document.body`，并给主菜单/子菜单统一 `linghuiImageToolbarDropdown` popup class、submenu offset 和 `nowrap` 菜单内容样式，避免被 `.isStatic` 工具条高度裁剪。
  - `九宫格` 菜单改为 `剧情推演四宫格 -> 2x2`、`多机位九宫格 -> 3x3`、`16宫格连贯分镜 -> 4x4`、`25宫格连贯分镜 -> 5x5`，全部进入 `grid-split`，不再调用 `multi-angle` 或 `relight`。
  - `宫格切分` 菜单项现在先写入 `gridSplitType`、清空已选格子，再打开 `grid-split` 工具；静态 `更多` 菜单移除无执行链路的旋转入口，导入素材节点继续隐藏无效的 `聚焦 / 标记`。
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：1 file / 9 tests passed。
  - frontend `npx tsc --noEmit --project tsconfig.json`：passed。
  - root `npx tsc --noEmit --project tsconfig.json`：passed。
  - `git diff --check`：passed。
  - Electron CDP `127.0.0.1:9333` 验证：点击图片节点后工具条约 `487×36`；`更多` 主菜单和 `九宫格` 子菜单均挂在 `BODY`，z-index `10020`，菜单项 `white-space: nowrap`；点击 `九宫格 -> 多机位九宫格` 后显示 `宫格 9格 / 创建生图节点`，无多角度/打光面板；点击 `更多 -> 宫格切分 -> 16 宫格` 后显示 `宫格 16格` 和 16 个网格编号；页面无 `Failed to fetch dynamically imported module` / TypeError / ErrorBoundary 文本。
- Notes:
  - Vitest 仍输出 AntD shadow-root warning；这是测试环境中 popup 挂到 `document.body` 的已知提示，Electron 实测行为正常。

### Phase 28: HUD Scale & Preview Fidelity Fix
- **Status:** complete
- Actions taken:
  - 根据用户复查反馈继续缩小图片点击菜单、下拉菜单和复杂工具面板：静态图片工具条从铺开所有功能改为 `全景 / 多角度 / 打光 / 重绘 / 更多 / 下载 / 全屏`，九宫格、高清、宫格切分、聚焦、标记等收进 `更多`；真实 Electron 尺寸为 `487×36`。
  - 面板继续收窄：打光面板从约 700px 级别压到约 640px；多角度面板从 600px 级别压到约 560px；下拉菜单项保持 30px HUD 密度。
  - 保留用户点名的 `.linghuiImageLibTVPreviewStage.isLightingSphere` 类名语义，并把其中内容固定为 Three.js/WebGL 光球 canvas；参考图缩成小卡，中心增加真实受光圆球、网格和光源 cone，不再可能落回静态 `<img>` 预览。
  - 多角度左侧舞台增加 `.isMultiAngleScene`，保持 Three.js canvas；object 模式也显示球面网格，参考图卡加 3D 边框，camera/object 模式都增加 4 个方向按钮，避免只像一张图片。
  - 清理本轮触碰的 Linghui SCSS 中硬编码颜色，改用主题 token；全局 stylelint 剩余失败只来自既有 `ChatRenderer.module.scss` 硬编码颜色。
- Validation:
  - `npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：2 files / 17 tests passed。
  - frontend `npx tsc --noEmit --project tsconfig.json`：passed。
  - root `npx tsc --noEmit --project tsconfig.json`：passed。
  - `git diff --check`：passed。
  - `npm run lint:theme:scss`：仍 failed，仅剩既有 `src/chat/components/ChatRenderer.module.scss:525-526` 硬编码颜色；本轮 Linghui 文件不再报错。
  - `npm run build`：passed；保留既有 Vite dynamic import / chunk size warnings。
  - Electron CDP `127.0.0.1:9333` 验证：静态点击菜单 `487×36`；打光面板约 `634×337`，`stageClass="linghuiImageLibTVPreviewStage isLightingSphere linghuiImageLibTVLightingStage"`，canvas `188×188` CSS / `376×376` buffer，像素非空（opaque=1024 / bright=223），stage 内 DOM 图片数为 0；多角度面板约 `554×350`，WebGL canvas 非空（opaque=1024 / bright=71），方向按钮数 4，stage 内 DOM 图片数为 0，无 ErrorBoundary/TypeError 文本。截图：`/tmp/linghui-libtv-compact-relight.png`、`/tmp/linghui-libtv-compact-multi-angle.png`。
- Errors:
  - 首次 Electron CDP 量测脚本混用 `require()` 和 top-level await，被 Node 判定为 ambiguous module syntax；已改用 `node --input-type=module` + ESM `import` 后完成量测。

### Phase 27: LibTV Image Tool Fidelity Pass
- **Status:** complete
- Actions taken:
  - 恢复上下文后重新读取 `task_plan.md` / `progress.md` / `findings.md`，并运行 planning catchup。
  - catchup 发现 `template_/docs` 已从 10 份增至 11 份，新增 `libtv-panorama-wasm-alternatives.md`；已读取该文档并确认用户现在要求全景切换到 Three.js GPU 路径。
  - 使用 `js-beautify` 格式化后的 `/tmp/libtv-0gg5ir.beautified.js` 继续定位 LibTV 真实实现：
    - 打光：`ug` 预设、`uy` 控制面板、`uL` WebGL 光球 renderer、`uD` React wrapper、`uP` 智能 prompt/参考图/预设、`uj` 总编辑器。
    - 多角度：`pV` camera sliders、`pK` object sliders、`p6` unified scene、`p8` 预设、`p9` 总编辑器。
  - 将 Phase 27 写入 `task_plan.md`，明确全景 NEW 不能再误触多角度，打光必须是真 canvas/Three.js 光球，多角度/打光必须使用 LibTV 原始字段。
  - 扩展 `LinghuiMultiAngleConfig` 与 TTI 请求类型：保留旧 `azimuth/elevation/distance` 兼容，同时写入 LibTV `mode/rotation/tilt/scale/isWideAngle/presetKey/promptEnabled`。
  - 新增 `LinghuiImageRelightConfig`，把打光从 prompt-only preset 升级为 `direction/brightness/lightColor/rimLight/smartMode/prompt/referenceImage` 结构化状态。
  - 重写 `ImageNodeEditor` 多角度面板：使用 LibTV 7 个 preset、Object/Camera 模式、rotation/tilt/scale 滑条、广角开关和可选 prompt；左侧换成 Three.js/r3f 3D 视口。
  - 重写 `ImageNodeEditor` 打光面板：使用 LibTV 8 个 preset、独立智能模式/轮廓光、亮度/颜色/方向控制；左侧新增 Three.js 光球预览，不再是静态图片。
  - 将图片工具条 `全景 NEW` 接到 `onCreatePanoramaPreview`，普通图片会创建/打开全景预览节点，不再触发 `multi-angle`。
  - 新增 `panoramaGpuExtractor.ts`，全景 6/8 方向透视抽取优先走 Three.js WebGLRenderer `high-performance`，失败时回退 Canvas2D。
  - 按用户反馈把图片工具条/下拉/面板缩回 HUD 尺寸：工具条按钮 32px、下拉菜单 34px、打光面板约 900px、多角度面板约 760px。
- Next:
  - 继续 Phase 23：补齐擦除遮罩、裁剪方向、抠图加载反馈等剩余高频图片工具悬浮面板。
- Validation:
  - `npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：2 files / 17 tests passed。
  - `npm run test -- --run src/services/promptCompilation/multiAnglePromptCompiler.test.ts src/components/linghui/execution/tests/linghuiExecutionProviders.test.ts src/providers/tti/OpenAICompatibleTTIProvider.test.ts`：3 files / 21 tests passed。
  - frontend `npx tsc --noEmit --project tsconfig.json`：passed。
  - root `npx tsc --noEmit --project tsconfig.json`：passed。
  - frontend `npm run build`：passed；仅保留既有 Vite dynamic import / chunk size warnings。
  - `git diff --check`：passed。
  - Electron CDP `127.0.0.1:9333` 验证：进入灵绘画布后选中图片节点，工具条按钮为 32px、面板无 ErrorBoundary；打光面板 `894×354`，光球 WebGL canvas 非空（opaque=1024 / bright=233）；多角度面板 `754×398`，3D canvas 非空（opaque=1024 / bright=100）。截图：`/tmp/linghui-libtv-fidelity-multi-angle.png`。
- Errors:
  - 首轮 frontend tsc 发现旧 `LinghuiMultiAngleModal` 仍传 `azimuth/elevation/distance` 给新 3D viewport；已改为 `rotation/tilt/scale/isWideAngle` 并做旧字段映射。
  - 首轮 Electron WebGL pixel check 发现 `toDataURL` 读到透明缓冲；已给打光/多角度 r3f canvas 开 `preserveDrawingBuffer` 和非透明背景。

### Phase 22: LibTV Image Tool Panel Rework
- **Status:** complete
- Actions taken:
  - 用户指出当前 `扩图 / 打光 / 重绘` 面板像右侧参数表单，复杂且偏离 LibTV；本阶段改为重新参考 LibTV 截图和打包产物，重做图片节点工具悬浮交互。
  - 目标交互：顶部图片工具条按 LibTV 分组，九宫格/重绘/高清/宫格切分使用小型下拉菜单；多角度/打光等复杂工具打开画布下方大块悬浮编辑器，而不是右侧抽屉。
  - `LinghuiImageNodeFloatingToolbar` 收敛为 LibTV 风格分组工具条：`全景 NEW / 多角度 / 打光 / 九宫格 ▼ / 高清 ▼ / 宫格切分 ▼ / 重绘 ▼ / 聚焦 / 标记 / 旋转 / 下载 / 全屏`，其中 `重绘 ▼` 聚合 `高清 / 扩图 / 重绘 / 擦除 / 抠图 / 裁剪`。
  - `ImageNodeEditor` 去掉右侧 portal 抽屉式面板，改为在节点编辑浮层内渲染下方大面板：`多角度编辑器 / 打光效果 / 扩图 / 重绘`。
  - `LinghuiNodeEditor` 的图片常规态顶栏隐藏节点标题和关闭按钮，仅显示工具条；当复杂图片工具打开时放大下方面板宽度。
  - 清理 `LinghuiNodeEditor` 中不再使用的旧图片工具 preset 表和旧二级菜单逻辑，避免双套入口继续漂移。
  - 更新测试：`扩图 / 重绘` 断言改为先点 `重绘 ▼`，再选菜单项打开对应可视化面板。
- Validation:
  - `npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：2 files / 14 tests passed。
  - frontend `npx tsc --noEmit --project tsconfig.json`：passed。
  - root `npx tsc --noEmit --project tsconfig.json`：passed。
  - `git diff --check`：passed。
  - Electron CDP `127.0.0.1:9333` 验证：当前页面为 `Koma - 漫剧创作工具`；图片节点工具条在选中节点上方，`九宫格/高清/重绘` 下拉可打开；`打光/扩图/重绘` 大面板在节点下方展开，`panelInsideEditor=true`，无 ErrorBoundary/TypeError 文本。截图保存到 `/tmp/linghui-libtv-image-tool-panel-rework.png`。
- Errors:
  - 首轮 `LinghuiNodeEditor.test.tsx` 仍按旧直达按钮查找 `扩图 / 重绘`；已改为按 LibTV 分组菜单路径点击。
  - `重绘` 菜单项和顶层触发按钮重名导致测试 query 命中多个元素；已改为按 `menuitem` role 查找菜单项。

### Phase 18: Template Docs Review & Queue
- **Status:** complete
- Actions taken:
  - 按用户要求完整阅读 `template_/docs` 下 10 份 Markdown 文档，并确认 `.DS_Store` 不是文档内容。
  - 将文档结论归纳进 `findings.md`：下一阶段优先从图片工具可视化面板开始，其后再做画布交互、文本/脚本节点、视频合成 MVP。
  - 更新 `task_plan.md` 顶部阶段表，新增 Phase 18-25，作为后续逐项实现队列。

### Phase 19: Image Relight Visual Panel
- **Status:** complete
- Actions taken:
  - `ImageNodeEditor` 新增 `relight` 独立悬浮面板，包含图片预览、打光风格 preset、比例/分辨率按钮和 `生成打光节点`。
  - `LinghuiImageNodeFloatingToolbar` 的 `打光` 入口改为打开面板；其它 preset 工具保持原二级菜单行为。
  - `LinghuiNodeEditor` 将 `onApplyImageToolPreset` 传给图片编辑器，面板提交后复用既有派生节点 + 自动运行链路。
  - 补 `ImageNodeEditor` / `LinghuiNodeEditor` 回归测试覆盖面板提交与工具条入口。
- Validation:
  - `npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：2 files / 10 tests passed。
  - frontend `npx tsc --noEmit --project tsconfig.json`：passed。
  - root `npx tsc --noEmit --project tsconfig.json`：passed。
  - `git diff --check`：passed。

### Phase 20: Image Repaint Visual Panel
- **Status:** complete
- Actions taken:
  - `ImageNodeEditor` 新增 `repaint` 独立悬浮面板，包含图片预览、重绘 preset、描述 textarea、比例/分辨率/数量按钮和 `生成重绘节点`。
  - `LinghuiImageNodeFloatingToolbar` 的 `重绘` 入口改为打开面板；扩图/擦除/抠图/裁剪等其它工具暂时保持二级菜单。
  - 补测试覆盖 `重绘` 工具条入口和描述合并后的 `onApplyImageToolPreset` 调用。
- Validation:
  - `npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：2 files / 12 tests passed。
  - frontend/root `npx tsc --noEmit --project tsconfig.json`：passed。
  - `git diff --check`：passed。

### Phase 21: Image Outpaint Visual Panel
- **Status:** complete
- Actions taken:
  - `ImageNodeEditor` 新增 `outpaint` 独立悬浮面板，包含扩展画幅预览、扩图 preset、比例/分辨率/数量和 `生成扩图节点`。
  - `LinghuiImageNodeFloatingToolbar` 的 `扩图` 入口改为打开面板；测试从旧 dropdown 断言迁移为面板入口断言。
  - 面板提交继续走 `onApplyImageToolPreset`，生成独立 image-to-image 派生节点并自动运行。
  - 按用户反馈将 `扩图 / 打光 / 重绘` 面板改为 `ReactDOM.createPortal(..., document.body)` 渲染的右侧悬浮层，测试断言它不在 `.linghuiEditorPanel` 内。
- Validation:
  - `npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：2 files / 13 tests passed。
  - frontend/root `npx tsc --noEmit --project tsconfig.json`：passed。
  - `git diff --check`：passed。
  - Electron CDP `127.0.0.1:9333` 验证：进入灵绘画布，点击真实图片节点工具条的 `扩图 / 打光 / 重绘`，确认三个面板都挂在 `document.body` 下，`dialogInsideEditor=false`，`.linghuiEditorPanel .linghuiImageToolPanel` 不存在，且未触发 ErrorBoundary。截图保存到 `/tmp/linghui-floating-image-tool-panel.png`。

### Phase 11: Binary Media Clipboard & Feedback
- **Status:** complete
- Actions taken:
  - 恢复会话后重读 `task_plan.md` / `findings.md` / `progress.md`，确认 Phase 10 已完成下游推荐、节点菜单扩展和 Electron CDP 验证。
  - 继续从 LibTV 打包产物抽取节点菜单文案，确认 `复制图片` 在 LibTV 中会通过 `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])` 写入图片本体，而灵绘当前只复制媒体地址。
  - 决定新增独立二进制图片复制动作：保留 `复制图片地址/视频地址/TaskId` 现有行为，同时在有主图时额外显示 `复制图片`，更贴近 LibTV 操作反馈。
  - 节点上下文菜单已接入 `复制图片`，支持远程/blob/data URL 和本地/koma-local 图片源；非 PNG 会经 canvas 转 PNG 后写入系统剪贴板。
  - `创建副本` 改为包含外部上游输入边但不继承下游边，匹配 LibTV `副本不继承生成任务，支持复制上游连线，下游需用户手动连接` 的行为。
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/LinghuiCanvasContextMenu.test.tsx src/components/linghui/canvas/tests/linghuiCanvasResultActions.test.ts src/components/linghui/canvas/tests/linghuiCanvasQuickCreateCatalog.test.ts`：3 files / 13 tests passed。
  - `npm run test -- --run src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/components/linghui/canvas/tests/LinghuiCanvasContextMenu.test.tsx src/components/linghui/canvas/tests/linghuiCanvasQuickCreateCatalog.test.ts`：3 files / 21 tests passed。
  - frontend `npx tsc --noEmit --project tsconfig.json`：passed。

### Phase 12: Image Focus Region Tool
- **Status:** complete
- Actions taken:
  - 继续扫描 LibTV 打包产物，确认图片生成提交前存在 `focusRegion` / `camera_focus` / `聚焦图片处理失败` 链路，核心是把用户局部标记作为 image-to-image 聚焦输入。
  - `LinghuiImageToolKey` 新增 `focus`，图片/全景节点默认属性增加 `focusRegion: null`，并新增 `normalizeLinghuiImageFocusRegion()` 保证旧工作区兼容。
  - 图片节点顶部工具条新增 `聚焦`；图片编辑器在有当前图片时显示聚焦面板，包含红框预览、中心/脸部/上半身/全图预设、横向/纵向/宽度/高度滑条、`标记区域` / `清除聚焦` 操作。
  - 图片节点缩略图增加 LibTV 式红框遮罩和 `聚焦` 徽标，用户关闭编辑器后仍能看到当前局部处理范围。
  - `executeImageNode()` 读取启用的 `focusRegion`：把标记时的图片源加入参考图，把 prompt 增强为局部补全/重绘约束，并在结果 metadata 中记录 focusRegion。
  - 聚焦执行的占位反馈改为 `聚焦区域生成`，避免仍显示普通 prompt，看不出当前是局部操作。
- Validation:
  - `npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts src/components/linghui/canvas/tests/linghuiCanvasStore.test.ts`：4 files / 25 tests passed。
- Errors:
  - 首轮聚焦执行测试发现 `placeholderSubtitle` 仍是用户 prompt；已改为聚焦时固定显示 `聚焦区域生成` 并复跑通过。

### Phase 13: Image Mark Points Tool
- **Status:** complete
- Actions taken:
  - 继续从 LibTV 打包产物定位图片工具链，确认 `标记` 会在图上记录点位，并通过后端 `clickSuggest` / magic token 机制把点选意图注入 prompt。
  - 在灵绘中新增本地等价实现：`LinghuiImageToolKey` 支持 `mark`，图片/全景节点默认 `markPoints: []`，并新增标记点归一化与上限保护。
  - 图片工具条新增 `标记`；图片编辑器标记面板支持点击图片舞台添加归一化点位、显示黄色编号点、坐标列表、删除单点和清空。
  - 图片节点缩略图同步显示黄色编号点，让用户关闭编辑器后仍能看出节点携带点选上下文。
  - `executeImageNode()` 会把标记时的图片源加入参考图，并把 `LibTV-style mark points` 坐标块追加到 prompt，同时在结果 metadata 记录 markPoints。
- Validation:
  - `npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：3 files / 21 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。

### Phase 14: Image High-Res Upscale Tool
- **Status:** complete
- Actions taken:
  - 继续参考 LibTV 打包产物中 `imagetool_upscale` / `高清放大` / `select_upscale_factor` / `upscale_tile_hdr` 相关文案，确认高清放大需要是真实图片处理入口，而不是普通 prompt preset。
  - Electron FFmpeg 服务新增 `upscaleImage` 任务类型：通过 IPC bridge 暴露到前端，使用 lanczos scale 和轻锐化输出 PNG。
  - 前端 `ffmpegManager` 新增 `upscaleImage()`；图片工具条新增 `高清` 下拉，支持 `2x 高清放大` 和 `4x 高清放大`。
  - 画布 overlay 执行链路新增 `executeImageUpscale(nodeId, { factor })`：解析当前图片、本地物化远程/数据源、写入工作区 `assets/upscaled-images`，再派生新的图片节点并给出成功/失败反馈。
  - 修复高清执行早期通过 `activeNodeTool` 读取 nodeId 的竞态，改为从菜单直接传入 `nodeId`，确保点击后立即能执行到当前图片节点。
- Validation:
  - `npm run test -- --run src/services/ffmpegManager.test.ts src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：5 files / 24 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
  - Electron CDP 视觉验证：`127.0.0.1:9333` 在线；进入灵绘画布后创建图片节点并注入临时图片源，确认图片工具条真实显示 `聚焦 / 标记 / 高清 / 多角度 / 扩图 / 打光 / 重绘 / 宫格`。AntD portal 下拉点击在 CDP 缩放命中上不稳定，菜单行为由单元测试覆盖。

### Phase 15: Image Tool Derivation Flow
- **Status:** complete
- Actions taken:
  - 将 `扩图 / 打光 / 重绘` preset 的编辑器点击载荷扩展为 `{ label, promptSnippet, properties }`，保留工具文案和参数。
  - 新增 `createDerivedImageToolNodeFromNode()`：从当前图片/全景节点右下方派生新的 `linghui/image` 生成节点，自动连接 image→image 语义边，继承模型/比例等必要参数并清空 source/items/run 结果。
  - `applyImageToolPreset()` 不再直接修改当前节点 prompt，而是合并 prompt snippet 后创建独立工具节点并自动触发运行，成功提示改为 `已创建「...」工具节点并开始执行`。
  - 修复主画布漏传 `createDerivedImageToolNodeFromNode` 的接线问题，避免编辑器按钮有事件但 overlay 无法创建节点。
  - 新增 `useLinghuiCanvasDocumentOps.test.tsx`，覆盖工具节点创建后源节点取消选中、新节点选中、边数据类型记录、focus/mark 清空和 snapshot 调度。
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`：2 files / 3 tests passed。
  - `npm run test -- --run src/services/ffmpegManager.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：6 files / 26 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
- Errors:
  - 首轮 frontend tsc 发现 `LinghuiCanvas.tsx` 没有把新增文档操作函数传进 overlay props；已补解构和传参。

### Phase 16: Extended Image Tool Entrypoints
- **Status:** complete
- Actions taken:
  - 继续扫描 LibTV 打包产物，确认图片工具栏还包含 `擦除 / 抠图 / 裁剪 / Mockup / 编辑元素 / 编辑文本`，且 `擦除` 有 `智能擦除 / 框选擦除` 两种入口。
  - 扩展 `LinghuiImageToolKey` 与图片工具条，新增 `擦除 / 抠图 / 裁剪 / Mockup / 元素 / 文字` 六个入口。
  - 为新增工具补 LibTV 式预设：`智能擦除 / 框选擦除`、`主体抠图 / 商品白底`、`方图裁剪 / 竖版裁剪 / 横版裁剪`、`海报样机 / 产品展示`、`替换元素 / 添加道具`、`去除文字 / 留出版面`。
  - 除裁剪外，其余工具复用 Phase 15 的派生图生图节点协议：创建独立下游节点、写入工具 prompt 和参数、自动连线并运行。
  - 裁剪升级为真实本地处理：新增 Electron `cropImage` FFmpeg bridge/service/controller/preload 和前端 `ffmpegManager.cropImage()`，以中心 cover crop 输出 1:1 / 9:16 / 16:9 PNG，再派生图片节点。
  - 工具条样式增加最大宽度、换行和滚动保护，避免扩展入口撑破节点编辑器顶部条。
- Validation:
  - `npm run test -- --run src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx src/services/ffmpegManager.test.ts`：2 files / 7 tests passed。
  - `npm run test -- --run src/services/ffmpegManager.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：6 files / 29 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
- Errors:
  - 首轮扩展工具测试用 `/文字/` 匹配 AntD 按钮名失败；AntD 会把两个中文字符拆为 `文 字`，已改成 `/文\s*字/`。

### Phase 17: Electron Visual Pass & Next Gaps
- **Status:** in_progress
- Actions taken:
  - 准备通过 Electron CDP 复查扩展后的真实工具条和本地裁剪入口，不打开普通浏览器。

### Phase 1: Artifact Recon
- **Status:** complete
- Actions taken:
  - 使用 `pi-planning-with-files` 技能建立本轮复杂任务记录。
  - 运行 session catchup；脚本无输出。
  - 读取现有 `task_plan.md` / `findings.md` / `progress.md` / `AGENTS.md`，确认 Electron CDP 验证规约和当前历史上下文。
  - 确认当前工作区起步 `git status --short` 无输出。
  - 盘点 `template_/libtv` 文件结构，确认是扁平 Turbopack 打包产物。
  - 通过 React Flow/xyflow、canvas/node/edge、中文操作文案等关键词扫描，初步定位 LibTV 画布控制条、自动布局、离群节点、触控模式、生成按钮和节点类型相关模块。
  - 提取打包 JS 中的中文字符串和 canvas 相关符号，确认主画布 chunk、状态 chunk、ReactFlow 基础 chunk 的分工。
  - 读取灵绘 `LinghuiCanvasStage`、`LinghuiCanvasHud`、`LinghuiCanvasContextMenu`、`LinghuiCanvasOverlays`、`LinghuiCanvas`、viewport/hotkey hooks 和画布 Sass，确认可复刻落点集中在 HUD/右键菜单/ReactFlow 配置/样式层。
  - 首次 Node 字符串提取脚本因命令文本控制字符被执行器拒绝；已换成朴素脚本成功提取。
  - 用户中途补充必须覆盖完整功能和允许新增依赖；已扩大范围到依赖、自动布局、节点类型入口、操作反馈、性能优化和节点菜单。
  - 查询 npm：`elkjs` 当前 `0.11.1` 且自带类型；`framer-motion` 当前 `12.38.0`。当前计划只新增实际要用的 `elkjs`。

### Phases 2-4: Linghui Canvas Map, Gap Matrix, First Recreation Pass
- **Status:** complete
- Actions taken:
  - 新增依赖 `elkjs@0.11.1`，并写入 `frontend/package.json` / `frontend/package-lock.json`。
  - 新增 `linghuiCanvasLayout.ts`，实现 ELK layered RIGHT 自动布局、24px 网格吸附、顶层节点尺寸推断、工作流块折叠连边、离群节点检测。
  - `LinghuiCanvasStage` 调整 React Flow 配置：`connectionRadius` 提升到 80，开启 `onlyRenderVisibleElements`，接入 snap grid、可折叠 MiniMap、Space 临时平移。
  - `LinghuiCanvasHud` 复刻 LibTV 画布控制：运行按钮、整理画布、小地图、网格吸附、手/鼠标模式、缩放菜单、适合屏幕、快捷键面板、离群节点提醒和整理结果保留/还原。
  - `useLinghuiCanvasHotkeys` 增加运行、缩放、fit、整理、快速创建和快捷键面板热键。
  - 右键菜单和 overlay props 接入 `优化工作流布局`、快捷键入口、快捷键标注和节点/空白上下文整理入口。
  - 节点库、快速创建、右键添加节点分类重组为素材/生成/分镜/空间四组。
  - Sass 补齐新 HUD 控制条、缩放下拉、整理审阅、离群提示、快捷键面板、小地图位置、菜单快捷键和节点状态光晕样式。

### Phase 5: Regression Coverage
- **Status:** complete
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasHotkeys.test.tsx src/components/linghui/canvas/tests/linghuiCanvasLayout.test.ts src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasFlowBridge.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：5 files / 23 tests passed。
  - `npm run test -- --run src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasFlowBridge.test.ts src/components/linghui/canvas/tests/linghuiCanvasLayout.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts src/components/linghui/nodes/tests/VideoNode.test.tsx`：5 files / 24 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
  - `npm run build`（frontend）：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `npm run check:style-discipline`：failed on existing Director3D/settings/storyboard/theme hardcoded style debts; current canvas/node files did not appear in the failure list.

### Phase 6: Electron Visual Verification
- **Status:** complete
- Actions taken:
  - `127.0.0.1:9333` 初始未监听，按项目规约启动 `npm run dev`，未打开普通浏览器。
  - 通过 Electron CDP `/json/list` 连接 `Koma - 漫剧创作工具` page target，进入灵绘工作台。
  - 验证画布根节点、新控制条、吸附状态、可见节点数和缩放菜单存在。
  - 点击并验证快捷键面板四组文案、小地图开关、整理画布审阅 `是否保留此次整理结果？`、`还原/保留`，并点击 `还原` 避免保留测试布局。
  - 触发画布右键菜单，确认素材/生成/分镜/空间分类、`优化工作流布局`、粘贴/撤销/重做快捷键标注和快捷键入口。
  - 触发 Tab 快速创建，确认四组节点类型入口完整展示。
  - 视觉截图保存到 `/tmp/linghui-canvas-libtv-recreation.png`；验证结束后关闭快捷键面板/小地图，并停止 Electron dev app。

### Phase 8: Result Context Actions
- **Status:** complete
- Actions taken:
  - 新增 `linghuiCanvasResultActions.ts`，统一解析节点执行结果的可复制文本、媒体地址和 TaskId。
  - 节点右键菜单接入 `复制结果文本`、`复制图片/视频/音频地址`、`复制 TaskId`，无可复制内容时保持禁用反馈。
  - `useLinghuiCanvasOverlayProps` 增加系统剪贴板写入和 AntD 成功/失败提示，保留 Electron/DOM fallback。
  - 新增 `linghuiCanvasResultActions.test.ts` 覆盖文本结果、媒体 remoteUrl 优先、TaskId 和 storyboard 文本兜底。
- Fixes during validation:
  - 首次结果复制测试发现菜单标签按原始媒体条目计数，图片集合 primary/items 去重后数量不一致；已改为按去重复制源计数。
  - 首次 frontend tsc 发现 storyboard `shot.image` predicate 收窄过宽；已改为按自身 non-null 类型收窄。

### Phase 9: Touch Canvas Gestures
- **Status:** complete
- Actions taken:
  - 新增 `useLinghuiCanvasTouchMode`，按 `(pointer: coarse)` 检测触控设备。
  - `LinghuiCanvasStage` 在触控模式下禁用节点拖拽/连线，关闭框选拖拽，空白区域直接平移，保留 pinch zoom。
  - 新增 `useLinghuiCanvasDoubleTapFitView`，监听 `.react-flow__pane` 的触控双击并触发 `fitView`。
  - 新增 `useLinghuiCanvasDoubleTapFitView.test.ts` 和 `useLinghuiCanvasTouchMode.test.ts` 覆盖双击阈值与粗指针检测。
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/linghuiCanvasResultActions.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasDoubleTapFitView.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasTouchMode.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasHotkeys.test.tsx src/components/linghui/canvas/tests/linghuiCanvasLayout.test.ts src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts`：6 files / 21 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
  - `npm run build`（frontend）：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `npm run check:style-discipline`：仍失败于既有 Director3D/settings/storyboard/theme 等 inline style / hardcoded color 债；本轮新增 canvas result/touch/double-tap 文件未出现在失败列表中。
  - Electron CDP `127.0.0.1:9333` 验证：启动 `npm run dev`，进入灵绘画布，右键文本节点确认菜单包含 `复制结果文本 / 复制媒体地址 / 复制 TaskId`，当前无媒体/TaskId 时后两项禁用；截图保存到 `/tmp/linghui-canvas-result-context-menu.png`。验证后已停止 dev app，`9333`/`5173` 端口不再监听。

### Phase 10: Downstream Compatibility & Menus
- **Status:** complete
- Actions taken:
  - 恢复会话并重读 `task_plan.md` / `findings.md` / `progress.md`，确认前面已完成 HUD、ELK、结果复制和触控手势。
  - 复查 `linghuiNodeDefs.ts`、`linghuiCanvasShared.ts`、`useLinghuiCanvasOverlayState.ts`、`LinghuiCanvasQuickCreate.tsx`、`LinghuiCanvasContextMenu.tsx` 和执行层输入过滤，确认当前快速创建只判断“目标有输入”而没有看源输出类型。
  - 重新检索 LibTV 打包文案，确认下一组需要补齐的能力集中在 `文生视频 / 图生视频 / 参考生视频 / 首尾帧视频` 的下游路径，以及 `保存到我的素材 / 进入全景预览 / 创建主体 / 展开或删除多媒体集合` 类节点菜单。
  - 新增语义槽位兼容判断：物理端口仍保持 `input-0` / `output-0`，但连接校验、快速创建筛选和新建 edge.data 会记录 `sourceSlotType` / `targetSlotType`。
  - 新增 `linghuiCanvasQuickCreateCatalog.ts`，按来源输出类型推荐下游：图片输出优先 `图生视频 / 全能参考 / 首尾帧视频`，文本输出优先 `图片生成器 / 文生视频 / 音频生成器 / 脚本生成器`，音频/视频/分镜输出也有对应下游。
  - 快速创建项现在可携带 `initialProperties` 和 `nodeLabel`；创建 `文生视频 / 图生视频 / 首尾帧视频` 会直接写入对应 `videoCapability`。
  - 右键节点菜单补齐 LibTV 式文案和集合操作：`保存到我的素材`、`展开所有图片`、`删除其他图片`、`展开所有视频`、`删除其他视频`。
  - 新增视频展开能力：多视频结果可派生为多个独立 video 节点；删除其他视频会保留当前主视频为节点素材并清理旧 run state。
  - 空白画布右键添加节点改为 LibTV 式创建预设目录，新增 `LINGHUI_CANVAS_CREATE_MENU_CATALOG`，可直接创建图片/视频/音频参考、文本生成器、文生视频、图生视频、全能参考、首尾帧视频、脚本生成器、全景预览和 3D 导演节点。
  - 空白 Tab 快速创建也切到同一套 LibTV 式创建预设目录，避免和右键空白菜单出现两套节点入口。
  - 右键菜单节点操作补齐 `进入全景预览` 和 `创建主体`；全景预览会派生 panorama 节点并导入当前主图，创建主体会把当前图片引用保存为灵绘全局 character 资产。
  - 视频节点右键补齐 LibTV 文案 `分离内嵌音轨为独立音频节点`：本地视频经 FFmpeg 分离音频后，自动派生音频节点并建立语义边。
  - Electron CDP 首轮检查发现视频右键菜单只看 run result，会漏掉导入视频属性；已把 `linghui/video` 的 `properties.source/posterSource` 纳入右键媒体集合。
  - Electron CDP 点击分离音轨时发现 FFmpeg `getMediaInfo` 可能返回空值；已加空值防御，并让分离音轨按钮仅在本地视频源可处理时展示。
  - 音轨防御修复后复跑：`LinghuiCanvasContextMenu` / `linghuiCanvasQuickCreateCatalog` / `linghuiCanvasShared` 3 files / 18 tests passed，frontend/root tsc passed，`git diff --check` passed。
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/LinghuiCanvasContextMenu.test.tsx src/components/linghui/canvas/tests/linghuiCanvasQuickCreateCatalog.test.ts src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：4 files / 23 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npm run test -- --run src/components/linghui/canvas/tests/LinghuiCanvasContextMenu.test.tsx src/components/linghui/canvas/tests/linghuiCanvasQuickCreateCatalog.test.ts`：2 files / 8 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npm run test -- --run src/components/linghui/canvas/tests/LinghuiCanvasContextMenu.test.tsx src/components/linghui/canvas/tests/linghuiCanvasQuickCreateCatalog.test.ts src/components/linghui/canvas/tests/linghuiCanvasResultActions.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasDoubleTapFitView.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasTouchMode.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasHotkeys.test.tsx src/components/linghui/canvas/tests/linghuiCanvasLayout.test.ts src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：9 files / 37 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
  - `npm run build`（frontend）：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `npm run check:style-discipline`：仍失败于既有 Director3D / settings / storyboard / theme / chat inline style 与硬编码色债；新增 canvas/menu/quick-create 文件未进入失败列表。
  - 修复视频属性媒体集合后复跑：`npm run test -- --run src/components/linghui/canvas/tests/LinghuiCanvasContextMenu.test.tsx src/components/linghui/canvas/tests/linghuiCanvasQuickCreateCatalog.test.ts src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/components/linghui/canvas/tests/linghuiCanvasResultActions.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：5 files / 29 tests passed。
  - 修复视频属性媒体集合后复跑：frontend/root `npx tsc --noEmit` passed，`npm run build` passed，`git diff --check` passed。
  - 音轨防御修复后复跑：`LinghuiCanvasContextMenu` / `linghuiCanvasQuickCreateCatalog` / `linghuiCanvasShared` 3 files / 18 tests passed，frontend/root tsc passed，`git diff --check` passed。
  - Electron CDP `127.0.0.1:9333` 验证：空白 Tab 快速创建显示 LibTV 式预设目录，包含 `文生视频 / 图生视频 / 全能参考 / 首尾帧视频 / 进入全景预览`；视频节点右键曾确认出现 `分离内嵌音轨为独立音频节点`，随后修复 getInfo 空值防御；最终 reload 后未再出现 `Cannot read properties of undefined` 文本。
- Errors:
  - 首轮新增测试把 `video -> image-generator` 当作不兼容，但本轮设计明确允许视频带首帧/封面进入图片参考槽；已改用真正不兼容的 `audio -> image-generator`。
  - 首轮 frontend tsc 缺少 `LinghuiVideoNodeProperties` 类型导入；补齐后通过。

## Session: 2026-05-14 Linghui Media Remote URL Flow

### Phase 1: Data Flow Recovery
- **Status:** complete
- Actions taken:
  - 使用 `pi-planning-with-files` 技能记录本轮复杂修复。
  - 读取现有计划/发现/进度文件，确认上一轮上传去重已完成但本轮需要修复更上游的结构化媒体流转问题。
  - 确认当前工作区已有多处未提交改动，本轮只做灵绘媒体上传复用相关的局部修改。

### Phases 2-4: Structured Asset Flow and Tests
- **Status:** complete
- Actions taken:
  - 新增 `linghuiMediaAssetSource.ts`，把 `LinghuiMediaItem.metadata.persist.localPath/remoteUrl` 还原成 `StoredMediaAsset`。
  - `collectReferenceSources()`、`collectVideoPosterSources()`、`collectLinghuiPromptReferenceImageSources()` 改为保留结构化 `MediaAssetSource`，不再把灵绘媒体压成纯字符串。
  - 图片 provider 的 Grok `image-index` 路径在 remote-url 归一化后改为 remote-first 解析，避免已有 remoteUrl 的资产再次变成本地 data-url。
  - 视频 provider、Agent 图片输入和视频能力分配同步接受结构化媒体源；首尾帧/参考生视频继续把对象传给 `mapVideoRequestToProviderRequest()`。
  - 补测试覆盖上游图片 persist 元数据保留、图片节点批量引用传递结构化资产、Grok 图片索引协议复用已落盘 remoteUrl。

### Phase 5: Validation
- **Status:** complete
- Validation:
  - `npm run test -- --run src/components/linghui/execution/tests/linghuiExecutionShared.test.ts src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/components/linghui/execution/tests/linghuiExecutionProviders.test.ts`：3 files / 26 tests passed。
  - `npm run test -- --run src/services/mediaRemoteUrlService.test.ts src/services/promptCompilation/videoRequestCompiler.test.ts src/components/linghui/editors/tests/videoCapabilityUtils.test.ts`：3 files / 26 tests passed。
  - `npm run test -- --run src/components/linghui/execution/tests/linghuiExecutionVideoNode.test.ts`：1 file / 3 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。

## Session: 2026-05-13 Director3D Unified Render Pipeline

### Phases 1-4: Diagnosis and Fix
- **Status:** complete
- Actions taken:
  - 确认画布模型由 r3f JSX 组件渲染，而导出截图/时间轴视频由 `CaptureRenderer` 在离屏 `WebGLRenderer` 中重建 vanilla three.js 几何。
  - 在 `director3dExportGeometry.ts` 中新增统一入口 `buildDirector3DActorGroup()`，覆盖 `mannequin`、`mannequin-lite`、`formation`、`creature` 和全部 prop 类型。
  - 将主角脸部/胸牌/背脊线/关节、lite 群演和 formation 成员细节补进共享构建器，减少导出低保真复刻。
  - 首次尝试将 `Director3DViewport` 的画布 actor 渲染改为 `<primitive>` 挂载共享 `THREE.Group`，但用户反馈无法选中假人且预览样式变化。
  - 已恢复画布 actor 渲染为原 JSX 组件（`Director3DMannequin` / `Director3DLiteMannequin` / `Director3DFormation` / `Director3DCreature` / `Director3DProp`），保留原选择事件和分件材质样式。
  - `CaptureRenderer` 删除本地重复分支，导出路径继续直接调用 `buildDirector3DActorGroup()`。
  - 选择/拖拽/高度/旋转控件仍由 `ActorDragLayer` 独立绘制，不进入共享 builder。
  - 新增 `director3dExportGeometry.test.ts` 回归测试，约束统一 actor builder 覆盖全部 actor 类型。

### Phase 5: Validation
- **Status:** complete
- Validation:
  - `npm run test -- --run src/components/linghui/director3d/director3dExportGeometry.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dBattalion.test.ts src/components/linghui/director3d/director3dTimeline.test.ts`：6 files / 74 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
  - Electron CDP `http://127.0.0.1:9333/json/version` 在线；通过 page websocket 读取当前 Electron 页面标题 `Koma - 漫剧创作工具`。当前停在项目列表，未进入 3D 工作台，只作为端口/页面级烟测记录。

### Follow-up: Restore Canvas Interaction and Style
- **Status:** complete
- Actions taken:
  - 根据用户反馈，撤回画布 `<primitive>` 渲染方案。
  - 画布恢复使用原 JSX 组件，以保留 R3F 事件命中、选中光环、分件材质和原预览样式。
  - 导出视频/截图仍使用共享 builder，不再影响画布交互。
- Validation:
  - `npm run test -- --run src/components/linghui/director3d/director3dExportGeometry.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dBattalion.test.ts src/components/linghui/director3d/director3dTimeline.test.ts`：6 files / 74 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
  - Electron CDP 9333 页面级检查：页面在线，无 React 错误；当前停在项目列表，未进入 Director3D 视口。

## Session: 2026-05-12 Director3D Procedural Model Refinement

### Phase 1: Current State Recovery
- **Status:** complete
- Actions taken:
  - 使用 `pi-planning-with-files` 技能继续复杂任务记录。
  - 确认当前分支为 `feat/panel-restore2`，起步工作树干净。
  - 读取 `electron/main.ts`，确认开发模式 remote debugging 端口为 `KOMA_ELECTRON_REMOTE_DEBUGGING_PORT` 或默认 `9333`；后续可视化验证不打开普通浏览器 URL。
  - 复查现有 Director3D 生物、道具、导出几何和编辑器入口，确认外部模型库未直接展示。
  - 发现视口/导出 `propKind()` 标签识别不一致，以及四足/龙四肢与躯干动作脱节的继续优化点。

### Phase 2: Model Refinement
- **Status:** complete
- Actions taken:
  - 同步视口与导出道具识别标签。
  - 增加动物肩/胯连接、物种特征和更清晰脚爪。
  - 增加道具分件细节和材质纹理暗示。
  - 同步导出几何，补测试防止退回单一占位体。

### Phases 3-4: Export Parity and Validation
- **Status:** complete
- Actions taken:
  - `Director3DProp` 与 `director3dExportGeometry` 的 `propKind()` 同步识别车厢、山巅岩、石柱、香烛、墙板、圆台/云台。
  - 四足动物增加肩/胯连接球和分段腿，狐狸尾巴改为更可读的多尾扇形。
  - 飞禽增加侧向脚爪；龙增加口鼻块、双排龙须、分枝角和爪肩连接。
  - 道具增加车轮辐条/门线、岩石裂纹、树皮纹、车轮/自行车辐条、麦克风网罩、石柱环、香烛火焰、墙板砖缝。
  - 离屏导出几何同步上述结构，并新增回归测试覆盖常用模板道具、四足动物、龙和飞禽的复杂度。
- Validation:
  - `npm run test -- --run src/components/linghui/director3d/director3dExportGeometry.test.ts src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dBattalion.test.ts src/components/linghui/director3d/director3dTimeline.test.ts`：6 files / 72 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npm run build`（frontend）：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。
- Notes:
  - `curl http://127.0.0.1:9333/json/version` 连接失败，说明当前 Electron app 未运行；按用户要求未打开普通浏览器 URL。

### Follow-up: Electron Debug Port Rule
- **Status:** complete
- Actions taken:
  - 将“不要用普通浏览器打开前端做 UI 验证，必须连接 Electron 自定义调试端口”的项目规约写入 `AGENTS.md`。
  - 在 `CLAUDE.md` 增加指向 `AGENTS.md` 的同类规约入口。
  - 确认当前 Electron DevTools Protocol 在线：`http://127.0.0.1:9333/json/version` 返回 `KomaStudio/1.0.0 Electron/39.4.0`。
  - 通过 `http://127.0.0.1:9333/json/list` 找到 Electron 页面 target：`Koma - 漫剧创作工具`。
  - 使用 CDP 读取当前 Electron 页面 DOM，确认页面已从临时 ErrorBoundary 状态恢复，当前不是普通浏览器烟测。

### Follow-up: Director3D Slider Popover React Loop
- **Status:** complete
- Actions taken:
  - 根据 renderer 日志定位 `Maximum update depth exceeded` 到 `Director3DNodeEditor` 右侧属性 Popover 中的 AntD `SliderTooltip` portal。
  - 为 Director3D inspector 内的朝向、骨骼微调、缩放、FOV 滑块统一关闭 Slider 默认 tooltip：`tooltip={{ open: false }}`。
  - FOV 滑块改为和骨骼滑块一致的行内数值显示，保留角度反馈但不再创建嵌套 Tooltip portal。
  - 顺手把本轮触达的 AntD 6 弃用 Modal/Drawer props 改为当前 API：`destroyOnHidden`、`mask={{ closable }}`、Drawer `size`。
  - 通过 Electron CDP `http://127.0.0.1:9333` 打开已有 3D 导演节点，打开右侧属性 Popover 并拖动 FOV 滑块；验证 `.ant-slider-tooltip` 数量为 0，且没有 `Maximum update depth` / `Cannot read properties of null` / `popoverEventBlockers`。
  - CDP 滑块验证临时改动了本地测试工作区 FOV；已用 SQLite 将 `linghui_workspace_nodes` 中 `9dade4f772c2/-khezgWLgi` 的 `scene.camera.fov` 恢复为 35。
- Validation:
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npm run test -- --run src/components/linghui/director3d/director3dExportGeometry.test.ts src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dBattalion.test.ts src/components/linghui/director3d/director3dTimeline.test.ts src/components/linghui/editors/tests/ImageNodeEditor.test.tsx`：7 files / 75 tests passed。
  - `git diff --check`：passed。

## Session: 2026-05-10 Storyboard Image Mode

### Phases 1-5: Implementation
- **Status:** complete
- Actions taken:
  - 增加 `ShotImageMode = 'storyboard'`，并在 Electron 持久化 metadata 中保存 `inheritPreviousStoryboard`。
  - 扩展 mention 协议和编辑器提示，新增 `@storyboard_anchor` / `@previous_storyboard_anchor`。
  - `ShotReferenceBundle` 在故事板模式下把当前故事板作为 `storyboard-anchor`，并在开关启用时查找上一张已生成故事板图片作为 `previous-storyboard-anchor`。
  - 生图、视频计划和渲染工作流加载同剧集分镜列表，将上一故事板图片作为真实引用传给编译和 provider request。
  - 新增 `storyboard_shot_prompt_generation` 和 `tti_storyboard_shot_image` 默认模板，约束电影级故事板、剧情递进、情绪表演、光影衔接、风格继承，并避免可读字幕/标题/说明文字进入图像。
  - 分镜 UI 增加“故事板”模式、批量切换菜单和“继承上一故事板”开关；故事板和网格一样被视为多面板图片，切换时自动把视频模式修正为多参。

### Phase 6: Validation
- **Status:** complete
- Validation:
  - `npm run test -- --run src/store/promptTemplates.test.ts src/editor/mentionTypes.test.ts src/services/shotReference/builder.test.ts src/services/shotReference/compile.test.ts src/workflow/shotVideoPlan.test.ts src/store/project/projectPersistenceHelpers.test.ts src/components/storyboard/ShotScriptLines.test.tsx src/components/storyboard/__tests__/assetRetention.test.ts`：8 files / 100 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
- Errors:
  - 首次 frontend tsc 报 `ShotCard.tsx` 未解构 `onStoryboardInheritPreviousChange`；已补齐并复跑通过。

## Session: 2026-05-10 Storyboard Script Line Editing Stability

### Phase 1: Diagnosis
- **Status:** complete
- Actions taken:
  - 使用 `pi-planning-with-files` 技能继续记录本轮回归修复。
  - 定位分镜文本编辑到 `ShotScriptLines.tsx` 的逐行受控 input。
  - 确认每个字符会经 `Storyboard.handleScriptLinesChange()` 调用 `saveAllShots()`，同步更新整组 `shots` 并排队保存；该状态回写会让虚拟列表行和受控 input 重渲染，导致光标跳到尾部。
  - 确认添加/删除/插入/拖拽字幕行仍应即时提交，只有普通文本输入需要从全量保存中解耦。

### Phases 2-3: Fix and Validation
- **Status:** complete
- Actions taken:
  - `ShotScriptLines` 的单行 input 改为本地草稿：输入时只更新本组件状态，不立即调用父级 `onLinesChange`。
  - 失焦或按 Enter 时提交草稿到父级保存，外部 `line.text` 变化仅在 input 未聚焦时同步回本地草稿。
  - 添加/插入/删除行前会先把当前草稿 materialize 到 lines，避免用户未失焦时做结构操作丢字。
  - 新增 `ShotScriptLines.test.tsx` 覆盖父级 rerender 不覆盖输入草稿，以及结构性变更会带上未失焦草稿。
- Validation:
  - `npm run test -- --run src/components/storyboard/ShotScriptLines.test.tsx`：1 file / 2 tests passed。
  - `npm run test -- --run src/components/storyboard/ShotScriptLines.test.tsx src/components/storyboard/__tests__/assetRetention.test.ts src/workflow/shotRenderWorkflow.videoChain.test.ts src/services/shotReference/builder.test.ts src/services/shotReference/compile.test.ts`：5 files / 49 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `git diff --check`：passed。

## Session: 2026-05-09 Linghui Prompt Upload Deduplication

### Phase 1: Current State Recovery
- **Status:** complete
- Actions taken:
  - 使用 `pi-planning-with-files` 技能做本轮本地计划记录。
  - 读取现有 `task_plan.md` / `findings.md` / `progress.md`，确认上轮记录是历史上下文，不阻塞本轮。
  - 初步搜索仓库内灵绘、提示词编译、上传、图床、元数据、分镜相关入口；确认代码规模较大，需要按调用链收敛。
  - 初步检索当日日志宽泛上传关键词，未直接命中，需要使用具体日志 tag 二次检索。

### Phases 2-5: Root Cause, Fix, Storyboard Audit, Validation
- **Status:** complete
- Actions taken:
  - 在 `mediaRemoteUrlService` 增加项目级远程 URL 缓存文件 `metadata/media-remote-url-cache.json`，上传成功后按图片源 key 写入，复用前检测可访问性，失效时删除并重新上传。
  - `ensureRemoteUrlForImageSources()` 增加批量内去重，`remoteUrlInflightUploads` 合并同源并发上传；data-url key 改为长度 + 稳定 hash，避免前缀碰撞误去重。
  - 灵绘图片 grok-image-index 路径把显式参考和静默上游参考合并后一次远程归一化，再切回原分组；provider references 提交前按源去重，避免请求体重复带同一张图。
  - 视频/分镜共用的 `mapVideoRequestToProviderRequest()` 对 image-to-video 主图+额外参考、start-end 首尾帧在 remote-url required 场景下合并批量归一化，覆盖分镜视频字段间重复上传。
  - 根据用户提供的分镜日志追加修复：`ensureRemoteUrlForImageAsset()` 对本地文件资产先查 sourceKey 缓存，缓存命中时跳过旧 `asset.remoteUrl` 的可达性检测；无缓存但资产 remoteUrl 可访问时把它写入本地缓存，避免下次再走旧链接检测。
  - 补测试覆盖远程 URL 缓存复用/失效重传、批量重复源只上传一次、灵绘 grok 显式+静默参考合并去重、视频映射主图/参考图与首尾帧重复上传去重。
- Validation:
  - `npm run test -- --run src/services/mediaRemoteUrlService.test.ts src/services/promptCompilation/videoRequestCompiler.test.ts src/components/linghui/execution/tests/linghuiExecutionProviders.test.ts`：3 files / 32 tests passed。
  - `npm run test -- --run src/workflow/shotRenderWorkflow.videoChain.test.ts src/services/shotReference/builder.test.ts src/services/shotReference/compile.test.ts`：3 files / 31 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
- Errors:
  - 首次 frontend tsc 报 `ProviderAssetInput` 上不存在 `localPath/remoteUrl`；已在灵绘图片去重 helper 中显式收窄 StoredMediaAsset 后通过。

## Session: 2026-05-08 Linghui Panorama + Director3D Stabilization

### Phase 1: Current State Recovery
- **Status:** complete
- Actions taken:
  - 使用 `pi-planning-with-files` 技能执行 session catchup；脚本无输出。
  - 阅读 `docs/linghui-panorama-and-3d-director-workbench-plan.md`、当前 `task_plan.md`、`progress.md`、`findings.md`。
  - 通过 `git status --short` 确认当前有大量未提交全景与 director3d 半成品改动，本轮必须小范围定位修复“无法进入编辑”。

### Phases 2-4: Diagnosis, Fix, Validation
- **Status:** complete
- Actions taken:
  - 修复 `useLinghuiCanvasNodeInteractions.openNodeEditor` 白名单，允许 `linghui/director3d` 设置 editor selection。
  - 补齐前端画布快照 `linghui-director3d` → `linghui/director3d` 映射，避免保存时被当作未知节点。
  - 补齐 Electron 文档 normalize 的 current node / RF type 白名单，避免保存恢复时拒绝 director3d 工作区。
  - 新增 `useLinghuiCanvasNodeInteractions` 测试覆盖 director3d 打开编辑入口；扩展画布快照和文档 normalize 测试覆盖 director3d 保存/恢复。
  - 将 director3d 视口/假人默认颜色从硬编码 hex 收敛到 CSS token 解析工具；将 panorama seam 诊断风险色改成 Sass class，canvas 分隔色改读 token。
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasNodeInteractions.test.tsx src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/store/linghuiDocument.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：4 files / 18 tests passed。
  - `npm run test -- --run src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/store/linghuiDocument.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts`：4 files / 23 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `npm run check:style-discipline`：failed only on existing project/settings/storyboard/chat/theme/index.scss debts after new director3d/panorama paths were cleaned.
  - `git diff --check`：passed。
- Files created/modified:
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `frontend/src/components/linghui/canvas/hooks/useLinghuiCanvasNodeInteractions.ts`
  - `frontend/src/components/linghui/canvas/state/linghuiCanvasShared.ts`
  - `electron/service/linghui/document.ts`
  - `frontend/src/components/linghui/director3d/director3dColors.ts`
  - `frontend/src/components/linghui/director3d/director3dScene.ts`
  - `frontend/src/components/linghui/director3d/Director3DMannequin.tsx`
  - `frontend/src/components/linghui/director3d/Director3DViewport.tsx`
  - `frontend/src/components/linghui/editors/components/Director3DNodeEditor.tsx`
  - `frontend/src/components/linghui/panorama/PanoramaSeamDiagnostics.tsx`
  - `frontend/src/components/linghui/page/styles/_director3d.scss`
  - `frontend/src/components/linghui/page/styles/_media-panels.scss`
  - related tests

### Follow-up: Fullscreen Director3D Workbench
- **Status:** complete
- Actions taken:
  - `LinghuiNodeEditor` 对 `linghui/director3d` 改走独立 fullscreen Modal 分支，不再渲染节点下方主面板。
  - `Director3DNode` 去掉 `hasInlineEditor` class，避免 director3d 打开时仍按 inline editor 节点层级处理。
  - `Director3DNodeEditor` 把“机位”文案收敛为“视角”，并移除右侧 camera position / LookAt 表单，只保留当前取景视角的 FOV、比例、背景等直接参数。
  - `Director3DViewport` 移除虚拟相机模型和画幅标注；当前 orbit/pan/zoom 工作台视角就是真实相机，导出线稿读取当前相机并写回 scene。
  - 默认 scene 的 `showCameraFrame` 改为 false，避免后续误把虚拟相机标注恢复出来。
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasNodeInteractions.test.tsx src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/store/linghuiDocument.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：4 files / 18 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `npm run check:style-discipline`：failed only on existing project/settings/storyboard/chat/theme/index.scss debts；新增 director3d 路径未出现。
  - `git diff --check`：passed。

### Follow-up: Director3D Fullscreen Height + Actor Interaction
- **Status:** complete
- Actions taken:
  - 强化 `.linghuiDirector3DModal` 对 AntD root / wrap / modal / content / body 的高度覆盖，确保 director3d 工作台按 100vh 撑满。
  - `linghuiDirector3DEditorPanel` 和 `linghuiDirector3DLayout` 增加 100vw/100vh 约束，避免内容仍按旧 inline panel 高度收缩。
  - 修复假人点击后立即失活：actor pointer down 后抑制下一次 viewport click，不再触发空白画布选择清空。
  - 修复假人拖动：拖动位置改为累计 pointer 位移计算，不再每帧回到起始点附近。
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasNodeInteractions.test.tsx src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/store/linghuiDocument.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：4 files / 18 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `npm run check:style-discipline`：failed only on existing project/settings/storyboard/chat/theme/index.scss debts；新增 director3d 路径未出现。
  - `git diff --check`：passed。

### Follow-up: Director3D Actor Drag Redesign
- **Status:** complete
- Actions taken:
  - 将假人拖动从屏幕 delta / yaw/right/forward 估算改为 ray-plane 拖动。
  - `Director3DViewport` 新增 viewport ref、raycaster、drag plane 和 hit point cache；鼠标坐标按当前工作台相机反投影到假人脚底平面。
  - actor pointer down 时记录点击点到 actor position 的 offset；pointer move 时用当前 ray-plane 命中点加 offset 得到新位置，解决 X 方向反和“不跟手”的问题。
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasNodeInteractions.test.tsx src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/store/linghuiDocument.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：4 files / 18 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `npm run check:style-discipline`：failed only on existing project/settings/storyboard/chat/theme/index.scss debts；新增 director3d 路径未出现。
  - `git diff --check`：passed。

### Follow-up: Director3D Live-Camera Actor Drag
- **Status:** complete
- Actions taken:
  - 根据用户继续反馈“X 方向相反、不跟手”，复查当前 `Director3DViewport`。
  - 发现现有 ray-plane 计算仍由外层 DOM pointer move 重建 `PerspectiveCamera`，数据源是 `cameraStateRef`；真实相机由 `EditorCameraRig.useFrame` 逐帧 lerp 更新，两者可能短暂不一致。
  - 新增 `ActorDragLayer`，把假人拖动会话移入 R3F Canvas 内部，直接用 `useThree()` 的 live camera / `gl.domElement` bounding rect 计算地面交点。
  - 拖动期间由 `dragPreview` 立即渲染假人临时位置；最终改成松手/取消/窗口失焦时一次性写回父级 scene，避免拖动时全局节点数据频繁重渲染。
  - 外层视口在 actor 拖动期间暂停 orbit/pan/wheel，避免假人拖动和相机控制互相抢 pointer。
  - 修正 `useLinghuiCanvasNodeInteractions.test.tsx` 的 React Flow node data 类型转换，使本轮测试文件不再出现在 `tsc --noEmit` 报错里。
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasNodeInteractions.test.tsx src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/store/linghuiDocument.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：4 files / 20 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `npm run check:style-discipline`：failed only on existing project/settings/storyboard/chat/theme/index.scss debts；新增 director3d 路径未出现。
  - `npx tsc --noEmit --project tsconfig.json`：failed on existing unrelated type debts；复查输出中不再包含 `Director3DViewport` 或 `useLinghuiCanvasNodeInteractions.test.tsx`。
  - `git diff --check`：passed。

### Follow-up: Panorama + Director3D Save/Restore Operability
- **Status:** complete
- Actions taken:
  - `electron/service/linghui/document.ts` 对已知语义类型的节点不再因 RF type 旧值直接报错，而是规范化为当前 RF type；可修复旧 `linghui-image` + `linghui/panorama` 半保存数据。
  - `buildRFNodesFromSnapshot` 恢复节点时合并 `createNewNodeData` 默认值，补齐旧 panorama/director3d 缺失的 `inputs`、`outputs` 和关键 `properties`。
  - `LinghuiPage` 激活工作区时将恢复出来的 `running` runState 转为 `stale`，避免保存退出后重新进入仍被“执行中”状态锁住；保存过程本身不触发该转换，避免打断当前执行。
  - 补测试覆盖旧全景 RF type 修复，以及 sparse panorama/director3d 快照恢复后仍有默认连接点和属性。
- Validation:
  - `npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasNodeInteractions.test.tsx src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/store/linghuiDocument.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts`：4 files / 20 tests passed。
  - `npm run build`（frontend）：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `npm run build-electron`：passed。
  - `npm run check:style-discipline`：failed only on existing project/settings/storyboard/chat/theme/index.scss debts；本轮路径未出现。
  - `npx tsc --noEmit --project tsconfig.json`：failed on existing unrelated type debts；复查输出中不包含本轮相关文件。
  - `git diff --check`：passed。

### Follow-up: Panorama + Director3D SQLite Restore Type Regression
- **Status:** complete
- Actions taken:
  - 根据用户反馈“重新进入后退化成普通文本节点”，复查保存/恢复链路。
  - 定位到 `electron/service/linghui/persistenceHelpers.ts` 的 SQLite row → snapshot 映射表漏了 `linghui-panorama` / `linghui-director3d`，导致读库时 `data.linghuiType` 默认变成 `linghui/text`。
  - 补齐两类 RF type 映射。
  - 增加属性指纹恢复：如果用户已经把退化后的节点再次保存为 `linghui-text`，但 properties 里仍有 `scene.version === 1` 或 `projectionMode/panoramaTemplate`，读取时恢复为 3D 导演台或全景节点，并规范化 RF type。
  - 扩展 `linghuiPersistenceHelpers.test.ts` 和 `types/linghui.test.ts`，防止该映射再次漏掉。
- Validation:
  - `npm run test -- --run src/store/linghuiPersistenceHelpers.test.ts src/store/linghuiDocument.test.ts src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/types/linghui.test.ts`：4 files / 25 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npm run build-electron`：passed。
  - `npm run build`（frontend）：passed；保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。

### Follow-up: Unified Linghui Node Ports
- **Status:** complete
- Actions taken:
  - 用户要求整理所有节点输入输出连接点，避免每个节点暴露多个输入/输出导致蜘蛛网，并希望上游参数能沿链路传到最终节点，由节点自身过滤不需要的上游输入类型。
  - 初步确认可行方向：UI 合并为单输入/单输出；连接校验从 slot-level 改为 node-level；执行输入聚合从按 `input-N` 过滤改为按直接上游全集合聚合。
  - 新增统一端口常量和 `LinghuiNodePorts`，所有灵绘节点卡片只渲染 `input-0` / `output-0`。
  - 画布连线创建、快速创建接线、保存快照和恢复快照全部规范化到统一 handle；旧 `input-N` / `output-N` 边恢复后也会变成统一端口。
  - 连接校验改为节点级：只校验节点存在、非自环、源节点有输出能力、目标节点有输入能力，不再按 handle slot 拒绝不同媒体类型。
  - 执行视图改为收集目标节点的全链路上游结果，`getAllInputResults(slot)` / `getInputResult(slot)` 再按目标节点声明的 slot `dataType` 过滤；`getAllInputImages()` 只返回图片类上游结果。
  - 节点编辑器里的参考图、参考视频、参考音频改为遍历全链路上游节点，不再依赖 `input-2` / `input-3` 等旧端口编号。
  - 修复统一端口后的引用统计回归：下游编辑器参考列表现在按媒体 kind 分桶，图片不会被算进视频/音频，视频也不会被算进图片/音频。
- Validation:
  - `npm run test -- --run src/components/linghui/library/tests/linghuiNodeDefs.test.ts src/components/linghui/execution/tests/linghuiExecutionShared.test.ts src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/components/linghui/execution/tests/linghuiExecutionVideoNode.test.ts src/components/linghui/execution/tests/linghuiExecutionAudioNode.test.ts src/components/linghui/execution/tests/linghuiExecutionScriptNode.test.ts src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts`：7 files / 28 tests passed。
  - `npm run test -- --run src/components/linghui/execution/tests/linghuiExecutionWorkflow.test.ts src/components/linghui/execution/tests/linghuiExecutionPlan.test.ts src/components/linghui/editors/tests/linghuiPromptReferences.test.ts src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/components/linghui/execution/tests/linghuiExecutionVideoNode.test.ts src/components/linghui/execution/tests/linghuiExecutionAudioNode.test.ts src/components/linghui/execution/tests/linghuiExecutionScriptNode.test.ts`：7 files / 25 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npm run build-electron`：passed。
  - `npm run build`（frontend）：passed；保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。
  - `npm run test -- --run src/components/linghui/editors/tests/linghuiReferenceMedia.test.ts src/components/linghui/execution/tests/linghuiExecutionShared.test.ts src/components/linghui/editors/tests/linghuiPromptReferences.test.ts`：3 files / 6 tests passed。
  - 回归修复后 `npx tsc --noEmit --project tsconfig.json`（root/frontend）passed，`npm run build`（frontend）passed。
- Errors:
  - 首次目标测试中 `linghuiExecutionShared.test.ts` 仍期望脚本分镜 10 秒；当前时长工具会归一到允许档位 12 秒，已更新测试断言。
  - 用户反馈 4 张图片 + 2 个视频在下游显示成 6 张图片 / 6 个视频 / 6 个音频；根因是编辑器参考统计遍历全上游后未按 `primary.kind` 过滤，已抽出 `linghuiReferenceMedia` 并补回归测试。

### Follow-up: Full TSC Debt Cleanup
- **Status:** complete
- Actions taken:
  - 用户要求继续解决全仓 `tsc` 既有失败。
  - 已重新运行 `frontend npx tsc --noEmit --project tsconfig.json`，确认当前错误列表。
  - 已把错误归类为业务类型收窄、Electron bridge 类型、Canvas/WebGPU mock、测试 fixture 类型四组。
  - 修复 runtime 类型债务：
    - `ShotRow.image_mode` 补齐 `grid-9` / `grid-4`。
    - Canvas 2D context options 改为合法 `willReadFrequently`。
    - `ProjectAssetOverview` logger 参数改成单对象 payload。
    - `ShotDurationControl` 使用 `@rc-component/input-number` 的 `InputNumberRef`。
    - `TaskStatus` 补齐 `cancelled`。
    - Electron project bridge 补齐 `setStorageRoot`。
    - Seedance selected asset refs 增加媒体输入类型保护，过滤 provider-only asset input。
    - root tsc 触达 frontend 时用局部 `ElectronBridgeWindow` / window cast 收窄 `window.electronAPI` 与 `window.electron`。
    - 灵绘导入记录 retarget 参数补齐 `groupIds`，并用于模板 `sourceGroupId` 重映射。
    - 删除已隐藏内置 Recipe 的未使用 snapshot builder 函数。
  - 修复测试类型债务：
    - `findLastIndex` 测试替换为 reduce，避免 ES2023 lib 要求。
    - 多处 Canvas/WebGPU `getContext` mock 改为按 contextId 返回。
    - project persistence fixtures 使用 `MediaType` / `EasingType` / `TimelineData`。
    - project open task payload 经 `unknown` 过渡 cast。
    - activation 默认管理渠道测试更新为 5 个渠道（新增 tts）。
    - mediaTaskBindingService mock 改为 `vi.hoisted` 并补 diagnostics mock。
- Validation:
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npm run test -- --run ...`（11 个目标文件）：54 tests passed。
  - `npm run build`（frontend）：passed；保留既有 Vite dynamic import/chunk size warnings。
  - `npm run build-electron`：passed。
  - `git diff --check`：passed。

### Follow-up: Storyboard Video Prompt Template Cleanup
- **Status:** complete
- Actions taken:
  - 用户反馈分镜视频提示词里会输出 `【自检】` checkbox 段落，并且视频提示词缺台词。
  - 检查全部 8 个视频 reasoning 模板：`shot_video_6s/10s/15s/20s_multi.md` 与 `shot_video_6s/10s/16s/20s_firstframe.md`。
  - 移除模板里的 `输出前必须自检字数` 和末尾 `## 输出前自检（全过才提交）` checkbox 段落。
  - 多参模板最终输出统一为：整体画风、景别、运镜、视频运动、场景描述、角色提示词、系统提示词、道具提示词、画面提示词、角色动作提示词、对白提示词、情绪提示词、音效提示词、背景音乐提示词、光影氛围提示词、精确时长。
  - 首帧延展模板保留 `[图片提示词]` 首帧段，`[视频提示词]` 段改为同一套结构化字段。
  - `shotsOutputFormat.ts` 把 grid `【自检】` 改成 `【结构约束】`，避免 shotsSection 诱导模型输出检查清单。
  - `ShotPromptService.generateVideoPrompt()` 改为把 `shot.dialogue` 合并进视频模板上下文，并传入口播台词保护说明。
  - 新增结果清洗兜底：删除泄漏的自检段和 markdown checkbox。
  - 新增台词兜底：如果模型最终提示词漏掉显式 `shot.dialogue`，自动补入或追加到 `对白提示词`。
  - 调整台词解析保留 `角色名：台词`，避免 `shot.dialogue` 被拆成无角色名台词并重复。
- Validation:
  - `npm run test -- --run src/services/ShotPromptService.test.ts`：1 file / 8 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npm run build`（frontend）：passed；保留既有 Vite dynamic import/chunk/chunk-size warnings。
  - `git diff --check`：passed。

### Follow-up: Storyboard Image/Video Prompt Visual Alignment
- **Status:** complete
- Actions taken:
  - 根据用户给的三段目标提示词，继续优化分镜生图与视频提示词模板，使两者在画风、景别、画面描述、角色/道具、动作、情绪、光影和呼应字段上对应。
  - `ShotPromptService` 的生图路径现在也使用合并后的 `scriptLines + shot.dialogue`，并额外传入 `dialogueText`，避免图片提示词缺台词事实。
  - `shot_image_prompt_generation` 改成视频 0 秒画面锚点结构，新增 `景别构图`、`画面描述`、`系统/字幕提示词`、`动作定格提示词`、`对白视觉提示词`、`呼应提示词` 等字段。
  - 8 个 `shot_video_*` 模板将最终字段升级为用户样例方向：`多机位运镜`、`画面描述`、`呼应提示词`，并强化前景/中景/背景层次、特写对象、角色可见状态、道具位置和光影变化。
  - 首帧延展 4 个模板补齐 `{{props}}` 输入和变量声明，避免输出道具提示词时缺少道具上下文。
  - 九宫格/四宫格推理模板增加台词字段、画面层次、特写对象和每帧景别/光影要求；TTI 九/四宫格直拼模板强调连续动作锚点，不再只是不同镜头集合。
  - `tti_shot_image` 强化为 storyboard still frame / video anchor frame，明确普通对白不渲染为文字，只有字幕/系统气泡/屏幕字才画字。
  - `promptTemplates.test.ts` 新增模板结构回归测试，并把旧分镜拆解断言同步到当前 `scriptLineIndices` 连续覆盖约束。
- Validation:
  - `npm run test -- --run src/store/promptTemplates.test.ts src/services/ShotPromptService.test.ts`：2 files / 15 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npm run build`（frontend）：passed；保留既有 Vite dynamic import/chunk-size warnings。
  - `git diff --check`：passed。

### Follow-up: First-Person Narration To Scene Dialogue
- **Status:** complete
- Actions taken:
  - 用户指出：`她自称天道，说要帮我夺回气运` 不应该转成旁白，也不应该原句作为台词；应该改写成真实剧情对白，人称必须正确。
  - `ensureExplicitDialogueInVideoPrompt()` 改为从 `explicitDialogueText` 中区分显式直接对白和叙述转写；第一人称转述只补改写后的真实剧情对白，不再把来源叙述句逐字补进 `对白提示词`。
  - `buildDialogueGuardNote()` 增加 `NARRATIVE_TO_SCENE` 轨道，区分第一人称叙述/转述与真正角色对白。
  - 新增转写启发式：第一人称转述在 `我 + 小白` 角色上下文中会转成 `小白：我是天道，我可以帮你夺回气运` 这类干净的真实对白。
  - 8 个视频 reasoning 模板新增 `NARRATIVE_TO_SCENE` 规则，并把“台词逐字一致”改成“显式对白保留语义；转述句必须先做剧情化和人称转换”。
  - 根据用户继续反馈，移除模板和 guard note 中的具体来源句/错误示例，不再输出“原句 → 改写”说明，避免污染视频模型。
  - 处理 `镜头1-镜头4` 出现两遍：多参模板将 `shotsSection` 标为内部参考，最终只允许一组字段；`角色动作提示词` 承载镜头顺序，禁止 `精确时长` 后追加逐镜头 Markdown 段。
  - 根据用户反馈“不要截断内容”，撤掉 `sanitizeVideoPromptResult()` 中按首个 `精确时长：N秒` 截断尾部的逻辑，避免误删有效补充内容。
  - `sanitizeVideoPromptResult()` 仅保留非破坏性清洗：去掉开头 `镜头1-镜头4` 前缀、清洗 `对白提示词` 中的来源叙述泄漏、移除自检/checkbox 污染。
  - 补回归测试：第一人称转述会补改写后的真实对白而不是原句；模型泄漏来源叙述会被清洗；`精确时长` 后内容不会被截断；模板不含具体坏句示例。
- Validation:
  - `npm run test -- --run src/services/ShotPromptService.test.ts src/store/promptTemplates.test.ts`：2 files / 20 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。

### Follow-up: Prompt Compilation Fallback + Anchor Preview
- **Status:** complete
- Actions taken:
  - 用户反馈最终提示词仍出现 raw `@prop_*`，且 `@grid_anchor` tooltip 没有显示选中图。
  - 已开始复查 `shotReference/compile`、bundle builder 与 `ShotCard` 局部 mentionItems 链路。
  - `buildShotReferenceBundle` 新增 `mentionFallbacks`，即使资产无图也保留 `@prop_x -> 道具名` 的降级信息。
  - `compileShotPromptToBundle` 对未映射 token 改为可读降级/剥离，不再保留 raw `@prop_*` / 未知 `@char_*`。
  - `compileGrokTTI` / `compileGrokITV` 对 selectedAssets 中无 source 的资产同样做可读降级，避免 TTI/ITV 二次编译继续泄漏 raw id。
  - `ShotCard` 的 `@grid_anchor` / `@shot_anchor` tooltip 预览改为直接使用当前选中的图片，不再因为 `metadata.gridCell` 被排除。
  - 根据用户继续反馈，移除 `compileGrokITV` 自动在提示词最前方 prepend `@Image 1` 的旧行为；primary image 仍保持在请求图片数组第 1 位，但正文只有显式写了 `@Image 1` 才保留。
  - 根据用户反馈“高亮说明道具应进入 bundle”，定位到真实根因：`ShotPromptService` 用 `createMentionString()` 输出 `@prop_177...`，但 `buildShotReferenceBundle()` 旧代码把真实 ID 再拼一次前缀，变成 `@prop_prop_177...`，导致 compile 匹配失败。
  - `buildShotReferenceBundle()` 统一改用 `createMentionString()` 生成 scene/char/prop mentionToken 和 mentionFallbacks，真实前缀 ID 不再重复拼接。
  - 分镜视频删除旧 `selectedAssetsForCompilation` 视图和 `assetReferenceBuilder.ts`；Seedance 合并参考图改为严格使用 `plan.bundle.items` 顺序，避免 `@Image N` 索引被旧角色/场景/道具顺序重排。
  - 分镜生图 `shotImageWorkflow` 改为 workflow 层直接用 `compileShotPromptToBundle()` 编译一次，并把同一份 `compiledPrompt` / `references` 传给 TTI；不再把分镜生图交给旧 selectedAssets 编译器二次处理。
  - `CompiledVideoGenerationRequest` 移除 `promptCompilation` 字段，`shotRenderWorkflow` 不再把预编译后的分镜视频请求重新接入 `MediaGenerationService` 的旧 promptCompilation 路径。
  - 新增 `videoGenerationRequests.test.ts`，覆盖真实前缀 ID 下 `@grid_anchor` / scene / char / prop / legacy `@图片1` 全部归一为同一 bundle 顺序的 `@Image N`，且不会自动在开头 prepend `@Image 1`。
- Validation:
  - `npm run test -- --run src/services/shotReference/compile.test.ts src/services/shotReference/builder.test.ts src/services/promptCompilation/grokImageIndexCompiler.test.ts`：3 files / 29 tests passed。
  - `npm run test -- --run src/services/promptCompilation/videoRequestCompiler.test.ts src/services/ShotPromptService.test.ts src/store/promptTemplates.test.ts`：3 files / 30 tests passed。
  - `npm run test -- --run src/services/promptCompilation/grokImageIndexCompiler.test.ts src/services/promptCompilation/videoRequestCompiler.test.ts src/services/shotReference/compile.test.ts`：3 files / 25 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npm run build`（frontend）：passed；仅保留既有 Vite dynamic import / chunk-size warnings。移除 `@Image 1` prepend 后已复跑。
  - `git diff --check`：passed。
  - `npm run build`（frontend）：passed；保留既有 Vite dynamic import/chunk-size warnings。
  - `npm run test -- --run src/services/shotReference/builder.test.ts src/services/shotReference/compile.test.ts src/services/shotReference/render.test.ts src/workflow/videoGenerationRequests.test.ts src/workflow/shotVideoPlan.test.ts src/workflow/shotRenderWorkflow.videoChain.test.ts src/services/promptCompilation/grokImageIndexCompiler.test.ts src/services/promptCompilation/videoRequestCompiler.test.ts src/services/ShotPromptService.test.ts src/store/promptTemplates.test.ts`（frontend）：10 files / 89 tests passed。
  - `npm run test -- --run src/workflow/videoGenerationRequests.test.ts src/workflow/shotVideoPlan.test.ts src/workflow/shotRenderWorkflow.videoChain.test.ts src/services/shotReference/builder.test.ts src/services/shotReference/compile.test.ts src/services/promptCompilation/videoRequestCompiler.test.ts`（frontend）：6 files / 53 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `git diff --check`：passed。
  - `npm run build`（frontend）：passed；保留既有 Vite dynamic import/chunk-size warnings。
  - `git diff --check`：passed。

### Follow-up: Tweet Narration Dialogue Mode
- **Status:** complete
- Actions taken:
  - 用户要求推文化小说转分镜时，剧情模式能根据第一人称解说生成主角独白/角色对白，让无解说视频也能看懂；解说模式保持当前旁白主导，只需要少量台词。
  - 新增 `narrativeMode` 工具，统一 `drama` / `narration` 的模式归一、中文标签和分镜/视频台词约束文案。
  - `CreationContext` 读取项目 `mode` 并作为 `projectMode` 暴露给分镜拆解、生图和视频提示词服务。
  - `ShotAnalysisService` 与旧 `ScriptAnalysisService.generateShots()` 都向 `shot_breakdown` 注入 `projectNarrativeMode` / `dialogueModeDirective`；模板仍要求 `scriptLineIndices` 完整覆盖原文，但 `dialogue` 字段按模式处理。
  - 生图、九宫格/四宫格和 8 个视频 reasoning 模板都接入 `dialogueModeDirective`，保证图片锚点和视频对白策略一致。
  - `ShotPromptService` 的台词证据提取增加模式参数：剧情模式会把“我意识到/我不能/她自称...”等第一人称推文素材转成短对白；解说模式不会强行把这些素材补进 `对白提示词`。
  - 补充回归测试覆盖剧情模式主角独白、解说模式不对白化、以及视频兜底按模式分支。
- Validation:
  - `npm run test -- --run src/services/ShotPromptService.test.ts src/store/promptTemplates.test.ts`（frontend）：2 files / 25 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npm run build`（frontend）：passed；保留既有 Vite dynamic import/chunk-size warnings。
  - `git diff --check`：passed。

### Follow-up: Anchor Mention Highlight + No Fake Grid Anchor
- **Status:** complete
- Actions taken:
  - 用户反馈 `@grid_anchor` 在提示词编辑器中没有高亮，并要求确认没有生成分镜图时不能内置该变量。
  - 扩展 `mentionTypes`：新增 `AssetMentionType` / `AnchorMentionType`，解析 `@shot_anchor` / `@grid_anchor`，并提供 built-in mention item。
  - `ScriptEditor` 解析器优先返回内置锚点 item；`mentionPlugin` / `mentionTooltip` / 补全标签补齐 shot/grid 样式和说明。
  - `useShotAssetSync`、Grok prompt compilation、video request readable compilation 改为只处理资产 mention，跳过 shot/grid 锚点。
  - `decideShotsMode()` 改为只有 `bundle.hasGridAnchor=true` 时才输出 grid-4/grid-9 shotsSection；无真实分镜图时走 normal shotsSection。
  - `buildSpatialAnchorDirective()` 改为以 `referenceBundle.hasShotImage` 判断是否存在真实生成图，不再把 `shot.imagePrompt` 文本误当成视频可读图。
  - 移除视频提示词生成时的隐藏 grid imagePrompt 预生成；没有真实生成图时直接使用文生/多参考模式，不生成假锚点上下文。
  - `renderShotReferenceTable()`、生图模板、8 个视频推理模板增加“只有真实锚定图存在才允许 `@shot_anchor/@grid_anchor`”约束。
  - 补测试覆盖 anchor mention 解析、无 anchor 时 shotsMode 回退 normal、referenceTable 禁止假锚点、模板锚点存在性约束。
- Validation:
  - `npm run test -- --run src/editor/mentionTypes.test.ts src/services/shotReference/builder.test.ts src/services/shotReference/render.test.ts src/services/shotReference/shotsOutputFormat.test.ts`（frontend）：4 files / 65 tests passed。
  - `npm run test -- --run src/services/ShotPromptService.test.ts src/store/promptTemplates.test.ts`（frontend）：2 files / 21 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npm run build`（frontend）：passed；保留既有 Vite dynamic import/chunk-size warnings。
  - `git diff --check`：passed。
- Errors:
  - 首次在 repo 根目录跑 `npm run test -- ...` 失败：根 package 没有 `test` script。改到 `frontend/` 目录后目标测试全部通过。

### Follow-up: Anchor Tooltip Preview Image
- **Status:** complete
- Actions taken:
  - 用户反馈 `@grid_anchor` 高亮悬浮窗中没有图片展示。
  - `ScriptEditor` mention resolver 改为优先使用调用方传入的 mention item，找不到时才回退到 built-in anchor item，避免静态内置说明覆盖带 `previewImage` 的真实分镜锚点。
  - `ShotCard` 根据当前分镜选中的有效生成图追加局部锚点 mention item：grid 模式为 `@grid_anchor`，普通模式为 `@shot_anchor`。
  - 与 bundle 规则对齐：如果当前选中图是 `metadata.gridCell` 拆分子图，不作为锚点预览。
- Validation:
  - `npm run test -- --run src/editor/mentionTypes.test.ts src/services/shotReference/builder.test.ts src/services/shotReference/render.test.ts`（frontend）：3 files / 47 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。

### Follow-up: Storyboard Video ITV Upload Protocol
- **Status:** complete
- Actions taken:
  - 用户反馈分镜视频生成会调用语音生成、Koma 官方 Grok 没有触发 qiniu 图床上传，并且自定义 `openai-video` 渠道上游报 `Reference placeholders require uploaded images`。
  - `shotRenderWorkflow` 移除分镜视频完成后的 `generateAudio()` 调用和 TTS provider/logging 依赖；视频链路现在只创建视频版本并提交 ITV 生成。
  - `videoRequestCompiler` / `MediaGenerationService` / 灵绘视频执行 provider 将 `fallbackToSourceOnRequiredUploadFailure` 默认和调用点统一为 `false`；URL-only provider 需要远程 URL 时必须图床上传成功，失败会在本地提前报错，不再把 data-url 发给上游。
  - `OpenAIVideoITVProvider` 的图片传输能力收敛为 remote-url；当 prompt 使用 `@Image N` / `@图片N` 占位符时，image-to-video 请求同时保留 `image` 主图字段，并把 `[primaryImage, ...additionalReferences]` 写入 `images`，让占位符和上传图片数组一致。
  - 根据真实运行日志继续修复：Koma 官方 Grok `/v1/videos` 走 URL-array JSON 协议，内部编译仍保持 `@Image N`，但最终 body.prompt 改为 `图片N`，避免 OpenAI-compatible 上游把 `@Image N` 当成 multipart 上传占位符并报 `Reference placeholders require uploaded images`。
  - `Grok2ApiImagineITVProvider` 出站 body 增加 `metadata.function_mode`：图生视频为 `first_frame`，参考生视频为 `omni_reference`，让网关更明确地按图片参考模式处理。
  - Grok 默认参考图数量从 4 提升到 provider 实际上限 7，并把 grok-image-index 的 provider 映射上限同步为 6 个额外参考图，避免 1 张锚点 + 场景/角色/道具时过早裁掉道具。
  - 分镜视频执行前会对旧的 `shot.videoPrompt` 做 `sanitizeVideoPromptResult()` + `ensureExplicitDialogueInVideoPrompt()` 清洗，去掉来源叙述泄漏；`ShotRender` 日志、AI 调用日志和版本 prompt 改为记录编译后的最终 prompt。
  - 补充回归测试覆盖：分镜视频不调用语音、URL-only 上传失败提前失败、可显式 opt-in data-url fallback、OpenAI 占位符请求包含主图和参考图、Grok URL-array 出站 prompt 不含 `@Image`、Grok 参考图上限为 7、旧脏对白不重复补台词。
- Validation:
  - `npm run test -- --run src/workflow/shotRenderWorkflow.videoChain.test.ts src/workflow/videoGenerationRequests.test.ts src/workflow/shotVideoPlan.test.ts src/services/shotReference/compile.test.ts src/services/promptCompilation/videoRequestCompiler.test.ts src/services/MediaGenerationService.itvPolicy.test.ts src/providers/itv/OpenAIVideoITVProvider.test.ts src/providers/itv/Grok2ApiImagineITVProvider.test.ts`（frontend）：8 files / 68 tests passed。
  - `npm run test -- --run src/providers/itv/Grok2ApiImagineITVProvider.test.ts src/providers/itv/modelCatalog.test.ts src/services/promptCompilation/videoRequestCompiler.test.ts src/services/ShotPromptService.test.ts src/workflow/videoGenerationRequests.test.ts src/workflow/shotRenderWorkflow.videoChain.test.ts src/workflow/shotVideoPlan.test.ts`（frontend）：7 files / 60 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npm run build`（frontend）：passed；保留既有 Vite dynamic import/chunk-size warnings。
  - `npm run build-electron`：passed。
  - `git diff --check`：passed。

## Session: 2026-05-06 Linghui Tapnow-Base Capability Audit

### Phase 1: Reference Audit
- **Status:** complete
- Actions taken:
  - 使用 `pi-planning-with-files` 技能恢复并更新本地计划文件。
  - 确认当前 Koma 工作树已有未提交灵绘改动：`linghui/panorama` 新节点、图片/执行/画布/类型/文档相关文件均已被修改。
  - 初扫参考项目 `/Users/sunmeng/workspace/tapnow-base`，确认其是轻量 React 节点画布，核心入口包含 `components/Canvas.tsx`、多种 `components/Nodes/*`、`services/mode/*` 模型通道配置与 `Settings/ExportImportModal.tsx`。
  - 对照 tapnow-base 节点类型后确认：Koma 灵绘底层已覆盖文生图、图生图、文生视频、图生视频、首尾帧视频、媒体导入、历史与导入导出；本轮应补的是基础 Recipe 入口与全景节点闭环。
  - 发现 `linghui/panorama` 作为图片节点家族的静态解析不完整，以及全景预览新文件存在会触发样式纪律的普通 inline style。
- Files created/modified:
  - `task_plan.md` (updated)
  - `progress.md` (updated)
  - `findings.md` (updated)

### Phases 2-4: Diff Review, Implementation, Validation
- **Status:** complete
- Actions taken:
  - 审查现有 `linghui/panorama` 半接入改动，确认它应该作为图片节点家族的独立节点类型存在，而不是复制 tapnow-base 的独立轻量节点系统。
  - 新增 4 个内置 Recipe：图片基础流、视频基础流、首尾帧视频流、全景环境流，让 tapnow-base 的基础节点能力在 Koma 里有一键工作流入口。
  - 补齐全景节点闭环：类型/RF 类型映射、节点库默认值、编辑器接入、画布节点预览、全屏 720° 查看、执行计划时长、执行器提示词模板、持久化白名单和静态导入结果解析。
  - 修正全景节点作为图片家族被下游消费的路径：`getInputResult`、`getAllInputResults`、静态导入结果、提示词引用 fallback 和生成结果主图选择都识别 `linghui/panorama`。
  - 将全景 viewer 的普通 inline style 移入 Linghui Sass partial；新增路径局部 grep 未发现 inline style/hex/rgba 命中。
  - 修正 `ImageNode.tsx` 节点样式 memo 依赖，避免对象引用导致无意义重算。
- Validation:
  - `npm run test -- --run src/components/linghui/library/tests/linghuiNodeDefs.test.ts src/components/linghui/editors/tests/linghuiPromptReferences.test.ts src/components/linghui/execution/tests/linghuiExecutionShared.test.ts src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/store/linghuiStorage.test.ts`：5 files / 21 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。
  - `npm run check:style-discipline`：failed on existing unrelated files (`project`, `storyboard`, `chat`, `theme` comments, `index.scss` first-paint token snapshot); new Linghui panorama/Recipe paths were not in the reported failures.
- Files created/modified:
  - `frontend/src/components/linghui/library/state/linghuiRecipeTemplates.ts`
  - `frontend/src/components/linghui/execution/state/linghuiExecutionShared.ts`
  - `frontend/src/components/linghui/editors/state/linghuiPromptReferences.ts`
  - `frontend/src/components/linghui/editors/tests/linghuiPromptReferences.test.ts`
  - `frontend/src/components/linghui/nodes/components/ImageNode.tsx`
  - `frontend/src/components/linghui/panorama/*`
  - `frontend/src/components/linghui/page/styles/_media-panels.scss`
  - `frontend/src/components/linghui/page/styles/_compact-nodes.scss`
  - 相关类型、节点定义、执行器、存储与测试文件

## Session: 2026-05-06 Linghui Canvas Interaction Audit

### Phase 1-3: Cleanup, Audit, First Fixes
- **Status:** complete
- Actions taken:
  - 根据用户反馈修正方向：本轮目标不是新增工作流模板，而是优化灵绘画布基础操作与执行反馈。
  - 暂时隐藏内置系统 Recipe，避免工作流模板继续占据主线入口；工作区用户自保存模板仍由存储层保留。
  - 审计现有画布交互后确认主要摩擦点：
    - 锚点尺寸只有 10px，拖线命中困难。
    - “运行全部”主要藏在右键菜单/面板入口里，发现成本高。
    - 连线虽然能按状态变色，但执行流动画和 hover 反馈偏弱。
    - 连接失败只有 toast，回头无法追踪失败原因。
    - 节点失败 toast 只报失败数量，缺少第一失败节点和错误摘要。
  - 已落第一批修复：
    - HUD 常驻新增“运行全部 / 运行选中”按钮。
    - 空白右键菜单把“运行全部 / 运行选中”前置，节点/工作流块右键把运行操作前置并标为 primary。
    - 锚点从 10px 增至 14px，并增加 hover/连接态光圈。
    - 连线交互宽度从 24 增至 36，增加 glow path、运行流动动画、连接预览动画和 hover 强化。
    - 上游阻塞日志包含具体失败上游节点；执行失败 toast 显示第一个失败节点和错误摘要。
    - 连接失败写入执行日志，避免错误原因一闪而过。
- Validation:
  - `npm run test -- --run src/store/linghuiStorage.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts src/components/linghui/execution/tests/linghuiExecutionWorkflow.test.ts`：3 files / 19 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。
  - `npm run check:style-discipline`：failed only on existing unrelated project/storyboard/chat/theme/index.scss debt after fixing new `LinghuiEdge` `cssVars(...)` usage.
- Files created/modified:
  - `frontend/src/components/linghui/library/state/linghuiRecipeTemplates.ts`
  - `frontend/src/store/linghuiStorage.test.ts`
  - `frontend/src/components/linghui/canvas/components/LinghuiCanvasHud.tsx`
  - `frontend/src/components/linghui/canvas/components/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/canvas/components/LinghuiCanvasContextMenu.tsx`
  - `frontend/src/components/linghui/canvas/components/LinghuiEdge.tsx`
  - `frontend/src/components/linghui/page/components/LinghuiPage.tsx`
  - `frontend/src/components/linghui/execution/state/linghuiExecutionWorkflow.ts`
  - `frontend/src/components/linghui/page/styles/_canvas-reactflow.scss`
  - `frontend/src/components/linghui/page/styles/_compact-nodes.scss`
  - `frontend/src/components/linghui/page/styles/_canvas-overlays.scss`

### Phase 4: Failure Feedback Second Pass
- **Status:** complete
- Actions taken:
  - 新增通用 `LinghuiNodeRunError`，文本、Agent、脚本、音频、图片、视频和通用节点壳层都能在节点本体上直接展示失败原因。
  - HUD 接入 `executionLogs`，在执行中、存在失败或最近有错误时显示最近 5 条执行日志；带 `nodeId` 的日志项可点击定位相关节点。
  - 失败执行完成后自动聚焦并选中首个失败节点，减少用户在大画布里手动寻找错误节点的成本。
  - 日志 HUD 默认不常驻显示普通历史成功记录，避免占用画布底部空间。
- Validation:
  - `npm run test -- --run src/store/linghuiStorage.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts src/components/linghui/execution/tests/linghuiExecutionWorkflow.test.ts src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/components/linghui/execution/tests/linghuiExecutionShared.test.ts`：5 files / 27 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。
  - `npm run check:style-discipline`：failed only on existing unrelated project/storyboard/chat/theme/index.scss debt；新增 Linghui 文件未出现在失败列表中。
  - 本地 dev server 启动在 `http://127.0.0.1:5174/`；DevTools 烟测确认应用挂载到激活页。当前环境受激活页阻挡，未执行真实灵绘画布点击/拖拽烟测。
- Files created/modified:
  - `frontend/src/components/linghui/nodes/components/LinghuiNodeRunError.tsx`
  - `frontend/src/components/linghui/nodes/components/TextNode.tsx`
  - `frontend/src/components/linghui/nodes/components/AgentNode.tsx`
  - `frontend/src/components/linghui/nodes/components/ScriptNode.tsx`
  - `frontend/src/components/linghui/nodes/components/AudioNode.tsx`
  - `frontend/src/components/linghui/nodes/components/ImageNode.tsx`
  - `frontend/src/components/linghui/nodes/components/VideoNode.tsx`
  - `frontend/src/components/linghui/nodes/components/LinghuiNodeShell.tsx`
  - `frontend/src/components/linghui/canvas/components/LinghuiCanvasHud.tsx`
  - `frontend/src/components/linghui/canvas/components/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/canvas/state/linghuiCanvasTypes.ts`
  - `frontend/src/components/linghui/page/components/LinghuiPage.tsx`
  - `frontend/src/components/linghui/page/styles/_canvas-overlays.scss`
  - `frontend/src/components/linghui/page/styles/_compact-nodes.scss`
  - `frontend/src/components/linghui/page/styles/_canvas-reactflow.scss`

### Phase 5: Magnetic Handles
- **Status:** complete
- Actions taken:
  - 新增并接入统一 `LinghuiNodeHandle`，文本、Agent、脚本、音频、图片、视频和通用节点壳层都使用同一套输入/输出端口组件。
  - `LinghuiNodeHandle` 统一根据 slot 数据类型解析端口颜色，并通过 `cssVars(...)` 写入 `--linghui-handle-bg` / `--linghui-handle-top`，避免回退到普通 inline style。
  - `LinghuiCanvasStage` 显式把 React Flow `connectionRadius` 提高到 `56`，并把 `connectionDragThreshold` 降到 `1`，让拖线进入端口附近范围即可吸附连接，不需要像素级碰到圆点。
  - `.linghuiNodeMagnetHandle` 统一端口视觉和交互目标：30px 起手热区、56px 磁吸光圈、hover/connectingfrom/connectingto/valid 状态动画、有效连接预览线强化。
  - 移除旧 `.linghuiCompactHandle` / `.linghuiRFHandle` 的独立尺寸规则，仅保留为兼容别名，避免不同节点族端口手感不一致。
- Validation:
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。
  - `npm run test -- --run src/store/linghuiStorage.test.ts src/components/linghui/library/tests/linghuiNodeDefs.test.ts src/components/linghui/execution/tests/linghuiExecutionWorkflow.test.ts src/components/linghui/execution/tests/linghuiExecutionImageNode.test.ts src/components/linghui/execution/tests/linghuiExecutionShared.test.ts`：5 files / 27 tests passed。
  - `npm run test -- --run src/components/linghui/nodes/tests/VideoNode.test.tsx`：1 file / 3 tests passed。
  - `npm run check:style-discipline`：failed only on existing unrelated `project` / `storyboard` / `chat` / `theme` / `index.scss` debt；新增 Linghui 磁吸端口路径未出现在失败列表中。
- Files created/modified:
  - `frontend/src/components/linghui/nodes/components/LinghuiNodeHandle.tsx`
  - `frontend/src/components/linghui/nodes/components/TextNode.tsx`
  - `frontend/src/components/linghui/nodes/components/AgentNode.tsx`
  - `frontend/src/components/linghui/nodes/components/ScriptNode.tsx`
  - `frontend/src/components/linghui/nodes/components/AudioNode.tsx`
  - `frontend/src/components/linghui/nodes/components/ImageNode.tsx`
  - `frontend/src/components/linghui/nodes/components/VideoNode.tsx`
  - `frontend/src/components/linghui/nodes/components/LinghuiNodeShell.tsx`
  - `frontend/src/components/linghui/canvas/components/LinghuiCanvasStage.tsx`
  - `frontend/src/components/linghui/page/styles/_canvas-reactflow.scss`
  - `frontend/src/components/linghui/page/styles/_compact-nodes.scss`

### Phase 7: Video Duration Constraints
- **Status:** complete
- Actions taken:
  - 审计发现项目已有 `providers/itv/durationSpec.ts`，聊天和分镜已按当前 ITV 渠道动态限制时长；灵绘视频节点仍使用固定 `Number(props.duration ?? 5)` 和通用 5/10/15/30 slider。
  - 确认 Koma 官方即梦 provider/model 已有范围表达：`seedance-2.0` 为 4-15 秒，`seedance-2.0-fast` 为 4-12 秒；Grok provider 注释要求枚举 6/12/16/20，但旧 fallback spec 和旧 `utils/videoDuration` 仍包含历史 10 秒。
  - 将 Grok 默认/兜底时长统一为 `6/12/16/20`，默认 `6`；移除历史 10 秒暴露。
  - 灵绘视频编辑器接入 `VideoDurationSpec`：按当前 selection 的 modelId/providerType 解析时长约束，Grok 渲染枚举按钮，即梦/Seedance 渲染 4-15 或 4-12 秒范围 slider，并在参数摘要中使用归一后的时长。
  - 为已有 `seedance-*` selection 增加 modelId 级别即时识别，避免等待设置异步加载期间把 5 秒短暂吸到 Grok 兜底 6 秒。
  - 切换视频模型时会按目标模型约束归一 `duration`，用户手动改时长也会按当前 spec clamp。
  - 灵绘执行层在调用 `buildVideoCapabilityRequest` 前按候选 ITV 渠道/model 二次归一，避免绕过 UI 或旧数据把非法时长发给 provider。
  - prompt 编译的 `buildVideoCapabilityRequest` 支持显式 `durationSpec`，保留旧 Grok fallback 作为无上下文兜底。
- Validation:
  - `npm run test -- --run src/providers/itv/durationSpec.test.ts src/services/promptCompilation/videoRequestCompiler.test.ts src/providers/itv/Grok2ApiImagineITVProvider.test.ts src/components/linghui/editors/tests/VideoNodeEditor.test.tsx src/components/linghui/execution/tests/linghuiExecutionProviders.test.ts`：5 files / 60 tests passed。
  - `npm run test -- --run src/components/linghui/editors/tests/VideoNodeEditor.test.tsx src/components/linghui/execution/tests/linghuiExecutionVideoNode.test.ts src/components/linghui/execution/tests/linghuiExecutionProviders.test.ts src/components/linghui/nodes/tests/VideoNode.test.tsx`：4 files / 25 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。
  - `npm run check:style-discipline`：failed only on existing project/storyboard/chat/theme/index.scss inline style / color comment debt；本轮视频时长路径未出现在失败列表中。
- Files created/modified:
  - `frontend/src/providers/itv/durationSpec.ts`
  - `frontend/src/utils/videoDuration.ts`
  - `frontend/src/services/promptCompilation/videoRequestCompiler.ts`
  - `frontend/src/providers/channel/resolver.ts`
  - `frontend/src/components/linghui/editors/components/VideoNodeEditor.tsx`
  - `frontend/src/components/linghui/editors/components/VideoNodeEditorPanels.tsx`
  - `frontend/src/components/linghui/editors/state/videoNodeEditorShared.ts`
  - `frontend/src/components/linghui/execution/state/providers/video.ts`
  - 相关 tests

### Phase 8: Execution Log Sidebar Panel
- **Status:** complete
- Actions taken:
  - 根据用户反馈确认执行日志的主要问题是“画布 HUD 自动出现且无法关闭”，而不是日志内容本身。
  - 从 `LinghuiCanvasHud`、`LinghuiCanvas` 和 `LinghuiCanvasProps` 移除 `executionLogs` / `onFocusLogNode` 传递，删除旧的底部 `linghuiCanvasRunLog` 自动浮层。
  - 在左侧浮动菜单新增“执行日志”入口，错误日志数量以 badge 显示；打开后展示最近 24 条日志、总记录数和最近更新时间。
  - 新日志面板支持手动关闭与展开/收起；带 `nodeId` 的日志项仍可点击定位相关节点。
  - 项目列表、执行日志和素材/工作流/历史抽屉做互斥打开，避免多个浮层叠在画布左侧。
  - 将日志级别图标映射提到组件外，减少左侧 rail memo 的无意义刷新。
- Validation:
  - `npm run test -- --run src/providers/itv/durationSpec.test.ts src/components/linghui/editors/tests/VideoNodeEditor.test.tsx src/components/linghui/execution/tests/linghuiExecutionProviders.test.ts src/providers/itv/Grok2ApiImagineITVProvider.test.ts src/providers/itv/modelCatalog.test.ts`：5 files / 57 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。
  - `rg` 确认旧 HUD 日志入口/样式引用已移除：`executionLogs=`、`onFocusLogNode=`、`linghuiCanvasRunLog`、`LinghuiCanvasRunLog` 均无命中。
- Files created/modified:
  - `frontend/src/components/linghui/canvas/components/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/canvas/components/LinghuiCanvasHud.tsx`
  - `frontend/src/components/linghui/canvas/state/linghuiCanvasTypes.ts`
  - `frontend/src/components/linghui/page/components/LinghuiPage.tsx`
  - `frontend/src/components/linghui/page/styles/_canvas-overlays.scss`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### Phase 9: Duplicate Submission Guard
- **Status:** complete
- Actions taken:
  - 审计确认：同一页面内重复点击会被 `executionAbortControllerRef` 拦截；但刷新/恢复后如果节点仍是 `running`，旧逻辑会重新进入 `executeNode` 并再次调用视频/生图 provider `start()`。
  - 在 `linghuiExecutionWorkflow.ts` 新增 `detectLinghuiRunningNodeBlocks`，按目标节点和依赖链计算本次执行会覆盖的节点，并识别仍在有效轮询窗口内的 `running` 节点。
  - `executeLinghuiWorkflow` 增加兜底保护：目标链路里有运行中节点时直接抛错，不再进入 `executeNode`，从根上避免重复提交 provider。
  - `LinghuiPage` 在生成执行计划与正式运行前都做相同检测；检测到运行中节点时 toast 提示、聚焦该节点，并写入 warn 级执行日志。
  - 为旧异常状态保留逃生口：默认轮询窗口 10 分钟 + 1 分钟宽限后，过期 `running` 状态不再阻止重新触发。
  - 扩展 `LinghuiExecutionLogEntry.level` 支持 `warn`，复用执行日志面板的黄色告警样式。
- Validation:
  - `npm run test -- --run src/components/linghui/execution/tests/linghuiExecutionWorkflow.test.ts src/components/linghui/execution/tests/linghuiExecutionProviders.test.ts src/components/linghui/editors/tests/VideoNodeEditor.test.tsx src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/providers/itv/durationSpec.test.ts src/providers/itv/Grok2ApiImagineITVProvider.test.ts src/providers/itv/modelCatalog.test.ts`：7 files / 69 tests passed。
  - `npm run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。
- Files created/modified:
  - `frontend/src/components/linghui/execution/state/linghuiExecutionWorkflow.ts`
  - `frontend/src/components/linghui/execution/state/linghuiExecution.ts`
  - `frontend/src/components/linghui/execution/tests/linghuiExecutionWorkflow.test.ts`
  - `frontend/src/components/linghui/page/components/LinghuiPage.tsx`
  - `frontend/src/types/linghui.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### Phase 10: Diagnostics Log Export
- **Status:** complete
- Actions taken:
  - 参考 Electron 官方日志路径和 `webContents.console-message` 机制，确认本轮不采用纯前端劫持 `console` 作为唯一方案，而是主进程集中落盘 + renderer 专用 IPC 追加。
  - 新增 `electron/service/diagnostics.ts` 和 `electron/controller/diagnostics.ts`，提供前端日志追加、日志列表、清理前端日志、导出诊断 zip 四个固定能力。
  - `electron/main.ts` 启动阶段设置默认 logs path；`services.diagnostics` 初始化到当前 `storageRoot/logs`；`controller/project.setStorageRoot` 切换目录时同步 diagnostics、Linghui 和 ffmpeg 根路径。
  - `electron/preload/bridge.ts` 增加 `controller/diagnostics/*` 白名单和 `electronAPI.diagnostics`，不暴露通用文件写入/任意目录打包能力。
  - `electron/preload/lifecycle.ts` 监听 renderer `console-message` 并写到 `logs/console/koma-console-YYYY-MM-DD.log`，项目内 `createLogger` 写到 `logs/renderer/koma-renderer-YYYY-MM-DD.log`。

### Phase 11: Editor Action Click Guard
- **Status:** complete
- Actions taken:
  - 新增 `useLinghuiActionLock`，在提交动作第一次点击时立即短暂锁定，防止 React 运行态刷新前的连续双击穿透。
  - 图片节点生成按钮接入首击锁；全景节点复用图片编辑器，因此同步受保护。
  - 视频节点生成按钮保留运行中 loading/禁用逻辑，并额外从父层传入即时锁状态。
  - 文本、音频、Agent、脚本生成按钮接入同一套锁；音频/文本/Agent/脚本运行中也会显示 loading 并禁用。
  - 脚本节点的“生成分镜图 / 生成视频流程”批量按钮接入独立锁，避免双击创建重复后续生成节点。
  - 多角度相机弹窗“创建并生图”接入锁，避免重复创建多角度生成任务。
- Validation:
  - `npm --prefix frontend run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/components/linghui/editors/tests/VideoNodeEditor.test.tsx`：2 files / 13 tests passed。
  - `npm --prefix frontend run build`：passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check`：passed。
- Files created/modified:
  - `frontend/src/components/linghui/editors/hooks/useLinghuiActionLock.ts` (created)
  - `frontend/src/components/linghui/editors/components/ImageNodeEditor.tsx`
  - `frontend/src/components/linghui/editors/components/VideoNodeEditor.tsx`
  - `frontend/src/components/linghui/editors/components/VideoNodeEditorPanels.tsx`
  - `frontend/src/components/linghui/editors/components/TextNodeEditor.tsx`
  - `frontend/src/components/linghui/editors/components/AudioNodeEditor.tsx`
  - `frontend/src/components/linghui/editors/components/AgentNodeEditor.tsx`
  - `frontend/src/components/linghui/editors/components/ScriptNodeEditor.tsx`
  - `frontend/src/components/linghui/editors/components/LinghuiMultiAngleModal.tsx`
  - `frontend/src/components/linghui/editors/tests/ImageNodeEditor.test.tsx`
  - `frontend/src/components/linghui/editors/tests/VideoNodeEditor.test.tsx`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - 重写 `frontend/src/store/logger.ts` 文件落盘路径，移除“读整文件再重写追加”的旧逻辑，改为调用 `electronService.diagnostics.appendRendererLog`，保留控制台输出。
  - 设置页新增“日志/诊断”入口和 `LogDiagnosticsSettings`，支持查看日志数量/大小、打开日志目录、刷新、清理前端日志和导出 zip。
  - 为 `electronService` 增加 diagnostics 类型封装与基础测试。
- Validation:
  - `npm run verify:ipc-whitelist` passed：controllers 10 files / methods 151 / whitelist 151。
  - `npm --prefix frontend run test -- --run src/services/electronService.test.ts src/store/projectOpenService.test.ts`：2 files / 8 tests passed。
  - `npm --prefix frontend run test -- --run src/components/linghui/execution/tests/linghuiExecutionWorkflow.test.ts src/components/linghui/editors/tests/VideoNodeEditor.test.tsx src/providers/itv/durationSpec.test.ts`：3 files / 41 tests passed。
  - `npm run build-electron` passed。
  - `npm --prefix frontend run build` passed；仅保留既有 Vite dynamic import/chunk size warnings。
  - `git diff --check` passed。
- Files created/modified:
  - `electron/service/diagnostics.ts`
  - `electron/controller/diagnostics.ts`
  - `electron/service/index.ts`
  - `electron/service/paths.ts`
  - `electron/controller/project.ts`
  - `electron/main.ts`
  - `electron/preload/bridge.ts`
  - `electron/preload/lifecycle.ts`
  - `frontend/src/services/electronService.ts`
  - `frontend/src/services/electronService.test.ts`
  - `frontend/src/store/logger.ts`
  - `frontend/src/components/settings/LogDiagnosticsSettings.tsx`
  - `frontend/src/components/settings/SettingsPage.tsx`
  - `frontend/src/components/settings/index.ts`
  - `frontend/src/index.scss`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

## Session: 2026-05-03 Theme System Architecture

### Phase 1: Worktree Setup
- **Status:** complete
- Actions taken:
  - 使用 `pi-planning-with-files` 技能启动本轮复杂任务管理。
  - 确认主目录 `/Users/sunmeng/workspace/Koma` 存在未提交改动，且这些改动与主题改造无关。
  - 创建独立 worktree `/Users/sunmeng/workspace/Koma-theme-worktree`，新分支 `codex/theme-system-architecture`。
  - 启动团队模式：
    - 前端架构师：只读审查主题架构和集成风险。
    - Worker A：`frontend/src/theme/**` 主题核心。
    - Worker B：`frontend/src/index.tsx` / `frontend/src/index.css` 入口和 Tailwind 转发。
    - Worker C：设置页与 `AppSettings` 持久化。
- Files created/modified:
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)

### Phase 2: Architecture Recon
- **Status:** complete
- Actions taken:
  - 阅读 `frontend/src/theme/tokens.ts`、`antdTheme.ts`、`index.ts`、`frontend/src/index.tsx`，确认现有主题入口集中。
  - 阅读 `frontend/src/index.css`，确认 Tailwind `@theme` 与 `:root` 兼容别名都写在同一文件。
  - 阅读 `frontend/src/store/settings/core.ts`、`globalStore.ts`、`AppSettings` 类型和 `SettingsPage.tsx`，确认 UI theme 可走 `settings.json/localStorage`。
  - 记录已有创作风格 `ThemeSelector` 与 UI 主题命名冲突风险。
- Files created/modified:
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)

### Phase 3: Theme Core, Entry, Settings Integration
- **Status:** complete
- Actions taken:
  - 合并前端架构师与 3 个 worker 的结果，并将临时 `themeId` 设置字段收敛为 `uiThemeId`，避免和创作风格主题命名混淆。
  - 新增 `frontend/src/theme/**` 分层：palettes、themes、compile、runtime hooks/provider/persistence，并保留 `tokens` / `antdTheme` 旧导出兼容。
  - 入口从静态 Antd `ConfigProvider` 改为 `ThemeProvider`，由 active theme 同时写入 CSS vars 与 Antd theme config。
  - `index.css` 的 Tailwind `@theme` 改为 `var(--token-*)` 转发，并写入默认 `dark-emerald` token 快照作为首屏兜底。
  - 设置页新增“外观/主题”section，使用 `useTheme()` 立即切换 `dark-emerald` / `dark-business`，并通过 settings 存储持久化。
  - `AppearanceThemeSettings` 的动态色块仅使用 CSS 变量桥接 inline style，其余样式移入 `index.css`。
  - 执行两次 `npm run build`，最终构建通过；仅保留既有 Vite chunk/dynamic import 警告。
- Files created/modified:
  - `frontend/src/theme/**` (created/updated)
  - `frontend/src/index.tsx` (updated)
  - `frontend/src/index.css` (updated)
  - `frontend/src/components/settings/AppearanceThemeSettings.tsx` (created)
  - `frontend/src/components/settings/SettingsPage.tsx` (updated)
  - `frontend/src/components/settings/index.ts` (updated)
  - `frontend/src/store/settings/core.ts` (updated)
  - `frontend/src/store/settings/index.ts` (updated)
  - `frontend/src/store/settings/uiTheme.ts` (created)
  - `frontend/src/store/globalStore.ts` (updated)
  - `frontend/src/types/provider-config.ts` (updated)
  - `frontend/src/types.ts` (updated)
  - `task_plan.md` / `findings.md` / `progress.md` (updated)

### Phase 4: Source CSS to SCSS Migration
- **Status:** complete
- Actions taken:
  - 将源代码内项目自有普通 CSS 与 CSS Modules 全部迁移为 Sass：
    - `frontend/src/index.css` -> `frontend/src/index.scss`
    - asset 样式文件 -> `.scss`
    - chat CSS Modules -> `.module.scss`
    - storyboard 样式文件 -> `.scss`
  - 同步更新所有本项目样式 import；TS/TSX 中剩余 `.css` import 仅为第三方库样式。
  - 修复 `index.scss` 中错误替换产生的无效 `-border-*` / `-surface-*` / `-accent-*` / `-skeleton-*` 值，恢复为 `$settings-*` SCSS 变量引用。
  - 修复迁移后 `.module.scss` 中残留的 CSS-in-JS camelCase 属性，改成标准 kebab-case CSS/SCSS 属性。
  - 为 `*.module.scss` 增加 TypeScript module declaration。
  - 运行审计：
    - `find frontend/src -type f \( -name '*.css' -o -name '*.module.css' \)` 输出为空。
    - `.css` import 仅剩 `ds-markdown/style.css`、`xgplayer/dist/index.min.css`、`@xyflow/react/dist/style.css`。
    - 新迁移的 asset/chat/storyboard SCSS 中无 hex/rgb/rgba 字面量，使用 `var(--token-*)` / `color-mix(...)`。
  - 执行 `npm run build`，构建通过；仅保留 Sass `@import "tailwindcss"` deprecation、既有 dynamic import/chunk size 警告。
- Remaining gaps:
  - `index.scss` 的 `:root` 默认 token 快照仍含 hex/rgba，这是首屏兜底值。
  - Linghui 既有 SCSS 仍有 `$lh-*` 硬编码颜色，尚未完成文档要求的全量业务 SCSS token 化。
  - 业务 TS/TSX 中仍有大量 inline style、硬编码颜色与 Tailwind arbitrary hex，属于后续 Phase 5/9 工作。
- Files created/modified:
  - `frontend/src/index.scss` (created/updated)
  - `frontend/src/css-modules.d.ts` (updated)
  - `frontend/src/components/asset/*.scss` (created)
  - `frontend/src/components/chat/*.module.scss` (created)
  - `frontend/src/chat/components/*.module.scss` (created/updated)
  - `frontend/src/components/storyboard/*.scss` (created)
  - 相关 TSX import 文件 (updated)
  - `task_plan.md` / `findings.md` / `progress.md` (updated)

### Phase 5: Light Business Theme
- **Status:** partial
- Actions taken:
  - 新增 `frontend/src/theme/themes/light-business.ts`，以明亮 slate 背景、blue 主色、轻量阴影和 `mode: 'light'` 实现商务明亮主题。
  - 扩展 `ThemeId` / `ThemeRegistry`，把 `light-business` 加入 `themes` registry；因 `AppThemeId = ThemeId`，设置持久化类型同步支持新主题。
  - 更新 `APP_THEME_OPTIONS`，设置页“应用主题”卡片可选择 `Light Business`，并沿用现有 `saveSettings` + `ThemeProvider.setTheme` 即时切换与持久化链路。
  - 确认 `themeToAntdConfig` 已按 `theme.meta.mode` 使用 `defaultAlgorithm` / `darkAlgorithm`，因此 light-business 会走 Antd 明亮算法。
  - 将文档点名的 `LinghuiCanvasStage.tsx` `colorMode="dark"` 改为 `colorMode={theme.meta.mode}`，并让背景点阵/minimap 遮罩根据主题 mode 调整。
  - 将 Storyboard / ShotCard / ScriptWorkbench / ScriptImportDialog 的 `ScriptEditor darkTheme={true}` 改为读取当前 theme mode。
  - 执行 `npm run build`，构建通过；仅保留 Sass `@import "tailwindcss"` deprecation、既有 dynamic import/chunk size 警告。
- Remaining gaps:
  - `rg` 显示项目/分镜/灵绘页面仍有大量 `bg-zinc-*` / `text-zinc-*` / `border-zinc-*` / inline hex/rgba；这些会影响 light-business 的完整视觉覆盖。
  - Linghui 既有 `_tokens.scss` 和多处 partial/TSX 仍未完全改为 `var(--token-*)`。
  - 尚未做 5 关键页截图回归、亮色对比度审计和 high-contrast。
- Files created/modified:
  - `frontend/src/theme/types.ts` (updated)
  - `frontend/src/theme/themes/index.ts` (updated)
  - `frontend/src/theme/themes/light-business.ts` (created)
  - `frontend/src/store/settings/uiTheme.ts` (updated)
  - `frontend/src/components/linghui/canvas/components/LinghuiCanvasStage.tsx` (updated)
  - `frontend/src/components/storyboard/Storyboard.tsx` (updated)
  - `frontend/src/components/storyboard/ShotCard.tsx` (updated)
  - `frontend/src/components/project/ScriptWorkbench.tsx` (updated)
  - `frontend/src/components/project/ScriptImportDialog.tsx` (updated)
  - `task_plan.md` / `findings.md` / `progress.md` (updated)

## Session: 2026-03-30

### Phase 1: Requirements & Discovery
- **Status:** complete
- **Started:** 2026-03-30
- Actions taken:
  - 读取 `planning-with-files-zht` 技能说明并初始化本次分析规划。
  - 读取 `agent-prompts/README.md`，确认采用 2 前端 + 2 后端并行分析模式。
  - 扫描 `Koma` 与 `SoulArtisan` 顶层目录，确认二者产品形态差异明显。
- Files created/modified:
  - `task_plan.md` (created)
  - `findings.md` (created)
  - `progress.md` (created)

### Phase 2: Codebase Exploration
- **Status:** complete
- Actions taken:
  - 已启动 4 个子 agent：
    - 前端A：分析 `SoulArtisan`
    - 前端B：分析 `Koma`
    - 后端A：分析 `SoulArtisan`
    - 后端B：分析 `Koma`
  - 本地主线程已读取：
    - `SoulArtisan/admin-web/App.tsx`
    - `SoulArtisan/agent-web/src/App.tsx`
    - `SoulArtisan/playlet/pom.xml`
    - `SoulArtisan/admin-web/types.ts`
    - `SoulArtisan/agent-web/src/api/*`
    - `Koma/frontend/src/App.tsx`
    - `Koma/frontend/src/workflow/README.md`
    - `Koma/frontend/src/providers/channel/*`
    - `Koma/electron/service/plugin/capability/CapabilityRegistry.ts`
  - 当前形成的中间判断：
    - `SoulArtisan` 偏站点化 AI 生产/运营平台
    - `Koma` 偏本地优先的专业创作工作站
  - 新增本地证据：
    - `electron/preload/bridge.ts` 显示主进程向前端暴露完整本地能力桥
    - `electron/service/plugin/runtime.ts` 与 `service/plugin/capability/*` 显示插件能力已进入 Electron 主进程统一注册与同步
    - `electron/service/chat/*` 与 `service/chat/mcp/MCPManager.ts` 显示主进程已具备 LangGraph Agent、多 Worker 编排与多传输 MCP 接入能力
    - `frontend/src/workflow/*` 与 `services/MediaGenerationService.ts` 显示业务工作流统一复用媒体执行、资产持久化与 ownerRef 绑定基础设施
- Files created/modified:
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)

### Phase 3: Synthesis & Verification
- **Status:** complete
- Actions taken:
  - 收到 2 前端 + 2 后端分析位的完整结论，并与主线程证据交叉核对。
  - 进一步确认 `SoulArtisan` 的双端形态是“运营后台 + 创作工作台 + Spring Boot 中台”。
  - 进一步确认 `Koma` 的核心势能不在模型名单，而在“统一能力层 + 本地资产闭环 + 可恢复执行链 + Electron 能力中台”。
  - 明确 `Koma` 当前最突出的问题是多工作台并存、默认主线与高级主线未收束，属于产品心智问题而非技术底座问题。
- Files created/modified:
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)

### Phase 4: Direction Archive
- **Status:** complete
- Actions taken:
  - 基于 `SoulArtisan` 工作流注册层、场景工作流配置、节点引导动作，与 `Koma` 当前 `Linghui` 节点定义、执行层、模板层做了对照归纳。
  - 输出正式方向文档，明确“底层统一、上层分开、引入工作流配方层、不做项目与 Linghui 任意图结构互映射”的演化原则。
  - 文档同时沉淀了 `Linghui` 当前不足、借鉴边界和建议实施顺序，供后续归档和拆解实现。
- Files created/modified:
  - `docs/linghui-workflow-evolution-direction.md` (created)
  - `progress.md` (updated)

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Planning initialization | Create planning files | Files exist with task scope | Created successfully | ✓ |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
|           |       | 1       |            |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 2 |
| Where am I going? | 等待 4 个分析位回收结论，并与本地主线程证据交叉验证 |
| What's the goal? | 输出 SoulArtisan vs Koma 的差异分析，并推演 Koma 的发展方向 |
| What have I learned? | SoulArtisan 更偏平台运营化，Koma 更偏创作工作站与能力平台化 |
| What have I done? | 已建立规划文件、启动并行团队、完成第一轮关键入口和 API 证据采集 |

---
*Update after completing each phase or encountering errors*

## Session: 2026-04-04

### Phase 1: Editor Style Audit & Planning
- **Status:** complete
- Actions taken:
  - 读取 `planning-with-files-zht` 技能说明并为本次“灵绘节点编辑窗口样式整治”建立新的规划文件。
  - 盘点 `LinghuiNodeEditor.tsx`、`ImageNodeEditor.tsx`、`TextNodeEditor.tsx`、`AudioNodeEditor.tsx`、`VideoNodeEditor.tsx`、`ScriptNodeEditor.tsx`、`AgentNodeEditor.tsx` 与 `LinghuiPage.css`。
  - 确认本次改造先从共享壳层和表单/提示区入手，再处理图片无图状态与文生图提示词融合。
- Files created/modified:
  - `task_plan.md` (created)
  - `findings.md` (created)
  - `progress.md` (updated)

### Phase 2: Shared Shell Cleanup & Targeted Fixes
- **Status:** complete
- Actions taken:
  - 更新 `LinghuiNodeEditor.tsx`，让图片节点在无图状态下隐藏顶部工具，只保留名称重命名与关闭动作。
  - 更新 `ImageNodeEditor.tsx`，把导入模式改成轻量预览/空态面板，并移除无意义的运行按钮。
  - 更新 `TextNodeEditor.tsx`、`AudioNodeEditor.tsx`、`ScriptNodeEditor.tsx`、`AgentNodeEditor.tsx`，统一将提示词编辑器切换到 `fusion` 内嵌样式。
  - 更新 `LinghuiPromptEditor.tsx`，去掉硬边框，改成内嵌阴影与柔和 focus ring。
  - 大幅调整 `LinghuiPage.css` 的 `linghuiNodeEditor*`、`linghuiEditor*`、输入框、选择器、按钮、空态卡片、资产卡片、脚本列表与引用区样式，整体转向更扁平、更少分隔线的编辑体验。
  - 在 DevTools 联调中发现 `ArrowUp is not defined` 运行时错误，已恢复 `ImageNodeEditor.tsx` 导入并重新验证。
- Files created/modified:
  - `frontend/src/components/linghui/editors/components/LinghuiNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/ImageNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/TextNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/AudioNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/ScriptNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/AgentNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/LinghuiPromptEditor.tsx` (updated)
  - `frontend/src/components/linghui/page/components/LinghuiPage.css` (updated)
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)

### Phase 3: Validation
- **Status:** complete
- Actions taken:
  - 两次执行 `npm --prefix frontend run build`，确认本轮改动在生产构建下可以通过。
  - 使用 Chrome DevTools 切回灵绘画布，确认图片空态节点的顶部工具已隐藏，只剩名称与关闭按钮。
  - 验证编辑浮层主体仍正常挂载在节点下方，未出现运行时报错。
- Files created/modified:
  - `progress.md` (updated)

### Phase 4: Video Popup Simplification
- **Status:** complete
- Actions taken:
  - 复查 `VideoNodeEditor.tsx`、`VideoNodeEditorPanels.tsx`、`videoNodeEditorShared.ts`、`LinghuiNodeEditor.tsx` 与 `LinghuiPage.css`，确认视频编辑器仍是旧的分段表单结构。
  - 确认当前“无视频时隐藏顶部处理菜单”的逻辑尚未接入，顶部工具栏只判断了透传节点，没有判断当前是否已有视频结果。
  - 确认可复用下载能力可参考 `ImageNode.tsx` 的保存流程，并结合 `VideoNode.tsx` 现有本地/远程视频源处理方式补齐视频下载。
  - 新增本轮子目标：主界面删掉输入预览、提示词标题与模型参数标题，改成模型摘要 + 参数摘要 + 二级参数弹层。
  - 更新 `VideoNodeEditor.tsx`，接入当前视频结果判断、下载动作和摘要式副标题，并让视频工具区只在真正有视频产物时显示。
  - 重写 `VideoNodeEditorPanels.tsx`，删除输入预览和冗余标题，改成模型 `Dropdown` 摘要、参数 `Popover`、比例/分辨率平铺选择和时长 `Slider`。
  - 更新 `videoNodeEditorShared.ts` 与 `types/linghui.ts`，补齐视频下载 helper、参数摘要格式化，以及更完整的视频比例/分辨率选项。
  - 更新 `LinghuiPage.css`，增加视频极简触发器、二级参数弹层、平铺选项和 Slider 的样式。
  - 修正 `VideoNodeEditor.test.tsx` 的 mock 路径与断言，覆盖新的摘要式视频编辑交互。
  - 运行 `npm --prefix frontend run build` 与 `npm --prefix frontend run test -- VideoNodeEditor` 均通过。
  - 使用 Chrome DevTools 实测确认：空视频节点顶部工具隐藏，一级弹窗只剩摘要式主控，二级参数弹层可正常展开。
  - 根据后续反馈继续微调：移除无上游输入时的“无参考输入”占位，把生成按钮并入模型/参数同一行，并将 `Dropdown` / `Popover` 挂到 `document.body` 以避免被节点容器裁切。
  - 复跑 `npm --prefix frontend run build` 与 `npm --prefix frontend run test -- VideoNodeEditor`，并再次用 DevTools 确认参数弹层已脱离节点裁切区域。
- Files created/modified:
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)
  - `frontend/src/components/linghui/editors/components/VideoNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/VideoNodeEditorPanels.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/LinghuiNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/state/videoNodeEditorShared.ts` (updated)
  - `frontend/src/components/linghui/editors/tests/VideoNodeEditor.test.tsx` (updated)
  - `frontend/src/components/linghui/page/components/LinghuiPage.css` (updated)
  - `frontend/src/types/linghui.ts` (updated)

### Phase 5: Other Editors Follow Video Template
- **Status:** complete
- Actions taken:
  - 将 `LinghuiPage.css` 扩展出一组可复用的极简编辑器别名样式，包括摘要行、动作组、内联触发器、二级 `Popover` 和平铺参数按钮，供其他节点复用视频弹窗的一级交互模型。
  - 重写 `TextNodeEditor.tsx`、`AgentNodeEditor.tsx`、`ImageNodeEditor.tsx`、`AudioNodeEditor.tsx`、`ScriptNodeEditor.tsx`，让它们尽量收敛成“主输入 + 模型/设置摘要 + 动作按钮”的结构。
  - 进一步收掉脚本节点的空态冗余：移除顶部独立视图工具条，只在有镜头结果时把卡片/表格切换放进结果区头部；空态由 `Empty` 改成轻量文本提示。
  - 进一步收掉音频节点编辑区里的大块结果预览，改成结果摘要 pill 与“写回素材 / 保存为资产”等动作，避免编辑弹窗和节点本身重复承担试听入口。
  - 构建中暴露 `LinghuiPage.css` 新增样式块未闭合，已修复后重新构建通过。
  - 使用 Chrome DevTools 对比检查当前画布中的图片、视频、脚本节点编辑器，确认图片/视频已接近统一极简模板，脚本面板也识别出并完成了一轮进一步瘦身。
- Files created/modified:
  - `frontend/src/components/linghui/editors/components/TextNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/AgentNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/ImageNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/AudioNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/editors/components/ScriptNodeEditor.tsx` (updated)
  - `frontend/src/components/linghui/page/components/LinghuiPage.css` (updated)
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)

### Phase 6: Linghui Style Preprocessor Split
- **Status:** complete
- Actions taken:
  - 盘点当前 `LinghuiPage.css` 的结构边界，确认页面骨架、侧栏/库面板、画布 HUD、React Flow、紧凑节点、节点编辑器、媒体面板这几类样式已经具备独立拆分条件。
  - 在 `frontend` 内新增 `sass` 开发依赖，切换 Linghui 页面样式入口到 `scss`。
  - 新建 `frontend/src/components/linghui/page/styles/`，把原来的超大页面样式文件拆成多个 partial：
    - `_page-shell.scss`
    - `_sidebar-library.scss`
    - `_canvas-overlays.scss`
    - `_canvas-reactflow.scss`
    - `_compact-nodes.scss`
    - `_node-editor-shell.scss`
    - `_node-editor-panels.scss`
    - `_node-editor-controls.scss`
    - `_node-editor-forms.scss`
    - `_media-panels.scss`
    - `LinghuiPage.scss`
  - 更新 `LinghuiPage.tsx`，由页面组件统一引入新的 Sass 主入口。
  - 移除 `LinghuiCanvas.tsx` 对页面样式文件的反向依赖，避免画布组件层耦合页面样式实现。
  - 删除旧的 `LinghuiPage.css` 和遗留 `.swp` 文件，收敛目录结构。
  - 执行 `npm --prefix frontend run build`，确认 Sass 主入口、partial 聚合与样式边界拆分后仍能通过生产构建。
- Files created/modified:
  - `frontend/package.json` (updated)
  - `frontend/package-lock.json` (updated)
  - `frontend/src/components/linghui/page/components/LinghuiPage.tsx` (updated)
  - `frontend/src/components/linghui/canvas/components/LinghuiCanvas.tsx` (updated)
  - `frontend/src/components/linghui/page/styles/LinghuiPage.scss` (created)
  - `frontend/src/components/linghui/page/styles/_page-shell.scss` (created)
  - `frontend/src/components/linghui/page/styles/_sidebar-library.scss` (created)
  - `frontend/src/components/linghui/page/styles/_canvas-overlays.scss` (created)
  - `frontend/src/components/linghui/page/styles/_canvas-reactflow.scss` (created)
  - `frontend/src/components/linghui/page/styles/_compact-nodes.scss` (created)
  - `frontend/src/components/linghui/page/styles/_node-editor-shell.scss` (created)
  - `frontend/src/components/linghui/page/styles/_node-editor-panels.scss` (created)
  - `frontend/src/components/linghui/page/styles/_node-editor-controls.scss` (created)
  - `frontend/src/components/linghui/page/styles/_node-editor-forms.scss` (created)
  - `frontend/src/components/linghui/page/styles/_media-panels.scss` (created)
  - `frontend/src/components/linghui/page/components/LinghuiPage.css` (deleted)
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)

### Phase 7: Sass Nested Convergence
- **Status:** complete
- Actions taken:
  - 在 `frontend/src/components/linghui/page/styles/` 下新增 `_tokens.scss` 与 `_mixins.scss`，沉淀 Linghui 样式的共享颜色、表面层、圆角、阴影、文本层级、玻璃面板、软卡片、chip/button、输入壳层与 focus ring。
  - 将以下核心 partial 从“平铺式 CSS 写法”重写为真正的 Sass 嵌套结构，并接入共享 tokens/mixins：
    - `_page-shell.scss`
    - `_sidebar-library.scss`
    - `_node-editor-shell.scss`
    - `_node-editor-panels.scss`
    - `_node-editor-controls.scss`
    - `_node-editor-forms.scss`
  - 节点编辑器样式进一步统一到 `.linghuiNodeEditor`、`.linghuiEditor`、`.linghuiVideoEditor`、`.linghuiScript` 等命名空间块下，减少重复前缀和平铺选择器。
  - 页面骨架、执行计划弹窗、侧栏与资源库、节点编辑器壳层、通用面板、摘要控件、脚本表格/卡片、Ant Design 表单覆盖层开始共享同一套 Sass 原语。
  - 复跑 `npm --prefix frontend run build`，确认嵌套化与 mixin 收敛后生产构建通过。
- Files created/modified:
  - `frontend/src/components/linghui/page/styles/_tokens.scss` (created)
  - `frontend/src/components/linghui/page/styles/_mixins.scss` (created)
  - `frontend/src/components/linghui/page/styles/_page-shell.scss` (updated)
  - `frontend/src/components/linghui/page/styles/_sidebar-library.scss` (updated)
  - `frontend/src/components/linghui/page/styles/_node-editor-shell.scss` (updated)
  - `frontend/src/components/linghui/page/styles/_node-editor-panels.scss` (updated)
  - `frontend/src/components/linghui/page/styles/_node-editor-controls.scss` (updated)
  - `frontend/src/components/linghui/page/styles/_node-editor-forms.scss` (updated)
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)

### Phase 8: Remaining Partial Sass Convergence
- **Status:** complete
- Actions taken:
  - 复查 `_media-panels.scss`、`_compact-nodes.scss`、`_canvas-overlays.scss`、`_canvas-reactflow.scss` 四个剩余 partial，确认它们仍然保留大段平铺式 CSS 结构。
  - 将 `_media-panels.scss` 重写为多角度弹窗、引用区、图片 tile、音频上传、沉浸弹窗和响应式补丁几组嵌套命名空间，并接入共享 tokens/mixins。
  - 将 `_compact-nodes.scss` 收敛到 `.linghuiCompact*` 根命名空间，整理节点状态、视频层、缩略图堆叠、网格覆盖、文本/脚本/音频占位与进度条相关规则。
  - 将 `_canvas-overlays.scss` 收敛到 `.linghuiLibrary`、`.linghuiCanvas`、`.linghuiPendingGroup`、`.linghuiQuickCreate`、`.linghuiContextMenu`、`.linghuiFloatingPanel` 等命名空间，统一 rail、项目面板、状态 dock、工具条和浮层样式原语。
  - 将 `_canvas-reactflow.scss` 收敛到 `.react-flow`、`.linghuiRFNode`、`.linghuiCanvasGroup`、`.linghuiPreview`、`.linghuiNode`、`.linghuiShot`、`.linghuiLog`、`.linghuiStatusBar` 等语义块，减少平铺选择器和重复输入壳层定义。
  - 执行 `openspec list --json`，确认当前仓库内已有 Linghui 相关 change 均为 `complete`，因此本轮继续收敛先同步到本地规划文件中。
  - 执行 `npm --prefix frontend run build`，确认四个剩余 partial 完成嵌套式 Sass 改造后生产构建通过。
- Files created/modified:
  - `frontend/src/components/linghui/page/styles/_media-panels.scss` (updated)
  - `frontend/src/components/linghui/page/styles/_compact-nodes.scss` (updated)
  - `frontend/src/components/linghui/page/styles/_canvas-overlays.scss` (updated)
  - `frontend/src/components/linghui/page/styles/_canvas-reactflow.scss` (updated)
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)

### Theme System Completion Pass - 2026-05-03
- **Status:** complete
- Actions taken:
  - Continued work exclusively in `/Users/sunmeng/workspace/Koma-theme-worktree` on branch `codex/theme-system-architecture`, leaving the main workspace dirty worktree untouched.
  - Used team mode: three frontend workers cleared remaining inline style violations across common/plugin, settings, and Linghui slices; frontend architect audited G1-G7.
  - Tightened `frontend/scripts/check-style-discipline.ts` so `style={expr}` is covered, not only `style={{...}}`; only `cssVars(...)` bridges and the documented React Flow edge exception pass.
  - Completed remaining Linghui/settings/common inline style cleanup and moved dynamic layout into `--linghui-*` / `--step-*` CSS variable bridges consumed by SCSS.
  - Converted theme registry to `import.meta.glob` discovery of default-exported `themes/*.ts`, so adding a new preset no longer requires editing a central registry/type union.
  - Added `frontend/src/theme/runtime/cssVars.ts` and reused it in editor/timeline/chat/storyboard/Linghui dynamic style bridges.
  - Added theme guardrails: `frontend/eslint-plugin-koma-theme-discipline`, `frontend/eslint.theme.config.cjs`, `frontend/stylelint.config.cjs`, `npm run lint:theme`, and `.github/workflows/theme-discipline.yml`.
  - Updated `docs/THEME_DEVELOPMENT.md` and `docs/INLINE_STYLE_EXCEPTIONS.md` to match the final implementation.
- Validation:
  - `npm run check:style-discipline` passed: plain CSS 0, project CSS imports 0, inline style literals 0, Tailwind arbitrary hex 0, dark flag literals 0, business token imports 0, SCSS hardcoded colors 0, business hardcoded colors 0 / budget 0.
  - `npm run lint:theme` passed.
  - `npm run build` passed with existing Vite chunk warnings and Sass `@import "tailwindcss"` deprecation warning.
  - `find frontend/src -type f \( -name '*.css' -o -name '*.module.css' \)` returned empty.
  - Project CSS imports are only the third-party whitelist: `ds-markdown/style.css`, `xgplayer/dist/index.min.css`, `@xyflow/react/dist/style.css`.
  - Final strict pass moved Linghui node defaults, canvas group defaults, placeholder preview SVG defaults, and multi-angle 3D preview material colors onto theme tokens or default-theme token derivations.
  - Browser smoke at `http://127.0.0.1:5175/` mounted the app and reported `document.documentElement.dataset.theme = "dark-emerald"`, `dataset.themeMode = "dark"`, `--token-bg-app = #09090b`; runtime `className is not defined` regression was fixed and retested.
- Residual risk:
  - The app is blocked by activation in this environment, so Settings UI click-through and 4 themes x 5 pages screenshot matrix were not executed here.
  - Build warnings about chunking/dynamic import and Sass Tailwind import remain pre-existing/non-blocking for this theme architecture target.

### Linghui Empty Workspace Document Guard - 2026-05-06
- **Status:** complete
- Actions taken:
  - 查看 `~/.koma/logs` 与 SQLite 灵绘表，确认没有直接前端堆栈；最近工作区中出现多个空工作区和一个视频节点工作区，说明“新建”已到达后端，但异常路径被 IPC/ee-core 吞成空返回。
  - 排查 `LinghuiPage -> flushWorkspaceSave -> saveLinghuiWorkspace -> controller/linghui -> service/linghui.saveWorkspace -> normalizeLinghuiWorkspaceDocument` 链路，定位空壳 React Flow 节点缺少 `type/data.linghuiType` 会触发后端严格校验。
  - 在 `linghuiCanvasShared` 增加可持久化节点判断，保存/执行上下文都过滤未知空壳节点和由其产生的悬空边；合法节点缺省数据会按节点类型补齐。
  - 在后端 `document.ts` 增加 normalize 清洗：空壳节点丢弃，缺 `data.linghuiType` 但 RF 类型明确的节点可补语义；旧/不支持节点类型仍保持拒绝。
  - 在 `LinghuiController` 对保存/新建/另存/导入增加 try/catch，把 ee-core 可能吞掉的异常转成 `{success:false,error}`；前端 `linghuiStorage` 统一 unwrap，空返回和结构化错误都会抛出可读异常。
  - 补充 `linghuiCanvasShared.test.ts`、`linghuiDocument.test.ts`、`linghuiStorage.test.ts` 覆盖空壳节点过滤、后端 normalize 清洗和错误透出。
- Validation:
  - `npm --prefix frontend run test -- --run src/store/linghuiStorage.test.ts src/store/linghuiDocument.test.ts src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/components/project/ProjectAssetOverview.test.tsx src/components/linghui/canvas/tests/linghuiCanvasStore.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasHistory.test.tsx` passed: 6 files / 25 tests.
  - `npm --prefix frontend run build` passed with existing Vite dynamic import/chunk warnings.
  - `npm run build-electron` passed.
  - `git diff --check` passed.

### Linghui Workspace Package Import Export - 2026-05-06
- **Status:** complete
- Actions taken:
  - 在灵绘后端导出 `.linghui.zip` 包，写入 `manifest.json`、`workspace.json`、`records/workflowTemplates.json`、`records/assets.json`、`records/history.json`。
  - 递归扫描工作区文档、节点运行结果、资产库和历史记录中的本地静态资源引用，支持绝对路径、`koma-local://files/...` 和工作区内 `assets/`、`history/`、`resources/` 相对路径；导出时重写为 `koma-archive://...` 并把文件打包。
  - 导入 zip 时解包资源到新的工作区目录，重写资源引用为新目录本地路径，并给工作区、节点、边、分组、模板、资产、历史记录重新分配 id，避免与现有数据冲突；旧 `.json` 导入仍保持兼容。
  - 项目列表面板增加导入、导出和删除操作；删除会确认后清理工作区记录和目录，删到 0 个项目时自动创建一个空项目。
  - `linghuiStorage` 将导出默认扩展改为 `.linghui.zip`，并统一透出导入/导出/删除的结构化后端错误。
- Validation:
  - `npm --prefix frontend run test -- --run src/store/linghuiStorage.test.ts src/store/linghuiDocument.test.ts src/components/linghui/canvas/tests/linghuiCanvasShared.test.ts src/components/project/ProjectAssetOverview.test.tsx` passed: 4 files / 21 tests.
  - `npm run build-electron` passed.
  - `npm --prefix frontend run build` passed with existing Vite dynamic import/chunk warnings.
  - `git diff --check` passed.

### Storyboard Previous Anchor Preview - 2026-05-10
- **Status:** complete
- Actions taken:
  - 接续上一轮未完成补丁，检查 `ShotListEditor` 已开始构造上一故事板 mention，但 `ShotCardProps` 尚未接收该 prop。
  - 确认 `buildShotReferenceBundle` 生成链路已读取上一故事板 `currentImageIndex`，但缺少明确测试覆盖多版本切换场景。
  - 计划补齐 `ShotCard` mention 合并逻辑，并让 UI 预览只在当前故事板继承开启时出现。
  - 已补齐 `ShotCard.previousStoryboardMention` prop 和 mention 合并逻辑，当前锚定图不存在时仍可注入上一故事板悬浮预览。
  - `ShotListEditor.buildPreviousStoryboardMention` 现在只在当前分镜是故事板且继承开启时返回上一故事板当前选中版本预览。
  - 已新增 `builder.test.ts` 用例，断言上一故事板 `currentImageIndex: 1` 时后续引用取第二个版本。
  - 为避免再次影响分镜文本编辑光标，`renderShotRow` 继续通过 ref 读取最新 shots，不把完整 `shots` 放回 callback 依赖。
  - 验证通过：`npm --prefix frontend run test -- --run src/services/shotReference/builder.test.ts src/workflow/shotImageWorkflow.test.ts src/components/storyboard/__tests__/assetRetention.test.ts`，共 36 个测试。
  - 验证通过：`npx tsc --noEmit --project tsconfig.json`。
  - 验证通过：`git diff --check`。

### Shot Video Version Playback - 2026-05-10
- **Status:** complete
- Actions taken:
  - 排查 `ShotCard` / `VideoCardGrid` / `StagePlayer`，确认 UI 选择会更新 `currentVideoIndex`，但播放器需要按当前源身份重建。
  - `ShotCard` 增加当前视频 source/key，播放弹窗里的 `StagePlayer` 用当前版本 key 强制 remount。
  - `StagePlayer` 的原生 `<video>` 和 xgplayer 容器都增加 `resolvedSrc|poster` key，源变化时不复用旧节点。
  - `MediaGenerationService.generateVideo` 增加 `destPath` 支持；`shot-version` 视频默认解析为 `shots/<shotId>/versions/<versionId>/video.mp4`。
  - `pollAndFinalizeViaMain` 和 `mediaPollFulfillers` 透传 `destPath`，覆盖 async ITV 与 recoverTask 场景。
  - 补充 `MediaGenerationService.itvPolicy.test.ts`：立即结果与恢复任务都断言 shot-version 视频使用版本路径。
- Validation:
  - `npm --prefix frontend run test -- --run src/workflow/shotRenderWorkflow.videoChain.test.ts src/services/MediaGenerationService.itvPolicy.test.ts src/components/video/StagePlayer.test.tsx` passed: 3 files / 14 tests.
  - `npx tsc --noEmit --project tsconfig.json` passed.
  - `git diff --check` passed.

## Session: 2026-05-10 Storyboard Batch Media Persistence

### Phase 1: Diagnosis
- **Status:** complete
- Actions taken:
  - 读取 `Storyboard.tsx`、`ShotGenerationService.ts`、`shotRenderWorkflow.ts`。
  - 确认批量图片成功结果只在整批返回后一次性写 UI；批量视频也只在整批结束后刷新。
  - 确认视频批量需要外层异常隔离，避免一次异常阻断后续分镜。

### Phase 2: Implementation
- **Status:** in_progress
  - `ShotGenerationService.batchGenerateShotImages` 增加单项结果类型和 `onItemComplete` 回调；每个分镜任务内部捕获失败并返回结果，避免单项失败使父任务整体抛出。
  - `shotRenderWorkflow.batchRenderShots` 增加 `onShotComplete` 回调，并在每个分镜外层加 try/catch，未捕获异常会记录为该分镜失败并继续后续分镜。
  - `Storyboard` 增加串行刷新队列 `queueRefreshShotsFromStore()`；批量图片/视频每个成功项完成后触发刷新，并从对应 loading 集合移除该分镜。
  - 移除批量图片结束后基于旧 `shots` 的一次性 UI 合并，避免用批量开始时的旧状态覆盖已由媒体绑定写入的最新存储。
  - 新增/扩展测试覆盖批量图片单项失败继续、批量视频单项失败继续、逐项完成回调。

### Phase 3: Validation
- **Status:** complete
- Validation:
  - `npm run test -- --run src/services/ShotGenerationService.test.ts src/workflow/shotRenderWorkflow.videoChain.test.ts`：2 files / 7 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `git diff --check`：passed。

## Session: 2026-05-10 Storyboard Prompt Template Production Board Upgrade

### Phase 1: Template Audit
- **Status:** complete
- Actions taken:
  - 定位 `storyboard_shot_prompt_generation` 与 `tti_storyboard_shot_image`。
  - 确认现有模板强调制作笔记和不固定 2x2，但没有强制默认电影制作板骨架，也没有稳定要求 8镜头故事区、俯视调度图、声音设计、摄影说明和色彩方案。

### Phase 2: Template Upgrade
- **Status:** in_progress
  - `storyboard_shot_prompt_generation` 增加“默认制作板骨架”：场景设计区、俯视镜头调度图、分镜故事区（8镜头）、灯光与风格、情绪关键词、声音设计、摄影说明、色彩方案。
  - 输出字段改为稳定的电影前期制作板模块，并要求每个镜头包含场景画面、极短制作笔记、镜头类型、焦段、运动方式、情绪/光影变化和镜头衔接。
  - `tti_storyboard_shot_image` 增加 Required board sections 和每个 8 镜头面板必须包含的 shot size / focal length / camera movement labels，强化图像模型最终渲染时的结构统一性。
  - 更新 `promptTemplates.test.ts`，锁住新模块与 TTI 终稿约束。

### Phase 3: Validation
- **Status:** complete
- Validation:
  - `npm run test -- --run src/store/promptTemplates.test.ts`：1 file / 11 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `git diff --check`：passed。

## Session: 2026-05-10 Storyboard Template Flexible Production Poster

### Phase 1: Template Rebalance
- **Status:** in_progress
  - 将上一版固定“8镜头”改为剧情驱动的 N 镜头：短动作 4-6、15 秒标准段落 6-8、复杂调度 8-12，但不机械补满。
  - 新增电影分镜信息图海报语法：深蓝标题栏 / 高级标题系统、现代 UI 风格、信息密集但整洁、商业级视觉设计。
  - 新增【项目标题】与【角色设计区】，并把限制条件改为 X 个镜头 / X 个角色 / X 个场景。
  - TTI 终稿模板同步改为 project title header、character design zone、story-driven N-shot sequence、without mechanical equal panels、not fixed count。
  - 测试断言从固定 8 shots 改为剧情驱动 N-shot 和非机械等分约束。

### Phase 2: Validation
- **Status:** complete
- Validation:
  - `npm run test -- --run src/store/promptTemplates.test.ts`：1 file / 11 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `git diff --check`：passed。

## Follow-up: Storyboard Project Title Metadata
- **Status:** in_progress
- User request: add 【项目标题】 section fields (项目名称、副标题、拍摄形式、类型、时长、限制条件) and verify whether project type and shot duration are passed.
- Findings so far: `Shot.duration` exists, but `storyboard_shot_prompt_generation` did not receive it; project type lives in `ProjectMeta.genre`, but `ShotPromptService.generateSpecialImageShotPrompt()` did not load/pass project metadata.

### Follow-up: Storyboard Project Title Metadata
- **Status:** complete
- Actions taken:
  - `CreationContext` now carries `projectTitle` / `projectGenre` from loaded project metadata.
  - `ShotPromptService.generateSpecialImageShotPrompt()` now injects storyboard project header variables: `projectTitle`, `projectSubtitle`, `shootingFormat`, `projectType`, `shotDurationSeconds`, `storyboardConstraints`.
  - Storyboard prompt template now has an explicit 【项目标题】 input/output section and requires type to use `{{projectType}}`, duration to use current shot duration `{{shotDurationSeconds}}秒`.
  - Added service-level test proving `ProjectMeta.genre` and `Shot.duration` are passed into `storyboard_shot_prompt_generation`.
- Validation:
  - `npm run test -- --run src/services/ShotPromptService.test.ts src/store/promptTemplates.test.ts`: 2 files / 32 tests passed.
  - `npm run test -- --run src/workflow/shotRenderWorkflow.videoChain.test.ts src/workflow/shotImageWorkflow.test.ts src/services/ShotGenerationService.test.ts`: 3 files / 8 tests passed.
  - `git diff --check`: passed.
  - `npx tsc --noEmit --project tsconfig.json` (frontend): failed on existing unrelated `src/services/TaskManager.test.ts(140,29)` using `findLast` under non-ES2023 lib.

### Follow-up: Storyboard Anchor Highlight In Prompt Editors
- **Status:** complete
- Actions taken:
  - Added dedicated CodeMirror mention styles for `.mention-storyboard` and `.mention-previous_storyboard`, with stronger background, border, and weight.
  - Updated mention tooltip colors so current storyboard and previous storyboard use distinct visual accents.
  - ShotCard prompt editors now include a current-storyboard autocomplete item in storyboard mode even before the first storyboard image exists; after generation it binds to the selected current image version.
  - Previous storyboard mention label is shortened to “上一故事板” and still carries the selected previous storyboard version preview.
- Validation:
  - `npm run test -- --run src/editor/mentionTypes.test.ts src/components/storyboard/__tests__/assetRetention.test.ts`: 2 files / 40 tests passed.
  - `npm run test -- --run src/editor/mentionTypes.test.ts src/components/storyboard/__tests__/assetRetention.test.ts src/services/ShotPromptService.test.ts src/store/promptTemplates.test.ts`: 4 files / 72 tests passed.
  - `npx tsc --noEmit --project tsconfig.json` (frontend): passed.
  - `git diff --check`: passed.

## Session: 2026-05-10 Prompt Editor Snapshot Consistency

### Phase 1: Diagnosis
- **Status:** complete
- Actions taken:
  - 复查用户给出的实际输入/编译后输出差异。
  - 定位三条根因：单张/批量生成使用旧 DB 或旧闭包中的 shot；视频渲染总是把旧 `shot.dialogue` 补回手写 `对白提示词`；图片/视频空提示词各自有默认模板兜底。
  - 额外发现 `sanitizeNarrativeDialogueLeakage()` 会误删含“自称天道”的显式 `台词：` 片段。

### Phases 2-3: Fix
- **Status:** complete
- Actions taken:
  - `Storyboard` 增加并使用 `shotsRef` 作为立即操作的最新分镜快照；单张生图/生视频和批量图片/视频生成都会先 flush 保存队列，再把当前快照传入 workflow。
  - `ShotGenerationService` 支持 `shotSnapshot` / `shotsSnapshot`，批量图片生成优先使用调用方传入的最新快照。
  - `shotImageWorkflow` 空图片提示词直接报错，不再套 `tti_shot_image` 默认模板。
  - `shotRenderWorkflow` 空视频提示词直接返回失败，不再套 `itv_shot_video`；手写 `对白提示词` 非空时不再追加旧 `shot.dialogue`。
  - 收窄对白清洗逻辑，保留显式 `台词：` 片段，只清理明显的旁白转述泄漏。

### Phase 4: Validation
- **Status:** complete
- Validation:
  - `npm run test -- --run src/services/ShotPromptService.test.ts src/services/ShotGenerationService.test.ts src/workflow/shotImageWorkflow.test.ts src/workflow/shotRenderWorkflow.videoChain.test.ts src/workflow/videoGenerationRequests.test.ts`：5 files / 34 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。

## Session: 2026-05-12 Director3D Model Refinement And Open Model Catalog

### Phase 1: Research & Diagnosis
- **Status:** complete
- Actions taken:
  - 确认 Director3D 工作台实际编辑器路径是 `frontend/src/components/linghui/editors/components/Director3DNodeEditor.tsx`。
  - 复查主角、群演、方阵当前 mesh：均为程序化几何，没有 GLTF loader / SkinnedMesh 导入链路。
  - 检索开源模型 / 骨骼画法来源，决定先做许可证安全的来源目录接入，避免直接打包不明授权资产。

### Phase 2: Procedural Model Refinement
- **Status:** complete
- Actions taken:
  - `Director3DMannequin` 增加眼睛、眉线、嘴、耳、鼻梁、胸前标、背脊线、肩带、腰带、关节球、手掌拇指、鞋尖等细节。
  - `Director3DLiteMannequin` 增加轻量脸部标记、胸前标、背脊线和鞋。
  - `Director3DFormation` 为每个方阵成员增加脸部、胸前、背面方向标记。

### Phase 3: Open Model Catalog Integration
- **Status:** complete
- Actions taken:
  - 新增 `director3dOpenModelCatalog.ts`，记录 Kenney / MakeHuman / Poly Haven / Khronos glTF / Three.js SkeletonHelper 的来源、许可证、用途和骨骼说明。
  - Director3D 左侧 rail 新增“模型”入口；可程序化使用的来源可以直接创建 refined mannequin，参考来源只显示目录说明，不自动下载。

### Phase 4: Prompt & Tests
- **Status:** complete
- Actions taken:
  - `compileDirector3DPromptFragment()` 增加 refined humanoid / direction markers / joint balls / face direction 等描述。
  - 资产库测试增加开源模型目录完整性与程序化可导入来源断言。
- Validation:
  - `npm run test -- --run src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dCreature.test.ts`：3 files / 40 tests passed。
  - `npm run test -- --run src/components/linghui/director3d/director3dAssetLibrary.test.ts`：1 file / 11 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npm run build`（frontend）：passed，只有既有 chunk size / dynamic import chunking warnings。
  - `git diff --check`：passed。
  - Vite dev server `http://127.0.0.1:5174/` 返回 200；Chrome DevTools MCP 页会话异常关闭，未能完成截图验证。

## 2026-05-17 LinghuiPage Continued Refactor

- **Status:** in_progress
- Actions taken:
  - 接上已创建的 `useLinghuiPageWorkspaceActions.ts`，把项目保存、导入/导出、创建、删除、切换和重命名从 `LinghuiPage.tsx` 移出。
  - 新增 `linghuiPageWorkspaceRuntime.ts`，集中 `EMPTY_WORKSPACE_RUNTIME` 与 `ensureWorkspaceRuntime()`。
  - 新增 `useLinghuiPageWorkspacePersistence.ts`，承接保存防抖、flush、保存中状态和工作区列表刷新；页面仍保留崩溃保护需要直接访问的 `pendingSaveRef/saveTimerRef`。
  - 新增 `useLinghuiPageExecutionRailState.ts`，承接失败节点、待重跑节点、执行日志摘要、重试、取消和 focus handler。
  - 新增 `useLinghuiPageCanvasHandlers.ts`，承接画布快照保存、空快照防覆盖、崩溃暂停保存/恢复/重载和节点运行状态恢复。
  - `LinghuiPage.tsx` 当前约 1150 行，新文件均低于 500 行，未改变现有 props、className、文案或持久化结构。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。

## 2026-05-17 Director3DNodeEditor Continued Refactor

- **Status:** in_progress
- Actions taken:
  - 新增 `Director3DRightRail.tsx`，把右侧视角/渲染/导出/属性入口从 `Director3DNodeEditor.tsx` 拆出。
  - 新增 `useDirector3DTimelineController.ts`，把时间轴播放、关键帧、runtimeScene 和时间轴视频导出从主组件拆出。
  - `Director3DNodeEditor.tsx` 当前约 988 行；新增组件/hook 均低于 500 行。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。

## 2026-05-17 ImageNodeEditor / Director3DViewport Continued Refactor

- **Status:** in_progress
- Actions taken:
  - 新增 `ImageNodeEditorMainPanel.tsx`，把 `ImageNodeEditor` 的导入模式与生成模式主 JSX 拆出。
  - 新增 `Director3DEnvironment.tsx`，把 3D 视口地面、天空、背景和背景纹理加载拆出。
  - 新增 `Director3DActorDragLayer.tsx`，把 actor 渲染分发、移动/高度/旋转拖拽和选中 gizmo 拆出。
  - 当前行数：`ImageNodeEditor.tsx` 约 1164 行；`Director3DViewport.tsx` 约 667 行。
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`：passed。

## Session: 2026-05-12 Director3D Procedural Detail Pass

### Phase 1: Diagnosis
- **Status:** complete
- Actions taken:
  - 用户要求隐藏外部模型库，继续精修人物 / 动物 / 道具，且不额外引入资源。
  - 确认模型库入口在 `Director3DNodeEditor.tsx` 的左侧 rail tab。
  - 确认生物和道具均可通过渲染组件补小几何实现细节，不需要变更持久化 schema。

### Phase 2: Hide External Catalog
- **Status:** complete
- Actions taken:
  - 从 `Director3DNodeEditor.tsx` 左侧 rail 移除“模型”入口和相关点击处理。
  - 保留 `director3dOpenModelCatalog.ts` 和测试，不展示给用户。

### Phase 3: Creature Detail Pass
- **Status:** complete
- Actions taken:
  - 四足动物增加眼睛、鼻口、耳朵、爪子、鬃毛束、尾端。
  - 老虎增加条纹，鹿增加斑点，灵狐增加多尾尾端，麒麟增加金色鳞片感条纹。
  - 飞禽增加眼睛、喙、翼羽、尾羽、爪；仙鹤增加红冠，凤凰增加金色火焰尾羽。
  - 神龙增加龙鳞背刺、眼睛、胡须、翼羽、爪尖。

### Phase 4: Prop Detail Pass
- **Status:** complete
- Actions taken:
  - `Director3DProp` 根据 label 识别桌、椅、凳、床、柜、汽车、自行车、树、灌木、岩石、门、窗、屏幕、聚光灯、麦克风、基座、方箱、圆桶等语义并渲染不同几何细节。
  - 主角模型补充衣领/服装分层，让人物正面更清楚。
  - 删除上一轮隐藏外部模型入口后不再使用的 OpenModel 样式。

### Phase 5: Validation
- **Status:** complete
- Validation:
  - `npm run test -- --run src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dBattalion.test.ts`：4 files / 49 tests passed。
  - `npm run test -- --run src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dAssetLibrary.test.ts`：2 files / 25 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npm run build`（frontend）：passed，只有既有 chunk size / dynamic import chunking warnings。
  - `git diff --check`：passed。

## Session: 2026-05-12 Director3D Structural Model Rework

### Phase 1: Reference Review
- **Status:** complete
- Actions taken:
  - 用户指出动物不像、头身体错位、道具形状和纯色表现差。
  - 查找开源 procedural animal / low-poly / bird geometry 思路，决定以骨架体块重排为主，而不是继续贴局部细节。

### Phase 2: Creature Structural Rework
- **Status:** complete
- Actions taken:
  - 四足动物按脚底→腿→肩胯→胸腔/胯部→颈→头重新排布，躯干改为胸腔和胯部两段 capsule，头部从胸前水平前伸。
  - 飞禽改为泪滴状身体、收窄尾部、长颈/头/喙、横向翼面和贴地双腿。
  - 神龙补齐前后四爪，龙头从身体轴前端伸出，身体仍保持分段蛇形结构。

### Phase 3: Prop Structural Rework
- **Status:** complete
- Actions taken:
  - 在 `Director3DProp` 增加木条、轮毂、车头金属条、柜体层板、床头板、树枝、自行车车把/横杆、圆桶中部金属箍等细节。
  - 这些改动继续使用 procedural mesh，不引入贴图或外部资源。

### Phase 4: Validation
- **Status:** complete
- Validation:
  - `npm run test -- --run src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dBattalion.test.ts`：4 files / 49 tests passed。
  - `npm run test -- --run src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dAssetLibrary.test.ts`：2 files / 25 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npm run build`（frontend）：passed，只有既有 chunk size / dynamic import chunking warnings。
  - `git diff --check`：passed。

### Follow-up: Shape Readability Pass
- **Status:** complete
- Actions taken:
  - 继续按用户反馈处理“动物不像 / 道具形状不对”：不引入外部资源，只把开源 procedural/low-poly 的骨架和参数化体块思路转成现有 Three.js 组件。
  - 四足动物补 `WhiskerSet`、分叉鹿角/麒麟角、猫科/犬科胡须、狮尾毛球、肉掌/蹄的分支结构，避免所有动物只是同一套身体换颜色。
  - 飞禽翼面由整块板进一步拆成根部翼骨 + 多根渐变飞羽，凤凰/仙鹤/鹰的羽片数量和颜色更容易区分。
  - 道具进一步拆体块：桌椅横撑、床垫/被面/床头条、柜门面板、车身/车窗/轮毂、箱体边框、自行车轮/车架/前叉/把手、门窗框、屏幕边框和圆桶木板/金属箍。
  - `compileDirector3DPromptFragment()` 增强动物和道具的结构描述，帮助图片/视频模型理解这些不是纯色占位块。
- Validation:
  - `npm run test -- --run src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dBattalion.test.ts`：4 files / 49 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `npm run build`（frontend）：passed，只有既有 Vite dynamic import / chunk size warnings。
  - `git diff --check`：passed。

### Follow-up: Export Geometry Parity
- **Status:** complete
- Actions taken:
  - 定位到 `Director3DViewport` 的离屏 `CaptureRenderer` 仍然对道具使用旧 `BoxGeometry/CylinderGeometry/Plane` 占位，导致视口细化后导出线稿/首帧参考仍会退回粗模。
  - 在 `director3dExportGeometry.ts` 增加 `buildExportPropGroup()`，按 label 复刻桌椅床柜、汽车、自行车、树石、门窗屏幕、聚光灯/相机等结构化几何。
  - `CaptureRenderer` 对 `prop-*` 统一走 `buildExportPropGroup()`，让视口、单帧导出和时间轴导出使用同一套结构道具。
  - `buildExportCreatureGroup()` 四足动物导出同步胸腔/胯部 capsule、前伸头颈、足部/蹄/尾部结构；飞禽导出增加左右翼和飞羽。
  - 新增 `director3dExportGeometry.test.ts`，覆盖汽车、自行车、窗和四足动物导出不再退化为单盒子/单圆柱。
- Validation:
  - `npm run test -- --run src/components/linghui/director3d/director3dExportGeometry.test.ts src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dBattalion.test.ts src/components/linghui/director3d/director3dTimeline.test.ts`：6 files / 70 tests passed。

### Follow-up: Director3D Entity Combinations + Direct Transform
- **Status:** complete
- Actions taken:
  - 使用 `pi-planning-with-files` 继续记录本轮复杂交互改动。
  - 读取现有 `LinghuiDirector3DActor`、`director3dRig`、`director3dScene`、`Director3DViewport`、`Director3DNodeEditor`，确认当前拖拽只处理 X/Z，Y 高度保留但无显式视口操控。
  - 确认最小设计：actor 继续用世界绝对坐标，新增轻量 group 元数据；编辑器更新时按 group 做位置/朝向联动。

  - 给 actor schema 增加 `groupId/groupRole/groupLabel`，组合仍保存世界绝对坐标。
  - 新增 `createDirector3DRidingHorse()`，一键生成 horse mount + mannequin rider，骑手使用新增 `ride` rig。
  - 修正 `sit` rig 的髋/膝方向，让坐姿不再反向折腿；新增 `ride` 扩展姿势，双腿外展跨坐。
  - `Director3DNodeEditor` 的 actor 更新改成组合感知：平移联动整组，旋转优先围绕坐骑中心，时间轴启用时给同组成员各自写关键帧。
  - `Director3DViewport` 增加选中 actor 的直接操控手柄：拖本体移动 X/Z，拖竖向白色球调高度 Y，拖地面旋转环调 rotationY。
  - 属性面板增加 `高度 Y (m)` slider，并把位置字段标成 `X / 高度Y / Z`。
  - Electron CDP `127.0.0.1:9333` 验证：工作台可打开，人物弹层中已出现“人骑马”。未点击新增组合，避免改脏当前用户工作区。
- Validation:
  - `npm run test -- --run src/components/linghui/director3d/director3dRig.test.ts src/components/linghui/director3d/director3dAssetLibrary.test.ts src/components/linghui/director3d/director3dExportGeometry.test.ts src/components/linghui/director3d/director3dCreature.test.ts src/components/linghui/director3d/director3dBattalion.test.ts src/components/linghui/director3d/director3dTimeline.test.ts`：6 files / 73 tests passed。
  - `npx tsc --noEmit --project tsconfig.json`（frontend）：passed。
  - `npx tsc --noEmit --project tsconfig.json`（root）：passed。
  - `git diff --check`：passed。
- Errors:
  - CDP 验证脚本曾因 Runtime.evaluate 字符串换行拼接触发 SyntaxError；已换成无换行表达式重新读取 DOM，确认非应用异常。

## 2026-05-18 LibTV VideoStoryNode Parity Pass

- Re-read planning files and ran planning catchup for the continuing LibTV node parity work.
- Re-extracted LibTV `VideoStoryNode` from `template_/libtv/15gvxu-nayl4w.js`, including dynamic `rows` / `shotColumns`, image-column detection, default size/title, fullscreen reuse, and `暂无数据` empty state.
- Updated `frontend/src/components/linghui/editors/components/ScriptShotViews.tsx` so `ScriptShotTable` now renders a LibTV-style dynamic storyboard table with image thumbnails, sticky headers, scrollable/selectable text cells, and the LibTV empty text.
- Updated `frontend/src/components/linghui/editors/components/StoryboardNodeEditor.tsx` to remove its duplicate local card/table components and reuse `ScriptShotCards` / `ScriptShotTable`, so storyboard and script views share one behavior.
- Added compact flat table/card styles in `frontend/src/components/linghui/page/styles/_node-editor-shell.scss` without increasing the editor HUD footprint.
- Added `frontend/src/components/linghui/editors/tests/ScriptShotViews.test.tsx` covering dynamic columns, image cells, and `暂无数据`.

## 2026-05-18 LibTV GroupNode First Parity Pass

- Deep-read LibTV `GroupNodeToolbar` and group helper chunks from `template_/libtv/15gvxu-nayl4w.js`.
- Extended Linghui group metadata typing in `frontend/src/types/linghui.ts` for LibTV storyboard group fields already used by derived video/image flows.
- Added LibTV-compatible group count label helpers in `frontend/src/constants/linghuiWorkflowBlock.ts`.
- Updated `frontend/src/components/linghui/canvas/hooks/useLinghuiCanvasFlowBridge.ts` so group data mutations preserve LibTV-style automatic count labels when the group label is still default-like.
- Added selected-group compact floating toolbar in `frontend/src/components/linghui/nodes/components/CanvasGroupNode.tsx` with real color selection and real `宫格排列 / 水平排列 / 垂直排列` child layout operations.
- Added compact flat group toolbar styles in `frontend/src/components/linghui/page/styles/_canvas-reactflow.scss`.
- Added `frontend/src/components/linghui/canvas/tests/linghuiWorkflowBlock.test.ts` for label compatibility.
- Validation: targeted Vitest, frontend TypeScript, root TypeScript, and `git diff --check` passed for this slice.

## 2026-05-18 LibTV VideoNode Resource Tool Pass

- **Status:** complete
- Actions taken:
  - Continued node-by-node LibTV parity on `linghui/video`, using LibTV `AVEditor` evidence for frame extraction / encode-style operations.
  - Kept resource/import video nodes in tool-panel mode instead of clearing active video tools.
  - Added real `截图` tool panel: 首帧 / 中帧 / 尾帧 / 首中尾, extracting frames with browser video + canvas and deriving downstream image nodes.
  - Added real `剪辑` tool panel: compact start/end second inputs and `裁剪` button.
  - Added Electron FFmpeg `trimVideo` IPC path in TS source and public runtime mirror: controller, preload whitelist/bridge, service queue, frontend manager.
  - Wired trimmed output back to canvas through `onCreateDerivedVideoClips`, reusing the existing video derivation path to create downstream `linghui/video` nodes.
  - Added compact styles for the clip range control without adding another large card layer.
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/VideoNodeEditor.test.tsx src/services/ffmpegManager.test.ts`: 2 files / 17 tests passed.
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`: passed.
  - `npx tsc --noEmit --project tsconfig.json --pretty false`: passed.
  - `git diff --check`: passed.
- Remaining:
  - `高清` now uses local FFmpeg upscale instead of prompt presets.
  - `解析` now creates a downstream editable `linghui/text` analysis node from current video source / duration / references / prompt; this is intentionally a structured draft, not a fake video-understanding claim.
  - `智能去字幕` still lacks a real backend and remains non-executable instead of pretending to run.

### Phase 5.5: VideoNode Upscale + Analysis Tool Parity
- **Status:** complete
- Actions taken:
  - Added Electron FFmpeg `upscaleVideo` path in frontend manager, Electron controller/preload/service, and public runtime mirrors.
  - Replaced `高清` prompt preset cards with real `高清 2x / 高清 4x` actions that materialize the current video, run FFmpeg upscale, and derive downstream `linghui/video` nodes.
  - Added `useLinghuiCanvasVideoAnalysisDerivation.ts` and wired it through DocumentOps, overlay props, node editor context, `LinghuiNodeEditorSurface`, and `VideoNodeEditor`.
  - Changed `解析` from prompt-skeleton-only behavior to a real downstream `linghui/text` node derivation containing video source, estimated duration, upstream reference summary, user prompt, shot-analysis draft, and a reusable generation prompt.
  - Kept `智能去字幕` as a disabled/non-executable LibTV-parity entry until a real subtitle removal service exists.
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/VideoNodeEditor.test.tsx src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx src/services/ffmpegManager.test.ts`: 3 files / 31 tests passed; existing React `act(...)` warnings remain.
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`: passed.
  - `npx tsc --noEmit --project tsconfig.json --pretty false`: passed.
  - `git diff --check`: passed.
- Next:
  - Continue node-by-node LibTV parity. For video, remaining service-backed gaps are `智能去字幕` and cloud vocal split; next practical node slice can move to `video-clip` editor fidelity, `image` remaining erase/crop/remove-bg panels, or `script/storyboard` control details.

### Phase 5.6: VideoClipNode UI Parity Pass
- **Status:** complete
- Actions taken:
  - Continued LibTV node-by-node parity on `linghui/video-clip`.
  - Changed the empty state to LibTV wording: `空空如也，请连接多个视频节点后操作`.
  - Matched the executor's input rule in the node UI: compose is enabled for 2+ visual clips, or one video plus an audio track; otherwise the button title uses `请连接2个及以上的视频/音频后操作`.
  - Renamed the node action from implementation-flavored `打开剪辑` to LibTV-style `打开视频合成`.
  - Added resource/result preview mode for composed output: node shows a video preview and a floating `打开视频合成` action, plus a compact download link.
  - Added `VideoClipNode.test.tsx` covering empty wording, insufficient input, result preview, and real `onRunNode` composition trigger.
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`: passed.
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/VideoClipNode.test.tsx src/components/linghui/execution/tests/linghuiExecutionVideoClipNode.test.ts`: 2 files / 8 tests passed.
  - `git diff --check`: passed.
- Next:
  - Continue the remaining node parity list. Good next candidates: `image` remaining erase/crop/remove-bg panel fidelity, or `script/storyboard` LibTV control details.

### Phase 5.10: ScriptAggregatedGenerator In-node Action Pass
- **Status:** complete
- Actions taken:
  - Continued deep LibTV decompile for `ScriptAggregatedGenerator` in `template_/libtv/15gvxu-nayl4w.js` instead of guessing from the current Linghui UI.
  - Extended `LinghuiStoryboardFrame` with LibTV row metadata: `hiddenUuid`, `shotNumber`, `characters`, and `videoReference`.
  - Updated `parseLinghuiScriptContent()` to preserve LibTV storyboard row character arrays and video reference frame images.
  - Updated `ScriptShotTable` to show real character summaries, video reference thumbnails, shot size, scene tags, and audio effects instead of reducing rows to a few duplicated text columns.
  - Moved storyboard generation controls out of the node info block into a LibTV-style compact floating generator below the node, shown only after row selection; no credit/power UI was migrated.
  - Added/updated tests for selected-row generator behavior, character/video-reference table display, and parser preservation.
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`: passed.
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/ScriptNode.test.tsx src/components/linghui/editors/tests/ScriptShotViews.test.tsx src/components/linghui/editors/tests/linghuiScriptNodeUtils.test.ts src/components/linghui/execution/tests/linghuiExecutionScriptNode.test.ts src/components/linghui/execution/tests/linghuiExecutionStoryboardNode.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx`: 6 files / 26 tests passed.
- Next:
  - Continue script/storyboard parity with editable table cells, column visibility/filter config, and character/video reference image upload if we decide to bring the fullscreen table closer to LibTV.

### Phase 5.11: Script Editor Table Edit + Selection Toolbar Pass
- **Status:** complete
- Actions taken:
  - Continued LibTV script/storyboard parity with the fullscreen/table behavior.
  - Added `serializeLinghuiScriptShots()` so manual script table edits can persist back to `properties.content` as structured JSON and be parsed again without losing LibTV row fields.
  - Extended `ScriptShotTable` with optional editable text cells and row patch callbacks for LibTV-style editable fields.
  - Enabled editable cells only for `ScriptNodeEditor` manual mode; generated script/storyboard results remain read-only because their source of truth is the run result, not editable node content.
  - Moved editor-side storyboard actions out of the header into a bottom compact selection toolbar shown only when rows are selected, matching LibTV's selected-row generator pattern and reducing redundant header controls.
  - Added tests for editable table patches and serialize/parse round-trip.
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`: passed.
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/ScriptShotViews.test.tsx src/components/linghui/editors/tests/linghuiScriptNodeUtils.test.ts src/components/linghui/nodes/tests/ScriptNode.test.tsx src/components/linghui/execution/tests/linghuiExecutionScriptNode.test.ts src/components/linghui/execution/tests/linghuiExecutionStoryboardNode.test.ts src/components/linghui/canvas/tests/useLinghuiCanvasDocumentOps.test.tsx`: 6 files / 28 tests passed.
- Next:
  - Continue LibTV parity on image/video-reference upload cells and column visibility/filter controls, or move to the next node in the inventory if the user wants broader node coverage first.

### Phase 5.12: Image Crop Anchor + Honest Remove-bg Panel
- **Status:** complete
- Actions taken:
  - Continued LibTV image tool parity on remaining `擦除 / 抠图 / 裁剪` panel gaps.
  - Added 3×3 crop anchor state and UI to the image crop panel; preview frame follows the selected anchor.
  - Extended crop execution options with `anchorX / anchorY` and passed them from editor panel through node editor API to canvas execution.
  - Updated Electron FFmpeg `cropImage` to use crop expressions `(iw-ow)*anchorX` and `(ih-oh)*anchorY`, preserving non-center focal regions during local crop.
  - Mirrored the FFmpeg crop anchor behavior into `public/electron/service/ffmpeg.js`.
  - Updated remove-bg preset descriptions and panel warning copy to state that Linghui currently creates a graph image-to-image task, not a local transparent-background model.
  - Added tests for crop anchor submission, remove-bg honesty copy, and FFmpeg crop bridge options.
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`: passed.
  - `cd frontend && npm run test -- --run src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/services/ffmpegManager.test.ts src/components/linghui/editors/tests/LinghuiNodeEditor.test.tsx`: 3 files / 30 tests passed; existing jsdom/Three warnings remain.
- Next:
  - Continue image tool fidelity: either implement a real local mask/selection erase UI when a backend exists, or move to canvas interaction polish / next node parity slice.

### Phase 5.13: Canvas Connection Interaction Polish
- **Status:** complete
- Actions taken:
  - Continued LibTV parity on the canvas interaction layer after the image tool pass.
  - Extended the existing `canvas-interacting` state from node/selection dragging to connection dragging as well.
  - Wired valid source-handle connect start to enter interacting state; connect success, connect end, invalid connect start, and Esc cancel all exit it.
  - Hardened Esc cancel by falling back from `PointerEvent` to `MouseEvent` in non-Chromium test environments.
  - Added `useLinghuiCanvasInteractionHelpers.test.tsx` covering pending connection cancellation and interacting-state cleanup.
- Validation:
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`: passed.
  - `cd frontend && npm run test -- --run src/components/linghui/canvas/tests/useLinghuiCanvasInteractionHelpers.test.tsx src/components/linghui/canvas/tests/useLinghuiCanvasHotkeys.test.tsx src/components/linghui/canvas/tests/useLinghuiCanvasFlowBridge.test.ts src/components/linghui/editors/tests/ImageNodeEditor.test.tsx src/services/ffmpegManager.test.ts`: 5 files / 38 tests passed; existing Three warning remains.
- Next:
  - Continue LibTV node parity on the next highest-friction node/tool surface, keeping operation panels compact and in-node where LibTV does so.

### Phase 5.14: AudioNode Resource UI Parity
- **Status:** complete
- Actions taken:
  - Continued node parity by decompiling LibTV `AudioNode` in `template_/libtv/0wanf5895ewvy.js`.
  - Confirmed LibTV resource audio nodes use an in-node waveform/player surface with `AudioNodeToolbar` instead of only native audio controls.
  - Reworked Linghui audio resource state to show a compact waveform stage, in-node speed switcher, download action, native audio control, and filename/duration readout.
  - Kept cloud-only LibTV concepts out of Linghui: no credit UI, no VIP/watermark download branch, no CDN audit status badge.
  - Added tests for resource toolbar presence, download filename, and `1x / 1.5x / 2x` speed cycling.
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/AudioNode.test.tsx`: 1 file / 4 tests passed.
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`: passed.
- Next:
  - Run the broader Linghui targeted suite and root checks after the next slice, or before handing back if stopping.

### Phase 5.15: AgentNode In-node Operation Pass
- **Status:** complete
- Actions taken:
  - Continued node parity by tracing LibTV Canvas Agent/session code and comparing it to Linghui's current `linghui/agent` implementation.
  - Kept Linghui on its existing local Agent execution path instead of faking LibTV's online WebSocket session stack.
  - Added in-node Agent task template chips using `LINGHUI_AGENT_PROMPT_PRESETS`, so common Agent setup no longer requires opening the large editor panel.
  - Added compact in-node settings and run controls; run uses the existing `onRunNode(nodeId)` path.
  - Agent node now surfaces running state, output excerpt, tool count, and iteration count in the node body.
  - Added `AgentNode.test.tsx` for preset application, run triggering, disabled/running behavior, and node-body controls.
- Validation:
  - `cd frontend && npm run test -- --run src/components/linghui/nodes/tests/AgentNode.test.tsx`: 1 file / 4 tests passed.
  - `npx tsc --noEmit --project frontend/tsconfig.json --pretty false`: passed.
- Next:
  - Continue broad node parity or run the full targeted Linghui suite before committing.
