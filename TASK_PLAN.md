# Koma Studio Bug 修复任务计划

**创建时间**: 2026-02-03 00:16
**最后更新**: 2026-02-03 00:22
**目标**: 系统性修复所有已知 bug

---

## 📊 进度统计

- 总任务数: 18
- ✅ 已完成: 1
- 🔄 进行中: 3
- ⏳ 待开始: 14

---

## 📋 任务分配总览

### Phase 1: 核心功能实现 (P0)

| ID | 任务 | 文件 | 分配 | 状态 |
|----|------|------|------|------|
| P0-1 | FFmpeg 视频导出 | services/exportRenderer.ts | Claude | ✅ 完成 |
| P0-2 | Kling Provider | providers/itv/KlingProvider.ts | Codex | 🔄 进行中 |
| P0-3 | Runway Provider | providers/itv/RunwayProvider.ts | Codex | 🔄 进行中 |
| P0-4 | Edge TTS | providers/tts/EdgeTTSProvider.ts | Gemini | 🔄 进行中 |
| P0-5 | OpenAI TTS 文件保存 | providers/tts/OpenAITTSProvider.ts | Gemini | ⏳ 待开始 |
| P0-6 | ComfyUI TTI | providers/tti/ComfyUIProvider.ts | Codex | ⏳ 待开始 |

### Phase 2: 配置测试功能 (P0)

| ID | 任务 | 文件 | 分配 | 状态 |
|----|------|------|------|------|
| P0-7 | TTS 连接测试 | components/settings/TTSConfigManager.tsx | Gemini | ⏳ 待开始 |
| P0-8 | ITV 连接测试 | components/settings/ITVConfigManager.tsx | Codex | ⏳ 待开始 |
| P0-9 | TTI 连接测试 | components/settings/TTIConfigManager.tsx | Claude | ⏳ 待开始 |

### Phase 3: 类型安全修复 (P1)

| ID | 任务 | 文件 | 分配 | 状态 |
|----|------|------|------|------|
| P1-1 | PlaybackEngine 类型 | engine/PlaybackEngine.ts | Gemini | 🔄 进行中 |
| P1-2 | OpenAIAdapter 类型 | chat/adapters/OpenAIAdapter.ts | Claude | 🔄 进行中 |
| P1-3 | DSL 转换类型 | manju-dsl/*.ts | Codex | ⏳ 待开始 |

### Phase 4: 服务层完善 (P1)

| ID | 任务 | 文件 | 分配 | 状态 |
|----|------|------|------|------|
| P1-4 | MCP 工具审批 | services/mcpService.ts | Claude | ⏳ 待开始 |
| P1-5 | 插件渠道调用 | services/plugin/PluginAPI.ts | Codex | ⏳ 待开始 |
| P1-6 | 版本号读取 | services/plugin/PluginAPI.ts | Gemini | ⏳ 待开始 |

### Phase 5: 错误处理 (P2)

| ID | 任务 | 文件 | 分配 | 状态 |
|----|------|------|------|------|
| P2-1 | 统一错误处理 | 全局 | Claude | ⏳ 待开始 |
| P2-2 | Promise 错误处理 | hooks/* | Gemini | ⏳ 待开始 |
| P2-3 | 用户提示完善 | components/* | Codex | ⏳ 待开始 |

### Phase 6: 代码清理 (P3)

| ID | 任务 | 文件 | 分配 | 状态 |
|----|------|------|------|------|
| P3-1 | 移除 console.log | 全局 | 任意 | ⏳ 待开始 |
| P3-2 | 统一日志系统 | 全局 | 任意 | ⏳ 待开始 |

---

## 📝 完成记录

### P0-1: FFmpeg 视频导出 ✅
- 完成时间: 2026-02-03 00:22
- 执行者: Claude
- 提交: dev-openclaw

---

## 📝 更新日志

### 2026-02-03 00:22
- P0-1 FFmpeg 导出完成
- Claude 开始 P1-2 OpenAIAdapter 类型修复
- Codex 继续 Kling/Runway Provider
- Gemini 继续 EdgeTTS + PlaybackEngine

### 2026-02-03 00:16
- 创建任务计划
- 派发 Phase 1 任务
