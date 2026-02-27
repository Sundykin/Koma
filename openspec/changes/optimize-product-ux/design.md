## Context

Koma Studio 经过性能优化后，核心架构已稳定。但产品层面存在多个未完成功能（Provider 连接测试、导出、TTS 持久化）和体验短板（新手引导、错误反馈、批量操作）。竞品（Runway、Kling、PopShort、Atlabs）在自动化程度和用户体验上已形成差距。

本次优化聚焦三个层面：
1. 修复影响用户信任的核心缺陷
2. 提升日常使用的核心体验
3. 对标竞品补齐关键功能

## Goals / Non-Goals

### Goals
- 所有 Provider 配置页的"测试连接"按钮执行真实 API 验证
- 未实现的 Provider 在 UI 上明确标注状态，不让用户误选
- 导出功能可用（通过 FFmpeg 实现真实视频编码）
- 新用户首次打开有清晰的引导流程
- 批量生成操作可暂停/取消，进度可视化
- 分镜支持拖拽排序

### Non-Goals
- 不做多人协作功能
- 不做社交分享/发布功能
- 不做实时协同编辑
- 不重写视频播放器引擎

## Decisions

### 1. Provider 连接测试策略
- 每个 Provider 类型（TTI/ITV/TTS）的 `testConnection()` 方法执行最小化 API 调用
- LLM: 发送一个简短 prompt 验证 API Key
- TTI: 调用模型列表或生成一张极小图片
- ITV: 调用账户信息或余额查询接口
- TTS: 调用音色列表接口
- 超时设置 10s，失败返回具体错误信息

### 2. 未实现 Provider 处理
- 在 Provider 注册表中添加 `status: 'available' | 'coming-soon' | 'community'` 字段
- UI 上 coming-soon 的 Provider 显示灰色标签，可查看但不可选为默认
- 避免用户配置后在生成时才发现不可用

### 3. 导出方案
- 利用已有的 Electron FFmpeg 服务（`electron/src/service/ffmpeg.ts`）
- 前端 Canvas 逐帧渲染 → 通过 IPC 发送帧数据 → Electron 端 FFmpeg 编码
- 支持 H.264 MP4 输出，可选分辨率和质量

### 4. 新手引导
- 使用 Ant Design Tour 组件实现步骤式引导
- 首次打开触发，引导创建项目 → 输入剧本 → 生成资产 → 分镜 → 视频
- 引导状态存储在 localStorage，可在设置中重置

### 5. 批量操作控制
- 在 TaskManager 中添加 `pause()` / `resume()` / `cancel()` 方法
- 批量生成 UI 显示每个分镜的独立状态（等待/生成中/完成/失败）
- 失败的分镜可单独重试

### 6. 分镜拖拽排序
- 使用 `@dnd-kit/core` 实现拖拽（React 生态最成熟的拖拽库）
- 拖拽后自动更新分镜序号并持久化

## Risks / Trade-offs

- **FFmpeg 集成复杂度**：逐帧渲染+编码性能取决于用户机器配置
  → 提供质量预设（快速/标准/高质量），默认使用快速模式
- **Provider 测试可能消耗配额**：某些 API 调用会消耗用户额度
  → 使用最小化调用（如查询余额而非生成内容）
- **dnd-kit 包体积**：约 30KB gzipped
  → 可接受，且已做代码分割

## Open Questions
- 是否需要支持导出为竖屏（9:16）格式？（短视频平台需求）
- 是否需要添加水印功能？
