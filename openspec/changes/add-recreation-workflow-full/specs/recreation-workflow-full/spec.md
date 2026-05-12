# Spec: recreation-workflow-full（7 场景完整版）

## ADDED Requirements

### Requirement: 预告片自动生产线
（同 add-recreation-workflow-three-scenes 已有定义，本 change 不重复，全文复用并扩展）

### Requirement: 多平台横竖屏适配线
（同 add-recreation-workflow-three-scenes，复用）

### Requirement: 多语言本地化生产线
（同 add-recreation-workflow-three-scenes，复用）

### Requirement: 应急换脸生产线（S4）
系统 SHALL 提供两档应急换脸能力：Crisis Lite（48 小时救火，中景以上）与 Crisis Pro（14-21 天工业级，含主演特写）。

#### Scenario: Crisis Lite 48h 救火
- **WHEN** 客户启动 Crisis Lite 任务
- **THEN** pipeline 使用 InSwapper-128 + GFPGAN 后处理
- **AND** 仅处理 face area 占画面 < 35% 的中景以上镜头
- **AND** 特写镜头自动标记"Pro 阶段处理"
- **AND** 完成时长 ≤ 48 小时（90 分钟剧集）

#### Scenario: Crisis Pro 14-21 天工业级
- **WHEN** 客户启动 Crisis Pro 任务
- **THEN** pipeline 使用 DeepFaceLab SAEHD 512/768 训练 + 逐镜头微调 + LivePortrait + GFPGAN + HiFiVFS ensemble
- **AND** 特写镜头逐镜 fine-tune（5000-15000 步/shot）
- **AND** 一次过审率：特写 ≥ 90%、中景 ≥ 90%、远景 ≥ 85%
- **AND** 完成时长 ≤ 21 天（单角色 / 45 分钟剧集）

#### Scenario: 风险镜头自动转 VFX
- **WHEN** 自动 QC 检测到 风险分 > 85（特写 4s+ / 强逆光 / 侧脸 >45° / 遮挡 >20% / 强表情）
- **THEN** 系统标记"转 VFX 补拍 fallback"
- **AND** 通知项目经理 + 客户后期总监
- **AND** Koma 不对此类镜头承诺效果（合同保护伞条款）

#### Scenario: 人工 QC 强制
- **WHEN** 任意换脸任务完成自动 QC
- **THEN** 必须由 senior 工程师 + 项目经理双签
- **AND** 未签则 export 按钮永远 disabled
- **AND** QC 决策（pass/fail/retake）记录到 audit log

#### Scenario: 训练素材标准化
- **WHEN** 客户上传训练素材
- **THEN** 系统校验：照片 ≥ 30 张 + 视频 ≥ 5 分钟（最低门槛）
- **AND** 不达标时显示"数据不足以训练特写镜头，仅可用于中远景"
- **AND** 合同附录 A 明确：素材不达标导致质量损失 Koma 不担责

### Requirement: 体型替换生产线（S5）
系统 SHALL 提供体型替换能力，仅支持静态 / 半身镜头，明确拒绝动态打戏 / 快速运动镜头。

#### Scenario: 静态镜头体型替换
- **WHEN** 客户启动体型替换任务
- **THEN** pipeline 使用 Wan2.2-Animate Character Replacement Mode + IPAdapter 锁脸/锁服
- **AND** 仅处理 shotMode='static' 的镜头
- **AND** 自动可用率 70-80%

#### Scenario: 动态打戏拒绝
- **WHEN** 任务包含快速运动 / 走路 / 打戏镜头（光流 > 12 px/frame）
- **THEN** 系统拒绝该镜头进入体型替换队列
- **AND** UI 显示"此镜头建议传统补拍或重拍"
- **AND** 不接 SLA 承诺

### Requirement: 服装替换生产线（S5 续）
系统 SHALL 提供整集 45 分钟主角服装替换能力。

#### Scenario: 关键帧 + 视频传播
- **WHEN** 客户启动服装替换任务
- **THEN** 系统使用 IDM-VTON 生成关键帧 → SAM2 视频分割 → Wan-Animate 传播 → 时序去闪
- **AND** 单集 45 分钟整集换主角服装时长 ≤ 30 小时（H100 ×2）

#### Scenario: 服装失败容忍
- **WHEN** 自动 QC 检测到服装质感失真或衣服 logo 错位
- **THEN** 标记该镜头为低置信度
- **AND** SLA 容忍度：85%（衣服模糊一点观众接受度高于脸部）

### Requirement: IP 迁移真人→动漫生产线（S6）
系统 SHALL 提供"真人剧重制为动漫"的半自动 pipeline，自动覆盖 55-70%，剩余 25-45% 人工补帧。

#### Scenario: 镜头分级
- **WHEN** 系统接收 IPTransferJob
- **THEN** 自动分级：中远景 / 对话 / 特写 / 打戏
- **AND** 中远景 + 对话 → Wan-Animate + LoRA 自动出片
- **AND** 特写 → LivePortrait 表情驱动 + 人工 review
- **AND** 打戏 → 强制人工补帧

#### Scenario: 单次输出限制
- **WHEN** 任意 IPTransferJob 启动
- **THEN** 单次任务 outputDurationMs ≤ 300_000ms（5 分钟硬上限）
- **AND** 超过则自动切片，重新提交
- **AND** 防 UGC 渠道滥用做长视频违规

#### Scenario: LoRA 跨项目复用
- **WHEN** 用户在新项目使用 LoRA
- **THEN** 系统读取 LoRAModel.reusableProjects 列表
- **AND** 复用时引用计数 +1
- **AND** 删除 LoRA 前强制查询所有引用项目

### Requirement: IP 迁移真人→动物生产线（S7）
系统 SHALL 提供"真人剧重制为拟人化动物角色"的能力，仅做穿衣服站立造型（迪士尼《疯狂动物城》风格），拒绝四足全动物。

#### Scenario: 拟人化角色限制
- **WHEN** 用户提交真人→动物任务
- **THEN** 系统强制角色 LoRA 为"拟人化站立穿衣造型"
- **AND** 拒绝"四足/全动物造型"的 prompt（UI 拦截）

#### Scenario: 短镜头工业级
- **WHEN** 用户要求 5-30s 短镜头
- **THEN** 系统单镜头 H100 ×1 ≤ 60 分钟
- **AND** 一致性 70-80%
- **AND** 营销片整片 30 镜头 ≤ 50 小时

### Requirement: 物料 ticket 状态机（统一）
系统 SHALL 为 7 个场景的所有生产物料维护统一状态机（draft / processing / qc / approved / delivered）。

#### Scenario: 状态流转
- **WHEN** 生产线创建新物料
- **THEN** 初始 status='draft'
- **WHEN** 用户提交"完成制作"
- **THEN** 流转到 'processing'（生产中）
- **WHEN** 自动 + 人工 QC 完成
- **THEN** 流转到 'qc'
- **WHEN** 客户标记"通过"
- **THEN** 流转到 'approved'
- **WHEN** export 完成 + C2PA 签名 + 审计落库
- **THEN** 流转到 'delivered'

#### Scenario: 跨场景物料聚合
- **WHEN** 用户切换到物料看板
- **THEN** 系统列出当前项目所有 MaterialPackage（7 场景统一视图）
- **AND** 可按场景 / 状态 / deadline / 负责人筛选
