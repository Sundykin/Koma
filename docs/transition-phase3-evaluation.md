# 转场 Phase 3 评估文档

> 本文档为预研与阶段证据盘点记录，不作为正式实施批准依据。
> 当前结论仅反映本地代码与测试覆盖能直接证明的范围，不等同于 Gate 正式放行结果。

## 1. Gate 状态总览

### Gate E：一致性治理门 — ⚠️ 部分达标

| # | 条件 | 状态 | 依据 |
|---|------|------|------|
| 1 | preview / export 对齐基线已建立 | ✅ | 已补 preview/export 同输入下的可见 clip 集合与 transition alpha 对齐测试（含文本 clip） |
| 2 | migration fixture 已建立 | ✅ | `migration.test.ts` 已覆盖 v0→v1、无 version 兜底、未来版本拒绝；store 入口测试已补显式失败路径 |
| 3 | 核心回归用例已建立 | ⚠️ | 已有 migration、持久化、preview/export checkpoint 对齐、capability 边界与 editor workflow 回归，但仍缺真正的 E2E / golden 产物基线 |
| 4 | capability 判断行为稳定 | ✅ | `exportCapabilityChecker.test.ts` 已固定 supported / degraded / final-only 边界输出，fade 仍保持 supported |
| 5 | 不支持场景不会 silent fallback | ⚠️ | capability 层结果已固定，编辑器入口对未来版本阻断已建立，但导入/导出整链路拦截仍未完全证明 |
| 6 | 输入校验已覆盖基本非法 transition 数据 | ⚠️ | 已覆盖常见非法 transition 输入与未来版本显式拒绝，但尚未形成完整错误分级模型 |
| 7 | 项目文件中的 transition 数据按不可信输入处理 | ⚠️ | 当前项目/剧集加载边界会净化支持版本数据并对未来版本显式失败；编辑器入口已阻止不兼容版本回退初始化与自动保存，但导入导出边界仍未统一 |
| 8 | old/new schema 行为边界清晰 | ⚠️ | v0→v1 边界明确，但通用 version / compatibility 策略尚未建立 |

### Gate F：Phase 3 工作流闭环门 — ⚠️ 未放行

| # | 条件 | 状态 | 说明 |
|---|------|------|------|
| 1 | Phase 1 与 Phase 2 已稳定 | ⚠️ | 当前变更未附 CI / 全量测试报告，不在本文档内直接下结论 |
| 2 | migration / preview / export / capability 已可持续维护 | ⚠️ | 已建立 migration、持久化、preview/export checkpoint 对齐、capability 边界和支持路径 load→save→reload workflow 回归，但缺少完整 E2E / 基线资产 |
| 3 | 高频使用价值已被证明 | ⚠️ | 需要用户反馈数据，非代码任务 |
| 4 | 默认工作流已顺滑 | ⚠️ | 属于 Phase 2 结果，当前缺少 Phase 3 级工作流闭环证据 |
| 5 | 新增一个内建 effect 的成本与风险已可评估 | ✅ | 见本文档第 2 节 |
| 6 | 交互层与交付层边界已清晰 | ⚠️ | 已形成预研边界，但尚未成为正式契约 |
| 7 | 对重型 transition 的工作流影响有明确判断标准 | ⚠️ | 当前为预研判断标准，未形成 Gate 级规则 |

### Gate G：扩展能力门 — ❌ 未达标

| # | 条件 | 状态 | 说明 |
|---|------|------|------|
| 1 | 内建 transition 路线稳定 | ⚠️ | 仅 fade 一种，路线稳定但覆盖面不足 |
| 2 | manifest / schema 设计存在 | ❌ | 未设计 |
| 3 | version / compatibility 规则存在 | ⚠️ | v0→v1 存在，但无通用版本策略 |
| 4 | import validation 存在 | ✅ | migrateTimelineData + normalizeTimelineTracks |
| 5 | trust model 已定义 | ❌ | 未定义 |
| 6 | 资源型 transition 的媒体、同步、布局约束已定义 | ❌ | 未定义 |
| 7 | draft/final 或 editing-grade/final-grade 边界已明确 | ❌ | 未定义 |
| 8 | 不会破坏当前工作流稳定性 | ⚠️ | 无扩展实证 |

**结论：Gate E 仍处于治理补强阶段，Gate F 未放行，Gate G 明确未达标。当前不具备以“Phase 3 已完成”或“可进入扩展阶段”对外表述的条件。**

## 稳定性验收口径

- 工作流级证据：创建、保存、重开、预览、导出检查、导出
- 预览/导出基线证据：同输入下关键时间点结果一致
- capability 边界证据：unsupported / degraded / preview-limited / final-only 行为固定
- 无 silent fallback 证据：不支持场景必须显式阻断或提示

## 4. 稳定性结论（最新验证）

- 已新增并通过的直接证据：
  - `SimpleEditor.workflow.test.tsx` 覆盖 supported path 的 load → save → reload 工作流
  - `simpleEngine.transition.test.ts` 补充 preview/export/resolver 的关键时间点 checkpoint 对齐
  - `exportCapabilityChecker.test.ts` 固定 supported / degraded / final-only 能力边界输出
