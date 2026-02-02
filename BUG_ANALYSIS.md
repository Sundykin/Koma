# Koma Studio Bug 分析报告

**分析时间**: 2026-02-03 00:10
**项目规模**: 72,531 行代码
**分支**: dev-openclaw

---

## 📊 问题统计

| 类别 | 数量 | 严重程度 |
|------|------|----------|
| TODO/未实现 | 16+ | 🔴 高 |
| `any` 类型使用 | 416 | 🟡 中 |
| `as any` 强制转换 | 20+ | 🟡 中 |
| console.log 调试代码 | 273 | 🟢 低 |
| 未处理的 Promise | 7+ | 🟡 中 |

---

## 🔴 严重问题 (P0)

### 1. 未实现的核心功能

以下 Provider 只有空壳，没有实际实现：

```
providers/itv/KlingProvider.ts:24      - Kling API 未实现
providers/itv/RunwayProvider.ts:20-36  - Runway Gen-3 全部未实现
providers/tti/ComfyUIProvider.ts:34    - ComfyUI TTI 未实现
providers/tts/EdgeTTSProvider.ts:77    - Edge TTS 未实现
providers/tts/OpenAITTSProvider.ts:63  - OpenAI TTS 文件保存未实现
```

### 2. 关键服务未完成

```
services/exportRenderer.ts:324         - FFmpeg 编码流程未实现
services/mcpService.ts:123,135         - MCP 工具调用审批/拒绝未实现
services/plugin/PluginAPI.ts:456       - 渠道调用未实现
```

### 3. 配置测试功能缺失

```
components/settings/TTSConfigManager.tsx:167  - TTS 连接测试未实现
components/settings/ITVConfigManager.tsx:219  - ITV 连接测试未实现
components/settings/TTIConfigManager.tsx:236  - TTI 连接测试未实现
```

---

## 🟡 中等问题 (P1)

### 1. 类型安全问题

**416 处 `any` 类型使用**，主要集中在：
- `engine/PlaybackEngine.ts` - 大量 `as any` 强制转换
- `chat/adapters/OpenAIAdapter.ts` - 流式响应处理
- `manju-dsl/converter.ts` - DSL 转换

**典型问题代码**:
```typescript
// engine/PlaybackEngine.ts:375-382
const keyframes = (item as any).keyframes as TrackKeyframe[] | undefined;
x: (item as any).x ?? 0,
y: (item as any).y ?? 0,
scale: (item as any).scale ?? 1,
```

**建议**: 定义明确的接口类型，避免运行时类型错误

### 2. 错误处理不完善

**问题模式**:
```typescript
// 吞掉错误，不做处理
audio.play().catch(() => {});
video.play().catch(() => {});

// 只打印日志，不恢复
} catch (err) {
  console.error('xxx失败:', err);
}
```

**影响**: 用户无法知道操作失败，可能导致数据丢失

### 3. Promise 链未处理

```typescript
// App.tsx:110 - .then 没有 .catch
loadEpisodeShots(activeProject.id, activeEpisode.id).then(shots => {...});

// components/chat/AgentTemplates.tsx:113
.then(tools => {...});  // 缺少错误处理
```

---

## 🟢 低优先级问题 (P2)

### 1. 调试代码残留

**273 处 console.log/error/warn**，应该：
- 生产环境移除或使用 logger 服务
- 统一使用 `store/logger.ts` 中的日志系统

### 2. 代码风格不一致

- 部分文件使用中文注释，部分使用英文
- 错误消息混用中英文

---

## 📋 任务分解

### Phase 1: 核心功能实现 (优先级最高)

| 任务 | 文件 | 预估工时 | 建议分配 |
|------|------|----------|----------|
| 实现 Kling Provider | providers/itv/KlingProvider.ts | 4h | Codex |
| 实现 Runway Provider | providers/itv/RunwayProvider.ts | 4h | Codex |
| 实现 Edge TTS | providers/tts/EdgeTTSProvider.ts | 2h | Gemini |
| 实现 FFmpeg 导出 | services/exportRenderer.ts | 6h | Claude |

### Phase 2: 类型安全修复

| 任务 | 文件 | 预估工时 | 建议分配 |
|------|------|----------|----------|
| 修复 PlaybackEngine 类型 | engine/PlaybackEngine.ts | 3h | Claude |
| 修复 OpenAIAdapter 类型 | chat/adapters/OpenAIAdapter.ts | 2h | Gemini |
| 修复 DSL 转换类型 | manju-dsl/*.ts | 2h | Codex |

### Phase 3: 错误处理完善

| 任务 | 范围 | 预估工时 | 建议分配 |
|------|------|----------|----------|
| 统一错误处理 | 全局 | 4h | Claude |
| 添加用户提示 | components/* | 3h | Gemini |
| Promise 错误处理 | hooks/* | 2h | Codex |

### Phase 4: 代码清理

| 任务 | 范围 | 预估工时 | 建议分配 |
|------|------|----------|----------|
| 移除调试代码 | 全局 | 2h | 任意 |
| 统一日志系统 | 全局 | 2h | 任意 |

---

## 🎯 建议优先级

1. **立即处理**: Kling/Runway Provider (用户可能需要使用)
2. **本周完成**: FFmpeg 导出、类型安全修复
3. **下周完成**: 错误处理、代码清理

---

## 📝 备注

- 项目使用 OpenSpec 规范管理变更，大改动需要先写 proposal
- 多模型协作规范见 CLAUDE.md
- 项目结构良好，架构清晰，主要问题是功能未完成
