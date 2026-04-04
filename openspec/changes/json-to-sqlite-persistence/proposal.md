## Why

当前所有项目数据（项目索引、元数据、剧本、角色、场景、道具、分镜、资产、时间线等）均以 JSON 文件存储在 `~/.koma/projects/` 目录下。JSON 文件存储缺乏事务保证、无法高效查询关联数据、并发写入存在竞态风险，且随着项目数据增长，全量读写 JSON 的性能会持续下降。迁移到 SQLite 可获得事务安全、索引查询、增量更新等能力，同时保持本地优先的架构特征。

## What Changes

- **新增 `better-sqlite3@11.7.0` 依赖**及 `@electron/rebuild` 构建工具，配合 `re-sqlite` 脚本确保原生模块与 Electron 版本匹配
- **新增 SQLite 持久化层**：在 `electron/service/storage/` 下构建 `BaseDB`（数据库连接管理）和 `ProjectDB`（项目数据 CRUD）抽象层
- **设计数据库 schema**：projects、characters、scenes、props、shots、shot_versions、assets、episodes、timeline_tracks、timeline_clips 等表
- **媒体文件仅存元数据**：图片/音频/视频不写入数据库，仅存储 `localPath` + `remoteUrl` + 元信息（尺寸、时长、MIME 类型等），文件仍保留在 `assets/` 目录下
- **全新存储**：不考虑旧 JSON 数据迁移，直接以 SQLite 为唯一存储引擎
- **数据逻辑全部落在 IPC 后端**：前端通过 `controller/project/*` IPC 通道调用后端完成所有数据操作，前端仅负责 UI 展示和状态缓存，不直接操作存储
- **持久化抽象**：通过 Repository 接口抽象存储实现，业务逻辑与存储引擎解耦，后续可快速替换为 Web 端的 REST API

## Capabilities

### New Capabilities
- `sqlite-persistence`: SQLite 数据库连接管理、schema 定义、Repository 抽象层、IPC 数据接口

### Modified Capabilities
- `storage`: 存储引擎从 JSON 文件切换为 SQLite，项目数据 CRUD 操作改用数据库事务，媒体资产改为元数据引用模式

## Impact

- **依赖变更**：新增 `better-sqlite3@11.7.0`、`@electron/rebuild`；需要 `re-sqlite` 构建脚本
- **核心文件**：`electron/service/project.ts` 重构为调用 SQLite Repository
- **新增文件**：`electron/service/storage/BaseDB.ts`、`electron/service/storage/repositories/`
- **构建流程**：macOS/Windows/Linux 均需 `electron-rebuild` 重编译原生模块
- **数据文件**：数据库文件存放于 `{storageRoot}/db/koma.db`，打包后位于 `~/.koma/db/koma.db`
- **前端影响**：前端去掉直接的本地文件读写逻辑，所有数据操作通过 IPC 调后端
