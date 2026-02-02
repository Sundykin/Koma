# Change: LLM 模型管理与剧本解析集成

## Why
当前系统虽然定义了 LLM 接口和配置结构，但存在以下问题：
1. LLM 配置只支持单个模型，无法管理多个模型渠道
2. 没有真正调用 LLM 进行剧本解析
3. 解析的中间结果没有展示给用户
4. 项目无法单独选择使用的模型

## What Changes
### 模型管理 (model-providers)
- 支持多模型配置列表，增删改查
- 每个模型配置包含：名称、渠道类型、地址、API Key、模型名等
- 支持设置默认模型
- 支持 OpenAI 兼容渠道（DeepSeek、通义千问、智谱等）

### 存储变更 (storage)
- 全局设置中的 LLM 配置从单个改为数组
- 项目级别新增 llmConfigId 字段，关联使用的模型
- 新建项目时自动选择默认模型

### 剧本解析 (script-processing)
- 实现真正的 LLM 调用进行剧本解析
- 展示解析过程的中间结果（角色、场景、道具、分镜）
- 支持分步确认和手动调整

### UI 变更 (ui-components)
- 设置页面 LLM 配置改为列表+编辑模式
- 支持在列表中标记默认模型
- 项目设置中添加模型选择下拉框

## Impact
- Affected specs: model-providers, storage, script-processing, ui-components
- Affected code:
  - `frontend/src/types.ts` - 类型定义
  - `frontend/src/store/globalStore.ts` - 全局设置存储
  - `frontend/src/store/projectStore.ts` - 项目存储
  - `frontend/src/components/SettingsPage.tsx` - 设置页面
  - `frontend/src/providers/*` - Provider 实现
  - 新增剧本解析服务和 UI 组件
