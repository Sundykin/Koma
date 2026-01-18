# Design: 重构项目入口和分集驱动的创作流程

## 1. 数据架构设计

### 1.1 层级数据模型

```
Project (项目)
├── metadata (项目元信息)
│   ├── name, description, genre
│   ├── themeSettings (主题风格)
│   └── mediaConfigs (TTI/ITV/TTS/LLM 关联)
│
├── assets/ (项目级共享资产)
│   ├── characters/ (角色资产 - 跨集复用)
│   │   └── {characterId}/
│   │       ├── metadata.json (name, description, appearance, episodeRefs[])
│   │       └── images/ (定妆照等)
│   ├── scenes/ (场景资产 - 跨集复用)
│   │   └── {sceneId}/
│   │       ├── metadata.json (name, description, atmosphere, episodeRefs[])
│   │       └── images/
│   └── props/ (道具资产 - 跨集复用)
│       └── {propId}/
│           ├── metadata.json (name, description, episodeRefs[])
│           └── images/
│
├── episodes/ (分集数据)
│   └── {episodeId}/
│       ├── metadata.json (name, order, status, scriptHash)
│       ├── script.md (分集剧本)
│       ├── analysis.json (解析结果: characterRefs[], sceneRefs[], propRefs[])
│       ├── shots/ (分镜数据)
│       │   └── shots.json
│       └── timeline/ (剪辑时间线)
│           └── timeline.json
│
└── fullScript.md (完整剧本 - 用于 AI 分集)
```

### 1.2 资产引用机制

```typescript
// 资产元数据增强
interface AssetMetadata {
  id: string;
  name: string;
  description: string;
  // ... 其他字段

  // 新增：分集引用追踪
  episodeRefs: EpisodeRef[];

  // 新增：资产指纹（用于去重）
  fingerprint?: string;
}

interface EpisodeRef {
  episodeId: string;
  episodeName: string;
  firstAppearance: boolean;  // 是否首次出现
  shotIds?: string[];        // 具体出现的分镜
}

// 分集解析结果
interface EpisodeAnalysis {
  episodeId: string;

  // 引用项目级资产（不复制，只引用）
  characterRefs: AssetReference[];
  sceneRefs: AssetReference[];
  propRefs: AssetReference[];

  // 分集独有数据
  shots: Shot[];
}

interface AssetReference {
  assetId: string;
  assetType: 'character' | 'scene' | 'prop';
  localOverrides?: Partial<AssetMetadata>;  // 分集特定的覆盖（如角色在某集的特殊造型）
}
```

### 1.3 数据流向

```
1. 剧本输入 → 全局剧本或分集剧本
2. AI 分集 → 拆分为多个 Episode
3. 角色/场景/道具提取 → 写入项目级 assets/
4. 分镜生成 → 写入 episodes/{id}/shots/
5. 资产生成 → 更新 assets/{type}/{id}/images/
6. 剪辑导出 → 读取 episodes/{id}/timeline/
```

## 2. AI 自动分集服务

### 2.1 服务架构

```typescript
interface EpisodeSplitService {
  // 初始化，传入 LLM 配置
  constructor(llmConfig: LLMModelConfig);

  // 分析剧本，返回建议的分集方案
  analyzeScript(script: string, options: SplitOptions): Promise<SplitAnalysis>;

  // 执行分集
  splitScript(script: string, plan: SplitPlan): Promise<Episode[]>;

  // 中断当前操作
  abort(): void;
}

interface SplitOptions {
  targetEpisodeCount?: number;      // 目标集数（可选）
  maxEpisodeDuration?: number;      // 单集最大时长（分钟）
  splitStrategy: 'auto' | 'scene' | 'chapter';  // 分集策略
}

interface SplitAnalysis {
  suggestedCount: number;           // 建议集数
  splitPoints: SplitPoint[];        // 建议分割点
  reasoning: string;                // AI 分析理由
}

interface SplitPoint {
  position: number;                 // 文本位置
  marker: string;                   // 分割标记（章节名等）
  reason: string;                   // 分割理由
}
```

### 2.2 上下文管理与压缩

```typescript
interface ContextManager {
  // 当前上下文窗口大小（token）
  readonly contextSize: number;

  // 最大允许上下文
  readonly maxContext: number;

  // 添加消息到上下文
  addMessage(message: Message): void;

  // 压缩上下文（当接近阈值时）
  compress(): Promise<void>;

  // 获取当前上下文
  getContext(): Message[];
}

// 压缩策略
interface CompressionStrategy {
  // 阈值：超过此比例触发压缩
  threshold: number;  // 默认 0.8

  // 保留最近 N 轮对话
  keepRecentTurns: number;  // 默认 3

  // 压缩方式
  method: 'summarize' | 'truncate' | 'hybrid';
}
```

### 2.3 多轮对话流程

```
第1轮：整体分析
  输入：完整剧本
  输出：剧情结构分析、建议分集数、分割点建议

第2轮：确认分集方案
  输入：用户调整后的分集方案
  输出：每集的摘要和主要内容

第3轮+：逐集处理（循环）
  输入：当前集剧本 + 已提取的全局资产
  输出：当前集的角色/场景/道具引用 + 新增资产

压缩触发点：
  - 每处理完一集后检查上下文大小
  - 超过阈值时，将已处理集的详细内容压缩为摘要
  - 保留：全局资产列表 + 最近处理集的详情
```

## 3. 跨集资产复用机制

### 3.1 资产识别与匹配

