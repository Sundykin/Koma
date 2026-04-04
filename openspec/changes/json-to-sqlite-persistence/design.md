## Context

Koma Studio 当前使用 JSON 文件存储所有项目数据，存储根目录为 `~/.koma/`。项目使用 Electron（v39.4.0）+ ee-core（v4.1.5）框架，IPC 通过 `controller/project/*` 通道通信。前端通过 `electronService` 调用后端 API。

本次变更直接切换到 SQLite 存储，不考虑旧数据迁移。核心原则：**数据逻辑全部在 IPC 后端（Electron 主进程），前端只做 UI 和状态缓存**。

## Goals / Non-Goals

**Goals:**
- 使用 SQLite 作为唯一数据存储引擎
- 媒体文件保持文件系统存储，数据库仅存储元数据（localPath、remoteUrl、尺寸、时长等）
- 所有数据操作通过 IPC 接口完成，前端不直接操作存储
- 抽象持久化层为 Repository 接口，业务逻辑与存储引擎解耦
- 构建脚本支持 macOS/Windows/Linux 的 native module 编译

**Non-Goals:**
- 不做 JSON → SQLite 数据迁移，旧数据不兼容
- 不迁移前端 localStorage 中的 UI 状态
- 不迁移 LLM Profile Store
- 不实现远程数据库同步
- 不引入 ORM 框架

## Decisions

### Decision 1: 使用 better-sqlite3

**选择**: `better-sqlite3@11.7.0`

**理由**: 同步 API 与 Electron 主进程单线程架构契合；ee-core 内置 `SqliteStorage` 封装；性能优于 sql.js 和 node-sqlite3。

**替代方案**: `sql.js`（WASM，性能差 3-5x）、`node-sqlite3`（异步 API 复杂度高）、`electron-store`（仅 KV 存储）

### Decision 2: 单数据库文件

**选择**: `{storageRoot}/db/koma.db`，所有项目通过 `project_id` 外键隔离

**理由**: 跨项目查询方便，连接管理简单，SQLite WAL 模式支持并发读写。

### Decision 3: 数据逻辑全落 IPC 后端

**选择**: 前端通过 IPC 通道调用后端 Controller → Service → Repository，前端只缓存查询结果用于 UI 渲染。

**理由**:
- 前端不应知道存储细节（SQLite/JSON/REST），只关心数据接口
- 主进程统一管理事务和并发，避免前端多窗口写冲突
- 后续迁移 Web 应用时，只需将 IPC 调用替换为 HTTP 调用，前端逻辑不变
- 前端保持轻量，Zustand store 仅做 UI 状态缓存

**IPC 接口设计原则**:
- 粒度：每个实体一组 CRUD 接口（`controller/project/*`、`controller/character/*`、`controller/shot/*` 等）
- 前端不做 JOIN 查询，需要关联数据时由后端组装好返回
- 批量操作由后端事务保证原子性

### Decision 4: Repository 抽象层

**选择**: TypeScript interface 作为 Repository 契约

```
IProjectRepository     → SqliteProjectRepository
ICharacterRepository   → SqliteCharacterRepository
IAssetRepository       → SqliteAssetRepository
...
```

**理由**: 业务逻辑依赖接口不依赖实现，后续替换存储引擎时 Controller/Service 层不动。

### Decision 5: 媒体资产元数据策略

数据库 `assets` 表存储：id、project_id、kind、local_path（相对路径）、remote_url、mime_type、width、height、duration_ms、fps、file_size、fingerprint、provider、metadata_json。

文件保留在 `{projectDir}/assets/{type}/` 目录。二进制文件不入库。

### Decision 6: 数据库 Schema

核心表：projects、characters、scenes、props、shots、shot_versions、assets、episodes、timelines、timeline_tracks、timeline_clips、schema_version。

所有关联表使用 `ON DELETE CASCADE` 外键，删除项目时级联清理。扩展字段统一用 `metadata_json TEXT` 存储。

### Decision 7: 构建流程

```json
{
  "scripts": {
    "re-sqlite": "electron-rebuild -f -w better-sqlite3"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.x"
  },
  "dependencies": {
    "better-sqlite3": "11.7.0"
  }
}
```

## Risks / Trade-offs

- **[Native Module 构建失败]** → 提供 `re-sqlite` 脚本 + 平台构建指南
- **[旧数据不兼容]** → 明确不迁移，用户需重新创建项目（本阶段可接受）
- **[数据库文件损坏]** → WAL 模式 + `PRAGMA integrity_check`
- **[DB 文件体积]** → 仅存元数据，预估单项目 < 1MB
- **[前端改造工作量]** → 前端原有直接读写逻辑需改为 IPC 调用，但接口签名尽量保持一致降低改动
