# 转场功能风险审查 v1

> 状态：审查稿
> 作用：为转场 Phase 1 提供治理、风控、失败模式与止损规则补充
> 适用范围：仅针对当前已冻结的 Phase 1 约束，不扩展到 Phase 2/3

---

## 1. 审查目标

本文件用于回答以下问题：

- 当前转场 Phase 1 最容易在哪些地方失控
- 哪些约束必须在编码前前置冻结
- 哪些失败模式最危险、出现后必须立即止损
- capability / preflight 应该审什么
- 哪些场景必须显式拒绝，不能 silent fallback

本文件不替代：

- OpenSpec 正式需求与设计
- Phase Gate / Stop-Loss 主文档
- 实施拆分与任务清单

---

## 2. 审查输入基线

### 2.1 本地冻结约束

- 编辑态唯一真值是 `Track.transitions[]`
- `Clip.transition` 仅兼容读取
- Phase 1 只做 `fade`
- 只支持同轨相邻 clip 的 cut point
- `duration = overlap` 时长
- preview / export 共享语义，不共享实现

### 2.2 本地文档基线

- [OpenSpec 设计：update-transition-semantics-migration/design.md](/Users/mjy/WorkSpace/Koma/openspec/changes/update-transition-semantics-migration/design.md)
- [最小语义契约与 Go/No-Go](/Users/mjy/WorkSpace/Koma/docs/transition-minimum-semantics-v1.md)
- [Phase Gate / Stop-Loss](/Users/mjy/WorkSpace/Koma/docs/transition-phase-gates-v1.md)
- [转场文档地图](/Users/mjy/WorkSpace/Koma/docs/transition-doc-map.md)

### 2.3 外部一手资料

