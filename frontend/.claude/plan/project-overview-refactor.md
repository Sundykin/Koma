# ProjectOverview 重构实施计划

## 目标
将项目详情页从"管理视图"重构为"剧本优先的创作工作台"。

## 核心变更

### 1. 类型系统重构

#### EditorStep (3步流程)
```ts
// 旧: 'script' | 'assets' | 'storyboard' | 'video'
// 新:
export type EditorStep = 'assets' | 'storyboard' | 'video';
```

#### EpisodeStepProgress
```ts
// 旧: { script, assets, storyboard, video }
// 新:
export interface EpisodeStepProgress {
  assets: 'pending' | 'completed';
  storyboard: 'pending' | 'completed';
  video: 'pending' | 'completed';
}
```

#### 数据迁移辅助函数
```ts
function normalizeEpisodeProgress(input?: any): EpisodeStepProgress {
  return {
    assets: input?.assets ?? 'pending',
    storyboard: input?.storyboard ?? 'pending',
    video: input?.video ?? 'pending',
  };
}
```

### 2. 组件架构

```
ProjectOverview/
├── Header (64px) - 项目标题 + 标签
├── Layout (三栏)
│   ├── Left (360px) - EpisodeManager
│   │   └── 选中态: border-l-4 border-emerald-500
│   ├── Center (flex-1) - ScriptWorkbench
│   │   ├── InlineProjectToolbar (56px)
│   │   │   ├── Left: ModelConfigPopover
│   │   │   ├── Center: AI润色 | 续写
│   │   │   └── Right: 保存状态 | 开始制作
│   │   └── ScriptEditor (flex-1)
│   └── Right (340px) - ProjectAssetOverview
└── Modal: EpisodeSplitWizard (保留)
```

### 3. 新增组件

#### InlineProjectToolbar
```tsx
interface InlineProjectToolbarProps {
  episode: Episode | null;
  project: Project;
  onPolish: () => void;
  onAnalyze: () => void;
  onStartProduction: () => void;
  isSaving: boolean;
  isAnalyzing: boolean;
}
```

#### ScriptWorkbench
```tsx
interface ScriptWorkbenchProps {
  episode: Episode | null;
  project: Project;
  onScriptChange: (text: string) => void;
  onStartProduction: () => void;
}
// 内含自动保存逻辑 (useDebounce 2s)
```

#### ModelConfigPopover
```tsx
interface ModelConfigPopoverProps {
  llmConfigId?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  ttsConfigId?: string;
  onChange: (configs: {...}) => void;
}
```

### 4. App.tsx 状态流重构

```tsx
// 分离选择与进入
const handleEpisodeSelect = (episode: Episode) => {
  setActiveEpisode(episode);
  setScriptText(episode.scriptText || '');
  // 保持 view='overview'
};

const handleEnterEpisode = (episode: Episode) => {
  setActiveEpisode(episode);
  setView('editor');
  const steps: EditorStep[] = ['assets', 'storyboard', 'video'];
  const progress = normalizeEpisodeProgress(episode.stepProgress);
  const firstPending = steps.find(s => progress[s] === 'pending') || 'assets';
  setEditorStep(firstPending);
  setStepProgress(progress);
};

// 默认值更新
const [editorStep, setEditorStep] = useState<EditorStep>('assets');
const [stepProgress, setStepProgress] = useState<EpisodeStepProgress>({
  assets: 'pending', storyboard: 'pending', video: 'pending',
});
```

### 5. 文件修改清单

| 文件 | 改动 |
|------|------|
| `src/types.ts` | EditorStep 3步, EpisodeStepProgress 去 script |
| `src/App.tsx` | 分离 onEpisodeSelect/onEnterEpisode, 默认值, TaskManager 监听 |
| `src/components/project/ProjectOverview.tsx` | 中间区 ScriptWorkbench, 移除 Drawer/Modal 设置 |
| `src/components/project/EpisodeManager.tsx` | 选中态样式, 受控模式 |
| `src/components/project/InlineProjectToolbar.tsx` | 新建 |
| `src/components/project/ScriptWorkbench.tsx` | 新建 |
| `src/components/project/ModelConfigPopover.tsx` | 新建 |
| `src/components/common/StepNavigator.tsx` | 3步流程 |
| `src/components/editor/EditorView.tsx` | 移除 script 视图 |

### 6. 交互流程

```
进入项目
  ↓
加载剧集列表 → 自动选中第一集
  ↓
中间显示剧本 (ScriptEditor)
  ↓
点击剧集 → 切换剧本内容 (自动保存)
  ↓
点击"开始制作" → 保存 → 进入 EditorView (assets 步骤)
```

### 7. 风险与注意事项

1. **旧数据兼容**: 使用 `normalizeEpisodeProgress` 处理
2. **自动保存**: 使用 useDebounce 避免频繁写入
3. **大剧本性能**: ScriptEditor 需支持虚拟滚动
4. **分析入口**: 工具栏"AI解析"按钮调用 startBackgroundAnalysis

## 执行顺序

1. 类型系统修改 (types.ts)
2. 新建工具组件 (ModelConfigPopover, InlineProjectToolbar)
3. 新建 ScriptWorkbench
4. 重构 EpisodeManager (选中态)
5. 重构 ProjectOverview (组装)
6. 重构 App.tsx (状态流)
7. 修改 StepNavigator + EditorView (3步)
8. 测试验证
