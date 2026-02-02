# Project Context

## Purpose
Koma Studio 是一款 AI 驱动的剧本创作工具，帮助用户从剧本文字一键生成短剧视频。

核心流程：**剧本 → AI解析 → 资产生成 → 分镜 → 视频**

## Tech Stack
- **前端**: React 19 + TypeScript + Vite 6
- **UI**: Ant Design 6 + Tailwind CSS 4
- **状态管理**: Zustand 5
- **桌面端**: Electron 39
- **AI 服务**: Gemini、OpenAI 兼容接口
- **媒体生成**: Sora2、Runway、Kling、即梦等

## Project Conventions

### Code Style
- CSS 类名使用小驼峰（如 `cardWrapper`），不用短横杠
- 组件文件使用 PascalCase（如 `EditorView.tsx`）
- 关键逻辑添加注释，简单代码无需注释
- 使用 TypeScript 严格模式

### Architecture Patterns
- **Provider 模式**: AI 服务通过统一接口抽象（`providers/`）
- **Store 分层**: 全局状态（globalStore）+ 项目状态（projectStore）
- **Workflow 模式**: 复杂流程封装为工作流（`workflow/`）
- **Service 层**: 业务逻辑与 UI 分离（`services/`）

### Testing Strategy
- 计划引入 Vitest + React Testing Library
- 优先覆盖核心服务（ScriptAnalysisService、AssetGenerationService）
- E2E 测试待定

### Git Workflow
- 主分支: `main`
- 提交信息格式: `type: description`（如 `feat: 添加角色管理`、`fix: 修复导出bug`）

## Domain Context
- **剧本**: 用户输入的文字内容，包含角色对话、场景描述
- **资产**: 角色定妆照、场景图、道具图
- **分镜(Shot)**: 视频的最小单元，包含画面描述、时长、镜头类型
- **渠道(Channel)**: AI 服务提供商的统一抽象

## Important Constraints
- 需要用户自行配置 API Key
- 视频生成依赖第三方服务，有配额限制
- Electron 打包后体积较大

## External Dependencies
- **LLM**: Gemini、OpenAI、DeepSeek 等
- **TTI(文生图)**: 即梦、通义万相、Flux、ComfyUI
- **ITV(图生视频)**: Sora2、Runway、Kling、Pika、MiniMax
- **TTS(语音)**: Edge-TTS、豆包TTS、Fish-Audio

## Directory Structure
```
frontend/src/
├── components/    # UI 组件
├── services/      # 业务服务
├── providers/     # AI 渠道抽象
├── workflow/      # 工作流
├── store/         # 状态管理
├── hooks/         # 自定义 Hook
├── types/         # 类型定义
└── utils/         # 工具函数
```
