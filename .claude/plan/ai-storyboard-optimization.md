# AI 分镜页面优化实施计划

## 需求概述
优化 AI 分镜页面的用户体验和布局设计：
1. 布局优化：充分利用屏幕空间，分镜卡片双列响应式布局
2. 舞台区域：顶部可折叠的视频预览播放器
3. 角色选择：卡片 Header 区域添加角色多选器
4. 提示词区分：文生图 (imagePrompt) 和图生视频 (videoPrompt) 分离

## 技术方案
- **布局**：A1 - 顶部舞台 + 双列卡片（响应式瀑布流）
- **角色选择器**：卡片 Header 区域

---

## 实施步骤

### Phase 1: 数据层准备

#### 1.1 提示词字段兼容处理
**文件**: `frontend/src/store/projectStore.ts` 或 `frontend/src/store/project/analysis.ts`

在加载分镜数据时添加运行时兼容：
```typescript
// loadEpisodeShots 返回数据时添加 fallback
shots = shots.map(shot => ({
  ...shot,
  imagePrompt: shot.imagePrompt || shot.description || '',
  videoPrompt: shot.videoPrompt || shot.description || '',
}));
```

#### 1.2 ShotPromptService 修改
**文件**: `frontend/src/services/ShotPromptService.ts`

- 批量生成改为按需生成：检测 `!imagePrompt` 或 `!videoPrompt` 分别处理
- 支持单独重新生成某一类型提示词
- 确保 `updateShot` 同时写入两个字段

---

### Phase 2: 整体布局重构

#### 2.1 启用 StoryboardStudio
**文件**: `frontend/src/components/storyboard/Storyboard.tsx`

```tsx
// 新增状态
const [activeShotId, setActiveShotId] = useState<string | null>(null);

// 获取激活的分镜
const activeShot = useMemo(() =>
  shots.find(s => s.id === activeShotId) || null
, [shots, activeShotId]);

// 渲染时包�� StoryboardStudio
return (
  <StoryboardStudio
    selectedShot={activeShot}
    characters={characters}
    scenes={scenes}
    onShotSelect={setActiveShotId}
  >
    <ShotListEditor
      {...existingProps}
      activeShotId={activeShotId}
      onActiveShotChange={setActiveShotId}
    />
  </StoryboardStudio>
);
```

#### 2.2 分镜列表容器改为 Grid
**文件**: `frontend/src/components/storyboard/ShotListEditor.css`

```css
.shot-list-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(750px, 1fr));
  gap: 16px;
  align-items: start;
  max-width: 100%;
  margin: 0;
  padding: 0 16px;
}
```

---

### Phase 3: ShotCard 组件重构

#### 3.1 布局结构调整
**文件**: `frontend/src/components/storyboard/ShotCard.tsx`

新的内部结构：
```
┌─────────────────────────────────────────────────┐
│ Header: #序号 | [角色选择器 Tag+] | 元数据 | 操作按钮 │
├───────────────────────────┬─────────────────────┤
│ 剧本输入 (Script)          │                     │
│                            │ 参考图 Grid          │
├───────────────────────────┤ (ImageCardGrid)     │
│ Tabs:                      │                     │
│ [画面提示词] [视频提示词]   ├─────────────────────┤
│ ┌───────────────────────┐ │                     │
│ │ ScriptEditor          │ │ 视频 Grid            │
│ │ + 生成按钮             │ │ (VideoCardGrid)     │
│ └───────────────────────┘ │                     │
└───────────────────────────┴─────────────────────┘
```

#### 3.2 新增 Props
```typescript
interface ShotCardProps {
  // 现有 props...

  // 新增
  isActive?: boolean;
  onActivate?: (shotId: string) => void;
  onImagePromptChange: (shotId: string, prompt: string) => void;
  onVideoPromptChange: (shotId: string, prompt: string) => void;
  onCharacterSelect?: (shotId: string, characterIds: string[]) => void;
}
```

#### 3.3 CSS 样式更新
**文件**: `frontend/src/components/storyboard/ShotCard.css`

```css
/* 新的 Body 布局 */
.shotCardBody {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 1px;
  background: #27272a;
  min-height: 350px;
}

.textPanel {
  background: #18181b;
  display: flex;
  flex-direction: column;
}

.scriptArea {
  padding: 12px;
  border-bottom: 1px solid #27272a;
}

/* 提示词 Tabs */
.promptTabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.promptTabs :global(.ant-tabs-nav) {
  margin-bottom: 0;
  padding: 0 12px;
  background: #202023;
}

.promptTabs :global(.ant-tabs-content) {
  flex: 1;
  padding: 12px;
}

/* 媒体面板 */
.mediaPanel {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  background: #27272a;
}

/* 激活状态 */
.shotCard.active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}
```

