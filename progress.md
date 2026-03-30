# 進度日誌

## 會話：2026-03-28 图片节点多图集合与宫格切分

### 階段 1：上下文回读与方案收敛
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 读取 `openspec/AGENTS.md`、`openspec/project.md`、`openspec list`、`openspec list --specs`
  - 读取现有 `TASK_PLAN.md`、`findings.md`、`progress.md`
  - 检查 `ImageNodeEditor.tsx`、`ImageNode.tsx`、`LinghuiNodeEditor.tsx`
  - 检查 `linghuiPromptReferences.ts`、`linghuiExecutionNodeExecutors.ts`、`linghuiExecutionProviders.ts`
  - 检查 `electron/service/ffmpeg.ts`、`electron/controller/ffmpeg.ts` 和 `ffmpegManager.ts`
  - 收敛为“多图集合 + 主图控制 + 独立宫格切分工具”的实现方向
- 建立/修改的檔案：
  - `TASK_PLAN.md`
  - `findings.md`
  - `progress.md`

### 階段 2：OpenSpec 变更草案
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 新建 `openspec/changes/add-linghui-image-batches-and-grid-split/`
  - 起草 `proposal.md`，明确图片集合、主图和宫格切分范围
  - 起草 `design.md`，定义多图集合数据模型、下游只消费主图和 NxN 切图策略
  - 起草 `tasks.md`，拆解数据模型、UI、执行链和 FFmpeg 扩展任务
  - 起草 `specs/linghui-studio/spec.md`，写入图片节点多图与宫格切分要求
  - 执行 `openspec validate add-linghui-image-batches-and-grid-split --strict` 并通过
- 建立/修改的檔案：
  - `openspec/changes/add-linghui-image-batches-and-grid-split/proposal.md`
  - `openspec/changes/add-linghui-image-batches-and-grid-split/design.md`
  - `openspec/changes/add-linghui-image-batches-and-grid-split/tasks.md`
  - `openspec/changes/add-linghui-image-batches-and-grid-split/specs/linghui-studio/spec.md`
  - `TASK_PLAN.md`
  - `findings.md`
  - `progress.md`

### 階段 3：图片节点数据模型与消费链路
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 扩展 `frontend/src/types/linghui.ts`，为图片节点增加多图集合、主图与结果主图映射字段
  - 新建 `frontend/src/components/linghui/linghuiImageCollections.ts` 统一处理导入集合、运行集合和主图解析
  - 调整 `linghuiExecutionShared.ts`、`linghuiExecutionNodeExecutors.ts` 和 `linghuiPromptReferences.ts`
  - 让下游输入、提示词引用和执行编译统一只消费图片节点当前主图
- 建立/修改的檔案：
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/linghuiImageCollections.ts`
  - `frontend/src/components/linghui/linghuiExecutionShared.ts`
  - `frontend/src/components/linghui/linghuiExecutionNodeExecutors.ts`
  - `frontend/src/components/linghui/linghuiPromptReferences.ts`

### 階段 4：图片节点 UI 与交互实现
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 重构 `ImageNodeEditor.tsx`，支持多图导入、移除、主图切换、比例校验和 1-4 张生成
  - 调整 `LinghuiNodeEditor.tsx`，把图片工具面板与宫格切分入口接入节点编辑态
  - 重构 `nodes/ImageNode.tsx`，让图片节点直接展示主图，并在多图场景下提供展开平铺动画
  - 调整 `LinghuiPage.css`，补齐多图集合、节点平铺和宫格工具样式
- 建立/修改的檔案：
  - `frontend/src/components/linghui/ImageNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/nodes/ImageNode.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`

### 階段 5：宫格切分与画布回写
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 扩展 Electron FFmpeg 切图能力到 2x2 / 3x3 / 4x4 / 5x5，并支持切块后放大到原图尺寸
  - 接入 `materializeLinghuiWorkspaceAssetSource`，确保远程或临时图片会先落地再交给 FFmpeg
  - 在 `useLinghuiCanvasDocumentOps.ts` 中增加 `createDerivedImageNodesFromNode`，把切分结果回写为新的导入图片节点
- 建立/修改的檔案：
  - `electron/service/ffmpeg.ts`
  - `electron/controller/ffmpeg.ts`
  - `frontend/src/services/ffmpegManager.ts`
  - `frontend/src/store/linghuiStorage.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasDocumentOps.ts`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasOverlays.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`

### 階段 6：验证与收尾
- **狀態：** in_progress
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 修复 `useLinghuiCanvasDocumentOps.ts` 对 `createLinghuiImageImportProperties` 的旧引用，恢复前端类型检查
  - 补齐图片节点多图展开平铺动画和宫格预览样式
  - 把图片节点 DOM 改成“节点缩略图区本身就是叠图结构”，去掉额外挂在主图上的小缩略图堆叠
  - 宫格切分生成的新图片节点会自动回连到源图片节点
  - 画布新增连线右键删除能力，并支持选中连线后按 `Delete / Backspace` 删除
  - 进一步精简图片节点样式：名称移到图片左上角、数量移到右上角，并增加只展开图片的 2x2 展开按钮
  - 收敛图片节点边框层级，只保留主图高亮边框，去掉多余外层强调
  - 执行 `pnpm -s exec tsc --noEmit --pretty false -p frontend/tsconfig.json` 并通过
  - 在 `frontend/` 下执行 `pnpm exec vite build` 并通过
  - 更新 `openspec/changes/add-linghui-image-batches-and-grid-split/tasks.md`、`TASK_PLAN.md`、`findings.md`、`progress.md`
