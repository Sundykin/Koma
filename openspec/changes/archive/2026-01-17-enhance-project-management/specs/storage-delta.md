# Delta: storage/spec.md

## ADDED Requirements

### Requirement: Episode Storage Structure
系统 SHALL 支持剧集存储结构。

#### Scenario: 剧集目录结构
- **WHEN** 项目启用剧集管理
- **THEN** 创建 `episodes/` 子目录
- **AND** 每集独立存储：
```
projects/{id}/episodes/{episodeId}/
├── meta.json           # 剧集元数据
├── script.txt          # 本集剧本
├── shots.json          # 本集分镜列表
└── assets/             # 本集专属资产
```

#### Scenario: 剧集元数据
- **WHEN** 保存剧集元数据
- **THEN** meta.json 包含：
  - id: 剧集ID
  - number: 集数编号
  - title: 剧集标题
  - status: 状态
  - createdAt, updatedAt

### Requirement: Character Asset Storage
系统 SHALL 存储角色相关媒体资产。

#### Scenario: 角色资产目录结构
- **WHEN** 角色生成或上传媒体资产
- **THEN** 存储到 `assets/characters/{characterId}/`
- **AND** 目录结构：
```
assets/characters/{characterId}/
├── costume.png         # 定妆照
├── three-view/         # 三视图
│   ├── front.png
│   ├── side.png
│   └── back.png
├── preview.mp4         # 预览视频
└── meta.json           # 资产元数据
```

#### Scenario: 角色资产元数据
- **WHEN** 保存角色资产
- **THEN** meta.json 记录：
  - costumePhoto: { path, originalUrl, prompt, createdAt }
  - threeView: { front: {...}, side: {...}, back: {...} }
  - previewVideo: { path, originalUrl, createdAt }
  - sora2CharacterId: 角色提取API返回的ID

### Requirement: Scene Asset Storage
系统 SHALL 存储场景预览图。

#### Scenario: 场景资产存储
- **WHEN** 场景生成或上传预览图
- **THEN** 存储到 `assets/scenes/{sceneId}/`
- **AND** 记录生成参数和原始URL

### Requirement: Prop Asset Storage
系统 SHALL 存储道具参考图。

#### Scenario: 道具资产存储
- **WHEN** 道具生成或上传参考图
- **THEN** 存储到 `assets/props/{propId}/`
- **AND** 记录生成参数和原始URL

### Requirement: Remote Asset Download
系统 SHALL 下载远程API返回的媒体资产到本地。

#### Scenario: 图片下载
- **WHEN** TTI Provider 返回远程图片URL
- **THEN** 下载图片到本地存储
- **AND** 记录原始URL作为备份
- **AND** 后续使用本地路径

#### Scenario: 视频下载
- **WHEN** ITV Provider 返回远程视频URL
- **THEN** 下载视频到本地存储
- **AND** 记录原始URL作为备份
- **AND** 后续使用本地路径

#### Scenario: 下载失败处理
- **WHEN** 资产下载失败
- **THEN** 保留远程URL
- **AND** 标记下载状态为失败
- **AND** 支持手动重试下载

### Requirement: Project Theme Storage
系统 SHALL 存储项目主题设置。

#### Scenario: 主题设置存储
- **WHEN** 保存项目设置
- **THEN** project.json 包含：
  - theme: 预设主题ID
  - stylePrompt: 自定义风格描述
  - episodeCount: 剧集数量

### Requirement: Async Task Queue Storage
系统 SHALL 持久化异步任务队列。

#### Scenario: 任务队列文件结构
- **WHEN** 项目有异步生成任务
- **THEN** 存储到 `projects/{id}/tasks.json`
- **AND** 文件结构：
```json
{
  "tasks": [
    {
      "id": "uuid",
      "projectId": "project-uuid",
      "type": "tti",
      "targetType": "character",
      "targetId": "character-uuid",
      "remoteTaskId": "remote-task-id",
      "status": "processing",
      "progress": 50,
      "resultUrl": null,
      "localPath": null,
      "error": null,
      "retryCount": 0,
      "maxRetries": 3,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ],
  "version": 1
}
```

#### Scenario: 任务状态更新
- **WHEN** 任务状态变更
- **THEN** 立即更新 tasks.json
- **AND** 更新 updatedAt 时间戳

#### Scenario: 任务完成后清理
- **WHEN** 任务状态变为 completed 或 failed
- **THEN** 保留任务记录用于历史查询
- **AND** 可配置自动清理已完成任务（默认保留7天）

### Requirement: Task Recovery on Project Open
系统 SHALL 在项目打开时恢复未完成任务。

#### Scenario: 加载未完成任务
- **WHEN** 打开项目
- **THEN** 读取 tasks.json
- **AND** 筛选 status 为 pending 或 processing 的任务
- **AND** 启动任务恢复流程

#### Scenario: 任务状态轮询
- **WHEN** 恢复未完成任务
- **THEN** 对每个任务调用对应 Provider 的 checkProgress
- **AND** 间隔3秒轮询直到完成或失败
- **AND** 更新本地任务状态

#### Scenario: 任务完成处理
- **WHEN** 远程任务返回 completed
- **THEN** 下载 resultUrl 到本地
- **AND** 更新目标实体（Character/Scene/Prop）的资产路径
- **AND** 更新任务状态为 completed
- **AND** 显示成功通知

#### Scenario: 任务失败处理
- **WHEN** 远程任务返回 failed
- **THEN** 记录错误信息到任务
- **AND** 更新任务状态为 failed
- **AND** 显示失败通知（包含错误原因）
- **AND** 提供重试按钮

#### Scenario: 任务重试
- **WHEN** 用户点击重试失败任务
- **THEN** 如果 retryCount < maxRetries
- **AND** 重新调用生成 API
- **AND** 更新 remoteTaskId 和 retryCount
- **AND** 重置 status 为 pending

#### Scenario: 彻底失败
- **WHEN** retryCount >= maxRetries
- **THEN** 标记任务为彻底失败
- **AND** 显示 "已达最大重试次数，请手动重新生成"
- **AND** 不再自动重试

### Requirement: Project Auto-Save
系统 SHALL 支持项目自动保存。

#### Scenario: 数据变更触发保存
- **WHEN** 项目数据发生变更
- **THEN** 标记项目为 dirty（未保存）
- **AND** 启动1秒防抖定时器
- **AND** 定时器到期后自动保存

#### Scenario: 保存内容
- **WHEN** 执行项目保存
- **THEN** 保存以下文件：
  - project.json（完整项目数据）
  - meta.json（项目元数据）
  - tasks.json（任务队列）
- **AND** 更新 updatedAt 时间戳

#### Scenario: 应用关闭前保存
- **WHEN** 用户关闭应用或刷新页面
- **THEN** 触发 beforeunload 事件
- **AND** 同步保存所有 dirty 项目
- **AND** 保存失败时提示用户

#### Scenario: 项目切换前保存
- **WHEN** 用户切换到其他项目
- **THEN** 先保存当前项目
- **AND** 保存完成后再切换

#### Scenario: 手动保存
- **WHEN** 用户按 Ctrl+S 或点击保存按钮
- **THEN** 立即保存项目
- **AND** 显示保存成功提示

#### Scenario: 保存状态指示
- **WHEN** 项目有未保存变更
- **THEN** 标题栏显示 "未保存" 指示
- **WHEN** 正在保存
- **THEN** 显示 "保存中..." 指示
- **WHEN** 保存完成
- **THEN** 显示 "已保存 ✓" 指示
