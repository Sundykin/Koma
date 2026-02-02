# Design: 修复角色提取 API

## 技术背景

### 当前实现
```typescript
// Sora2Provider.ts
async extractCharacter(videoPath: string): Promise<string> {
  const body = {
    video_url: videoPath,  // ❌ 错误：使用视频文件路径
  };
  // POST /v1/characters
}
```

### 正确的 API 格式（参考 视频文档.md）
```json
// POST /v1/characters
{
  "timestamps": "3,6",      // 可选：从3-6秒提取
  "from_task": "7b904fe9-...", // ✅ 视频生成任务ID
  "callback_url": ""        // 可选
}
```

## 修改方案

### 1. 扩展 Character 类型
```typescript
// types.ts
interface Character {
  // 现有字段...
  previewVideoTaskId?: string;  // 新增：预览视频的生成任务ID
}
```

### 2. 修改视频生成流程
```typescript
// characterAssetWorkflow.ts - generateCharacterPreviewVideo()
// 保存任务 ID
const taskId = await itvProvider.generate(imageSource, prompt, options);
// ...轮询完成后...
await updateCharacterAsset(projectId, character.id, {
  previewVideoPath: localPath,
  previewVideoTaskId: taskId,  // 新增
});
```

### 3. 修改角色提取 API
```typescript
// Sora2Provider.ts
async extractCharacter(taskId: string, timestamps?: string): Promise<string> {
  const body: any = {
    from_task: taskId,  // ✅ 使用任务ID
  };
  if (timestamps) {
    body.timestamps = timestamps;
  }
  // POST /v1/characters
}
```

### 4. 修改提取调用
```typescript
// characterAssetWorkflow.ts - extractAndBindCharacter()
if (!character.previewVideoTaskId) {
  return { success: false, error: '请先生成预览视频（需要任务ID）' };
}
const sora2CharacterId = await itvProvider.extractCharacter(
  character.previewVideoTaskId
);
```

## 数据流变化

```
Before:
  定妆照 → 预览视频生成 → 保存 videoPath → 提取角色(videoPath) ❌

After:
  定妆照 → 预览视频生成 → 保存 videoPath + taskId → 提取角色(taskId) ✅
```

## 兼容性考虑

1. **旧数据迁移**：已有角色如果没有 `previewVideoTaskId`，需要重新生成预览视频
2. **UI 提示**：提取角色时检查 `previewVideoTaskId` 是否存在，给出明确提示
3. **API 回退**：保留 `video_url` 作为备选参数（如果 API 支持两种方式）