- 建立/修改的檔案：
  - `frontend/src/components/linghui/ImageNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/LinghuiEdge.tsx`
  - `frontend/src/components/linghui/nodes/ImageNode.tsx`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasStage.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasContextMenu.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasOverlays.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayState.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasHotkeys.ts`
  - `frontend/src/components/linghui/linghuiExecutionShared.ts`
  - `frontend/src/components/linghui/linghuiCanvasShared.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasDocumentOps.ts`
  - `openspec/changes/add-linghui-image-batches-and-grid-split/tasks.md`
  - `TASK_PLAN.md`
  - `findings.md`
  - `progress.md`

## 會話：2026-03-28 节点编辑弹窗首轮实施

### 階段 1：规范回读与实现边界确认
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 重新读取 `update-linghui-node-editor-fusion` 的 `proposal.md`、`design.md`、`tasks.md`
  - 对照 `LinghuiNodeEditor.tsx`、`ImageNodeEditor.tsx`、`VideoNodeEditor.tsx`、`LinghuiPromptEditor.tsx`、`LinghuiPage.css`
  - 明确本轮只实施弹窗布局、模式裁剪、工具面板分层和提示词视觉融合，不改执行引擎
- 建立/修改的檔案：
  - `TASK_PLAN.md`

### 階段 2：节点编辑弹窗与模式化表单重构
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 重写 `LinghuiNodeEditor.tsx` 的轻编辑态布局，改为上方工具条和下方主编辑区
  - 为轻编辑态增加底部优先、侧边降级的避让策略
  - 重写 `ImageNodeEditor.tsx`，按 `generate/import` 模式拆分表单
  - 重写 `VideoNodeEditor.tsx`，按生成/导入状态拆分表单
  - 将图片/视频工具面板改成独立侧面板，不再直接插入主表单
  - 为 `LinghuiPromptEditor.tsx` 增加 `surfaceStyle="fusion"`，弱化内层盒子感
  - 调整 `LinghuiPage.css`，补齐新的双区布局、独立工具面板和紧凑资源控件样式
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/ImageNodeEditor.tsx`
  - `frontend/src/components/linghui/VideoNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiPromptEditor.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`

### 階段 3：实现验证与任务同步
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 执行 `pnpm -s exec tsc --noEmit --pretty false`，发现仓库根目录被 `electron/` 既有问题阻塞
  - 改为执行 `pnpm -s exec tsc --noEmit --pretty false -p frontend/tsconfig.json` 并通过
  - 在 `frontend/` 下执行 `pnpm exec vite build` 并通过
  - 更新 `tasks.md`、`TASK_PLAN.md`、`findings.md`、`progress.md`
- 建立/修改的檔案：
  - `openspec/changes/update-linghui-node-editor-fusion/tasks.md`
  - `TASK_PLAN.md`
  - `findings.md`
  - `progress.md`

## 會話：2026-03-28 节点编辑弹窗变更提案

### 階段 1：上下文恢复与现状勘查
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 读取 `planning-with-files-zht` 技能说明
  - 重新读取 `openspec/AGENTS.md`、`openspec/project.md`、`openspec list`、`openspec list --specs`
  - 重新读取 `task_plan.md`、`findings.md`、`progress.md`
  - 核对 `LinghuiNodeEditor.tsx`、`ImageNodeEditor.tsx`、`VideoNodeEditor.tsx`、`LinghuiPromptEditor.tsx`、`LinghuiPage.css`
  - 回看归档中的灵绘 spec / design，确认不沿用旧 LiteGraph 方案
- 建立/修改的檔案：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 階段 2：OpenSpec 变更草案编写
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 新建 `openspec/changes/update-linghui-node-editor-fusion/`
  - 起草 `proposal.md`，明确问题、变更范围和影响文件
  - 起草 `design.md`，收敛双区编辑态、模式裁剪、工具独立化和提示词视觉融合决策
  - 起草 `tasks.md`，拆出后续实现任务
  - 起草 `specs/linghui-studio/spec.md`，写入节点编辑态相关规范
- 建立/修改的檔案：
  - `openspec/changes/update-linghui-node-editor-fusion/proposal.md`
  - `openspec/changes/update-linghui-node-editor-fusion/design.md`
  - `openspec/changes/update-linghui-node-editor-fusion/tasks.md`
  - `openspec/changes/update-linghui-node-editor-fusion/specs/linghui-studio/spec.md`

### 階段 3：规范校验与交付整理
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 执行 `openspec validate update-linghui-node-editor-fusion --strict`
  - 确认本次 change 严格校验通过
  - 将 `TASK_PLAN.md` 更新为已完成状态，收拢本轮提案上下文
- 建立/修改的檔案：
  - `TASK_PLAN.md`
  - `progress.md`

## 會話：2026-03-27 LibTV 对标灵绘规划

### 階段 1：调研初始化
- **狀態：** completed
- **開始時間：** 2026-03-27 CST
- 執行的操作：
  - 读取 `planning-with-files-zht` 技能说明
  - 读取 `openspec/AGENTS.md`
  - 检查现有规划文件与工作区状态
  - 初始化本轮调研用 `task_plan.md`、`findings.md`、`progress.md`
- 建立/修改的檔案：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 階段 2：外部资料与灵绘现状核对
- **狀態：** completed
- **開始時間：** 2026-03-27 CST
- 執行的操作：
  - 查阅 LiblibAI 官方教程页，确认平台导航和功能入口
  - 查阅 LiblibAI 官方 API 服务协议，确认 API/开放平台定位
  - 查阅 LiblibAI 原创工作流许可协议，确认工作流发布与商业化能力
  - 查阅官方模型/工作流页，确认模型、LoRA、工作流、社区能力联动
  - 阅读灵绘 OpenSpec、节点定义、执行链、提示词引用、工作区存储与工具栏代码
- 建立/修改的檔案：
  - `findings.md`

### 階段 3：差异分析与补强方案整理
- **狀態：** completed
- **開始時間：** 2026-03-27 CST
- 執行的操作：
  - 整理 LibTV/LiblibAI 对标维度
  - 输出当前灵绘 P0 / P1 / P2 缺口
  - 给出补强方向与后续 OpenSpec 建议
- 建立/修改的檔案：
  - `task_plan.md`
  - `findings.md`

