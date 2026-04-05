## ADDED Requirements

### Requirement: Shared Canvas Overlay State

灵绘 SHALL 通过共享 canvas store 提供 `contextMenu`、`quickCreate` 和页面抽屉入口状态，确保 toolbar、canvas 与 overlay 面板读取的是同一份当前 UI 状态。

#### Scenario: 上下文菜单与快速创建互斥

- **WHEN** 用户在画布中打开上下文菜单或快速创建面板
- **THEN** 当前打开的 overlay MUST 写入共享 canvas store
- **AND** 打开其中一个 overlay 时 MUST 自动关闭另一个 overlay

#### Scenario: 页面抽屉入口共享同一活动状态

- **WHEN** 用户从 toolbar、项目菜单或画布右键入口打开添加 / 工作流 / 资产 / 历史 / 教程抽屉
- **THEN** 系统 MUST 将当前活动抽屉写入共享 canvas store
- **AND** 抽屉本体、toolbar 按钮高亮和画布侧入口 MUST 反映同一活动抽屉状态

### Requirement: Scoped Canvas Store Reset

灵绘 SHALL 区分画布局部 UI reset 与页面级完整 reset，避免页面级 drawer 状态被画布局部 reset 误清。

#### Scenario: 画布局部 reset 清理临时 overlay

- **WHEN** 画布执行局部 UI reset 或画布 surface 重建
- **THEN** 系统 MUST 清理 `contextMenu` 与 `quickCreate` 等临时 overlay 状态
- **AND** 页面级 `activeDrawer` MUST 保持不变

#### Scenario: 离开灵绘页面时完整清理 store

- **WHEN** 用户离开当前灵绘页面并销毁工作台
- **THEN** 系统 MUST 执行完整 store reset
- **AND** `activeDrawer` 与其他画布共享 UI 状态 MUST 一并恢复到初始状态
