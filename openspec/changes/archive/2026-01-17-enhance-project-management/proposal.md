# Proposal: enhance-project-management

## Summary
增强项目管理功能，支持剧集管理、风格主题选择、角色定妆照/三视图生成、场景/道具图片生成、角色预览视频生成、角色提取API绑定，以及所有远程API输出的本地持久化存储。

## Motivation
当前项目管理功能过于简单：
1. 项目基础信息不足，缺少剧集管理和风格主题选择
2. 角色/场景/道具没有预览图片生成能力
3. 角色没有预览视频生成和角色提取API绑定
4. 远程API返回的图片/视频没有本地持久化
5. 每个步骤缺少手动调整能力

## Requirements

### R1: Episode Management (剧集管理)
- 项目支持多集管理，每集有独立的剧本、分镜、资产
- LLM 可根据项目集数自动分割剧本
- 支持手动调整剧集边界

### R2: Style Theme Selection (风格主题选择)
- 项目级别的风格/主题选择（影响 LLM 创作和 TTI 生成）
- 预设主题：赛博朋克、古风武侠、日式动漫、欧美漫画、水墨国风等
- 支持自定义主题描述

### R3: Character Costume Photos (角色定妆照/三视图)
- 为每个角色生成定妆照（正面全身照）
- 支持生成三视图（正面/侧面/背面）
- 使用 TTI Provider 生成，支持手动上传替代
- 生成结果本地持久化存储

### R4: Scene & Prop Images (场景/道具图片生成)
- 为每个场景生成预览图
- 为每个道具生成参考图
- 使用 TTI Provider 生成
- 生成结果本地持久化存储

### R5: Character Preview Video (角色预览视频)
- 基于角色定妆照生成短预览视频（3-5秒）
- 使用 ITV Provider (sora2) 生成
- 生成结果本地持久化存储

### R6: Character Extraction API (角色提取绑定)
- 调用 sora2 角色提取 API (`POST /v1/characters`)
- 保存返回的 characterId 到角色数据
- 后续分镜视频提示词可通过 @characterId 引用角色

### R7: Asset Persistence (资产持久化)
- 所有远程API返回的图片/视频下载到本地
- 存储结构：`projects/{id}/assets/characters/`, `scenes/`, `props/`
- 记录原始URL、本地路径、生成参数

### R8: Step-by-Step Manual Adjustment (分步手动调整)
- 每个生成步骤后支持手动编辑调整
- 支持重新生成单个资产
- 支持手动上传替代生成结果

### R9: Project State Persistence (项目状态随时保存)
- 任何操作步骤都可以保存项目当前状态
- 关闭应用或切换项目时自动保存
- 重新打开项目恢复到上次保存的状态
- 支持手动触发保存（Ctrl+S 或保存按钮）

### R10: Async Task Recovery (异步任务故障恢复)
- 所有远程API调用任务持久化到本地任务队列
- 记录任务状态：pending/processing/completed/failed
- 重新打开项目时自动检查未完成任务状态
- 轮询查询直到任务完成或彻底失败
- 任务状态变更时给出相应提示（Toast通知）
- 支持手动重试失败的任务

### R11: Smart Script Editor (智能剧本编辑器)
- 引入 CodeMirror 6 作为剧本和提示词编辑器
- 支持 `@角色名` 或 `@道具名` 智能引用（Mention 功能）
- 编辑器中显示为可读名称标签，但实际存储为 `@id` 形式
- 悬浮时显示角色/道具详情（Tooltip）
- 点击可跳转到对应角色/道具详情页
- 输入 `@` 时自动弹出补全列表
- 支持语法高亮和基本编辑功能

## Affected Specs
- storage/spec.md - 新增资产存储结构
- script-processing/spec.md - 新增剧集拆分流程
- ui-components/spec.md - 新增资产管理UI

## Design Decisions

### D1: Episode Data Structure
每个 Episode 独立存储：
```
projects/{id}/episodes/{episodeId}/
├── script.txt
├── characters.json (引用项目级角色)
├── shots.json
└── assets/
```

### D2: Character Extended Fields
角色新增字段：
- costumePhotoPath: 定妆照路径
- threeViewPaths: { front, side, back } 三视图路径
- previewVideoPath: 预览视频路径
- sora2CharacterId: 角色提取API返回的ID