- [OpenTimelineIO 官方文档：Timeline Structure / Transition](https://opentimelineio.readthedocs.io/en/v0.16.0/tutorials/otio-timeline-structure.html)
- [Adobe Premiere Pro 官方文档：Clip handles settings](https://helpx.adobe.com/vn_vi/premiere/desktop/add-video-effects/apply-video-transitions/clip-handles-settings.html)
- [FFmpeg 官方文档：ffmpeg-filters](https://ffmpeg.org/ffmpeg-filters.html)

---

## 3. 审查结论摘要

Phase 1 最危险的问题不是“fade 效果不够丰富”，而是以下三类失控：

1. **语义分叉**：timeline / preview / export 各自维护时间真相。
2. **双真值回潮**：`Clip.transition` 继续参与编辑态写入或当前真值判断。
3. **非法状态后置处理**：不先做 legality / preflight，而把错误留给渲染器、导出器或用户项目数据去承受。

因此，转场 Phase 1 必须被视为**受控语义迁移项目**，而不是“补一个最小 UI + fade 导出”的普通功能开发。

---

## 4. 失败模式

| 编号 | 失败模式 | 危险性 | 典型表现 | 风险说明 |
|---|---|---|---|---|
| FM-01 | 双真值回潮 | 极高 | 新增/修改时同时写 `Track.transitions[]` 和 `Clip.transition`，或 UI/preview/export 混合读取 | 会直接破坏保存、重开、兼容迁移和 capability 判断，且很难在表面交互中及时暴露 |
| FM-02 | 时间语义分叉 | 极高 | timeline 用一套 overlap 算法，preview/export 各自做换算 | 会产生“预览正确、导出错误”或“时间线显示正确、播放错误”的伪闭环 |
| FM-03 | 非法 transition 被后置发现 | 极高 | 非相邻、超出 handles、相邻 transition 重叠直到导出或播放时报错 | 错误暴露过晚，用户已在不可信状态上继续编辑，损坏范围扩大 |
| FM-04 | capability 误报 | 高 | UI 允许添加 fade，但导出链路未完成媒体规格统一或无 unsupported 反馈 | 用户会得到“可编辑但不可交付”的项目状态，损害预期与数据可信度 |
| FM-05 | 旧项目归一化不稳定 | 高 | 老项目读取后 transition 丢失、错绑、时间错位 | 兼容读取是 Phase 1 明确承诺，失败会直接伤害历史项目 |
| FM-06 | A/V 语义漂移 | 高 | 视频 crossfade 与音频 acrossfade 的开始点、时长或 overlap 规则不一致 | 导致音画不同步，且难用单一 UI 症状定位 |
| FM-07 | handles 不足被隐式兜底 | 高 | 自动补帧、自动截断、自动降级，但用户没有明确感知 | 这属于 silent fallback，与当前治理基线冲突，会制造不可预测结果 |
| FM-08 | 高级能力倒灌 Phase 1 | 中高 | default transition、batch apply、资源型 transition、复杂 inspector 插队 | 会稀释闭环建设，把关键治理债务继续后拖 |

---

## 5. 必须前置冻结的约束

以下约束必须先写清并通过审查，再允许进入编码：

### 5.1 合法性约束

- transition 只允许存在于**同轨、相邻 clip 的单一 cut point**
- `duration` 不得超过两侧可用 handles 所允许的 overlap 上限
- 两个 transition 不允许相邻重叠
- 一旦删除 / 移动 / 插入 clip 导致邻接关系破坏，原 relation 必须失效
- 非法旧数据只允许两种结果：
  - 归一化后成为合法 relation
  - 被显式标记为 unsupported / rejected

### 5.2 时间语义约束

- timeline、preview、export 只能消费**同一份 resolved timing 结果**
- `track duration` 必须基于 overlap-aware 规则统一计算
- 视频 `xfade` 与音频 `acrossfade` 必须从同一语义层推导起止时间，不允许各算各的

### 5.3 兼容迁移约束

- `Clip.transition` 只作为旧项目读取入口
- 旧项目加载后必须归一化到 `Track.transitions[]`
- 归一化后的编辑态不允许再回写旧结构作为当前真值

### 5.4 反馈约束

- unsupported 必须显式反馈
- preflight 失败必须显式阻止导出或生效
- 禁止 silent fallback

---

## 6. capability / preflight 审查点

Phase 1 至少应在以下五个层面做 preflight：

### 6.1 数据合法性 preflight

- `fromClipId` / `toClipId` 是否存在
- 两者是否仍然同轨且相邻
- `type` 是否为 `fade`
- `duration` 是否为正值且不超过允许 overlap

### 6.2 时间语义 preflight

- resolver 是否成功产出唯一 timing truth
- track 总时长是否与 overlap 语义一致
- 是否出现相邻 transition 冲突或占用区间重叠

### 6.3 导出媒体前提 preflight

对使用 FFmpeg `xfade` 的链路，至少检查：

- 分辨率是否一致
- 像素格式是否一致
- 帧率是否一致
- timebase 是否一致
- 音频流是否满足 acrossfade 所需基本条件

### 6.4 capability 审查点

- 当前 export target 是否真正支持 track-level transition relation
- 是否只支持 preview，不支持 export
- 是否只支持单一链路，不支持所有 target
- unsupported 场景是否有明确用户提示

### 6.5 兼容迁移审查点

- 老项目读取后是否成功归一化
- 非法旧结构是否被显式拒绝而非隐式吞掉
- save / reload 后是否仍保持同一真值与同一 timing 结果

---

## 7. 必须显式拒绝的场景

以下场景在 Phase 1 中不应被“尽量兼容”，而应被显式拒绝：

1. 非同轨相邻 clip 之间建立 transition
2. `duration` 超过两侧可用 handles 上限
3. 一个 cut point 两侧出现相邻 transition 重叠
4. 旧项目数据无法归一化为合法 relation
5. export target 不满足媒体规格统一条件，却仍试图使用 `xfade`
6. preview 已支持但当前导出链路未支持，且 capability 未显式告知用户
7. 资源型 transition、插件型 transition、第二种 effect 类型倒灌 Phase 1
8. 任何依赖 silent fallback 才能“看起来可用”的路径

---

## 8. Stop-Loss 触发条件

在现有 Phase Gate / Stop-Loss 基础上，建议把以下情况视为立即暂停扩面的触发条件：

### SL-R1：发现双真值写入

只要新增/修改/删除路径中存在 `Clip.transition` 与 `Track.transitions[]` 双写，立即停止继续实现。

### SL-R2：发现时间语义不再单源

只要 timeline、preview、export 任意一处绕过统一 resolver 计算 overlap，立即停止 UI 和 effect 扩张。

### SL-R3：合法性校验后置到导出或播放

只要非法 relation 需要等到 preview/export 阶段才暴露，立即停止继续接链路。

### SL-R4：unsupported 依赖 silent fallback

只要出现“用户看不出不支持，但结果被静默截断/忽略/替代”的实现，立即回退到 capability 边界审查。

### SL-R5：兼容读取破坏历史项目

只要老项目归一化导致 transition 丢失、错绑、时间错位，立即停止范围扩张，先修兼容路径。

### SL-R6：A/V fade 漂移无法稳定复现

只要视频和音频 fade 行为不一致，且回归体系无法稳定定位，立即停止扩大导出目标或新效果讨论。

---

## 9. 审查建议

### 9.1 开工前必须完成

- 冻结 legality validator 输入输出契约
- 冻结 resolved timing contract
- 冻结旧项目归一化规则
- 冻结至少一条 export 链路的 capability / preflight 契约

### 9.2 不应采用的推进方式

- 先做 UI 再补语义
- 先让 preview 跑通，再回头统一 export
- 先“尽量兼容”非法数据，再以后收紧
- 先默认吞掉 unsupported，等用户反馈后再补提示

### 9.3 最小回归样例建议

- add / edit / remove `fade`
- delete / move / insert clip 导致 relation 失效
- save / reload 一致性
- old project compatibility
- mixed fps / resolution / timebase
- video + audio fade 同步

---

## 10. 最终结论

Phase 1 可以做，但前提不是“先把 fade 接上”，而是“先把语义、合法性、兼容迁移、capability / preflight 卡死”。

如果团队在推进过程中出现以下任一迹象：

- 双真值回潮
- 时间语义分叉
- unsupported 走向 silent fallback
- 旧项目兼容开始损坏
- 高级能力倒灌 Phase 1

则应立即触发止损，暂停扩张，回到治理基线收敛。
