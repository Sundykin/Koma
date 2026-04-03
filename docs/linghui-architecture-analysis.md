# 灵绘架构分析、问题诊断与演化方向

> 分析基于 2026-04-03 代码快照，分支 `linghui`

---

## 一、架构全景

灵绘是一个基于 **节点图（Node Graph）** 的 AI 多媒体生成工作流系统。用户通过可视化画布连接不同类型的节点，构建从文本→图片→视频→音频的复杂生成管线。

### 1.1 分层架构

```
┌───────────────────────────────────────────────────────┐
│  UI 层 (React)                                        │
│  LinghuiPage → LinghuiCanvas (18+ hooks)              │
│  + 5 种 NodeEditor + Toolbar + PropertiesPanel        │
├───────────────────────────────────────────────────────┤
│  画布抽象层 (React Flow)                               │
│  linghuiCanvasShared  ·  linghuiNodeDefs              │
│  linghuiCanvasTypes   ·  linghuiImageCollections      │
├───────────────────────────────────────────────────────┤
│  执行编排层                                            │
│  linghuiExecutionWorkflow (拓扑排序 + 依赖追踪)        │
│  linghuiExecutionShared   (ExecutionNodeView 抽象)     │
├───────────────────────────────────────────────────────┤
│  节点执行层                                            │
│  linghuiExecutionNodeExecutors (5 种节点执行器)        │
│  linghuiPromptReferences (提示词引用编译)              │
│  videoCapabilityUtils    (视频能力路由)                │
├───────────────────────────────────────────────────────┤
│  Provider 集成层                                       │
│  linghuiExecutionProviders                            │
│  → getProjectTTIProvider / getProjectITVProvider       │
│  → getProjectTTSProvider / getProjectLLMProvider       │
│  → resolveAsyncProviderResult (异步轮询)               │
├───────────────────────────────────────────────────────┤
│  基础设施层                                            │
│  mediaRemoteUrlService (资产传输)                      │
│  imageHostingService   (图床上传)                      │
│  linghuiStorage        (工作区持久化)                  │
│  electronService       (文件系统 / IPC)                │
└───────────────────────────────────────────────────────┘
```

### 1.2 核心数据流

```
用户操作画布 → 节点/边快照 → executeLinghuiWorkflow()
  → 拓扑排序 → 按序执行每个节点
    → ExecutionNodeView 解析输入槽位
    → 节点执行器调用对应 Provider
    → Provider 发起 API 请求（同步/异步轮询）
    → 结果写入 nodeOutputs → 下游节点消费
  → 执行完成 → 保存 workspace 快照
```

### 1.3 节点类型矩阵

| 节点类型 | 输入槽位 | 输出槽位 | 模式 | 依赖 Provider |
|----------|---------|---------|------|-------------|
| `linghui/text` | 参考(image), 文本(text) | text | manual / generate | LLM |
| `linghui/image` | 参考(image), 文本(text) | image | import / generate | TTI |
| `linghui/video` | 参考(image), 文本(text), 音频(audio), 视频(video) | video | upload / generate | ITV |
| `linghui/audio` | 参考(image), 文本(text), 音频(audio) | audio | upload / tts | TTS |
| `linghui/script` | 参考(image), 文本(text) | storyboard | manual / generate | LLM |

---

## 二、设计亮点

### 2.1 执行引擎的纯函数设计

`executeLinghuiWorkflow` 是无副作用的纯函数：接收 `LinghuiExecutionContext`，返回 `ExecuteLinghuiWorkflowResult`。状态变更通过回调（`onNodeStateChange`, `onQueueChange`, `onLog`）通知外部，引擎本身不持有可变状态。这使得：
- 测试非常简单（构造输入 → 断言输出）
- 支持取消恢复（中断后可重放）
- 支持增量执行（`previousRuns` + `seedPreviousOutputs`）

### 2.2 ExecutionNodeView 抽象层

在执行引擎和节点执行器之间引入了 `ExecutionNodeView` 接口，将图的边关系解析（"我的第 0 个输入槽位连的是谁的结果"）封装为简洁的查询 API：

```typescript
interface ExecutionNodeView {
  getAllInputResults(slot: number): LinghuiNodeResult[]
  getAllInputImages(): LinghuiNodeResult[]
  getInputResult(slot: number): LinghuiNodeResult | undefined
  getPromptReferences(): LinghuiPromptReferenceItem[]
}
```

这让节点执行器完全不需要了解图结构，只关注自身逻辑。

### 2.3 能力驱动的视频生成

视频节点通过 `VideoGenerationCapability` 枚举驱动 UI 和执行逻辑的切换：
- `video.text-to-video` → 纯文本，无需图片输入
- `video.image-to-video` → 主图 + 可选附加参考
- `video.reference-to-video` → 多参考图集合
- `video.start-end-to-video` → 首尾帧过渡

每种能力自动解析输入源的角色（primary / reference / start / end），Provider 层按能力路由请求。

### 2.4 提示词引用系统

`@ref_<id>` 语法允许用户在提示词中引用上游节点的输出，编译时替换为实际值。支持多种替换策略（`readable-name` / `image-index`），适配不同 Provider 的协议要求。

### 2.5 静态结果解析（resolveStaticNodeResult）

导入模式的节点（图片导入、视频上传、手动文本）不需要执行就能产出结果。`resolveStaticNodeResult` 在执行前将这些节点的属性直接解析为 `LinghuiNodeResult`，下游节点可以立即消费。这使得 `resolveTargetsOnly: true` 模式下，只执行选中节点而无需重跑整棵上游树。

---

## 三、节点能力详析与 Bug 诊断

### 3.0 概述

本节逐一分析 5 种节点类型的完整能力、执行逻辑，以及代码级别发现的 Bug 和设计缺陷。

---

### 3.1 文本节点 (`linghui/text`)

