## Context
Koma 项目是一个基于 React + Tailwind CSS 的漫剧 AI 生成工具原型。根据 DOC.md 企划书，需要升级为完整的专业级创作工具。参考 electron-egg 项目（已实现剪辑页面、Electron 集成、引擎层），进行全面改造。

## Goals / Non-Goals

**Goals:**
- 使用 Ant Design 统一 UI 风格，保持暗色主题
- 完整迁移 electron-egg 剪辑页面（Timeline, Player, Sidebar, PropertiesPanel, Engine）
- 引入 Electron 桌面集成，支持本地文件操作和 FFmpeg
- 实现本地存储系统（项目、配置持久化）
- 实现模型适配器策略模式，支持多厂商切换
- 实现分镜确认到时间线的自动入轨逻辑
- 建立 Manju-DSL 数据协议

**Non-Goals:**
- 不实现 Remotion 渲染管线（使用 Canvas 模拟）
- 不实现 ComfyUI 完整对接（仅占位）
- 不实现导出至剪映/PR 格式（Phase 2）
- 不实现云端同步（仅本地存储）

## Decisions

### 1. 组件库选择：Ant Design 5.x
**Rationale:**
- 暗色主题支持完善（ConfigProvider + theme.darkAlgorithm）
- 组件覆盖全面，减少自定义工作量
- 与 React 19 兼容
- 中文文档友好

### 2. 剪辑页面：完整迁移 electron-egg 实现
**Rationale:**
- electron-egg 的 Timeline.tsx（37KB）已是成熟实现，包含：
  - 多轨道渲染系统
  - 片段拖拽/缩放/吸附
  - 播放头同步
  - 关键帧系统
  - 右键菜单
  - 素材拖放
- 配套的 MediaEngine、VideoRenderer、AudioController 已完善
- 直接复用可节省大量开发时间

**Migration Plan:**
1. 复制 engine/ 目录（MediaEngine.ts, VideoRenderer.ts, AudioController.ts, keyframe.ts）
2. 复制 Timeline.tsx, TimelineEditor.css
3. 复制 Player.tsx, Sidebar.tsx, PropertiesPanel.tsx
4. 适配 types.ts 扩展
5. 重构 App.tsx 整合所有模块

### 3. Electron 集成：基于 Electron-egg 框架
**参考项目**: `E:\Workspace\2025\代码备份\electron-egg`

**Rationale:**
- Electron-egg 是成熟的 Electron 应用开发框架
- 提供标准化的主进程/渲染进程通信模式
- 控制器-服务分层架构清晰
- electron-egg 项目的 IPC 通信模式已验证可行
- electronService.ts 封装了完整的前端 API
- 支持文件选择、媒体信息获取、SRT 解析、导出等

**Architecture:**
```
electron/
├── main.js           # 主进程入口
├── preload/          # IPC 暴露
├── controller/       # 业务控制器 (file.js, media.js)
└── service/          # 服务层 (ffmpeg.js)
```

### 4. 模型适配器：策略模式
**Rationale:**
- DOC.md 要求「全模型适配」，支持 Gemini、OpenAI、ComfyUI 等
- 策略模式允许运行时切换 Provider
- 便于扩展新厂商

**Interface Design:**
```typescript
interface ModelProvider {
  type: string;
  validate(config: ModelConfig): boolean;
  testConnection(): Promise<boolean>;
  generateText?(prompt: string): Promise<string>;
  generateImage?(prompt: string): Promise<ImageResult>;
  generateVideo?(image: string): Promise<VideoResult>;
}
```

**Implementations:**
- GeminiProvider: 使用 @google/genai SDK
- OpenAIProvider: 使用 openai SDK
- ComfyUIProvider: 占位，后续对接 WebSocket API

### 4.1 TTS 语音合成：多 Provider 策略
**Rationale:**
- 分镜渲染流程「图 → 音 → 视」的「音」环节
- 不同场景需要不同的 TTS 服务（免费/高质量/本地）
- 角色需要绑定独立音色，保持一致性

