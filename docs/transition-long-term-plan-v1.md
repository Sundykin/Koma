# 转场功能长期规划 v1（正式版）

> 参见：[`transition-doc-map.md`](./transition-doc-map.md)

> 版本：v1
> 状态：冻结

## 1. 文档目的

本规划用于收敛 Koma 转场能力的长期建设路径，明确：

- 主路线是什么
- 哪些内容先做，哪些内容后做
- 哪些方向明确不进入当前承诺范围
- 哪些架构决策需要立即冻结
- 用什么 gate 和 stop-loss 控制长期项目失焦

本版是长期规划 v1 的正式版，作为后续 ADR、阶段 gate、实施拆分的上位约束。

---

## 2. 核心判断

### 2.1 转场的本质

转场不是某个 clip 上的特效配置，而是**时间轴上两个相邻片段之间的关系对象**。

长期目标不是做一个“转场效果面板”，而是建立一个：

- 可编辑
- 可预览
- 可导出
- 可迁移
- 可扩展但不过度平台化

的转场系统。

### 2.2 长期主线

长期只保留一条主线：

**先把转场做成稳定的时间轴关系能力，再做高频效率增强，最后才考虑工作流级扩展。**

对应三阶段：

1. 可用闭环
2. 效率闭环
3. 工作流闭环

### 2.3 明确不走的路线

以下方向不纳入当前主路线：

- 转场平台化
- 海量转场库
- 转场商城 / marketplace
- 用户脚本化 transition runtime
- shader transition 平台
- 资源型 transition 近期落地
- AI transition recommendation
- 任意参数化 effect registry

这些方向只进入**远期预研池**，不进入当前承诺。

---

## 3. 外部资料收敛后的规划前提

### 3.1 cut-point-first 是硬约束

主流工具普遍把 transition 放在 edit boundary / cut point 上，而不是作为自由附着的 clip 特效。

### 3.2 默认转场是效率主轴

外部资料共同说明：默认转场、快速添加、批量应用比深度配置更优先产生价值。

### 3.3 资源型转场属于另一问题域

stinger / track matte / asset-based transition 依赖外部媒体资源、解码同步、文件布局、分辨率约束和更复杂的 preview/export 一致性，不是 `fade` 的线性下一步。

### 3.4 preview 与 export 必须双管线

FFmpeg `xfade` 等机制更偏导出/离线处理。预览需要交互性、低延迟。二者共享语义，不共享实现。

### 3.5 交互层与交付层分离

成熟视频工作流普遍允许编辑态使用低成本预览/代理路径，最终输出仍回到原始质量路径。

---

## 4. 路线图

## Phase 1：可用闭环

### 目标
建立最小但完整的转场链路。

### 范围

- 内部唯一编辑真值：`Track.transitions[]`
- 最小 effect：`fade`
- cut-point 添加 / 编辑 / 删除转场
- timeline 中显示 transition 接缝/占位
- preview 能看到基础 fade 效果
- export 至少一条链路正确输出
- capability 基础提示
- 项目可保存与重新加载
- 旧数据可读兼容

### 最小模型

```ts
type Transition = {
  id: string
  fromClipId: string
  toClipId: string
  type: 'fade'
  duration: number
}
```

### 不在 Phase 1 的内容

- 多种 transition 类型
- easing / resourceId / 任意 params
- 批量操作
- 复杂 inspector
- shader / plugin / asset-based transitions

### 成功标准

用户可完整走完“加转场—调时长—预览—导出”。

---

## Phase 2：效率闭环

### 目标
把“能用”变成“值得高频使用”。

### 范围

- default transition
- default duration
- quick add
- multi-apply / batch apply
- 快速替换 / 删除
- 更顺手的 timeline affordance
- inspector 基础补强
- 回归测试增强

### 成功标准

高频操作路径点击数明显下降，用户在真实流程里会重复使用转场。

---

## Phase 3：工作流闭环

### 目标
让转场进入稳定项目工作流。

### 范围

- schema / migration 稳定化
- preview / export 回归体系稳定
- capability 表更明确
- 与项目导入导出能力更稳地整合
- 在充分证据下评估少量新增内建效果
- 为远期资源/扩展型 transition 预研建立边界条件

### 进入条件

只有在 Phase 1 与 Phase 2 已被证明稳定且有价值时才进入。

---

## 5. 远期预研池

以下内容只允许研究，不纳入 v1 主路线承诺：

- stinger / track matte / asset-based transitions
- shader transitions
- plugin-based transitions
- transition pack / marketplace
- AI transition recommendation
- GPU/WebGL/WebGPU 加速型高级预览
- draft export / preview export workflow
- 任意参数化 effect 平台

这些内容未来若要进入路线，必须单独立项评估，不能自然顺延进主路线。

---

## 6. 当前必须冻结的决策

| # | 决策 |
|---|------|
| 1 | 编辑真值：`Track.transitions[]` |
| 2 | `Clip.transition` 只读兼容，不再新写 |
| 3 | Phase 1 只做 `fade` |
| 4 | 最小模型冻结 |
| 5 | cut-point-first 主交互 |
| 6 | resolver 是时间唯一真相来源 |
| 7 | preview / export 双管线 |
| 8 | capability 先做最小表 |
| 9 | 资源型 / 插件型 / shader 全部延期到探索池 |
| 10 | 性能后端（GPU/OpenCL）不反向定义主模型 |

---

## 7. 成熟度衡量标准

不以支持多少种转场衡量，而以以下标准衡量：

- 默认工作流是否顺滑
- 时间语义是否稳定
- preview / export 是否一致
- 导出结果是否可预测
- 高频使用价值是否成立

---

## 8. 相关文档

- [转场功能 ADR v1](./transition-adr-v1.md)
- [转场功能最小语义契约与 Go/No-Go 决策 v1](./transition-minimum-semantics-v1.md)
- [转场功能 Phase Gate / Stop-Loss v1](./transition-phase-gates-v1.md)
- [转场功能 implementation-breakdown-v1](./implementation-breakdown-v1.md)
- [转场需求文档整理说明](./transition-doc-entry.md)
- `openspec/changes/update-transition-semantics-migration/proposal.md`
- `openspec/changes/update-transition-semantics-migration/design.md`
- `openspec/changes/update-transition-semantics-migration/tasks.md`

---

## References

- Adobe Premiere Pro: Set and apply default transitions
- Adobe Premiere Pro: Quick transitions
- Apple Final Cut Pro: Add transitions and fades
- Blackmagic DaVinci Resolve Edit page
- FFmpeg Filters Documentation: xfade / xfade_opencl
- Kdenlive Proxy Settings
- Shotcut Forum: Settings Proxy Editing
- OBS Knowledge Base: Track Matte Stinger Transitions
