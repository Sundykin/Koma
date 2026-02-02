# Koma Studio Bug 修复任务计划

**最后更新**: 2026-02-03 00:27

---

## 📊 进度统计

- 总任务数: 18
- ✅ 已完成: 2
- 🔄 进行中: 3
- ⏳ 待开始: 13

---

## 📋 任务状态

### ✅ 已完成

| ID | 任务 | 执行者 | 完成时间 |
|----|------|--------|----------|
| P0-1 | FFmpeg 视频导出 | Claude | 00:22 |
| P1-2 | OpenAIAdapter 类型 | Claude | 00:26 |

### 🔄 进行中

| ID | 任务 | 执行者 | 状态 |
|----|------|--------|------|
| P0-2/3 | Kling/Runway Provider | Codex | 查 API 文档 (78% ctx) |
| P0-4 | Edge TTS | Gemini | 重新开始 |
| P1-4 | MCP 工具审批 | Claude | 刚派发 |

### ⏳ 待开始

| ID | 任务 | 预分配 |
|----|------|--------|
| P0-5 | OpenAI TTS 文件保存 | Gemini |
| P0-6 | ComfyUI TTI | Codex |
| P0-7 | TTS 连接测试 | Gemini |
| P0-8 | ITV 连接测试 | Codex |
| P0-9 | TTI 连接测试 | Claude |
| P1-1 | PlaybackEngine 类型 | Gemini |
| P1-3 | DSL 转换类型 | Codex |
| P1-5 | 插件渠道调用 | Codex |
| P1-6 | 版本号读取 | Gemini |
| P2-1 | 统一错误处理 | Claude |
| P2-2 | Promise 错误处理 | Gemini |
| P2-3 | 用户提示完善 | Codex |
| P3-1/2 | 代码清理 | 任意 |

---

## 📝 巡检日志

### 00:27 巡检 #2
- Claude 完成 P1-2，派发 P1-4
- Gemini 卡在交互式 shell，已修复
- Codex 正常工作

### 00:22 巡检 #1
- Claude 完成 P0-1，派发 P1-2
- 所有 agent 正常工作
