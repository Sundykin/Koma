# Spec: video-diagnostic-report（视频诊断报告，独立产品）

## ADDED Requirements

### Requirement: 12 维度独立解析
系统 SHALL 提供 12 个独立维度的视频解析能力，每维度可单独勾选执行，输出统一 DiagnosticReport JSON。

#### Scenario: 维度按需勾选
- **WHEN** 用户上传视频
- **THEN** UI 显示 12 维度勾选框 + 预估时长 + 预估配额
- **AND** 基础层（镜头切分 / 关键帧 / 色彩光照）必选
- **AND** 其他维度可选勾

#### Scenario: 并行执行
- **WHEN** 用户勾选多个维度
- **THEN** 系统按 DAG 编排（A/B/C/D/H/I 并行 → E/F/G 第二波 → J/K 末段）
- **AND** 每维度独立失败不阻塞其他

#### Scenario: 增量解析
- **WHEN** 已有报告 + 用户后续追加新维度
- **THEN** 系统复用已有 ffmpeg cache + shot table，仅跑新维度

### Requirement: 12 维度全部通过 koma-cloud 调用 new-api
系统 SHALL 把所有需 AI 推理的维度委托给 `electron/service/koma-cloud/` + `llmProviderRegistry["koma-cloud"]`。客户端**不持有任何模型选型决策**，具体上游模型由 new-api 服务端决定。

#### Scenario: 客户端调用路径
- **WHEN** 任一维度执行
- **THEN** 走 `LLMQueryService.query({ modelProvider: 'koma-cloud', modelName: <虚拟模型名> })`
- **AND** 虚拟模型名由 Koma 维护（如 `koma-vlm-scene` / `koma-asr` / `koma-ocr`）
- **AND** 客户端不感知具体上游模型

#### Scenario: 服务端 license 黑名单
- **WHEN** new-api 接入上游
- **THEN** 服务端禁止使用：F5-TTS / IndexTTS 2 / Spark-TTS / SimSwap / Wav2Lip / InSwapper-128 商业权重 / InsightFace ArcFace 商用权重 / YOLOv8（AGPL）等非商用许可的模型权重
- **AND** 此约束在 new-api change 范围，本 change 仅记录

#### Scenario: 客户端本地维度
- **WHEN** 维度 1（元数据）/ 8（光照）/ 11（风险）/ 12（可行性）执行
- **THEN** 客户端本地完成，**不调用** new-api
- **AND** 维度 1 走 ffprobe，维度 8 走 OpenCV 启发式，维度 11/12 走规则引擎

### Requirement: 报告独立产品定价
系统 SHALL 支持诊断报告作为独立 SaaS 产品销售。

#### Scenario: 单部定价
- **WHEN** 客户购买单部报告
- **THEN** 按视频时长计费（参考 ¥99-299 / 45 分钟，最终定价客户定）

#### Scenario: 企业年订阅
- **WHEN** 客户购买企业版
- **THEN** 不限片量 + 跨剧检索 + 私有部署

#### Scenario: 试用免费
- **WHEN** 试用客户上传 ≤ 5 分钟视频
- **THEN** 免费完整 12 维度报告

### Requirement: 报告导出格式
系统 SHALL 支持 4 种导出格式。

#### Scenario: 4 种导出
- **WHEN** 用户导出报告
- **THEN** 可选：JSON（完整数据）/ Excel（12 sheets）/ Web 可视化（带防盗水印）/ PDF（统计高亮）

### Requirement: 跨剧检索
企业版 SHALL 支持跨项目向量库检索。

#### Scenario: 演员跨剧搜索
- **WHEN** 用户查询"演员 X 的所有镜头"
- **THEN** 系统跨所有项目向量库执行 embedding 相似度搜索
- **AND** 返回时码 + 项目 + 集数 + 缩略图

#### Scenario: 多条件嵌套
- **WHEN** 查询 `cast="P-001" AND wardrobe.color="red" AND shot_size IN (close_up, medium)`
- **THEN** 返回命中镜头列表

### Requirement: 解析准确率目标
系统 SHALL 在工业可达范围内追求 12 维度联合准确率 80-85%。

#### Scenario: 单维度准确率
- **WHEN** 系统输出某维度结果
- **THEN** 必标明 model_id + model_version + confidence
- **AND** 人物聚类 ≥ 95% / 镜头分割 ≥ 90% / ASR ≥ 92% / OCR ≥ 90% / 服装识别 ≥ 80%

#### Scenario: 人工校对接口
- **WHEN** 客户在报告浏览界面发现错误
- **THEN** 提供"修正此项"按钮
- **AND** 修正不入审计日志（本版本不做审计）

## 已删除 Requirements（相比 R4 早期版本）

- ~~报告完整性 ed25519 签名~~（客户自负完整性校验）
- ~~跨剧检索的隐私保护强制~~（客户自管租户隔离）
