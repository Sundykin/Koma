# Design: 统一提示词模板与调试日志

## 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                     UI Components                            │
│  (CharacterDetailModal, AssetGenerationWizard, etc.)        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Workflow Layer                            │
│  characterAssetWorkflow, scenePropAssetWorkflow,            │
│  shotRenderWorkflow, shotListGenerator                      │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ buildPrompt() → getThemeStylePrefix() + template      │ │
│  │                       ↓                               │ │
│  │ aiLogger.logPrompt('tti', prompt, options)            │ │
│  └───────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Provider Layer                            │
│  TTIProvider, ITVProvider, TTSProvider, LLMProvider         │
└─────────────────────────────────────────────────────────────┘
```

## 1. 废弃 AssetGenerationService

### 问题
`AssetGenerationService` 是早期实现，提示词硬编码且没有应用项目风格。

### 方案
- 将所有对 `AssetGenerationService.generateCharacterImage()` 的调用替换为 `characterAssetWorkflow.generateCostumePhoto()`
- 保留 `AssetGenerationService` 文件但标记为 @deprecated
- 场景/道具生成已有对应 workflow，无需额外处理

### 调用点检查
1. `AssetManager.tsx` - 需确认是否使用此服务
2. `ProjectAssetOverview.tsx` - 需确认是否使用此服务

## 2. TTI 提示词模板配置

### 新增模板类型
```typescript
export type PromptTemplateType =
  // 现有 LLM 模板...
  | 'tti_character_costume'  // 角色定妆照（三视图）
  | 'tti_scene_preview'      // 场景预览图
  | 'tti_prop_reference'     // 道具参考图
  | 'tti_shot_image';        // 分镜图片
```

### 模板结构
```typescript
const DEFAULT_TTI_TEMPLATES = {
  tti_character_costume: {
    template: '{{stylePrefix}}, character turnaround sheet, white background, front view | side view | back view, three poses in one image, character design reference sheet, full body, standing pose, {{appearance}}',
    variables: ['stylePrefix', 'appearance'],
  },
  tti_scene_preview: {
    template: '{{stylePrefix}}, environment concept art, wide shot, establishing shot, {{description}}, {{location}}, {{time}}, {{mood}} atmosphere, detailed background, cinematic composition',
    variables: ['stylePrefix', 'description', 'location', 'time', 'mood'],
  },
  // ...
};
```

## 3. 统一风格应用

### 当前状态
| 服务 | 读取 theme | 读取 stylePrompt | 应用 getThemeStylePrefix |
|------|------------|------------------|-------------------------|
| characterAssetWorkflow | ✅ | ✅ | ✅ |
| scenePropAssetWorkflow | ✅ | ✅ | ✅ |
| shotRenderWorkflow | ✅ | ✅ | ✅ |
| AssetGenerationService | ❌ | ❌ | ❌ |
| ShotGenerationService | ❌ | ❌ | ❌ |

### 修改计划
- `ShotGenerationService`: 添加 theme/stylePrompt 参数，调用 `getThemeStylePrefix()`
- `AssetGenerationService`: 废弃，不再维护

## 4. AI 调用日志工具

### 新建 `aiCallLogger.ts`
```typescript
interface AICallLog {
  type: 'llm' | 'tti' | 'itv' | 'tts';
  timestamp: string;
  service: string;      // provider 名称
  prompt: string;       // 完整提示词
  options?: object;     // 调用参数
  projectId?: string;
  targetId?: string;
  targetName?: string;
}

export function logAICall(log: AICallLog): void {
  const prefix = `[AI:${log.type.toUpperCase()}]`;
  console.log(`${prefix} ========== ${log.service} ==========`);
  console.log(`${prefix} Target: ${log.targetName || log.targetId}`);
  console.log(`${prefix} Prompt:`);
  console.log(log.prompt);
  if (log.options) {
    console.log(`${prefix} Options:`, JSON.stringify(log.options, null, 2));
  }
  console.log(`${prefix} ========================================`);
}
```

### 集成点
在每个 Provider 调用前打印：
- TTI: `generateImage()` 前
- ITV: `generate()` 前
- TTS: `synthesize()` 前
- LLM: `chat()` / `generateText()` 前

## 5. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `store/promptTemplates.ts` | MODIFY | 增加 TTI 模板类型 |
| `store/aiCallLogger.ts` | ADD | 新建日志工具 |
| `services/AssetGenerationService.ts` | MODIFY | 标记废弃 |
| `services/ShotGenerationService.ts` | MODIFY | 增加风格应用 |
| `workflow/characterAssetWorkflow.ts` | MODIFY | 集成日志 |
| `workflow/scenePropAssetWorkflow.ts` | MODIFY | 使用模板、集成日志 |
| `workflow/shotRenderWorkflow.ts` | MODIFY | 集成日志 |
| `components/AssetManager.tsx` | MODIFY | 使用统一 workflow |
| `components/ProjectAssetOverview.tsx` | MODIFY | 使用统一 workflow |
