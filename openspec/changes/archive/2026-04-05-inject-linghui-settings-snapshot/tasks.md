## 1. Execution Context

- [x] 1.1 为灵绘执行上下文和节点视图增加可选 `settingsSnapshot`
- [x] 1.2 在灵绘页面启动执行前捕获并冻结 settings snapshot

## 2. Provider Resolution

- [x] 2.1 将 `settingsSnapshot` 从节点执行器透传到文本、图片、视频、音频 provider helper
- [x] 2.2 更新灵绘 provider helper 与项目级 provider factory，优先使用注入的 settings snapshot

## 3. Validation

- [x] 3.1 补充 provider 测试，覆盖 snapshot 解析路径和无 snapshot 回退路径
- [x] 3.2 补充执行层测试，覆盖执行上下文向 provider helper 透传 snapshot
- [x] 3.3 运行目标 `vitest` 用例确认本轮修改通过