### 階段 4：交付准备
- **狀態：** completed
- **開始時間：** 2026-03-27 CST
- 執行的操作：
  - 更新进度记录
  - 整理面向用户的中文结论与阶段性路线图
  - 根据用户新要求，将范围收窄到“纯画布能力”视角
  - 重新核对 `LinghuiCanvas.tsx`、分组节点、节点壳层与右键/框选/模式切换能力
  - 补充 LiblibAI 工作流模板与 ComfyUI 使用页，提炼画布侧特征
  - 识别根目录 `design.md` 为 `LibTV 使用指南 / 操作手册`
  - 基于操作手册能力反推，重写 `openspec/changes/add-linghui-canvas-studio/design.md`
  - 根据用户反馈，继续补充“节点能力”层面的设计、spec 和 tasks
  - 执行 `openspec validate add-linghui-canvas-studio --strict` 并通过
  - 补充逐节点缺失能力清单，明确文本/图片/视频/音频/脚本及通用节点能力缺口
  - 再次执行 `openspec validate add-linghui-canvas-studio --strict` 并通过
  - 更新 `proposal.md` 以匹配新的画布优先与节点能力方案
  - 继续细化 `spec.md` 和 `tasks.md`，补齐快捷键、工作流抽屉、资产抽屉、节点下游快速创建等要求
  - 再次执行 `openspec validate add-linghui-canvas-studio --strict` 并通过
- 建立/修改的檔案：
  - `progress.md`
  - `findings.md`
  - `openspec/changes/add-linghui-canvas-studio/design.md`
  - `openspec/changes/add-linghui-canvas-studio/specs/linghui-studio/spec.md`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`

### 階段 5：画布能力首批实现
- **狀態：** completed
- **開始時間：** 2026-03-27 CST
- 執行的操作：
  - 在 `LinghuiCanvas.tsx` 接入文档级快照、undo / redo 历史栈与 clipboard 复制粘贴结构
  - 为画布增加双击空白快速创建、右键复制/副本/粘贴/撤销/重做等首批高频操作
  - 增加全局快捷键：`Cmd/Ctrl + C / V / D / Z / Shift+Z / Y` 以及 `Delete / Backspace / Escape`
  - 增加画布 HUD、小地图和缩放比例显示
  - 接入图片文件拖入画布自动创建参考图节点的首批能力
  - 调整 `LinghuiPage.tsx` 的统计更新逻辑，避免自动保存阶段因为相同统计值重复触发外层重渲染
  - 运行前端 TypeScript 检查与 Vite 生产构建并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`

### 階段 6：画布连接创建与右键上传补充
- **狀態：** completed
- **開始時間：** 2026-03-27 CST
- 執行的操作：
  - 为画布增加 `onConnectStart / onConnectEnd` 连接结束感知
  - 支持从节点输出端拖到空白后弹出兼容下游节点快速创建器，并在创建后自动完成连线
  - 为快速创建器增加“兼容下游节点”筛选与空状态提示
  - 在画布右键菜单中增加“上传图片到画布”，直接创建参考图节点
  - 复用图片导入逻辑，让拖入图片与右键上传图片都落在同一条参考图建节点路径
  - 再次运行前端 TypeScript 检查与 Vite 生产构建并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`

### 階段 7：视频导入节点接入
- **狀態：** completed
- **開始時間：** 2026-03-27 CST
- 執行的操作：
  - 为视频节点增加本地素材字段，支持以“导入模式”透传本地视频结果
  - 为视频节点编辑器增加视频拖入、手动上传与清空素材能力
  - 为画布拖入逻辑补上视频文件识别，拖入后直接创建视频节点
  - 为画布右键菜单增加“上传视频到画布”
  - 再次运行前端 TypeScript 检查与 Vite 生产构建并通过
- 建立/修改的檔案：
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/components/linghui/linghuiExecution.ts`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/VideoNodeEditor.tsx`
  - `frontend/src/components/linghui/nodes/VideoNode.tsx`

### 階段 8：音频节点最小闭环接入
- **狀態：** completed
- **開始時間：** 2026-03-27 CST
- 執行的操作：
  - 为灵绘节点体系增加 `linghui/audio`，补齐节点类型、端口类型、结果类型与默认属性
  - 为画布增加音频文件拖入建节点与右键“上传音频到画布”
  - 新增 `AudioNodeEditor` 与 `AudioNode`，支持本地音频上传、拖入、清空和文本转语音输入
  - 在执行链中接入音频节点执行，支持上传音频透传和基础 TTS 生成
  - 修正 prompt references，让音频上游可被 `@` 引用，同时不参与 `@Image N` 视觉引用编排
  - 为视频节点增加音频输入插槽，为音频结果补齐节点预览与样式
  - 再次运行前端 TypeScript 检查与 Vite 生产构建并通过
- 建立/修改的檔案：
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/components/linghui/linghuiPromptReferences.ts`
  - `frontend/src/components/linghui/linghuiExecution.ts`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/AudioNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/nodes/index.ts`
  - `frontend/src/components/linghui/nodes/AudioNode.tsx`
  - `frontend/src/components/linghui/nodes/VideoNode.tsx`
  - `frontend/src/components/linghui/nodes/NodeResultPreview.tsx`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`

### 階段 9：文本节点与文本到图像/视频输入接入
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为灵绘节点体系增加 `linghui/text`，补齐文本节点类型、RF 节点类型和默认属性
  - 新增 `TextNodeEditor` 与 `TextNode`，支持手动输入文本和 LLM 生成两种模式
  - 在执行链中接入文本节点执行，手动模式直接输出文本，生成模式调用 LLM Provider
  - 为图片节点和视频节点增加 `text` 输入插槽，并在执行时将直接连接的文本输入拼接到提示上下文
  - 为 prompt references 增加文本节点 fallback，使未运行的手动文本节点也能被下游 `@` 引用
  - 再次运行前端 TypeScript 检查与 Vite 生产构建并通过
