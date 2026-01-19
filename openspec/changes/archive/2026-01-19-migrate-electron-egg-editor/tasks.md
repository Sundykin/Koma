# Tasks: migrate-electron-egg-editor

## Phase 1: 类型定义迁移

### 1.1 核心类型
- [ ] 1.1.1 复制 electron-egg/frontend/src/types.ts 到 Koma
- [ ] 1.1.2 重命名为 types/editor.ts
- [ ] 1.1.3 移除 Koma 不需要的类型（如 jianying 相关）
- [ ] 1.1.4 添加与现有类型的兼容导出

## Phase 2: 引擎迁移

### 2.1 MediaEngine
- [ ] 2.1.1 复制 engine/MediaEngine.ts
- [ ] 2.1.2 适配新的 types 导入路径
- [ ] 2.1.3 验证事件系统正常

### 2.2 VideoRenderer
- [ ] 2.2.1 复制 engine/VideoRenderer.ts
- [ ] 2.2.2 适配 keyframe 导入
- [ ] 2.2.3 验证 Canvas 渲染正常

### 2.3 AudioController
- [ ] 2.3.1 复制 engine/AudioController.ts
- [ ] 2.3.2 验证音频同步正常

### 2.4 关键帧系统
- [ ] 2.4.1 复制 engine/keyframe.ts
- [ ] 2.4.2 验证插值计算正常

## Phase 3: Timeline 组件迁移

### 3.1 核心组件
- [ ] 3.1.1 复制 Timeline.tsx 到 components/editor/
- [ ] 3.1.2 移除 electron-egg 特有的引用（如 lucide-react 替换为 antd icons）
- [ ] 3.1.3 适配 Koma 的样式系统
- [ ] 3.1.4 验证 Clip 拖拽功能

### 3.2 拖拽系统
- [ ] 3.2.1 验证拖拽阈值检测
- [ ] 3.2.2 验证跨轨道拖拽
- [ ] 3.2.3 验证 Clip 缩放（trim）

### 3.3 播放头
- [ ] 3.3.1 验证播放头拖拽
- [ ] 3.3.2 验证时间刻度点击定位

## Phase 4: Player 组件迁移

### 4.1 核心组件
- [ ] 4.1.1 复制 Player.tsx 到 components/editor/
- [ ] 4.1.2 绑定 MediaEngine
- [ ] 4.1.3 适配控制按钮样式

### 4.2 播放控制
- [ ] 4.2.1 验证播放/暂停
- [ ] 4.2.2 验证 seek
- [ ] 4.2.3 验证帧步进

## Phase 5: 状态管理适配

### 5.1 创建 editorStore
- [ ] 5.1.1 创建 store/editorStore.ts
- [ ] 5.1.2 实现核心状态（tracks, currentTime, isPlaying）
- [ ] 5.1.3 实现 actions（setTracks, updateClip, etc.）

### 5.2 数据适配器
- [ ] 5.2.1 创建 utils/shotAdapter.ts
- [ ] 5.2.2 实现 shotsToTracks 函数
- [ ] 5.2.3 实现 tracksToShots 函数（如需要）

## Phase 6: 集成

### 6.1 VideoEditor 重构
- [ ] 6.1.1 重写 VideoEditor.tsx 使用新组件
- [ ] 6.1.2 集成 editorStore
- [ ] 6.1.3 集成 Shot 数据导入

### 6.2 Sidebar 适配
- [ ] 6.2.1 适配 Sidebar 的资源拖放
- [ ] 6.2.2 适配 PropertiesPanel（如需要）

## Phase 7: 测试验证

### 7.1 性能测试
- [ ] 7.1.1 测试 Clip 拖拽流畅度
- [ ] 7.1.2 测试播放帧率
- [ ] 7.1.3 测试长时间播放内存

### 7.2 功能测试
- [ ] 7.2.1 测试 Shot 导入
- [ ] 7.2.2 测试资源拖放
- [ ] 7.2.3 测试关键帧动画
- [ ] 7.2.4 测试音视频同步

### 7.3 回归测试
- [ ] 7.3.1 测试页面切换
- [ ] 7.3.2 测试项目保存/加载
- [ ] 7.3.3 测试导出功能

## 清理

### 8.1 移除旧代码
- [ ] 8.1.1 确认新编辑器稳定后删除备份
- [ ] 8.1.2 移除未使用的 trackStore 代码
- [ ] 8.1.3 更新相关文档
