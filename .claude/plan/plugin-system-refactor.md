# 动态插件系统与配置重构实施计划

> 基于多模型协作规划（Codex + Gemini + Claude）
> 方案 B: 配置服务集中化 + 动态插件系统
> **状态：Phase 1-4 完成，Phase 5-6 待实施**

---

## 需求总览

1. ✅ **移除历史兼容代码** - 完全删除 normalize* 函数及迁移逻辑
2. ⏳ **LLM 渠道简化** - 仅保留 3 种类型：openai-compatible, gemini, claude
3. ✅ **动态插件系统** - 支持界面导入、热加载、全局插件（独立菜单+页面）
4. ⏳ **提示词模板系统** - 全局 Registry + 覆盖机制
5. ⏳ **全局设置优化** - Settings Portal 侧边栏布局

---

## 📋 实施顺序与状态

### Phase 1: 基础架构 ✅ 完成
1. ✅ **P1.1** 清理历史兼容代码 - `entities.ts` normalize* 函数已删除
2. ✅ **P1.2** 定义插件类型 - `types/plugin.ts` 已创建
3. ✅ **P1.3** 实现 pluginStore - `store/pluginStore.ts` 已创建

### Phase 2: 加载机制 ✅ 完成
4. ✅ **P2.1** 实现 PluginLoader - `services/plugin/PluginLoader.ts`
5. ✅ **P2.2** 实现 PluginSandbox - `services/plugin/PluginSandbox.ts`
6. ✅ **P2.3** 实现 PluginAPI - `services/plugin/PluginAPI.ts`

### Phase 3: 前端 UI ✅ 完成
7. ✅ **P3.1** 实现 PluginManager 页面
8. ✅ **P3.2** 实现 PluginImporter（拖拽导入）
9. ✅ **P3.3** 实现 PluginHost 容器
10. ✅ **P3.4** 修改 Sidebar 动态菜单
11. ✅ **P3.5** 修改 App.tsx 路由

### Phase 4: Electron 集成 ✅ 完成
12. ✅ **P4.1** 实现 plugin service - `electron/src/service/plugin.ts`
13. ✅ **P4.2** 实现 plugin controller - `electron/src/controller/plugin.ts`
14. ✅ **P4.3** 修改 main.ts 注册 IPC
15. ✅ **P4.4** 修改 preload.ts 暴露 API

### Phase 5: 设置系统重构 ⏳ 待实施
16. ⏳ **P5.1** Settings Portal 布局
17. ⏳ **P5.2** LLM Protocol+Preset 表单
18. ⏳ **P5.3** PromptStudio 编辑器

### Phase 6: 测试与文档 ⏳ 待实施
19. ⏳ **P6.1** 编写示例插件
20. ⏳ **P6.2** 插件开发文档
21. ⏳ **P6.3** 集成测试

---

## 📁 已完成的文件清单

### 新增文件

**类型定义**
- ✅ `frontend/src/types/plugin.ts`

**Store**
- ✅ `frontend/src/store/pluginStore.ts`

**服务**
- ✅ `frontend/src/services/plugin/PluginLoader.ts`
- ✅ `frontend/src/services/plugin/PluginSandbox.ts`
- ✅ `frontend/src/services/plugin/PluginAPI.ts`
- ✅ `frontend/src/services/plugin/index.ts`

**组件**
- ✅ `frontend/src/components/plugins/PluginHost.tsx`
- ✅ `frontend/src/components/plugins/PluginManager.tsx`
- ✅ `frontend/src/components/plugins/PluginCard.tsx`
- ✅ `frontend/src/components/plugins/PluginImporter.tsx`
- ✅ `frontend/src/components/plugins/PluginPermissions.tsx`
- ✅ `frontend/src/components/plugins/index.ts`

**Electron**
- ✅ `electron/src/service/plugin.ts`
- ✅ `electron/src/controller/plugin.ts`

### 修改文件

