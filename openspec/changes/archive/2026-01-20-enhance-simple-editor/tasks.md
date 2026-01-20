# 任务清单

## Phase 1: 代码清理 - 删除 VideoEditor

### 1.1 删除冗余组件
- [x] 1.1.1 删除 `components/editor/VideoEditor.tsx`
- [x] 1.1.2 删除 `components/editor/Player.tsx`
- [x] 1.1.3 删除 `components/editor/Sidebar.tsx`
- [x] 1.1.4 删除 `components/editor/EnhancedPlayer.tsx`
- [x] 1.1.5 评估 `components/editor/Timeline/` 目录，删除仅被 VideoEditor 使用的文件

### 1.2 更新导出和引用
- [x] 1.2.1 更新 `components/editor/index.ts` 移除删除组件的导出
- [x] 1.2.2 全局搜索 VideoEditor 引用并移除
- [x] 1.2.3 检查 App.tsx 或路由配置中的 VideoEditor 使用

## Phase 2: 音频播放功能

### 2.1 扩展音频引擎
- [x] 2.1.1 `engine/simpleEngine.ts` - SimpleAudioController 增加视频音频播放支持
- [x] 2.1.2 实现音频元素池管理（预创建 HTMLAudioElement/HTMLVideoElement）
- [x] 2.1.3 实现播放同步（与 MediaEngine 帧循环同步）
- [x] 2.1.4 实现 seek 操作时的音频同步

### 2.2 集成到播放器
- [x] 2.2.1 `SimplePlayer.tsx` 在 tracks 变化时加载音频
- [x] 2.2.2 播放/暂停/seek 操作同步到音频控制器
- [x] 2.2.3 添加音量控制 UI（可选）
- [x] 2.2.4 测试音视频同步

## Phase 3: 预览区素材交互

### 3.1 变换控制框组件
- [x] 3.1.1 创建 `components/editor/TransformControl.tsx` - 变换控制框组件
- [x] 3.1.2 实现 8 点控制框（4 角 + 4 边中点）
- [x] 3.1.3 实现旋转手柄（顶部中点上方）
- [x] 3.1.4 实现控制点拖拽回调

### 3.2 集成到 SimplePlayer
- [x] 3.2.1 渲染选中素材的变换控制框
- [x] 3.2.2 实现拖拽移动（更新 clip.x, clip.y）
- [x] 3.2.3 实现角点等比缩放（更新 clip.scale）
- [x] 3.2.4 实现旋转操作（更新 clip.rotation）
- [x] 3.2.5 实时更新到 tracks 状态

### 3.3 视频比例选择器
- [x] 3.3.1 播放器工具栏增加比例选择下拉框
- [x] 3.3.2 支持预设比例：16:9、9:16、4:3、1:1
- [x] 3.3.3 Canvas 尺寸根据选择的比例调整
- [x] 3.3.4 渲染时应用正确的变换

## Phase 4: 字幕功能

### 4.1 字幕数据结构
- [x] 4.1.1 `types/editor.ts` 扩展 Clip 类型支持字幕属性
- [x] 4.1.2 定义字幕预设位置类型

### 4.2 字幕编辑 UI
- [x] 4.2.1 `SimplePropertiesPanel.tsx` 增加字幕编辑区
- [x] 4.2.2 字幕文本输入框
- [x] 4.2.3 字体选择（fontSize、fontFamily）
- [x] 4.2.4 颜色选择（fontColor、backgroundColor）
- [x] 4.2.5 位置预设选择

### 4.3 字幕渲染
- [x] 4.3.1 `SimpleVideoRenderer` 支持渲染字幕到 Canvas
- [x] 4.3.2 应用字幕样式（字体、颜色、位置）
- [x] 4.3.3 支持多行字幕自动换行

### 4.4 字幕导入（可选）
- [x] 4.4.1 支持导入 SRT 字幕文件
- [x] 4.4.2 解析 SRT 时间码和文本
- [x] 4.4.3 自动创建字幕轨道片段

