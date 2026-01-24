# Tasks: Koma Studio 改进任务清单

## Phase 1: 基础加固

### 1.1 完善项目文档
- [ ] 更新 `openspec/project.md`，填写技术栈、架构模式、代码规范
- [ ] 更新 `README.md`，添加项目介绍、安装步骤、开发指南
- [ ] 添加架构图（可选）

### 1.2 添加全局错误边界
- [ ] 创建 `ErrorBoundary` 组件
- [ ] 在 `App.tsx` 中包裹根组件
- [ ] 添加友好的错误提示 UI

### 1.3 引入测试框架
- [ ] 安装 Vitest + React Testing Library
- [ ] 配置 `vitest.config.ts`
- [ ] 为核心服务编写示例测试

### 1.4 Store 模块拆分
- [ ] 将 `globalStore.ts` 拆分为 `uiStore`、`settingsStore`
- [ ] 将 `projectStore.ts` 拆分为 `episodeStore`、`assetStore`
- [ ] 保持 API 兼容性

---

## Phase 2: 体验优化

### 2.1 撤销/重做系统
- [ ] 设计 Command 模式架构
- [ ] 实现 `useHistory` hook
- [ ] 集成到编辑器操作

### 2.2 快捷键系统
- [ ] 创建 `useHotkeys` hook
- [ ] 定义常用快捷键映射
- [ ] 添加快捷键提示 UI

### 2.3 离线缓存
- [ ] 设计缓存策略
- [ ] 实现 API 响应缓存
- [ ] 添加离线状态提示

---

## Phase 3: 功能扩展

### 3.1 多语言支持
- [ ] 引入 i18n 库
- [ ] 提取硬编码文本
- [ ] 添加语言切换 UI

### 3.2 协作功能
- [ ] 设计协作架构
- [ ] 实现实时同步
- [ ] 添加协作者管理

---

## 验证标准

- 文档：新人能在 30 分钟内完成环境搭建
- 测试：核心服务测试覆盖率 > 60%
- 体验：关键操作支持撤销
