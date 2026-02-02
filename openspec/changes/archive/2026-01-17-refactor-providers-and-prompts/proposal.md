# Proposal: refactor-providers-and-prompts

## Summary
重构 Providers 目录结构并统一 Prompt 模板使用。

## Problem
1. **ScriptAnalysisService Prompt 硬编码**：`ScriptAnalysisService.ts` 内部定义了角色/场景/道具/分镜提取的 Prompt 模板（第113-160行），与全局设置中的 `promptTemplates.ts` 模板系统完全独立，用户在设置页面编辑模板不会生效。

2. **Providers 目录结构不一致**：
   - `providers/itv/` - 有独立目录，包含多个 ITV Provider
   - `providers/tts/` - 有独立目录，包含多个 TTS Provider
   - `providers/` 根目录 - LLM 相关文件直接放在这里（GeminiProvider.ts, OpenAIProvider.ts, ComfyUIProvider.ts）
   - 没有 `providers/llm/` 和 `providers/tti/` 目录

3. **类型定义分散**：`providers/types.ts` 定义 LLM 接口，但 `providers/itv/types.ts` 和 `providers/tts/types.ts` 各自定义自己的接口，缺乏统一性。

## Solution

### Phase 1: 统一 Prompt 模板使用
- 修改 `ScriptAnalysisService.ts`，移除硬编码的 Prompt 模板
- 使用 `getPromptTemplate()` 从全局模板系统加载模板
- 使用 `fillTemplate()` 填充变量

### Phase 2: 重构 Providers 目录结构
新目录结构：
```
providers/
├── index.ts           # 统一导出和工厂函数
├── types.ts           # 基础接口定义
├── llm/
│   ├── index.ts       # LLM 工厂函数
│   ├── types.ts       # LLM 专属类型
│   ├── GeminiProvider.ts
│   └── OpenAIProvider.ts
├── tti/
│   ├── index.ts       # TTI 工厂函数
│   ├── types.ts       # TTI 专属类型
│   └── ComfyUIProvider.ts
├── itv/               # 已存在，保持
│   ├── index.ts
│   ├── types.ts
│   └── ...
└── tts/               # 已存在，保持
    ├── index.ts
    ├── types.ts
    └── ...
```

### Phase 3: 更新导入路径
- 更新所有使用 Provider 的文件的导入路径
- 保持向后兼容：根目录 index.ts 重新导出所有内容

## Scope
- `frontend/src/services/ScriptAnalysisService.ts`
- `frontend/src/providers/` 目录重构
- 相关导入更新

## Acceptance Criteria
- [ ] ScriptAnalysisService 使用全局 Prompt 模板
- [ ] 用户在设置页面修改模板后，剧本分析功能使用新模板
- [ ] Providers 目录结构统一（llm/, tti/, itv/, tts/）
- [ ] 现有功能不受影响
