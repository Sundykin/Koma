<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## 多模型协作调用规范

### Codex CLI 调用 (后端任务)
调用方式：codeagent-wrapper --backend codex - [工作目录] <<'EOF' ... EOF
适用场景：后端逻辑、算法实现、数据库操作、API 开发、性能优化、调试分析

### Gemini CLI 调用 (前端任务)
调用方式：codeagent-wrapper --backend gemini - [工作目录] <<'EOF' ... EOF
适用场景：UI/UX 组件开发、CSS 样式、响应式布局、前端交互逻辑

### 会话复用
每次调用返回 SESSION_ID: xxx，后续阶段用 resume xxx 复用上下文，保持对话连贯性。

新会话调用：codeagent-wrapper --backend <codex|gemini> - [工作目录] <<'EOF' ... EOF
复用会话调用：codeagent-wrapper --backend <codex|gemini> resume <SESSION_ID> - [工作目录] <<'EOF' ... EOF

### 并行调用
使用 run_in_background: true 启动后台任务，用 TaskOutput 等待结果。必须等所有模型返回后才能进入下一阶段。

并行启动示例：
Bash({ command: "codeagent-wrapper --backend codex ...", run_in_background: true, timeout: 3600000 })
Bash({ command: "codeagent-wrapper --backend gemini ...", run_in_background: true, timeout: 3600000 })

等待后台任务：TaskOutput({ task_id: <TASK_ID>, block: true, timeout: 600000 })