**文件**: `linghuiExecutionNodeExecutors.ts:49-109`

#### 能力清单

| 能力 | 说明 |
|------|------|
| 手动文本 | `mode: 'manual'`，直接返回 `content` 字段 |
| LLM 生成 | `mode: 'generate'`，调用 `generateTextWithProvider` |
| 上游文本合并 | 从 slot 1/2/3 收集文本片段，拼接到 prompt 前面 |
| 提示词引用 | 支持 `@ref_xxx` 语法引用上游节点输出 |
| System Prompt | 支持自定义系统提示词 |
| LLM 选择 | 通过 `llmSelection` 指定使用哪个 LLM 渠道 |

#### 输入槽位定义 (`linghuiNodeDefs.ts:88-93`)

| 槽位 | 名称 | 类型 | 执行器实际用途 |
|------|------|------|---------------|
| 0 | 图片参考 | image | **未使用** |
| 1 | 文本输入 | text | 收集文本片段 |
| 2 | 视频参考 | video | 收集文本片段（仅 `.text` 字段） |
| 3 | 音频参考 | audio | 收集文本片段（仅 `.text` 字段） |

#### Bug 与问题

**BUG-T1: 手动模式静默丢弃上游输入**

`mode === 'manual'` 时直接返回 `content`，完全忽略所有连接的上游节点。用户如果在手动模式下连接了上游，会困惑于"为什么连接了但没有效果"。

```typescript
// linghuiExecutionNodeExecutors.ts:62-71
if (mode === 'manual') {
  const normalizedContent = String(content).trim();
  if (!normalizedContent) {
    throw new Error('请先输入文本内容');
  }
  return { kind: 'text', text: normalizedContent, metadata: { mode: 'manual' } };
  // ← 上游输入被完全忽略
}
```

**BUG-T2: 图片参考槽位（slot 0）声明了但永远不被读取**

节点定义声明了 `图片参考(image)` 输入槽位，但 `executeTextNode` 从未调用 `getAllInputResults(0)` 或 `getAllInputImages()`。用户可以连接图片到文本节点，但图片数据永远不会被消费。

**BUG-T3: LLM 生成无流式支持**

`generateTextWithProvider` 是一次性返回全部文本，没有 streaming。对于长文本生成（如完整剧本），用户需要等待数十秒无任何中间反馈。`onProgress` 回调完全缺失。

---

### 3.2 图片节点 (`linghui/image`)

**文件**: `linghuiExecutionNodeExecutors.ts:111-258`

#### 能力清单

| 能力 | 说明 |
|------|------|
| 图片导入 | `mode: 'import'`，支持多图（最多 4 张） |
| 文生图 | `mode: 'generate'`，调用 TTI Provider |
| 多角度生图 | `multiAngle.enabled`，需要上游图片参考 |
| 批量生成 | `batchCount: 1-4`，并行生成多张图片 |
| 宫格模式 | `gridType: '2x2'/'3x3'/'4x4'/'5x5'`，模型生成单张宫格图 |
| 宫格拆分 | grid-split 工具将宫格图切割为多个独立图片节点 |
| 提示词引用 | 支持 `@ref_xxx` |
| 参考图消费 | 从 slot 0 收集上游图片作为参考 |
| 主图选择 | 多图导入时支持选择 `primaryAssetId` |

#### 输入槽位定义

| 槽位 | 名称 | 类型 | 执行器实际用途 |
|------|------|------|---------------|
| 0 | 参考 | image | 收集参考图源（`collectReferenceSources`） |
| 1 | 文本 | text | 收集文本片段合并到 prompt |

#### Bug 与问题

**BUG-I1: 多角度模式的静默回退**（严重程度：高）

当用户明确启用了 `multiAngle.enabled = true`，但没有连接上游图片时：
- 如果 prompt 非空 → **静默回退到普通文生图**，不报错，只记 warn 日志
- 如果 prompt 为空 → 抛出错误 "多角度生图需要先连接一张上游图片"

```typescript
// linghuiExecutionNodeExecutors.ts:167-184
if (multiAngleConfig) {
  if (!referenceSources.length) {
    if (!explicitPrompt.trim()) {
      throw new Error('多角度生图需要先连接一张上游图片');
    }
    // ← 有 prompt 时静默回退到普通文生图，用户完全不知道多角度没生效
    imageExecutionLogger.warn('灵绘图片节点多角度缺少上游图片，回退到普通文生图', ...);
  }
}
```

用户的预期是"生成多角度图片"，实际得到了一张普通文生图，且 UI 没有任何提示。

**~~BUG-I2~~: 宫格模式 (gridType) — 非 Bug**

~~原分析认为 `gridType` 在执行层无效。~~ 实际上宫格模式的设计意图是让模型生成**一张完整的宫格图**（如 2x2 四格合一的单图），而非生成多张独立图片。生成完成后，用户可通过 `grid-split` 工具将宫格图拆分为多个独立图片节点（见 `useLinghuiCanvasOverlayProps.ts` 中的 grid-split 逻辑）。`gridTypeToCount()` 用于拆分工具计算切割数量，不用于控制生成数量。此设计正确。

**BUG-I3: 多角度提示词丢失用户输入**

多角度模式下，`generateImageWithProvider` 的 `prompt` 参数被硬编码为 `''`（空字符串），用户在 prompt 字段中填写的内容被完全忽略：

```typescript
// linghuiExecutionNodeExecutors.ts:186-188
const image = await generateImageWithProvider({
  prompt: '',  // ← 用户的 prompt 完全被丢弃
  referenceSources,
  ...
  multiAngle: multiAngleConfig,
});
```

在 `generateImageWithProvider` 内部（line 275-279），`compiledPrompt` 被替换为角度描述词（如 `<sks> front-right quarter view`），用户的自定义描述无法参与生成。

