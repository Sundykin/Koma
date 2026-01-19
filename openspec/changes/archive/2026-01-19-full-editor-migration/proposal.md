# Full Editor Migration Proposal

## 概述
完整复刻 electron-egg 项目中的视频编辑器到 Koma，并适配当前项目的数据结构和文件协议。

## 问题
1. 之前的迁移只是简化版，缺少大量功能：
   - 属性面板（PropertiesPanel）
   - 侧边栏素材库（Sidebar）
   - 完整的右键菜单
   - 关键帧动画系统
   - 碰撞检测算法
   - 跨轨道拖拽
   - 轨道间隙拖拽
   - 复制/删除快捷键
   - 自动打帧功能

2. 文件协议 Bug：本地资源使用 `file:///` 协议无法加载，应使用 `koma-local://` 协议

3. Antd API 废弃警告：`destroyOnClose` 应改为 `destroyOnHidden`

## 目标
1. 100% 复刻 electron-egg 编辑器的所有功能（约 3000 行代码）
2. 适配 Koma 的 Shot 数据结构
3. 修复文件协议问题
4. 修复 Antd 废弃 API

## 范围

### 需要迁移的组件（来自 electron-egg）
| 文件 | 行数 | 功能 |
|------|------|------|
| App.tsx (编辑器主体) | 800 | 轨道管理、碰撞检测、拖放处理 |
| Timeline.tsx | 915 | 时间线完整交互、右键菜单、拖拽 |
| Player.tsx | 166 | 播放器组件 |
| PropertiesPanel.tsx | 249 | 属性编辑面板 |
| Sidebar.tsx | 247 | 素材库侧边栏 |
| MediaEngine.ts | 148 | 播放引擎 |
| VideoRenderer.ts | 306 | Canvas 渲染器 |
| AudioController.ts | 182 | 音频控制器 |
| keyframe.ts | 235 | 关键帧系统 |
| types.ts | 165 | 类型定义 |

### 需要适配的部分
- Shot → Track/Clip 转换逻辑
- 文件路径使用 `electronService.fs.toLocalUrl()` 转换
- 与 Koma 现有 UI 风格统一

### 需要修复的 Bug
1. `destroyOnClose` → `destroyOnHidden`（4 处）
2. 本地文件路径转换

## 非目标
- 不修改 electron-egg 原有的业务逻辑
- 不增加新功能

## 验收标准
1. 所有 electron-egg 编辑器功能在 Koma 中可用
2. 本地图片/视频可正常加载显示
3. 无 TypeScript 编译错误
4. 无 Antd 废弃 API 警告
