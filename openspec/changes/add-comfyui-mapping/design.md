## Context
Phase 1 已建立 Provider 策略模式架构，ComfyUI Provider 为占位。本提案实现 ComfyUI 深度对接，使其成为可用的本地生成方案。

## Goals / Non-Goals

**Goals:**
- 实现 ComfyUI 工作流 JSON 解析
- 自动识别和映射可配置输入节点
- 支持本地和远程 ComfyUI 服务
- 实现 WebSocket 实时进度监控
- 工作流预设管理系统

**Non-Goals:**
- 不实现工作流可视化编辑器（使用 ComfyUI 原生）
- 不实现自定义节点开发
- 不实现 ComfyUI 服务部署

## Decisions

### 1. 节点映射策略
**Rationale:**
- ComfyUI 工作流结构多样，需要灵活映射
- 自动识别 + 手动调整兼顾易用性和灵活性

**Implementation:**
```typescript
interface NodeMapping {
  nodeId: string;       // ComfyUI 节点 ID
  nodeType: string;     // 节点类型 (KSampler, LoadImage, etc.)
  inputName: string;    // 输入参数名
  bindTo: 'image' | 'positive_prompt' | 'negative_prompt' | 'seed' | 'custom';
  customKey?: string;   // 自定义绑定键
}

interface WorkflowConfig {
  id: string;
  name: string;
  category: 'tti' | 'itv' | 'upscale' | 'other';
  workflow: object;     // 原始 ComfyUI workflow JSON
  mappings: NodeMapping[];
  defaults: Record<string, any>;  // 默认参数值
}
```

### 2. 自动识别规则
**常见节点类型映射:**
- `LoadImage` → image 输入
- `CLIPTextEncode` → positive/negative prompt（根据连接判断）
- `KSampler` / `SamplerCustom` → seed, steps, cfg, denoise
- `EmptyLatentImage` → width, height
- `SaveImage` / `PreviewImage` → 输出标识

### 3. WebSocket 通信协议
**Rationale:**
- ComfyUI 使用 WebSocket 推送执行进度
- 需要处理 status、progress、executing、executed 等消息

**Message Types:**
```typescript
type ComfyMessage =
  | { type: 'status'; data: { queue_remaining: number } }
  | { type: 'progress'; data: { value: number; max: number } }
  | { type: 'executing'; data: { node: string } }
  | { type: 'executed'; data: { node: string; output: any } };
```

### 4. 预设存储结构
```
{storageRoot}/
├── comfyui-presets/
│   ├── tti/
│   │   └── realistic-v1.json
│   ├── itv/
│   │   └── animatediff-v1.json
│   └── upscale/
│       └── 4x-ultrasharp.json
```

## Risks / Trade-offs

1. **风险**: 不同 ComfyUI 版本 API 可能不兼容
   - **缓解**: 检测 API 版本，提供兼容性警告

2. **风险**: 自定义节点可能无法自动映射
   - **缓解**: 提供手动映射界面

3. **风险**: 大型工作流解析性能
   - **缓解**: 异步解析，显示进度

## Open Questions

1. 是否需要支持 ComfyUI Manager API？
   - 当前计划：不支持，用户需自行管理节点

2. 是否支持工作流模板变量？
   - 当前计划：通过映射配置实现，不引入模板语法
