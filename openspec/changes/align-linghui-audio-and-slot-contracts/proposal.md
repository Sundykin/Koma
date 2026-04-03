## Why

`docs/linghui-architecture-analysis.md` 中有两类剩余问题会持续误导用户：

- text / audio / script 节点都暴露了图片输入槽位，但执行层从不消费这些图片数据，用户可以连线却得不到任何效果
- 音频节点虽然已经依赖 TTS provider 的 `voiceId`，但灵绘节点属性和编辑器都没有把这个能力暴露出来，用户只能被动使用默认音色

这两类问题都属于“节点契约展示出来了，但没有真正闭环”的情况，修复后能直接降低误导和无效操作。

## What Changes

- 收紧灵绘连接校验，阻止图片结果连接到 text / audio / script 节点那些不会被执行层消费的无效输入槽位
- 为音频节点新增 `voiceId` 属性，并在音频节点编辑器中提供可选音色列表
- 让音频节点执行与 TTS provider 调用优先使用用户显式选择的 `voiceId`
- 补充节点连接校验与音频执行测试

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 调整节点连接契约与音频节点配置能力，避免无效图片连线并支持显式选择 TTS 音色

## Impact

- Affected specs: `linghui-studio`
- Affected code:
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.ts`
  - `frontend/src/components/linghui/AudioNodeEditor.tsx`
  - `frontend/src/components/linghui/linghuiExecutionNodeExecutors.ts`
  - `frontend/src/components/linghui/linghuiExecutionProviders.ts`
  - `frontend/src/components/linghui/linghuiExecutionProviders.test.ts`
  - `frontend/src/components/linghui/linghuiNodeDefs.test.ts`
  - `frontend/src/components/linghui/linghuiExecutionAudioNode.test.ts`