**BUG-I4: 批量生成无并发控制**

`batchCount > 1` 时使用 `Promise.all` 同时发起所有请求：

```typescript
// linghuiExecutionNodeExecutors.ts:213-230
const items = await Promise.all(
  Array.from({ length: count }, (_, i) => i).map(async index => {
    const image = await generateImageWithProvider({ ... });
    return { ...image, label };
  }),
);
```

如果 TTI Provider 有 rate limit（如每秒 1 请求），4 个并发请求会导致 3 个被限流失败。

**BUG-I5: `silentReferenceSources` 死代码**

`silentReferenceSources` 在 `executeImageNode` 中初始化为空数组，且从未被填充：

```typescript
const silentReferenceSources: string[] = [];  // ← 永远为空
```

但在 `generateImageWithProvider` 中被当作有效参数处理和合并到 references 中。

---

### 3.3 视频节点 (`linghui/video`)

**文件**: `linghuiExecutionNodeExecutors.ts:333-411`

#### 能力清单

| 能力 | 说明 |
|------|------|
| 视频上传 | `source` 非空时直接返回 |
| 文生视频 | `video.text-to-video`，纯提示词 |
| 图生视频 | `video.image-to-video`，主图 + 可选附加参考 |
| 参考生视频 | `video.reference-to-video`，多参考图集合 |
| 首尾帧视频 | `video.start-end-to-video`，首帧→尾帧过渡 |
| 上游文本合并 | 从 slot 1/2 收集文本 |
| 视频参考消费 | 从 slot 3 收集上游视频的封面作为参考图 |
| 提示词引用 | 支持 `@ref_xxx` |
| 能力校验 | 执行前检查 Provider 是否支持选定能力 |
| 持续时间/宽高比/分辨率 | 作为参数传给 Provider |

#### 输入槽位定义

| 槽位 | 名称 | 类型 | 执行器实际用途 |
|------|------|------|---------------|
| 0 | 参考 | image | 收集图片参考源 |
| 1 | 文本 | text | 收集文本片段（与 slot 2 合并） |
| 2 | 音频 | audio | 收集文本片段（仅 `.text`）+ 记录 `audioSource` 到 metadata |
| 3 | 视频 | video | 收集上游视频的 posterSource 作为参考图 |

#### Bug 与问题

**BUG-V1: 音频输入被声明但从未传递给 Provider**（严重程度：高）

视频节点的第 3 个槽位（slot 2）是"音频"输入。执行器确实读取了音频结果，但**仅将 `audioSource` 记录到 metadata 中**，从未传递给 `generateVideoWithProvider`：

```typescript
// linghuiExecutionNodeExecutors.ts:398-407
return {
  kind: 'video',
  primary: video,
  metadata: {
    audioSource: node.getInputResult(2)?.primary?.source,  // ← 只记录到 metadata
    // ← 但没有传给 generateVideoWithProvider
  },
};
```

`generateVideoWithProvider` 的参数接口中也没有 `audioSource` 字段。用户连接音频到视频节点后，音频数据被完全忽略，但 UI 上连接线看起来是有效的。

**BUG-V2: 首尾帧去重可能导致只剩一帧**

`resolveVideoCapabilitySources` 对 `visualSources` 做了去重：

```typescript
// videoCapabilityUtils.ts:130-131
const normalized = Array.from(new Set(
  visualSources.map(source => String(source || '').trim()).filter(Boolean),
));
```

如果用户用**同一张图片**同时作为首帧和尾帧（如希望做"回到原点"的循环效果），去重后只剩一个 source，`endFrameSource` 变成 `undefined`，触发 "首尾帧视频需要同时提供首帧和尾帧" 错误。

**BUG-V3: duration/aspectRatio/resolution 无 Provider 兼容性校验**

参数直接传给 Provider，没有检查 Provider 是否支持：
- 某些 Provider 只支持 5s / 10s 两种时长
- 某些 Provider 不支持 9:16 竖屏
- 某些 Provider 固定 720p

用户设置了不支持的参数后，错误来自 Provider 内部，信息不明确。

**BUG-V4: 上游文本合并时音频 slot 的 text 来源不直觉**

slot 2 是音频输入，但 `collectTextSnippets` 会提取音频结果的 `.text` 字段（通常是 TTS 的原始文本）。这意味着连接 TTS 节点到视频后，TTS 的朗读文本会被自动拼接到视频的提示词中——这可能不是用户期望的行为。

---

### 3.4 音频节点 (`linghui/audio`)

**文件**: `linghuiExecutionNodeExecutors.ts:413-486`

#### 能力清单

| 能力 | 说明 |
|------|------|
| 音频上传 | `source` 非空时直接返回 |
| TTS 生成 | 调用 `generateAudioWithProvider` |
| 上游文本消费 | 从 slot 1/2/3 收集文本作为 TTS 输入 |
| 提示词引用 | 支持 `@ref_xxx` |
| 自动 voice 选择 | 使用 Provider 默认 voice 或第一个可用 voice |

#### 输入槽位定义

| 槽位 | 名称 | 类型 | 执行器实际用途 |
|------|------|------|---------------|
| 0 | 图片参考 | image | **未使用** |
| 1 | 文本输入 | text | 收集文本片段 |
| 2 | 视频参考 | video | 收集文本片段（仅 `.text`） |
| 3 | 音频参考 | audio | 收集文本片段（仅 `.text`） |

#### Bug 与问题

**BUG-A1: 图片和音频参考槽位声明但永远不被消费**（严重程度：中）

slot 0（图片参考）和 slot 3（音频参考）的数据在执行器中从未被读取。图片连接完全无效。音频参考连接也无效——只会提取其 `.text` 字段，原始音频数据被丢弃。用户不会收到任何"此连接无效果"的反馈。

**BUG-A2: 缺少 voice 选择 UI**（严重程度：中）

