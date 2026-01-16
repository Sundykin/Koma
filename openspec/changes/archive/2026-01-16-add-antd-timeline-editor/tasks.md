## 阶段 1：基础设施层

### 1.1 依赖安装
- [x] 1.1.1 安装 antd, @ant-design/icons, @ant-design/cssinjs
- [x] 1.1.2 安装 electron, electron-builder, electron-store
- [x] 1.1.3 安装 @google/genai (Gemini SDK)
- [x] 1.1.4 安装 crypto-js (API Key 加密)
- [x] 1.1.5 配置 Antd ConfigProvider 暗色主题

### 1.2 Electron 集成
- [x] 1.2.1 创建 electron/main.ts 主进程入口 (TypeScript)
- [x] 1.2.2 创建 electron/preload/ IPC 通信脚本
- [x] 1.2.3 创建 electron/controller/ 业务控制器（app, window, dialog, fs, project）
- [x] 1.2.4 创建 electron/service/ 服务层（project）
- [x] 1.2.5 配置 package.json electron 启动脚本
- [x] 1.2.6 实现 src/services/electronService.ts 前端封装

### 1.3 本地存储系统（核心）

#### 1.3.1 存储根目录管理
- [x] 1.3.1.1 创建 src/store/storageConfig.ts（存储根目录配置）
- [x] 1.3.1.2 实现默认存储路径检测（%USERPROFILE%/.koma 或 ~/.koma）
- [x] 1.3.1.3 实现存储路径修改功能
- [x] 1.3.1.4 实现存储路径验证（可写、空间检查）
- [x] 1.3.1.5 实现数据迁移功能（旧路径 → 新路径）

#### 1.3.2 全局存储结构
- [x] 1.3.2.1 创建 src/store/globalStore.ts
- [x] 1.3.2.2 实现 settings.json 读写（全局配置）
- [x] 1.3.2.3 实现 recent-projects.json 读写
- [x] 1.3.2.4 实现 model-presets/ 预设管理
- [x] 1.3.2.5 实现 logs/ 日志记录

#### 1.3.3 项目存储结构
- [x] 1.3.3.1 创建 src/store/projectStore.ts
- [x] 1.3.3.2 实现项目目录初始化函数
- [x] 1.3.3.3 实现 project.json 读写
- [x] 1.3.3.4 实现 timeline.json 读写
- [x] 1.3.3.5 实现 assets/ 素材目录管理
- [x] 1.3.3.6 实现 shots/ 分镜目录管理
- [x] 1.3.3.7 实现 cache/ 缓存目录管理
- [x] 1.3.3.8 实现 temp/ 临时目录管理
- [x] 1.3.3.9 实现 exports/ 导出目录管理

#### 1.3.4 素材管理
- [x] 1.3.4.1 实现素材导入函数（复制到 assets/{type}/）
- [x] 1.3.4.2 实现素材去重（MD5 哈希检测）
- [x] 1.3.4.3 实现素材引用计数
- [x] 1.3.4.4 实现「清理未使用素材」功能
- [x] 1.3.4.5 实现 assets.json 元数据管理

#### 1.3.5 分镜版本管理
- [x] 1.3.5.1 实现分镜生成结果存储（versions/v{n}/）
- [x] 1.3.5.2 实现 shot.json 元数据（prompt, seed, model, timestamp）
- [x] 1.3.5.3 实现版本切换（currentVersion 指针）
- [x] 1.3.5.4 实现版本删除（保留至少一个）
- [x] 1.3.5.5 实现版本历史查询

#### 1.3.6 缓存管理
- [x] 1.3.6.1 实现缩略图缓存（thumbnails/）
- [x] 1.3.6.2 实现波形缓存（waveforms/）
- [x] 1.3.6.3 实现预览帧缓存（previews/）
- [x] 1.3.6.4 实现「清理缓存」功能
- [x] 1.3.6.5 实现缓存大小统计

#### 1.3.7 临时文件管理
- [x] 1.3.7.1 实现临时文件创建（唯一命名）
- [x] 1.3.7.2 实现启动时自动清理 temp/
- [x] 1.3.7.3 实现操作完成后主动清理

#### 1.3.8 项目导入/导出
- [x] 1.3.8.1 实现项目导出为 .koma.zip
- [x] 1.3.8.2 实现项目导入（解压 + 验证 + 注册）
- [x] 1.3.8.3 实现导出选项（排除缓存/临时文件）

#### 1.3.9 安全与加密
- [x] 1.3.9.1 实现 API Key AES-256-GCM 加密
- [x] 1.3.9.2 实现机器唯一标识派生密钥
- [x] 1.3.9.3 实现加密字段标记（encrypted: true）

#### 1.3.10 存储迁移
- [x] 1.3.10.1 实现存储格式版本号
- [x] 1.3.10.2 实现版本升级迁移脚本框架
- [x] 1.3.10.3 实现迁移前自动备份

