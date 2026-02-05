<div align="center">
<img width="1200" height="475" alt="Koma Studio Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Koma Studio

AI 短剧创作工具 | AI Drama Creation Tool

</div>

## 功能特性

- **剧本编辑** - 支持 @ 提及角色/场景/道具，智能高亮关键词
- **分镜管理** - 可视化分镜板，支持镜头预设和资产关联
- **资产管理** - 角色、场景、道具的统一管理，支持 AI 生成
- **视频编辑** - 时间轴编辑器，关键帧动画，多轨道支持
- **AI 对话** - 集成多种 LLM（Claude、Gemini、OpenAI）
- **插件系统** - 可扩展的插件架构，支持自定义 Provider
- **多语言** - 支持中文/英文界面切换
- **剪映导出** - 支持导出为剪映草稿格式

## 技术栈

- **前端**: React 19, TypeScript, Vite 6, Ant Design 6, Tailwind CSS 4
- **桌面端**: Electron 39
- **状态管理**: Zustand 5
- **国际化**: i18next
- **编辑器**: CodeMirror 6
- **AI 框架**: LangChain, MCP (Model Context Protocol)
- **视频播放**: xgplayer
- **测试**: Vitest

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
# 安装所有依赖（根目录 + frontend + electron）
npm run install:all
```

### 开发模式

```bash
# 同时启动前端开发服务器和 Electron
npm run dev

# 或单独启动前端
npm run dev:frontend

# 或单独启动 Electron
npm run dev:electron
```

### 构建

```bash
# 构建前端和 Electron
npm run build

# 打包桌面应用
npm run electron:build
```

### 测试

```bash
cd frontend

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage
```

## 项目结构

```
Koma/
├── frontend/          # React 前端应用
│   ├── src/
│   │   ├── components/   # UI 组件 (asset, chat, editor, storyboard, etc.)
│   │   ├── store/        # Zustand 状态管理
│   │   ├── services/     # 业务服务
│   │   ├── providers/    # LLM/TTI/TTS/ITV Provider
│   │   ├── hooks/        # React Hooks
│   │   ├── chat/         # AI 对话模块
│   │   ├── editor/       # 剧本编辑器 (CodeMirror)
│   │   ├── engine/       # 播放引擎、关键帧插值
│   │   ├── workflow/     # 工作流 (资产生成、分镜渲染)
│   │   ├── manju-dsl/    # Manju DSL 协议转换
│   │   └── utils/        # 工具函数
│   └── ...
├── electron/          # Electron 主进程 (LangChain, MCP)
├── packages/          # 共享包
├── docs/              # 项目文档
└── prompts/           # AI 提示词模板
```

## 配置

应用内置设置页面，支持配置：

- **LLM 配置** - API Key、模型选择、端点设置
- **图像生成 (TTI)** - ComfyUI、Gemini 等
- **语音合成 (TTS)** - Edge TTS、Fish Audio、GPT-SoVITS 等
- **视频生成 (ITV)** - Kling、Runway、Pika、Sora 等

## License

MIT
