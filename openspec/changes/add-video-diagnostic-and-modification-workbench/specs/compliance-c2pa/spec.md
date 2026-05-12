# Spec: compliance-c2pa（强制合规层）

## ADDED Requirements

### Requirement: C2PA 三层标识强制嵌入
系统 SHALL 在所有修改输出嵌入三层标识，UI 不可关闭。

#### Scenario: 显式水印
- **WHEN** 任意修改成片导出
- **THEN** 必嵌入：
  - 右下角动态水印 "AI 合成" + 6 位任务码（72pt 黑体 80% 不透明白底）
  - 片头 1.5 秒白板 "本视频含 AI 生成合成内容"
  - 字幕轨独立 "AI 合成内容（Koma 任务 #xxx）"

#### Scenario: 隐式 C2PA Manifest
- **WHEN** 成片导出
- **THEN** c2patool 写 BMFF uuid box
- **AND** manifest 字段：claim_generator / actions / ingredients / signing_cert / modelChain

#### Scenario: 频域水印兜底
- **WHEN** 成片导出
- **THEN** DCT 频域在 Y 通道嵌入 64-bit fingerprint（客户 ID + 任务 ID）
- **AND** 抗 H.264 二压缩 + 抗 30% 裁剪

#### Scenario: UI 不可关闭
- **WHEN** 启用 enterprise profile
- **THEN** "关闭水印"按钮 disabled + 提示"企业策略锁定"
- **AND** ffmpeg 命令构建写死

### Requirement: 客户 KYC + 名单审核
系统 SHALL 对所有修改功能强制 KYC 与素材审核。

#### Scenario: 企业资质校验
- **WHEN** 客户申请开通修改功能
- **THEN** 必须提交：营业执照 + 法人身份证 + 广电制作经营许可证 + 影视项目备案号
- **AND** 自然人客户拒绝

#### Scenario: 名单库审核
- **WHEN** 上传脸库 / 角色 LoRA refMedia
- **THEN** 阿里云内容安全 + 自建名单库比对
- **AND** 匹配则拒绝 + 冷却 24 小时

#### Scenario: 名单每周同步
- **WHEN** 每周一 03:00
- **THEN** 自动抓取人民日报 / 网信办 / 中演协 名单 + 更新 embedding 库

#### Scenario: 未成年人检测
- **WHEN** 上传含人脸素材
- **THEN** 阿里云人脸属性年龄估值 < 20 → 拒绝

### Requirement: 操作审计哈希链
系统 SHALL 对所有修改操作 append-only 审计 + ed25519 签名 + 链式 SHA-256，保留 5 年。

#### Scenario: 审计事件
- **WHEN** 任意修改操作（pipeline.start / provider.call / face.swap.render / export.sign / destruction.complete）
- **THEN** 写入 AuditEvent
- **AND** payload 不写敏感内容明文（仅 sha256 哈希）

#### Scenario: 链式防篡改
- **WHEN** 新 AuditEvent 写入
- **THEN** hash = SHA-256(canonical JSON 去 hash + signature)
- **AND** prevHash 指向上一条

#### Scenario: 客户导出审计
- **WHEN** 客户审计部门导出
- **THEN** 提供独立验证工具（JSONL + 公钥验证 + 链式校验）

#### Scenario: 保留期
- **WHEN** AuditEvent 写入
- **THEN** 保留 ≥ 5 年 + 100MB 滚动 + 压缩

### Requirement: 30 天销毁
系统 SHALL 在项目交付 30 天后自动销毁脸库 / LoRA / 中间模型。

#### Scenario: 销毁 worker
- **WHEN** 项目 status='delivered' 满 30 天
- **THEN** 销毁 FaceIdentity / LoRAModel / 中间产物
- **AND** 使用 NIST 800-88 标准（覆盖 3 次 + verify）

#### Scenario: 销毁回执
- **WHEN** 销毁完成
- **THEN** 生成回执（filePath / sha256BeforeDestroy / destroyedAt / signerCert）
- **AND** ed25519 签名 + 联盟链上链

#### Scenario: 第三方公证
- **WHEN** 客户要求
- **THEN** 第三方公证 5000 元/次

### Requirement: 客户合同 8 条硬条款
系统 SHALL 强制所有修改功能客户合同含 8 条硬条款。

#### Scenario: 8 条必签
- **WHEN** 客户签约
- **THEN** 合同必含：
  1. 客户资质（广电许可证 + KYC + 项目备案号）
  2. 素材合法性兜底（书面承诺已授权）
  3. 使用范围限制（仅本项目本艺人）
  4. 标识不可拆除（删水印视为违法）
  5. 审计配合（监管要求无需通知客户）
  6. 赔偿上限（服务费 × 100%）
  7. 保险代位（客户购影视责任险 ≥ 500 万）
  8. 30 天销毁 + 公证

#### Scenario: 缺条款拒接
- **WHEN** 客户合同缺任意一条
- **THEN** 系统拒绝开通修改功能

### Requirement: 算法备案
Koma SHALL 在 beian.cac.gov.cn 完成算法备案 + 网站公示。

#### Scenario: 备案启动
- **WHEN** Koma 决定上线修改功能
- **THEN** M0 day 1 提交算法自评估报告

#### Scenario: 备案公示
- **WHEN** 备案通过
- **THEN** 备案号公示在 koma.cn 首页 + 关于页 + 软件元数据

### Requirement: SPV 风险隔离
公司 SHALL 将修改业务（换脸 / 体型 / 服装 / IP 迁移）剥离 SPV（Koma Vision Ltd.），主公司持 IP 授权。

#### Scenario: SPV 接单
- **WHEN** 客户签约修改业务
- **THEN** 合同主体为 Koma Vision Ltd.
- **AND** 主公司收技术许可费

#### Scenario: 最坏情况
- **WHEN** SPV 监管约谈 / 处罚 > 净资产 30%
- **THEN** SPV 启动清算 + 主公司仅承担注册资本损失
- **AND** 团队以 Koma2 重组（仅保留诊断报告 + 横竖屏 + 多语言）

### Requirement: 媒体公关预案 + 最坏情况
系统 SHALL 维护 3 套媒体公关模板 + T+0/T+1 周/T+1 月/T+3 月 退路预案。

#### Scenario: T+0 立即响应
- **WHEN** 监管约谈
- **THEN** 立即下线修改功能 + 法人 24 小时内主动赴网信办说明

#### Scenario: T+3 月清算
- **WHEN** 仍无法挽回
- **THEN** SPV 清算 + 原团队 Koma2 重组（合规风险等级 -2）
