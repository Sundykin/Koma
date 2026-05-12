# Spec: compliance-c2pa（强制合规层）

## ADDED Requirements

### Requirement: C2PA 双标识强制嵌入
系统 SHALL 在所有换脸 / 体型 / 服装 / IP 迁移生成的成片输出中强制嵌入 C2PA 双标识（显式 + 隐式），UI 无法关闭。

#### Scenario: 显式水印
- **WHEN** 任意 S4/S5/S6/S7 成片导出
- **THEN** 必嵌入：
  - 成片右下角动态水印 "AI 合成" + 6 位任务码（72pt 黑体，80% 不透明白底，每秒采样 ≥ 1 帧）
  - 片头 1.5 秒全屏白板黑字 "本视频含 AI 生成合成内容"
  - 字幕轨独立写一条 "AI 合成内容（Koma 任务 #xxx）"
- **AND** UI 上"关闭水印"按钮不存在（写死）

#### Scenario: 隐式标识 C2PA Manifest
- **WHEN** 成片导出
- **THEN** 调用 c2patool 写入 BMFF uuid box
- **AND** manifest 字段包含：`claim_generator='Koma/<version>'`、`assertions.c2pa.actions=[c2pa.edited, c2pa.opened, c2pa.ai_generated]`、`ingredients=[原片sha256]`、`signing_cert=Koma 颁发的客户子证书`、`modelChain=[每段模型 ID + sha256 + 参数]`

#### Scenario: 频域水印兜底
- **WHEN** 成片导出
- **THEN** 使用 DCT 频域算法在 Y 通道 mid-frequency 嵌入 64-bit fingerprint（含客户 ID + 任务 ID）
- **AND** 抗 H.264 二压缩 + 抗 30% 裁剪

#### Scenario: 平台检测对接
- **WHEN** 用户向抖音 / B 站 / 视频号 / 爱优腾上传成片
- **THEN** 平台自动读取 C2PA Manifest
- **AND** Koma 输出的成片在 AIGC 通道直接通过审核（不被平台补打水印）

### Requirement: 名人脸 + 政治敏感 + 未成年人审核
系统 SHALL 在所有换脸 / 体型 / IP 迁移任务的输入素材（脸库 / 角色库）上传时强制审核。

#### Scenario: 名人脸库审核
- **WHEN** 用户上传 FaceIdentity refMedia
- **THEN** 调用阿里云内容安全人脸识别 API（误识率 1/100000）
- **AND** 与自建名单库比对：央政治局名单 + 国务院组成人员 + 已封艺人 + 港澳台敏感名单
- **AND** 匹配则拒绝上传 + 冷却该账号 24 小时

#### Scenario: 未成年人脸检测
- **WHEN** 上传素材含人脸
- **THEN** 阿里云人脸属性检测年龄
- **AND** 年龄估值 < 20 直接拒绝（10% buffer）

#### Scenario: 名单库每周同步
- **WHEN** 每周一 03:00
- **THEN** 系统自动抓取：人民日报系国家机关页面 + 网信办通报 + 中演协自律名单
- **AND** 更新名单库 embedding

#### Scenario: 政治敏感人物
- **WHEN** 系统检测到匹配政治敏感人物名单
- **THEN** 立即拒绝任务 + 记录到 audit log + 通知合规团队人工 review

### Requirement: 客户 KYC
系统 SHALL 对所有开启换脸 / 体型 / 服装 / IP 迁移功能的客户强制 KYC。

#### Scenario: 企业资质校验
- **WHEN** 客户申请开通 S4-S7 功能
- **THEN** 必须提交：营业执照 + 法人身份证 + 《广播电视节目制作经营许可证》或省级广电备案 + 影视项目备案号
- **AND** 自然人客户一律拒绝
- **AND** 资质未通过前功能不可见

#### Scenario: 备案号校验
- **WHEN** 项目立项
- **THEN** 系统调用广电备案查询接口校验"重点网络影视剧拍摄制作备案号"
- **AND** 未备案的项目不能开启 S4-S7

### Requirement: 操作审计哈希链
系统 SHALL 对所有 S4-S7 任务的操作记录到 append-only 审计日志，每条 ed25519 签名 + 链式 SHA-256 防篡改，保留 5 年。

#### Scenario: 审计事件
- **WHEN** 任意 S4-S7 操作触发（pipeline.start / provider.call / face.swap.render / export.sign / destruction.complete）
- **THEN** 写入 AuditEvent 记录：`ts / orgId / userId / projectId / taskId / action / payload / hostFingerprint / prevHash / hash / signature`
- **AND** payload 不写敏感内容明文（仅 sha256 哈希）

#### Scenario: 链式防篡改
- **WHEN** 新 AuditEvent 写入
- **THEN** hash = SHA-256(canonicalJson(event without hash + signature))
- **AND** prevHash 指向上一条
- **AND** 任何中间节点篡改可被一键检测

#### Scenario: 客户审计导出
- **WHEN** 客户审计部门需要导出日志
- **THEN** Koma 提供导出工具（JSONL + ed25519 验证 + prevHash 校验）
- **AND** 工具可独立运行（不依赖 Koma 后端）

#### Scenario: 保留期
- **WHEN** AuditEvent 写入
- **THEN** 保留 ≥ 5 年（覆盖民事追诉时效 3 年 + 行政追诉时效 5 年）
- **AND** 单文件 ≥ 100MB 滚动 + 压缩

### Requirement: 30 天销毁
系统 SHALL 在项目交付 30 天后自动销毁所有客户脸库 / LoRA / 中间模型，并出具销毁审计报告。

