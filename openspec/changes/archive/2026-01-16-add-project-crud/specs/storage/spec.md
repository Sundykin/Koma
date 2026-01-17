## ADDED Requirements

### Requirement: Projects Index File
系统 SHALL 维护一个项目索引文件以提升列表性能。

#### Scenario: 索引文件结构
- **WHEN** 系统需要列出项目时
- **THEN** 读取 `{storageRoot}/projects-index.json`
- **AND** 索引包含所有项目的摘要信息（id, title, genre, mode, status, thumbnail, createdAt, updatedAt）
- **AND** 避免遍历项目目录读取每个 meta.json

#### Scenario: 索引同步 - 创建
- **WHEN** 创建新项目时
- **THEN** 在项目目录创建 meta.json 后
- **AND** 同步在索引文件中添加该项目条目

#### Scenario: 索引同步 - 更新
- **WHEN** 更新项目元数据时
- **THEN** 更新项目目录下的 meta.json
- **AND** 同步更新索引文件中对应条目

#### Scenario: 索引同步 - 删除
- **WHEN** 删除项目时
- **THEN** 删除项目目录
- **AND** 从索引文件中移除对应条目

#### Scenario: 索引重建
- **WHEN** 索引文件损坏或缺失
- **THEN** 系统遍历 `projects/` 目录
- **AND** 读取每个项目的 meta.json
- **AND** 重建完整的索引文件

### Requirement: Project Delete Operation
系统 SHALL 支持完整删除项目。

#### Scenario: 删除项目
- **WHEN** 用户确认删除某个项目
- **THEN** 递归删除 `{storageRoot}/projects/{projectId}/` 整个目录
- **AND** 从 `projects-index.json` 移除该项目
- **AND** 从 `recent-projects.json` 移除该项目（如果存在）

#### Scenario: 删除确认
- **WHEN** 用户点击删除按钮
- **THEN** 显示确认对话框
- **AND** 警告此操作不可恢复
- **AND** 显示项目名称以防误删

## MODIFIED Requirements

### Requirement: Project Storage Structure
系统 SHALL 为每个项目创建独立的存储目录。

#### Scenario: 项目目录结构
- **WHEN** 创建新项目时
- **THEN** 在 `{storageRoot}/projects/{projectId}/` 创建以下结构：
```
{projectId}/
├── meta.json             # 项目元数据（基础信息）
├── project.json          # 项目完整数据（剧本、角色、分镜等）
├── timeline.json         # 时间线数据
├── assets/
│   ├── images/           # 图片素材
│   ├── videos/           # 视频素材
│   ├── audio/            # 音频素材
│   └── fonts/            # 字体文件
├── shots/
│   └── {shotId}/
│       ├── shot.json     # 分镜元数据
│       ├── versions/     # 历史版本
│       │   ├── v1/
│       │   │   ├── image.png
│       │   │   ├── video.mp4
│       │   │   └── audio.mp3
│       │   └── v2/
│       └── current/      # 当前使用版本（符号链接或复制）
├── cache/
│   ├── thumbnails/       # 缩略图缓存
│   ├── waveforms/        # 音频波形缓存
│   └── previews/         # 预览帧缓存
├── exports/              # 导出文件
└── temp/                 # 临时文件（启动时清理）
```
- **AND** 同步更新 `projects-index.json` 索引

#### Scenario: 项目元数据文件 (meta.json)
- **WHEN** 保存项目元数据时
- **THEN** meta.json 包含：
  - id, title, genre, mode
  - status: 'script' | 'storyboard' | 'generating' | 'completed'
  - thumbnail: 项目封面路径
  - episodes: 集数
  - createdAt, updatedAt
- **AND** 此文件用于快速列表显示，不包含完整项目数据

#### Scenario: 项目完整数据文件 (project.json)
- **WHEN** 保存项目完整数据时
- **THEN** project.json 包含：
  - 剧本文本 (scriptText)
  - 角色列表 (characters)
  - 场景列表 (scenes)
  - 道具列表 (props)
  - 分镜列表 (shots)
  - 项目级设置 (settings)
- **AND** 此文件在打开项目时加载
