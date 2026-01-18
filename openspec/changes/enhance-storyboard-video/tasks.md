# Tasks: 完善 AI 分镜视频生成

## Phase 1: 修复编辑器 @ 功能

- [x] 1.1 MentionItem 增加 `sora2CharacterId` 字段
- [x] 1.2 App.tsx 构建 mentionItems 并传递给 Storyboard
- [x] 1.3 编辑器补全列表显示 Sora2 绑定标记
- [x] 1.4 支持 @场景 和 @道具（需要项目有 scenes.json 和 props.json 数据）
- [x] 1.5 原子删除 mention（使用 Prec.highest 确保优先级）

## Phase 2: 添加视频生成入口

- [x] 2.1 Storyboard 导入 shotRenderWorkflow
- [x] 2.2 分镜卡片添加视频生成按钮 (VideoCameraOutlined)
- [x] 2.3 导演面板"渲染"按钮调用 shotRenderWorkflow
- [x] 2.4 添加渲染进度显示

## Phase 3: 批量渲染

- [x] 3.1 批量渲染按钮调用 batchRenderShots
- [x] 3.2 显示整体进度和单个分镜状态

## Phase 4: 验证

- [x] 4.1 编译通过
- [x] 4.2 测试 @ 编辑器弹出角色
- [ ] 4.3 测试单个分镜生成视频
- [ ] 4.4 测试批量渲染
- [ ] 4.5 测试 @场景/@道具 补全
- [ ] 4.6 测试原子删除 mention
