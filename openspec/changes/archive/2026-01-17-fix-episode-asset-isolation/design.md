# Design: fix-episode-asset-isolation

## Architecture

### 1. 剧集资产筛选

```
AssetManager
├── props: episodeId (当前剧集)
├── state: showAllAssets (是否显示全部)
└── 筛选逻辑:
    if (showAllAssets) {
      显示项目所有资产
    } else {
      从 EpisodeAnalysis 获取 characterRefs
      只显示 refs 中包含的资产 ID
    }
```

**UI 变更：**
- 顶部添加 Switch：「仅显示当前剧集资产」（默认开启）
- 未关联资产显示为灰色，可点击添加到当前剧集

### 2. 角色定妆照提示词模板

**固定模板结构：**
```
{stylePrefix}, character turnaround sheet, white background,
front view | side view | back view,
three poses in one image, character design reference sheet,
full body, standing pose,
{appearance}
```

**用户可编辑部分：**
- `appearance`: 外貌描述（对应 Character.appearance）
- `stylePrefix`: 来自项目主题设置

**不可编辑部分（内置）：**
- 三视图���列规范
- 背景设置（白色）
- 图片规格（全身、站姿）

### 3. 数据结构变更

**Character 类型修改：**
```typescript
interface Character {
  // 保留
  id: string;
  name: string;
  age: string;
  role: 'protagonist' | 'antagonist' | 'supporting';
  description: string;
  appearance: string;
  voiceId?: string;

  // 修改
  costumePhotoPath?: string;    // 本地路径
  costumePhotoUrl?: string;     // 远程 URL（新增）

  // 删除
  // threeViewPaths  <- 删除
  // avatarUrl       <- 删除（已废弃）

  // 保留
  previewVideoPath?: string;
  sora2CharacterId?: string;
  customPrompt?: string;
  episodeRefs?: EpisodeRef[];
  fingerprint?: string;
}
```

### 4. 生成流程变更

**定妆照生成：**
```
1. 调用 TTI Provider
2. 获取 result.url（远程 URL）
3. 下载到本地 -> costumePhotoPath
4. 保存远程 URL -> costumePhotoUrl
5. 更新 Character
```

**预览视频生成：**
```
1. 检查 costumePhotoUrl 是否存在
2. 若存在，直接使用远程 URL
3. 若不存在（历史数据），尝试上传本地文件或报错
4. 调用 Sora2 generate(imageUrl, prompt)
```

### 5. UI 变更

**CharacterDetailModal：**
- 删除三视图区域
- 定妆照区域显示完整三视图图片
- 提示词编辑只暴露 appearance 部分
- 显示"提示词模板预览"（只读）

**AssetManager：**
- 角色卡片显示定妆照（包含三视图）
- 悬浮生成按钮只有"生成定妆照"

## Implementation Notes

### 远程 URL 保存时机

TTI Provider 返回结果有两种模式：
1. **同步模式**：直接返回 `{ path: string }` 对象
2. **异步模式**：返回 taskId，轮询 checkProgress 获取 resultUrl

需要在两种模式下都保存远程 URL：
- 同步模式：`result.path` 可能是本地路径也可能是 URL，需判断
- 异步模式：`progress.resultUrl` 是远程 URL

### Sora2 图片 URL 要求

根据 Sora2Provider.ts 的 generate 方法：
```typescript
const body = {
  model: 'sora-2',
  prompt,
  aspect_ratio: options?.aspectRatio || '16:9',
  duration: options?.duration || 5,
  image_urls: [imagePath],  // 需要是可访问的远程 URL
};
```

`image_urls` 需要是公网可访问的 URL，不能是本地文件路径。

### 迁移策略

对于已有角色数据：
- `threeViewPaths` 数据保留但不再使用
- 新生成时覆盖为新格式
- 不做自动迁移，避免复杂性