- 建立/修改的檔案：
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/components/linghui/linghuiPromptReferences.ts`
  - `frontend/src/components/linghui/linghuiExecution.ts`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/TextNodeEditor.tsx`
  - `frontend/src/components/linghui/ImageNodeEditor.tsx`
  - `frontend/src/components/linghui/VideoNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/nodes/index.ts`
  - `frontend/src/components/linghui/nodes/TextNode.tsx`
  - `frontend/src/components/linghui/nodes/ImageNode.tsx`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`

### 階段 10：图片节点统一导入/生成双模式收敛
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为图片节点补齐本地图片素材字段，支持同一节点在“上传图片 / 生成图片”之间切换
  - 重写 `ImageNodeEditor`，增加图片拖入、手动上传、清空素材和导入模式提示
  - 在执行链中为图片节点接入导入模式透传逻辑
  - 为图片节点补齐未运行时的 fallback 引用，支持导入图片直接被下游 `@` 引用
  - 将画布拖入图片、右键“上传图片到画布”统一收敛到图片节点，而不再默认创建参考图节点
  - 为图片节点卡片补齐本地图片缩略图和导入态标识
  - 再次运行前端 TypeScript 检查与 Vite 生产构建并通过
- 建立/修改的檔案：
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/ImageNodeEditor.tsx`
  - `frontend/src/components/linghui/linghuiExecution.ts`
  - `frontend/src/components/linghui/linghuiPromptReferences.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/components/linghui/nodes/ImageNode.tsx`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`

### 階段 11：视频节点统一导入/生成双模式收敛
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为视频节点编辑器补齐本地视频上传、拖入、清空素材与导入模式提示
  - 为视频节点补齐上游图片、视频、音频输入摘要，统一收口到同一编辑器视图
  - 在执行链中接入视频导入模式透传逻辑，并补齐图片参考、视频封面参考、文本与音频描述的多模态聚合
  - 为视频生成执行补齐 `resolution` 透传，并让“首尾帧”模式按首视觉参考 + 末视觉参考编排
  - 为 prompt references 补齐无海报视频的文本 fallback，避免把原始视频路径误当成视觉引用
  - 为视频节点卡片补齐多输入 handle 配色与导入 / 生成模式状态提示
  - 执行 `pnpm -s exec tsc --noEmit --pretty false`、`pnpm -s exec vite build` 和 `openspec validate add-linghui-canvas-studio --strict` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/VideoNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/linghuiExecution.ts`
  - `frontend/src/components/linghui/linghuiPromptReferences.ts`
  - `frontend/src/components/linghui/nodes/VideoNode.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 12：节点通用操作与资产入口补齐
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为节点右键菜单补齐“继续创建下游”入口，复用快速创建器直接从当前节点派生兼容下游
  - 为节点右键菜单补齐“创建资产”，支持把文本、图片、视频、音频节点当前内容保存到工作区资产库
  - 在 `linghuiStorage` 中新增工作区资产快照持久化，首版会保存节点快照、运行结果快照与主产物文件引用
  - 调整节点右键菜单定位高度，避免通用操作补齐后菜单被裁切
  - 执行 `pnpm -s exec tsc --noEmit --pretty false`、`pnpm -s exec vite build` 和 `openspec validate add-linghui-canvas-studio --strict` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/store/linghuiStorage.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 13：资产抽屉最小闭环接入
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为灵绘工具栏增加“资产”入口，并接入工作区资产抽屉
  - 在 `linghuiStorage` 中补齐资产索引读取能力，支持按工作区加载已创建资产
  - 为画布句柄补齐“发送资产到画布”，支持把图片、视频、音频、文本资产重新还原为对应节点
  - 在资产抽屉中补齐基础筛选、预览和“发送到画布”操作，形成保存资产 -> 打开资产库 -> 回发画布的最小闭环
  - 再次执行 `pnpm -s exec tsc --noEmit --pretty false`、`pnpm -s exec vite build` 和 `openspec validate add-linghui-canvas-studio --strict` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/LinghuiToolbar.tsx`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/store/linghuiStorage.ts`
  - `progress.md`

### 階段 14：统一抽屉体系与工作流/历史复用闭环
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 将页面层抽屉统一为“添加 / 工作流 / 资产 / 历史 / 教程”五类入口，并接入顶部工具栏与画布右键菜单
  - 为画布运行状态徽章增加历史抽屉入口，让运行结果和失败/待重跑状态可从浮层直接进入复用区
  - 在 `linghuiStorage` 中补齐工作流模板与历史结果独立索引、落盘和读取能力
  - 为画布补齐“保存为工作流”与“发送工作流到画布”能力，复用当前选区/分组快照进行模板化
  - 在执行完成后自动沉淀历史结果，并支持从历史抽屉再次发送到画布
  - 再次执行 `pnpm -s exec tsc --noEmit --pretty false`、`pnpm -s exec vite build`，并准备同步 OpenSpec 任务勾选
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/LinghuiToolbar.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/store/linghuiStorage.ts`
  - `frontend/src/types/linghui.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`

