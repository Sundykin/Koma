## Why

当前 Koma Studio 采用线性流程（剧本 → 资产 → 分镜 → 剪辑），用户必须按顺序完成每个步骤才能进入下一步。但实际创作场景中，分镜（Shot）才是核心产出物——一切工作最终都为了生成高质量分镜。线性流程限制了灵活性，增加了认知负担，尤其对于已有素材或只需局部调整的用户。

参考同类竞品（如截图中的漫剧工具），以分镜为中心、右侧提供工具面板弹出工作流的模式，能让用户在一个视图中完成所有操作，显著提升创作效率。同时，剪辑应变为可选流程——用户可直接按分镜顺序导出视频或剪映草稿，无需进入编辑器。

## What Changes

- **工作流重构**：废弃线性三步流程（assets → storyboard → video），改为以分镜视图为主界面，资产管理、剧本处理、提示词推理等作为右侧弹出工具面板
- **分镜视图增强**：
  - 放大图片/视频显示区域，提升视觉体验
  - 增大提示词输入区域，支持更丰富的编辑
  - 参考竞品布局：左侧场景列表 + 中间大幅预览 + 右侧提示词/参数面板
- **右侧工具面板系统**：提供可弹出的小面板工作流：
  - 剧本导入与解析（从文本/文件导入，AI 拆分分镜）
  - 角色/场景/道具提取与管理
  - 章节提示词批量推理
  - 风格设置与切换
  - 导出（视频/剪映草稿/图片序列）
- **导出直出**：分镜视图直接提供导出入口，可按分镜顺序导出为视频或剪映草稿，剪辑编辑器降级为可选高级功能
- **提示词模板增强**：整合竞品的多级提示词体系（剧本转换模板、推理模板、改写模板等），扩展内置模板覆盖更多创作场景
- **风格设置增强**：在分镜视图工具面板中集成风格快速切换，支持从全局风格库中选择或自定义

## Capabilities

### New Capabilities
- `storyboard-workspace`: 以分镜为中心的主工作区，替代原有三步线性流程，包含分镜列表、大幅预览、工具面板入口
- `tool-panel-system`: 右侧弹出式工具面板框架，承载剧本导入、资产管理、推理、风格、导出等工作流子面板
- `storyboard-quick-export`: 分镜视图内直接导出能力（按分镜顺序导出视频/剪映草稿/图片序列），无需进入编辑器

### Modified Capabilities
- `ui-layout`: 主界面布局从三步导航改为分镜中心 + 工具面板布局
- `prompt-templates`: 扩展提示词模板体系，整合竞品多级模板（剧本转换、章节推理、内容精炼等）
- `visual-style-management`: 在工具面板中集成风格快速切换和预览
- `script-processing`: 从独立步骤改为工具面板中的子流程，支持渐进式导入和解析
- `export`: 增加分镜直出导出路径，与编辑器导出并存

## Impact

- **frontend/src/components/storyboard/**: 核心重构，ShotCard 布局调整、新增工具面板容器
- **frontend/src/components/editor/**: EditorView 三步导航逻辑重构，编辑器降为可选
- **frontend/src/App.tsx**: 视图路由和导航逻辑调整
- **frontend/src/store/**: projectStore 步骤进度逻辑简化
- **frontend/src/constants/storyboardConstants.ts**: 列布局比例重新定义
- **frontend/src/store/promptTemplates.ts**: 新增/扩展模板定义
- **frontend/src/components/common/Sidebar.tsx**: 导航项变更
- **frontend/src/services/draftExport/**: 新增分镜直出导出服务
