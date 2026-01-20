# Design: 修复AI剧本生成和视觉风格全局应用

## 架构概述

本设计涉及三个独立但相关的功能模块：

```
┌─────────────────────────────────────────────────────────────┐
│                      全局设置 (SettingsPage)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ LLM 配置    │  │ TTI 配置    │  │ 视觉风格管理 (NEW)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      项目配置 (Project)                       │
│  theme?: string          // 选择的风格预设ID                  │
│  stylePrompt?: string    // 自定义风格描述                    │
└─────────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
    ┌──────────┐      ┌──────────┐      ┌──────────────┐
    │ 角色资产  │      │ 场景资产  │      │ 分镜提示词    │
    │ 生成工作流│      │ 生成工作流│      │ 生成服务      │
    └──────────┘      └──────────┘      └──────────────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            ▼
                    getThemeStylePrefix()
                    ↓ 获取风格前缀
                    TTI/ITV 生成
```

## 模块1：AI随机剧本生成

### 数据流

```
用户点击"随机生成"
       │
       ▼
generateRandomIdea()  ──────► LLM (random_idea_generation 模板)
       │
       ▼
返回: { topic, style, keyElements }
       │
       ▼
generateScriptFromIdea()  ──► LLM (script_generation 模板)
       │
       ▼
返回: 完整剧本文本
       │
       ▼
填充到编辑器
```

### 新增 Prompt 模板

```typescript
random_idea_generation: {
  id: 'random_idea_generation',
  name: '随机创意生成',
  description: '生成随机的剧本创意',
  template: `你是一个创意编剧。请随机生成一个短视频剧本创意。

要求：
1. 创意要新颖有趣，适合短视频形式（1-5分钟）
2. 包含明确的主题、类型和情感基调
3. 简要描述核心冲突或亮点

请以 JSON 格式输出：
\`\`\`json
{
  "topic": "故事主题/概念（一句话）",
  "style": "风格类型（如：治愈、搞笑、悬疑、科幻等）",
  "keyElements": ["关键元素1", "关键元素2", "关键元素3"],
  "logline": "一句话剧情简介"
}
\`\`\``,
  variables: [],
  isCustom: false,
}
```

### 接口设计

```typescript
// scriptGenerator.ts

interface RandomIdea {
  topic: string;
  style: string;
  keyElements: string[];
  logline: string;
}

export async function generateRandomIdea(
  onProgress?: (progress: number, step: string) => void
): Promise<RandomIdea>;

export async function generateRandomScript(
  settings: AppSettings,
  duration: string = '3',
  onProgress?: (progress: number, step: string) => void
): Promise<string>;
```

## 模块2：视觉风格全局管理

### 数据结构

```typescript
// types.ts

interface AppSettings {
  // ... 现有字段
  customThemePresets?: ThemePreset[];  // 新增：用户自定义风格预设
}

// ThemePreset 保持不变
interface ThemePreset {
  id: string;
  name: string;
  description: string;
  ttiStylePrefix: string;   // TTI 提示词风格前缀
  llmPromptSuffix: string;  // LLM 提示词风格后缀
  previewImage?: string;    // 预览图（可选）
}
```

### 存储管理

```typescript
// globalStore.ts

// 新增函数

export async function getCustomThemePresets(): Promise<ThemePreset[]> {
  const settings = await loadSettings();
  return settings.customThemePresets || [];
}

export async function addCustomThemePreset(
  preset: Omit<ThemePreset, 'id'>
): Promise<ThemePreset>;

export async function updateCustomThemePreset(
  id: string,
  updates: Partial<ThemePreset>
): Promise<ThemePreset | null>;

export async function deleteCustomThemePreset(id: string): Promise<boolean>;
```

### 主题预设获取逻辑

```typescript
// themePresets.ts

// 保留现有的 THEME_PRESETS 常量作为系统内置预设

// 新增：获取所有可用预设（异步）
export async function getAllThemePresets(): Promise<ThemePreset[]> {
  const customPresets = await getCustomThemePresets();
  // 系统预设中移除 'custom' 选项，因为自定义模式通过 stylePrompt 处理
  const systemPresets = THEME_PRESETS.filter(t => t.id !== 'custom');

  // 用户自定义预设在前，系统预设在后
  return [...customPresets, ...systemPresets];
}

// 修改：支持从自定义预设获取
export async function getThemeStylePrefixAsync(
  themeId?: string,
  customStylePrompt?: string
): Promise<string> {
  if (!themeId || themeId === 'custom') {
    return customStylePrompt ? `${customStylePrompt}, ` : '';
  }

  // 先从自定义预设查找
  const customPresets = await getCustomThemePresets();
  const customTheme = customPresets.find(t => t.id === themeId);
  if (customTheme) {
    return customTheme.ttiStylePrefix;
  }

  // 再从系统预设查找
  const theme = getThemePreset(themeId);
  return theme?.ttiStylePrefix || '';
}
```

### 组件设计

```
VisualStyleManager
├── 风格列表
│   ├── 自定义预设（可编辑/删除）
│   └── 系统预设（只读，带标记）
├── 添加风格按钮
└── 编辑风格弹窗
    ├── 名称
    ├── 描述
    ├── TTI 风格前缀（多行文本，英文）
    ├── LLM 风格后缀（多行文本，中文）
    └── 预览效果
```

## 模块3：视觉风格统一应用

### 问题定位

需要检查以下调用链：

1. **分镜提示词生成**
   - `ShotListEditor.tsx` → `onGeneratePrompt` → 父组件实现
   - 需确认 `stylePrefix` 参数来源

2. **分镜图片生成**
   - 需确认是否有专门的分镜图片生成工作流
   - 或者是否使用角色定妆照的图片

3. **分镜视频生成**
   - `ShotListEditor.tsx` → `onGenerateVideo` → 父组件实现
   - 需确认视频提示词是否包含风格描述

### 修复方案

```typescript
// 方案1：在调用 ShotPromptService 时传入项目配置
const service = new ShotPromptService(projectId, episodeId);
const stylePrefix = getThemeStylePrefix(project.theme, project.stylePrompt);
await service.batchGenerateShotPrompts(shots, stylePrefix);

// 方案2：修改 ShotPromptService 自动读取项目配置
class ShotPromptService {
  private async getProjectStylePrefix(): Promise<string> {
    const project = await loadProject(this.projectId);
    return getThemeStylePrefix(project.theme, project.stylePrompt);
  }

  async generateShotPrompt(shot: Shot, ...): Promise<string> {
    const stylePrefix = await this.getProjectStylePrefix();
    // ... 使用 stylePrefix
  }
}
```

### 分镜图片生成补充

如果当前没有分镜图片生成功能，需要新增：

```typescript
// workflow/shotAssetWorkflow.ts

export async function generateShotImage(
  projectId: string,
  shot: Shot,
  options?: {
    theme?: string;
    stylePrompt?: string;
    ttiConfigId?: string;
  }
): Promise<{ success: boolean; path?: string }>;
```

## 技术考虑

### 向后兼容

- 现有项目不受影响，`theme` 和 `stylePrompt` 字段已存在
- 自定义预设为可选字段，默认为空数组
- 系统内置预设保持不变

### 性能考虑

- `getAllThemePresets()` 需要异步加载自定义预设
- `ThemeSelector` 组件需要改为异步加载预设列表
- 考虑缓存已加载的预设，避免重复读取

### 错误处理

- 如果自定义预设ID与系统预设冲突，以自定义预设优先
- 删除正在使用的预设时，项目配置不变（用户需手动更新）
