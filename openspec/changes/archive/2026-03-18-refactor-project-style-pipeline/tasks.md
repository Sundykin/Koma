## 1. Data Model
- [x] 1.1 定义统一的全局风格目录数据模型，覆盖内置风格与全局自定义风格
- [x] 1.2 为项目定义 `styleSnapshot` 数据结构，并更新项目类型与持久化
- [x] 1.3 移除项目创建流程对自由文本 `stylePrompt` 的依赖，改为仅选择全局风格目录项

## 2. Global Style Catalog
- [x] 2.1 提供统一的风格目录读取接口，返回内置风格与全局自定义风格的合并结果
- [x] 2.2 更新项目创建与项目风格编辑 UI，使用统一目录而不是静态 `THEME_PRESETS`
- [x] 2.3 保留全局自定义风格管理能力，但不允许项目链路直接读取全局配置作为运行时风格

## 3. Project Snapshot Pipeline
- [x] 3.1 在项目选择风格时生成并保存 `styleSnapshot`
- [x] 3.2 在编辑器入口把项目 `styleSnapshot` 透传到资产、分镜、剧本相关模块
- [x] 3.3 增加统一 `resolveProjectStyleSnapshot`/等价 helper，供所有工作流读取

## 4. AI Workflow Integration
- [x] 4.1 让 ScriptWorkbench / scriptGenerator / ScriptAnalysisService / ShotAnalysisService 使用项目 `llmPromptSuffix`
- [x] 4.2 让 ShotPromptService 使用项目快照，而不是 `settings.stylePrompts`
- [x] 4.3 让 Character/Scene/Prop/Shot 的 TTI 工作流统一使用项目 `ttiStylePrefix`
- [x] 4.4 让 shotRenderWorkflow、角色预览视频、道具预览视频统一使用项目 `ttiStylePrefix`
- [x] 4.5 确保渲染阶段对已有镜头 prompt 不重复追加风格

## 5. Cleanup And Validation
- [x] 5.1 从项目生成主链路移除 `settings.stylePrompts` 读取
- [x] 5.2 更新相关 Prompt 模板变量与调用点，保证 LLM/TTI/ITV 风格字段一致
- [x] 5.3 运行 `openspec validate refactor-project-style-pipeline --strict`
- [ ] 5.4 对关键路径做手工验证：创建项目、生成剧本、解析剧本、生成提示词、文生图、图生视频
