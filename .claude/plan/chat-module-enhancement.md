# Chat 模块增强实施计划

## 概述
基于方案 B（状态机驱动）对聊天模块进行全面优化和功能扩展。

## 问题分析
1. **消息显示延迟**：`useChat.sendStream` 在流结束后才调用 `syncMessages`，导致用户消息不立即显示
2. **UI 布局固定**：输入框始终在底部，空白对话时视觉重心不明确
3. **缺少历史管理**：无法查看和恢复历史对话
4. **附件不支持**：虽有 `FileUploadPlugin`，但 UI 未集成
5. **MCP 配置无界面**：需要手动配置

---

## Phase 1: 消息乐观更新（高优先级）

### 1.1 修改 `useChat.ts`
**问题根源**：`sendStream` 在流结束后才同步消息

**修改方案**：
```typescript
// 在 sendStream 开始时立即添加用户消息并更新 UI
const sendStream = async (content) => {
  // 1. 立即添加用户消息
  const userMessage = sessionRef.current.addUserMessage(content);
  syncMessages(); // 立即同步，用户消息立刻显示

  // 2. 开始流式请求
  setIsLoading(true);
  setIsStreaming(true);
  // ...
};
```

### 1.2 消息状态扩展
在 `types.ts` 中扩展消息状态：
```typescript
interface ChatMessage {
  // ... existing fields
  status?: 'pending' | 'sent' | 'error';
}
```

---

## Phase 2: UI 重设计

### 2.1 ChatLayout 组件
新建 `frontend/src/components/chat/ChatLayout.tsx`

**状态机**：
- `IDLE`：Hero 模式，输入框居中
- `ACTIVE`：Chat 模式，输入框底部

**CSS 过渡**：
```css
.composerContainer {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
.composerHero { top: 40%; }
.composerChat { top: auto; bottom: 24px; }
```

### 2.2 ChatComposer 组件
新建 `frontend/src/components/chat/ChatComposer.tsx`

**功能**：
- 自动调整高度
- Enter 发送，Shift+Enter 换行
- 附件上传按钮
- 拖拽上传支持

---

## Phase 3: 历史对话管理

### 3.1 历史存储 Store
新建 `frontend/src/store/chatHistoryStore.ts`

使用 Zustand + IndexedDB：
```typescript
interface ChatHistoryStore {
  sessions: SessionMeta[];
  currentSessionId: string | null;

  createSession(): string;
  loadSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  listSessions(): SessionMeta[];
}
```

### 3.2 IndexedDB Schema
```typescript
// conversations 表
{ id, title, createdAt, updatedAt, lastMessageAt }

// messages 表
{ id, conversationId, role, content, status, timestamp }

// attachments 表
{ id, messageId, type, name, size, data }
```

### 3.3 HistorySidebar 组件
新建 `frontend/src/components/chat/HistorySidebar.tsx`

**功能**：
- 会话列表（按时间分组）
- 新建对话按钮
- 点击切换会话
- 删除会话

---

## Phase 4: 附件上传

### 4.1 扩展 ChatComposer
- 添加附件按钮（📎）
- 支持拖拽上传
- 支持粘贴图片
- 文件预览区域

### 4.2 文件类型支持
- 图片：jpg, png, gif, webp
- 文档：pdf, doc, docx, txt
- 代码：py, js, ts, java, cpp 等

### 4.3 上传限制
- 单文件最大：10MB
- 图片自动压缩

---

## Phase 5: MCP 配置界面

### 5.1 MCPSettings 组件
新建 `frontend/src/components/chat/MCPSettings.tsx`

**功能**：
- MCP 服务器列表
- 添加/编辑/删除服务器
- 测试连接
- 启用/禁用开关

### 5.2 配置字段
```typescript
interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'websocket';
  command?: string;  // stdio
  args?: string[];
  url?: string;      // sse/websocket
  enabled: boolean;
}
```

### 5.3 智能体模板
新建 `frontend/src/components/chat/AgentTemplates.tsx`

**功能**：
- 预设智能体模板
- 自定义智能体
- 工具配置
- 系统提示词配置

---

## 文件变更清单

### 新建文件
1. `frontend/src/components/chat/ChatLayout.tsx`
2. `frontend/src/components/chat/ChatLayout.module.css`
3. `frontend/src/components/chat/ChatComposer.tsx`
4. `frontend/src/components/chat/ChatComposer.module.css`
5. `frontend/src/components/chat/HistorySidebar.tsx`
6. `frontend/src/components/chat/HistorySidebar.module.css`
7. `frontend/src/components/chat/MCPSettings.tsx`
8. `frontend/src/components/chat/AgentTemplates.tsx`
9. `frontend/src/store/chatHistoryStore.ts`
10. `frontend/src/utils/indexedDB.ts`

### 修改文件
1. `frontend/src/chat/hooks/useChat.ts` - 乐观更新
2. `frontend/src/chat/types.ts` - 消息状态字段
3. `frontend/src/components/chat/ChatPage.tsx` - 集成新组件
4. `frontend/src/components/chat/ChatPage.module.css` - 布局调整

---

## 实施顺序

1. **Phase 1**：修复消息显示延迟（最高优先级）
2. **Phase 2**：UI 重设计（Hero → Chat 过渡）
3. **Phase 3**：历史对话管理
4. **Phase 4**：附件上传
5. **Phase 5**：MCP 配置界面

---

## 技术要点

- **乐观更新**：用户消息立即上屏，状态标记为 pending
- **CSS 过渡**：使用 cubic-bezier 实现平滑动画
- **IndexedDB**：使用 Dexie.js 简化操作
- **状态管理**：Zustand 管理历史会话
- **文件处理**：FileReader API + 图片压缩