`LinghuiAudioNodeProperties` 只有 `ttsSelection`（选择 TTS 渠道），没有 `voiceId` 字段。voice 选择完全由 Provider 默认值决定：

```typescript
// linghuiExecutionProviders.ts:643-650
async function resolveTTSVoiceId(provider): Promise<string> {
  if (provider.config?.defaultVoice) {
    return provider.config.defaultVoice;
  }
  const voices = await provider.listVoices();
  return voices[0]?.id || 'default';  // ← 用户无法选择
}
```

对于支持多种声色的 TTS 服务，用户只能得到默认声音。

**BUG-A3: `onProgress` 在即时模式下从未被调用**

当 TTS Provider 返回 `mode: 'immediate'` 时，进度从 0 直接跳到完成，`onProgress` 回调不会被触发。UI 的进度条没有过渡。

**BUG-A4: 上传模式下 `prompt` 作为 `text` 字段泄露**

上传音频时，`prompt` 字段的值被作为 `result.text` 返回：

```typescript
// linghuiExecutionNodeExecutors.ts:422-429
return {
  kind: 'audio',
  primary: buildMediaItem({ kind: 'audio', source: normalizedSource }),
  text: normalizedPrompt || undefined,  // ← prompt 被当做 text 输出
};
```

如果下游节点通过 `collectTextSnippets` 消费这个结果，会把"TTS 提示词"当做正式文本内容。

---

### 3.5 脚本节点 (`linghui/script`)

**文件**: `linghuiExecutionNodeExecutors.ts:260-331`

#### 能力清单

| 能力 | 说明 |
|------|------|
| 手动脚本 | `mode: 'manual'`，解析用户输入的 JSON/纯文本 |
| LLM 生成脚本 | `mode: 'generate'`，调用 LLM 后解析结果 |
| JSON 解析 | 支持 `{"shots":[...]}` 格式和 ```json 代码块 |
| 纯文本解析 | 支持"镜头 1: 描述"格式和管道分隔格式 |
| 两种视图 | `viewMode: 'cards' / 'table'` |
| 上游文本合并 | 从 slot 1/2 收集文本 |
| 提示词引用 | 支持 `@ref_xxx` |
| 默认 System Prompt | JSON 格式的脚本生成指令 |
| 双输出 | output-0 (text), output-1 (storyboard) |

#### 输入槽位定义

| 槽位 | 名称 | 类型 | 执行器实际用途 |
|------|------|------|---------------|
| 0 | 图片参考 | image | **未使用** |
| 1 | 文本设定 | text | 收集文本片段 |
| 2 | 视频参考 | video | 收集文本片段（仅 `.text`） |

#### Bug 与问题

**BUG-S1: 用户自定义 System Prompt 丢失 JSON 格式约束**（严重程度：高）

默认 System Prompt 强制 LLM 输出 JSON 格式：

```typescript
const DEFAULT_SCRIPT_SYSTEM_PROMPT = [
  '你是灵绘的分镜脚本助手。',
  '请只输出 JSON，不要附加解释。',
  '输出格式必须是 {"shots":[...]}。',
  '至少生成 3 个镜头...',
].join('\n');
```

但当用户提供了自己的 `systemPrompt` 时，**默认值被完全替换**：

```typescript
// linghuiExecutionNodeExecutors.ts:306-309
const generatedText = await generateTextWithProvider({
  prompt: compiledPrompt,
  systemPrompt: String(systemPrompt).trim() || DEFAULT_SCRIPT_SYSTEM_PROMPT,
  //                                        ↑ 非空时默认值完全丢失
});
```

用户添加"注意中国古代场景"之类的补充指令后，LLM 可能不再输出 JSON 格式，导致解析失败："脚本生成结果无法解析成结构化镜头"。

**BUG-S2: Shot ID 跨节点冲突**

所有脚本节点生成的 shot 使用相同的 ID 格式 `shot-${index + 1}`。如果工作区有两个脚本节点，各自生成 3 个镜头，两组 shot 的 ID 完全重叠：`shot-1, shot-2, shot-3`。在提示词引用系统中，`buildResultReferences` 生成的 shot 引用 ID 为 `${nodeId}__shot_${index + 1}`，节点级别不冲突，但 shot 自身的 `id` 字段在工作区层面是重复的。

**BUG-S3: parsePlainBlock 双重调用**

```typescript
// linghuiScriptNodeUtils.ts:211
return parsePlainBlock(text, 0) ? [parsePlainBlock(text, 0)!] : [];
```

`parsePlainBlock` 被调用了两次（条件判断一次，取值一次），虽然该函数是纯函数无副作用，但这是不必要的重复计算。

**BUG-S4: 无 shot 数量上限**

LLM 可能生成 50+ 个镜头，`normalizeShots` 没有上限检查。大量 shots 在 UI 的 cards/table 视图中会造成性能问题，且每个 shot 可能派生出图片/视频子节点，进一步放大。

**BUG-S5: resolveStaticNodeResult 对脚本节点不解析 shots**

在静态结果解析中（`linghuiExecutionShared.ts:262-277`），手动模式的脚本节点只返回原始文本，不调用 `parseLinghuiScriptContent` 解析为结构化 shots：

```typescript
if (snapshot.data.linghuiType === 'linghui/script') {
  return {
    kind: 'storyboard',
    text: content,  // ← 原始文本，没有 shots
    metadata: { mode: 'manual', rawContent: content },
  };
}
```

这意味着在 `resolveTargetsOnly: true` 模式下，下游节点通过静态解析消费脚本节点时，无法获取结构化 shot 数据，`shots` 字段为 `undefined`。

---

### 3.6 跨节点共性问题

**BUG-X1: 连接校验仅匹配数据类型，不校验语义兼容性**

`validateLinghuiConnection` 只检查 `sourceDataType === targetDataType`：

```typescript
// linghuiNodeDefs.ts:201-203
if (sourceDataType === targetDataType) {
  return { valid: true };
}
```

但某些连接虽然类型匹配，语义上并不合理：
- 脚本节点的 `output-0` (dataType: `text`) 可以连接到任何 text 输入，但输出的实际内容是 storyboard JSON 字符串
- 多个相同类型的上游连接到同一槽位时，行为取决于 `getAllInputResults` 返回所有结果，但大多数节点只消费第一个

**BUG-X2: collectReferenceSources 只收集 primary，丢弃 items**

```typescript
// linghuiExecutionShared.ts:325-341
export function collectReferenceSources(results: LinghuiNodeResult[]): string[] {
  for (const result of results) {
    if (result.primary?.kind === 'image') {
      pushSource(result.primary.source);  // ← 只看 primary
    }
    // ← items 被完全忽略
  }
}
```

当上游图片节点以 batch 模式生成了 4 张图片时，下游视频节点只会收到 primary（第 1 张），其余 3 张被丢弃。用户期望"把所有生成的图片都传给视频"的场景不可行。

**BUG-X3: ensureRemoteUrlForImageSources 串行上传**

```typescript
// mediaRemoteUrlService.ts:216-237
for (let index = 0; index < sources.length; index += 1) {
  const normalized = await ensureRemoteUrlForImageSource({ ... });
  results.push(normalized);
}
```

多张参考图需要逐个上传到图床，对于 3-4 张图片的 reference-to-video 场景，额外增加 2-3 个串行上传 RTT。

**BUG-X4: 上游 text/audio/video 结果的 textSnippet 提取逻辑不透明**

`collectTextSnippets` 会从任何 `LinghuiNodeResult` 中提取 `.text`、`.metadata.description`、`.metadata.note`：

```typescript
// linghuiExecutionShared.ts:382-400
const candidate = String(
  result.text ??
  result.metadata?.description ??
  result.metadata?.note ??
  '',
).trim();
```

这意味着：
- 音频节点的 TTS 输入文本会被提取
- 视频节点如果有描述性 metadata 会被提取
- 用户很难预测哪些文本会被合并到下游 prompt 中

**BUG-X5: 节点输入槽位声明与执行器使用的不一致汇总**

| 节点类型 | 声明的输入槽位 | 执行器实际使用 | 差异 |
|---------|--------------|--------------|------|
| text | 0:image, 1:text, 2:video, 3:audio | slot 1,2,3 (text only) | slot 0 永远不被读取 |
| image | 0:image, 1:text | 0:image refs, 1:text | 一致 |
| video | 0:image, 1:text, 2:audio, 3:video | 0:image refs, 1+2:text, 3:video poster | audio 数据不传递给 Provider |
| audio | 0:image, 1:text, 2:video, 3:audio | slot 1,2,3 (text only) | slot 0 永远不被读取；audio 数据不被消费 |
| script | 0:image, 1:text, 2:video | slot 1,2 (text only) | slot 0 永远不被读取 |

共有 **4 个节点声明了但不使用的 image 输入槽位**，以及 **2 个"音频连接有效但音频内容被丢弃"** 的情况。

---

## 四、架构问题诊断

### 4.1 LinghuiCanvas 的 Hook 爆炸

**严重程度：高**

`LinghuiCanvas.tsx` 组合了 18+ 个自定义 Hook，形成隐式依赖链：

```
useLinghuiCanvasUiState
  → useLinghuiCanvasHistory (依赖 nodes/edges setter)
    → useLinghuiCanvasFlowBridge (依赖 history)
      → useLinghuiCanvasNodeInteractions (依赖 bridge)
        → useLinghuiCanvasHotkeys (依赖 interactions)
          → useLinghuiCanvasDocumentOps (依赖 hotkeys)
            → useLinghuiCanvasImperativeHandle (依赖 all)
