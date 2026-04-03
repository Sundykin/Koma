## 1. Result Contract

- [x] 1.1 将 `LinghuiNodeResult` 重构为按 `kind` 判别的联合类型
- [x] 1.2 为结果访问补充统一 helper，收敛 primary/text/items/shots 的读取方式

## 2. Producer And Consumer Migration

- [x] 2.1 更新静态结果解析、节点执行器与图片集合逻辑，确保新结果契约成立
- [x] 2.2 更新预览、编辑器、提示词引用、导出与存储路径以适配新联合类型

## 3. Validation

- [x] 3.1 补充类型与执行层测试，覆盖关键 result 形态和 helper 行为
- [x] 3.2 运行目标 `vitest` 用例确认本轮改动通过
