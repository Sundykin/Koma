# Proposal: enhance-video-editor

## 概述
融合 capcut-ai-clone 和 CcClip-master 两个项目的剪辑能力，将 Koma 的视频编辑器升级为功能完整的专业级剪辑工具。

## 背景
当前 Koma 的剪辑页面是基于 capcut-ai-clone 简化迁移的版本，缺少：
- 完整的资源加载与管理能力
- FFmpeg 媒体处理集成
- 真实的音视频播放同步
- 完善的轨道交互（拖拽、裁剪、吸附）
- 导出渲染功能

## 参考项目能力对比

### capcut-ai-clone 优势
- 完整的关键帧动画系统（7种缓动曲线）
- MediaEngine/VideoRenderer/AudioController 三层引擎架构
- Canvas 合成渲染
- 工作流驱动架构
- AI 集成（Gemini 文生图、脚本生成）
- 碰撞检测与轨道管理

### CcClip-master 优势
- 完善的 FFmpeg 集成（WASM + 本地二进制）
- 帧级精确编辑
- 音频波形可视化
- 视频抽帧预览
- 非破坏性裁剪（offsetL/offsetR）
- 任务队列机制
- 属性配置化系统

## 目标
1. 完整的资源导入与管理（视频、音频、图片、文本）
2. 帧级精确的多轨道编辑
3. 真实的音视频同步播放
4. FFmpeg 媒体处理（抽帧、波形、转码）
5. 完善的拖拽交互（移动、裁剪、吸附）
6. 关键帧动画系统
7. 导出渲染功能
8. 属性面板动态配置

## 非目标
- 不实现滤镜/特效系统（后续提案）
- 不实现转场效果（后续提案）
- 不实现字幕编辑器（后续提案）

## 技术方案
见 design.md

## 任务拆解
见 tasks.md

## 风险
- FFmpeg WASM 性能在大文件上可能受限
- Canvas 渲染可能在高分辨率下有性能瓶颈
- Electron IPC 通信需要处理大文件传输

## 依赖
- add-antd-timeline-editor（已完成 95%）