```

**问题**：
- Hook 之间存在隐式时序依赖，重构任何一个都可能引发连锁失败
- 无法对单个 Hook 进行集成测试（因为它们共享组件作用域内的闭包状态）
- 新功能只能通过新增 Hook → 更长的依赖链
- `LinghuiCanvas` 组件本身成为"上帝组件"——知道太多、协调太多

**建议**：将画布状态提取到独立 Store（Zustand / Jotai），Hook 退化为 Store 的消费者而非状态持有者。

### 4.2 Electron 硬耦合

**严重程度：高**

以下模块直接调用 `electronService`：
- `linghuiResultExport.ts` → `electronService.fs.mkdir`, `electronService.fs.writeFile`
- `linghuiExecutionShared.ts` → `electronService.fs.toLocalUrl`
- `mediaRemoteUrlService.ts` → `electronService.fs.readFile`
- `imageHostingService.ts` → `electronService.ipc.invoke`

**问题**：
- Web 端部署需要大量 mock 或条件分支
- 单元测试必须 mock 整个 electronService
- 文件系统操作没有统一的抽象层

**建议**：
- 引入 `FileSystemPort` / `IPCPort` 接口，让 Electron 作为一种实现注入
- 对于 Web 端，提供基于 Origin Private File System (OPFS) 或 IndexedDB 的替代实现

### 4.3 串行执行的性能瓶颈

**严重程度：中高**

`executeLinghuiWorkflow` 按拓扑序逐个执行节点：

```typescript
for (const snapshot of orderedNodes) {
  // ... 一次只执行一个节点
  const result = await executeNode(nodeView, ...);
}
```

**问题**：拓扑排序后，同一层级的无依赖节点（如 3 个独立的图片节点）仍然串行执行。对于包含多个并行分支的工作流，这会显著增加总耗时。

**建议**：引入并行执行层，同一拓扑层级内的无依赖节点可以 `Promise.all()` 并发执行。需要注意：
- 并发数限制（Provider API rate limit）
- 进度报告的聚合
- 错误隔离（一个分支失败不应取消其他并行分支）

### 4.4 LinghuiNodeResult 的联合类型膨胀

**严重程度：中**

```typescript
interface LinghuiNodeResult {
  kind: LinghuiResultKind;  // 8 种
  text?: string;
  primary?: LinghuiMediaItem;
  items?: LinghuiMediaItem[];
  shots?: LinghuiStoryboardFrame[];
  metadata?: Record<string, unknown>;
}
```

所有节点类型共享同一个 Result 接口，通过 `kind` 区分。这导致：
- 消费者需要大量 `if (result.kind === 'image')` 分支
- 类型系统无法保证 `kind === 'storyboard'` 时 `shots` 一定存在
- `metadata` 是无类型的 `Record<string, unknown>`，丢失了节点特有的元数据结构

**建议**：改为 Tagged Union（区分联合类型）：

```typescript
type LinghuiNodeResult =
  | { kind: 'text'; text: string }
  | { kind: 'image'; primary: LinghuiMediaItem }
  | { kind: 'images'; primary: LinghuiMediaItem; items: LinghuiMediaItem[] }
  | { kind: 'video'; primary: LinghuiMediaItem }
  | { kind: 'storyboard'; shots: LinghuiStoryboardFrame[]; text: string }
  | { kind: 'audio'; primary: LinghuiMediaItem; text?: string }
  // ...
