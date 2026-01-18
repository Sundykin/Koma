# Change: 重构创作流程 - 步骤化工作流与后台任务系统

## Why

当前创作流程存在以下问题：
1. **职责重复**：点击「AI智能拆解剧本」会弹出一个4步向导（角色→场景→道具→分镜），而创作页面本身已有4步导航（剧本→资产→分镜→剪辑），两者职责重叠
2. **数据丢失**：解析出的角色、场景、道具没有正确持久化到项目存储
3. **无后台任务**：解析任务必须等待完成，页面跳转会丢失进度
4. **缺少资产生成**：没有定妆照、场景图、道具图的生成入口

## What Changes

### 1. 移除弹窗式解析向导
- **BREAKING**：移除 `ScriptAnalysisWizard` 弹窗组件
- 将解析流程直接集成到创作页面的步骤中

### 2. 重构创作步骤流程
- **剧本步骤**：编辑剧本 + 触发AI解析（后台执行）
- **资产步骤**：管理角色/场景/道具 + 触发资产图片生成
- **分镜步骤**：查看和编辑分镜 + 触发分镜渲染
- **剪辑步骤**：时间线编辑

### 3. 后台任务管理系统
- 创建 `TaskManager` 服务管理后台任务
- 任务持久化到项目目录 `tasks.json`
- 支持任务状态查询、进度更新、结果获取
- 应用启动时恢复未完成任务

### 4. 资产数据持久化修复
- 解析完成后将角色、场景、道具保存到项目 `characters.json`、`scenes.json`、`props.json`
- 分集解析结果保存到 `episodes/{id}/analysis.json`

### 5. 资产生成功能
- 角色定妆照生成（TTI）
- 场景参考图生成（TTI）
- 道具参考图生成（TTI）

## Impact

- Affected specs: `ui-components`, `storage`, `script-processing`
- Affected code:
  - `App.tsx` - 移除向导调用，集成后台任务状态
  - `ScriptAnalysisWizard.tsx` - 删除
  - `AssetManager.tsx` - 添加资产生成按钮
  - `projectStore.ts` - 添加任务持久化
  - 新增 `TaskManager.ts` 服务
  - 新增 `TaskStatusBar.tsx` 组件
