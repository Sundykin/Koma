# 本地持久化方案对比分析

**分析时间**: 2026-02-03 22:55
**场景**: C 端本地工具，需要持久化项目数据、任务队列、用户设置

---

## 方案对比

### 方案 A: JSON 文件（当前方案）

```
projects/
├── {project-id}/
│   ├── project.json      # 项目元数据
│   ├── timeline.json     # 时间线数据
│   ├── tasks.json        # 任务队列
│   ├── characters.json   # 角色数据
│   ├── scenes.json       # 场景数据
│   └── assets/           # 资产文件
```

**优点**:
- ✅ 简单直观，易于调试（直接打开文件看）
- ✅ 无额外依赖
- ✅ 跨平台兼容性好
- ✅ 易于版本控制（Git 友好）
- ✅ 用户可手动编辑/备份

**缺点**:
- ❌ 大文件读写性能差（整个文件加载到内存）
- ❌ 无事务支持（写入中断可能损坏）
- ❌ 无索引，查询效率低
- ❌ 并发写入可能冲突
- ❌ 数据量大时内存占用高

**适合场景**: 小型项目、配置文件、简单数据结构

---

### 方案 B: SQLite（本地数据库）

```
projects/
├── {project-id}/
│   ├── koma.db           # SQLite 数据库
│   └── assets/           # 资产文件（仍用文件系统）
```

**优点**:
- ✅ ACID 事务，数据安全
- ✅ 索引支持，查询高效
- ✅ 增量读写，内存友好
- ✅ 支持复杂查询（SQL）
- ✅ 单文件，易于备份/迁移
- ✅ 成熟稳定，Electron 生态支持好

**缺点**:
- ❌ 需要额外依赖（better-sqlite3 或 sql.js）
- ❌ 调试不如 JSON 直观
- ❌ 需要定义 schema
- ❌ 二进制文件，Git 不友好

**适合场景**: 大量结构化数据、需要查询、数据完整性要求高

---

### 方案 C: 混合方案（推荐）

```
projects/
├── {project-id}/
│   ├── project.json      # 项目元数据（JSON，易读）
│   ├── koma.db           # 核心数据（SQLite）
│   │   ├── tasks         # 任务队列
│   │   ├── timeline      # 时间线
│   │   ├── characters    # 角色
│   │   ├── scenes        # 场景
│   │   └── shots         # 分镜
│   └── assets/           # 资产文件
```

**策略**:
| 数据类型 | 存储方式 | 理由 |
|----------|----------|------|
| 项目元数据 | JSON | 简单、易读、用户可编辑 |
| 全局设置 | localStorage | 浏览器原生、简单 |
| 任务队列 | SQLite | 需要事务、频繁更新 |
| 时间线 | SQLite | 数据量大、需要查询 |
| 角色/场景/分镜 | SQLite | 结构化、需要关联查询 |
| 资产文件 | 文件系统 | 二进制文件 |

---

## 技术选型

### Electron 环境推荐: better-sqlite3

```bash
npm install better-sqlite3
```

**优点**:
- 同步 API，代码简洁
- 性能最好（原生绑定）
- Electron 支持成熟

**示例**:
```typescript
import Database from 'better-sqlite3';

const db = new Database('koma.db');

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  )
`);

// 插入
const insert = db.prepare('INSERT INTO tasks (id, type) VALUES (?, ?)');
insert.run('task-1', 'render');

// 查询
const tasks = db.prepare('SELECT * FROM tasks WHERE status = ?').all('pending');

// 事务
const insertMany = db.transaction((tasks) => {
  for (const task of tasks) insert.run(task.id, task.type);
});
```

### 纯浏览器环境备选: sql.js

```bash
npm install sql.js
```

**优点**:
- 纯 JavaScript，无原生依赖
- 可在 Web Worker 运行

**缺点**:
- 性能不如 better-sqlite3
- 需要手动保存到文件

---

## 迁移计划

### Phase 1: 引入 SQLite（不破坏现有功能）
1. 安装 better-sqlite3
2. 创建数据库初始化模块
3. 新功能使用 SQLite

### Phase 2: 迁移任务队列
1. `taskQueueStore.ts` 改用 SQLite
2. 保留 JSON 导出功能（兼容）
3. 启动时自动迁移旧数据

### Phase 3: 迁移时间线和分镜
1. 时间线数据迁移到 SQLite
2. 分镜版本管理迁移
3. 性能测试和优化

---

## 结论

**推荐方案 C（混合方案）**:
- 项目元数据保持 JSON（用户友好）
- 核心数据迁移到 SQLite（性能+安全）
- 资产文件保持文件系统

**理由**:
1. 任务队列需要事务保护（防止写入中断损坏）
2. 时间线数据量大，JSON 整体读写效率低
3. 分镜版本管理需要查询能力
4. SQLite 单文件易于备份迁移，符合 C 端工具特性

**工作量估算**:
- Phase 1: 2 小时
- Phase 2: 4 小时
- Phase 3: 1 天
