# Spec: modification-workbench（选菜式修改工作台）

## ADDED Requirements

### Requirement: 基于报告的选菜式修改
系统 SHALL 在用户拿到 DiagnosticReport 后，提供统一界面让用户"勾菜"要修改的内容。

#### Scenario: 浏览时随手加修改
- **WHEN** 用户 hover 报告实体（角色卡 / 镜头 / 服装单元格 / 台词段）
- **THEN** 显示 `+ 改造` 浮按钮
- **AND** 点击弹出 `<QuickAddDrawer>` 配置修改类型 + 应用范围

#### Scenario: 范围三模式
- **WHEN** 用户配置修改 scope
- **THEN** 支持：(1) 仅当前镜头 / (2) 全片该角色 / (3) 自定义筛选（嵌套条件 DSL）

#### Scenario: 嵌套条件 DSL
- **WHEN** 用户使用嵌套条件
- **THEN** 支持 `角色 AND 服装 AND 场景 AND 集数` 组合
- **AND** 实时显示匹配镜头数 + 缩略图浮窗

### Requirement: DAG 自动编排
系统 SHALL 自动推导修改任务依赖关系，按规范顺序执行。

#### Scenario: 规范顺序
- **WHEN** 修改单含多类修改
- **THEN** DAG 推导：换脸 → 表情对齐 → 体型 → 服装 → 调色 → 横竖屏 → 字幕 → 导出

#### Scenario: 顺序违反警告
- **WHEN** 用户拖拽改变顺序违反规范
- **THEN** 黄色警告 + 强制二次确认

### Requirement: 7 种修改 pipeline
系统 SHALL 提供 7 种修改 pipeline，均使用可商用模型。

#### Scenario: 换脸 Lite
- **WHEN** 用户选 face_swap + 中景以上
- **THEN** 使用可商用替代品（SimSwap / Roop-Unleashed fork）+ GFPGAN
- **AND** 单部 45 分钟 ≤ 48 小时

#### Scenario: 换脸 Pro
- **WHEN** 用户选 face_swap + 含特写镜头
- **THEN** DeepFaceLab SAEHD 512/768 + LivePortrait + GFPGAN ensemble
- **AND** 14-21 天交付
- **AND** 特写一次过审 90-94%

#### Scenario: 横竖屏
- **WHEN** 用户选 aspect_ratio
- **THEN** 8 个平台版本一进多出
- **AND** 1 集 24 分钟 → 8 平台 ≤ 8 分钟

#### Scenario: 多语言
- **WHEN** 用户选 language_dub + 嘴型 + 字幕 + 屏显
- **THEN** 完整链 pipeline
- **AND** 单集 45 分钟 → 单语种 ≤ 25 分钟（不含译审）

#### Scenario: 体型替换
- **WHEN** 用户选 body_reshape
- **THEN** 仅静态 / 半身镜头
- **AND** UI 拒绝快速运动镜头（光流 > 12 px/frame）

#### Scenario: 服装替换
- **WHEN** 用户选 wardrobe
- **THEN** IDM-VTON + SAM2 + Wan-Animate 传播
- **AND** 颜色 95% 容忍度，款式 60%

#### Scenario: 风格化重生成
- **WHEN** 用户选 stylization
- **THEN** UI 文案标"概念演示"（信息提示）
- **AND** `conceptOnly: true`，单次输出 ≤ 5 分钟

### Requirement: 物料版本树
系统 SHALL 维护每个 sourceMedia 的版本派生关系。

#### Scenario: 派生
- **WHEN** ModificationPlan 执行完成
- **THEN** 产出新 SourceMedia 带 `parent_id` + `derived_from_plan_id`

#### Scenario: 版本对比
- **WHEN** 用户对比 v1 / v2
- **THEN** 双视频同步播放 + 差异热力图

#### Scenario: 回滚
- **WHEN** 用户回滚旧版本
- **THEN** 二次确认 + 可选"保留为分支"

### Requirement: 任务进度反馈
系统 SHALL 提供 `<RenderQueue>` 抽屉。

#### Scenario: 长任务进度
- **WHEN** 单 stage 超过 60s
- **THEN** 每 5 秒推送 progress
- **AND** 显示当前阶段（如"硬件解码 38%"）

#### Scenario: 中间结果预览
- **WHEN** 长任务每完成 5 分钟成片
- **THEN** `<RollingPreview>` 缩略图条
- **AND** 点击可播 5s 片段

#### Scenario: 失败重试
- **WHEN** 单 stage 失败
- **THEN** 自动重试 1 次 / 用户手动重试
- **AND** 提供"切换 provider"选项
- **AND** 单镜头失败不阻塞其他

## 已删除 Requirements（相比 R4 早期版本）

- ~~输出强制嵌入 C2PA 双标识~~（客户决定是否嵌入）
- ~~人工 QC 强制完成才能导出~~（客户决定是否启用强制 QC）
- ~~`<ExportComplianceGate>` 4 步合规闸门~~（删除整个 gate）
- ~~客户合同 8 条硬条款绑定~~（合同客户自签）