```

### 4.5 异步轮询缺乏自适应策略

**严重程度：中**

`resolveAsyncProviderResult` 使用固定间隔轮询：

```typescript
await delay(DEFAULT_POLLING_CONFIG.interval, signal);
```

**问题**：
- 无指数退避（快速阶段和慢速阶段使用相同间隔）
- 不同 Provider 的任务完成时间差异巨大（Runway ~30s，Kling ~2min），但使用相同配置
- 没有利用 Provider 返回的 `progress` 值动态调整轮询频率

**建议**：
- 引入自适应轮询：progress 接近 100% 时缩短间隔，progress 停滞时拉长间隔
- 允许 Provider 声明 `estimatedDuration`，用于计算初始轮询策略
- 支持 Provider 可选的 WebSocket/SSE 推送模式，替代轮询

### 4.6 提示词引用的 DAG 假设未强制执行

**严重程度：中**

`buildLinghuiPromptReferenceItems` 遍历上游边收集引用，`collectRequiredNodeIds` 递归收集上游依赖。这两个函数都假设图是 DAG（有向无环图），但：
- 环检测只在 UI 层（React Flow 的 `isValidConnection`）执行
- 执行引擎层没有环检测
- 如果通过 API/导入引入了环，会导致无限递归或拓扑排序静默丢节点

```typescript
// topologicalSort 中环节点被静默追加到尾部
if (ordered.length === filteredNodes.length) {
  return ordered;
}
const orderedSet = new Set(ordered.map(node => node.id));
return [...ordered, ...filteredNodes.filter(node => !orderedSet.has(node.id))];
```

**建议**：在 `executeLinghuiWorkflow` 入口处增加显式环检测，发现环时抛出明确错误。

### 4.7 类型名称空间混乱

**严重程度：低-中**

存在两套节点类型标识：
- `LinghuiNodeType`: `'linghui/text'` （斜杠分隔）
- `LinghuiRFNodeTypeKey`: `'linghui-text'` （连字符分隔）

转换函数 `rfTypeToLinghuiType` 的实现有隐患：

```typescript
export function rfTypeToLinghuiType(rfType: string): LinghuiNodeType {
  return rfType.replace(/-/g, '/').replace('linghui/', 'linghui/') as LinghuiNodeType;
  // 第二个 replace 是 no-op，但如果未来类型名包含多个 `-`，第一个 replace 会全部替换
}
```

**建议**：使用显式映射表替代正则替换，消除边界条件风险。

### 4.8 全局 Store 隐式耦合

**严重程度：中**

`linghuiExecutionProviders.ts` 中的 Provider 获取链路：

```
generateVideoWithProvider
  → loadSettings()          // 全局 settings store
  → resolveConfiguredChannelModel()  // 全局 channel registry
  → getProjectITVProvider()  // 全局 provider factory
```

Provider 的选择和构造依赖三层全局状态，使得：
- 同一工作流中不同节点无法使用不同的设置配置
- 无法在测试中注入自定义 Provider 而不 mock 全局模块
- Provider 配置变更的时序问题（执行过程中用户修改了设置）

**建议**：将 settings 快照化——在工作流执行开始时冻结一份 settings 副本，注入到执行上下文中。

### 4.9 结果导出阻塞 UI

**严重程度：中**

`linghuiResultExport.ts` 的导出流程：
1. 弹出目录选择对话框（阻塞）
2. 同步遍历所有节点结果
3. 逐个文件写入磁盘（`await fsWriteFileBuffer`）

对于包含大量视频/图片的工作流，导出过程可能持续数十秒，期间无进度反馈。

**建议**：
- 增加导出进度回调
- 考虑流式导出（边执行边写入临时目录，完成后移动）
- 支持后台导出

### 4.10 灵绘与 Agent 系统的断裂

**严重程度：设计层面**

`AgentGraph.ts` 实现了基于 LangGraph 的 ReAct Agent，具备工具调用能力。灵绘工作流和 Agent 系统目前完全独立：

- Agent 不能作为灵绘节点参与工作流
- 灵绘节点不能调用 Agent 做复杂推理
- 两套系统各自管理 LLM 配置

这意味着需要 Agent 介入的复杂场景（如"分析图片内容 → 生成描述 → 根据描述生成视频"）无法在灵绘中一站式完成。

---

## 五、演化方向

### 5.1 近期（1-2 个迭代）

#### 5.1.1 并行执行引擎

将当前串行 for 循环改为基于拓扑层级的并行调度：

```
Layer 0: [text-1, image-import-1]     ← 并发执行
Layer 1: [image-gen-1, image-gen-2]   ← 等 Layer 0 完成后并发执行
Layer 2: [video-1]                    ← 等 Layer 1 完成后执行
```

预期收益：多分支工作流执行时间减少 40-60%。

#### 5.1.2 Result 类型强化

将 `LinghuiNodeResult` 改为 Tagged Union，消除运行时类型检查的负担，让 TypeScript 编译器保证每种 result 的字段完整性。

#### 5.1.3 Settings 快照注入

在 `executeLinghuiWorkflow` 入口处冻结 settings，作为执行上下文的一部分传递给所有 Provider 调用。

### 5.2 中期（3-5 个迭代）

#### 5.2.1 画布状态 Store 化

将 `LinghuiCanvas` 的 18+ Hook 重构为 Zustand Store：

```typescript
interface LinghuiCanvasStore {
  // 画布数据
  nodes: Node[]
  edges: Edge[]
  groups: Group[]

