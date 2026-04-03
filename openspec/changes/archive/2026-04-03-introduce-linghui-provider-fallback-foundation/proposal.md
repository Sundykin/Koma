## Why

灵绘当前一旦命中图片或视频 Provider 提交失败、轮询超时或配置失效，就会直接让整次节点执行失败。随着用户在同一媒体类别下配置多个渠道，这种“单 Provider 单点故障”已经成为 5.3.4 Provider 热插拔的主要缺口，尤其在长耗时视频任务上更明显。

## What Changes

- 为图片与视频执行链路引入 capability-aware 的 Provider fallback 计划，优先尝试当前选择，其次按配置顺序尝试同能力备选
- 为 fallback 引入有界尝试策略，避免在全部候选都异常时无限重试
- 在图片与视频 Provider 执行流程中接入自动切换，覆盖 Provider 不可用、提交失败和异步轮询失败/超时
- 将 Provider 尝试轨迹写入节点结果 metadata，并在最终失败时返回聚合后的尝试摘要
- 暂不覆盖文本/TTS，也暂不实现手动中途切换和参数降级 UI

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 灵绘图片与视频执行需要支持同能力 Provider 的自动 fallback，并在成功/失败时暴露尝试轨迹

## Impact

- Affected specs:
  - `linghui-studio`
- Affected code:
  - `frontend/src/components/linghui/linghuiExecutionProviders.ts`
  - `frontend/src/providers/channel/resolver.ts`
  - `frontend/src/components/linghui/` 下相关测试
