# Proposal: migrate-electron-egg-editor

## 概述

将 electron-egg 项目中经过验证的高性能视频编辑器完整迁移到 Koma 项目，替换当前性能不佳的编辑器实现。

## 背景

当前 Koma 编辑器存在严重性能问题：
- 拖拽 Clip 时 UI 极度卡顿
- 播放时帧率不稳定
- 多次优化尝试后仍无法达到可用标准

electron-egg 编辑器特点：
- 简洁的单文件状态管理（App.tsx 集中管理）
- 清晰的引擎架构（MediaEngine + VideoRenderer + AudioController）
- 经过验证的关键帧动画系统
- 良好的性能表现

## 迁移策略

**反向适配**：将 electron-egg 代码迁移过来，然后适配 Koma 的数据结构和业务需求，而非修复现有实现。

## 范围

### 迁移内容

| 模块 | electron-egg 文件 | 迁移目标 |
|------|------------------|---------|
| 时间轴 | Timeline.tsx | components/editor/Timeline/ |
| 播放器 | Player.tsx | components/editor/Player.tsx |
| 引擎 | engine/*.ts | engine/*.ts |
| 关键帧 | engine/keyframe.ts | engine/keyframe.ts |
| 类型 | types.ts | types/editor.ts |

### 保留内容

- Koma 的 Shot/Project 数据模型
- Koma 的路由和页面结构
- Koma 的资源管理（resourceStore）
- Koma 的项目配置

### 需要适配

- electron-egg 的 Asset → Koma 的 Resource
- electron-egg 的 Track/Clip → 适配 Shot 数据
- 引擎绑定到 Koma 的组件生命周期

## 风险

1. **类型不兼容**：electron-egg 使用不同的类型定义
2. **依赖差异**：可能需要安装额外依赖
3. **集成复杂度**：与现有 Shot 系统的对接

## 验收标准

- [ ] 拖拽 Clip 流畅（无明显卡顿）
- [ ] 播放帧率稳定 60fps
- [ ] 关键帧动画正常工作
- [ ] Shot 数据能正确导入到时间轴
- [ ] 资源拖放功能正常

## 相关文件

- 备份位置：`frontend/src/components/editor_backup_20260119/`
- 备份位置：`frontend/src/engine_backup_20260119/`
- 备份位置：`frontend/src/store_backup_20260119/`
