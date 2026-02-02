# 短视频制作流程优化 - 实施计划

## 📌 需求摘要

1. **图床插件** - 新建 `image-hosting` 类型插件，支持上传图片获取远程URL
2. **自动上传图床** - 手动上传资产图片后，检测配置了图床插件则自动上传
3. **提示词@资产同步** - 实时双向同步提示词编辑器与左侧资产选择器
4. **图生图资源传递** - 文生图时收集资源URL，按排序修饰提示词
5. **视频提示词规范** - 同上，但Sora2角色使用角色名而非图片

---

## 🏗️ 架构设计

### 1. 图床插件架构

```
packages/plugins/image-hosting-provider/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # 插件入口
    ├── ImageHostingProvider.ts  # 核心Provider
    └── types.ts              # 类型定义
```

**插件类型**: 新增 `image-hosting` 到 ChannelKind

**接口定义**:
```typescript
interface ImageHostingProvider {
  uploadImage(file: File | Buffer, options?: UploadOptions): Promise<UploadResult>;
}

interface UploadOptions {
  outputFormat?: 'auto' | 'jpeg' | 'png' | 'webp' | 'gif' | 'webp_animated';
  cdnDomain?: string;
}

interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  data?: {
    filename: string;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
}
```

### 2. 上传服务增强

**修改文件**: `frontend/src/services/uploadService.ts`

新增:
- `uploadToImageHosting(localPath: string): Promise<string | null>` - 调用图床
- `getImageHostingConfig(): ImageHostingConfig | null` - 获取配置
- 重试机制: 最多3次，指数退避

### 3. 资产面板集成

**修改文件**:
- `CharacterDetailPanel.tsx`
- `SceneDetailPanel.tsx`
- `PropDetailPanel.tsx`

在 `handleUploadCostume` / `handleUploadImage` 成功后:
```typescript
// 检测图床配置
const imageHostingConfig = getImageHostingConfig();
if (imageHostingConfig) {
  const remoteUrl = await uploadToImageHostingWithRetry(localPath, 3);
  if (remoteUrl) {
    updated.costumePhotoUrl = remoteUrl; // 或 imageUrl
  }
}
```

### 4. 提示词资产同步

**核心组件修改**:

#### 4.1 新增 `useShotAssetSync` Hook

```typescript
// frontend/src/hooks/useShotAssetSync.ts
interface ShotAssetSyncState {
  selectedCharacters: string[];
  selectedScenes: string[];
  selectedProps: string[];
  mentionedAssets: ParsedMention[]; // 从提示词解析
}

function useShotAssetSync(shot: Shot, prompt: string) {
  // 解析提示词中的@mentions
  // 与shot.characters/scenes/props比较
  // 返回同步函数
}
```

#### 4.2 修改 MentionContext

新增事件:
- `onMentionInsert(type, id)` - @插入回调
- `onMentionRemove(type, id)` - @删除回调

#### 4.3 ShotCard 双向绑定

监听 AssetSelector 的 onChange → 更新提示词
监听 MentionContext 的事件 → 更新 AssetSelector

### 5. 图生图资源传递

**修改文件**: `ShotGenerationService.ts`

```typescript
private buildShotPrompt(shot: Shot, characters: Character[], scenes: Scene[]): string {
  // 收集资源URL
  const resourceUrls: ResourceRef[] = [];

  for (const charId of shot.characters || []) {
    const char = characters.find(c => c.id === charId);
    if (char?.costumePhotoUrl) {
      resourceUrls.push({
        type: 'character',
        id: charId,
        name: char.name,
        url: char.costumePhotoUrl,
        description: char.prompt
      });
    }
  }

  // 按顺序构建提示词
  let prompt = shot.imagePrompt || '';

  // 替换@mention为资源描述
  for (const ref of resourceUrls) {
    prompt = prompt.replace(
      new RegExp(`@${ref.name}`, 'g'),
      `[${ref.name}: ${ref.description}]`
    );
  }

  // 附加参考图URL列表（供图生图使用）
  const referenceImages = resourceUrls.map(r => r.url);

  return { prompt, referenceImages };
}
```

### 6. 视频提示词Sora2特殊处理

**修改文件**: `ShotPromptService.ts` 和 `shotRenderWorkflow.ts`

```typescript
function buildVideoPrompt(shot: Shot, characters: Character[]) {
  for (const charId of shot.characters || []) {
    const char = characters.find(c => c.id === charId);
    if (char?.sora2CharacterId) {
      // Sora2角色：使用角色名引用
      prompt = prompt.replace(`@${char.name}`, `@${char.sora2CharacterId}`);
    } else if (char?.costumePhotoUrl) {
      // 普通角色：传图片URL
      referenceImages.push(char.costumePhotoUrl);
    }
  }
}
```