  // 操作
  addNode(type: LinghuiNodeType, position?: Position): void
  deleteNodes(ids: string[]): void
  connectNodes(source: string, target: string): void

  // 历史
  undo(): void
  redo(): void

  // 选择
  selection: Selection
  setSelection(sel: Selection): void
}
```

好处：
- Hook 退化为薄桥接层
- Store 可独立于组件测试
- 多组件可直接订阅 Store 而无需 prop drilling

#### 5.2.2 Agent 节点集成

新增 `linghui/agent` 节点类型：

```typescript
interface LinghuiAgentNodeProperties {
  agentPrompt: string       // Agent 系统提示词
  tools: string[]           // 可用工具列表
  llmSelection: string      // LLM 选择
  maxIterations: number     // 最大推理轮次
}
```

执行时调用 `streamAgentGraph`，将 Agent 的推理过程和工具调用结果作为 `LinghuiNodeResult` 返回。这打通了灵绘工作流与 Agent 自主推理的边界。

#### 5.2.3 文件系统抽象

引入 `FileSystemPort` 接口：

```typescript
interface FileSystemPort {
  readFile(path: string): Promise<Uint8Array>
  writeFile(path: string, data: Uint8Array): Promise<void>
  mkdir(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  toDisplayUrl(path: string): string
}
```

实现：
- `ElectronFileSystem` → 当前 electronService 封装
- `OPFSFileSystem` → Web 端 Origin Private File System
- `MemoryFileSystem` → 测试用内存实现

#### 5.2.4 工作流模板系统（Recipe Layer）

定义系统级预设模板：
- **角色设计流**: text → image (正面) → image (多角度) → video
- **分镜创作流**: text → script → [image × N] → [video × N]
- **配音工作流**: script → [text × N] → [audio × N]

模板不仅是节点快照，还包含连接规则和参数预设。


#### 5.3.3 执行计划可视化

在执行前生成"执行计划"，展示：
- 预估总耗时（基于历史执行数据）
- 预估成本（基于 Provider 定价）
- 并行度分析
- 瓶颈节点标识

用户确认计划后再执行，类似 SQL 的 EXPLAIN。

#### 5.3.4 Provider 热插拔

支持执行过程中更换 Provider：
- 某个 Provider 超时后自动切换到备选
- 用户可以中途手动切换
- Provider 降级策略（如 4K → 1080p → 720p）

---

## 六、文件索引

### 核心类型

| 文件 | 职责 |
|------|------|
| `frontend/src/types/linghui.ts` | 全部灵绘类型定义（节点、边、结果、队列、工作区） |
| `frontend/src/types/media.ts` | VideoGenerationCapability 等媒体类型 |

### 执行引擎

| 文件 | 职责 |
|------|------|
| `linghuiExecutionWorkflow.ts` | 拓扑排序 + 依赖追踪 + 执行编排 |
| `linghuiExecutionNodeExecutors.ts` | 5 种节点执行器 |
| `linghuiExecutionProviders.ts` | Provider 调用 + 异步轮询 |
| `linghuiExecutionShared.ts` | ExecutionNodeView + 通用工具函数 |
| `videoCapabilityUtils.ts` | 视频能力路由与校验 |

### 画布与 UI

| 文件 | 职责 |
|------|------|
| `LinghuiPage.tsx` | 工作区生命周期管理 |
| `LinghuiCanvas.tsx` | 画布组件 + Hook 组合 |
| `LinghuiCanvasSurface.tsx` | React Flow 渲染层 |
| `linghuiCanvasShared.ts` | 快照序列化 + 变更检测 |
| `linghuiNodeDefs.ts` | 节点定义 + 槽位系统 |

### Provider 集成

| 文件 | 职责 |
|------|------|
| `frontend/src/providers/itv/*.ts` | ITV Provider 实现（Runway、Kling、Pika 等） |
| `frontend/src/providers/tti/types.ts` | TTI Provider 接口 |
| `frontend/src/providers/tts/types.ts` | TTS Provider 接口 |

### 基础服务

| 文件 | 职责 |
|------|------|
| `mediaRemoteUrlService.ts` | 本地资产 → 远程 URL 转换 |
| `imageHostingService.ts` | 图床上传抽象 |
| `linghuiStorage.ts` | 工作区持久化 + V1→V2 迁移 |
| `linghuiResultExport.ts` | 执行结果文件系统导出 |

---

## 七、Bug 汇总表

| 编号 | 节点 | 严重程度 | 描述 | 位置 |
|------|------|---------|------|------|
| BUG-T1 | text | 低 | 手动模式静默丢弃上游输入 | `linghuiExecutionNodeExecutors.ts:62` |
| BUG-T2 | text | 中 | 图片参考槽位声明但永远不被读取 | `linghuiNodeDefs.ts:89` vs `executeTextNode` |
| BUG-T3 | text | 中 | LLM 生成无流式支持 | `linghuiExecutionProviders.ts:698-721` |
| BUG-I1 | image | 高 | 多角度模式缺少上游图片时静默回退到文生图 | `linghuiExecutionNodeExecutors.ts:167-184` |
| ~~BUG-I2~~ | image | — | ~~宫格模式 (gridType) 在执行层无效~~ **误判，非 Bug** | — |
| BUG-I3 | image | 中 | 多角度模式丢弃用户 prompt | `linghuiExecutionNodeExecutors.ts:187` |
| BUG-I4 | image | 中 | 批量生成无并发控制 | `linghuiExecutionNodeExecutors.ts:213` |
| BUG-I5 | image | 低 | silentReferenceSources 死代码 | `linghuiExecutionNodeExecutors.ts:160` |
| BUG-V1 | video | 高 | 音频输入被声明但从未传递给 Provider | `linghuiExecutionNodeExecutors.ts:398` |
| BUG-V2 | video | 中 | 首尾帧去重导致同图场景失败 | `videoCapabilityUtils.ts:130-131` |
| BUG-V3 | video | 中 | duration/aspectRatio/resolution 无兼容性校验 | `linghuiExecutionProviders.ts:474-478` |
| BUG-V4 | video | 低 | 音频 slot 的 TTS 文本被自动合并到 prompt | `linghuiExecutionNodeExecutors.ts:363-366` |
| BUG-A1 | audio | 中 | 图片和音频参考槽位声明但不被消费 | `linghuiNodeDefs.ts:117-120` |
| BUG-A2 | audio | 中 | 缺少 voice 选择 UI | `linghuiExecutionProviders.ts:643-650` |
| BUG-A3 | audio | 低 | onProgress 在即时模式下不触发 | `linghuiExecutionProviders.ts:670` |
| BUG-A4 | audio | 低 | 上传模式 prompt 作为 text 泄露 | `linghuiExecutionNodeExecutors.ts:422-429` |
| BUG-S1 | script | 高 | 用户自定义 System Prompt 丢失 JSON 格式约束 | `linghuiExecutionNodeExecutors.ts:306-309` |
| BUG-S2 | script | 低 | Shot ID 跨节点冲突 | `linghuiScriptNodeUtils.ts:59/88` |
| BUG-S3 | script | 低 | parsePlainBlock 双重调用 | `linghuiScriptNodeUtils.ts:211` |
| BUG-S4 | script | 中 | LLM 生成的 shot 无数量上限 | `linghuiScriptNodeUtils.ts:96-113` |
| BUG-S5 | script | 中 | resolveStaticNodeResult 不解析手动脚本的 shots | `linghuiExecutionShared.ts:262-277` |
| BUG-X1 | 跨节点 | 中 | 连接校验仅匹配类型不校验语义 | `linghuiNodeDefs.ts:201` |
| BUG-X2 | 跨节点 | 高 | collectReferenceSources 丢弃批量图片的 items | `linghuiExecutionShared.ts:325-341` |
| BUG-X3 | 跨节点 | 中 | ensureRemoteUrlForImageSources 串行上传 | `mediaRemoteUrlService.ts:216-237` |
| BUG-X4 | 跨节点 | 低 | textSnippet 提取逻辑不透明 | `linghuiExecutionShared.ts:382-400` |
| BUG-X5 | 跨节点 | 高 | 4个节点的 image 输入槽位+2个 audio 输入永远不被消费 | 见表格 |

**高严重度 Bug (4个)**: BUG-I1, BUG-V1, BUG-S1, BUG-X2
**中严重度 Bug (11个)**: BUG-T2, BUG-T3, BUG-I3, BUG-I4, BUG-V2, BUG-V3, BUG-A1, BUG-A2, BUG-S4, BUG-S5, BUG-X1, BUG-X3
**低严重度 Bug (9个)**: BUG-T1, BUG-I5, BUG-V4, BUG-A3, BUG-A4, BUG-S2, BUG-S3, BUG-X4, BUG-X5(部分)
**误判移除 (1个)**: ~~BUG-I2~~ 宫格模式设计正确

---

## 八、总结

灵绘的核心设计是健壮的——执行引擎的纯函数设计、ExecutionNodeView 抽象、能力驱动的视频生成系统都是经过深思熟虑的架构决策。

### 节点层面的核心问题

代码审查发现 **24 个 Bug/设计缺陷**，其中 4 个高严重度：

1. **BUG-I1**: 图片节点多角度模式缺少上游图片时静默回退为普通文生图，用户毫无感知
2. **BUG-V1**: 视频节点的音频输入只是摆设——声明了连接但数据从未到达 Provider
3. **BUG-S1**: 脚本节点的自定义 System Prompt 会覆盖 JSON 格式约束，导致生成结果无法解析
4. **BUG-X2**: 批量图片只传递 primary 到下游，其余结果被丢弃

最突出的系统性问题是 **输入槽位声明与执行器使用的不一致**（BUG-X5）：4 种节点声明了 image 输入但从未读取，2 种节点声明了 audio 输入但丢弃音频数据。这说明节点定义（`linghuiNodeDefs.ts`）和节点执行器（`linghuiExecutionNodeExecutors.ts`）之间缺乏契约校验机制。

### 架构层面的核心问题

1. **Canvas 组件的 Hook 复杂度** 已接近维护上限
2. **Electron 硬耦合** 限制了部署形态
3. **串行执行** 在并行工作流中效率低下
4. **类型系统未充分利用** TypeScript 的区分联合能力

### 演化的核心思路

**保持执行引擎的纯净性，向上解耦 UI 状态管理，向下抽象基础设施依赖，横向集成 Agent 能力**。优先修复高严重度 Bug，然后推进槽位定义与执行器的契约一致性审计。
