# 转场功能 Phase 1 测试策略 v1

> 参见：[`transition-doc-map.md`](./transition-doc-map.md)
>
> 状态：测试策略
> 作用：为 Phase 1 转场能力建立可执行的测试与验收基线，不替代 OpenSpec 正式需求与设计。

## 1. 文档目的
本文件用于把已冻结的转场语义、阶段 Gate 和外部一手资料，收敛为一份可执行的测试策略。
本文件回答：
1. Phase 1 应该先测什么
2. 应按什么层次建立测试
3. preview / export 一致性应如何验
4. FFmpeg 类导出前提应如何进入测试
5. Gate A / B / C / E 分别需要什么测试证据
本文件不负责：
- 重写正式需求正文
- 替代 `openspec/changes/update-transition-semantics-migration/` 下的 spec / design / tasks
- 决定是否纳入第二种 transition
- 决定是否把音频淡变正式纳入 Phase 1 范围

---

## 2. 测试输入基线
当前测试策略以上述正式文档为真值来源：
- `openspec/changes/update-transition-semantics-migration/design.md`
- `openspec/changes/update-transition-semantics-migration/specs/*/spec.md`
- `docs/transition-minimum-semantics-v1.md`
- `docs/transition-phase-gates-v1.md`
- `docs/implementation-breakdown-v1.md`
当前已冻结的 Phase 1 核心前提：
- 编辑态唯一真值为 `Track.transitions[]`
- `Clip.transition` 仅兼容读取
- 只支持 `fade`
- 只允许同轨相邻 clip 的 cut point
- `duration` 表示 overlap 时长
- preview / export 共享语义，不共享实现
- resolver/layout 结果是唯一时间真相来源

---

## 3. 测试目标
Phase 1 测试不追求“多效果覆盖”，只验证以下四类成熟度：
1. 语义稳定：真值、时间语义、生命周期行为不分叉
2. 闭环可用：用户可以完成“添加 -> 编辑 -> 预览 -> 导出 -> 重开验证”
3. 一致性可证：preview / export 基于同一语义解释转场
4. 边界可控：非法场景、旧项目兼容、能力不支持都能明确反馈

---

## 4. 总体分层策略
测试按四层建立，自下而上推进：
### L0：语义夹具层
目标：
- 固定 `Track.transitions[]` 的合法 / 非法状态矩阵
- 固定 overlap 时间语义
- 固定生命周期破坏规则
特点：
- 不依赖 UI
- 不依赖导出结果文件
- 作为 preview / export / timeline 共用的断言基线
### L1：功能与集成层
目标：
- 验证 add / edit / remove / save / reload / compatibility 路径
- 验证 capability 反馈和非法输入反馈
- 验证老项目兼容读取后会归一到新真值
### L2：最小 E2E 闭环层
目标：
- 覆盖 Phase 1 最小工作流
- 证明默认路径不是“看起来能用”，而是真的能闭环
### L3：性能与稳定性基线层
目标：
- 建立 preview 最小渲染和导出最小链路的基线
- 及时发现时间漂移、卡顿、抖动、导出 flaky
原则：
- 不以高并发或大规模为 Phase 1 核心目标
- 优先测“是否稳定可重复”，其次才是“是否足够快”

---

## 5. 语义 fixture 策略
## 5.1 fixture 分类
至少建立三组 fixture：
### A. 合法语义 fixture
用于证明系统支持的最小闭环成立。
建议最少包含：
- `FX-LEGAL-001`：两个同轨相邻 clip，单个 `fade`，中等 duration
- `FX-LEGAL-002`：相同结构，但 duration 取接近 handle 上限的边界值
- `FX-LEGAL-003`：保存后重开，`Track.transitions[]` 仍可恢复

### B. 非法语义 fixture
用于证明系统不会把不支持场景假装支持。
建议最少包含：
- `FX-ILLEGAL-001`：跨 track transition
- `FX-ILLEGAL-002`：非相邻 clip relation
- `FX-ILLEGAL-003`：相邻 transition 互相重叠
- `FX-ILLEGAL-004`：duration 超出一侧或两侧可用 handle
- `FX-ILLEGAL-005`：缺失 `fromClipId` / `toClipId` / `type` / `duration`

### C. 生命周期与迁移 fixture
用于证明 Phase 1 的“简单、可预测”规则成立。
建议最少包含：
- `FX-LIFE-001`：删除 clip 后关联 transition 被直接删除
- `FX-LIFE-002`：移动 clip 破坏邻接后 transition 被删除
- `FX-LIFE-003`：插入 clip 打断 cut point 后 transition 被删除
- `FX-LIFE-004`：旧项目只含 `Clip.transition`，加载后归一到 `Track.transitions[]`

## 5.2 fixture 断言字段
每个 fixture 至少固定以下断言：
- `trackId`
- `fromClipId`
- `toClipId`
- `type`
- `duration`
- active overlap 起止区间
- 预期 track 总时长
- 预期 capability 结果
- 预期 preview/export 是否应成功

---

## 6. 功能 / E2E / 性能分层重点
## 6.1 功能与集成测试重点
- 创建合法 `fade`
- 修改 `duration`
- 删除 transition
- 保存 / 重开后 transition 不丢失
- 旧项目兼容读取
- timeline / preview / export 都只消费 `Track.transitions[]`
- 非法 transition 关系被拒绝且无 silent fallback
- 生命周期规则符合冻结策略，不做自动重绑

