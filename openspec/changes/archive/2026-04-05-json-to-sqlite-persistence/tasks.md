## 1. 依赖安装与构建配置

- [x] 1.1 在 `package.json` 中添加 `better-sqlite3@12.8.0` 依赖和 `@electron/rebuild` devDependency
- [x] 1.2 在 `package.json` scripts 中添加 `"re-sqlite": "electron-rebuild -f -w better-sqlite3"`
- [x] 1.3 执行依赖安装：先删除已有 better-sqlite3，`npm install` 装其他依赖，再单独 `npm i better-sqlite3@12.8.0`，最后 `npm run re-sqlite`

## 2. BaseDB 数据库连接管理

- [x] 2.1 创建 `electron/service/storage/BaseDB.ts`：封装 better-sqlite3 连接，初始化 WAL 模式、外键约束、busy_timeout，提供 `getDb()`、`close()`、`transaction()` 方法
- [x] 2.2 创建 `electron/service/storage/schema.ts`：定义完整建表 SQL（projects、characters、scenes、props、shots、shot_versions、assets、episodes、timelines、timeline_tracks、timeline_clips、schema_version）及索引
- [x] 2.3 在 BaseDB 中实现 schema 初始化：首次连接执行建表 SQL，写入 schema_version 记录
- [x] 2.4 在 BaseDB 中实现 schema 版本检查与增量迁移入口

## 3. Repository 接口定义

- [x] 3.1 创建 `electron/service/storage/repositories/interfaces.ts`：定义 IProjectRepository、ICharacterRepository、ISceneRepository、IPropRepository、IShotRepository、IAssetRepository、IEpisodeRepository、ITimelineRepository 接口
- [x] 3.2 每个接口包含 `list(projectId)`、`getById(id)`、`create(data)`、`update(id, data)`、`delete(id)` 方法签名

## 4. SQLite Repository 实现

- [x] 4.1 创建 `SqliteProjectRepository.ts`：项目表 CRUD，创建时事务中同时初始化默认 timeline
- [x] 4.2 创建 `SqliteCharacterRepository.ts`：角色表 CRUD，媒体字段仅存 local/remote 路径
- [x] 4.3 创建 `SqliteSceneRepository.ts`：场景表 CRUD
- [x] 4.4 创建 `SqlitePropRepository.ts`：道具表 CRUD
- [x] 4.5 创建 `SqliteShotRepository.ts`：分镜表 + 版本表 CRUD，含版本切换和清理
- [x] 4.6 创建 `SqliteAssetRepository.ts`：资产元数据 CRUD，含 fingerprint 去重、未引用资产查询
- [x] 4.7 创建 `SqliteEpisodeRepository.ts`：集数表 CRUD
- [x] 4.8 创建 `SqliteTimelineRepository.ts`：时间线/轨道/片段三层 CRUD，加载时组装为嵌套结构

## 5. ProjectService 重构

- [x] 5.1 修改 `electron/service/project.ts`：删除所有 JSON 文件读写逻辑，改为调用 Repository
- [x] 5.2 `listProjects()` → `IProjectRepository.list()`
- [x] 5.3 `createProject()` → 事务中 `IProjectRepository.create()` + 创建文件目录 + `ITimelineRepository.createDefault()`
- [x] 5.4 `updateProject()` → `IProjectRepository.update()`
- [x] 5.5 `deleteProject()` → `IProjectRepository.delete()`（级联）+ 删除文件目录
- [x] 5.6 `loadProject()` → 关联查询组装完整项目数据
- [x] 5.7 `exportProject()` → 从数据库查询数据导出
- [x] 5.8 `importProject()` → 解压后插入数据库

## 6. IPC Controller 扩展

- [x] 6.1 扩展 `electron/controller/project.ts`：新增角色/场景/道具/分镜/资产/集数/时间线的 CRUD 方法，每个实体一组接口
- [x] 6.2 在 `electron/preload/bridge.ts` 白名单中注册新的 IPC 通道
- [x] 6.3 在 `frontend/src/services/electronService.ts` 中添加对应的前端调用封装

## 7. 应用生命周期集成

- [x] 7.1 修改 `electron/service/index.ts`：在 `initServices()` 中初始化 BaseDB 并执行 schema 初始化
- [x] 7.2 将 Repository 实例注入到 ProjectService
- [x] 7.3 在 `electron/preload/lifecycle.ts` 的 `beforeClose` 中调用 `BaseDB.close()`

## 8. 导出索引与验证

- [x] 8.1 创建 `electron/service/storage/index.ts`：统一导出 BaseDB、所有 Repository
- [x] 8.2 验证 IPC 接口调用链：前端 → electronService → IPC → Controller → Service → Repository → SQLite
- [x] 8.3 端到端验证：TypeScript 编译通过，零错误
