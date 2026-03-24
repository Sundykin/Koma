# 转场 Phase 1 产品 / UX 简报

> 状态：v1 草案
> 面向对象：产品、交互、研发、测试
> 作用：用产品语言解释转场 Phase 1 要做什么、不做什么、用户会怎么用、何时提示失败

> 本文不是正式 spec，不替代 OpenSpec、ADR 或任务清单。
> 正式语义与范围冻结以：
> [`transition-minimum-semantics-v1.md`](./transition-minimum-semantics-v1.md)、
> [`transition-adr-v1.md`](./transition-adr-v1.md)、
> [`transition-phase-gates-v1.md`](./transition-phase-gates-v1.md)
> 为准。

## 1. 文档目的

当前本地文档已经冻结了转场 Phase 1 的核心语义，但大部分表述偏架构、数据模型和阶段治理。
本文的目标不是重新定义方案，而是把这些冻结结论翻译成产品与交互语言，帮助团队统一回答下面几个问题：

- Phase 1 对用户到底提供什么价值
- 用户在哪个位置进入转场
- 用户需要理解哪些限制
- 哪些失败要及时说明，不能静默降级
- 哪些成熟编辑器能力必须明确延后到 Phase 2 之后

## 2. Phase 1 产品目标

Phase 1 的目标不是“做一个完整转场系统”，而是建立一个最小、可理解、可预期的转场闭环，让用户可以在时间线中完成：

1. 在合法 cut point 上添加 `fade`
2. 调整 `fade` 时长
3. 删除 `fade`
4. 在时间线上看到转场存在
5. 在预览中看到转场效果
6. 通过至少一条导出链路正确输出转场结果

换句话说，Phase 1 的产品价值是：

- 让用户第一次在 Koma 里“真正用上转场”
- 让用户理解转场发生在两个相邻片段之间，而不是某个 clip 的特效属性里
- 让用户相信预览和导出遵循同一套规则

## 3. Phase 1 非目标

以下内容明确不属于当前 Phase 1：

- 多种转场类型
- 资源型转场，例如 stinger、track matte、素材驱动转场
- 插件型或扩展型转场
- 跨轨转场
- 非相邻 clip 转场
- 自由拖拽 handles 的成熟编辑工作流
- 高级 inspector 参数，例如 easing、自定义曲线、任意 params
- 默认转场、快捷添加、批量应用、多选替换等效率能力
- 为未来 GPU、shader、平台化 capability registry 预埋复杂交互

## 4. 产品定位与用户心智

### 4.1 Phase 1 的转场是什么

在产品层，Phase 1 的转场应被理解为：

`同一轨道上两个相邻 clip 之间、发生在 cut point 上的一段 fade 过渡`

它不是：

- clip A 的“出场特效”
- clip B 的“入场特效”
- 可以脱离切点单独摆放的独立对象

### 4.2 用户需要建立的核心心智

用户在 Phase 1 只需要理解 4 件事：

1. 转场以切点为中心
2. 只支持相邻 clip
3. 只支持 `fade`
4. 转场时长会占用两侧片段在 cut point 上的 overlap 时长

其中第 4 条最关键。产品和交互都必须反复强化：

`duration 不是一个纯视觉参数，而是会改变该切点处可见时长关系的 overlap 时长。`

## 5. 核心用户路径

## 5.1 路径 A：在合法切点添加转场

用户目标：
在两个相邻 clip 的切点上快速建立一个 `fade`

建议路径：

1. 用户在同轨相邻 clip 的 cut point 处获得明确入口
2. 用户点击“添加转场”或等价入口
3. 系统创建默认 `fade`
4. 时间线立即出现切点级转场占位
5. 预览可立刻验证结果

此路径的成功标准：

- 用户不需要先理解内部模型
- 用户能清楚知道“我是在两个 clip 之间加了转场”
- 用户不会误以为转场挂在某个 clip 身上

## 5.2 路径 B：调整转场时长

用户目标：
让 cut point 上的 `fade` 更短或更长

建议路径：

1. 用户选中切点上的转场
2. 用户通过最小编辑入口修改 duration
3. 系统立即反馈合法范围内的新结果
4. 预览结果与时间线展示同步更新

此路径的成功标准：

- 用户知道自己在改“转场时长”
- 用户知道时长变化会影响 overlap，而不是一个纯视觉强度参数
- 用户在超出合法范围时得到即时、可理解的反馈

## 5.3 路径 C：删除转场

用户目标：
回到普通硬切

建议路径：

1. 用户选中转场
2. 用户执行删除
3. 时间线恢复为普通 cut point
4. 预览恢复硬切结果

此路径的成功标准：

- 删除结果可预测
- 用户不会担心留下“隐藏状态”
- 删除后 timeline、preview、export 语义一致恢复

## 5.4 路径 D：预览与导出确认

用户目标：
确认该 `fade` 不是只在 UI 上存在，而是真的能输出

建议路径：

1. 用户完成添加或编辑
2. 用户在预览中确认效果
3. 用户通过支持的导出链路输出
4. 用户得到与预览同语义的结果

此路径的成功标准：

- 用户理解 preview 和 export 共享语义
- 用户不会遇到“预览有、导出没生效”的静默落差
- 不支持的导出目标会被明确提示

## 6. 关键限制

以下限制必须在产品与交互层显式成立，而不是作为实现细节隐藏：

### 6.1 只支持同轨相邻 clip

Phase 1 转场只能建立在同一轨道、两个相邻 clip 的 cut point 上。

产品含义：

