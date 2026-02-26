## ADDED Requirements

### Requirement: Code Splitting and Lazy Loading
系统 SHALL 对非首屏视图组件实施代码分割和懒加载，确保初始 bundle 仅包含首屏所需代码。

#### Scenario: 首屏加载仅包含项目列表
- **WHEN** 用户首次打开应用
- **THEN** 仅加载 ProjectList 相关代码
- **THEN** SettingsPage、PluginManager、ChatPage、EditorView 的代码不在初始 bundle 中

#### Scenario: 切换视图时按需加载
- **WHEN** 用户从项目列表切换到编辑器视图
- **THEN** EditorView 相关代码通过动态导入加载
- **THEN** 加载期间显示 loading 骨架屏

#### Scenario: 编辑器内步骤切换懒加载
- **WHEN** 用户在编辑器内切换步骤（资产/分镜/视频）
- **THEN** 对应步骤组件按需加载
- **THEN** 已加载的组件代码被浏览器缓存

### Requirement: Vite Build Optimization
系统 SHALL 配置 Vite 构建优化，将大型依赖分离为独立 chunk。

#### Scenario: 依赖分包
- **WHEN** 执行 `npm run build`
- **THEN** react/react-dom 打包为 `vendor-react` chunk
- **THEN** antd 打包为 `vendor-antd` chunk
- **THEN** codemirror 相关包打包为 `vendor-editor` chunk
- **THEN** xgplayer 相关包打包为 `vendor-player` chunk

#### Scenario: 构建目标优化
- **WHEN** 构建产物运行在 Electron 环境
- **THEN** 构建目标设置为 `esnext`，不生成兼容性 polyfill

### Requirement: Media LRU Cache
系统 SHALL 对媒体资源缓存实施 LRU 策略，限制最大缓存条目数。

#### Scenario: 缓存达到上限时淘汰
- **WHEN** VideoRenderer 的媒体缓存达到 50 条上限
- **THEN** 最近最少使用的媒体资源被淘汰
- **THEN** 被淘汰的 video 元素被正确 dispose（pause + 清空 src）

#### Scenario: 缓存命中
- **WHEN** 请求已缓存的媒体资源
- **THEN** 直接返回缓存的 HTMLImageElement 或 HTMLVideoElement
- **THEN** 该资源的访问时间被更新（移到最近使用位置）

### Requirement: IPC Communication Optimization
系统 SHALL 对 IPC 通信实施批处理和缓存优化，减少进程间通信开销。

#### Scenario: 同一 tick 内的 IPC 调用合并
- **WHEN** 同一微任务周期内发起多个 IPC 调用
- **THEN** 调用被合并为一次批量 IPC 通信
- **THEN** 响应被正确分发到各个调用方

#### Scenario: 只读 IPC 调用缓存
- **WHEN** 对 `config:get` 等只读 IPC 调用发起请求
- **THEN** 如果缓存未过期（TTL 5s），直接返回缓存结果
- **THEN** 缓存过期后重新发起 IPC 调用

### Requirement: Electron Startup Optimization
系统 SHALL 优化 Electron 启动流程，非依赖服务并行初始化。

#### Scenario: 服务并行初始化
- **WHEN** configManager 初始化完成后
- **THEN** project、ffmpeg、plugin、chat 四个服务并行初始化
- **THEN** 单个服务初始化失败不阻塞其他服务

#### Scenario: 插件分组并行初始化
- **WHEN** 前端启动初始化插件
- **THEN** 不同类型的插件（mcp、provider、global）分组并行初始化
- **THEN** 同类型内保持串行以避免竞态条件

### Requirement: Large Component Decomposition
系统 SHALL 将超过 500 行的组件拆分为可组合的子组件，每个子组件不超过 300 行。

#### Scenario: Storyboard 组件拆分
- **WHEN** 渲染分镜编辑器
- **THEN** 画布、工具栏、状态管理分别由独立子组件负责
- **THEN** 功能行为与拆分前完全一致

#### Scenario: SimpleTimeline 组件拆分
- **WHEN** 渲染时间线编辑器
- **THEN** 轨道区、标尺区、控制栏分别由独立子组件负责
- **THEN** 功能行为与拆分前完全一致