### 階段 15：脚本节点与分镜派生首版闭环
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为灵绘节点体系增加 `linghui/script`，补齐节点类型、RF 节点类型、端口布局和默认属性
  - 新增 `ScriptNode`、`ScriptNodeEditor` 和 `linghuiScriptNodeUtils`，支持手动结构化脚本、LLM 生成、卡片/表格切换、全屏查看与批量勾选
  - 在执行链中接入脚本节点执行，统一把手动脚本和生成脚本解析为 `storyboard` 结果
  - 为 prompt references 补齐脚本节点 fallback，并让无图片的脚本镜头也能以文本形式被下游 `@` 引用
  - 为画布补齐“从脚本批量派生分镜节点”能力，支持把选中的镜头直接生成 `storyboard-shot` 节点并自动连接脚本文本输出
  - 为分镜节点执行补齐文本输入拼接，让派生镜头节点能够继承脚本上下文
  - 执行 `openspec validate add-linghui-canvas-studio --strict`、`pnpm -s exec tsc --noEmit --pretty false` 和 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/components/linghui/linghuiExecution.ts`
  - `frontend/src/components/linghui/linghuiPromptReferences.ts`
  - `frontend/src/components/linghui/linghuiScriptNodeUtils.ts`
  - `frontend/src/components/linghui/ScriptNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasOverlays.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasDocumentOps.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasNodeInteractions.ts`
  - `frontend/src/components/linghui/nodes/ScriptNode.tsx`
  - `frontend/src/components/linghui/nodes/index.ts`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 16：脚本节点批量生成图像/视频与部分重跑
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为脚本节点编辑器补齐“生成分镜图”“生成视频流程”两个批量动作入口
  - 在画布文档操作层新增脚本派生图片节点与视频流程节点的能力，按镜头描述生成或复用对应节点
  - 为脚本派生节点补齐 `scriptSourceNodeId / scriptShotId / scriptDerivationKind` 元数据，支持按“脚本节点 + 镜头 + 派生类型”命中已有节点
  - 让脚本批量生成再次执行时优先更新已有派生节点，只对当前勾选镜头执行局部重跑，而不是重复创建整套流程
  - 为视频流程补齐“首帧图节点 -> 视频节点”的自动连线与批量执行入口
  - 更新 OpenSpec 任务勾选，补记脚本节点批量图像/视频与部分重跑完成度
  - 再次执行 `pnpm -s exec tsc --noEmit --pretty false`，准备执行完整验证
- 建立/修改的檔案：
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/ScriptNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasOverlays.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasDocumentOps.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 15：节点工具条与图片节点统一上传/生成模式
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为图片节点和视频节点补齐节点卡片工具条与沉浸式工具面板入口
  - 为图片节点补齐 `Slash / 多角度 / 扩图 / 打光 / 重绘` 预设，并支持写回提示词和节点参数
  - 为视频节点补齐 `高清 / 解析 / 合成` 预设，并支持根据当前输入结构生成提示词骨架
  - 将图片节点升级为显式 `导入输出 / 生成图片` 双模式
  - 让挂载本地图像的图片节点在切到生成模式后，继续把该素材作为节点内参考图参与生图，而不是只能透传
  - 调整图片节点执行链，避免节点内本地图破坏上游 `@` 引用编号顺序
  - 为图片节点导入入口、工作区资产回发和紧凑节点卡片补齐模式状态展示
  - 执行 `pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/ImageNodeEditor.tsx`
  - `frontend/src/components/linghui/VideoNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/nodes/ImageNode.tsx`
  - `frontend/src/components/linghui/nodes/VideoNode.tsx`
  - `frontend/src/components/linghui/nodes/LinghuiNodeRunsContext.ts`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/linghuiExecution.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/types/linghui.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 16：LinghuiCanvas 组件拆分首轮收敛
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 将 `LinghuiCanvas.tsx` 中的共享类型、快照转换、分组与粘贴辅助方法抽到 `linghuiCanvasShared.ts`
  - 将画布 HUD、模式切换和缩放工具抽到 `LinghuiCanvasHud.tsx`
  - 将快速创建面板抽到 `LinghuiCanvasQuickCreate.tsx`
  - 将待分组浮层抽到 `LinghuiCanvasPendingGroupOverlay.tsx`
  - 将右键菜单抽到 `LinghuiCanvasContextMenu.tsx`
  - 让主画布组件回到“状态、回调、React Flow 编排”为主，减少大段尾部 JSX
  - 执行 `pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/linghuiCanvasShared.ts`
  - `frontend/src/components/linghui/LinghuiCanvasHud.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasQuickCreate.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasPendingGroupOverlay.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasContextMenu.tsx`
  - `progress.md`
  - `progress.md`

### 階段 17：LinghuiCanvas 逻辑 hook 化二轮瘦身
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 将 `LinghuiCanvas.tsx` 中的浮层状态编排抽到 `useLinghuiCanvasOverlayState.ts`
  - 将复制、粘贴、分组、取消分组、节点插入、资产回发等文档操作抽到 `useLinghuiCanvasDocumentOps.ts`
  - 将图片/视频/音频导入与拖拽导入逻辑抽到 `useLinghuiCanvasMediaImport.ts`
  - 将全局快捷键处理抽到 `useLinghuiCanvasHotkeys.ts`，主组件只保留行为接线
  - 清掉主文件中与上述 hooks 重复的旧实现，让 `LinghuiCanvas.tsx` 从 `2506` 行收敛到 `1644` 行
  - 执行 `pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayState.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasDocumentOps.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasMediaImport.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasHotkeys.ts`
  - `progress.md`

### 階段 18：LinghuiCanvas 交互与叠加层三轮拆分
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 将框选、框选后分组候选、空白右键、双击快速创建等逻辑抽到 `useLinghuiCanvasSelectionInteractions.ts`
  - 将节点点击、右键、长按拖拽、节点工具面板打开逻辑抽到 `useLinghuiCanvasNodeInteractions.ts`
  - 将画布 imperative handle 抽到 `useLinghuiCanvasImperativeHandle.ts`
  - 将运行状态汇总抽到 `useLinghuiCanvasRunSummaries.ts`
  - 将节点编辑器、待分组浮层、快速创建器、右键菜单聚合到 `LinghuiCanvasOverlays.tsx`
  - 让 `LinghuiCanvas.tsx` 从 `1644` 行继续收敛到 `1127` 行，主组件进一步聚焦在状态编排与 React Flow 接线
  - 执行 `pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasSelectionInteractions.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasNodeInteractions.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasImperativeHandle.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasRunSummaries.ts`
  - `frontend/src/components/linghui/LinghuiCanvasOverlays.tsx`
  - `progress.md`

### 階段 15：工作流块整组执行与状态反馈
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为画布补齐“工作流块”执行目标展开逻辑，选中分组或右键分组运行时会自动展开到内部节点
  - 为分组右键菜单增加“运行工作流块”，并让“运行选中”同时兼容节点与分组选择
  - 为分组节点增加聚合运行状态反馈，按内部节点汇总显示运行中、失败、待重跑、完成和部分完成
  - 为工作流块增加边框与状态徽章视觉反馈，便于在大画布中快速识别运行状态
  - 执行 `pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/nodes/CanvasGroupNode.tsx`
  - `frontend/src/components/linghui/nodes/LinghuiNodeRunsContext.ts`
  - `frontend/src/components/linghui/nodes/index.ts`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 19：LinghuiCanvas 舞台与桥接四轮拆分
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 将主组件中的回调 ref 同步逻辑抽到 `useLinghuiCanvasCallbackRefs.ts`
  - 将 React Flow 的节点变更、连线校验、选择态同步、下游快速创建桥接与节点数据更新抽到 `useLinghuiCanvasFlowBridge.ts`
  - 将节点编辑器/右键菜单所需的工作流保存、资产创建、日志裁剪与 overlay 动作组装抽到 `useLinghuiCanvasOverlayProps.ts`
  - 将 `ReactFlow + Background + MiniMap` 舞台渲染抽到 `LinghuiCanvasStage.tsx`
  - 让 `LinghuiCanvas.tsx` 从 `969` 行进一步收敛到 `540` 行，主文件基本只保留状态编排、hook 接线与 provider 装配
  - 执行 `pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasOverlays.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasStage.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasCallbackRefs.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasFlowBridge.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `progress.md`

