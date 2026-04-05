## 1. Store Foundation

- [x] 1.1 新增灵绘 canvas UI store，集中承载编辑选中、工具态、画布模式与 grid-split 状态
- [x] 1.2 将 `useLinghuiCanvasUiState` 重构为 store 桥接层，保留现有 hook 出口

## 2. Canvas Integration

- [x] 2.1 更新 `LinghuiCanvas` 与相关交互 hooks 以消费新的 store-backed UI 状态
- [x] 2.2 收敛 grid-split 回退、工具切换与 reset 逻辑到 store action

## 3. Validation

- [x] 3.1 补充 store / hook 定向测试，覆盖关键状态迁移行为
- [x] 3.2 运行目标 `vitest` 用例确认 store foundation 通过
