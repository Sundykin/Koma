# Design: 分镜编辑器资产引用与资产管理优化

## Context

### 当前问题

1. **@mention ID 问题**
   ```tsx
   // Storyboard.tsx 当前实现
   items.push({
     id: char.id,  // 使用自定义 UUID
     type: 'char',
     name: char.name,
     sora2CharacterId: char.sora2CharacterId,
   });
   // 生成的 mention: @char_{char.id}
   // 如果 char.id = "char_abc123"，则变成 @char_char_abc123
   ```

2. **Sora2 绑定机制**
   - 角色: 支持 `sora2CharacterId`
   - 道具: 不支持 Sora2 绑定
   - 场景: 不需要 Sora2 绑定（场景通过描述词生成）

3. **资产管理 UI**
   - 当前: 卡片网格 → 点击 → 弹窗编辑
   - 目标: 左侧列表 + 右侧属性面板

## Goals / Non-Goals

### Goals
- 修复 @mention ID 重复问题
- 只有绑定 Sora2 的资产可在分镜中 @引用
- 道具支持 Sora2 绑定流程
- 资产管理改为列表+面板模式
- AI 分镜支持预选角色/道具

### Non-Goals
- 不改变场景的处理方式（场景不需要 Sora2 绑定）
- 不重构 ScriptEditor 核心逻辑
- 不改变 Sora2 API 调用方式

## Decisions

### Decision 1: MentionItem ID 使用 Sora2 ID

**问题**: 当前使用自定义 ID 导致 mention 格式错误

**方案**: MentionItem 的 `id` 字段使用 `sora2CharacterId`（角色）或 `sora2PropId`（道具）

```tsx
// 修改后的 Storyboard.tsx
const actualMentionItems: MentionItem[] = useMemo(() => {
  const items: MentionItem[] = [];

  // 只添加已绑定 Sora2 的角色
  characters
    .filter(char => char.sora2CharacterId)
    .forEach(char => {
      items.push({
        id: char.sora2CharacterId!,  // 使用 Sora2 ID
        type: 'char',
        name: char.name,
        description: char.description,
        previewImage: char.costumePhotoPath,
      });
    });

  // 只添加已绑定 Sora2 的道具
  props
    .filter(prop => prop.sora2PropId)
    .forEach(prop => {
      items.push({
        id: prop.sora2PropId!,  // 使用 Sora2 ID
        type: 'prop',
        name: prop.name,
        description: prop.description,
        previewImage: prop.imagePath,
      });
    });

  // 场景仍使用自定义 ID（场景不需要 Sora2 绑定）
  scenes.forEach(scene => {
    items.push({
      id: scene.id,
      type: 'scene',
      name: scene.name,
      description: scene.description,
      previewImage: scene.imagePath,
    });
  });

  return items;
}, [characters, scenes, props]);
```

### Decision 2: Prop 类型扩展

**新增字段**:
```typescript
export interface Prop {
  // ... 现有字段

  // 新增 Sora2 绑定相关字段
  previewVideoPath?: string;       // 预览视频路径
  previewVideoTaskId?: string;     // 预览视频生成任务 ID
  sora2PropId?: string;            // Sora2 道具 ID
  customPrompt?: string;           // 自定义生成提示词
}
```

### Decision 3: 资产管理 UI 布局

**新布局结构**:
```
┌─────────────────────────────────────────────────────────┐
│ [角色] [场景] [道具]  |  筛选器  |  + 新建  |  批量生成   │
├────────────────────┬────────────────────────────────────┤
│ 列表区域 (280px)   │  属性面板区域                       │
│                    │                                    │
│ ┌──────────────┐   │  [名称] ___________                │
│ │ 🟢 角色1     │   │  [类型] ___________                │
│ │   主角       │   │  [描述] ___________                │
│ └──────────────┘   │                                    │
│ ┌──────────────┐   │  [定妆照]                          │
│ │ ⚪ 角色2     │   │  ┌─────────────────┐               │
│ │   配角       │   │  │     图片预览      │               │
│ └──────────────┘   │  └─────────────────┘               │
│                    │  [生成] [上传] [重新生成]           │
│                    │                                    │
│                    │  [Sora2 绑定]                      │
│                    │  状态: 已绑定 ✓                     │
│                    │  ID: sora2_xxx                     │
│                    │  [重新提取]                        │
│                    │                                    │
│                    │  [生成提示词]                      │
│                    │  ┌─────────────────┐               │
│                    │  │ 可编辑的提示词    │               │
│                    │  └─────────────────┘               │
│                    │                                    │
│                    │           [保存] [删除]            │
└────────────────────┴────────────────────────────────────┘
```

**组件拆分**:
- `AssetListPanel.tsx` - 左侧列表面板
- `AssetDetailPanel.tsx` - 右侧属性面板
- `CharacterDetailPanel.tsx` - 角色属性面板
- `SceneDetailPanel.tsx` - 场景属性面板
- `PropDetailPanel.tsx` - 道具属性面板

### Decision 4: AI 分镜预选资产

**交互流程**:
1. 用户点击「AI 智能生成分镜」按钮
2. 弹出预选资产对话框
3. 用户可勾选本集使用的角色和道具
4. 确认后，预选资产信息注入到 AI prompt
5. AI 生成的分镜自动带上匹配的角色/道具引用

**prompt 注入格式**:
```
可用角色（已绑定，可使用 @char_xxx 引用）:
- @char_sora2id1: 李明（主角，年轻程序员）
- @char_sora2id2: 王芳（女主，设计师）

可用道具（已绑定，可使用 @prop_xxx 引用）:
- @prop_sora2id3: 笔记本电脑
- @prop_sora2id4: 咖啡杯
```

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| 未绑定资产无法使用 @ 引用 | 用户需先完成绑定 | 在属性面板显示绑定状态和引导 |
| UI 重构影响范围大 | 可能引入 bug | 分阶段实施，先修复 ID 问题 |
| 道具绑定增加复杂度 | 用户学习成本 | 复用角色绑定流程，保持一致 |

## Migration Plan

1. **Phase 1**: 修复 @mention ID 问题（不改变 UI）
2. **Phase 2**: Prop 类型扩展 + 道具 Sora2 绑定流程
3. **Phase 3**: 资产管理 UI 重构
4. **Phase 4**: AI 分镜预选资产功能

## Open Questions

无
