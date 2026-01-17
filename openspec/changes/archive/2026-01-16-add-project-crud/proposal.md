# Change: 实现项目真正的增删改查

## Why
当前前端使用硬编码的 `MOCK_PROJECTS` 模拟数据，无法真正创建、保存、删除项目。需要将模拟数据替换为真实的持久化存储，让用户能够管理自己的项目。

## What Changes
- 移除 `App.tsx` 中的 `MOCK_PROJECTS` 硬编码数据
- 前端连接 Electron IPC 实现项目增删改查
- 引入 `projects-index.json` 作为项目索引，提升列表加载性能
- 完善 `electronService` 的项目相关 API
- 实现项目状态的自动保存和恢复

## Impact
- Affected specs: `storage`
- Affected code:
  - `frontend/src/App.tsx` - 移除模拟数据，接入真实数据
  - `frontend/src/services/electronService.ts` - 添加项目 CRUD API
  - `frontend/src/store/projectStore.ts` - 完善项目管理逻辑
  - `electron/src/service/project.ts` - 增强项目服务
  - `electron/src/controller/project.ts` - 添加删除/更新接口

## Design Decisions

### 存储方案选择：JSON 文件 vs SQLite

| 方案 | 优势 | 劣势 |
|------|------|------|
| JSON 文件 | 简单直接、可读性好、与现有规格一致、无额外依赖 | 查询性能有限 |
| SQLite | 查询灵活、支持复杂关系、事务支持 | 增加依赖复杂度、需要迁移现有设计 |

**决定**: 采用 JSON 文件存储，因为：
1. 项目元数据结构简单，不需要复杂查询
2. 已有完善的文件系统存储规格
3. 通过项目索引文件可解决列表性能问题
4. 保持与现有 `storage` spec 的一致性

### 项目索引设计
引入 `{storageRoot}/projects-index.json`：
```json
{
  "version": 1,
  "projects": [
    {
      "id": "uuid",
      "title": "项目名",
      "genre": "题材",
      "mode": "drama|narration",
      "status": "script|storyboard|generating|completed",
      "thumbnail": "path/to/thumb.jpg",
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```
- 避免每次列出项目都要遍历所有目录读取 meta.json
- 在项目创建/更新/删除时同步更新索引
