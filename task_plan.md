# Task Plan

## Session: 2026-05-10 Storyboard Image Mode

### Goal
- 在分镜图片模式中，在普通 / 四宫格 / 九宫格基础上增加“故事板”模式。
- 故事板模式用于生成电影级分镜 / 前期制作方案板，强调剧情递进、情绪表演、光影变化、镜头衔接和项目整体风格继承。
- 下一张故事板可选继承上一张故事板图片，并且必须作为真实参考图传入生成链路，而不是只在文字里提及。
- 故事板图片作为多面板参考，不应被视频链路当作单一首帧。

### Scope
- `frontend/src/types/scene-character.ts`
- `electron/service/storage/projectPersistenceHelpers.ts`
- `frontend/src/editor/mentionTypes.ts`
- `frontend/src/services/shotReference/**`
- `frontend/src/services/ShotPromptService.ts`
- `frontend/src/workflow/shotImageWorkflow.ts`
- `frontend/src/workflow/shotVideoPlan.ts`
- `frontend/src/workflow/shotRenderWorkflow.ts`
- `frontend/src/store/promptTemplates.ts`
- `frontend/src/components/storyboard/**`
- 相关测试

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Mode and Persistence | complete | 扩展分镜图片模式类型、SQLite row union、项目元数据读写和测试 |
| 2. Reference Protocol | complete | 增加 `@storyboard_anchor` / `@previous_storyboard_anchor`，并把上一故事板作为真实 reference 传入 |
| 3. Prompt Templates | complete | 新增故事板推理模板和 TTI 终稿模板，整理电影级故事板约束 |
| 4. Workflow Integration | complete | 生图、视频计划和渲染工作流接入 allShots 与故事板引用继承 |
| 5. UI Integration | complete | 分镜卡片、批量模式、继承上一故事板开关和多面板视频模式约束 |
| 6. Validation | complete | 运行目标测试、前端/root TypeScript 检查和 diff check |

### Acceptance Criteria
- 分镜图片模式中可选择“故事板”，批量菜单也支持切换。
- 故事板提示词模板可在提示词模板设置中编辑。
- 故事板生成提示词强调电影级制作板、剧情层层递进、情绪/光影/镜头衔接，并限制生成图中出现可读字幕、标题、项目符号、logo、水印。
- 可选继承上一故事板；默认启用，关闭后不传上一故事板图。
- 启用继承时，上一张故事板图片进入真实 references 数组，可被编译为 `@Image N`。
- 故事板模式视频自动按多参考处理，不允许误选“首帧”。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| `frontend npx tsc --noEmit --project tsconfig.json` 报 `ShotCard.tsx` 中找不到 `onStoryboardInheritPreviousChange` | 1 | 已把该回调从 `ShotCardImpl` props 中解构出来，复跑前端 tsc 通过 |

## Session: 2026-05-10 Storyboard Script Line Editing Stability

### Goal
- 修复分镜列表中“分镜文本/字幕行”逐字编辑时触发父级状态刷新，导致输入框光标跳到末尾、无法在行中间正常编辑的问题。
- 保持添加/删除/拖拽字幕行仍即时保存，文本输入过程不被虚拟列表或异步持久化回写打断。

### Scope
- `frontend/src/components/storyboard/ShotScriptLines.tsx`
- `frontend/src/components/storyboard/Storyboard.tsx`
- `frontend/src/components/storyboard/ShotListEditor.tsx`
- 相关最小测试/类型检查

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Diagnosis | complete | 定位字幕行 input、父级 saveAllShots、Virtuoso/ShotCard memo 的重渲染链路 |
| 2. Targeted Fix | complete | 将逐字输入和持久化提交解耦，避免每个字符触发整列表状态刷新 |
| 3. Validation | complete | 运行相关测试、tsc 和 diff check |

### Acceptance Criteria
- 在字幕行中间插入/删除字符时，光标位置保持在编辑位置，不跳到行尾。
- 文本输入不再每个字符触发分镜全量保存；失焦/提交时仍保存。
- 添加、删除、插入、拖拽字幕行仍能保存。
- 不破坏分镜虚拟列表滚动和其它 prompt/媒体操作。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|

## Session: 2026-05-09 Linghui Prompt Upload Deduplication

### Goal
- 修复灵绘提示词编译/上传协议中同一图片被多次 `@` 引用就重复上传的问题。
- 上传图床后把远程地址落到本地元数据，并与本地文件/图片源稳定关联。
- 仅在缓存远程链接失效或无法访问时重新上传。
- 对照项目分镜链路，确认是否存在同类重复上传与缓存缺口。

### Scope
- `frontend/src/components/linghui/**`
- `frontend/src/services/promptCompilation/**`
- `frontend/src/services/imageHostingService.ts`
- `frontend/src/services/mediaRemoteUrlService.ts`
- 分镜图片/视频生成链路相关服务与测试
- `logs/` 中当日日志与上传相关日志

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Current State Recovery | complete | 定位灵绘提示词编译、上传、元数据和日志触发点 |
| 2. Root Cause | complete | 找出按引用重复上传、请求体重复膨胀和缓存未落盘的具体代码路径 |
| 3. Linghui Fix | complete | 实现按图片源去重、远程 URL 元数据缓存、失效检测后重传 |
| 4. Storyboard Audit/Fix | complete | 检查项目分镜是否共用或复制了同类上传逻辑，必要时修复 |
| 5. Validation | complete | 增补/更新测试，运行目标测试、tsc/build 或最小验证 |

### Acceptance Criteria
- 单个节点内同一图片被多次 `@` 引用时，同一次执行最多上传一次。
- 已上传成功的本地图片再次作为引用时优先复用元数据中的远程 URL。
- 远程 URL 无法访问或过期时会触发重新上传，并更新本地元数据。
- 分镜链路没有保留同样的逐引用重复上传行为。
- 日志能解释修复前重复上传的触发路径。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| `frontend npx tsc --noEmit --project tsconfig.json` 报 `ProviderAssetInput` 上不存在 `localPath/remoteUrl` | 1 | 为灵绘图片 reference 去重 helper 增加显式 StoredMediaAsset 收窄后复跑通过 |
| 分镜日志显示缓存命中前仍对旧 remoteUrl 做 5 秒 HEAD 检测 | 1 | 调整 `ensureRemoteUrlForImageAsset()` 顺序，本地 sourceKey 缓存优先；缓存命中直接返回，缓存 miss 后才检测资产自带 remoteUrl |

