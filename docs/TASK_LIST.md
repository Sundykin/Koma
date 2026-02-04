# Koma 可执行任务清单

> 生成日期：2026-02-04
> 基于代码分析和 UX 分析报告

---

## 概览

| 类别 | 数量 | 状态 |
|------|------|------|
| 组件总数 | 77 | 35 个有禁用状态 |
| 测试文件 | 1 | 需要增加 |
| console 语句 | 30+ | 应使用日志系统 |
| any 类型 | 20+ | 应正确类型化 |
| 硬编码值 | 4+ | 应提取为常量 |
| 错误边界 | 2 | 需要增加 |

---

## P0 - 关键 UX 问题

### Task #1: 为禁用按钮添加 Tooltip 说明
- **严重程度**: P0 | **工作量**: S
- **问题**: 禁用按钮（AI 拆分、模型配置）缺少解释
- **文件**: `components/project/ProjectOverview.tsx`
- **方案**: 使用 Tooltip 包裹禁用按钮，说明禁用原因和启用条件

### Task #2: 为破坏性操作添加确认对话框
- **严重程度**: P0 | **工作量**: M
- **问题**: 剧本导入/替换静默覆盖现有内容，剧集删除缺少确认
- **文件**: `ProjectOverview.tsx`, `EpisodeManager.tsx`, `AssetManager.tsx`
- **方案**: 使用 Modal.confirm 添加确认步骤

### Task #3: 创建新用户引导流程
- **严重程度**: P0 | **工作量**: L
- **问题**: 首次用户看到空项目列表，无任何引导
- **方案**: 创建 `WelcomeModal.tsx` 和功能介绍轮播

---

## P1 - 代码质量问题

### Task #4: 替换 console.error/warn 为正规日志系统
- **严重程度**: P1 | **工作量**: M
- **问题**: 30+ 处 console 语句分散在代码中
- **文件**: `App.tsx`, `index.tsx`, `simpleEngine.ts`, `useChatIPC.ts` 等
- **方案**: 使用现有 `errorHandler` 工具统一处理

### Task #5: 替换 any 类型为正确类型
- **严重程度**: P1 | **工作量**: M
- **问题**: 20+ 处 `err: any` 和其他宽松类型
- **文件**: `App.tsx`, chat adapters, `useChatIPC.ts`, `EpisodeSplitWizard.tsx`
- **方案**: 定义具体错误类型，使用 unknown + 类型守卫

### Task #6: 提取硬编码尺寸为配置常量
- **严重程度**: P1 | **工作量**: S
- **问题**: 硬编码 1920x1080（视频）、600x338（缩略图）
- **方案**: 创建 `config/dimensions.ts` 统一管理

### Task #7: 重构重复的错误处理模式
- **严重程度**: P1 | **工作量**: M
- **问题**: try-catch + message.error 出现 15+ 次
- **方案**: 创建 `utils/errorHandling.ts` 统一封装

---

## P2 - 性能优化

### Task #8: 为频繁重渲染的组件添加 React.memo
- **严重程度**: P2 | **工作量**: M
- **问题**: 大型组件（>700 行）不必要地重渲染
- **目标**: `ShotCard.tsx`, `CharacterDetailPanel.tsx`, `SimpleTimeline.tsx`

### Task #9: 为大型组件添加错误边界
- **严重程度**: P2 | **工作量**: M
- **问题**: 仅 App.tsx 和 PluginHost.tsx 有错误边界
- **目标**: `Storyboard.tsx` (1321行), `SimpleTimeline.tsx` (1092行)

---

## P2 - UX 增强

### Task #10: 改善错误信息为用户友好文本
- **严重程度**: P2 | **工作量**: M
- **问题**: 技术错误直接显示给用户
- **文件**: `SimpleExportDialog.tsx`, `AssetManager.tsx`, `exportRenderer.ts`
- **方案**: 错误映射表 + 建议操作

### Task #11: 为异步操作添加加载状态和骨架屏
- **严重程度**: P2 | **工作量**: M
- **问题**: 部分异步操作缺少反馈
- **目标**: `AssetGenerationWizard`, `ScriptWorkbench`, `SimpleExportDialog`

### Task #12: 在所有编辑视图添加保存状态指示器
- **严重程度**: P2 | **工作量**: M
- **问题**: `SaveStatusIndicator.tsx` 存在但未全面集成
- **文件**: `ScriptWorkbench.tsx`, `SimpleEditor.tsx`, `Storyboard.tsx`

### Task #13: 改善空状态设计，添加操作引导
- **严重程度**: P2 | **工作量**: M
- **问题**: 分镜空状态显示"暂无分镜数据"但无操作按钮
- **方案**: 创建 `EmptyStateCard.tsx` 通用组件

### Task #14: 为表单添加必填字段标识
- **严重程度**: P2 | **工作量**: S
- **问题**: 必填字段缺少红色星号标识
- **文件**: `CreateProjectModal.tsx`, `ProjectSettingsModal.tsx`, 各配置管理器

---

## P3 - 功能与文档

### Task #15: 添加键盘快捷键帮助叠加层
- **严重程度**: P3 | **工作量**: M
- **方案**: Cmd/Ctrl+? 打开帮助叠加层
- **创建**: `KeyboardShortcutsHelp.tsx`, `useKeyboardShortcuts.ts`

### Task #16: 增加关键路径测试覆盖
- **严重程度**: P3 | **工作量**: L
- **问题**: src/ 仅 1 个测试文件
- **目标**: 项目管理、剧集、剧本分析、资产生成、导出

### Task #17: 添加 localStorage 键常量和验证
- **严重程度**: P3 | **工作量**: S
- **问题**: 硬编码键名分散在代码中
- **方案**: 创建 `constants/storageKeys.ts`

---

## 建议执行顺序

### 第 1 周 (快速见效)
- [x] Task #1: 禁用按钮 Tooltip
- [ ] Task #6: 提取硬编码尺寸
- [ ] Task #14: 表单必填标识
- [ ] Task #17: localStorage 常量

### 第 2 周 (核心质量)
- [ ] Task #4: 日志系统
- [ ] Task #5: 类型修复
- [ ] Task #7: 错误处理重构

### 第 3 周 (UX 改善)
- [ ] Task #10: 错误信息优化
- [ ] Task #11: 加载状态
- [ ] Task #12: 保存状态指示器
- [ ] Task #13: 空状态设计

### 第 4 周 (性能与功能)
- [ ] Task #2: 确认对话框
- [ ] Task #3: 新用户引导
- [ ] Task #8: React.memo 优化
- [ ] Task #9: 错误边界
- [ ] Task #15: 快捷键帮助

### 第 5 周 (测试)
- [ ] Task #16: 测试覆盖

---

## 快速开始

从 Task #1 开始（工作量小，影响大）：

```tsx
// ProjectOverview.tsx - 示例修复
<Tooltip title="请先输入剧本内容">
  <Button disabled={!scriptText}>AI 拆分</Button>
</Tooltip>
```