### D3: Asset Download Strategy
远程URL资产下载：
1. 生成成功后立即下载到本地
2. 保存原始URL和本地路径
3. 本地文件优先，远程URL作为备份

### D4: Theme Influence
主题影响范围：
- LLM 剧本生成的 System Prompt
- TTI 图片生成的风格前缀
- 角色外貌描述的风格修饰

### D5: Task Queue Structure
异步任务队列设计：
```typescript
interface AsyncTask {
  id: string;
  projectId: string;
  type: 'tti' | 'itv' | 'tts' | 'character-extraction';
  targetType: 'character' | 'scene' | 'prop' | 'shot';
  targetId: string;
  remoteTaskId: string;      // 远程API返回的任务ID
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  resultUrl?: string;
  localPath?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
}
```

### D6: Task Recovery Strategy
任务恢复策略：
1. 项目打开时加载 `tasks.json`
2. 筛选 status 为 pending/processing 的任务
3. 对每个未完成任务调用 checkProgress API
4. 根据返回状态更新本地任务状态
5. completed 则下载资产并更新目标数据
6. failed 则标记失败并显示错误提示
7. 仍在处理中则继续轮询（间隔3秒）

### D7: Auto-Save Strategy
自动保存策略：
1. 数据变更后延迟1秒自动保存（防抖）
2. 切换项目/关闭应用时立即保存
3. 长时间操作（生成任务）期间定时保存（每30秒）
4. 保存失败时显示错误提示并保留内存数据

### D8: CodeMirror Mention Implementation
智能引用实现方案：
1. **存储格式**: 实际文本存储为 `@char_123` 或 `@prop_456`
2. **显示格式**: 通过 CodeMirror Decoration.replace 将 ID 替换为名称标签 Widget
3. **输入流程**:
   - 用户输入 `@` 触发自动补全
   - 补全列表显示角色/道具名称和预览
   - 选择后插入 `@{type}_{id}` 格式
   - Decoration 自动将其渲染为可读标签
4. **交互行为**:
   - 悬浮：显示详情 Tooltip（名称、描述、预览图）
   - 点击：触发 onMentionClick 回调，可跳转到详情
   - 删除：整个 mention 作为原子单位删除
5. **数据获取**: 编辑器通过 `doc.toString()` 获取原始 ID 格式文本

## Implementation Plan

### Phase 1: Data Structure (数据结构)
1. 扩展 Project 类型，添加 episodes, theme, style 字段
2. 扩展 Character 类型，添加图片/视频路径和 sora2CharacterId
3. 扩展 Scene/Prop 类型，添加 imagePath 字段
4. 创建 Episode 类型

### Phase 2: Storage Layer (存储层)
1. 实现资产下载和本地存储函数
2. 实现剧集存储结构
3. 更新 projectStore 支持剧集CRUD

### Phase 3: Asset Generation (资产生成)
1. 实现角色定妆照生成流程
2. 实现角色三视图生成流程
3. 实现场景/道具图片生成流程
4. 实现角色预览视频生成流程
5. 实现角色提取API调用

### Phase 4: UI Components (UI组件)
1. 项目设置页新增剧集管理、主题选择
2. 角色编辑页新增定妆照/三视图/预览视频
3. 场景/道具编辑页新增图片生成
4. 分步生成向导组件

### Phase 5: Task Queue & Recovery (任务队列与恢复)
1. 创建 AsyncTask 类型和任务队列存储
2. 实现任务创建、更新、查询函数
3. 实现项目打开时的任务恢复逻辑
4. 实现任务状态轮询和结果处理
5. 实现任务状态变更的 Toast 通知

### Phase 6: Auto-Save (自动保存)
1. 实现数据变更监听和防抖保存
2. 实现应用关闭/切换项目时的保存钩子
3. 实现保存状态指示器（已保存/保存中/未保存）

### Phase 8: Smart Script Editor (智能编辑器)
1. 安装 CodeMirror 6 依赖
2. 创建 Mention 扩展（匹配、装饰、Widget）
3. 创建自动补全扩展（@触发、列表渲染）
4. 创建 Tooltip 扩展（悬浮详情）
5. 封装 ScriptEditor 组件
6. 集成到剧本编辑和提示词编辑场景

## Tasks
See tasks.md for detailed implementation tasks.