## Session: 2026-05-08 Linghui Panorama + Director3D Stabilization

### Goal
- 修复 `linghui/director3d` 节点无法进入编辑的问题。
- 在不回滚现有半成品改动的前提下，优先打通节点创建、画布卡片、编辑器挂载和基础验证。
- 继续以 `docs/linghui-panorama-and-3d-director-workbench-plan.md` 为产品方向，后续再推进全景投影契约与导演台能力增强。

### Scope
- `frontend/src/types/linghui.ts`
- `frontend/src/components/linghui/library/state/linghuiNodeDefs.ts`
- `frontend/src/components/linghui/nodes/**`
- `frontend/src/components/linghui/editors/components/**`
- `frontend/src/components/linghui/director3d/**`
- `frontend/src/components/linghui/page/styles/**`
- 必要测试与本地烟测

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Current State Recovery | complete | 读取计划文档、现有未提交改动和 director3d 接入点 |
| 2. Edit Entry Diagnosis | complete | 定位无法进入编辑的入口断点：节点类型映射、交互 hook、编辑器可见性、渲染异常 |
| 3. Targeted Fix | complete | 小范围修复 director3d 编辑入口，必要时补齐类型/样式/默认值 |
| 4. Validation | complete | 运行针对性测试/构建，必要时启动页面烟测 |

### Acceptance Criteria
- `linghui/director3d` 节点在画布上可创建/展示。
- 双击或已有节点编辑入口能打开 3D 导演工作台编辑器。
- 编辑器打开后不因运行时异常白屏或被交互逻辑拦截。
- 修复不破坏现有全景节点接入。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| DevTools MCP 无法接管 Chrome profile | 1 | 改为补 `useLinghuiCanvasNodeInteractions` hook 测试，直接覆盖 director3d 打开编辑入口 |
| `npm run check:style-discipline` failed | 1 | 首次失败包含新增 director3d/panorama 路径；已收敛新增路径颜色/inline style，复跑后剩余仅为既有 project/settings/storyboard/chat/theme/index 债务 |
| 统一端口目标测试中脚本分镜时长断言仍期望 10 秒 | 1 | 当前 `normalizeVideoDurationSeconds` 会归一到允许档位 12 秒；更新测试断言为当前行为 |

### Follow-up: Fullscreen Director3D Workbench
| Phase | Status | Description |
|------|--------|-------------|
| 1. Fullscreen Editor | complete | `linghui/director3d` 编辑器改为独立全屏 Modal，不再作为节点下方 inline 面板出现 |
| 2. Real View Camera | complete | 移除虚拟相机/画幅标注，工作台编辑视角即真实取景视角 |
| 3. Current View Export | complete | 导出线稿时使用当前工作台视角，并将该视角写回 scene camera / prompt fragment |
| 4. Validation | complete | 运行目标测试、生产构建、样式纪律边界和 diff check |

### Follow-up: Fullscreen Height + Actor Interaction
| Phase | Status | Description |
|------|--------|-------------|
| 1. Height Fix | complete | 覆盖 AntD Modal root/wrap/modal/content/body，并让 director3d layout 按 100vh 撑满 |
| 2. Selection Fix | complete | actor pointer down 后抑制下一次 viewport click，避免点击假人后立刻失活 |
| 3. Drag Fix | complete | actor 拖动改用累计 pointer 位移计算，支持连续自由拖动 |
| 4. Validation | complete | 运行目标测试、生产构建、样式纪律边界和 diff check |

### Follow-up: Ray-Plane Actor Drag
| Phase | Status | Description |
|------|--------|-------------|
| 1. Drag Model Redesign | complete | 假人拖动从屏幕 delta 估算改为当前相机 ray-plane 求交 |
| 2. Direction/Follow Fix | complete | 用鼠标地面交点 + 点击偏移量设置 actor position，解决 X 方向反和不跟手 |
| 3. Validation | complete | 运行目标测试、生产构建、样式纪律边界和 diff check |

### Follow-up: Live-Camera Actor Drag
| Phase | Status | Description |
|------|--------|-------------|
| 1. Root Cause Check | complete | 确认现有 ray-plane 拖动仍通过重建 cameraStateRef 相机计算，可能与真实 R3F camera 滞后 |
| 2. Drag Controller Refactor | complete | 将假人拖动控制下沉到 Canvas 内部，使用 useThree 的真实 camera/gl 射线；拖动中局部预览，松手一次写回 |
| 3. Validation | complete | 运行目标测试、构建和 diff check；记录样式脚本/tsc 既有失败边界 |

### Follow-up: Panorama + Director3D Restore Operability
| Phase | Status | Description |
|------|--------|-------------|
| 1. Persistence Diagnosis | complete | 定位保存恢复后不可操作的风险：旧半成品 RF 类型不一致、恢复时未补默认 slots/properties、上次 running 状态持久化 |
| 2. Restore Repair | complete | 后端 normalize 修正已知语义节点 RF 类型；前端快照恢复合并当前节点默认结构；激活工作区时中断 running 转 stale |
| 3. Validation | complete | 目标测试、前端构建、Electron 构建、样式边界和 diff check |

### Follow-up: Panorama + Director3D SQLite Restore Type Regression
| Phase | Status | Description |
|------|--------|-------------|
| 1. Regression Diagnosis | complete | 定位重新进入后退化成文本节点的根因：SQLite row → snapshot 的 Electron persistence helper 旧映射缺 `linghui-panorama` / `linghui-director3d` |
| 2. Restore Mapping Fix | complete | 补齐 row type 映射，并用属性指纹恢复已误保存为 `linghui-text` 的全景/导演台节点 |
| 3. Validation | complete | 运行 persistence/document/canvas/type 目标测试、root/frontend tsc、Electron build、frontend build 和 diff check |

