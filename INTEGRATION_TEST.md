# Novel Promotion 集成测试指南

## 已完成的功能模块

### Phase 1-7: 前端 UI 组件 ✅
- ✅ Episode 管理器
- ✅ Stage 导航（Config → Script → Storyboard → Video → Editor）
- ✅ ConfigStage - 小说文本输入
- ✅ ScriptStage - 剧本分镜展示
- ✅ StoryboardStage - 分镜图展示
- ✅ VideoStage - 视频生成界面
- ✅ AssetLibrary - 资源库（角色/场景管理）

### Phase 8-9: 后端 Orchestrators ✅
- ✅ GraphExecutor - 节点图执行引擎
- ✅ StoryToScriptOrchestrator - 小说→剧本编排器
- ✅ ScriptToStoryboardOrchestrator - 剧本→分镜编排器
- ✅ Worker Handlers 集成

### Phase 10-11: 数据库 & IPC ✅
- ✅ NovelPromotionDbService - 完整数据库服务
- ✅ IPC Handlers - 18 个后端处理器
- ✅ Frontend Service - 类型安全的前端服务层

## 测试步骤

### 1. 启动应用
```bash
npm run dev
```

### 2. 创建项目
1. 点击左侧边栏 "项目" 图标
2. 创建新项目

### 3. 进入 Novel Promotion 模式
1. 点击左侧边栏 "📽️ 短剧" 图标（Film 图标）
2. 应该看到 Novel Promotion Workspace

### 4. 测试 Episode 管理
1. 点击 "创建 Episode" 按钮
2. 输入 Episode 名称
3. 验证 Episode 列表显示

### 5. 测试 Config Stage
1. 在文本框输入小说文本
2. 选择视频比例（16:9 或 9:16）
3. 输入主题（可选）
4. 点击 "生成剧本" 按钮

### 6. 测试资源库
1. 点击右上角 "📁 资源库" 按钮
2. 切换 "角色" / "场景" Tab
3. 测试添加角色/场景
4. 测试编辑和删除功能

## 已知限制

### 当前未实现的功能
1. **AI 工作流执行** - Workflow 任务提交到队列但未实际执行
2. **图片生成** - 角色/场景图片生成功能未连接
3. **视频生成** - Panel 视频生成功能未连接
4. **数据持久化** - 前端状态未连接到数据库（需要实现 hooks）

### 需要补充的集成点

#### 1. useEpisodeData Hook 实现
```typescript
// frontend/src/pages/NovelPromotion/hooks/useEpisodeData.ts
// 需要调用 episodeAPI, clipAPI, storyboardAPI
```

#### 2. NovelPromotionWorkspace 数据集成
```typescript
// 需要将 useState 替换为实际的 API 调用
// - handleEpisodeCreate → episodeAPI.create
// - handleCharacterCreate → characterAPI.create
// - handleLocationCreate → locationAPI.create
```

#### 3. Workflow 服务集成
```typescript
// frontend/src/services/novelPromotionWorkflowService.ts
// 需要调用 workflowAPI.storyToScript
// 需要调用 workflowAPI.scriptToStoryboard
```

## 调试技巧

### 查看数据库
```bash
# 数据库位置
~/Library/Application Support/koma-studio/db/novel_promotion.db

# 使用 SQLite 查看
sqlite3 ~/Library/Application\ Support/koma-studio/db/novel_promotion.db
.tables
SELECT * FROM episodes;
```

### 查看 IPC 通信
打开 DevTools Console，IPC 调用会显示错误信息

### 查看后端日志
```bash
# Electron 主进程日志
tail -f ~/Library/Logs/koma-studio/main.log
```

## 下一步工作

1. 实现 useEpisodeData Hook 连接数据库
2. 实现 Workflow 任务队列集成
3. 实现 AI 步骤执行（runAIStep delegate）
4. 测试完整的 Story → Script → Storyboard 流程
