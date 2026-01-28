# Change: 重构项目入口和剧集驱动的创作流程

## Why
当前项目入口直接进入剧本编辑，跳过了项目设置和剧集规划。剧集管理功能虽已实现但未真正驱动创作流程，导致剧集功能形同虚设。此外，主题风格选择器的卡片样式与整体暗色系 UI 不搭配。

更重要的是，当前数据架构仅支持项目级关联，无法实现剧集级别的数据隔离和管理。资产（角色/场景/道具）缺乏跨集复用机制，可能导致重复创建。

## What Changes

### 1. 项目入口改造
- 点击项目后进入"项目概览"页面，而非直接进入剧本编辑
- 项目概览页面显示：项目设置、剧集列表、主题风格选择、资产总览
- 用户在此完成项目配置和剧集规划后，再选择某一集进入创作流程

### 2. 剧集驱动的创作流程
- 每集独立拥有完整的创作流程：剧本 → 资产 → 分镜 → 剪辑
- 剧集列表显示每集的状态进度
- 选择某一集后才进入该集的 StepNavigator 创作流程

### 3. 主题风格选择器样式重构
- 卡片改为暗色系风格，与整体 UI 保持一致
- 增加预览图展示（如有配置）
- 选中状态使用绿色高亮（与品牌色一致）

### 4. 数据架构重构
- 建立 Project → Assets → Episodes 层级数据模型
- 资产存储在项目级 `assets/` 目录，支持跨集复用
- 剧集数据存储在 `episodes/{id}/` 目录，包含剧本、解析结果、分镜等
- 资产通过引用（AssetReference）关联到剧集，而非复制

### 5. AI 自动剧集
- 支持上传完整剧本，AI 分析并建议剧集方案
- 多轮 LLM 对话实现逐集处理
- 上下文管理与压缩，防止超出 token 限制
- 自动识别跨集复用的角色/场景/道具

### 6. 资产匹配与去重
- 分析新剧集时自动匹配已有资产
- 高置信度匹配自动复用，中置信度需用户确认
- 资产指纹计算用于快速去重
- 支持清理未引用的资产

## Impact
- Affected specs: ui-components, script-processing, storage
- Affected code:
  - `frontend/src/App.tsx` - 新增项目概览视图，重构路由逻辑
  - `frontend/src/components/ProjectOverview.tsx` - 新建项目概览组件
  - `frontend/src/components/EpisodeManager.tsx` - 增强为创作入口
  - `frontend/src/components/ThemeSelector.tsx` - 样式重构
  - `frontend/src/components/EpisodeSplitWizard.tsx` - 新建剧集向导组件
  - `frontend/src/components/AssetMatchConfirm.tsx` - 新建资产匹配确认组件
  - `frontend/src/services/EpisodeSplitService.ts` - 新建 AI 剧集服务
  - `frontend/src/services/AssetMatcher.ts` - 新建资产匹配服务
  - `frontend/src/services/ContextManager.ts` - 新建上下文管理服务
  - `frontend/src/store/projectStore.ts` - 重构支持剧集级数据
  - `frontend/src/types.ts` - 扩展类型定义

## Design
详见 [design.md](./design.md)
