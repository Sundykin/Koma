# Change: 全面升级 Koma 为专业级漫剧创作工具

## Why
当前 Koma 项目是一个概念原型，需要升级为满足 DOC.md 企划书要求的专业工具。参考已实现的 electron-egg 项目（含完整剪辑页面、Electron 集成、引擎层），进行全面改造。

## What Changes

### 阶段 1：基础设施层

#### 1.1 引入 Ant Design 5.x 组件库
- 配置暗色主题 (dark algorithm)
- 保留 Tailwind CSS 用于微调
- 改造全部现有组件使用 Antd

#### 1.2 引入 Electron 集成 **BREAKING**
- 复制 electron-egg 的 `electron/` 目录结构
- 实现 preload 脚本和 IPC 通信
- 实现 `electronService.ts` 服务层
- 支持文件选择、媒体导入、FFmpeg 调用

#### 1.3 本地存储系统
- 项目数据存储：使用 `electron-store` 或 IndexedDB
- 项目目录结构：每个项目独立文件夹
- 模型配置持久化
- 最近项目列表缓存

### 阶段 2：配置中心

#### 2.1 模型预设系统（策略模式）
- 定义 `ModelProvider` 接口
- 实现 `GeminiProvider`, `OpenAIProvider`, `ComfyUIProvider` 等
- 支持运行时切换 Provider
- 配置校验和连接测试

#### 2.2 设置页面改造
- 使用 Antd Form + Tabs 重构
- LLM / TTI / ITV / TTS 四大配置区
- API Key 安全存储（加密）
- 预设导入/导出功能

### 阶段 3：剪辑页面完整重构 **BREAKING**

#### 3.1 从 electron-egg 迁移核心模块
- `Timeline.tsx` - 多轨道时间线（37KB 完整实现）
- `Player.tsx` - 画布预览播放器
- `Sidebar.tsx` - 素材库侧边栏
- `PropertiesPanel.tsx` - 属性面板
- `engine/` - MediaEngine、VideoRenderer、AudioController、Keyframe 系统

#### 3.2 完整功能移植
- 多轨道系统（视频/音频/字幕轨）
- 片段拖拽、缩放、吸附
- 播放头实时同步
- 关键帧动画系统
- 右键菜单操作
- 素材拖入轨道
- 轨道插入/删除

### 阶段 4：工作流系统

#### 4.1 工作流管理器（注册表模式）
- 复制 `workflowManager.ts` 架构
- 实现 `WorkflowExecutor` 接口
- 支持进度回调、取消执行

#### 4.2 分镜渲染流程
- 分镜确认状态（Confirmed）
- 自动入轨逻辑
- 版本管理（Seed 锁定）

### 阶段 5：类型系统扩展

新增类型定义（参考 electron-egg/types.ts）：
- `MediaType` 枚举
- `Track`, `Clip` 接口
- `Keyframe`, `EasingType` 关键帧类型
- `Asset`, `Subtitle` 素材类型
- `WorkflowType`, `WorkflowProgress` 工作流类型
- `AppPage` 页面路由枚举

### 阶段 6：Manju-DSL 协议

- 定义 JSON Schema
- 实现导入/导出函数
- 支持导出至剪映/PR 格式（未来）

## Impact

**Affected specs:**
- ui-components (Antd 改造)
- timeline-editor (完整剪辑功能)
- asset-generation (分镜流转)
- storage (本地存储)
- model-providers (策略模式)
- electron-integration (桌面集成)

**Affected code (大部分需要重写):**
- `App.tsx` - 完全重构，参考 electron-egg
- `components/VideoEditor.tsx` → 删除，用 Timeline.tsx 替代
- `components/SettingsPage.tsx` - Antd 重构 + 扩展
- `components/AssetManager.tsx` - Antd 改造
- `components/Storyboard.tsx` - 增加确认状态
- `types.ts` - 大量扩展
- `package.json` - 新增依赖

**新增文件:**
- `electron/` 目录（主进程代码）
- `src/engine/` 目录（媒体引擎）
- `src/services/` 目录（服务层）
- `src/workflows/` 目录（工作流实现）
- `src/providers/` 目录（模型适配器）
- `src/store/` 目录（本地存储）
