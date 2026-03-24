# 转场功能 Phase Gate / Stop-Loss v1（正式版）

> 参见：[`transition-doc-map.md`](./transition-doc-map.md)

## 1. 文档目的

本文件定义转场功能长期项目的阶段进入条件、退出条件与止损规则，防止项目在推进中出现：

- 过早扩范围
- 在基础能力未稳定时堆高级功能
- 用功能数量替代系统成熟度
- 因未来扩展预期而提前过度设计
- 在 preview / export / migration / capability 未收敛时继续加码

本文件是长期规划 v1 与 ADR v1 的执行控制层，不替代 OpenSpec 中的正式需求与任务定义。

---

## 2. 总体原则

### 2.1 Gate 的作用

Gate 用来决定：
- 某阶段是否可以开始
- 某阶段是否可以宣布完成
- 是否允许进入下一阶段

Gate 不服务于推动进度，而服务于控制失焦。

### 2.2 Stop-Loss 的作用

Stop-Loss 用来决定：
- 什么情况必须暂停扩张
- 什么问题要先回头修正
- 哪些偏航迹象一旦出现就不能继续推进

### 2.3 成熟度衡量标准

成熟度不以支持多少种转场衡量，而以以下标准衡量：

- 默认工作流是否顺滑
- 时间语义是否稳定
- preview / export 是否一致
- 导出结果是否可预测
- 高频使用价值是否成立
- migration / capability / 输入校验是否稳定

---

## 3. 阶段定义

- **Phase 1：可用闭环** — 建立最小转场链路，让用户完成“添加—编辑—预览—导出”
- **Phase 2：效率闭环** — 建立默认工作流，让转场从“能用”变成“值得高频使用”
- **Phase 3：工作流闭环** — 建立项目级稳定性，使转场成为系统级能力

---

## 4. Gate 定义

## Gate A：模型冻结门

### 必须满足
1. 已确认转场是关系对象，而不是 clip 内嵌属性
2. 已确认编辑态唯一真值为 `Track.transitions[]`
3. 已确认 `Clip.transition` 只读兼容、不再新写
4. 已冻结最小 transition 模型
5. 已确认 cut-point-first 交互模型
6. 已确认 preview / export 双管线
7. 已确认 resolver 是时间唯一真相来源
8. 已确认 capability 先做最小表，不做平台化 registry

### 未满足时禁止
- 进入编码
- 进入 UI 实现
- 讨论多 effect 扩张
- 讨论资源型 / 插件型 transition 接入

---

## Gate B：Phase 1 可用闭环门

### 必须满足
1. 用户可在 cut point 添加 `fade`
2. 用户可修改 duration
3. 用户可删除转场
4. timeline 中可看到 transition 接缝/占位
5. preview 中 `fade` 可生效
6. export 至少一条链路正确输出
7. 保存 / 重开项目后 transition 信息不丢失
8. 老项目兼容可读
9. capability 对支持/不支持有明确反馈
10. 没有明显 preview/export 时间错位

### 未满足时禁止
- 进入 Phase 2
- 加默认转场
- 加批量应用
- 加第二种 transition
- 扩 inspector 深度

---

## Gate C：编辑稳定门

### 必须满足
1. add / edit / remove 路径稳定
2. 关键交互无明显状态错乱
3. duration 修改不会引起明显时间错误
4. 删除转场后 timeline 状态正确恢复
5. 基础异常场景有可接受反馈
6. 老项目读取不会破坏现有时间轴
7. 基础测试覆盖核心路径
8. resolver 结果已被 timeline 与 preview 稳定消费

### 未满足时禁止
- 扩更多 UI 入口
- 扩复杂 inspector 语义
- 扩更多 transition 类型
- 做效率层批量能力

---

## Gate D：Phase 2 效率闭环门

### 必须满足
1. default transition 存在
2. default duration 存在
3. quick add 存在
4. batch apply / multi-apply 存在
5. timeline affordance 足够轻量直接
6. 常见操作路径成本明显下降
7. 批量操作不会引入时间错乱或状态混乱
8. 快速应用结果仍符合 resolver 语义
9. 用户可低成本替换或删除已有 transition

### 未满足时禁止
- 宣称“转场能力成熟”
- 进入 Phase 3
- 以新增 effect 数量代替效率建设
- 推进资源型 transition 讨论

---

## Gate E：一致性治理门

### 必须满足
1. preview / export 对齐基线已建立
2. migration fixture 已建立
3. 核心回归用例已建立
4. capability 判断行为稳定
5. 不支持场景不会 silent fallback
6. 输入校验已覆盖基本非法 transition 数据
7. 项目文件中的 transition 数据按不可信输入处理
8. old/new schema 行为边界清晰