### Follow-up: Unified Linghui Node Ports
| Phase | Status | Description |
|------|--------|-------------|
| 1. Current Port/Execution Audit | complete | 审计节点 handle 渲染、连接校验、快照持久化、执行输入聚合和提示词引用排序 |
| 2. Unified Port UI | complete | 所有节点只暴露一个输入点和一个输出点，减少多端口蜘蛛网 |
| 3. Semantic Upstream Filtering | complete | 连接允许按节点级上游传递，执行时由节点自身按类型过滤需要的上游结果 |
| 4. Legacy Edge Compatibility | complete | 兼容旧 `input-N` / `output-N` 边，保存时规范化到统一 handle |
| 5. Validation | complete | 跑连接/执行/canvas 相关测试、tsc、构建与 diff check |

### Follow-up: Full TSC Debt Cleanup
| Phase | Status | Description |
|------|--------|-------------|
| 1. Error Inventory | complete | 重新跑 `frontend npx tsc --noEmit --project tsconfig.json` 和 root `npx tsc --noEmit --project tsconfig.json`，归类剩余类型错误 |
| 2. Runtime Type Fixes | complete | 修复业务代码中的类型不匹配、IPC 类型缺口、union 收窄问题 |
| 3. Test Type Fixes | complete | 修复测试 mock / fixture 类型错误，不改变被测逻辑 |
| 4. Validation | complete | 复跑 root/frontend tsc、目标测试、构建和 diff check |

### Follow-up: Storyboard Video Prompt Template Cleanup
| Phase | Status | Description |
|------|--------|-------------|
| 1. Template Audit | complete | 检查全部 `shot_video_*` reasoning 模板与 grid shots section，定位会诱导模型输出自检清单的段落 |
| 2. Template Repair | complete | 移除视频模板里的输出前自检清单，统一最终视频字段为结构化中文提示词格式 |
| 3. Dialogue Repair | complete | 视频生成路径显式合并 `shot.dialogue`，并在模型漏写时补回 `对白提示词` |
| 4. Validation | complete | 跑目标单测、root/frontend tsc、frontend build、diff check |

### Follow-up: Storyboard Image/Video Prompt Visual Alignment
| Phase | Status | Description |
|------|--------|-------------|
| 1. Reference Prompt Analysis | complete | 参考用户给的三段样例，提炼画面字段：画风、景别、多机位运镜、视频运动、画面描述、角色/道具、呼应、动作、对白、情绪、音效、BGM、光影 |
| 2. Image Prompt Alignment | complete | 生图推理模板改为视频 0 秒锚点结构，并接入 `shot.dialogue` / 视频镜头结构参考 |
| 3. Video Prompt Alignment | complete | 8 个视频模板统一增加 `画面描述`、`呼应提示词`、`多机位运镜` 和更强前中后景/特写约束 |
| 4. Grid/TTI Alignment | complete | 九/四宫格推理和 TTI 直拼模板增强连续动作、画面层次、手部姿态、光影一致性 |
| 5. Validation | complete | 跑模板/提示词目标测试、root/frontend tsc、frontend build、diff check |

### Follow-up: First-Person Narration To Scene Dialogue
| Phase | Status | Description |
|------|--------|-------------|
| 1. Failure Analysis | complete | 明确 `她自称天道，说要帮我夺回气运` 不是旁白输出目标，也不是原台词，而是要转成真实剧情对白 |
| 2. Service Guard Fix | complete | 台词兜底区分显式对白与叙述转写；第一人称叙述/转述只补改写后的真实剧情对白，不补来源句 |
| 3. Template Education | complete | 8 个视频模板新增 `NARRATIVE_TO_SCENE` 规则，但不再暴露具体来源句/错误示例，避免模型照抄 |
| 4. Validation | complete | 跑目标测试、root/frontend tsc、frontend build、diff check |

### Follow-up: Video Prompt Single Output Pass
| Phase | Status | Description |
|------|--------|-------------|
| 1. Duplicate Diagnosis | complete | 定位 `镜头1-镜头4` 出现两遍的原因：多参模板把 `shotsSection` 内部参考复制成第二套逐镜头 Markdown 输出 |
| 2. Template Constraint | complete | 多参模板明确 `shotsSection` 只作内部参考，最终只允许输出一组字段，镜头顺序必须合并进 `角色动作提示词` |
| 3. Non-destructive Guard | complete | 撤掉 `精确时长` 后截断逻辑；仅保留去掉开头 `镜头1-镜头4` 前缀和对白里的来源叙述泄漏 |
| 4. Validation | complete | 跑目标测试、root/frontend tsc、frontend build、diff check |

### Follow-up: Anchor Mention Highlight + No Fake Grid Anchor
| Phase | Status | Description |
|------|--------|-------------|
| 1. Mention Highlight | complete | `@shot_anchor` / `@grid_anchor` 纳入 ScriptEditor mention parser、tooltip、chip 样式和补全标签，不依赖资产列表也能高亮 |
| 2. Asset Type Safety | complete | 资产同步和 prompt compilation 明确跳过 shot/grid 内置锚点，避免把锚点当成角色/场景/道具资产 |
| 3. No-Image Prompt Mode | complete | 没有真实生成分镜图时忽略 `imageMode=grid` 的宫格 shotsSection，回到 normal / 多参考模式，不注入不存在的 `@grid_anchor` |
| 4. Template Guard | complete | 生图/视频模板和 reference table 增加锚点存在性判断：无真实锚定图时禁止输出 `@shot_anchor` / `@grid_anchor` |
| 5. Validation | complete | 跑 mention/shotReference/prompt 模板目标测试、root/frontend tsc、frontend build 和 diff check |