- 不提供跨轨入口
- 不提供非相邻 clip 的转场入口
- 不把“理论上未来能支持”提前暴露给用户

### 6.2 只支持 fade

Phase 1 不做转场库，不做类型选择器，不做效果扩张。

产品含义：

- 添加入口就是“添加 fade”
- 不让用户在当前阶段思考“选哪一种更好”
- 先把默认工作流建立起来

### 6.3 duration = overlap 时长

Phase 1 的 duration 语义必须在所有面向用户的地方保持一致。

产品含义：

- 文案上要清楚表达时长与重叠关系
- 用户修改 duration 时，系统提示必须基于真实可用 overlap
- 不允许产品层再包一层“看起来更直观但其实不同”的第二套说法

### 6.4 preview / export 共享语义

虽然 preview 和 export 底层实现不同，但用户感知到的规则必须一致。

产品含义：

- 参数相同，用户看到的行为边界必须相同
- 如果某导出目标不支持，必须在导出前明确说明
- 不能让用户用“结果碰运气”的方式理解支持情况

### 6.5 生命周期优先可预测

删除 clip、移动 clip、插入 clip 后，若原相邻关系被破坏，原有转场默认失效或删除。

产品含义：

- Phase 1 不做自动重绑
- 不做“智能修复”
- 不追求看起来聪明，优先保证规则简单、结果可解释

## 7. 失败提示原则

Phase 1 的失败提示必须遵循以下原则：

### 7.1 先说原因，再说结果

不要只告诉用户“失败了”，而要直接说明失败原因，例如：

- 当前切点不满足添加转场条件
- 两侧片段没有足够可用时长
- 当前导出链路不支持转场

### 7.2 只提示用户能理解的限制

提示文案应尽量使用产品语言，而不是底层实现语言。

优先说：

- 只能在同轨相邻片段之间添加转场
- 当前片段可用于转场的时长不足
- 此导出方式暂不支持转场输出

避免直接把实现术语当成用户提示，例如：

- resolver 失败
- canonical effect id 不支持
- transition relation 非法

### 7.3 不做 silent fallback

以下行为在 Phase 1 都不应静默发生：

- 用户以为导出支持，实际被硬切替代
- 用户以为转场仍存在，实际因为相邻关系变化已被系统删除
- 用户以为 duration 已生效，实际被内部裁剪到别的值

如果系统必须做自动处理，也要让用户知道结果发生了什么。

### 7.4 错误反馈优先帮助用户建立规则感

Phase 1 的提示不只是报错，还承担教育用户建立心智的职责。

理想效果是：

- 用户被拒绝一次后，就能理解什么是合法 cut point
- 用户调大时长一次失败后，就能理解 duration 与 overlap 的关系
- 用户看见导出不支持提示后，就不会误判能力边界

## 8. 建议保留的 Phase 1 交互

基于本地冻结文档和成熟编辑器的一手资料，Phase 1 建议只保留下面这些交互：

- 切点级添加入口
- 转场选中态
- duration 编辑
- 删除转场
- 时间线接缝 / 占位可见性
- 预览验证
- 导出前 capability 明确反馈

这些交互足以支撑“添加—编辑—预览—导出”的最小闭环。

## 9. Phase 2 明确延后项

以下内容明确延后到 Phase 2 或之后：

### 9.1 效率工作流

- default transition
- default duration
- quick add
- batch apply / multi-apply
- 低成本替换已有 transition

### 9.2 成熟编辑能力

- 直接拖拽 handles
- 更复杂的时间线 affordance
- replace / reposition 等高级编辑语义
- 更深的 inspector 参数编辑

### 9.3 效果与生态扩张

- 第二种内建 transition
- 资源型 transition
- 插件型 transition
- transition pack / manifest / distribution

## 10. Phase 1 成功判断

从产品与 UX 角度，Phase 1 成功不以“支持多少效果”衡量，而以以下问题能否回答为准：

- 用户是否能在 cut point 上自然找到添加入口
- 用户是否理解转场发生在两个相邻片段之间
- 用户是否理解 duration 与 overlap 的关系
- 用户是否能完成添加、修改、删除、预览、导出
- 用户是否在失败时收到明确、可理解、无静默降级的反馈
- 用户是否相信 preview 和 export 遵循同一套规则

## 11. 外部参考

以下官方资料支持本文的产品收敛方向：

- Adobe Premiere Pro：
  [Transitions overview](https://helpx.adobe.com/si/premiere/desktop/add-video-effects/apply-video-transitions/transitions-overview.html)
 、
  [Clip handles settings](https://helpx.adobe.com/ph_fil/premiere/desktop/add-video-effects/apply-video-transitions/clip-handles-settings.html)
- Apple Final Cut Pro：
  [How transitions are created](https://support.apple.com/en-ge/guide/final-cut-pro/ver761c7150/mac)
 、
  [Add video transitions and fades](https://support.apple.com/en-gw/guide/final-cut-pro/ver761c7432/mac)
- OpenTimelineIO：
  [Timeline Structure](https://opentimelineio.readthedocs.io/en/v0.16.0/tutorials/otio-timeline-structure.html)
- FFmpeg：
  [ffmpeg-filters: xfade / acrossfade](https://ffmpeg.org/ffmpeg-filters.html)

这些资料共同支持的结论是：

- 转场应以 cut point / edit point 为中心
- 转场受相邻片段可用时长限制
- 时间与 overlap 语义必须明确
- Phase 1 应先收敛最小闭环，再扩效率层和效果层