- ✅ `frontend/src/components/common/Sidebar.tsx` - 动态菜单 + AppView 类型
- ✅ `frontend/src/App.tsx` - 路由支持 `plugin:*` 和 `plugins`
- ✅ `frontend/src/store/project/entities.ts` - 移除 normalize* 函数
- ✅ `electron/src/main.ts` - 注册插件 IPC
- ✅ `electron/src/preload/index.ts` - 暴露 plugin API
- ✅ `electron/src/controller/index.ts` - 导出 pluginController
- ✅ `electron/src/service/index.ts` - 导出 pluginService

---

## 🔌 动态插件系统架构

### 插件分类

| 类型 | 说明 | 加载方式 | UI 入口 |
|------|------|----------|---------|
| `provider` | TTI/ITV/TTS 服务提供者 | worker_thread | 设置页配置 |
| `global` | 全局功能插件，独立页面 | Runtime Injection | 左侧主菜单 |
| `tool` | 后台任务、批处理 | worker_thread | 工具菜单 |

### 核心设计：Runtime Injection

为确保插件与主应用风格一致（Ant Design / Tailwind），采用 **Runtime Injection** 而非 iframe：

- **Host (App)**: 暴露核心库 (`React`, `Antd`, `PluginAPI`) 到全局
- **Plugin**: 打包为 UMD/IIFE，从 Host 获取依赖，导出 React 组件

---

## 📦 插件目录结构

```
my-plugin/
├── manifest.json          # 插件元数据（必须）
├── package.json           # 依赖声明
├── dist/
│   ├── main.js            # 后端入口（provider/tool）
│   └── ui/
│       └── main.js        # 前端 bundle
├── data/                  # 沙箱数据目录（自动创建）
├── assets/
│   └── icon.svg
└── README.md
```

### manifest.json 规范

```json
{
  "id": "com.example.my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "插件描述",
  "author": { "name": "Author", "url": "https://example.com" },

  "category": "global",
  "engine": {
    "minAppVersion": "2.5.0",
    "sdkVersion": "1.0.0"
  },

  "scopes": [
    "settings:read",
    "settings:write",
    "projects:read",
    "projects:write",
    "prompts:override",
    "storage:limited",
    "network:external"
  ],

  "entry": {
    "backend": "./dist/main.js",
    "frontend": "./dist/ui/main.js"
  },

  "globalMeta": {
    "entryRoute": "/plugins/com.example.my-plugin",
    "navigation": {
      "icon": "mdi:tools",
      "label": "我的插件",
      "order": 50
    }
  }
}
```

---

## 🔐 权限系统（Scopes）

| Scope | 说明 | 风险级别 |
|-------|------|----------|
| `settings:read` | 读取全局设置 | 安全 |
| `settings:write` | 修改全局设置 | 警告 |
| `projects:read` | 读取项目数据 | 安全 |
| `projects:write` | 修改项目数据 | 警告 |
| `prompts:override` | 覆盖提示词模板 | 警告 |
| `storage:limited` | 访问插件沙箱目录 | 安全 |
| `network:external` | 访问外部网络 | 危险 |

- 导入插件时展示权限列表，用户确认后授权
- 敏感操作（write/network:external）需二次确认

---

## 🔄 动态加载流程

```
用户拖拽 zip 文件 / 选择文件夹
       ↓
PluginImporter 接收文件
       ↓
IPC: plugin:validate → 主进程
       ↓
解压到 plugins-staging/（临时）
       ↓
校验 manifest.json
       ↓
展示权限确认弹窗
       ↓ (用户确认)
IPC: plugin:install → 主进程
       ↓
复制到 plugins-runtime/<id>/
       ↓
注册到 pluginStore
       ↓
Sidebar 更新菜单
```

---

## Session IDs

- **Codex**: `019beda4-e967-7412-80d5-29b66e982a5d`
- **Gemini**: `8b770a36-ece8-4723-8917-466022c23854`

---

## ✅ 构建验证

最终构建于 2026-01-24 通过，无类型错误。