### 階段 20：画布项目入口与工作区导入导出补齐
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为画布左上角补齐轻量项目入口，将工作区与画布命令收敛到 `LinghuiCanvasHud` 的项目浮层入口
  - 在项目入口中补齐新建、打开、保存、另存为副本、导入、导出，以及常用抽屉入口跳转
  - 在存储层新增 `saveLinghuiWorkspaceAs` 与 `importLinghuiWorkspace`，让工作区模型补齐“另存为 / 导入”能力
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `1.4` 与 `2.3`
  - 执行 `openspec validate add-linghui-canvas-studio --strict`、`pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasHud.tsx`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/store/linghuiStorage.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 21：执行路径高亮与失败定位补齐
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为画布执行态补齐 `LinghuiExecutionTraceContext`，把失败节点、待重跑节点和边的执行状态透传到节点/连线层
  - 为 `LinghuiEdge` 接入执行路径高亮，让运行中、失败、待重跑链路具备颜色、描边和虚线反馈
  - 为 `LinghuiCanvasHud` 增加“跳到失败”和“重跑受影响”快捷操作，并在页面层接通失败节点聚焦与 stale 节点局部重跑
  - 为 `LinghuiCanvasHandle` 增加 `focusNodes`，支持按节点集合快速聚焦并可选同步选择态
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `7.5`
  - 执行 `openspec validate add-linghui-canvas-studio --strict`、`pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasHud.tsx`
  - `frontend/src/components/linghui/LinghuiEdge.tsx`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/nodes/LinghuiNodeRunsContext.ts`
  - `frontend/src/components/linghui/nodes/index.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasImperativeHandle.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasRunSummaries.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 22：文本与音频节点多模态输入聚合
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为文本节点补齐图片 / 文本 / 视频 / 音频输入槽，让文本生成节点可以直接接收上游多模态输入
  - 为音频节点补齐图片 / 文本 / 视频 / 音频输入槽，并在提示词编辑器中接通上游 `@` 引用
  - 调整文本节点和音频节点执行链，在生成模式下聚合上游文本摘要并编译提示词引用
  - 为文本节点和音频节点卡片补齐输入 handle 展示，确保画布侧连线能力与执行能力一致
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `7.3`
  - 执行 `openspec validate add-linghui-canvas-studio --strict`、`pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/AudioNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/linghuiExecution.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/components/linghui/nodes/AudioNode.tsx`
  - `frontend/src/components/linghui/nodes/TextNode.tsx`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 23：执行队列、失败重试与取消
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为灵绘执行链新增本地执行队列状态，补齐排队、当前执行、完成、失败与取消中的运行态编排
  - 为 `executeLinghuiWorkflow` 接入协作式取消信号，在轮询型图片/视频/音频任务中支持及时截断，并在当前节点结束后停止后续队列
  - 为工具栏和画布 HUD 增加“取消执行”和“重试失败”入口，并把排队数量、取消中状态透传到轻量运行状态条
  - 在页面层增加失败节点重试、执行队列取消和历史结果去重保护，避免取消后误把旧结果再次写入历史
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `7.4`
  - 执行 `pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasHud.tsx`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/LinghuiToolbar.tsx`
  - `frontend/src/components/linghui/linghuiExecution.ts`
  - `frontend/src/types/linghui.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 24：视频首尾帧语义与音频结果预览补强
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为视频节点编辑器补齐首尾帧模式说明，明确提示只有第一路视觉输入和最后一路视觉输入参与执行
  - 为图片参考和视频参考增加首帧 / 尾帧 / 忽略角色标识，让用户可以直接看到首尾帧模式下的实际输入语义
  - 为视频节点编辑器增加生成结果预览区，执行后可直接在节点弹窗中播放结果视频
  - 为音频节点编辑器增加生成结果播放器和结果摘要，补强播放预览与复用提示
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `5.9`
  - 执行 `pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/AudioNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/VideoNodeEditor.tsx`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 25：文档状态与运行态拆分、静默自动保存
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 在 `LinghuiPage.tsx` 中将工作区运行态从 `activeWorkspace` 主状态中拆开，改为独立维护 `nodeRuns / executionLogs`
  - 让执行过程中的运行态更新不再回灌整个工作区文档状态，避免画布因为运行态持久化重复收到新的 `workspace` 引用
  - 调整自动保存为静默持久化，保留手动保存的状态提示，但不再让自动保存切换 `saving` 指示从而放大页面重渲染
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `9.1` 与 `9.2`
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 26：灵绘结果批量导出与命名规则
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 新增独立的 `linghuiResultExport.ts` 导出服务，为图片、批量图片、视频、音频、文本与脚本/分镜结果统一生成结构化导出目录
  - 约定导出命名规则为 `<workspace>-results-<timestamp>` 批次目录，节点子目录按 `01-节点名` 顺序编号，并生成 `manifest.json`
  - 为脚本与分镜结果补齐 `script.txt`、`shots.json` 与镜头图片导出，为多图结果按顺序拆出单文件
  - 把“导出当前结果 / 导出工作流块结果 / 批量导出选中结果”接入灵绘右键菜单，并在页面层统一解析节点、选区和分组的真实导出目标
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `8.4`
  - 执行 `openspec validate add-linghui-canvas-studio --strict`、`pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasContextMenu.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasOverlays.tsx`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/linghuiResultExport.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 27：LinghuiCanvas 继续瘦身与装配拆分
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 新增 `useLinghuiCanvasUiState.ts`，把编辑器选中态、工具态、画布模式、分组框和宿主尺寸监听从 `LinghuiCanvas.tsx` 中抽离
  - 新增 `LinghuiCanvasSurface.tsx`，集中承接 provider 嵌套、画布根节点、HUD、Stage 和 Overlay 渲染
  - 新增 `LinghuiCanvasProviders.tsx` 与 `linghuiCanvasTypes.ts`，把 React Flow/provider 包裹层和 `LinghuiCanvas` 类型定义从主文件挪出
  - 新增 `useLinghuiCanvasViewportControls.ts`，把缩放与视口归位控制从主组件中拆分
  - 调整 `useLinghuiCanvasImperativeHandle.ts` 改为直接依赖 `linghuiCanvasTypes.ts`，降低对主组件文件的类型耦合
  - 将 `LinghuiCanvas.tsx` 从 588 行收敛到 488 行，主组件进一步收敛为 hooks 编排与核心业务装配
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `9.3`
  - 执行 `pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasProviders.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasSurface.tsx`
  - `frontend/src/components/linghui/linghuiCanvasTypes.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasImperativeHandle.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasUiState.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasViewportControls.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 28：音频节点播放预览与结果复用入口
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为 `AudioNodeEditor` 的生成结果区域补齐近场复用操作，支持将最新生成音频直接写回当前节点素材
  - 为音频节点补齐“一键保存为资产”入口，避免必须绕到右键菜单才能复用音频结果
  - 将资产库刷新回调透传到音频节点弹窗，使保存后资产抽屉可立即感知新增结果
  - 保留音频播放器、时长和文本摘要展示，形成“试听 -> 写回素材 / 存资产”的节点内闭环
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `8.5`
  - 执行 `pnpm -s exec tsc --noEmit --pretty false` 与 `pnpm -s exec vite build` 并通过
- 建立/修改的檔案：
  - `frontend/src/components/linghui/AudioNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasOverlays.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 29：工作流块收口与最小回归补齐
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 按用户要求将 `5.10` 在 `add-linghui-canvas-studio` 任务清单中强制标记完成
  - 为画布分组补齐“工作流块”术语收口，统一右键菜单、浮层、状态栏、工具栏、教程文案和工作流库提示
  - 为新建工作流块增加统一默认命名与递增序号，避免继续沿用“新分组 / 分组”旧命名
  - 为旧工作区分组迁移补齐默认标题兜底，保证历史数据加载后也显示为“工作流块”
  - 新增 `linghuiWorkflowBlock` helper 与对应单元测试
  - 新增 `linghuiPromptReferences` 单元测试，锁定 `@Image N` 编号顺序必须与上游输入展示顺序一致
  - 新增 `openspec/changes/add-linghui-canvas-studio/regression-checklist.md`，补齐灵绘画布最小回归清单
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `6.1` 和 `9.4`
  - 执行 `pnpm -s exec vitest run src/constants/linghuiWorkflowBlock.test.ts src/components/linghui/linghuiPromptReferences.test.ts`、`pnpm -s exec tsc --noEmit --pretty false`、`pnpm -s exec vite build` 与 `openspec validate add-linghui-canvas-studio --strict` 并通过
