# Koma 短剧制作流程 UI 重构计划

基于 waoowaoo 开源项目，重构 Koma 的短剧制作流程，实现完整的任务队列 UI 和工作流可视化。

---

## 📊 现状分析

### Koma 当前状态
- ✅ 后端队列系统已实现（better-queue + SQLite）
- ✅ IPC 通信已建立（main ↔ renderer）
- ✅ 任务状态管理已完成
- ❌ **UI 层未实现**：用户看不到任务进度
- ❌ **工作流可视化缺失**：无法查看任务状态
- ❌ **任务管理界面缺失**：无法取消/重试任务

### waoowaoo 参考架构
- ✅ 完整的任务状态 UI（TaskStatusOverlay / TaskStatusInline）
- ✅ 实时进度展示（SSE + 轮询）
- ✅ 任务队列管理界面
- ✅ 多阶段工作流可视化
- ✅ 错误处理与重试机制

---

## 🎯 重构目标

### 1. 任务状态可视化
- 实时显示任务进度（0-100%）
- 显示当前阶段（prepare → execute → persist）
- 显示任务状态（queued / processing / completed / failed）
- 错误信息展示

### 2. 任务队列管理界面
- 任务列表（按项目/分镜分组）
- 任务操作（取消/重试/清除）
- 批量操作支持
- 任务历史记录

### 3. 分镜制作工作流优化
- 一键批量生成
- 并发控制可视化（显示 3 个工作线程状态）
- 队列状态实时更新
- 完成通知

---

## 📋 实施计划

### Phase 1: 任务状态 UI 组件（1-2 小时）

#### 1.1 创建核心 UI 组件
**文件**：`frontend/src/components/task/`

```
TaskStatusOverlay.tsx      - 覆盖层状态展示（加载中/错误）
TaskStatusInline.tsx       - 行内状态展示（进度条）
TaskProgressBar.tsx        - 进度条组件
TaskPhaseIndicator.tsx     - 阶段指示器（prepare/execute/persist）
TaskErrorDisplay.tsx       - 错误信息展示
```

**功能**：
- 实时进度展示（0-100%）
- 阶段切换动画
- 错误状态高亮
- 加载动画

#### 1.2 集成到现有分镜组件
**修改文件**：
- `frontend/src/components/storyboard/ShotCard.tsx`
- `frontend/src/components/storyboard/ShotList.tsx`
- `frontend/src/components/project/ProjectOverview.tsx`

**集成点**：
- 分镜卡片上显示任务状态
- 项目概览显示整体进度
- 批量操作时显示队列状态

---

### Phase 2: 任务队列管理界面（2-3 小时）

#### 2.1 任务队列页面
**文件**：`frontend/src/pages/TaskQueue.tsx`

**功能**：
- 任务列表（表格/卡片视图）
- 筛选（按状态/项目/时间）
- 排序（按创建时间/优先级）
- 搜索（按分镜 ID/项目名）

#### 2.2 任务详情面板
**文件**：`frontend/src/components/task/TaskDetailPanel.tsx`

**功能**：
- 任务完整信息
- 执行日志
- 错误堆栈
- 重试历史

#### 2.3 任务操作
**功能**：
- 取消任务（调用 `cancelTask` API）
- 重试任务（调用 `retryTask` API）
- 清除已完成任务（调用 `clearCompletedTasks` API）
- 批量操作

---

### Phase 3: 实时状态更新（1-2 小时）

#### 3.1 状态订阅机制
**文件**：`frontend/src/hooks/useTaskStatus.ts`

```typescript
export function useTaskStatus(taskId: string) {
  const [status, setStatus] = useState<TaskInfo | null>(null)

  useEffect(() => {
    // 订阅任务更新
    const unsubscribe = taskQueueService.onTaskUpdate((event) => {
      if (event.taskId === taskId) {
        setStatus(event)
      }
    })

    // 初始加载
    taskQueueService.getTaskStatus(taskId).then(setStatus)

    return unsubscribe
  }, [taskId])

  return status
}
```

#### 3.2 批量状态订阅
**文件**：`frontend/src/hooks/useTaskList.ts`

```typescript
export function useTaskList(projectId?: string) {
  const [tasks, setTasks] = useState<TaskInfo[]>([])

  useEffect(() => {
    // 订阅所有任务更新
    const unsubscribe = taskQueueService.onTaskUpdate((event) => {
      setTasks(prev => {
        const index = prev.findIndex(t => t.taskId === event.taskId)
        if (index >= 0) {
          const next = [...prev]
          next[index] = { ...next[index], ...event }
          return next
        }
        return prev
      })
    })

    // 初始加载
    taskQueueService.listTasks().then(setTasks)

    return unsubscribe
  }, [projectId])

  return tasks
}
```

---

### Phase 4: 分镜制作工作流优化（2-3 小时）

#### 4.1 批量生成界面
**文件**：`frontend/src/components/storyboard/BatchGenerateDialog.tsx`

**功能**：
- 选择要生成的分镜（多选）
- 设置生成参数（风格/模型）
- 预览队列（显示将要提交的任务）
- 一键提交

#### 4.2 队列状态面板
**文件**：`frontend/src/components/task/QueueStatusPanel.tsx`

**功能**：
- 显示队列统计（queued / processing / completed / failed）
- 显示工作线程状态（3 个 worker）
- 显示预计完成时间
- 实时更新

#### 4.3 完成通知
**文件**：`frontend/src/components/task/TaskNotification.tsx`

**功能**：
- 任务完成通知（桌面通知 + 应用内通知）
- 任务失败通知
- 批量任务完成通知
- 通知历史