**Provider 优先级:**
1. **Edge TTS** (免费) - 默认，中文音色丰富，无需 API Key
2. **OpenAI TTS** - 高质量，需 API Key
3. **Fish Audio** - 音色克隆，高定制
4. **GPT-SoVITS** (本地) - 离线可用，自训练音色

**Core Features:**
- 角色音色绑定：每个角色可配置独立 voice ID
- 多角色对话：自动识别对话归属，分别合成
- 音频后处理：静音填充、音量标准化
- 缓存机制：相同文本+音色不重复生成

```typescript
interface TTSProvider {
  type: string;
  synthesize(text: string, voiceId: string, options?: TTSOptions): Promise<AudioResult>;
  listVoices(): Promise<Voice[]>;
}
```

### 4.2 ITV 图生视频：多 Provider 策略
**Rationale:**
- 分镜渲染流程「图 → 音 → 视」的「视」环节
- 不同 Provider 各有优势（质量/速度/价格/本地）
- 视频生成参数差异大，需统一抽象

**Provider 优先级:**
1. **Runway Gen-3** - 高质量，运动自然
2. **Kling (可灵)** - 国产，首尾帧控制强
3. **Pika** - 快速，风格化
4. **Sora2** (占位) - 待 API 开放
5. **ComfyUI + AnimateDiff** (本地) - 离线可用，完全可控

**Core Features:**
- 统一参数接口：时长、分辨率、帧率、宽高比
- 运动控制：motion strength、camera motion、motion prompt
- 首尾帧模式：指定起止帧生成过渡视频
- 异步任务：轮询进度、自动下载
- 版本管理：存储到 `shots/{shotId}/versions/`

```typescript
interface ITVProvider {
  type: string;
  generate(image: string, prompt: string, options: ITVOptions): Promise<VideoResult>;
  checkProgress(taskId: string): Promise<ProgressInfo>;
}
```

### 5. 本地存储：层级化项目隔离系统
**Rationale:**
- 所有数据本地化，无云端依赖
- 项目完全隔离，便于备份、迁移、删除
- 生成中间产物按版本管理，支持回溯
- 存储根目录可配置，用户自主选择位置

**Core Design Decisions:**

**5.1 可配置存储根目录**
- 默认路径：`%USERPROFILE%/.koma` (Windows) / `~/.koma` (macOS/Linux)
- 用户可在设置中修改存储根目录
- 修改时提供数据迁移选项（复制现有数据到新位置）
- 路径验证：检查可写性、磁盘空间
- 路径信息存储在 electron-store（系统级），非存储根目录内

**5.2 全局存储结构**
```
{storageRoot}/
├── settings.json         # 全局设置（模型配置、主题、快捷键）
├── recent-projects.json  # 最近项目列表（id, title, path, lastOpened）
├── model-presets/        # 模型配置预设
│   └── {presetName}.json
├── licenses/             # 许可证文件
└── logs/                 # 应用日志
    └── {date}.log
```

**5.3 项目隔离存储结构**
```
{storageRoot}/projects/{projectId}/
├── project.json          # 项目元数据（id, title, genre, mode, createdAt, updatedAt）
├── timeline.json         # 时间线数据（tracks, clips, duration）
├── assets/
│   ├── images/           # 导入的图片素材
│   ├── videos/           # 导入的视频素材
│   ├── audio/            # 导入的音频素材
│   └── fonts/            # 字体文件
├── shots/
│   └── {shotId}/
│       ├── shot.json     # 分镜元数据（prompt, seed, model, currentVersion）
│       └── versions/     # 历史版本
│           ├── v1/
│           │   ├── image.png
│           │   ├── video.mp4
│           │   └── audio.mp3
│           └── v2/
├── cache/
│   ├── thumbnails/       # 缩略图缓存（{hash}_{size}.jpg）
│   ├── waveforms/        # 音频波形缓存（{hash}.json）
│   └── previews/         # 预览帧缓存
├── exports/              # 导出文件
└── temp/                 # 临时文件（启动时清理）
```

