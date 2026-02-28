## 1. Runtime Core Cutover
- [ ] 1.1 将 Electron 主进程入口切换到 electron-egg 运行时装配（main + lifecycle），移除 legacy 入口分支。
- [ ] 1.2 修复启动链路相关编译阻塞（导入路径、依赖安装、初始化顺序）。
- [ ] 1.3 确认 controller/service 仅通过新生命周期装配，不保留 legacy 注入路径。

## 2. IPC Routing and Preload Compatibility
- [ ] 2.1 统一 IPC 到 controller 路由语义，明确 domain/action 到 controller 路由映射。
- [ ] 2.2 在 preload 层提供稳定桥接，保持 `window.electronAPI` 接口不破坏前端调用。
- [ ] 2.3 校验核心领域调用（project/config/plugin/workflow/persistence/chat/fs/window/dialog）全部可达。

## 3. Provider and ITV Baseline
- [ ] 3.1 后端 Provider Registry 统一到单一路径，移除旧兼容映射。
- [ ] 3.2 **移除 Sora2 Provider 及相关注册、类型、配置入口。**
- [ ] 3.3 确保 Kling/Runway 等可用 ITV Provider 可被配置、测试与调用。

## 4. Creation Flow Stabilization
- [ ] 4.1 优化最小主流程：剧本→分镜→资产→渲染，修复阻塞性 bug。
- [ ] 4.2 精简分镜与资产页面冗余操作（重复按钮、无效弹窗、死代码入口）。
- [ ] 4.3 确认移除 Sora2 后相关 UI 不残留，且流程可继续完成渲染。

## 5. Storage Migration Integrity
- [ ] 5.1 执行一次性迁移后只写新结构，移除旧结构运行时兼容分支。
- [ ] 5.2 校验 settings/projects-index/project meta 数据完整性门禁。

## 6. Review and Automated Verification
- [ ] 6.1 代码评审输出 `docs/review-report.md`（Critical/Warning/Info）。
- [ ] 6.2 使用 Chrome DevTools MCP 执行自动化测试并输出 `docs/test-report.md`。
- [ ] 6.3 覆盖验证：启动、IPC、插件、主流程 E2E、Sora2 残留扫描（代码/UI/网络/控制台）。

## 7. Spec Validation
- [ ] 7.1 运行 `openspec validate refactor-electron-egg-core-runtime --strict` 并修复所有校验问题。
