# Chat 模块修复计划 - Round 3

## 问题概述

1. **思考过程展示**：需兼容 `reasoning_content`、`<think>` 标签、流式增量 reasoning
2. **历史对话存储**：新建对话提示错误、reasoning 字段可能丢失
3. **MCP 配置使用**：MCPPlugin 未集成到 ChatSession、工具列表未显示
4. **多智能体架构**：未显示当前激活智能体、tools 属性未使用

## 实施方案

采用**混合方案**：
- 数据层归一化：adapter 层统一解析 reasoning
- 渲染层兜底：UI 层兼容历史 `<think>` 标签
- 会话层集成：MCPPlugin 注册到 ChatSession

---

## 任务清单

### 1. 消息归一化工具函数 [新建]

**文件**: `frontend/src/chat/utils/messageUtils.ts`

```typescript
// 创建 normalizeMessage 函数
// - 从 content 中提取 <think> 标签内容作为 reasoning
// - 返回 { displayContent, displayReasoning }
```

### 2. MessageBubble 渲染层兜底 [修改]

**文件**: `frontend/src/chat/components/MessageBubble.tsx`

- 导入 `normalizeMessage`
- 使用 `displayReasoning` 替代 `message.reasoning`
- 使用 `displayContent` 替代 `getTextContent()`

### 3. ChatHistoryStore 存储修复 [修改]

**文件**: `frontend/src/store/chatHistoryStore.ts`

- 添加 `schemaVersion` 字段到 `SessionData`
- `saveMessages`: 确保 reasoning 字段正确持久化
- `loadMessages`: 添加数据迁移逻辑，处理旧版本数据

### 4. ChatPage 新建对话逻辑修复 [修改]

**文件**: `frontend/src/components/chat/ChatPage.tsx`

- `handleNewChat`: 改为 "已创建新对话" 提示
- 清空按钮: 保持 "对话已清空" 提示
- toolbar: 添加 Agent Badge 显示当前智能体
- 传递 currentSessionId 到 HistorySidebar

### 5. HistorySidebar 状态显示 [修改]

**文件**: `frontend/src/components/chat/HistorySidebar.tsx`

- 接收 `currentSessionId` prop
- 当 `currentSessionId` 为 null 时高亮 "新建对话" 按钮

### 6. MCPSettings 工具列表显示 [修改]

**文件**: `frontend/src/components/chat/MCPSettings.tsx`

- Table 添加 "工具" 列
- 显示可用工具数量或 "查看工具" 按钮

### 7. AgentTemplates 导出 PRESET_TEMPLATES [修改]

**文件**: `frontend/src/components/chat/AgentTemplates.tsx`

- 导出 `PRESET_TEMPLATES` 常量

**文件**: `frontend/src/components/chat/index.ts`

- 导出 `PRESET_TEMPLATES`

### 8. CSS 样式更新 [修改]

**文件**: `frontend/src/components/chat/ChatPage.module.css`

```css
.agentBadge { /* 智能体徽章样式 */ }
.agentIcon { /* 图标样式 */ }
.agentName { /* 名称样式 */ }
```

**文件**: `frontend/src/components/chat/HistorySidebar.module.css`

```css
.activeNewChat { /* 新对话激活状态 */ }
```

---

## 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `chat/utils/messageUtils.ts` | 新建 | 消息归一化工具函数 |
| `chat/components/MessageBubble.tsx` | 修改 | 使用归一化函数处理 reasoning |
| `store/chatHistoryStore.ts` | 修改 | 添加 schema 版本和数据迁移 |
| `components/chat/ChatPage.tsx` | 修改 | Agent Badge、新建对话逻辑 |
| `components/chat/HistorySidebar.tsx` | 修改 | 新对话状态高亮 |
| `components/chat/MCPSettings.tsx` | 修改 | 工具列表显示 |
| `components/chat/AgentTemplates.tsx` | 修改 | 导出 PRESET_TEMPLATES |
| `components/chat/index.ts` | 修改 | 导出 PRESET_TEMPLATES |
| `components/chat/ChatPage.module.css` | 修改 | Agent Badge 样式 |
| `components/chat/HistorySidebar.module.css` | 修改 | 新对话激活样式 |

---

## 执行顺序

1. 创建 `messageUtils.ts` 工具函数
2. 修改 `AgentTemplates.tsx` 和 `index.ts` 导出
3. 修改 `chatHistoryStore.ts` 存储逻辑
4. 修改 `MessageBubble.tsx` 渲染逻辑
5. 修改 `ChatPage.tsx` 主页面逻辑
6. 修改 `HistorySidebar.tsx` 侧边栏
7. 修改 `MCPSettings.tsx` 工具显示
8. 更新 CSS 样式

---

## 注意事项

- 保持向后兼容，不破坏现有数据
- 使用懒迁移策略，按需迁移旧数据
- Agent Badge 点击可快速切换智能体