## Phase 5: FFmpeg 视频导出

### 5.1 导出配置对话框
- [x] 5.1.1 更新 `ExportDialog.tsx` - 导出配置 UI
- [x] 5.1.2 分辨率选择（1080p、720p、480p、自定义）
- [x] 5.1.3 帧率选择（30fps、24fps、60fps）
- [x] 5.1.4 格式选择（MP4 H.264、WebM VP9）
- [x] 5.1.5 输出路径选择

### 5.2 渲染管线
- [x] 5.2.1 实现逐帧渲染到 Canvas
- [x] 5.2.2 Canvas 导出为 PNG/JPEG 图片
- [x] 5.2.3 图片序列保存到临时目录
- [x] 5.2.4 进度回调（当前帧/总帧数）

### 5.3 FFmpeg 合成
- [x] 5.3.1 `services/ffmpegManager.ts` 实现 `composeVideo()` 函数
- [x] 5.3.2 合成图片序列为视频
- [x] 5.3.3 混合多轨道音频
- [x] 5.3.4 合并视频和音频
- [x] 5.3.5 清理临时文件

### 5.4 导出流程集成
- [x] 5.4.1 导出按钮触发导出流程
- [x] 5.4.2 显示导出进度对话框
- [x] 5.4.3 支持取消导出
- [x] 5.4.4 导出完成后显示成功提示

## Phase 6: 素材上传功能

### 6.1 上传入口
- [x] 6.1.1 `SimpleAssetPanel.tsx` 增加「上传」按钮
- [x] 6.1.2 支持点击上传（文件选择对话框）
- [x] 6.1.3 支持拖拽文件到面板上传

### 6.2 上传处理
- [x] 6.2.1 文件类型检测（视频、图片、音频）
- [x] 6.2.2 复制文件到 `assets/uploads/` 目录
- [x] 6.2.3 视频/图片生成缩略图
- [x] 6.2.4 提取媒体元数据（时长、分辨率、编码）
- [x] 6.2.5 添加到素材列表并刷新 UI

### 6.3 素材管理
- [x] 6.3.1 上传的素材持久化到 `assets.json`
- [x] 6.3.2 支持删除已上传的素材
- [x] 6.3.3 支持重命名素材

## Phase 7: 时间线持久化修复

### 7.1 存储格式升级
- [x] 7.1.1 `types/editor.ts` 定义 `TimelinePersistence` 接口（包含 zoom、scrollLeft）
- [x] 7.1.2 版本号升级到 2

### 7.2 加载逻辑
- [x] 7.2.1 `SimpleEditor.tsx` 初始化时调用 `loadEpisodeTimeline`
- [x] 7.2.2 如果存在有效数据，恢复 tracks 和视图状态
- [x] 7.2.3 如果不存在，从 shots 初始化
- [x] 7.2.4 添加版本迁移逻辑

### 7.3 保存逻辑
- [x] 7.3.1 确保 saveEpisodeTimeline 正确保存所有状态
- [x] 7.3.2 保存 zoom 和 scrollLeft 状态
- [x] 7.3.3 验证防抖保存正常工作

## Phase 8: 动态时间刻度

### 8.1 刻度计算
- [x] 8.1.1 `SimpleTimeline.tsx` 根据内容时长计算总刻度范围
- [x] 8.1.2 添加缓冲区（内容时长 + 10 秒或 20%）
- [x] 8.1.3 根据缩放级别选择刻度间隔

### 8.2 刻度渲染
- [x] 8.2.1 主刻度和次刻度渲染
- [x] 8.2.2 刻度标签格式化（秒、分:秒）
- [x] 8.2.3 性能优化：只渲染可视区域的刻度

## Phase 9: 时间线缩放

### 9.1 缩放控制 UI
- [x] 9.1.1 工具栏增加缩放滑块（0.1x - 5x）
- [x] 9.1.2 显示当前缩放百分比
- [x] 9.1.3 缩放重置按钮（恢复 100%）