## 6.2 最小 E2E 闭环定义
Phase 1 至少需要两条 E2E：
### E2E-POS-001：最小正例闭环
步骤：
1. 在同轨相邻 cut point 添加 `fade`
2. 修改 `duration`
3. 在 timeline 看到 transition 接缝 / 占位
4. 在 preview 中进入 overlap 区间并看到最小可感知 fade
5. 走至少一条支持的导出链路完成导出
6. 保存项目并重开
7. 验证 transition 信息与时间语义未丢失

### E2E-NEG-001：最小负例闭环
步骤：
1. 构造非法场景，例如非相邻 clip 或 handle 不足
2. 尝试创建或导出 transition
3. 验证系统明确反馈不支持 / 不合法
4. 验证不存在 silent fallback 或假成功

## 6.3 性能与稳定性基线
Phase 1 不建立重型性能 KPI，但应至少建立以下基线：
- preview 连续播放同一合法 `fade` 时不出现明显时间跳变
- 对同一 fixture 重复导出，结果稳定，不出现偶发失败
- 修改 `duration` 后重新 preview / export，不出现状态错乱
- 最小 E2E 闭环在同一测试环境中可重复执行

---

## 7. preview / export 一致性检查点
preview / export 不要求共用实现，但必须在同一 fixture 上对齐以下检查点：
1. **真值来源一致**
   - 两者都从 `Track.transitions[]` 消费
   - 不依赖 `Clip.transition` 新写入

2. **active overlap 区间一致**
   - 同一 `duration` 对应同一 transition 活跃区间

3. **总时长语义一致**
   - track 总时长按 clip 总时长减 overlap 总和计算

4. **非法场景判断一致**
   - preview 不应“看起来能播”
   - export 不应“偷偷导出成功”

5. **capability 反馈一致**
   - “支持 / 不支持”与真实导出行为一致

6. **时间真值唯一**
   - 不允许 preview / export 各自补一套独立时间逻辑

---

## 8. FFmpeg 前置条件负例策略
本节适用于任何使用 FFmpeg 类链路完成直接导出、预处理或渲染归一化的路径。
如果当前 Phase 1 首条闭环导出不是 FFmpeg 直出，本节仍应作为导出前置能力测试资产保留。
结合 FFmpeg 官方 `xfade` / `acrossfade` 文档，至少建立以下负例：
- `FFMPEG-NEG-001`：两段视频帧率不一致
- `FFMPEG-NEG-002`：两段视频分辨率不一致
- `FFMPEG-NEG-003`：像素格式不一致
- `FFMPEG-NEG-004`：timebase 不一致
- `FFMPEG-NEG-005`：duration 超出 clip 可用 overlap
- `FFMPEG-NEG-006`：音频流存在但未明确纳入 Phase 1 语义时，禁止假定自动 acrossfade

对这些负例的要求不是“尽量兜底转出来”，而是：
- 要么预处理后进入受支持导出路径
- 要么在 capability / preflight 阶段显式拒绝
- 全程不得 silent fallback
说明：
- 若 Phase 1 最终明确“不做音频淡变”，则音频保持硬切应被写入验收结果
- 若 Phase 1 明确纳入音频淡变，则需新增 `acrossfade` 对应的语义 fixture 与一致性断言

---

## 9. 旧项目兼容回归
旧项目兼容回归是 Gate B / E 的强制项，不是可选补测。
至少需要覆盖：
1. 只含 `Clip.transition` 的旧项目可成功读取
2. 读取后编辑态归一到 `Track.transitions[]`
3. 归一后保存的新项目不再依赖 `Clip.transition`
4. 老项目读取不会破坏原时间轴的非转场部分
5. 非法旧数据按不可信输入处理，不可直接进入“已支持”状态

推荐至少保留两份迁移样本：
- `MIG-OLD-VALID-001`：旧结构合法、可迁移
- `MIG-OLD-INVALID-001`：旧结构残缺或不合法、应显式反馈

---

## 10. Gate 对应证据

| Gate | 需要的测试证据 | 最低结论 |
|---|---|---|
| Gate A | 语义 fixture 矩阵已冻结；非法关系与生命周期规则已有断言；真值唯一性有明确测试项 | 可进入实现 |
| Gate B | 最小正例 E2E、最小负例 E2E、至少一条 export 正例、preview/export 一致性检查点通过、旧项目兼容回归通过 | 可宣布 Phase 1 可用闭环 |
| Gate C | add / edit / remove 稳定回归、duration 修改回归、异常场景反馈回归、timeline 与 preview 消费同一 resolver 结果的回归 | 可进入编辑稳定建设 |
| Gate E | migration fixture 常驻、preview/export 对齐基线常驻、capability 反馈负例常驻、非法输入校验常驻 | 可进入一致性治理通过态 |

---

## 11. 出口标准
Phase 1 测试完成不以“效果数量”判定，而以以下问题是否都能回答为准：
- 真值是否唯一
- 语义是否统一
- preview / export 是否对齐
- 旧项目是否能安全兼容
- 不支持场景是否明确反馈
- 回归体系能否稳定发现语义分叉

只要其中任一项不能稳定回答，就不应宣称 Phase 1 已完成。

---

## 12. 参考资料

- [OpenTimelineIO Timeline Structure](https://opentimelineio.readthedocs.io/en/v0.16.0/tutorials/otio-timeline-structure.html)
- [Adobe Premiere Pro Transition Overview](https://helpx.adobe.com/premiere-pro/using/transition-overview-applying-transitions.html)
- [Adobe Premiere Pro Clip Handles](https://helpx.adobe.com/premiere/desktop/add-video-effects/apply-video-transitions/video-transitions-using-clip-handles.html)
- [FFmpeg Filters Documentation](https://ffmpeg.org/ffmpeg-filters.html)