### 1.4 类型系统扩展
- [x] 1.4.1 添加 MediaType, EasingType 枚举
- [x] 1.4.2 添加 Track, Clip, Keyframe 接口
- [x] 1.4.3 添加 Asset, Subtitle 接口
- [x] 1.4.4 添加 WorkflowType, WorkflowProgress 接口
- [x] 1.4.5 添加 AppPage 页面路由枚举
- [x] 1.4.6 扩展 Shot 接口（添加 confirmed, seed, versions 字段）
- [x] 1.4.7 添加 StorageConfig, ProjectMeta 接口
- [x] 1.4.8 添加 ShotVersion, CacheInfo 接口

## 阶段 2：配置中心（策略模式）

### 2.1 模型适配器架构
- [x] 2.1.1 定义 src/providers/types.ts（ModelProvider 接口）
- [x] 2.1.2 实现 src/providers/GeminiProvider.ts
- [x] 2.1.3 实现 src/providers/OpenAIProvider.ts
- [x] 2.1.4 实现 src/providers/ComfyUIProvider.ts（占位）
- [x] 2.1.5 创建 src/providers/index.ts 工厂函数
- [x] 2.1.6 实现配置校验和连接测试函数

### 2.2 TTS 语音合成系统
- [x] 2.2.1 定义 src/providers/tts/types.ts（TTSProvider 接口）
- [x] 2.2.2 实现 src/providers/tts/EdgeTTSProvider.ts（免费）
- [x] 2.2.3 实现 src/providers/tts/OpenAITTSProvider.ts
- [x] 2.2.4 实现 src/providers/tts/FishAudioProvider.ts
- [x] 2.2.5 实现 src/providers/tts/GPTSoVITSProvider.ts（本地）
- [x] 2.2.6 实现角色音色配置绑定
- [x] 2.2.7 实现多角色对话合成逻辑
- [x] 2.2.8 实现 TTS 缓存机制
- [x] 2.2.9 实现音频后处理（静音填充、音量标准化）

### 2.3 ITV 图生视频系统
- [x] 2.3.1 定义 src/providers/itv/types.ts（ITVProvider 接口）
- [x] 2.3.2 实现 src/providers/itv/RunwayProvider.ts
- [x] 2.3.3 实现 src/providers/itv/KlingProvider.ts（可灵）
- [x] 2.3.4 实现 src/providers/itv/PikaProvider.ts
- [x] 2.3.5 实现 src/providers/itv/Sora2Provider.ts（占位）
- [x] 2.3.6 实现 src/providers/itv/ComfyUIAnimateDiffProvider.ts
- [x] 2.3.7 实现视频生成参数配置（时长、分辨率、帧率）
- [x] 2.3.8 实现运动控制参数（motion strength、camera motion）
- [x] 2.3.9 实现异步任务轮询和进度回调
- [x] 2.3.10 实现首尾帧生成模式

### 2.4 设置页面重构
- [x] 2.4.1 使用 Antd Tabs 分区（LLM / TTI / ITV / TTS / 存储）
- [x] 2.4.2 使用 Antd Form 重写表单
- [x] 2.4.3 添加 Provider 选择下拉框（动态加载字段）
- [x] 2.4.4 实现「测试连接」按钮
- [x] 2.4.5 实现配置导入/导出功能
- [x] 2.4.6 实现 API Key 加密存储
- [x] 2.4.7 添加「存储设置」Tab（存储根目录、清理缓存、空间统计）
- [x] 2.4.8 实现自定义 OpenAI 兼容渠道管理

## 阶段 3：剪辑页面重构

### 3.1 引擎层迁移
- [x] 3.1.1 创建 src/engine/MediaEngine.ts
- [x] 3.1.2 创建 src/engine/VideoRenderer.ts
- [x] 3.1.3 创建 src/engine/AudioController.ts
- [x] 3.1.4 创建 src/engine/keyframe.ts（缓动函数 + 关键帧操作）
- [x] 3.1.5 创建 src/engine/index.ts 统一导出

### 3.2 组件迁移
- [x] 3.2.1 迁移 Timeline.tsx（核心 37KB 组件）
- [x] 3.2.2 迁移 TimelineEditor.css 样式
- [x] 3.2.3 迁移 Player.tsx 播放器组件
- [x] 3.2.4 迁移 Sidebar.tsx 素材库
- [x] 3.2.5 迁移 PropertiesPanel.tsx 属性面板
- [x] 3.2.6 迁移 Icons.ts 图标定义（已使用 @ant-design/icons）
- [x] 3.2.7 迁移 WindowControls.tsx 窗口控制

### 3.3 App.tsx 重构
- [x] 3.3.1 实现页面路由状态（WorkflowLauncher / Editor / Export）
- [x] 3.3.2 实现编辑器状态管理（tracks, assets, currentTime 等）
- [x] 3.3.3 实现片段操作函数（add, update, move, delete）
- [x] 3.3.4 实现关键帧操作函数
- [x] 3.3.5 实现轨道操作函数（insert, delete）
- [x] 3.3.6 实现导出功能入口
- [x] 3.3.7 删除旧 VideoEditor.tsx（已迁移到 editor/）
- [x] 3.3.8 集成项目自动保存（防抖）

