# 功能完整性分析报告 (Feature Completeness Report)

## 1. 概览

本项目 (Koma) 的核心架构已经成型，采用了分层设计 (Workflow -> Service -> Provider -> Engine)。但在关键路径上仍存在断点，特别是在**数据持久化**、**错误恢复**和**高性能渲染**方面。

| 模块 | 预估完成度 | 状态 | 关键缺失 |
| :--- | :--- | :--- | :--- |
| **Workflow** | 40% | 原型阶段 | 缺乏持久化、断点续传、重试机制 |
| **Providers** | 80% | 较为完善 | 架构稳固，需验证所有厂商的覆盖率 |
| **Services** | 70% | 功能可用 | 存在旧代码 (Legacy)，部分逻辑需迁移 |
| **Engine** | 60% | 基础可用 | Canvas 性能瓶颈，强依赖 Electron/FFmpeg |

## 2. 详细分析

### 2.1 Workflow (工作流)
**现状**: 
- `WorkflowManager` 是内存队列管理器（短期任务）
- `taskQueueStore` 提供本地文件持久化（长期任务，存储在 `projects/{id}/tasks.json`）

**已有能力**:
- ✅ 任务持久化到本地 JSON 文件
- ✅ 任务状态追踪（pending/running/completed/failed）
- ✅ 重试计数

**待改进**:
- **WorkflowManager 与 TaskQueue 集成不完整**: 短期工作流未自动同步到持久化存储
- **并发控制**: 硬编码了 `maxConcurrent = 2`，缺乏动态调度
- **断点续传**: 应用重启后未自动恢复未完成的任务

### 2.2 Providers (AI 服务集成)
**现状**: `ProviderManager` 提供了统一的类型安全接口。
**优势**:
- 架构清晰，支持 TTI (文生图), ITV (图生视频), TTS (语音) 三类服务。
- 注册机制灵活，支持插件扩展。
**待办**:
- 需确保所有主流模型 (OpenAI, Stable Diffusion, Midjourney, Kling, Runway) 都有对应的实现代码。

### 2.3 Services (核心服务)
**现状**: 实现了主要的业务逻辑 (`AssetGenerationService` 等)。
**问题**:
- **代码腐烂**: `AssetGenerationService` 中包含 `@deprecated` 注释，表明正在进行架构迁移（从 Service 迁移到 Workflow），但尚未完成。
- **Prompt 硬编码**: 提示词模板被硬编码在代码中 (e.g. `buildCharacterPrompt`)，缺乏灵活的配置管理。
- **环境依赖**: 部分代码强依赖 Electron 环境 (`electronService.isElectron()`)，可能影响 Web 端功能的完整性。

### 2.4 Engine (渲染引擎)
**现状**: 基于 HTML5 Canvas 2D 的渲染器 (`VideoRenderer`)。
**优势**:
- 支持基本的视频、图片、文字渲染。
- 实现了关键帧插值动画。
**问题**:
- **性能瓶颈**: Canvas 2D `drawImage` 在处理高分辨率或多轨道视频时 CPU 占用高，性能不如 WebGL。
- **导出依赖**: 视频导出 (`SimpleExportRenderer`) 依赖 Electron 主进程的 FFmpeg 能力，无法在纯浏览器环境中完成高质量视频合成。
- **音频同步**: 渲染器主要关注画面，音频混合似乎依赖外部控制器，需确保音画同步的精确性。

## 3. 业务优先级建议（C端本地工具约束）

> ⚠️ Koma 是纯本地 C 端工具，所有数据存储在本地文件系统，不依赖云服务。

1.  **[P0] 完善 WorkflowManager 与 TaskQueue 集成**
    -   短期工作流自动同步到 `tasks.json`
    -   应用启动时自动恢复未完成任务
    -   添加任务恢复 UI 提示

2.  **[P1] 渲染引擎优化 (Optimize Engine)**
    -   评估 Canvas 2D 的性能边界，考虑引入 WebGL (PixiJS / Three.js) 加速渲染。
    -   保持 FFmpeg 本地调用（Electron 主进程），这是 C 端工具的正确方案。

3.  **[P1] 完成 Service 到 Workflow 的迁移**
    -   清理 `AssetGenerationService` 中的废弃代码。
    -   将所有资产生成逻辑统一封装为可编排的 Workflow。

4.  **[P2] Prompt 模板系统**
    -   将硬编码的 Prompt 提取到本地 JSON 配置文件。
    -   支持用户自定义模板（存储在项目目录或全局配置）。

## 4. 存储架构说明

| 数据类型 | 存储位置 | 格式 |
|----------|----------|------|
| 项目元数据 | `projects/{id}/project.json` | JSON |
| 时间线 | `projects/{id}/timeline.json` | JSON |
| 任务队列 | `projects/{id}/tasks.json` | JSON |
| 资产文件 | `projects/{id}/assets/` | 原始文件 |
| 全局设置 | localStorage | JSON |
| 提示词模板 | localStorage | JSON |