---

## 📁 文件变更清单

### 新建文件

| 文件路径 | 说明 |
|----------|------|
| `packages/plugin-sdk/src/imageHosting.ts` | 图床Provider接口 |
| `packages/plugins/scdn-image-hosting/` | SCDN图床插件 |
| `frontend/src/hooks/useShotAssetSync.ts` | 提示词资产同步Hook |
| `frontend/src/services/imageHostingService.ts` | 图床上传服务 |

### 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `packages/plugin-sdk/src/index.ts` | 导出ImageHostingProvider类型 |
| `packages/plugin-sdk/src/provider.ts` | 新增ChannelKind: 'image-hosting' |
| `electron/src/service/plugin/types.ts` | 新增ImageHostingMeta |
| `frontend/src/services/uploadService.ts` | 集成图床上传 |
| `frontend/src/components/asset/CharacterDetailPanel.tsx` | 上传后调图床 |
| `frontend/src/components/asset/SceneDetailPanel.tsx` | 上传后调图床 |
| `frontend/src/components/asset/PropDetailPanel.tsx` | 上传后调图床 |
| `frontend/src/editor/MentionContext.tsx` | 新增事件回调 |
| `frontend/src/editor/mentionPlugin.ts` | 发射插入/删除事件 |
| `frontend/src/components/storyboard/ShotCard.tsx` | 双向同步逻辑 |
| `frontend/src/components/storyboard/components/AssetSelector.tsx` | 监听mention事件 |
| `frontend/src/services/ShotGenerationService.ts` | 资源URL收集+替换 |
| `frontend/src/services/ShotPromptService.ts` | Sora2特殊处理 |
| `frontend/src/workflow/shotRenderWorkflow.ts` | 视频提示词Sora2处理 |
| `frontend/src/types.ts` | 新增ImageHostingConfig类型 |

---

## ⚙️ 实施顺序

### Phase 1: 图床基础设施 (优先级最高)
1. ✅ 定义 ImageHostingProvider 接口
2. ✅ 创建 scdn-image-hosting 插件
3. ✅ 实现 imageHostingService.ts
4. ✅ 集成到资产面板（手动上传触发）

### Phase 2: 提示词资产同步
5. ✅ 实现 useShotAssetSync Hook
6. ✅ 修改 MentionContext 添加事件
7. ✅ ShotCard 双向绑定实现
8. ✅ AssetSelector 监听同步

### Phase 3: 图/视频生成增强
9. ✅ ShotGenerationService 资源收集
10. ✅ ShotPromptService Sora2处理
11. ✅ shotRenderWorkflow 视频特殊逻辑

---

## 🔧 技术细节

### 图床API调用示例

```typescript
async function uploadToSCDN(
  imageBuffer: Buffer,
  filename: string,
  options: { outputFormat?: string; cdnDomain?: string }
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('image', new Blob([imageBuffer]), filename);
  if (options.outputFormat) {
    formData.append('outputFormat', options.outputFormat);
  }
  if (options.cdnDomain) {
    formData.append('cdn_domain', options.cdnDomain);
  }

  const response = await fetch('https://api.scdn.io/api/v1.php', {
    method: 'POST',
    body: formData,
  });

  return response.json();
}
```

### 重试机制

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (i < maxRetries - 1) {
        await delay(baseDelay * Math.pow(2, i)); // 指数退避
      }
    }
  }
  throw lastError;
}
```

---

## ✅ 验收标准

1. **图床插件**
   - [ ] 可在设置中配置图床插件
   - [ ] 上传图片返回远程URL
   - [ ] 失败重试3次后提示错误

2. **资产上传**
   - [ ] 手动上传角色定妆照后自动上传图床
   - [ ] 场景/道具图片同理
   - [ ] 远程URL存入对应的 xxxUrl 字段

3. **提示词同步**
   - [ ] 输入@触发选择弹窗，选中后左侧实时更新
   - [ ] 删除@mention后左侧实时取消选中
   - [ ] 左侧手动勾选后提示词自动插入@mention

4. **图生图**
   - [ ] 收集选中资源的远程URL
   - [ ] 提示词中@被替换为资源描述
   - [ ] 参考图列表传给TTI Provider

5. **视频Sora2**
   - [ ] 有sora2CharacterId的角色使用角色名
   - [ ] 无sora2CharacterId的角色使用图片URL