## 阶段 4：UI 组件改造

### 4.1 布局组件
- [x] 4.1.1 App 外层使用 Antd ConfigProvider
- [x] 4.1.2 改造侧边导航使用 Antd Menu
- [x] 4.1.3 改造模态框使用 Antd Modal

### 4.2 现有组件改造
- [x] 4.2.1 改造 AssetManager.tsx 使用 Antd Tabs + Card
- [x] 4.2.2 改造 Storyboard.tsx 使用 Antd 组件
- [x] 4.2.3 改造 CreateProjectModal 使用 Antd Form + Modal
- [x] 4.2.4 统一按钮样式为 Antd Button
- [x] 4.2.5 统一输入框样式为 Antd Input

## 阶段 5：工作流系统

### 5.1 工作流架构
- [x] 5.1.1 创建 src/workflow/workflowManager.ts
- [x] 5.1.2 定义 WorkflowExecutor 接口
- [x] 5.1.3 实现工作流注册表

### 5.2 分镜渲染工作流
- [x] 5.2.1 创建 src/workflow/shotRenderWorkflow.ts
- [x] 5.2.2 实现单镜头渲染逻辑（图 → 音 → 视）
- [x] 5.2.3 实现批量渲染逻辑
- [x] 5.2.4 实现渲染结果存储到 shots/{shotId}/versions/

### 5.3 分镜确认流转
- [x] 5.3.1 在 Storyboard 添加「确认」按钮
- [x] 5.3.2 实现 confirmed 状态切换
- [x] 5.3.3 实现自动入轨函数（confirmed shots → timeline）

### 5.4 AI 剧本处理（核心）

#### 5.4.1 剧本工作室
- [x] 5.4.1.1 创建 src/components/ScriptWorkshop.tsx 剧本编辑器
- [x] 5.4.1.2 实现剧本文本输入和保存
- [x] 5.4.1.3 实现剧本文件导入（.txt, .md, .fountain）
- [x] 5.4.1.4 实现剧本版本历史管理

#### 5.4.2 剧本生成（Idea → Script）
- [x] 5.4.2.1 创建 src/workflow/scriptGenerator.ts
- [x] 5.4.2.2 实现「从 Idea 生成剧本」LLM 调用
- [x] 5.4.2.3 实现风格选择（搞笑/悬疑/治愈等）
- [x] 5.4.2.4 实现「AI 润色剧本」功能

#### 5.4.3 分镜拆解（Script → Shot List）
- [x] 5.4.3.1 创建 src/workflow/shotListGenerator.ts
- [x] 5.4.3.2 定义 Shot List JSON Schema
- [x] 5.4.3.3 实现剧本分析 LLM Prompt 模板
- [x] 5.4.3.4 实现「生成分镜列表」LLM 调用
- [x] 5.4.3.5 实现分镜 TTI Prompt 自动生成
- [x] 5.4.3.6 实现分镜手动编辑（插入/删除/合并）

#### 5.4.4 角色/场景/道具提取
- [x] 5.4.4.1 创建 src/services/entityExtractor.ts
- [x] 5.4.4.2 实现角色自动识别 LLM 调用
- [x] 5.4.4.3 实现场景自动识别 LLM 调用
- [x] 5.4.4.4 实现道具自动识别 LLM 调用
- [x] 5.4.4.5 实现角色/场景/道具与项目库关联

#### 5.4.5 Prompt 模板管理
- [x] 5.4.5.1 创建 src/store/promptTemplates.ts
- [x] 5.4.5.2 实现默认 Prompt 模板（剧本生成、分镜拆解、角色提取）
- [x] 5.4.5.3 实现 Prompt 模板自定义和重置
- [x] 5.4.5.4 在设置页面添加「Prompt 模板」配置区

## 阶段 6：Manju-DSL 协议

- [x] 6.1 定义 src/manju-dsl/protocol.ts Schema
- [x] 6.2 实现 exportToManjuDSL() 函数
- [x] 6.3 实现 importFromManjuDSL() 函数
- [x] 6.4 实现项目保存/加载逻辑（与 projectStore 集成）

## 阶段 7：验证与测试

- [ ] 7.1 验证 Electron 开发模式启动
- [ ] 7.2 验证 Antd 主题一致性
- [ ] 7.3 验证时间线基本交互
- [ ] 7.4 验证关键帧动画系统
- [ ] 7.5 验证项目本地存储完整流程
- [ ] 7.6 验证模型 Provider 切换
- [ ] 7.7 验证存储路径修改和迁移
- [ ] 7.8 验证素材导入和清理
- [ ] 7.9 验证分镜版本管理
- [ ] 7.10 验证项目导入/导出 (.koma.zip)
- [ ] 7.11 修复样式冲突