- 当前可以成立的表述：转场能力在“当前支持范围内”已具备较强回归稳定性，尤其是 fade 主路线、migration/persistence 边界、preview/export 关键时间语义对齐、以及 future-version 阻断链路。
- 当前仍不能成立的表述：转场功能“整体稳定”、Phase 3“已完成”、Gate F“已放行”。
- Gate F 仍然阻塞的最小原因清单：缺少真正的 E2E 工作流证据、缺少 golden 产物基线、缺少完整 trust model、缺少统一 import/export 边界。

---

## 2. 新效果可行性评估

### 2.1 预览侧：WebGL Shader 方案

**技术选项**：

| 方案 | 来源 | 效果数量 | 集成成本 | 性能 |
|------|------|----------|----------|------|
| Canvas 2D 近似 | 内建 | ~5 种（fade/wipe/dissolve/slide/push） | 低 | 高 |
| [GL Transitions](https://gl-transitions.com/) | MIT 开源 GLSL 集合 | 200+ | 中（需 WebGL context） | 中 |
| 自研 WebGL shader | 内建 | 按需 | 高 | 中 |

**Canvas 2D 近似**（推荐起步方案）：
- fade：已实现（globalAlpha 互补）
- wipe（左/右/上/下）：用 `clip()` + 矩形路径，按进度移动裁剪区域
- dissolve：用 `globalAlpha` + 噪声纹理（需预生成 noise texture）
- slide：用 `translate()` 偏移 + 裁剪
- push：两个 clip 同时 translate，一个推出一个推入

优点：零依赖，与现有 Canvas 渲染管线完全兼容，jsdom 测试友好。
缺点：效果种类有限，复杂效果（radial wipe、pixelize）难以实现。

**GL Transitions**（远期方案）：
- 需要在预览管线中引入 WebGL context
- 每个转场是一个 GLSL fragment shader，接口统一：`vec4 transition(vec2 uv)`
- 需要处理 WebGL context 丢失、fallback 到 Canvas 2D
- 参考：[Codrops WebGL Shader Techniques (2025.1)](https://tympanus.net/codrops/2025/01/22/webgl-shader-techniques-for-dynamic-image-transitions/)

### 2.2 导出侧：FFmpeg xfade

**技术选项**：

| 方案 | 效果数量 | 部署成本 | 兼容性 |
|------|----------|----------|--------|
| [ffmpeg 内建 xfade](https://ottverse.com/crossfade-between-videos-ffmpeg-xfade-filter/) | ~44 种 | 零（ffmpeg 7.x 自带） | 全平台 |
| [xfade-easing](https://github.com/scriptituk/xfade-easing) | ~80+ 种 | 低（自定义表达式，不需重编译） | 全平台 |
| [ffmpeg-gl-transition](https://github.com/transitive-bullshit/ffmpeg-gl-transition) | 200+（GL Transitions 全集） | 高（需重编译 ffmpeg + OpenGL） | 受限 |

**ffmpeg 内建 xfade**（推荐方案）：
- 零额外部署成本，ffmpeg 7.x 已内建
- 覆盖主流转场：fade, fadeblack, fadewhite, dissolve, wipeleft/right/up/down, slideleft/right/up/down, circlecrop, rectcrop, radial, smoothleft/right/up/down, circleopen/close, vertopen/close, horzopen/close, diagtl/tr/bl/br, pixelize, hblur, fadegrays, squeezeh/v
- 命令格式：`-filter_complex xfade=transition=<type>:duration=<sec>:offset=<sec>`
- 约束：两个输入必须同分辨率、同帧率、同像素格式

**xfade-easing**（进阶方案）：
- 将 GL Transitions 移植为 ffmpeg xfade 自定义表达式
- 不需要重编译 ffmpeg，通过 `-filter_complex "xfade=transition=custom:expr='...'"` 使用
- 2025 年 7 月仍在活跃维护
- 适合需要更多效果但不想重编译 ffmpeg 的场景

### 2.3 模型扩展设计

当前模型：
```typescript
export type TransitionType = 'fade';
export interface Transition {
  id: string;
  fromClipId: string;
  toClipId: string;
  type: TransitionType;
  duration: number;
}
```

扩展选项：

**选项 A：枚举扩展（推荐）**
```typescript
export type TransitionType = 'fade' | 'fadeblack' | 'fadewhite' | 'dissolve'
  | 'wipeleft' | 'wiperight' | 'wipeup' | 'wipedown';
// Transition 接口不变
```
- 优点：最小改动，类型安全，与 ffmpeg xfade 名称一一对应
- 缺点：每加一种需改类型定义

**选项 B：参数化扩展**
```typescript
export type TransitionType = 'fade' | 'wipe' | 'slide' | 'dissolve';
export interface Transition {
  // ...existing fields
  params?: Record<string, number | string>; // e.g. { direction: 'left' }
}
```
- 优点：减少类型膨胀
- 缺点：params 缺乏类型约束，需要运行时校验

**推荐**：选项 A。当前阶段效果种类有限（预计 ≤10 种），枚举扩展足够。params 字段留到 Gate G 通过后再评估。

### 2.4 Preview / Export 对齐策略

| 预览效果 | 导出效果 | 对齐方式 |
|----------|----------|----------|
| Canvas 2D fade | ffmpeg xfade=fade | globalAlpha ↔ xfade 内建 |
| Canvas 2D wipe | ffmpeg xfade=wipeleft | clip() 矩形 ↔ xfade 内建 |
| Canvas 2D dissolve | ffmpeg xfade=dissolve | noise+alpha ↔ xfade 内建 |
| GL Transitions shader | ffmpeg xfade-easing expr | GLSL ↔ 移植表达式 |

关键约束：**预览侧能做的效果必须 ≤ 导出侧能做的效果**。不允许预览能看到但导出丢失的情况。

### 2.5 成本与风险评估

新增一个内建 Canvas 2D 效果（如 wipeleft）的预估成本：

| 工作项 | 预估工作量 |
|--------|-----------|
| Canvas 2D 渲染实现 | 0.5 天 |
| ffmpeg xfade 参数映射 | 0.25 天 |
| TransitionType 枚举扩展 | 0.1 天 |
| UI 选择器扩展 | 0.25 天 |
| 测试（preview + export + migration） | 0.5 天 |
| **合计** | **~1.5 天/效果** |

风险：
- preview/export 视觉差异（Canvas 2D 近似 vs ffmpeg 精确实现）
- 新效果引入后 capability 矩阵需同步更新
- 剪映导出需确认对应效果的 resourceId 映射

---

## 3. 预研边界条件

### 3.1 资源型 Transition（stinger / track matte）

技术约束：
- 需要额外媒体文件（视频/图片序列）作为转场素材
- 预览侧需要预加载 + 缓存转场素材，增加内存压力
- 导出侧 ffmpeg 不原生支持 stinger，需要 overlay + alpha 通道合成
- 同步约束：转场素材的帧率必须与项目帧率匹配或做重采样
- 布局约束：转场素材的分辨率需要与项目分辨率匹配或做缩放

Stop-Loss 7 适用：资源型需求必须单独立项评估，不得插入当前路线。

### 3.2 插件型 Transition

信任模型约束：
- 插件代码在渲染管线中执行，有性能和安全风险
- 需要沙箱机制（Web Worker / iframe isolation）
- 需要 manifest 定义插件能力边界（输入/输出/参数 schema）
- 需要版本兼容性规则（插件版本 vs 项目版本）
- 需要 fallback 策略（插件不可用时如何降级）

Gate G 条件 2（manifest/schema）、5（trust model）必须先满足。

### 3.3 Shader Transition 双管线约束

| 约束 | 预览管线 | 导出管线 |
|------|----------|----------|
| 运行环境 | 浏览器 WebGL | ffmpeg CLI |
| Shader 语言 | GLSL ES 3.0 | ffmpeg xfade expr 或重编译 |
| 性能瓶颈 | GPU context 切换 | CPU 编码 |
| Fallback | Canvas 2D 近似 | ffmpeg 内建 xfade |

关键判断标准：
- 如果 shader 转场导致预览帧率 < 24fps，触发 Stop-Loss 8（交互流畅度被拖垮）
- 如果 shader 转场需要重编译 ffmpeg，触发 Stop-Loss 9（为未来后端过度抽象）
- 如果 shader 转场无法在 Canvas 2D 上提供可接受的 fallback，不应进入内建效果列表

### 3.4 editing-grade / final-grade 分层

| 层级 | 定义 | 适用场景 |
|------|------|----------|
| editing-grade | 低成本近似，允许视觉差异 | 预览、时间线缩略图 |
| final-grade | 精确渲染，与导出一致 | 导出、全屏预览 |

当前状态：Koma 只有 editing-grade（Canvas 2D 预览）和 final-grade（ffmpeg 导出），两者通过 `getClipOpacityFromPlans` 共享时间语义，视觉差异在可接受范围内。

引入 shader 转场后，需要明确：
- 预览是 editing-grade（Canvas 2D fallback）还是 final-grade（WebGL shader）
- 导出是否必须与预览视觉一致
- 用户是否需要感知两个层级的差异

---

## 4. 结论

### 推荐扩展路径

1. **近期（Gate G 前）**：不实现新效果。继续积累 fade 的使用数据和用户反馈。
2. **中期（Gate G 达标后）**：优先用 Canvas 2D + ffmpeg 内建 xfade 实现 3-5 种常用效果（fadeblack、dissolve、wipeleft、wiperight）。预估成本 ~1 周。
3. **远期（Gate G + 用户需求验证后）**：评估 GL Transitions + xfade-easing 方案，扩展到 10-20 种效果。

### 约束重申

- Gate E/F/G 结论均为当前代码与测试证据盘点，**本文档仅作为预研与阶段性记录**
- 不得以本文档为依据启动新效果实现
- 不得以效果数量作为进度衡量标准（Stop-Loss 6）
- 资源型/插件型 transition 必须单独立项（Stop-Loss 7）