#### Scenario: 销毁 worker
- **WHEN** 项目 status='delivered' 满 30 天
- **THEN** 后台 worker 自动销毁：FaceIdentity.embeddingVectorPath / FaceIdentity.dflModelPath / LoRAModel.modelPath
- **AND** 销毁过程使用 NIST 800-88 标准（覆盖写 3 次 + verify）

#### Scenario: 销毁回执
- **WHEN** 销毁完成
- **THEN** 系统生成销毁回执：`{ filePath, sha256BeforeDestroy, destroyedAt, signerCert }`
- **AND** 回执 ed25519 签名
- **AND** 上链到联盟链（阿里联盟链 / 蚂蚁链可选）

#### Scenario: 第三方公证
- **WHEN** 客户要求第三方公证
- **THEN** Koma 提供公证流程（5000 元/次）
- **AND** 公证报告与销毁回执绑定

### Requirement: 客户合同 8 条硬条款
系统 SHALL 强制要求所有 S4-S7 客户合同包含 8 条硬条款，未签则功能不可开通。

#### Scenario: 8 条合同必签
- **WHEN** 客户签约 S4-S7
- **THEN** 合同必含：
  1. **客户资质**：广电制作经营许可证 + 法人 KYC + 影视项目备案号
  2. **素材合法性兜底**：客户书面承诺所有素材已获本人或权利人书面授权
  3. **使用范围限制**：仅本项目本艺人，跨项目复用违约金 ≥ 合同金额 100%
  4. **标识不可拆除**：删水印视为客户主动违法，Koma 单方面解约
  5. **审计配合**：监管要求时无需通知客户即提交日志
  6. **赔偿上限**：Koma 责任上限 = 服务费 × 100%
  7. **保险代位**：客户购影视责任险 ≥ 500 万，Koma 列附加被保险人
  8. **数据销毁**：30 天销毁 + 第三方公证（可选）

#### Scenario: 缺条款拒绝开通
- **WHEN** 客户合同缺任意一条
- **THEN** 系统拒绝开通 S4-S7 功能
- **AND** UI 显示具体缺项

### Requirement: 算法备案
Koma 作为深度合成"技术支持者"SHALL 在 `beian.cac.gov.cn` 完成算法备案，并在网站显著位置公示备案号。

#### Scenario: 备案启动
- **WHEN** Koma 决定上线 S4-S7
- **THEN** 提交《算法自评估报告》到网信办
- **AND** 初审周期 10 工作日

#### Scenario: 备案通过
- **WHEN** 算法备案最终通过
- **THEN** 备案号公示在 koma.cn 首页 + 客户端关于页 + 软件包元数据
- **AND** S4-S7 功能正式开通

#### Scenario: 备案变更
- **WHEN** 算法重大升级（模型替换 / 流程变更）
- **THEN** 30 日内提交备案变更
- **AND** 期间维持原备案号

### Requirement: SPV 风险隔离
公司 SHALL 将高风险业务（S4 主演换脸 / S5 体型 / S6 / S7）剥离至独立 SPV（Koma Vision Ltd.），主公司持有核心 IP 授权。

#### Scenario: SPV 隔离
- **WHEN** 客户签约 S4-S7
- **THEN** 合同主体为 Koma Vision Ltd.（SPV）
- **AND** 服务输出由 SPV 提供
- **AND** 主公司（Koma Studio）持有模型授权 + 收取技术许可费

#### Scenario: 最坏情况隔离
- **WHEN** SPV 被列入网信办黑名单 / 被广电点名 / 行政处罚 > SPV 净资产 30%
- **THEN** SPV 启动清算
- **AND** 主公司仅承担 SPV 注册资本损失
- **AND** 团队以新主体 Koma2 重组，仅保留 S1-S3 + 风格化业务

### Requirement: 媒体公关预案
系统 SHALL 维护 3 套媒体公关应答模板，法务 + PR 顾问预先签字。

#### Scenario: 模板 A 被指控滥用
- **WHEN** 媒体爆料"客户用 Koma 工具做违规内容"
- **THEN** 72 小时内出具技术声明 + 操作日志摘要 + 客户合同摘要
- **AND** 明确"Koma 仅技术服务、客户提供素材并书面承诺授权"

#### Scenario: 模板 B 被指控产生违法内容
- **WHEN** 监管认定 Koma 输出违法
- **THEN** 立即下线相关功能 24 小时
- **AND** 主动报网信办
- **AND** 出具内部审计报告

#### Scenario: 模板 C 员工内鬼
- **WHEN** 发现内部员工滥用工具
- **THEN** 立即解除劳动合同
- **AND** 公开切割 + 协助警方追诉

### Requirement: 最坏情况预案
公司 SHALL 维护 T+0 / T+1周 / T+1月 / T+3月 四档退路预案。

#### Scenario: T+0 立即响应
- **WHEN** SPV 被监管约谈
- **THEN** 立即下线 S4-S7（仅保留 S1-S3 + 风格化）
- **AND** 法人 24 小时内主动赴网信办说明

#### Scenario: T+1 周技术整改
- **WHEN** T+0 处理后 1 周内
- **THEN** 发布技术整改报告
- **AND** 公开赔偿方案
- **AND** 引入第三方审计（普华 / 安永）

#### Scenario: T+1 月业务剥离
- **WHEN** T+1 周仍无法挽回
- **THEN** 评估业务剥离至独立子 SPV
- **AND** 保护主公司核心资产

#### Scenario: T+3 月清算 + 重组
- **WHEN** SPV 仍无法挽回
- **THEN** 启动清算
- **AND** 原团队以新主体 Koma2 重组
- **AND** 仅保留 S1-S3 + 风格化预览业务（合规风险等级 -2）