### Follow-up: Prompt Compilation Fallback + Anchor Preview
| Phase | Status | Description |
|------|--------|-------------|
| 1. Compile Failure Diagnosis | complete | 检查 `@prop_*` 未进入 reference bundle 后如何漏到最终 provider prompt |
| 2. Unmapped Asset Fallback | complete | 对缺图/超限导致无法映射的资产 mention 做可读标签降级，避免 raw `@prop_*` 污染最终提示词 |
| 3. Selected Anchor Tooltip | complete | `@grid_anchor` / `@shot_anchor` 悬浮预览使用当前选中的分镜图，而不是无图内置 fallback |
| 4. Prefixed Mention Token Fix | complete | bundle builder 统一用 `createMentionString()` 生成角色/场景/道具 token，修复 `prop_...` 被拼成 `@prop_prop_...` 导致无法编译的问题 |
| 5. Single Bundle Compilation | complete | 分镜生图/视频统一由 `ShotReferenceBundle` 编译一次；删除分镜视频旧 `selectedAssetsForCompilation` 重排路径 |
| 6. Validation | complete | 补目标测试并运行 frontend/root tsc、frontend build 与 diff check |

### Follow-up: Tweet Narration Dialogue Mode
| Phase | Status | Description |
|------|--------|-------------|
| 1. Mode Propagation | complete | 将项目 `drama` / `narration` 模式加入 `CreationContext`，传到分镜拆解、生图、视频提示词链路 |
| 2. Breakdown Template Update | complete | 分镜拆解模板按项目叙事模式约束 `dialogue` 字段：剧情模式可少量剧情化对白，解说模式保持旁白主导 |
| 3. Video/Image Prompt Update | complete | 生图、宫格、视频推理模板注入 `dialogueModeDirective`，让图片锚点与视频对白策略一致 |
| 4. Service Guard Update | complete | 视频台词兜底仅在剧情模式改写第一人称推文解说；解说模式不强行补对白 |
| 5. Validation | complete | 跑提示词目标测试、root/frontend tsc、frontend build 和 diff check |

### Follow-up: Storyboard Video ITV Upload Protocol
| Phase | Status | Description |
|------|--------|-------------|
| 1. TTS Side-effect Removal | complete | 分镜视频生成链路移除自动语音生成副作用，视频生成只提交 ITV 任务 |
| 2. Remote Reference Upload Policy | complete | URL-only 视频 provider 默认强制图床上传成功，不再静默 fallback 到 data-url |
| 3. OpenAI Placeholder Mapping | complete | `openai-video` 在 prompt 使用 `@Image N` 时把主图和参考图统一写入 `images` 数组 |
| 4. Grok URL-array Wire Protocol | complete | Koma 官方 Grok 内部仍用 `@Image N` 编译，但 `/v1/videos` URL-array 出站 prompt 改写为 `图片N` 并补 `metadata.function_mode` |
| 5. Reference Capacity + Prompt Cleanup | complete | Grok 默认参考图上限提升到 7；分镜视频执行前清洗旧脏 prompt，并用编译后 prompt 记录日志/版本 |
| 6. Validation | complete | 跑 ITV/provider/分镜链路目标测试、root/frontend tsc、frontend build、Electron build 和 diff check |

## Session: 2026-05-06 Linghui Tapnow-Base Capability Audit

### Goal
- 审计当前 Koma 灵绘与参考项目 `/Users/sunmeng/workspace/tapnow-base` 的节点画布基础能力差异。
- 在不回滚已有未提交改动的前提下，补齐灵绘缺失或半成品能力，优先完善已出现的 `linghui/panorama` 全景/首尾帧链路。
- 保持现有 Linghui 架构边界：节点定义、编辑器、画布交互、执行器、类型、持久化文档 schema 统一演进。

### Scope
- `frontend/src/types/linghui.ts`
- `frontend/src/components/linghui/library/state/linghuiNodeDefs.ts`
- `frontend/src/components/linghui/nodes/**`
- `frontend/src/components/linghui/editors/components/**`
- `frontend/src/components/linghui/execution/state/**`
- `frontend/src/components/linghui/canvas/hooks/**`
- `electron/service/linghui/document.ts`
- 必要测试与文档记录

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Reference Audit | complete | 对照 tapnow-base 的基础节点、生成链路、媒体栈与导入导出能力，整理 Koma 差距 |
| 2. Current Diff Review | complete | 审查当前未提交灵绘改动，判断哪些是半成品、哪些需要接入 |
| 3. Capability Implementation | complete | 补齐缺失能力，优先让新增/半成品节点完成类型、UI、执行和持久化闭环 |
| 4. Validation | complete | 运行针对性测试/构建，必要时浏览器烟测灵绘入口 |

### Acceptance Criteria
- 参考项目的基础节点能力在 Koma 灵绘中有明确映射或记录为有意不做。
- 已存在的 `linghui/panorama` 改动不处于半接入状态：可创建、可编辑、可预览、可执行、可被下游消费、可持久化。
- 执行层对图片输入、首尾帧/全景类输出、提示词与模型参数处理稳定，不静默丢失引用。
- 构建或相关测试通过；如存在既有失败，记录具体边界。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| `npm run check:style-discipline` failed | 1 | 确认为既有项目/分镜/chat/theme 注释与根 token 快照债务；新增 Linghui panorama/Recipe 路径未命中该脚本失败项 |

## Session: 2026-05-06 Linghui Canvas Interaction Audit

### Goal
- 暂时移除不需要的基础工作流模板，避免把灵绘基础能力误导成预设 Recipe。
- 审计并改善灵绘画布基础操作：拖拽、连线锚点、执行入口、执行流反馈动画、失败反馈与执行日志。
- 优先修正“反人类”的高频触点：锚点难拖、运行入口藏太深、失败信息一闪而过、连线执行状态不够清楚。

