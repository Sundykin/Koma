# Spec: recreation-workflow

## ADDED Requirements

### Requirement: 预告片自动生产线
系统 SHALL 提供从成片导入到 30s/60s/90s 多版本派生的端到端预告片工作流，全程可被影视后期组日常排产使用。

#### Scenario: 导入成片后自动拆条 + 选段建议
- **WHEN** 用户导入一部 24 分钟剧集成片
- **THEN** 后台启动 `video-shotsplit` task 拆出镜头序列
- **AND** 每个 ShotSegment 通过视觉理解 provider 打 tag（动作 / 情绪 / 角色）
- **AND** 用户在现有 storyboard 视图看到自动选段结果与节奏分析侧边面板

#### Scenario: 30/60/90 三个时长一键派生
- **WHEN** 用户在已选段基础上点击"生成三版"
- **THEN** 系统按同一 CutPlan 模板派生 30s/60s/90s 三个时长版本
- **AND** 每个版本生成一个 MaterialPackage（status='draft'）
- **AND** 用户可在现有 timeline 精修任一版本

#### Scenario: 完整流程 SLA
- **WHEN** 从导入到产出首版候选
- **THEN** 24 分钟剧集 ≤ 10 分钟（含拆条 + 选段 + 派生）
- **AND** 3 部样片盲测满意度 ≥ 70%

### Requirement: 多平台横竖屏适配线
系统 SHALL 支持从单条横屏成片一键派生 8 个主流平台版本，每个版本符合该平台的分辨率/码率/时长/LUFS 规格。

#### Scenario: ReleaseSpec 矩阵预置
- **WHEN** 系统启动
- **THEN** 加载 8 个主流平台预置 ReleaseSpec（抖音 / 快手 / 小红书 / B站 / 视频号 / Twitter / YT Shorts / TikTok）
- **AND** 用户可在 AspectAdaptStudio UI 查看每个 spec 的详细参数

#### Scenario: 一键派生 8 平台版本
- **WHEN** 用户在某条横屏成片上点击"一键派生"
- **THEN** 系统 fan-out 8 个并行 task
- **AND** 每个 task 执行：主体跟随 reframe → 字幕重排 → loudnorm → 编码
- **AND** 任一平台失败可单独重试，其他平台不受影响

#### Scenario: 主体跟随准确率
- **WHEN** 横屏 16:9 成片转 9:16 竖版
- **THEN** 主体（人脸/人体）在画面内的比例时长 ≥ 90%
- **AND** 跟随框抖动 ≤ 5px/帧

#### Scenario: 平台 LUFS 自动适配
- **WHEN** 派生 YouTube Shorts 版本
- **THEN** 音轨 loudnorm 目标 −14 LUFS
- **WHEN** 派生抖音版本
- **THEN** 音轨 loudnorm 目标 −16 LUFS

### Requirement: 多语言本地化生产线
系统 SHALL 提供从单语成片到多语种本地化（dub + 嘴型对齐 + 字幕 + 屏显文字）的端到端工作流。

#### Scenario: 人声 BGM 分离
- **WHEN** 用户启动本地化任务
- **THEN** 系统执行 `audio-source-separation`，输出三轨：人声 / BGM / SFX
- **AND** 人声轨进入 ASR + dub 流程
- **AND** BGM / SFX 保留以便后续重新混合

#### Scenario: 人工译审必经流程
- **WHEN** ASR 出原文 + LLM 出译文后
- **THEN** UI 显示双栏编辑器（原文 × 译文，时码对齐）
- **AND** 系统**不允许跳过人工译审**直接进入 dub 渲染
- **AND** 用户在每段标记"已审"后才能继续

#### Scenario: 嘴型对齐
- **WHEN** dub 配音完成
- **THEN** 系统调 `align` provider（Sync.so 主选 / HeyGen 备用）
- **AND** 输出对齐后的视频
- **AND** UI 提供 before/after 切换预览

#### Scenario: 屏显文字本地化
- **WHEN** 用户启用屏显本地化
- **THEN** 系统执行 `onscreen-text-detect`（PaddleOCR）扫描所有屏显文字
- **AND** 用户在 UI 标记需要本地化的文字
- **AND** 系统执行 `onscreen-text-inpaint`（lama-cleaner）抹除原文 + ffmpeg overlay 合成译文

#### Scenario: 完整链 SLA
- **WHEN** 一集 45 分钟 → 单语种完整链
- **THEN** 处理时长 ≤ 25 分钟（不含人工译审）
- **AND** 盲测 AI 配音 + 嘴型对齐质量 ≥ HeyGen / Deepdub baseline

### Requirement: 物料 ticket 状态机
系统 SHALL 为每个生产物料维护状态机（草稿 / 制作中 / 初审 / 终审 / 已交付），记录责任人和 deadline。

#### Scenario: 状态流转
- **WHEN** 生产线创建一个新物料
- **THEN** 初始 status='draft'
- **WHEN** 用户提交"完成制作"
- **THEN** status 流转到 'first-review'
- **WHEN** 客户标记"通过"
- **THEN** 流转到 'final-review' → 'delivered'

#### Scenario: 跨场景物料聚合
- **WHEN** 用户切换到物料看板
- **THEN** 系统列出当前项目所有 MaterialPackage
- **AND** 可按场景 / 状态 / deadline / 负责人筛选

## MODIFIED Requirements

### Requirement: 项目导出/导入扩展
项目导出 SHALL 包含所有 SourceMedia / MaterialPackage / LocaleTrack 数据，不含原片二进制（仅含路径引用 + 签名）。

#### Scenario: 导出项目
- **WHEN** 用户导出项目
- **THEN** 输出 zip 包含：现有 project.json + materials.json + locales.json + audit.jsonl
- **AND** **不打包**原片二进制（影视母带 GB-TB 级，由客户单独存储）
- **AND** 每条 SourceMedia 包含 SHA512 + ed25519 签名

#### Scenario: 导入项目到另一台机器
- **WHEN** 用户在另一台机器导入项目 zip
- **THEN** 系统提示用户挂载对应母带目录
- **AND** 自动验证每条 SourceMedia 的签名 + SHA512
- **AND** 签名不匹配时拒绝导入 + 详细错误
