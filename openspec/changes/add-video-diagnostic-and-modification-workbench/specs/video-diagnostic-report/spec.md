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

### Requirement: 报告独立产品定价
系统 SHALL 支持诊断报告作为独立 SaaS 产品销售，客户不必购买修改服务即可获得完整报告。

#### Scenario: 单部定价
- **WHEN** 客户购买单部报告
- **THEN** 按视频时长计费（¥99-299 / 45 分钟）

#### Scenario: 企业年订阅
- **WHEN** 客户购买企业版
- **THEN** ¥30 万/年不限片量 + 跨剧检索 + 私有部署

#### Scenario: 试用报告
- **WHEN** 试用客户上传 ≤ 5 分钟视频
- **THEN** 免费完整 12 维度报告
- **AND** 上传 > 5 分钟时仅免费出 meta + scenes + shots 三类

### Requirement: 报告导出格式
系统 SHALL 支持 4 种导出格式。

#### Scenario: 4 种导出
- **WHEN** 用户导出报告
- **THEN** 可选：JSON（完整数据）/ Excel（12 sheets）/ Web 可视化（带水印分享链接）/ PDF（统计高亮 + 风险提示）

### Requirement: 跨剧检索（企业版护城河）
企业版 SHALL 支持跨项目向量库检索。

#### Scenario: 演员跨剧搜索
- **WHEN** 用户查询 "演员 X 的所有镜头"
- **THEN** 系统跨所有项目向量库执行 ArcFace embedding 相似度搜索
- **AND** 返回 时码 + 项目 + 集数 + 缩略图

#### Scenario: 多条件嵌套检索
- **WHEN** 用户查询 `cast="P-001" AND wardrobe.color="red" AND shot_size IN (close_up, medium)`
- **THEN** 返回所有命中镜头列表

#### Scenario: 隐私保护
- **WHEN** 涉及 `confidential=true` 的 FaceIdentity
- **THEN** 拒绝查询，要求企业管理员授权

### Requirement: 报告完整性签名
所有 DiagnosticReport SHALL 用 ed25519 私钥签名，第三方可验证完整性。

#### Scenario: 签名嵌入
- **WHEN** 报告生成完成
- **THEN** `signature` 字段填入 `{ algo: 'ed25519', key: publicKey, sig: base64 }`
- **AND** 签名内容 = canonical JSON 除 signature 字段外的全部内容

#### Scenario: 第三方验证
- **WHEN** 客户审计部门收到报告
- **THEN** 提供独立验证工具，无需 Koma 后端即可校验

### Requirement: 解析准确率目标
系统 SHALL 在工业可达范围内追求 12 维度联合准确率 80-85%（非 95%）。

#### Scenario: 单维度准确率
- **WHEN** 系统输出某维度结果
- **THEN** 必标明 model_id + model_version + confidence
- **AND** 人物聚类 ≥ 95%、镜头分割 ≥ 90%、ASR ≥ 92%、OCR ≥ 90%、服装识别 ≥ 80%

#### Scenario: 人工校对接口
- **WHEN** 客户在报告浏览界面发现错误
- **THEN** 提供"修正此项"按钮
- **AND** 修正记录到 audit log
- **AND** 不允许批量修正（防滥用）