### Scope
- `frontend/src/components/linghui/canvas/**`
- `frontend/src/components/linghui/page/components/LinghuiPage.tsx`
- `frontend/src/components/linghui/page/styles/**`
- `frontend/src/components/linghui/execution/state/linghuiExecutionWorkflow.ts`
- `frontend/src/components/linghui/library/state/linghuiRecipeTemplates.ts`
- 相关测试与记录文件

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Template Cleanup | complete | 暂时隐藏内置系统 Recipe，不再让工作流模板占据主线入口 |
| 2. Interaction Audit | complete | 定位 HUD、右键菜单、锚点、连线、执行状态和日志的主要摩擦点 |
| 3. First-Pass Fixes | complete | 优化一键运行入口、锚点命中区、连线执行动画、失败日志与连接失败记录 |
| 4. Failure Feedback Pass | complete | 节点本体展示失败原因，HUD 展示最近错误/运行日志并支持点击定位节点，失败执行后自动聚焦首个失败节点 |
| 5. Magnetic Handles | complete | 统一所有输入/输出连接点视觉与命中模型，增大连接吸附范围，并增加线靠近连接点时的磁吸动画 |
| 6. Validation | complete | 跑相关测试、构建和必要的样式纪律边界检查 |
| 7. Video Duration Constraints | complete | 灵绘视频节点按当前 ITV 渠道/模型动态限制时长，grok 走枚举，即梦走范围，并在执行前二次归一 |
| 8. Execution Log Sidebar Panel | complete | 将执行日志从画布 HUD 自动浮层迁移到左侧菜单入口，重做可关闭/可展开收起的日志面板 |
| 9. Duplicate Submission Guard | complete | 执行目标链路中存在仍在轮询/运行中的节点时阻止重复提交 provider，并允许过期 running 状态重新触发 |
| 10. Diagnostics Log Export | complete | 设置页新增前后端日志收集/导出 zip；前端日志经白名单 IPC 追加落盘，日志目录跟随 storageRoot |
| 11. Editor Action Click Guard | complete | 画布节点编辑器的生图、生视频等提交按钮增加即时防双击锁，避免运行态刷新前重复提交 |
| 12. Workspace Empty Node Guard | complete | 修复空壳 React Flow 节点进入灵绘工作区文档后导致保存/新建返回空文档的问题，并透出后端真实错误 |
| 13. Workspace Package Import Export | complete | 灵绘项目列表增加删除、导入、导出；导出 `.linghui.zip` 包含工作区文档、资产/历史/模板记录和本地静态资源 |

### Acceptance Criteria
- 系统 Recipe 暂时不再出现在模板列表，用户保存的工作区模板能力保留。
- 画布 HUD 可直接一键运行全部/选中，不依赖右键菜单探索。
- 连线锚点更容易拖拽，连接预览和执行状态更明显。
- 节点失败、上游阻塞、连接失败都有可回看的日志记录或更具体 toast。
- 执行失败后首个失败节点会被自动选中聚焦，节点卡片上直接露出失败原因。
- 执行日志入口收纳到左侧菜单；日志面板可手动打开、关闭、展开/收起，日志项可点击定位相关节点。
- 目标链路里已有运行中节点时，不会再次提交视频/生图等 provider；过期的异常 running 状态不会永久阻塞用户重新执行。
- 生图、生视频等节点编辑器提交按钮连续双击只会触发一次提交；首击后立刻短暂锁定，随后仍由运行态禁用兜底。
- 设置页可导出诊断日志 zip，包含 renderer/main/Electron 日志和 manifest；storageRoot 变更后日志目录同步切换。
- 所有节点连接点使用同一套视觉/吸附样式；连线进入扩大范围即可吸附到端口，不必像素级碰到圆点。
- 配置了空壳节点的画布不会再把无效节点写入工作区文档；新建/保存遇到后端异常会显示真实错误而不是 undefined 文档报错。
- 项目列表可以删除、导入和导出灵绘项目；导出的 zip 包可带走节点属性、运行结果、资产库与历史结果引用到的本地静态资源。
- 相关测试/构建通过；既有风格脚本失败边界单独记录。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| `npm run check:style-discipline` failed after first edge patch | 1 | `LinghuiEdge` 的 `style={edgeStyle}` 被脚本拦截，已改为 `cssVars(...)`；复跑后新灵绘画布文件不再命中 |
| `npm run check:style-discipline` still fails | 2 | 剩余失败均为既有 project/storyboard/chat/theme/index.scss 债务，本轮不扩大范围 |
| `npm run check:style-discipline` still fails after magnetic handles | 3 | 失败项仍只在既有 project/storyboard/chat/theme/index.scss 路径；新增 `LinghuiNodeHandle`、连接点样式和舞台半径未出现在失败列表中 |
| `npm run check:style-discipline` still fails after video duration pass | 4 | 失败项仍只在既有 project/storyboard/chat/theme/index.scss 注释/颜色/inline style 债务；本轮视频时长文件未出现在失败列表中 |
| `灵绘工作区数据异常：未返回工作区文档` after canvas with empty nodes | 1 | 空壳 React Flow 节点缺少 `type/data.linghuiType`，后端严格 normalize 会抛错且 ee-core 会吞成 undefined；已在前端快照、后端 normalize、controller/store 错误透出三层修复 |

## Session: 2026-05-03 Theme System Architecture

### Goal
- 在独立 `git worktree` `/Users/sunmeng/workspace/Koma-theme-worktree` 中改造主题架构，避免影响主目录正在进行的其它工作。
- 按 `docs/THEME_SYSTEM_PLAN.md` 与 `docs/THEME_ARCHITECTURE.md` 先落地 M1：Theme token 分层、ThemeProvider、Tailwind 变量转发、设置页暗色双主题切换与持久化。
- 使用团队模式：1 个前端架构师负责只读审查，3 个前端 worker 分别负责主题核心、入口/Tailwind、设置页持久化；主线负责集成与验证。