- 建立/修改的檔案：
  - `frontend/src/constants/linghuiWorkflowBlock.ts`
  - `frontend/src/constants/linghuiWorkflowBlock.test.ts`
  - `frontend/src/components/linghui/linghuiPromptReferences.test.ts`
  - `frontend/src/components/linghui/nodes/CanvasGroupNode.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasDocumentOps.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasFlowBridge.ts`
  - `frontend/src/components/linghui/LinghuiCanvasContextMenu.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasPendingGroupOverlay.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasHud.tsx`
  - `frontend/src/components/linghui/LinghuiPropertiesPanel.tsx`
  - `frontend/src/components/linghui/LinghuiStatusBar.tsx`
  - `frontend/src/components/linghui/LinghuiToolbar.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/store/linghuiStorage.ts`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `openspec/changes/add-linghui-canvas-studio/regression-checklist.md`
  - `progress.md`

### 階段 30：节点三层视图补齐
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 为灵绘节点数据补齐 `viewMode`，统一抽象节点的折叠态、轻编辑态、沉浸式态
  - 新增 `linghuiNodeViewMode` helper 与单元测试，约束默认视图解析与沉浸式打开策略
  - 为文本、图片、视频、音频、脚本及旧分镜节点补齐视图模式标记，让折叠/沉浸偏好能反映到节点卡片或节点壳层外观
  - 在 `LinghuiNodeEditor` 中新增统一视图切换条，支持“折叠态 / 轻编辑态 / 沉浸式态”切换
  - 将沉浸式态实现为统一全屏编辑壳层，并保留轻编辑态的跟随节点浮层
  - 更新灵绘回归清单，新增三层视图切换检查项
  - 更新 `add-linghui-canvas-studio` 任务清单，勾选 `5.3`
  - 执行 `pnpm -s exec vitest run src/components/linghui/linghuiNodeViewMode.test.ts src/constants/linghuiWorkflowBlock.test.ts src/components/linghui/linghuiPromptReferences.test.ts`、`pnpm -s exec tsc --noEmit --pretty false` 与 `openspec validate add-linghui-canvas-studio --strict` 并通过
