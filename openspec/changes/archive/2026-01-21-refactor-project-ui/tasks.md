## 1. ProjectList 界面优化

- [x] 1.1 移除项目卡片封面图，改为简洁卡片样式
- [x] 1.2 重构头部区域：压缩标题和副标题空间
- [x] 1.3 将搜索和筛选器整合为更紧凑的布局
- [x] 1.4 新建按钮改为简洁样式，放到头部右侧（无项目时隐藏）
- [x] 1.5 实现空列表状态：横贯的创建项目按钮
- [x] 1.6 优化项目卡片列表布局

## 2. App.tsx 拆分

- [x] 2.1 提取 Sidebar 组件到 `components/common/Sidebar.tsx`
- [x] 2.2 提取 Header 组件到 `components/common/Header.tsx`
- [x] 2.3 提取 EditorView 组件到 `components/editor/EditorView.tsx`
- [x] 2.4 提取常量和工具函数到 `constants/appConstants.ts`
- [x] 2.5 更新 App.tsx 使用拆分后的组件 (900行 → 340行)

## 3. Components 目录重组

- [x] 3.1 创建模块目录结构（common, project, asset, storyboard, settings）
- [x] 3.2 移动公共组件到 `common/`
- [x] 3.3 移动项目相关组件到 `project/`
- [x] 3.4 移动资产相关组件到 `asset/`
- [x] 3.5 移动分镜相关组件到 `storyboard/`
- [x] 3.6 移动设置相关组件到 `settings/`
- [x] 3.7 为每个模块创建 `index.ts` 导出文件
- [x] 3.8 更新所有 import 路径

## 4. 验证

- [x] 4.1 确保应用正常编译无报错
- [x] 4.2 验证所有功能正常工作