### Scope
- `frontend/src/theme/**`
- `frontend/src/index.tsx`
- `frontend/src/index.scss`
- `frontend/src/store/settings/**`
- `frontend/src/store/globalStore.ts`
- `frontend/src/types/provider-config.ts`
- `frontend/src/components/settings/**`
- `frontend/src/components/asset/**` 样式入口
- `frontend/src/components/chat/**` 与 `frontend/src/chat/components/**` 样式入口
- `frontend/src/components/storyboard/**` 样式入口
- 必要的 i18n / 文档 / 轻量测试

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Worktree Setup | complete | 从当前 `feat/panel-restore2` HEAD 创建 `codex/theme-system-architecture` 工作树 |
| 2. Architecture Recon | complete | 阅读主题、入口、Tailwind、设置存储、设置页结构，并收集团队建议 |
| 3. Theme Core | complete | 实现 `SemanticTokens`、主题 registry、CSS vars 编译、Antd config、ThemeProvider hooks |
| 4. Entry & CSS Vars | complete | 入口挂 ThemeProvider，`index.css` 改为 `--token-*` 与 Tailwind 转发 |
| 5. Settings UI & Persistence | complete | `AppSettings.uiThemeId` 持久化，设置页增加 UI 主题选择 |
| 6. Integration Validation | complete | 解决冲突，运行构建/测试/grep 自检，记录剩余未完成项 |
| 7. Source CSS to SCSS | complete | 将源代码内自有 `*.css` / `*.module.css` 迁移为 `.scss` / `.module.scss`，并修正迁移文件里的 SCSS/CSS 语法、token/color-mix 消费和 imports |
| 8. Light Business Theme | complete | 新增 `light-business` 主题并接入设置页切换、持久化、Antd defaultAlgorithm，清理 dark-only flag，主题纪律自检已通过 |
| 9. Inline Style Discipline | complete | 普通 inline style 全面迁移为 SCSS/Tailwind/CSS 变量桥接；严格脚本覆盖 `style={{...}}` 与 `style={expr}` |
| 10. High Contrast Theme | complete | 注册 `high-contrast` 主题，和其它预设共享同一 ThemeProvider/Settings 切换链路 |
| 11. Theme Guardrails | complete | 增加 `check:style-discipline`、主题专用 ESLint、Stylelint 和 GitHub Actions workflow |
| 12. Final Validation | complete | `npm run lint:theme`、`npm run build`、普通 CSS 清零 grep、浏览器挂载烟测均通过 |

### Acceptance Criteria
- 默认 `dark-emerald` 视觉与现有 token 值一致。
- `dark-business` 可在设置页选择并即时生效。
- `light-business` 可在设置页选择并即时生效。
- 刷新后主题选择持久化。
- Antd 主题配置由 active theme 生成，入口不再直接持有静态 `antdTheme`。
- Tailwind 语义工具类继续可用，`@theme` 不再持有真实 hex。
- 旧的 `tokens` / `antdTheme` import 尽量保持兼容，降低本轮改造半径。
- 源码目录自有 `*.css` / `*.module.css` 为 0；仅保留第三方 CSS import 白名单。
- 非 CSS 变量桥接的 inline style 为 0；`style={expr}` 也被自检脚本覆盖。
- `darkTheme={true}` / `colorMode="dark"` 字面量为 0。
- `business-hardcoded-colors` 为 0；业务 UI 硬编码颜色是 0 容忍，只保留文档化非 UI 例外。

### Deferred
- 受激活页限制，本轮浏览器烟测确认了应用挂载与根主题变量写入，但未能在真实 UI 中点击设置页完成 4 主题截图矩阵。
- `npm run build` 仍有既有 Vite chunk/dynamic import warnings，以及 Sass 对 `@import "tailwindcss"` 的上游弃用提示；不影响本轮主题目标。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| 全历史 fork agent 不允许指定 agent_type/model/reasoning | 1 | 改为非 fork agent 并显式传入工作目录 |
| 严格 inline 检查暴露 `style={expr}` 漏洞 | 1 | 扩展 `check-style-discipline.ts`，表达式样式仅放行 `cssVars(...)` 产物和精确文档例外 |
| `ScriptEditor` rootClassName 补丁误插到文件末尾 | 1 | 浏览器烟测发现 `className is not defined`，已移回组件作用域并复跑 lint/build/浏览器 |

## Session: 2026-04-04

### Goal
- 系统性优化灵绘所有节点编辑窗口的样式与操作体验。
- 统一编辑壳层、边距、提示区、工具区和表单控件表现。
- 去掉内部重边框与割裂背景，改成更扁平、更贴近画布的编辑体验。
- 处理已明确暴露的问题：
  - 图片节点在没有图片时不展示上方工具菜单，只保留名称重命名。
  - 文生图提示词编辑区与外层容器融合，避免独立边框、独立底色和贴顶。
  - 视频节点弹窗切到极简模式：无视频时隐藏顶部处理菜单，主界面只保留精简模型/参数回显、提示词与动作按钮，详细参数进入二级弹层。
  - 以视频节点一级弹窗为模板，把文本、脚本、Agent、音频、图片等其他节点编辑器也收敛成“主输入 + 摘要控件 + 动作按钮”的极简结构。
  - 将 `LinghuiPage.css` 迁移到 `sass` 并拆分成按模块组织的 partial，降低单文件维护成本。
  - 将核心 Linghui `scss` 从“传统 CSS 平铺写法”继续收敛到 `tokens + mixins + nested selectors`，形成第二层样式规范。

### Scope
- `frontend/src/components/linghui/editors/components/*`
- `frontend/src/components/linghui/page/components/LinghuiPage.tsx`
- `frontend/src/components/linghui/page/styles/*`
- 如有需要，少量调整 `frontend/src/components/linghui/editors/components/LinghuiPromptEditor.tsx`

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Audit & Plan | complete | 审核当前编辑器结构、共用样式类和用户点名问题，形成统一改造路径 |
| 2. Shared Shell Cleanup | complete | 优化 NodeEditor 顶栏、主面板、工具栏、字段区、提示区的共享视觉规范 |
| 3. Targeted Editor Fixes | complete | 修复图片、文生图、文本、音频、视频、脚本、Agent 的结构与易用性问题 |
| 4. Validation | complete | 运行构建并通过页面快照确认图片空态顶栏已收敛 |
| 5. Video Popup Simplification | complete | 将视频节点编辑弹窗收敛为极简主控 + 二级参数弹层，并补齐下载能力与空视频态顶栏收敛 |
| 6. Other Editor Minimalization | complete | 复用视频弹窗交互模型，压缩文本、脚本、Agent、图片、音频编辑器的一级结构，并进一步收掉脚本空态与音频结果预览冗余 |
| 7. Style Preprocessor Split | complete | 将 Linghui 页面样式迁移到 Sass，并按页面骨架、库面板、画布外壳、React Flow、紧凑节点、节点编辑器、媒体面板拆成多个 partial |
| 8. Sass Nested Convergence | complete | 抽离共享 tokens 与 mixins，并将页面骨架、侧栏/库面板、节点编辑器等核心 partial 重写为嵌套式 Sass 结构 |
| 9. Remaining Partial Convergence | complete | 将 `media-panels`、`compact-nodes`、`canvas-overlays`、`canvas-reactflow` 四个剩余 partial 也收敛到同一套嵌套式 Sass 命名空间与共享原语上，并通过生产构建验证 |

