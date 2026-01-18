# Tasks: 重构创作流程

## Phase 1: 后台任务系统

- [x] 1.1 创建 `TaskManager` 服务类
  - 单例模式
  - 内存任务列表管理
  - 任务状态变更事件
- [x] 1.2 实现任务持久化到 `tasks.json`
  - 创建任务时写入
  - 状态变更时更新
  - 启动时加载恢复
- [x] 1.3 实现任务轮询器
  - 定时检查异步任务状态
  - 更新本地任务记录
  - 触发完成/失败回调
- [x] 1.4 创建 `TaskStatusBar` 组件
  - 显示当前运行中的任务
  - 进度条和状态文本
  - 可展开查看任务详情

## Phase 2: 剧本解析集成

- [x] 2.1 重构 `ScriptAnalysisService`
  - 使用 TaskManager 管理任务
  - 解析结果持久化
- [x] 2.2 修改剧本步骤页面
  - 移除向导弹窗调用
  - 添加内联解析按钮
  - 显示解析任务状态
- [x] 2.3 解析完成后保存资产
  - 角色保存到 `characters.json`
  - 场景保存到 `scenes.json`
  - 道具保存到 `props.json`
  - 分镜保存到 `episodes/{id}/analysis.json`

## Phase 3: 资产管理增强

- [x] 3.1 修改 `AssetManager` 组件
  - 从项目存储加载资产数据
  - 显示资产生成状态
- [x] 3.2 添加资产图片生成功能
  - 角色定妆照生成按钮
  - 场景参考图生成按钮
  - 道具参考图生成按钮
- [x] 3.3 实现 `AssetGenerationService`
  - 调用 TTI API 生成图片
  - 保存生成结果到资产目录
  - 更新资产记录

## Phase 4: 步骤导航增强

- [x] 4.1 在 `StepNavigator` 下方集成 `TaskStatusBar`
- [x] 4.2 步骤切换时加载对应数据
  - 资产步骤加载 characters/scenes/props
  - 分镜步骤加载 episode analysis
- [x] 4.3 显示步骤完成状态指示
  - 已有数据的步骤显示勾选
  - 进行中的步骤显示进度

## Phase 5: 清理旧代码

- [x] 5.1 移除 `ScriptAnalysisWizard` 组件
- [x] 5.2 移除 `App.tsx` 中的向导相关状态
- [x] 5.3 更新相关导入和引用

## Checklist

- [x] All tasks completed
- [ ] Manual testing passed
- [ ] 后台任务持久化验证：创建任务 → 关闭应用 → 重新打开 → 任务恢复
- [ ] 解析流程验证：输入剧本 → 点击解析 → 后台执行 → 完成后资产可见
- [ ] 资产生成验证：选择角色 → 点击生成 → 后台执行 → 完成后图片显示
