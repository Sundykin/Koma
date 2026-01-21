# Ant Design v6 Migration

## Overview

迁移项目代码以兼容 Ant Design v6 的 API 变更，主要涉及 message 和 Modal 静态方法的使用方式。

---

## MODIFIED Requirements

### Requirement: Message API 使用方式

组件中使用 antd message API **MUST** 通过 `App.useApp()` hook 获取实例，不再支持直接导入静态方法。

#### Scenario: 组件显示成功消息

**Given** 用户完成某项操作
**When** 组件需要显示成功反馈
**Then** 使用 `App.useApp().message.success()` 显示消息
**And** 消息自动继承 ConfigProvider 的主题配置

#### Scenario: 组件显示错误消息

**Given** 操作发生错误
**When** 组件需要显示错误提示
**Then** 使用 `App.useApp().message.error()` 显示错误
**And** 错误消息样式符合当前主题

#### Scenario: 组件显示加载消息

**Given** 异步操作开始执行
**When** 需要显示加载状态
**Then** 使用 `App.useApp().message.loading()` 显示加载提示
**And** 操作完成后消息自动消失或被替换

---

### Requirement: Modal API 使用方式

组件中使用 antd Modal 确认框 **MUST** 通过 `App.useApp()` hook 获取实例。

#### Scenario: 显示确认对话框

**Given** 用户触发需要确认的操作（如删除）
**When** 组件需要显示确认对话框
**Then** 使用 `App.useApp().modal.confirm()` 显示确认框
**And** 对话框继承 ConfigProvider 的主题配置

#### Scenario: 显示成功结果对话框

**Given** 操作成功完成
**When** 需要向用户展示成功结果
**Then** 使用 `App.useApp().modal.success()` 显示结果
**And** 对话框样式符合当前主题

#### Scenario: 显示错误结果对话框

**Given** 操作失败
**When** 需要向用户展示错误详情
**Then** 使用 `App.useApp().modal.error()` 显示错误对话框
**And** 对话框样式符合当前主题

---

### Requirement: Hook 中使用消息 API

自定义 hook 需要使用消息 API 时，**MUST** 通过参数注入方式获取实例。

#### Scenario: Hook 显示操作反馈

**Given** 自定义 hook 执行某些操作需要反馈
**When** hook 被组件调用时
**Then** 组件通过参数传入 message 实例
**And** hook 使用传入的实例显示消息

---

## REMOVED Requirements

### Requirement: 静态方法直接导入

不再支持从 antd 直接导入 message、Modal.confirm 等静态方法。

#### Scenario: 尝试使用静态导入

**Given** 代码中存在 `import { message } from 'antd'`
**When** 使用 `message.success()` 等方法
**Then** 应迁移为 `App.useApp().message.success()`
**And** 移除静态导入语句
