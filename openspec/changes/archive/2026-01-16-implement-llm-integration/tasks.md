## 1. 类型定义与数据结构
- [x] 1.1 在 types.ts 中添加 LLMModelConfig 接口
- [x] 1.2 更新 AppSettings 接口，llm 字段改为 llmConfigs 数组
- [x] 1.3 更新 ProjectMeta 接口，添加 llmConfigId 字段

## 2. 全局设置存储重构
- [x] 2.1 更新 globalStore 默认设置结构
- [x] 2.2 实现旧配置迁移逻辑（单个 llm → llmConfigs 数组）
- [x] 2.3 实现 LLM 配置 CRUD 方法（addLLMConfig, updateLLMConfig, deleteLLMConfig）
- [x] 2.4 实现设置默认模型方法（setDefaultLLMConfig）
- [x] 2.5 实现获取当前有效配置方法（getActiveLLMConfig）

## 3. 项目存储更新
- [x] 3.1 更新 createProject 方法，自动关联默认 LLM 配置
- [x] 3.2 添加 updateProjectLLMConfig 方法
- [x] 3.3 更新项目加载逻辑，处理 llmConfigId 为空的情况

## 4. 设置页面 UI 重构
- [x] 4.1 创建 LLMConfigList 组件（列表展示所有配置）
- [x] 4.2 创建 LLMConfigEditor 组件（新增/编辑配置表单）
- [x] 4.3 实现渠道预设选择（DeepSeek、通义千问、智谱等）
- [x] 4.4 实现列表中设置默认模型功能
- [x] 4.5 实现配置删除确认
- [x] 4.6 实现连接测试功能

## 5. 项目设置页面
- [x] 5.1 在项目设置中添加 LLM 模型选择下拉框
- [x] 5.2 显示当前选择的模型信息
- [x] 5.3 支持切换到「使用全局默认」选项

## 6. LLM Provider 更新
- [x] 6.1 更新 createLLMProvider 工厂方法支持新配置结构
- [x] 6.2 确保 OpenAI 兼容 Provider 正确处理各种 baseUrl

## 7. 剧本解析服务
- [x] 7.1 创建 ScriptAnalysisService 服务类
- [x] 7.2 实现角色提取方法（extractCharacters）
- [x] 7.3 实现场景提取方法（extractScenes）
- [x] 7.4 实现道具提取方法（extractProps）
- [x] 7.5 实现分镜生成方法（generateShots）
- [x] 7.6 定义结构化输出的 JSON Schema

## 8. 剧本解析 UI
- [x] 8.1 创建 ScriptAnalysisWizard 组件（分步向导）
- [x] 8.2 实现角色提取结果展示和编辑界面
- [x] 8.3 实现场景提取结果展示和编辑界面
- [x] 8.4 实现道具提取结果展示和编辑界面
- [x] 8.5 实现分镜列表预览和调整界面
- [x] 8.6 实现解析进度指示器
- [x] 8.7 实现单步重试和取消功能

## 9. 集成与测试
- [x] 9.1 在剧本工作室页面集成解析入口
- [x] 9.2 验证新建项目时默认模型关联
- [x] 9.3 验证项目模型切换功能
- [x] 9.4 测试各渠道 LLM 调用
- [x] 9.5 测试旧配置迁移

## 10. 文档与清理
- [x] 10.1 更新设置页面的帮助文档
- [x] 10.2 清理废弃的单模型配置相关代码
