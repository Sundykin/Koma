# 剪映/PR 导出格式

## Summary
实现项目导出为主流视频编辑软件可识别的格式，包括剪映草稿、Premiere Pro XML、DaVinci Resolve 项目等，使用户可以在专业编辑软件中进行二次加工。

## Motivation
DOC.md 路线图第四阶段要求「导出工程文件至剪映/PR」。漫剧创作者可能需要在 Koma 完成 AI 生成后，使用专业软件进行精细调整、添加复杂特效或与其他素材混剪。导出功能打通了 AI 生成与传统后期的工作流。

## Approach

### 1. 时间线数据映射
- Track → 编辑器轨道
- Clip → 编辑器片段
- Keyframe → 编辑器关键帧（有限支持）
- 字幕 → SRT/字幕轨

### 2. 支持的导出格式
- **剪映草稿** (draft_content.json) - 国内主流
- **Premiere Pro XML** (FCP XML 7) - 行业标准
- **DaVinci Resolve** (.drp 或 XML)
- **通用 EDL** (Edit Decision List)

### 3. 资源打包
- 素材文件复制到导出目录
- 相对路径重写
- 保持目录结构

### 4. 限制与对齐
- 不支持的功能降级处理
- 关键帧曲线近似转换
- 帧率/分辨率对齐

## Specs
- `specs/export/spec.md` - 导出功能详细规范

## Tasks
见 `tasks.md`

## Dependencies
- Phase 1: add-antd-timeline-editor（时间线数据结构）
