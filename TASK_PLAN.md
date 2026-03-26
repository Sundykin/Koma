# Koma Studio Bug 修复任务计划

**最后更新**: 2026-02-03 10:40

---

## 📊 进度统计

- 总任务数: 18
- ✅ 已完成: 14 (78%)
- 🔄 进行中: 4
- ⏳ 待开始: 0

---

## 🔄 当前进行中

| ID | 任务 | 执行者 | 状态 |
|----|------|--------|------|
| P6-i18n | 国际化 components/project | Claude | 进行中 |
| P1-TS | 修复 TypeScript 错误 (ChatSession.ts) | Gemini | 刚派发 |
| P3-1 | 代码清理 (删除 console.log) | Codex | 刚派发 |

---

## ✅ 已完成

| ID | 任务 | 执行者 | 完成时间 |
|----|------|--------|----------|
| P0-1 | FFmpeg 视频导出 | Claude | 00:22 |
| P0-2 | Kling Provider | Codex | 00:50 |
| P0-3 | Runway Provider | Codex | 00:50 |
| P0-4 | Edge TTS | Gemini | 00:31 |
| P0-5 | OpenAI TTS 文件保存 | Gemini | 00:51 |
| P0-6 | ComfyUI TTI | Codex | 00:55 |
| P0-7 | TTS 连接测试 | Gemini | 00:55 |
| P0-8 | ITV 连接测试 | Codex | 01:09 |
| P0-9 | TTI 连接测试 | Claude | 00:51 |
| P1-2 | OpenAIAdapter 类型 | Claude | 00:26 |
| P1-3 | DSL 转换类型 | Claude | 01:09 |
| P1-4 | MCP 工具审批 | Claude | 00:31 |
| P2-1 | 统一错误处理 | Claude | 00:55 |
| P1-1 | PlaybackEngine 类型 | Gemini | 01:10 |

---

## 📝 任务分配原则

- **Claude** (WSL): 中文相关、i18n、文档
- **Gemini** (Windows): 英文代码、类型修复、架构分析
- **Codex** (Windows): 代码清理、测试、优化

---

## 📝 巡检日志

### 10:40 巡检 (技术总监主动分析)
- 分析项目状态，发现 TypeScript 错误和 273 个 console.log
- Claude: 继续 i18n (components/project 目录)
- Gemini: 修复 TypeScript 错误 (ChatSession.ts)
- Codex: 代码清理 (删除 console.log)

---

## 2026-03-26 附加计划：灵绘独立菜单提案

- **目标：** 产出“灵绘”独立菜单功能的 OpenSpec 规划文档，明确 MVP 与后续迭代边界；本轮不实现代码。
- **当前阶段：** 方案与规范编写
- **输出物：** `openspec/changes/add-linghui-canvas-studio/` 下的 `proposal.md`、`design.md`、`tasks.md` 与 spec deltas
- **当前判断：**
  - 首版应作为内建一级菜单，而不是全局插件
  - 数据模型应独立于现有 `Project / Episode`
  - MVP 聚焦画布、分组、基础节点、4 宫格、多角度、分镜组、预览导出
  - 运镜节点、9 宫格、自定义角度和视频后处理进入后续迭代
