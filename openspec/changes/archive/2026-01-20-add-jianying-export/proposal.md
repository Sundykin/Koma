# Change: 添加可扩展的草稿导出系统

## Why

当前项目 SimpleEditor 已经具备了完整的时间线编辑能力，但只能通过 FFmpeg 导出最终视频。用户希望能够导出为专业剪辑软件的草稿格式，以便：
1. 在剪映/Premiere/达芬奇等软件中进行更精细的后期处理
2. 利用各软件的特有功能（特效、滤镜、转场）
3. 与使用不同剪辑软件的团队成员协作

## What Changes

- **新增草稿导出器抽象层**: 定义 `DraftExporter` 接口，支持多种导出格式
- **新增坐标转换器**: 抽象坐标系统转换逻辑，不同软件使用不同的坐标系
- **新增剪映导出器**: 实现 `JianyingExporter`，作为第一个具体实现
- **扩展导出对话框**: 支持选择导出格式（MP4 / 剪映草稿 / 未来更多格式）
- **保持编辑器数据不变**: 所有转换在导出层完成，不影响现有数据结构

## Impact

- Affected specs: `video-export`
- Affected code:
  - `frontend/src/services/draftExport/` (新增目录)
    - `types.ts` - 导出器接口定义
    - `coordinateTransform.ts` - 坐标转换抽象
    - `JianyingExporter.ts` - 剪映导出实现
    - `index.ts` - 导出器注册表
  - `frontend/src/types/jianying.ts` (新增)
  - `frontend/src/components/editor/SimpleExportDialog.tsx` (修改)
