# Tasks: 重构项目入口和剧集驱动的创作流程

## Phase 1: 项目概览页面

- [x] 1.1 创建 ProjectOverview 组件，包含项目信息展示区
- [x] 1.2 在 ProjectOverview 中集成 EpisodeManager（作为核心内容）
- [x] 1.3 在 ProjectOverview 中集成 ThemeSelector
- [x] 1.4 添加"快速设置"区域：项目名称、题材、媒体配置入口

## Phase 2: 修改项目入口逻辑

- [x] 2.1 修改 App.tsx 中 handleSelectProject，进入 overview 视图而非 editor
- [x] 2.2 新增 view 状态值 'overview'
- [x] 2.3 在 overview 视图中渲染 ProjectOverview 组件

## Phase 3: 剧集驱动的创作流程

- [x] 3.1 EpisodeManager 添加"进入创作"按钮，触发进入该集的创作流程
- [x] 3.2 修改 App.tsx 支持 activeEpisode 状态
- [x] 3.3 editor 视图根据 activeEpisode 加载该集的数据（scriptText、analysisData 等）
- [x] 3.4 StepNavigator 显示当前正在编辑的剧集信息
- [x] 3.5 修改顶部面包屑：首页 > 项目名 > 第X集

## Phase 4: ThemeSelector 样式重构

- [x] 4.1 将卡片背景改为暗色系（#1a1a1a 等）
- [x] 4.2 选中状态使用绿色边框高亮
- [x] 4.3 调整字体颜色为浅色
- [x] 4.4 优化自定义风格输入区域样式

## Phase 5: 数据存储层重构

- [x] 5.1 修改 projectStore 支持按剧集加载/保存创作数据
- [x] 5.2 实现 episodes/{id}/script.md 剧集剧本存储
- [x] 5.3 实现 episodes/{id}/analysis.json 剧集解析结果存储
- [x] 5.4 实现 episodes/{id}/shots/ 剧集分镜存储
- [x] 5.5 重构资产存储路径为 assets/{type}/{id}/

## Phase 6: 资产引用机制

- [x] 6.1 扩展 AssetMetadata 类型，添加 episodeRefs 字段
- [x] 6.2 实现资产引用更新逻辑：addEpisodeRef / removeEpisodeRef
- [x] 6.3 剧集解析时使用 AssetReference 引用而非复制
- [x] 6.4 实现资产指纹计算 calculateAssetFingerprint

## Phase 7: AI 自动剧集服务

- [x] 7.1 创建 EpisodeSplitService 服务类
- [x] 7.2 实现剧本分析 analyzeScript 方法
- [x] 7.3 实现剧集执行 splitScript 方法
- [x] 7.4 实现 ContextManager 上下文管理
- [x] 7.5 实现上下文压缩策略

## Phase 8: 资产匹配与去重

- [x] 8.1 创建 AssetMatcher 服务类
- [x] 8.2 实现 findMatch 资产匹配逻辑
- [x] 8.3 实现 calculateSimilarity 相似度计算
- [x] 8.4 在分析 Prompt 中加入已有资产列表
- [x] 8.5 实现未引用资产清理功能

## Phase 9: UI 组件集成

- [x] 9.1 创建 EpisodeSplitWizard 剧集向导组件
- [x] 9.2 创建 AssetMatchConfirm 资产匹配确认组件
- [x] 9.3 在 ProjectOverview 添加资产总览区域
- [x] 9.4 资产卡片显示跨集使用情况

## Checklist

- [x] All tasks completed
- [ ] Manual testing passed
- [ ] 项目入口流程验证：项目列表 → 项目概览 → 选集进入创作
- [ ] AI 剧集流程验证：上传剧本 → 分析 → 确认剧集 → 批量创建
- [ ] 资产复用验证：多集分析时自动识别并复用角色
