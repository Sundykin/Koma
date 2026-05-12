# Progress Log

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
- **Status:** in_progress