### 9.2 缩放交互
- [x] 9.2.1 实现 Ctrl + 滚轮缩放
- [x] 9.2.2 实现 +/- 快捷键缩放
- [x] 9.2.3 缩放以播放头（或鼠标位置）为中心

### 9.3 渲染适配
- [x] 9.3.1 PIXELS_PER_SECOND 根据 zoom 动态计算
- [x] 9.3.2 片段宽度根据缩放调整
- [x] 9.3.3 刻度间隔根据缩放调整

## Phase 10: 碰撞检测与吸附对齐

### 10.1 碰撞检测增强
- [x] 10.1.1 `utils/trackCollision.ts` 实现实时碰撞检测
- [x] 10.1.2 拖拽中显示碰撞警告（红色边框）
- [x] 10.1.3 释放时如有碰撞回退到原位置

### 10.2 吸附对齐实现
- [x] 10.2.1 定义吸附点类型（播放头、片段边界、刻度）
- [x] 10.2.2 计算当前拖拽位置附近的吸附点
- [x] 10.2.3 在阈值内自动吸附（10px）
- [x] 10.2.4 显示吸附辅助线

### 10.3 集成到 SimpleTimeline
- [x] 10.3.1 拖拽片段时调用吸附检测
- [x] 10.3.2 渲染吸附辅助线组件
- [x] 10.3.3 提供吸附开关设置

## Phase 11: 测试与优化

### 11.1 功能测试
- [x] 11.1.1 测试 VideoEditor 删除后无编译错误
- [x] 11.1.2 测试音频播放同步
- [x] 11.1.3 测试预览区素材交互
- [x] 11.1.4 测试字幕编辑和渲染
- [x] 11.1.5 测试视频导出完整流程
- [x] 11.1.6 测试素材上传
- [x] 11.1.7 测试时间线持久化恢复
- [x] 11.1.8 测试时间线缩放
- [x] 11.1.9 测试碰撞检测和吸附

### 11.2 性能优化
- [x] 11.2.1 音频预加载优化
- [x] 11.2.2 导出渲染性能优化
- [x] 11.2.3 大量片段时的渲染性能

---

## 完成状态

| Phase | 状态 | 说明 |
|-------|------|------|
| 1 | ✅ 已完成 | 删除 VideoEditor |
| 2 | ✅ 已完成 | 音频播放 |
| 3 | ✅ 已完成 | 预览区交互 |
| 4 | ✅ 已完成 | 字幕功能 |
| 5 | ✅ 已完成 | FFmpeg 导出 |
| 6 | ✅ 已完成 | 素材上传 |
| 7 | ✅ 已完成 | 持久化修复 |
| 8 | ✅ 已完成 | 动态刻度 |
| 9 | ✅ 已完成 | 时间线缩放 |
| 10 | ✅ 已完成 | 碰撞与吸附 |
| 11 | ✅ 已完成 | 测试优化 |

## 新增文件

- `components/editor/TransformControl.tsx` - 变换控制框组件
- `components/editor/SimpleExportDialog.tsx` - 导出对话框组件
- `services/simpleExportRenderer.ts` - 简洁版导出渲染器
- `services/uploadService.ts` - 素材上传服务

## 修改文件

- `engine/simpleEngine.ts` - 音频播放增强
- `components/editor/SimplePlayer.tsx` - 素材交互、比例选择
- `components/editor/SimpleTimeline.tsx` - 动态刻度、缩放、吸附
- `components/editor/SimpleEditor.tsx` - 持久化加载、上传集成
- `components/editor/SimplePropertiesPanel.tsx` - 字幕编辑
- `components/editor/SimpleAssetPanel.tsx` - 素材上传
- `components/editor/index.ts` - 导出更新
- `services/ffmpegManager.ts` - 视频合成
- `types/editor.ts` - 类型扩展
- `utils/trackCollision.ts` - 碰撞与吸附

## 删除文件

- `components/editor/VideoEditor.tsx`
- `components/editor/Player.tsx`
- `components/editor/Sidebar.tsx`
- `components/editor/EnhancedPlayer.tsx`