```typescript
interface AssetMatcher {
  // 查找匹配的已有资产
  findMatch(
    candidate: AssetCandidate,
    existingAssets: Asset[]
  ): AssetMatch | null;

  // 计算相似度
  calculateSimilarity(a: Asset, b: AssetCandidate): number;
}

interface AssetMatch {
  assetId: string;
  confidence: number;  // 0-1
  matchReason: string;
}

// 匹配规则
const matchRules = {
  character: {
    // 名称完全匹配 → 100%
    exactName: 1.0,
    // 名称相似（如"小明"和"明明"）→ 需要 LLM 确认
    similarName: 0.7,
    // 描述相似 → 需要用户确认
    similarDescription: 0.5
  },
  scene: {
    exactName: 1.0,
    // 场景名不同但描述相同的地点
    sameLocation: 0.8
  },
  prop: {
    exactName: 1.0,
    similarName: 0.7
  }
};
```

### 3.2 资产复用流程

```
1. 新集分析时，LLM 提取角色/场景/道具候选
2. 对每个候选：
   a. 在项目资产库中查找匹配
   b. 高置信度匹配 → 自动复用
   c. 中置信度匹配 → 提示用户确认
   d. 无匹配 → 标记为新资产
3. 用户确认后：
   a. 复用的资产 → 更新 episodeRefs
   b. 新资产 → 创建并加入资产库
4. 生成分镜时引用确认后的资产 ID
```

## 4. 资产去重策略

### 4.1 去重时机

```
1. 导入时去重：
   - 用户导入参考图时，计算图片哈希
   - 与已有资产图片比对
   - 重复则提示复用

2. 生成时去重：
   - 生成定妆照前，检查角色是否已有图片
   - 已有则跳过或询问是否重新生成

3. 分析时去重：
   - LLM 提取时就携带已有资产列表
   - Prompt 中明确要求识别已有角色而非创建新条目
```

### 4.2 去重 Prompt 设计

```
你正在分析第 {n} 集的剧本。

已知项目中存在以下角色：
{existingCharacters}

请分析剧本，识别出场角色：
1. 如果是已知角色，返回其 ID
2. 如果是新角色，返回 "NEW" 并提供详细描述
3. 注意区分：同名但不同人 vs 同一人的不同称呼

输出格式：
[
  { "type": "existing", "assetId": "char_001", "name": "小明" },
  { "type": "new", "name": "陌生人", "description": "..." }
]
```

### 4.3 资产指纹计算

```typescript
function calculateAssetFingerprint(asset: Asset): string {
  // 基于关键特征生成指纹
  const features = [
    normalizeText(asset.name),
    normalizeText(asset.description),
    asset.type
  ];

  return hash(features.join('|'));
}

function normalizeText(text: string): string {
  // 去除空白、标点，转小写
  return text.toLowerCase()
    .replace(/[\s\p{P}]/gu, '')
    .trim();
}
```

## 5. 操作模式设计

### 5.1 项目初始化模式

```
用户选择：
A. 从头开始
   → 直接进入项目设置
   → 手动创建分集

B. 导入剧本
   → 上传完整剧本
   → AI 分析并建议分集
   → 用户确认分集方案
   → 批量创建分集
```

### 5.2 创作工作流模式

```
项目概览页
├── 项目设置区（折叠）
│   └── 名称、主题、媒体配置
│
├── 资产总览区
│   ├── 角色卡片墙（显示跨集使用情况）
│   ├── 场景卡片墙
│   └── 道具卡片墙
│
└── 分集列表区
    └── 每集卡片显示：
        - 集名、状态（草稿/剧本/分镜/生成中/完成）
        - 进度条
        - "进入创作" 按钮

点击某集 → 进入该集的 StepNavigator
├── 步骤1：剧本（编辑该集剧本）
├── 步骤2：资产（管理该集引用的资产）
├── 步骤3：分镜（该集的分镜列表）
└── 步骤4：剪辑（该集的时间线）
```

### 5.3 资产管理模式

```
全局资产管理（设置页或项目概览）
├── 查看所有资产
├── 按分集筛选
├── 批量生成（如"为所有缺少定妆照的角色生成"）
└── 清理未引用资产

分集内资产管理
├── 查看本集使用的资产
├── 添加引用（从项目资产库选择）
├── 新建资产（自动加入项目资产库）
└── 移除引用（不删除资产本身）
```

## 6. 状态管理设计

### 6.1 全局状态

```typescript
interface GlobalStore {
  // 当前项目
  currentProjectId: string | null;

  // 当前分集
  currentEpisodeId: string | null;

  // 项目级资产缓存
  projectAssets: {
    characters: Map<string, Character>;
    scenes: Map<string, Scene>;
    props: Map<string, Prop>;
  };

  // 分集列表缓存
  episodes: Map<string, Episode>;
}
```

### 6.2 分集状态

```typescript
interface EpisodeState {
  id: string;
  status: EpisodeStatus;

  // 剧本
  script: string;
  scriptDirty: boolean;

  // 解析结果
  analysis: EpisodeAnalysis | null;

  // 分镜
  shots: Shot[];

  // 当前步骤
  currentStep: 'script' | 'assets' | 'storyboard' | 'timeline';
}

type EpisodeStatus =
  | 'draft'      // 草稿
  | 'script'     // 剧本已完成
  | 'analyzed'   // 已解析
  | 'storyboard' // 分镜已完成
  | 'generating' // 资产生成中
  | 'complete';  // 已完成
```

