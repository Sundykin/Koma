# model-providers (delta)

## ADDED Requirements

### Requirement: Provider/Channel Prompt Compilation
系统 SHALL 在调用媒体生成 Provider 前提供可插拔的提示词编译步骤（prompt compilation）。

#### Scenario: 仅对显式启用的渠道执行编译
- **GIVEN** 当前使用的 TTI/ITV 配置来自 `channelConfig`
- **AND** `channelConfig.providerConfig` 声明启用某种 prompt protocol（例如 `grok-image-index`）
- **WHEN** 系统准备向 Provider 发起 start 请求
- **THEN** 系统 MUST 先执行对应 protocol 的编译逻辑
- **AND** 未启用 protocol 的渠道 SHALL 不受影响（直接发送原始 prompt）

### Requirement: Grok Image-Index Protocol (TTI/ITV)
系统 SHALL 支持 Grok 渠道的 `@imageN` 引用协议，将资产 mention 编译为顺序引用并对齐参考图数组。

#### Scenario: TTI Grok 编译将资产 mentions 映射到 @imageN
- **GIVEN** 分镜已选择的资产顺序为数组（characters → scenes → props）
- **WHEN** 提示词中出现 `@char_*` / `@scene_*` / `@prop_*`
- **THEN** 系统 MUST 将这些 mention 替换为 `@imageN`（N 从 1 开始，对应资产在数组中的位置）
- **AND** 系统 MUST 生成与 `@imageN` 对齐的参考图数组，按同一顺序发送到 TTI 渠道

#### Scenario: ITV Grok 编译优先插入 primary image 作为 @image1
- **GIVEN** 图生视频请求包含 primary image（分镜上一阶段生成的分镜图片）
- **WHEN** 执行 Grok 编译
- **THEN** 系统 MUST 将 primary image 作为第一张参考图并可在 prompt 中引用为 `@image1`
- **AND** 其余资产参考图 MUST 从 `@image2` 起按分镜资产顺序排列并发送到 ITV 渠道

