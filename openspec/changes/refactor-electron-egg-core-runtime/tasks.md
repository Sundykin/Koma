## 1. Runtime Core Cutover
- [ ] 1.1 将 Electron 主进程入口切换到 egg-core runtime bootstrap，并移除旧入口分支。
- [ ] 1.2 收敛 IPC 注册到统一 router/contract 层，删除旧 channel 兼容映射。
- [ ] 1.3 验证主进程控制器仅通过新生命周期装配，不再保留 legacy 注入路径。

## 2. Provider Runtime Consolidation
- [ ] 2.1 将 Provider Registry 统一到后端单一实现并完成初始化健康检查。
- [ ] 2.2 删除旧 provider key 别名和兼容映射逻辑。
- [ ] 2.3 确认前端仅通过桥接层读取当前可用 Provider 与测试结果。

## 3. Storage One-shot Migration
- [ ] 3.1 启动时执行一次性配置与索引迁移（旧结构 -> 新结构）。
- [ ] 3.2 迁移完成后只写入新结构，删除双写与回退分支。
- [ ] 3.3 校验 settings/projects-index/project meta 在新结构下往返一致。

## 4. UI Three-page Shell
- [ ] 4.1 将顶层导航收敛为核心三页：项目总览、创作工作台、系统设置。
- [ ] 4.2 移除非核心入口在主导航的展示与路由挂载。
- [ ] 4.3 验证三页在新运行时下的 IPC 调用、状态同步和错误提示闭环。

## 5. Verification
- [ ] 5.1 运行 `openspec validate refactor-electron-egg-core-runtime --strict`。
- [ ] 5.2 补齐关键验收记录：冷启动、迁移、三页主流程、Provider 调用、失败提示。