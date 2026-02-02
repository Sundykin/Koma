# 聊天页面修复计划

## 问题清单

| # | 问题 | 严重度 |
|---|------|--------|
| 1 | 默认对话无法存储到历史列表 | Critical |
| 2 | 对话区域被输入框遮挡 | Critical |
| 3 | 对话气泡样式不符合深色主题 | High |
| 4 | 智能体模板卡片高度不统一 | Medium |
| 5 | 设置按钮无效（无消息时） | High |
| 6 | MCP 服务无 JSON 导入功能 | Medium |
| 7 | 输入框垂直对齐问题 | Low |
| 8 | 多智能体编排无入口 | Medium |
| 9 | 历史标题改为 AI 回答前几个字（用户补充） | Medium |

## 实施任务

### Task 1: 会话自动创建 + 历史标题修复
**文件**: `ChatPage.tsx`, `chatHistoryStore.ts`

修改点：
1. `ChatPage.tsx` 保存副作用：检测 `currentSessionId` 为 null 时自动调用 `createHistorySession()`
2. `chatHistoryStore.ts` `generateTitle()`: 优先从第一条 assistant 消息提取标题

### Task 2: 设置面板位置调整
**文件**: `ChatPage.tsx`, `ChatLayout.tsx`

修改点：
1. 将 `settingsPanel` 从 `messageList` 内部提出，作为独立 prop 传给 `ChatLayout`
2. `ChatLayout` 新增 `settingsPanel` prop，渲染在 `content` 顶部

### Task 3: 深色主题样式修复
**文件**: `ChatRenderer.module.css`

色板：
- 气泡背景: `#27272a`
- 边框: `#3f3f46`
- 用户气泡: `#10b981`
- 文字: `#fafafa`, `#a1a1aa`

### Task 4: 布局修复（消息区域不被遮挡）
**文件**: `ChatLayout.module.css`

修改点：
- `.composerBottom` 从 `position: absolute` 改为 `position: relative`
- `.messageArea` 使用 `flex: 1` + `min-height: 0` + `overflow-y: auto`

### Task 5: 智能体模板卡片高度统一
**文件**: `AgentTemplates.module.css`

修改点：
- `.card` 添加 `height: 100%` + `display: flex` + `flex-direction: column`
- `.cardActions` 使用 `margin-top: auto` 推到底部

### Task 6: 输入框垂直对齐
**文件**: `ChatComposer.module.css`

修改点：
- `.textarea` 增加 `min-height: 32px` + `padding: 5px 0` 与按钮对齐

### Task 7: MCP JSON 导入功能
**文件**: `MCPSettings.tsx`

修改点：
- 添加 `Upload` 组件 + `ImportOutlined` 按钮
- 实现 `handleImport()` 函数解析 JSON 文件并合并配置

### Task 8: 多智能体编排入口
**文件**: `ChatPage.tsx`, `chatIPC.ts`, `useChatIPC.ts`

修改点：
1. 工具栏添加 `TeamOutlined` 按钮
2. `SessionConfig` 类型新增 `agentMode`/`requiredCapabilities`
3. 点击按钮调用 `updateConfig({ agentMode: 'orchestrated' })`

## 执行顺序

1. Task 1 + Task 2 + Task 9 (逻辑层)
2. Task 3 + Task 4 + Task 5 + Task 6 (样式层)
3. Task 7 + Task 8 (功能扩展)

---
**规划完成时间**: 2026-02-01
**Codex SESSION**: 019c1786-5a73-7ce0-93f3-c3772d754a48
**Gemini SESSION**: 8c586aee-f89d-46f7-ab8f-5e2f4196c36f