---

### Phase 5: 错误处理与重试（1 小时）

#### 5.1 错误展示优化
**功能**：
- 友好的错误信息（中文翻译）
- 错误分类（网络错误/配置错误/服务错误）
- 错误建议（如何修复）

#### 5.2 自动重试优化
**功能**：
- 显示重试次数（1/3）
- 显示下次重试时间
- 手动触发重试
- 跳过重试（直接标记失败）

---

## 🎨 UI 设计参考

### 任务状态颜色
```css
--task-queued: #6B7280      /* 灰色 */
--task-processing: #3B82F6  /* 蓝色 */
--task-completed: #10B981   /* 绿色 */
--task-failed: #EF4444      /* 红色 */
```

### 进度条样式
- 0-33%: 蓝色（prepare 阶段）
- 34-66%: 紫色（execute 阶段）
- 67-100%: 绿色（persist 阶段）

### 动画效果
- 进度条：平滑过渡（transition: width 0.3s ease）
- 阶段切换：淡入淡出（fade in/out）
- 加载动画：旋转图标（spin animation）

---

## 📦 技术实现

### 1. 状态管理
使用 Zustand 管理全局任务状态：

```typescript
// frontend/src/store/taskStore.ts
interface TaskStore {
  tasks: Map<string, TaskInfo>
  addTask: (task: TaskInfo) => void
  updateTask: (taskId: string, updates: Partial<TaskInfo>) => void
  removeTask: (taskId: string) => void
  clearCompleted: () => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: new Map(),
  addTask: (task) => set((state) => {
    const next = new Map(state.tasks)
    next.set(task.taskId, task)
    return { tasks: next }
  }),
  updateTask: (taskId, updates) => set((state) => {
    const next = new Map(state.tasks)
    const existing = next.get(taskId)
    if (existing) {
      next.set(taskId, { ...existing, ...updates })
    }
    return { tasks: next }
  }),
  removeTask: (taskId) => set((state) => {
    const next = new Map(state.tasks)
    next.delete(taskId)
    return { tasks: next }
  }),
  clearCompleted: () => set((state) => {
    const next = new Map(state.tasks)
    for (const [id, task] of next) {
      if (task.status === 'completed') {
        next.delete(id)
      }
    }
    return { tasks: next }
  }),
}))
```

### 2. 实时更新
使用 IPC 事件监听：

```typescript
// frontend/src/services/taskQueueService.ts
export function initializeTaskQueue() {
  if (!electronService.isElectron()) return

  // 监听任务更新事件
  window.electronAPI?.task?.onUpdate?.((event, data) => {
    const { taskId, status, progress, phase } = data

    // 更新 Zustand store
    useTaskStore.getState().updateTask(taskId, {
      status,
      progress,
      phase,
    })
  })
}
```

### 3. 性能优化
- 虚拟滚动（任务列表超过 100 条时）
- 防抖更新（进度更新间隔 > 100ms）
- 懒加载（任务详情按需加载）

---

## 🧪 测试计划

### 单元测试
- 任务状态组件渲染
- 进度计算逻辑
- 错误处理逻辑

### 集成测试
- 任务提交 → 状态更新 → 完成通知
- 批量任务提交
- 任务取消/重试

### E2E 测试
- 完整的分镜生成流程
- 队列管理操作
- 错误恢复流程

---

## 📅 时间估算

| 阶段 | 预计时间 | 优先级 |
|------|---------|--------|
| Phase 1: 任务状态 UI 组件 | 1-2 小时 | P0 |
| Phase 2: 任务队列管理界面 | 2-3 小时 | P0 |
| Phase 3: 实时状态更新 | 1-2 小时 | P0 |
| Phase 4: 工作流优化 | 2-3 小时 | P1 |
| Phase 5: 错误处理优化 | 1 小时 | P1 |

**总计**：7-11 小时

---

## 🚀 实施顺序

### 第一步：核心 UI 组件（必须）
1. TaskStatusOverlay
2. TaskProgressBar
3. TaskPhaseIndicator
4. 集成到 ShotCard

### 第二步：任务管理（必须）
1. TaskQueue 页面
2. 任务列表
3. 任务操作（取消/重试）

### 第三步：实时更新（必须）
1. useTaskStatus hook
2. useTaskList hook
3. 状态订阅机制

### 第四步：工作流优化（可选）
1. 批量生成界面
2. 队列状态面板
3. 完成通知

### 第五步：错误处理（可选）
1. 错误展示优化
2. 重试机制优化

---

## ✅ 验收标准

### 功能验收
- [ ] 用户可以看到任务实时进度
- [ ] 用户可以查看任务队列
- [ ] 用户可以取消/重试任务
- [ ] 用户可以批量生成分镜
- [ ] 用户可以收到完成通知

### 性能验收
- [ ] 任务状态更新延迟 < 500ms
- [ ] 任务列表渲染 < 100ms（100 条任务）
- [ ] 内存占用 < 50MB（1000 条任务历史）

### 用户体验验收
- [ ] 界面响应流畅
- [ ] 错误信息清晰
- [ ] 操作反馈及时
- [ ] 视觉效果美观

---

## 📝 后续优化

### 短期（1-2 周）
- 任务优先级调整
- 任务依赖关系
- 任务分组管理

### 中期（1-2 月）
- 任务统计分析
- 性能监控
- 成本统计

### 长期（3-6 月）
- 分布式队列
- 多机协作
- 云端同步

---

**计划制定时间**：2026-03-01
**预计开始时间**：用户确认后立即开始
**预计完成时间**：1-2 天（按优先级分阶段实施）