### Acceptance Criteria
- 所有节点编辑窗口的外壳与控件密度一致，不再出现重复边框和强分隔线。
- 提示词区域上下左右有合理留白，和外层容器融为一体。
- 图片导入节点无图片时不再显示无意义顶部操作区，只保留名称编辑能力。
- 各编辑器底部操作区、选择器、空态卡片在视觉上更扁平，操作触达更直接。
- 视频节点一级弹窗不再保留输入预览、冗余标题和提示文案；模型与参数改成摘要式交互。
- 视频节点在无当前视频时不展示顶部视频处理工具；有结果时支持直接下载。
- 其他节点编辑器优先保留主输入与动作，次级设置尽量折叠进 `Popover` / `Dropdown`，避免一级界面堆叠工具条与结果区。
- Linghui 页面样式不再依赖单个 5000+ 行大文件，而是通过 Sass 主入口聚合多个功能模块 partial。
- Linghui 核心样式模块不再只是 `.scss` 后缀的平铺 CSS，而是通过 `tokens + mixins + 嵌套命名空间` 组织共享视觉规则。

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| `ArrowUp is not defined` 运行时报错 | 1 | 恢复 `ImageNodeEditor.tsx` 中的 `ArrowUp` 导入并重新构建验证 |
| `LinghuiPage.css: Unclosed block` 构建失败 | 1 | 修复新增通用编辑器样式时遗漏的 `}`，重新构建通过 |

## Session: 2026-05-10

### Goal
- 修复故事板模式中 `@previous_storyboard_anchor` 悬浮预览缺少上一分镜当前选中图片的问题。
- 确认故事板多版本切换后，后续分镜引用使用的是上一故事板当前选中版本，而不是固定第一张。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Inspect Current Chain | complete | 检查 `ShotListEditor`、`ShotCard`、`buildShotReferenceBundle`、`ImageCardGrid` 的选中版本与 mention 数据流 |
| 2. Patch UI Mention Preview | complete | 将上一故事板当前选中版本传入提示词编辑器 mention 数据，并和故事板继承开关保持一致 |
| 3. Lock Reference Behavior | complete | 增加测试覆盖上一故事板多版本 currentImageIndex 被后续引用使用 |
| 4. Validate | complete | 运行相关单测、TypeScript 和 diff 空白检查 |

## Session: 2026-05-10 Video Version Playback

### Goal
- 修复分镜视频多版本播放时始终播放最后一个版本的问题。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Trace Playback Chain | complete | 检查 `ShotCard`、`VideoCardGrid`、`StagePlayer`、`MediaGenerationService` 的视频选择和播放源链路 |
| 2. Patch Player Source Identity | complete | 给当前视频源生成稳定 key，切换版本时强制重建播放器实例/原生 video 节点 |
| 3. Patch Versioned Video Persistence | complete | 给 `shot-version` 视频生成和恢复任务透传 `shots/<shotId>/versions/vN/video.mp4` 目标路径 |
| 4. Validate | complete | 运行分镜视频链路、ITV 策略、StagePlayer、TypeScript 和空白检查 |

## Session: 2026-05-10 Storyboard Batch Media Persistence

### Goal
- 分镜批量出图 / 批量生成视频改为单项完成即落盘/刷新。
- 单个分镜失败不能让已成功结果丢失，也不能中断剩余分镜继续生成。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Diagnosis | complete | 定位批量图片和批量视频都等整批完成才回写 UI/刷新存储，视频批量缺外层异常隔离 |
| 2. Implementation | complete | 增加 per-item completion 回调、逐项刷新和失败继续 |
| 3. Validation | complete | 运行目标测试、tsc 和 diff check |

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|

## Session: 2026-05-10 Storyboard Prompt Template Production Board Upgrade

### Goal
- 继续优化故事板提示词模板，让输出更统一、更像电影前期制作板。
- 默认包含场景设计区、俯视镜头调度图、8镜头分镜故事区、灯光/情绪/声音/摄影/色彩方案。
- 保留剧情内容驱动和项目整体风格继承，避免退回固定 2x2 信息图。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Template Audit | complete | 定位故事板推理模板与 TTI 终稿模板，确认现有约束偏自由 |
| 2. Template Upgrade | complete | 增加电影制作板默认骨架和模块化输出字段 |
| 3. Validation | complete | 更新模板测试并运行目标测试 / TypeScript / diff check |

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|

## Session: 2026-05-10 Storyboard Template Flexible Production Poster

### Goal
- 去掉故事板模板中机械固定 8 镜头的倾向。
- 保留专业电影分镜信息图海报的清晰模块和现代 UI / 深蓝标题栏 / 高密度整洁排版。
- 镜头数量、角色数量、区块比例由剧情内容推断，用 X / N 表达而不是硬编码。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Template Rebalance | complete | 将固定 8 镜头约束改成剧情驱动镜头数，并补项目标题/角色设计区 |
| 2. Validation | complete | 更新测试并运行模板测试、TypeScript、diff check |

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|

## Session: 2026-05-10 Storyboard Project Title Metadata

### Goal
- 故事板提示词增加【项目标题】区的运行时字段：项目名称、副标题、拍摄形式、类型、时长、限制条件。
- 类型必须来自项目类型 `ProjectMeta.genre`。
- 时长必须来自当前分镜 `Shot.duration`。
- 验证这些字段不是只写进模板文案，而是真正传入 `storyboard_shot_prompt_generation`。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Diagnosis | complete | 确认 `Shot.duration` 存在但故事板模板未传入；项目类型在 `ProjectMeta.genre`，故事板生成链路未加载项目元数据 |
| 2. Implementation | complete | `CreationContext` 暴露项目标题/类型；`ShotPromptService` 为故事板模板注入 projectTitle/projectType/shotDurationSeconds 等字段 |
| 3. Template Update | complete | `storyboard_shot_prompt_generation` 的输入和输出字段明确使用项目标题区变量 |
| 4. Validation | complete | 服务层测试确认真实传参；模板测试确认变量和文案约束；目标分镜链路测试通过 |

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| frontend tsc 被 `TaskManager.test.ts` 的 `Array.findLast` 阻塞 | 1 | 该文件属于本轮外未提交改动，未修改；记录为非本轮阻塞 |

