# 转场 Phase 1 开发入口（代码级）

> 状态：入口索引
> 范围：Phase 1 / fade-only / `Track.transitions[]` 单一真值
> 目的：提供最短路径的代码入口与实施顺序，避免重复探索与返工

## 0. 结论速览
- 真值迁移先于 UI，避免双真值与语义分叉。
- 导出与预览必须共享同一时间语义，但不共享实现。
- cut point 同轨相邻是 Phase 1 唯一合法入口与关系锚点。

## 1. 相关模块/文件清单

数据模型与持久化
- `frontend/src/types/editor.ts`（`Clip.transition` 旧模型、`Track` 结构）
- `frontend/src/store/trackStore.ts`（保存/加载、`getDuration` 时长计算）

时间线与编辑入口
- `frontend/src/components/editor/SimpleTimeline.tsx`（cut point 交互入口）

预览与播放
- `frontend/src/components/editor/SimplePlayer.tsx`（预览驱动）
- `frontend/src/engine/simpleEngine.ts`（可见片段与渲染循环）

导出与能力判断
- `frontend/src/services/draftExport/exportCapabilityChecker.ts`（转场能力检测）
- `frontend/src/services/draftExport/JianyingExporter.ts`（剪映导出）
- `frontend/src/services/draftExport/jianyingUtils.ts`（转场 material 构建）
- `frontend/src/types/jianying.ts`（剪映 transitions 结构）
- `frontend/src/services/simpleExportRenderer.ts`（本地导出渲染）
- `electron/service/ffmpeg.ts`（FFmpeg 任务与合成入口）

规范与冻结文档
- `docs/transition-minimum-semantics-v1.md`
- `docs/transition-adr-v1.md`
- `docs/implementation-breakdown-v1.md`
- `openspec/changes/update-transition-semantics-migration/specs/*/spec.md`

## 2. 建议修改顺序
1. 数据语义迁移与真值收口（类型、持久化、时长计算）
2. 导出链路同步迁移（剪映导出与能力检测优先）
3. 预览最小闭环（fade 的最小渲染）
4. UI 最小入口（cut point 入口）
5. 回归与稳定性补齐（迁移、生命周期、导出/预览一致性）

## 3. 每个阶段的关键入口
1. 数据语义迁移：`frontend/src/types/editor.ts`、`frontend/src/store/trackStore.ts`
2. 导出同步迁移：`frontend/src/services/draftExport/exportCapabilityChecker.ts`、`frontend/src/services/draftExport/JianyingExporter.ts`、`frontend/src/services/draftExport/jianyingUtils.ts`
3. 预览最小闭环：`frontend/src/components/editor/SimplePlayer.tsx`、`frontend/src/engine/simpleEngine.ts`
4. UI 最小入口：`frontend/src/components/editor/SimpleTimeline.tsx`
5. 回归与稳定性：与 `openspec/changes/update-transition-semantics-migration/specs/*/spec.md` 的场景对齐

## 4. 最容易踩坑的点
- `Clip.transition` 与 `Track.transitions[]` 并存导致双真值或重复应用。
- `trackStore.getDuration` 当前使用 `track.items`，数据形态若未统一会引发时长回归。
- 预览与导出各自计算 overlap，导致时间语义漂移。
- 剪映导出仍依赖 `clip.transition`，迁移后必须改为 track-level 读取。
- FFmpeg 导出若未统一帧率/分辨率/时间基，`xfade` 可能失败或错位。

## 5. OpenSpec/冻结文档映射
- `transition-minimum-semantics-v1.md`：最小模型与生命周期规则，对应类型层、持久化层、时长与预览语义入口。
- `transition-adr-v1.md`：关系对象与单一真值，对应 `Track.transitions[]` 迁移与 export/preview 统一语义。
- `implementation-breakdown-v1.md`：实施分段顺序，对应本文件的修改顺序与入口。
- `openspec/specs/storage`：`editor.ts`、`trackStore.ts` 的迁移与兼容读取。
- `openspec/specs/export`：剪映导出与能力检测、FFmpeg 导出语义对齐。
- `openspec/specs/media-playback`：`SimplePlayer` 与 `simpleEngine` 的最小 fade 预览。
- `openspec/specs/timeline-editing`：`SimpleTimeline` 的 cut point 入口与规则限制。
- `openspec/specs/timeline-editor`：时间线 UI 的最小可见性与操作入口。

---

## 6. Phase 1 实施状态（2026-03-23 更新）

### 已完成模块

| 模块 | 文件 | 状态 |
|---|---|---|
| 数据模型 | `types/editor.ts` — `Track.transitions[]`、`Clip.transition` @deprecated | 完成 |
| Resolver 核心 | `services/transition/transitionResolver.ts` — 标准化、验证、时间窗口解析 | 完成 |
| 类型与常量 | `services/transition/types.ts`、`constants.ts` — `SUPPORTED_TRANSITION_TYPES` Set | 完成 |
| CRUD Handlers | `services/transition/useTransitionHandlers.ts` — add/update/delete/select | 完成 |
| 链式转场 | A→B + B→C 支持，含 chain budget 约束与 `getChainAwareMaxDuration` | 完成 |
| 预览渲染 | `engine/simpleEngine.ts` — fade opacity via `getClipOpacityFromPlans` | 完成 |
| 剪映导出 | `JianyingExporter.ts` — `resolveTrackTimeline` + `extra_material_refs` | 完成 |
| 能力检测 | `exportCapabilityChecker.ts` — 检测 `Track.transitions[]` | 完成 |
| Timeline UI | `TransitionOverlay.tsx`（React.memo）+ cut point 入口 | 完成 |
| 导出对话框 | `SimpleExportDialog.tsx` — Alert 提示 + 视频导出拦截 | 完成 |
| Clip 生命周期 | `SimpleEditor.tsx` — 删除/移动 clip 时自动清理关联转场 | 完成 |
| 测试覆盖 | `transitionResolver.test.ts` — 32 个测试用例 | 完成 |

### 遗留项（不阻塞 Phase 1 交付）

#### P1: 音频 crossfade 独立曲线
- 位置：`engine/simpleEngine.ts` `getClipVolume()`
- 现状：用视觉 opacity 值直接做音频 volume（线性 crossfade 近似），功能正确
- 问题：`exportAudioOverlap` 字段已计算但未使用，音频没有独立淡入淡出曲线
- 建议：Phase 2 扩展转场类型时一并优化，添加独立音频 fade 曲线

#### P2: 含转场轨道禁止拖动/resize/插入
- 位置：`SimpleTimeline.tsx` 第 572、597、639 行
- 现状：含转场的轨道直接 block 拖动/调整/插入操作，提示"请先删除转场"
- 问题：用户体验不好，应改为操作后自动清理失效转场
- 建议：作为独立任务处理，需改动 drag/resize/drop 三处逻辑

#### P2: 集成测试缺失
- 现状：单元测试覆盖 resolver 全部导出函数（32 cases），但缺少端到端流程测试
- 缺失场景：add→save→reload→verify、legacy `Clip.transition` 迁移验证
- 建议：需要 Electron 环境支持，可在 E2E 测试框架就绪后补充