### 未满足时禁止
- 进入工作流级宣传或依赖
- 加更多 effect 种类
- 接更多 export target
- 评估外部扩展生态落地

---

## Gate F：Phase 3 工作流闭环门

### 必须满足
1. Phase 1 与 Phase 2 已稳定
2. migration / preview / export / capability 已可持续维护
3. 高频使用价值已被证明
4. 默认工作流已顺滑
5. 新增一个内建 effect 的成本与风险已可评估
6. 交互层与交付层边界已清晰
7. 对重型 transition 的工作流影响有明确判断标准

### 未满足时禁止
- 宣布进入扩展阶段
- 扩更多内建 effect
- 启动资源型 transition 实现
- 启动插件型 transition 实现

---

## Gate G：扩展能力门

### 必须满足
1. 内建 transition 路线稳定
2. manifest / schema 设计存在
3. version / compatibility 规则存在
4. import validation 存在
5. trust model 已定义
6. 资源型 transition 的媒体、同步、布局约束已定义
7. draft/final 或 editing-grade/final-grade 边界已明确
8. 不会破坏当前工作流稳定性

### 未满足时禁止
- transition pack 落地
- plugin transition 落地
- shader runtime 落地
- marketplace / distribution 路线承诺

---

## 5. Stop-Loss 定义

### Stop-Loss 1：`fade` 一致性失稳即停扩
如果 `fade` 的 preview/export 一致性做不稳，立即停止扩更多 transition 类型。

### Stop-Loss 2：时间模型分散即停 UI 扩张
如果 timeline、preview、export 仍各自维护时间计算逻辑，立即停止继续扩 UI 与 effect。

### Stop-Loss 3：双真值持续存在即停功能扩张
如果 `Track.transitions[]` 与 `Clip.transition` 长期并存为双写/双真值，立即停止新功能扩张。

### Stop-Loss 4：capability 不稳定即停多目标扩展
如果 capability 判断经常不一致、含糊或 silent fallback，立即停止接更多 export target。

### Stop-Loss 5：无高频价值证据即不进 Phase 2
如果没有证据证明用户会高频使用转场，则不自动推进更大投入。

### Stop-Loss 6：效果数量成为主 KPI 即回调路线
如果团队开始用新增 effect 数量衡量进度，立即回到默认工作流、一致性、可预测性指标。

### Stop-Loss 7：资源型需求插队即单独立项
如果 stinger / track matte / asset-based transition 试图直接插入当前路线，必须中止并单独立项评估。

### Stop-Loss 8：交互流畅度被新类型明显拖垮即停接入
如果新增 transition 类型明显破坏编辑交互流畅度，而系统又没有明确 editing-grade / final-grade 分层策略，则暂停该类型接入。

### Stop-Loss 9：为未来 GPU/硬件后端过度抽象即停设计扩张
如果团队开始为 OpenCL/GPU/Vulkan/VideoToolbox 等未来后端预埋复杂抽象，而当前闭环与默认工作流尚未稳定，则立即停止此类设计。

### Stop-Loss 10：高级编辑能力倒灌 Phase 1 即停收敛
如果 replace/reposition/advanced handles/custom transition workflow 等成熟系统能力开始倒灌 Phase 1 范围，立即暂停并收敛范围。

### Stop-Loss 11：治理缺失时禁止开放扩展入口
如果 manifest/schema、validation、compatibility、trust model 任一关键项缺失，则禁止进入扩展生态实现。

### Stop-Loss 12：回归不能稳定发现分叉时禁止继续扩面
如果回归体系无法稳定发现 preview/export 分叉、migration 损坏或 capability 失真，则禁止继续扩大路线范围。

---

## 6. 阶段推进规则

### 6.1 进入下一阶段的必要条件
进入下一阶段必须同时满足：

1. 前一 Gate 已通过
2. 没有触发任何未解决 Stop-Loss
3. 当前阶段核心价值已被证明
4. 当前阶段关键质量债已可控

### 6.2 不允许的推进方式
以下推进方式无效：

- 以“已经做了一半”为理由直接跳 Gate
- 以“以后再补治理”为理由跳过治理门
- 以“先把效果做多一点”为理由替代效率闭环
- 以“外部资料有类似产品”为理由绕过内部验证

### 6.3 阶段优先级顺序不可变
推进顺序固定为：

1. 模型冻结
2. 可用闭环
3. 编辑稳定
4. 效率闭环
5. 一致性治理
6. 工作流闭环
7. 扩展能力评估

不得跳步。

---

## 7. 相关文档

- [转场功能长期规划 v1](./transition-long-term-plan-v1.md)
- [转场功能 ADR v1](./transition-adr-v1.md)
- [转场功能文档入口](./transition-doc-entry.md)

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
