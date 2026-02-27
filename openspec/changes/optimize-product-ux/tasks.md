## 1. Provider 连接测试修复
- [x] 1.1 TTIConfigManager: 替换假测试为真实 API 调用（调用 provider.testConnection()）
- [x] 1.2 ITVConfigManager: 替换假测试为真实 API 调用
- [x] 1.3 TTSConfigManager: 替换假测试为真实 API 调用（调用 listVoices 验证）
- [x] 1.4 LLMConfigManager: 添加连接测试（发送简短 prompt 验证）
- [x] 1.5 统一测试结果展示：成功显示绿色✓+延迟，失败显示红色✗+具体错误

## 2. 未实现 Provider 状态标注
- [x] 2.1 Provider 注册表添加 `status` 字段（available / coming-soon / community）
- [x] 2.2 Runway、Kling、ComfyUI TTI、Edge-TTS 标记为 coming-soon
- [x] 2.3 配置管理器 UI 中 coming-soon Provider 显示灰色标签"即将支持"
- [x] 2.4 选择 coming-soon Provider 时弹出提示而非静默失败

## 3. 错误反馈优化
- [x] 3.1 创建 `frontend/src/utils/errorMessages.ts`：AI 服务错误码到用户友好消息的映射
- [x] 3.2 分镜生成失败时显示具体原因 + 建议操作（检查 API Key / 检查余额 / 重试）
- [x] 3.3 资产生成失败时在卡片上显示错误状态和重试按钮
- [x] 3.4 网络超时统一提示"网络连接超时，请检查网络后重试"

## 4. 批量操作增强
- [x] 4.1 TaskManager 添加 pause() / resume() / cancelAll() 方法
- [x] 4.2 批量生成 UI 添加暂停/取消按钮
- [x] 4.3 每个分镜显示独立状态标签（等待/生成中/完成/失败）
- [x] 4.4 失败分镜支持单独重试按钮

## 5. 新手引导
- [x] 5.1 创建 `frontend/src/components/common/OnboardingTour.tsx`：基于 Ant Design Tour
- [x] 5.2 定义引导步骤：创建项目 → 输入剧本 → 配置 AI 服务 → 生成资产 → 分镜 → 视频
- [x] 5.3 首次打开自动触发，引导状态存 localStorage
- [x] 5.4 设置页添加"重新显示引导"按钮

## 6. 分镜拖拽排序
- [x] 6.1 安装 @dnd-kit/core + @dnd-kit/sortable
- [x] 6.2 ShotListEditor 集成拖拽排序功能
- [x] 6.3 拖拽后自动更新分镜序号并持久化保存
- [x] 6.4 拖拽时显示视觉反馈（阴影、占位符）

## 7. 导出功能修复
- [x] 7.1 实现 SimpleExportDialog 到 Electron FFmpeg 服务的 IPC 调用链路
- [x] 7.2 Canvas 逐帧渲染 → IPC 传输 → FFmpeg H.264 编码
- [x] 7.3 导出进度条显示（帧数/总帧数 + 预计剩余时间）
- [x] 7.4 支持分辨率选择（720p / 1080p）和质量预设（快速/标准/高质量）

## 8. OpenAI TTS 文件持久化
- [x] 8.1 OpenAITTSProvider.synthesize: Blob → 通过 IPC 写入项目目录
- [x] 8.2 返回本地文件路径替代 Blob URL
- [x] 8.3 验证生成的音频文件可正常播放和导出

## 9. 项目模板系统
- [x] 9.1 创建 `frontend/src/config/projectTemplates.ts`：预置模板（短剧/解说/广告）
- [x] 9.2 CreateProjectModal 添加模板选择步骤
- [x] 9.3 选择模板后自动填充风格、集数、示例剧本等默认值

## 10. 一键成片工作流
- [x] 10.1 创建 `frontend/src/workflow/autoGenerateWorkflow.ts`：串联全流程
- [x] 10.2 流程：剧本解析 → 资产生成 → 分镜生成 → 图片生成 → 视频生成
- [x] 10.3 ProjectOverview 添加"一键成片"按钮，显示全流程进度面板
- [x] 10.4 每步可跳过或手动干预，失败步骤可重试
