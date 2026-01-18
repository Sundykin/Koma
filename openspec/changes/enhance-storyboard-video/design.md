# Design: 完善 AI 分镜视频生成

## 现状分析

### 数据流问题
```
当前:
  App.tsx (analysisData.characters)
    ↓ ❌ 未传递 mentionItems
  Storyboard (mentionItems=[])
    ↓
  ScriptEditor (无角色可选)

修复后:
  App.tsx (analysisData.characters)
    ↓ ✓ 转换并传递
  Storyboard (mentionItems=[角色列表])
    ↓
  ScriptEditor (@ 弹出角色列表)
```

### 视频生成入口
```
当前:
  分镜卡片 → ThunderboltOutlined → generateShotImage (仅图片)
  导演面板 → "生成此镜头" → generateShotImage (仅图片)

修复后:
  分镜卡片 → ThunderboltOutlined → generateShotImage (图片)
  分镜卡片 → VideoCameraOutlined → shotRenderWorkflow (完整流程)
  导演面板 → "渲染此镜头" → shotRenderWorkflow (图片+语音+视频)
```

## 技术方案

### 1. MentionItem 扩展
```typescript
interface MentionItem {
  id: string;
  type: MentionType;
  name: string;
  description?: string;
  previewImage?: string;
  sora2CharacterId?: string;  // 新增：Sora2 角色 ID
}
```

### 2. 编辑器显示优化
- 有 `sora2CharacterId` 的角色在补全列表显示 `🎬` 标记
- 选择后显示 `@角色名 (Sora2: xxx)` 提示

### 3. 视频生成调用
```typescript
// 单个分镜渲染
const handleRenderShot = async (shotId: string) => {
  const shot = shots.find(s => s.id === shotId);
  await shotRenderWorkflow({
    projectId,
    shot,
    projectConfigIds: { ttiConfigId, itvConfigId, ttsConfigId },
    theme,
    stylePrompt,
  }, onProgress);
};
```

## 工作流程

```
用户在分镜编辑器:
  1. 输入 @ 触发补全
  2. 选择角色（显示是否有 Sora2 绑定）
  3. 编辑分镜描述
  4. 点击"渲染"按钮

系统执行:
  1. shotRenderWorkflow 读取 shot.description
  2. buildVideoPrompt 自动添加 @sora2CharacterId
  3. 调用 Sora2 API 生成视频
```
