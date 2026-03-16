## 1. Proposal Gate

- [ ] 1.1 确认 `electron-integration` 规范的目标架构与本 proposal 一致
- [ ] 1.2 评审并确认“框架托管 + Koma 自定义安全/通信保留”的迁移边界

## 2. Shell Bootstrap

- [ ] 2.1 在根依赖中引入 `ee-core`、`ee-bin` 及所需构建依赖
- [ ] 2.2 新增 `cmd/bin.js`，定义 frontend/electron 的 dev/build/start 命令
- [ ] 2.3 将根 `package.json` 脚本切换为 `ee-bin` 驱动
- [ ] 2.4 新增 `electron/main.ts`
- [ ] 2.5 新增 `electron/config/config.default.ts`
- [ ] 2.6 新增 `electron/config/config.local.ts`
- [ ] 2.7 新增 `electron/config/config.prod.ts`
- [ ] 2.8 新增 `electron/preload/lifecycle.ts`

## 3. Security and Runtime Bootstrap

- [ ] 3.1 抽离 `koma-local://` 协议注册逻辑
- [ ] 3.2 抽离 CSP 与安全头注册逻辑
- [ ] 3.3 在 ee-core 配置中显式保持 `contextIsolation: true`
- [ ] 3.4 在 ee-core 配置中显式保持 `nodeIntegration: false`
- [ ] 3.5 校验 preload 输出路径与生产环境加载路径

## 4. IPC Refactor

- [ ] 4.1 建立 controller 路由约定与 route helper
- [ ] 4.2 迁移 `window` controller
- [ ] 4.3 迁移 `dialog` controller
- [ ] 4.4 迁移 `fs` controller
- [ ] 4.5 迁移 `app` controller
- [ ] 4.6 迁移 `project` controller
- [ ] 4.7 迁移 `ffmpeg` controller
- [ ] 4.8 迁移插件安装/管理类 controller
- [ ] 4.9 保留并重挂载 `chat:stream:*`、`chat:tool:*` 自定义事件通道
- [ ] 4.10 为旧 IPC 名称提供临时兼容映射

## 5. Frontend Compatibility

- [ ] 5.1 调整 `frontend/src/services/electronService.ts` 适配新 IPC 路由
- [ ] 5.2 保证项目管理、文件系统、窗口控制调用不需要同步大面积改 UI
- [ ] 5.3 验证插件管理前端入口在兼容层下可用
- [ ] 5.4 验证 Chat/MCP 前端入口在兼容层下可用

## 6. Packaging and Cleanup

- [ ] 6.1 校准前端产物目录与 Electron 生产加载路径
- [ ] 6.2 校准 electron-builder 入口与打包文件清单
- [ ] 6.3 移除旧的根级 `concurrently` 启动路径
- [ ] 6.4 清理废弃入口和重复 IPC 注册代码

## 7. Verification

- [ ] 7.1 验证 `npm run dev`
- [ ] 7.2 验证 `npm run start`
- [ ] 7.3 验证 `npm run build`
- [ ] 7.4 验证主窗口加载、DevTools 快捷键和窗口控制
- [ ] 7.5 验证文件对话框、文件读写和本地协议媒体访问
- [ ] 7.6 验证项目存储、FFmpeg、插件安装/卸载
- [ ] 7.7 验证 Chat 流式输出、MCP 工具调用和审批事件