- 建立/修改的檔案：
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/linghuiNodeViewMode.ts`
  - `frontend/src/components/linghui/linghuiNodeViewMode.test.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiCanvasOverlays.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/nodes/ReferenceNode.tsx`
  - `frontend/src/components/linghui/nodes/TextNode.tsx`
  - `frontend/src/components/linghui/nodes/ImageNode.tsx`
  - `frontend/src/components/linghui/nodes/VideoNode.tsx`
  - `frontend/src/components/linghui/nodes/AudioNode.tsx`
  - `frontend/src/components/linghui/nodes/ScriptNode.tsx`
  - `frontend/src/components/linghui/nodes/LinghuiNodeShell.tsx`
  - `frontend/src/components/linghui/nodes/StoryboardGroupNode.tsx`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `openspec/changes/add-linghui-canvas-studio/regression-checklist.md`
  - `progress.md`

### 階段 31：旧节点体系彻底收口
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 从灵绘节点类型、节点定义、节点注册、节点编辑器和执行分发中彻底移除旧 `reference / storyboard-shot / storyboard-group`
  - 将脚本节点的“派生镜头节点”改为派生文本节点，统一收口到 5 类基础节点模型
  - 清理 prompt fallback、结果导出和节点交互中的旧节点分支
  - 将 V1 历史生成节点映射直接收口到当前图片/视频节点，不再回落到旧参考节点语义
  - 同步更新 `add-linghui-canvas-studio` 的设计文档、存储 spec 和任务清单，勾选 `4.6`
  - 执行 `pnpm -s exec vitest run src/components/linghui/linghuiNodeViewMode.test.ts src/constants/linghuiWorkflowBlock.test.ts src/components/linghui/linghuiPromptReferences.test.ts`、`pnpm -s exec tsc --noEmit --pretty false`、`pnpm -s exec vite build` 与 `openspec validate add-linghui-canvas-studio --strict` 并通过
- 建立/修改的檔案：
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/ScriptNodeEditor.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasDocumentOps.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasNodeInteractions.ts`
  - `frontend/src/components/linghui/linghuiPromptReferences.ts`
  - `frontend/src/components/linghui/linghuiExecutionNodeExecutors.ts`
  - `frontend/src/components/linghui/linghuiResultExport.ts`
  - `frontend/src/components/linghui/nodes/index.ts`
  - `frontend/src/store/linghuiStorage.ts`
  - `frontend/src/components/linghui/ReferenceNodeEditor.tsx`
  - `frontend/src/components/linghui/nodes/ReferenceNode.tsx`
  - `frontend/src/components/linghui/nodes/StoryboardShotNode.tsx`
  - `frontend/src/components/linghui/nodes/StoryboardGroupNode.tsx`
  - `openspec/changes/add-linghui-canvas-studio/design.md`
  - `openspec/changes/add-linghui-canvas-studio/specs/storage/spec.md`
  - `openspec/changes/add-linghui-canvas-studio/tasks.md`
  - `progress.md`

### 階段 32：OpenSpec 活跃变更强制清理
- **狀態：** completed
- **開始時間：** 2026-03-28 CST
- 執行的操作：
  - 按“完成态归档、未完成删除”的策略清空 `openspec/changes` 下所有活跃变更
  - 将已完成的变更移动到 `openspec/changes/archive/2026-03-28-*`
  - 删除所有未完成、暂停或不再继续推进的活跃变更目录，避免新阶段继续背负旧 spec 包袱
  - 执行 `openspec list`，确认当前没有任何活跃 change
  - 执行 `openspec validate --specs --strict`，确认现存 specs 校验通过
- 建立/修改的檔案：
  - `openspec/changes/archive/2026-03-28-add-character-demographics-extraction/*`
  - `openspec/changes/archive/2026-03-28-add-grid-storyboard-mode/*`
  - `openspec/changes/archive/2026-03-28-add-linghui-canvas-studio/*`
  - `openspec/changes/archive/2026-03-28-refactor-media-generation-pipeline/*`
  - `openspec/changes/archive/2026-03-28-refine-linghui-inline-node-panels/*`
  - `openspec/changes/archive/2026-03-28-update-builtin-prompt-template-objective-rules/*`
  - `openspec/changes/add-chat-module/*`
  - `openspec/changes/add-comfyui-mapping/*`
  - `openspec/changes/add-grok-prompt-compilation/*`
  - `openspec/changes/add-grok2api-imagine-providers/*`
  - `openspec/changes/add-pluggable-image-hosting-remoteurl/*`
  - `openspec/changes/refactor-electron-shell-to-ee-core/*`
  - `openspec/changes/update-episode-split-explicit-boundaries/*`
  - `openspec/changes/update-prompt-template-storage-and-validation/*`
  - `openspec/changes/update-transition-governance-boundaries/*`
  - `openspec/changes/update-transition-semantics-migration/*`
  - `progress.md`

## 測試結果
| 測試 | 輸入 | 預期結果 | 實際結果 | 狀態 |
|------|------|---------|---------|------|
| `openspec validate add-linghui-canvas-studio --strict` | repo root | 规格变更保持合法 | 通过 | pass |
| `pnpm -s exec tsc --noEmit --pretty false` | `frontend/` | 灵绘前端通过类型检查 | 通过 | pass |
| `pnpm -s exec vite build` | `frontend/` | 灵绘前端可完成生产构建 | 通过（仅有大包体 warning） | pass |

## 錯誤日誌
| 時間戳記 | 錯誤 | 嘗試次數 | 解決方案 |
|----------|------|---------|---------|
| 2026-03-27 | `LibTV` 搜索噪音较大 | 1 | 改为收缩到 LiblibAI 官方域名和托管页面 |
| 2026-03-27 | 部分 Liblib 页面为动态内容，正文抓取不稳定 | 1 | 改为优先使用教程、协议、模型/工作流页等稳定页面 |

## 五問重啟檢查
| 問題 | 答案 |
|------|------|
| 我在哪裡？ | 阶段 15：工作流块整组执行与状态反馈已完成 |
| 我要去哪裡？ | 继续补齐节点工具条、脚本节点和画布状态拆分等后续能力 |
| 目標是什麼？ | 按 OpenSpec 逐步把灵绘补成画布优先、节点能力完整的工作台 |
| 我學到了什麼？ | 资产能力要真正可用，除了节点里能“创建资产”，还必须补一条“资产回到画布”的闭环路径 |
| 我做了什麼？ | 见上方记录 |

---
*每個階段完成後或遇到錯誤時更新此檔案*
