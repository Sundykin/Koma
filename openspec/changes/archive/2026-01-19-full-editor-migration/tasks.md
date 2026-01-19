# Tasks

## Phase 1: Bug 修复 (预计: 4 处修改)
- [ ] 1.1 修复 `destroyOnClose` 废弃警告
  - `CreateCharacterModal.tsx:89` → `destroyOnHidden`
  - `VideoCardGrid.tsx:139` → `destroyOnHidden`
  - `VideoVersionList.tsx:247` → `destroyOnHidden`
  - `VideoVersionList.tsx:331` → `destroyOnHidden`

## Phase 2: 类型定义完善 (types/editor.ts)
- [ ] 2.1 完善类型定义，确保与 electron-egg 一致
  - AnimatableProperty 类型
  - 完整的 Keyframe 接口
  - Asset 接口完善

## Phase 3: 关键帧系统 (engine/keyframe.ts)
- [ ] 3.1 创建完整的关键帧工具模块
  - addKeyframe() - 添加关键帧
  - updateKeyframe() - 更新关键帧
  - removeKeyframe() - 删除关键帧
  - getKeyframeAtTime() - 查询关键帧
  - interpolate() - 插值计算
  - getAnimatedValues() - 获取动画值
  - autoKeyframe() - 自动打帧
  - 7 种缓动函数实现

## Phase 4: 引擎增强 (engine/)
- [ ] 4.1 增强 simpleEngine.ts
  - 完善事件系统
  - 添加 playRate 支持
  - 确保媒体预加载使用 `toLocalUrl()`

## Phase 5: 属性面板 (components/editor/PropertiesPanel.tsx)
- [ ] 5.1 创建属性编辑面板
  - 缩放滑块 (0.1-3.0)
  - X/Y 位置输入
  - 旋转滑块 (-180°~180°)
  - 不透明度滑块 (0-100%)
  - 关键帧控制按钮
  - 自动打帧支持
  - 片段信息显示

## Phase 6: 侧边栏 (components/editor/Sidebar.tsx)
- [ ] 6.1 创建素材库侧边栏
  - Media 标签页（图片/视频网格）
  - Audio 标签页
  - Text 标签页（预设文字样式）
  - 拖拽到时间线支持

## Phase 7: 时间线增强 (components/editor/SimpleTimeline.tsx)
- [ ] 7.1 完善时间线交互
  - 右键菜单（添加关键帧、复制、删除）
  - 关键帧菱形标记显示
  - 关键帧选中/右键菜单
  - 缓动曲线选择
  - 左右边界缩放 (resize handles)
  - 播放头悬浮时间提示
  - 轨道间隙拖放（创建新轨道）

## Phase 8: 主编辑器增强 (components/editor/SimpleEditor.tsx)
- [ ] 8.1 完善主编辑器
  - 集成 PropertiesPanel
  - 集成 Sidebar
  - 碰撞检测算法
  - 跨轨道拖拽
  - 轨道间隙处理
  - 键盘快捷键 (K/Ctrl+D/Del)
  - 工具栏（播放控制、时间显示）
  - 文件路径 `toLocalUrl()` 转换

## Phase 9: 播放器增强 (components/editor/SimplePlayer.tsx)
- [ ] 9.1 增强播放器
  - 确保媒体 src 使用 `toLocalUrl()`
  - 播放速率控制
  - 响应式布局

## Phase 10: 集成与测试
- [ ] 10.1 集成到 App.tsx
- [ ] 10.2 TypeScript 编译检查
- [ ] 10.3 功能测试
  - 素材拖放
  - 片段编辑
  - 关键帧动画
  - 播放预览
  - 本地文件加载

## 依赖关系
```
Phase 1 (独立)
Phase 2 → Phase 3 → Phase 4
Phase 2 → Phase 5
Phase 2 → Phase 6
Phase 2 → Phase 7
Phase 3,5,6,7 → Phase 8
Phase 4 → Phase 9
Phase 8,9 → Phase 10
```

## 文件变更清单
### 修改
- `CreateCharacterModal.tsx` - destroyOnHidden
- `VideoCardGrid.tsx` - destroyOnHidden
- `VideoVersionList.tsx` - destroyOnHidden (2处)
- `types/editor.ts` - 类型完善
- `engine/simpleEngine.ts` - 引擎增强
- `components/editor/SimpleTimeline.tsx` - 交互增强
- `components/editor/SimpleEditor.tsx` - 功能增强
- `components/editor/SimplePlayer.tsx` - 协议修复
- `components/editor/index.ts` - 导出更新

### 新增
- `engine/keyframe.ts` - 关键帧系统
- `components/editor/PropertiesPanel.tsx` - 属性面板
- `components/editor/Sidebar.tsx` - 素材侧边栏