**5.4 分镜版本管理**
- 每次生成存储到 `versions/v{n}/`
- `shot.json` 记录：prompt, seed, model, timestamp, currentVersion
- 支持切换历史版本（更新 currentVersion 指针）
- 保留至少一个版本（最新版不可删除）

**5.5 素材管理**
- 导入时复制到 `assets/{type}/`
- 文件名：`{timestamp}_{originalName}`
- MD5 哈希去重（相同文件复用）
- 引用计数，支持「清理未使用素材」

**5.6 敏感数据加密**
- API Key 使用 AES-256-GCM 加密
- 密钥派生自机器唯一标识（MAC + CPU ID）
- 加密字段标记：`encrypted: true`

**5.7 项目打包导入/导出**
- 导出为 `.koma.zip`（包含所有素材和生成文件）
- 可选排除 cache/ 和 temp/
- 导入时解压、验证结构、注册到项目列表

**Storage Implementation:**
- `storageConfig.ts`: 存储根目录配置
- `globalStore.ts`: 全局配置读写
- `projectStore.ts`: 项目数据读写、目录初始化

### 6. 样式策略：Antd + Tailwind 混用
**Rationale:**
- Antd 处理复杂组件样式
- Tailwind 处理微调和布局辅助
- 通过 CSS Variables 统一主题色

**Theme Config:**
```typescript
const theme = {
  algorithm: antd.theme.darkAlgorithm,
  token: {
    colorPrimary: '#10b981',  // green-500
    colorBgContainer: '#18181b',
    colorBgElevated: '#27272a',
  }
};
```

### 7. AI 剧本处理：LLM 驱动的分镜工作流
**Rationale:**
- DOC.md 核心需求：「剧本工作室：输入 Idea → 自动生成剧本 → 拆解为 Shot List」
- LLM 适合文本理解和结构化输出任务
- 分镜拆解结果直接驱动后续图/音/视生成

**Core Workflow:**
```
Idea (用户输入)
    ↓ [LLM: 剧本生成]
Script (完整剧本)
    ↓ [LLM: 分镜拆解]
Shot List (JSON)
    ↓ [LLM: TTI Prompt 生成]
分镜渲染队列
```

**Shot List Schema:**
```typescript
interface Shot {
  shotId: string;
  sceneIndex: number;
  content: string;        // 画面描述（用于 TTI）
  dialogue: string;       // 台词（用于 TTS）
  duration: number;       // 建议时长（秒）
  characters: string[];   // 出场角色
  props: string[];        // 出现道具
  emotion: string;        // 情绪标签
  cameraAngle: string;    // 镜头建议
  ttiPrompt?: string;     // 自动生成的 TTI prompt
}
```

**Prompt 模板策略:**
- 使用 System Prompt + JSON Schema 约束输出格式
- 模板可自定义，支持重置为默认
- 分类管理：剧本生成、分镜拆解、角色/场景/道具提取、TTI 生成

**Implementation:**
- `scriptGenerator.ts`: Idea → Script
- `shotListGenerator.ts`: Script → Shot List
- `entityExtractor.ts`: 角色/场景/道具提取
- `promptTemplates.ts`: Prompt 模板管理

## Risks / Trade-offs

1. **风险**: Antd 和 Tailwind 可能存在样式冲突
   - **缓解**: 使用 Antd CSS-in-JS 模式，Tailwind 仅用于非组件样式

2. **风险**: 迁移代码量大，可能引入 bug
   - **缓解**: 分阶段迁移，每阶段验证

3. **风险**: Electron 打包体积大
   - **缓解**: 后续优化，按需加载

4. **风险**: 多 Provider 维护成本
   - **缓解**: 定义清晰接口，每个 Provider 独立文件

## Open Questions

1. 是否需要引入状态管理库（Zustand/Redux）？
   - 当前计划：先用 useState + Context，复杂时再引入

2. 关键帧动画是否需要实时预览？
   - 当前计划：使用 Canvas 渲染，性能足够

3. ComfyUI 对接方案？
   - 当前计划：Phase 2 实现，先占位