---

### Phase 4: 角色选择器实现

#### 4.1 角色选择器组件
在 ShotCard Header 区域添加：

```tsx
<div className="characterSelector">
  {/* 已选角色 Tags */}
  {selectedCharacters.map(char => (
    <Tag
      key={char.id}
      closable
      onClose={() => handleRemoveCharacter(char.id)}
    >
      {char.name}
    </Tag>
  ))}

  {/* 添加按钮 */}
  <Popover
    trigger="click"
    content={
      <Select
        mode="multiple"
        value={shot.characters}
        onChange={handleCharacterChange}
        options={characters.map(c => ({ value: c.id, label: c.name }))}
        style={{ minWidth: 200 }}
      />
    }
  >
    <Tag className="addTag">+ 添加角色</Tag>
  </Popover>
</div>
```

---

### Phase 5: 父组件适配

#### 5.1 ShotListEditor Props 更新
**文件**: `frontend/src/components/storyboard/ShotListEditor.tsx`

```typescript
interface ShotListEditorProps {
  // 现有 props...

  // 新增
  activeShotId?: string | null;
  onActiveShotChange?: (shotId: string | null) => void;
  onImagePromptChange: (shotId: string, prompt: string) => void;
  onVideoPromptChange: (shotId: string, prompt: string) => void;
  onCharacterSelect?: (shotId: string, characterIds: string[]) => void;
}
```

#### 5.2 Storyboard.tsx 回调函数更新
```typescript
// 图片提示词变更
const handleImagePromptChange = useCallback((shotId: string, imagePrompt: string) => {
  const updatedShots = shots.map(s =>
    s.id === shotId ? { ...s, imagePrompt } : s
  );
  saveAllShots(updatedShots);
}, [shots, saveAllShots]);

// 视频提示词变更
const handleVideoPromptChange = useCallback((shotId: string, videoPrompt: string) => {
  const updatedShots = shots.map(s =>
    s.id === shotId ? { ...s, videoPrompt } : s
  );
  saveAllShots(updatedShots);
}, [shots, saveAllShots]);

// 角色选择变更
const handleCharacterSelect = useCallback((shotId: string, characterIds: string[]) => {
  const updatedShots = shots.map(s =>
    s.id === shotId ? { ...s, characters: characterIds } : s
  );
  saveAllShots(updatedShots);
}, [shots, saveAllShots]);
```

---

## 文件修改清单

| 文件 | 修改类型 | 内容摘要 |
|------|----------|----------|
| `Storyboard.tsx` | 重构 | 添加 activeShotId 状态，包裹 StoryboardStudio，新增回调函数 |
| `ShotListEditor.tsx` | 修改 | 接收新 props，传递给 ShotCard，更新统计逻辑 |
| `ShotListEditor.css` | 修改 | 容器改为 Grid 响应式布局 |
| `ShotCard.tsx` | 重构 | 新布局结构、Tabs 提示词、角色选择器 |
| `ShotCard.css` | 重写 | 适配新布局，双列结构 |
| `ShotPromptService.ts` | 修改 | 支持按类型生成提示词 |
| `projectStore.ts` | 修改 | 加载时添加字段 fallback |

---

## 验收标准

1. **布局**
   - [ ] 宽屏 (≥1600px) 显示双列卡片
   - [ ] 窄屏 (<1600px) 回退单列
   - [ ] 顶部舞台区域可折叠/展开

2. **舞台预览**
   - [ ] 点击分镜卡片，舞台自动播放对应视频
   - [ ] 激活的卡片有高亮边框

3. **角色选择**
   - [ ] 卡片 Header 显示已选角色 Tags
   - [ ] 点击可添加/移除角色
   - [ ] 角色变更自动保存

4. **双提示词**
   - [ ] Tabs 切换"画面提示词"/"视频提示词"
   - [ ] 各自独立编辑和保存
   - [ ] AI 生成按钮分别触发对应类型生成
   - [ ] 旧数据 (仅 description) 自动兼容

5. **性能**
   - [ ] 50+ 分镜滚动流畅
   - [ ] Tab 切换无卡顿

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 双 ScriptEditor 性能问题 | Tab 切换时懒加载，只渲染当前激活的编辑器 |
| 旧数据兼容 | 加载时运行时 fallback，不修改原始文件 |
| 批量操作与激活状态冲突 | 操作按钮添加 stopPropagation |
