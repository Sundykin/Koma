# Change: 可扩展渠道框架 + 新渠道接入

## Why
当前项目的渠道（TTI/ITV/角色提取等）都是硬编码实现，每次新增渠道都需要修改代码。用户希望能够通过配置方式快速接入新渠道，无需改动代码。同时需要接入新的 toapis.com 渠道（Gemini-3-Pro 文生图、Sora2 视频生成、角色提取、视频混音）。

## What Changes

### 1. 新渠道接入（优先实现）
- **Gemini-3-Pro 文生图**: toapis.com 的 gemini-3-pro-image-preview 模型
- **Sora2 视频生成**: 支持文生视频、图生视频、角色引用
- **角色提取**: 从视频中提取角色（创建 + 状态查询）
- **视频混音**: 对已有视频进行二次编辑

### 2. 可扩展渠道框架（后续扩展）
- 统一的异步任务模式：生成接口 + 状态查询接口
- 可配置的请求转换器：将通用参数转换为特定 API 格式
- 可配置的响应转换器：将 API 响应转换为统一格式
- 可配置的鉴权方式：Bearer Token / API Key Header / 自定义
- 用户可通过 JSON 配置新增自定义渠道

### 3. 角色提取状态查询（修复）
- 补充之前缺失的角色提取状态查询接口
- 支持轮询角色创建任务进度

### 4. 创作流程适配
- 视频混音集成到时间线编辑流程
- 角色提取与角色管理模块联动

## Impact
- Affected specs: `model-providers`, `itv`, `character-management`
- Affected code:
  - `frontend/src/providers/tti/` - 新增 Gemini3Pro Provider
  - `frontend/src/providers/itv/` - 更新 Sora2 Provider
  - `frontend/src/providers/channel/` - 新增可扩展渠道框架
  - `frontend/src/services/` - 任务管理服务更新
  - `frontend/src/components/settings/` - 渠道配置 UI

## 新渠道 API 概览

### Gemini-3-Pro 文生图
- 生成: `POST /v1/images/generations`
- 查询: `GET /v1/images/generations/{task_id}`
- 状态: queued → in_progress → completed/failed

### Sora2 视频生成
- 生成: `POST /v1/videos/generations`
- 查询: `GET /v1/videos/generations/{task_id}`
- 支持: 文生视频、图生视频、角色引用、风格控制

### 角色提取
- 创建: `POST /v1/videos/generations` (特殊参数)
- 查询: `GET /v1/characters_tasks/{task_id}`
- 返回: 角色 ID、username、头像等

### 视频混音
- 混音: `POST /v1/videos/{video_id}/remix`
- 查询: 复用视频任务查询接口
