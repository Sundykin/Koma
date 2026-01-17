## Context
当前 Koma 项目的 LLM 功能处于「定义了但没用上」的状态。用户配置 API Key 后实际上无法使用 AI 剧本解析功能。此变更将完成 LLM 集成的完整闭环。

### 约束
- 保持与现有 Provider 架构兼容
- 支持多种 OpenAI 兼容的国产大模型
- API Key 需加密存储

## Goals / Non-Goals
### Goals
- 用户能够管理多个 LLM 配置（不同渠道、不同模型）
- 用户能够为不同项目选择不同模型
- 用户能够真正使用 LLM 解析剧本并看到中间结果
- 设置页面直观显示已配置的模型数量

### Non-Goals
- 不实现模型微调或自定义训练
- 不实现流式输出（可作为后续优化）
- 不实现多模型并行对比

## Decisions

### 1. 模型配置数据结构
```typescript
interface LLMModelConfig {
  id: string;                    // 唯一标识
  name: string;                  // 用户自定义名称，如 "DeepSeek Chat"
  provider: 'openai' | 'gemini' | 'openai-compatible';
  baseUrl?: string;              // API 地址，openai-compatible 必填
  apiKey: string;                // 加密存储
  modelName: string;             // 模型名称，如 gpt-4o, deepseek-chat
  isDefault: boolean;            // 是否为默认模型
  createdAt: number;
  updatedAt: number;
}
```

**决策理由**：
- `openai-compatible` 统一处理国产大模型（DeepSeek、通义、智谱等都兼容 OpenAI API）
- 独立 `id` 便于项目引用，不依赖名称
- `isDefault` 直接存储在配置中，方便快速查找

### 2. 全局设置结构变更
```typescript
// 旧结构
llm: ModelConfig;

// 新结构
llmConfigs: LLMModelConfig[];
defaultLLMConfigId: string | null;
```

**迁移策略**：首次加载时检测旧结构，自动迁移为新结构的第一个配置项。

### 3. 项目级模型关联
```typescript
interface ProjectMeta {
  // ... existing fields
  llmConfigId?: string;  // 关联的 LLM 配置 ID，null 表示使用默认
}
```

**决策理由**：
- 可选字段，向后兼容
- null/undefined 表示使用全局默认模型
- 项目可随时切换，不影响其他项目

### 4. 剧本解析流程
```
输入剧本 → 解析启动 → LLM 调用 → 中间结果展示 → 用户确认/调整 → 生成分镜
```

**中间结果展示**：
- 阶段1: 角色提取结果（可编辑角色名、描述）
- 阶段2: 场景提取结果（可编辑场景描述）
- 阶段3: 道具提取结果
- 阶段4: 分镜列表预览（可调整顺序、删除、合并）

**决策理由**：
- 分步展示让用户有掌控感
- 可手动调整避免 LLM 误差累积
- 每步可单独重试

### 5. OpenAI 兼容渠道预设
提供常用国产大模型的预设配置：
- DeepSeek: `https://api.deepseek.com/v1`
- 通义千问: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- 智谱 AI: `https://open.bigmodel.cn/api/paas/v4`
- 月之暗面: `https://api.moonshot.cn/v1`

用户选择预设后自动填充 baseUrl，只需填写 API Key 和选择模型。

## Risks / Trade-offs

### Risk: 旧配置迁移失败
- **缓解**: 迁移前备份原配置，失败时提示用户手动配置

### Risk: LLM 解析结果不稳定
- **缓解**: 结构化输出 + JSON Schema 约束 + 用户确认环节

### Trade-off: 不支持流式输出
- 当前实现使用完整响应，用户体验略差但实现简单
- 后续可增加流式输出作为增强

## Migration Plan

1. **Phase 1**: 更新类型定义，添加新字段
2. **Phase 2**: 实现配置迁移逻辑
3. **Phase 3**: 实现模型列表 CRUD UI
4. **Phase 4**: 实现项目级模型选择
5. **Phase 5**: 实现剧本解析服务和中间结果展示

**回滚**: 保留旧字段结构，新旧可共存

## Open Questions
- 是否需要支持模型配置的导入/导出？（建议后续支持）
- 是否需要记录 LLM 调用历史和 token 消耗？（建议后续支持）
