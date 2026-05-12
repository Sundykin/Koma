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

### Requirement: 可商用模型许可
所有用于解析的模型 SHALL 为可商用许可（Apache / MIT / 自训），不使用 InsightFace 商业授权权重。

#### Scenario: 人物识别 embedding
- **WHEN** 系统执行人物聚类
- **THEN** 使用 AuraFace 或 buffalo_l Apache fork 等可商用 ArcFace 替代
- **AND** **不**使用 InsightFace 商业 ArcFace 权重

#### Scenario: 服装识别
- **WHEN** 系统执行服装识别
- **THEN** 使用 RT-DETR-L（Apache）+ OpenCLIP（Apache）
- **AND** **不**使用 YOLOv8（AGPL）

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
