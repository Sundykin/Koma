# Design: 编辑器工作流重构

## Context

当前系统采用"卡片预览 + 侧边控制台"的分镜编辑模式，用户需要：
1. 在卡片列表中选择分镜
2. 在右侧控制台编辑属性
3. 单独操作生成图片/视频

这种模式切换成本高，不适合批量编辑。用户希望直接在列表中编辑所有字段。

另外，当前分镜拆解时同时生成提示词，用户无法控制生成时机，也无法在生成前调整分镜结构。

## Goals / Non-Goals

**Goals:**
- 提供内联编辑的分镜列表，所有字段直接可编辑
- **分镜拆解与提示词生成解耦**，用户控制生成时机
- 提示词生成时自动注入角色引用和运镜/景别关键字
- 通过提示词关键字自动识别运镜/景别，减少手动选择
- 支持多版本视频生成和选择
- 简化步骤条，释放更多内容空间

**Non-Goals:**
- 不删除现有数据结构，保持向后兼容
- 不改变底层 AI 调用逻辑，只改变触发时机

## Decisions

### 1. 分镜拆解流程解耦

**原流程：**
```
剧本 → AI分镜 → [分镜结构 + 提示词] → 用户编辑
```

**新流程：**
```
剧本 → AI分镜 → [分镜结构（无提示词）] → 用户调整 → 手动生成提示词 → 用户编辑
```

分镜拆解只生成：
```json
{
  "shots": [
    {
      "scriptContent": "对应的剧本原文",
      "characters": ["角色ID"],
      "emotion": "情绪",
      "duration": 3
      // 无 description 字段
    }
  ]
}
```

### 2. 提示词生成服务

新建 `ShotPromptService.ts`：

```typescript
interface PromptGenerationContext {
  shot: Shot;
  characters: Character[];  // 包含 sora2CharacterId
  scenes: Scene[];
  stylePrefix: string;
}

async function generateShotPrompt(context: PromptGenerationContext): Promise<string> {
  // 1. 调用 LLM 生成提示词
  // 2. 注入角色引用 @sora2CharacterId
  // 3. 注入运镜关键字
  // 4. 注入景别关键字
  return prompt;
}
```

**Prompt 模板（新增 `shot_prompt_generation`）：**
```
根据以下分镜信息生成视频生成提示词。

剧本内容：{{scriptContent}}
出场角色：{{characters}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}

要求：
1. 使用英文输出
2. 为每个角色添加 @角色ID 引用格式
3. 使用以下运镜关键字之一：{{cameraOptions}}
4. 使用以下景别关键字之一：{{shotTypeOptions}}
5. 描述画面动作、光影、氛围

可用角色引用：
{{characterRefs}}

输出格式：直接输出提示词，无需其他说明
```

### 3. 角色引用注入

AI 生成提示词时，注入角色信息：

```typescript
const characterRefs = characters
  .filter(c => shot.characters?.includes(c.id))
  .map(c => `${c.name}: @${c.sora2CharacterId || c.id}`)
  .join('\n');
```

生成的提示词示例：
```
A young woman @char_abc123 walks into the room, close-up shot,
tracking camera follows her movement, warm lighting, emotional mood
```

### 4. 运镜/景别关键字定义

```typescript
// 运镜关键字（传给 AI 让其选择使用）
const CAMERA_OPTIONS = [
  'static shot',
  'pan left/right',
  'tilt up/down',
  'zoom in/out',
  'tracking shot',
  'dolly shot',
  'crane shot',
  'handheld'
];

// 景别关键字
const SHOT_TYPE_OPTIONS = [
  'extreme close-up',
  'close-up',
  'medium close-up',
  'medium shot',
  'medium wide shot',
  'wide shot',
  'extreme wide shot',
  'establishing shot'
];
```

### 5. 分镜列表布局

采用表格式布局，每行一个分镜：

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ # │ 剧本文案        │ 提示词编辑器      │ 参考图      │ 视频片段             │
├───┼─────────────────┼───────────────────┼─────────────┼──────────────────────┤
│ 1 │ "她推开门..."   │ [ScriptEditor]    │ [图片选择]  │ [版本1] [版本2] ▶    │
│   │                 │ [🤖生成提示词]    │ [上传按钮]  │ [生成新版本]         │
├───┼─────────────────┼───────────────────┼─────────────┼──────────────────────┤
│ 2 │ "他转过身..."   │ [空/待生成]       │ [缩略图]    │ [版本1] ✓            │
│   │                 │ [🤖生成提示词]    │             │                      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

顶部工具栏：
```
[批量生成提示词] [批量生成图片] [批量生成视频] | 已完成: 5/12
```

**列宽分配：**
- 剧本文案：flex-shrink-0, w-48
- 提示词编辑器：flex-1 (自适应)
- 参考图：w-32
- 视频片段：w-48

### 6. 提示词关键字高亮

扩展 `mentionPlugin.ts`，添加新的装饰器：

```typescript
// 运镜关键字
const CAMERA_KEYWORDS = ['pan', 'zoom', 'tracking', 'static', 'dolly', 'crane', 'tilt', 'push in', 'pull out'];

// 景别关键字
const SHOT_KEYWORDS = ['close-up', 'medium shot', 'wide shot', 'extreme wide', 'full shot', 'establishing'];

// 使用 Decoration.mark 高亮这些关键字
```

高亮样式：
- 运镜关键字：紫色背景 `bg-purple-500/20 text-purple-400`
- 景别关键字：蓝色背景 `bg-blue-500/20 text-blue-400`
- @角色引用：绿色背景（已有）

### 7. 视频版本管理

扩展 Shot 类型：

```typescript
interface Shot {
  // ... existing fields
  description?: string;  // 改为可选，分镜拆解时不生成
  videoVersions?: VideoVersion[];
  selectedVideoVersion?: number;
}

interface VideoVersion {
  id: string;
  videoPath: string;
  remoteUrl?: string;
  createdAt: number;
  selected: boolean;
}
```

### 8. 步骤条精简设计

```
┌────────────────────────────────────────────────────────────────────┐
│  ● 剧本解析  ──────  ○ 角色场景  ──────  ○ AI分镜  ──────  ○ 后期  │
│                                               [开始智能拆解] ►      │
└────────────────────────────────────────────────────────────────────┘
```

- 图标缩小到 w-8 h-8
- 移除副标题（英文小字）
- 当前步骤旁显示主操作按钮

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 列表模式在小屏幕显示拥挤 | 响应式布局，小屏幕折叠为卡片 |
| 多版本视频占用存储 | 提供删除版本功能 |
| 关键字高亮误识别 | 只在明确上下文匹配（如逗号分隔） |
| 批量生成提示词消耗 Token | 显示预估消耗，用户确认 |

## Migration Plan

1. 新增 `ShotPromptService.ts` 和 `ShotListEditor` 组件
2. 修改 `ShotAnalysisService` 移除提示词生成
3. 通过 feature flag 或 UI 切换选择视图模式
4. 验证稳定后移除旧组件

## Open Questions

1. 是否需要保留卡片视图作为备选模式？
2. 视频版本历史保留多少个？
3. 批量生成提示词时是否需要确认对话框？
