# Tasks: refactor-providers-and-prompts

## Phase 1: 统一 Prompt 模板使用
- [x] 修改 ScriptAnalysisService，移除硬编码的 SYSTEM_PROMPT_BASE、CHARACTER_EXTRACTION_PROMPT 等常量
- [x] 引入 getPromptTemplate 和 fillTemplate 函数
- [x] extractCharacters 使用 `character_extraction` 模板
- [x] extractScenes 使用 `scene_extraction` 模板
- [x] extractProps 使用 `prop_extraction` 模板
- [x] generateShots 使用 `shot_breakdown` 模板
- [x] 确保 JSON Schema 约束仍然有效（可在模板中或代码中添加）

## Phase 2: 重构 Providers 目录结构
- [x] 创建 `providers/llm/` 目录
- [x] 移动 GeminiProvider.ts 到 `providers/llm/`
- [x] 移动 OpenAIProvider.ts 到 `providers/llm/`
- [x] 创建 `providers/llm/index.ts` 导出 LLM 工厂函数
- [x] 创建 `providers/llm/types.ts` 定义 LLM 接口（包含 ChatMessage）
- [x] 创建 `providers/tti/` 目录
- [x] 移动 ComfyUIProvider.ts 到 `providers/tti/`
- [x] 创建 `providers/tti/index.ts` 导出 TTI 工厂函数
- [x] 创建 `providers/tti/types.ts` 定义 TTI 接口
- [x] 更新根目录 `providers/index.ts` 重新导出所有内容
- [x] 更新根目录 `providers/types.ts` 为基础类型定义

## Phase 3: 更新导入路径
- [x] 更新 ScriptAnalysisService.ts 的导入
- [x] 更新 entityExtractor.ts 的导入
- [x] 更新 scriptGenerator.ts 的导入
- [x] 更新 shotListGenerator.ts 的导入
- [x] 更新 shotRenderWorkflow.ts 的导入
- [x] 更新其他使用 Provider 的文件
- [x] 添加 LLMProvider.chat() 方法到接口和实现

## Phase 4: 验证
- [x] 确保 TypeScript 编译通过（Provider 相关错误已修复，剩余错误为预先存在的 ITV/TTS 类型问题）
- [x] 手动测试剧本分析功能
- [x] 验证设置页面修改 Prompt 模板后生效
