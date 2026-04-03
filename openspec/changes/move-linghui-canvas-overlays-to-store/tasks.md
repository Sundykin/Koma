## 1. Store Expansion

- [x] 1.1 扩展灵绘 canvas store，承载 `contextMenu`、`quickCreate`、`activeDrawer` 以及 scoped reset / toggle action
- [x] 1.2 将 `useLinghuiCanvasOverlayState` 重构为 store 桥接层，保留现有主要接口并把 overlay 互斥规则收敛到 store

## 2. Canvas And Page Integration

- [x] 2.1 将 `LinghuiPage` 的 drawer 状态迁到 store，并统一 toolbar、画布回调和抽屉本体的状态来源
- [x] 2.2 更新 `LinghuiCanvas` 与相关 callback typing，使用 store-backed overlay / drawer 状态并保持现有交互行为

## 3. Validation

- [x] 3.1 补充 store 定向测试，覆盖 overlay 互斥、drawer toggle 与 scoped reset 行为
- [x] 3.2 运行定向 `vitest` 与类型检查，记录本次变更范围内的验证结果