## Session: 2026-05-10 Storyboard Anchor Highlight In Prompt Editors

### Goal
- 图片提示词和视频提示词编辑器里，故事板锚点 `@storyboard_anchor` 与上一故事板锚点 `@previous_storyboard_anchor` 要有明显高亮。
- 故事板模式下编辑器补全/tooltip 要能清楚区分“当前故事板”和“上一故事板”。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Diagnosis | complete | 确认 mention 协议已支持故事板锚点，但 `mentionTheme` 没有 storyboard 专属样式 |
| 2. Implementation | complete | 更新 CodeMirror mention 样式与 ShotCard 传入的故事板锚点 mention items |
| 3. Validation | complete | 跑 mention/types、assetRetention、ShotPromptService、promptTemplates、frontend tsc 和 diff check |

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|

## Session: 2026-05-10 Prompt Editor Snapshot Consistency

### Goal
- 修复手动编辑图片/视频提示词后，点击生图/生视频发送出去的 prompt 与输入框不一致。
- 修复视频提示词中人物台词重复、多次拼接、旧 dialogue 字段污染手写 `对白提示词` 的问题。
- 修复没有视频提示词时仍能发送默认兜底提示词的问题，避免用户误以为空输入也发了“某处来的提示词”。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Diagnosis | complete | 定位到保存队列/DB 读取竞态，以及 `ensureExplicitDialogueInVideoPrompt` 对手写对白二次补全 |
| 2. Snapshot Fix | complete | 生图/生视频入口使用最新 React shot 快照并等待保存队列 flush；批量图片/视频也透传当前 shots 快照，不再从旧 DB/闭包取 prompt |
| 3. Dialogue Fix | complete | 手写完整 `对白提示词` 时不再追加 `shot.dialogue`；收窄对白清洗，保留显式 `台词：`；空图片/视频提示词不再隐式走默认模板发送 |
| 4. Validation | complete | 增加/更新测试并跑目标测试、frontend/root tsc、diff check |

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| 新增手写对白测试首次失败，`叶赎 台词` 被清洗掉 | 1 | `sanitizeNarrativeDialogueLeakage()` 误把含“自称天道”的显式台词当旁白泄漏删除；已让 `台词：` 标记优先保留，并把旁白泄漏匹配限制为片段开头 |

## Session: 2026-05-12 Director3D Model Refinement And Open Model Catalog

### Goal
- 精修 3D 导演工作台中的主角 / 群演 / 方阵程序化模型，让主角有面部、正背面、手脚、关节等可读细节，其他人物也能看出朝向。
- 查找开源模型画法与骨骼画法，把许可证清晰的来源导入导演工作台资产入口，避免直接打包不明授权或过大资产。
- 优化导出 prompt，让下游图片 / 视频模型知道程序化人物包含面部朝向、正背标记、骨骼姿态和群演排布。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Research & Diagnosis | complete | 确认当前 Director3D 是程序化 mesh；检索 Kenney / MakeHuman / Poly Haven / Khronos glTF / Three.js SkeletonHelper 来源与许可 |
| 2. Procedural Model Refinement | complete | 精修主角、群演、方阵模型的面部/正背/服装/关节/手脚细节 |
| 3. Open Model Catalog Integration | complete | 增加开源模型来源目录并接入左侧资产 rail |
| 4. Prompt & Tests | complete | 更新导演 prompt 编译与资产库测试，运行目标测试 / TypeScript / diff check |

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
| 按旧总结路径读取 `frontend/src/components/linghui/director3d/Director3DNodeEditor.tsx` 失败 | 1 | 实际文件在 `frontend/src/components/linghui/editors/components/Director3DNodeEditor.tsx`，已重新定位 |

## Session: 2026-05-12 Director3D Procedural Detail Pass

### Goal
- 隐藏 3D 导演工作台左侧“外部模型库/模型”入口，不再展示开源来源库。
- 不引入额外外部资源，继续用 procedural mesh 细化人物、动物、道具模型。
- 动物要补足物种特征，道具要从单纯占位变成可读的具体物件。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Diagnosis | complete | 确认生物和道具当前主要是基础几何，模型库入口来自上一轮新增 rail tab |
| 2. Hide External Catalog | complete | UI 隐藏“模型”入口，保留底层目录文件和测试 |
| 3. Creature Detail Pass | complete | 细化四足、飞禽、神龙/凤凰等 procedural mesh 特征 |
| 4. Prop Detail Pass | complete | 根据 actor label/promptHint 细化桌椅车树门窗等道具几何 |
| 5. Validation | complete | 运行目标测试 / TypeScript / build / diff check |

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|

## Session: 2026-05-12 Director3D Structural Model Rework

### Goal
- 按开源 procedural / low-poly 模型代码思路重调动物和道具结构，不引入资源文件。
- 修复动物不像、形状不对、头身体错位、脚和身体层级不对的问题。
- 道具不再纯色大块，补材料分区和正确体块比例。

### Phases
| Phase | Status | Description |
|------|--------|-------------|
| 1. Reference Review | complete | 查找 procedural animal / low-poly / bird geometry 思路，确认以骨架体块重排为主 |
| 2. Creature Structural Rework | in_progress | 重排四足、飞禽、龙形的腿/身体/颈/头/尾/翼层级和比例 |
| 3. Prop Structural Rework | pending | 重画主要道具体块、材料分区和边缘细节 |
| 4. Validation | pending | 运行目标测试 / TypeScript / build / diff check |

### Error Log
| Error | Attempt | Resolution |
|------|---------|------------|
