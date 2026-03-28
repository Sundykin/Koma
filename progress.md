# 進度日誌

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

## 測試結果
| 測試 | 輸入 | 預期結果 | 實際結果 | 狀態 |
|------|------|---------|---------|------|
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
