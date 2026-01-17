## 1. Electron 端增强

- [x] 1.1 在 `electron/src/service/project.ts` 添加项目索引管理
  - 创建 `loadProjectsIndex()` 和 `saveProjectsIndex()` 方法
  - 索引文件路径: `{storageRoot}/projects-index.json`
- [x] 1.2 添加 `deleteProject(projectId)` 方法
  - 删除项目目录
  - 从索引中移除
- [x] 1.3 添加 `updateProject(projectId, updates)` 方法
  - 更新 meta.json
  - 同步更新索引
- [x] 1.4 修改 `createProject()` 同步更新索引
- [x] 1.5 修改 `listProjects()` 改为读取索引文件（性能优化）
- [x] 1.6 添加 `rebuildIndex()` 方法用于索引损坏时重建

## 2. Electron Controller 层

- [x] 2.1 在 `electron/src/controller/project.ts` 添加 `delete` 方法
- [x] 2.2 添加 `update` 方法
- [x] 2.3 添加 `rebuildIndex` 方法

## 3. 前端 electronService 对接

- [x] 3.1 在 `frontend/src/services/electronService.ts` 添加项目 CRUD 方法
  - `listProjects(): Promise<ProjectMeta[]>`
  - `createProject(data): Promise<ProjectMeta>`
  - `updateProject(id, updates): Promise<ProjectMeta>`
  - `deleteProject(id): Promise<void>`
- [x] 3.2 确保 preload 脚本正确暴露这些 IPC 方法

## 4. 前端状态管理

- [x] 4.1 创建 `frontend/src/hooks/useProjects.ts` hook
  - 加载项目列表
  - 处理加载状态和错误
- [x] 4.2 在 `App.tsx` 中使用 useProjects hook

## 5. App.tsx 改造

- [x] 5.1 移除 `MOCK_PROJECTS` 常量
- [x] 5.2 添加 `useState` 管理真实项目列表
- [x] 5.3 在 `useEffect` 中加载项目列表
- [x] 5.4 修改 `handleCreateProject` 调用真实 API
- [x] 5.5 修改 `handleSelectProject` 加载真实项目数据
- [x] 5.6 添加删除项目功能（ProjectList 组件需要暴露删除操作）

## 6. ProjectList 组件增强

- [x] 6.1 添加 `onDeleteProject` 回调 prop
- [x] 6.2 为项目卡片的「更多」菜单添加删除选项
- [x] 6.3 添加删除确认弹窗

## 7. 测试验证

- [ ] 7.1 测试创建新项目 - 验证文件系统和索引
- [ ] 7.2 测试重启应用后项目列表保持
- [ ] 7.3 测试删除项目
- [ ] 7.4 测试项目状态更新
