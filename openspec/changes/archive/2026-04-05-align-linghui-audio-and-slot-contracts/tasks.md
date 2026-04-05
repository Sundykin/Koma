## 1. Slot Contract Guardrails

- [x] 1.1 收紧灵绘连接校验，阻止图片结果连接到 text / audio / script 节点的无效图片槽位
- [x] 1.2 为无效连接返回明确错误信息，说明当前节点不会消费该图片输入

## 2. Audio Voice Selection

- [x] 2.1 为音频节点新增 `voiceId` 属性与默认值，并让执行层优先透传用户选择的音色
- [x] 2.2 更新 `AudioNodeEditor.tsx`，根据当前 TTS provider 动态加载并展示音色列表
- [x] 2.3 在音色列表为空或加载失败时保持可运行，并回退到 provider 默认音色

## 3. Validation

- [x] 3.1 补充节点连接校验测试，覆盖 text / audio / script 的无效图片连线
- [x] 3.2 补充音频执行测试，验证 `voiceId` 会透传到 TTS provider 调用
- [x] 3.3 运行目标 `vitest` 用例确认本轮修复通过
