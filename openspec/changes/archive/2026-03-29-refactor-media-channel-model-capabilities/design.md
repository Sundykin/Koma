## Context

当前媒体能力体系同时存在三类结构性问题：

1. 配置层把“渠道”“provider”“模型”“默认参数”混成同一个对象，`llmConfigs`、`ttiConfigs`、`itvConfigs`、`ttsConfigs` 都默认一条配置只对应一个模型。
2. 运行时能力路由仍停留在顶层粗粒度 `tti / itv / tts`，无法表达“同一渠道下不同模型支持不同能力范围”的事实。
3. ITV 输入契约过于狭窄，当前 `ITVRequest` 只有 `prompt + primaryImage + additionalReferences + options`，无法无歧义承载文生视频、图生视频、参考生视频、首尾帧视频四种模式。

这直接导致设置页、项目选择器、灵绘视频节点、项目分镜/角色/道具视频生成工作流都在隐式依赖“用户自己知道该选什么模型、该开什么界面”。对于 Vidu 这类同一渠道下多模型、且模型能力矩阵不同的服务，这种抽象已经不成立。

本次设计以“项目尚未上线、允许破坏式重构”为前提，不为旧数据和旧配置保留兼容层。受影响的主要协作者包括：

- 全局设置与项目设置
- 媒体 Provider / Channel Registry
- 媒体生成服务与插件 API
- 灵绘视频编辑与执行编译
- 分镜、角色、场景、道具相关视频工作流

作为首个落地样例，Vidu 渠道将严格以本地 [vidu视频渠道.md](/Users/sunmeng/workspace/Koma/vidu视频渠道.md) 建模。当前集成契约以该文件中的 OpenAPI 片段为准：视频生成能力分别使用 `/vidu/v2/text2video`、`/vidu/v2/img2video`、`/vidu/v2/reference2video`、`/vidu/v2/start-end2video`，任务查询使用 `/vidu/v2/tasks/{task_id}/creations`，鉴权头示例为 `Authorization: Bearer {apiKey}`。`baseUrl` 不在该文档中固定给出，因此由渠道配置显式提供。

## Goals / Non-Goals

**Goals:**

- 建立统一的“媒体类别 -> 渠道 -> 模型 -> 模型能力”目录结构，覆盖 LLM、TTI、ITV、TTS。
- 让渠道负责共享连接信息与鉴权，模型负责能力声明、输入约束、参数默认值和能力元数据。
- 让项目、工作流和灵绘都通过统一的运行时解析器选择模型，并自动得到合法的能力范围。
- 将视频生成重构为四类显式能力：文生视频、图生视频、参考生视频、首尾帧视频。
- 将提示词编译收口到能力级标准请求，再由渠道适配器映射到厂商 API，避免 UI 和 workflow 中散落厂商特例。
- 用 Vidu 作为首个样板渠道，验证“一个渠道包含多个模型且模型能力不同”的完整链路。

**Non-Goals:**

- 不兼容旧设置、旧项目字段或旧配置数组，不提供双写或迁移桥接逻辑。
- 不在本次设计中解决媒体市场、远程模型发现或在线拉取厂商模型目录。
- 不在本次设计中引入多模型回退、竞价路由或同类能力的自动择优调度。
- 不要求所有厂商都支持全部四类视频能力；模型只声明自己真实支持的能力。

## Decisions

### Decision: 将目录定义与用户配置彻底分离

系统采用两层结构：

- `ChannelDefinition`：代码或插件提供的静态定义，声明渠道类别、展示信息、支持的模型列表、能力矩阵、默认参数、配置 schema、连接测试方式。
- `ChannelConfig`：用户在设置中保存的实例化配置，只包含该渠道的共享连接信息、是否启用、默认模型、必要的模型级覆盖项。

建议的核心数据形态如下：

```ts
type MediaCategory = 'llm' | 'tti' | 'itv' | 'tts';

interface ChannelDefinition {
  id: string;
  category: MediaCategory;
  vendor: string;
  name: string;
  configSchema: Record<string, unknown>;
  models: ChannelModelDefinition[];
  createAdapter(): MediaChannelAdapter;
}

interface ChannelConfig {
  channelId: string;
  enabled: boolean;
  baseUrl?: string;
  secrets?: Record<string, string>;
  defaultModelId?: string;
  modelOverrides?: Record<string, {
    enabled?: boolean;
    defaults?: Record<string, unknown>;
  }>;
}
```

之所以不把模型目录直接存进用户配置，是为了避免能力矩阵、默认参数和 UI 元数据被重复存储并发生漂移。新增渠道时，只需要增加一个新的渠道定义模块，而不是再发明一套新的配置表单与执行类型。

备选方案是继续沿用“每个模型就是一条配置”的方式，只在配置里再挂一个 `capabilities` 数组。该方案被拒绝，因为它仍然让用户承担模型目录维护责任，也无法避免项目选择器、执行层和 UI 都要重复判断能力是否合法。

### Decision: 用模型能力描述符替代当前顶层 ChannelCapability

能力从粗粒度的 `itv / tti / tts` 改为模型级的强类型描述符，采用可扩展命名空间：

```ts
type MediaCapabilityType =
  | 'llm.chat'
  | 'image.text-to-image'
  | 'image.image-to-image'
  | 'video.text-to-video'
  | 'video.image-to-video'
  | 'video.reference-to-video'
  | 'video.start-end-to-video'
  | 'speech.text-to-speech';

interface CapabilityDefinition {
  type: MediaCapabilityType;
  label: string;
  inputContract: string;
  optionSchema?: Record<string, unknown>;
  promptCompiler: string;
  editorVariant?: string;
}
```

对于 ITV，本次明确把四类能力作为一等公民建模：

- `video.text-to-video`
- `video.image-to-video`
- `video.reference-to-video`
- `video.start-end-to-video`

这样项目选择器、灵绘编辑器和执行层只需要读取模型声明，就能决定该模型应该出现哪些模式、哪些表单、哪些上游输入要求。

备选方案是保留 `itv` 作为统一能力，再在 `options.mode` 里传 `text`、`image`、`reference`、`start-end`。该方案被拒绝，因为它会继续产生“接口看起来都能调，但直到运行时才知道缺什么参数”的问题。

### Decision: 用能力级联合请求重写 ITV 及其它媒体请求契约

现有 `ITVRequest` 将被能力级标准请求替代。运行时只接受已经声明能力类型的标准输入，而不再接受“可能带着某些字段的松散对象”。

建议的 ITV 标准请求如下：

```ts
type VideoGenerationRequest =
  | {
      capability: 'video.text-to-video';
      prompt: string;
      options?: Record<string, unknown>;
    }
  | {
      capability: 'video.image-to-video';
      prompt: string;
      primaryImage: MediaAssetSource;
      options?: Record<string, unknown>;
    }
  | {
      capability: 'video.reference-to-video';
      prompt: string;
      referenceImages: MediaAssetSource[];
      options?: Record<string, unknown>;
    }
  | {
      capability: 'video.start-end-to-video';
      prompt: string;
      startFrame: MediaAssetSource;
      endFrame: MediaAssetSource;
      options?: Record<string, unknown>;
    };
```

TTI、TTS、LLM 也采用同样思路：请求必须声明目标能力，服务层和适配层不再从 `provider` 名称反推输入形态。

备选方案是保留现有 request 接口，只把能力作为可选 hint。该方案被拒绝，因为它仍会让校验和表单收敛逻辑分散在各入口里。

### Decision: 引入统一的模型解析器，所有入口都先解析再执行

所有项目工作流、项目页面操作、灵绘执行层、插件 API 都先调用统一的 `MediaModelResolver`，得到一个完整的 `ResolvedCapabilityContext`：

```ts
interface ResolvedCapabilityContext {
  category: MediaCategory;
  channel: ChannelDefinition;
  config: ChannelConfig;
  model: ChannelModelDefinition;
  capability: CapabilityDefinition;
  adapter: MediaChannelAdapter;
}
```

解析顺序固定为：

1. 读取项目级选择，定位目标 `channelId + modelId`
2. 若项目未指定，则回退到该类别的全局默认模型
3. 校验模型是否启用且支持目标能力
4. 返回可执行上下文；若失败，给出“当前模型不支持此能力”错误与可选替代模型

这样一来，“角色预览视频”“分镜视频化”“灵绘视频节点执行”都复用同一个解析规则，而不是各自维护一套 `getCurrentITVProvider()` 一类的逻辑。

备选方案是保留各入口自己解析配置。该方案被拒绝，因为这正是当前重复分支与行为漂移的来源。

### Decision: 提示词编译统一拆成“领域编译”和“渠道映射”两段

提示词编译不再散落在 UI 或渠道实现中，而是统一分为两段：

1. **领域编译器**：从项目、工作流、灵绘节点和上游输入中生成能力级标准请求。例如把灵绘视频节点的上游图片、节点提示词、项目风格、角色引用编译成 `VideoGenerationRequest`。
2. **渠道适配器映射器**：将标准请求 + 选中模型的能力定义映射为厂商请求体。例如 Vidu 适配器根据能力分别映射到 `text2video`、`img2video`、`reference2video`、`start-end2video`。

这层分离的意义在于：

- UI 层不再知道厂商接口细节
- 工作流层不再硬编码某个渠道使用 `images[0]` 还是 `start/end` 两张图
- 同一套项目/灵绘 prompt 语义可以服务多个渠道

同时，能力定义需要声明该能力使用哪个 prompt compiler，避免“文生视频”和“参考生视频”误用同一套输入编译逻辑。

备选方案是把 prompt 编译继续留在 provider 中。该方案被拒绝，因为 provider 层无法知道项目/灵绘的领域语义，会继续形成多处隐式拼接。

### Decision: 灵绘视频编辑器采用“导入/生成”与“能力模式”双层结构

灵绘视频节点仍保留“导入已有视频”和“生成视频”两大主路径，但在生成态下必须继续根据所选模型能力切分为不同编辑变体，而不再共享一张巨型表单。

具体规则：

- 若当前模型只支持一种视频能力，则直接进入该能力对应的编辑变体。
- 若当前模型支持多种视频能力，则在生成态展示能力切换器，只列出该模型真实支持的模式。
- 每个能力变体都有独立的输入要求摘要、上游校验和参数面板：
  - 文生视频：仅需提示词与视频参数
  - 图生视频：要求单张主图
  - 参考生视频：要求多张参考图
  - 首尾帧视频：要求首帧与尾帧
- 生成型工具面板仍保持为独立次级工具面板，不把所有工具配置重新塞回主表单

这让灵绘未来可以继续扩展更多视频能力，而不会再用 `all-ref` / `first-last-frame` 这样的临时模式名扩大技术债。

备选方案是继续保留一个视频面板，通过 `if provider === 'vidu'` / `if mode === 'first-last-frame'` 增量扩展。该方案被拒绝，因为它会直接回到当前困境。

### Decision: 全局设置与项目设置统一围绕渠道和模型管理

全局设置不再按 `llmConfigs / ttiConfigs / itvConfigs / ttsConfigs` 四套平行数组管理，而是统一管理为媒体类别下的渠道配置集合。项目也不再保存 `llmConfigId / ttiConfigId / itvConfigId / ttsConfigId`，而是保存媒体类别对应的模型选择：

```ts
interface ProjectMediaSelection {
  category: MediaCategory;
  channelId?: string;
  modelId?: string;
}
```

设置页需要展示：

- 渠道卡片：基础连接信息、测试连接、启用状态
- 模型列表：该渠道内所有可用模型及其能力徽标
- 默认模型设置：按媒体类别设置默认模型，而不是默认 provider 记录

项目选择器需要展示：

- 当前类别下所有已配置且启用的模型
- 每个模型的所属渠道与能力范围
- 在当前业务动作下仅展示支持该能力的模型

备选方案是只改服务层，不改设置和项目选择器。该方案被拒绝，因为用户仍然会面对旧抽象，最终还是得靠自己猜能力范围。

### Decision: 使用 Vidu 作为首个渠道级多模型样板实现

Vidu 渠道在新结构下会以一个 ITV 渠道出现，具有以下约束：

- 渠道共享配置：`baseUrl`、`apiKey`
- `baseUrl` 必须由用户配置，不在代码中硬编码默认主机
- 认证映射为 `Authorization: Bearer {apiKey}`
- 各能力按 [vidu视频渠道.md](/Users/sunmeng/workspace/Koma/vidu视频渠道.md) 中的路径分别路由：
  - 文生视频 -> `POST /vidu/v2/text2video`
  - 图生视频 -> `POST /vidu/v2/img2video`
  - 参考生视频 -> `POST /vidu/v2/reference2video`
  - 首尾帧视频 -> `POST /vidu/v2/start-end2video`
- 所有任务结果统一通过 `GET /vidu/v2/tasks/{task_id}/creations` 轮询

Vidu 的模型支持矩阵存放在其渠道定义内，来源以 [vidu视频渠道.md](/Users/sunmeng/workspace/Koma/vidu视频渠道.md) 为准。UI 只根据声明展示该模型支持的能力，不允许用户在不支持的模型上切到错误模式。

备选方案是先把 Vidu 硬接到旧 ITV provider 架构中，再后续抽象。该方案被拒绝，因为这会再次制造一次性接口和兼容层。

### Decision: 采用 clean-slate 存储替换，不保留旧数据兼容

本次重构直接删除旧配置数组、旧项目字段和旧运行时兼容逻辑，不做迁移器、不做双读双写、不做 fallback 解析。旧数据视为无效配置，开发环境通过重新配置渠道与模型完成切换。

之所以做这个选择，是因为项目尚未上线，此时保留兼容层只会让新旧模型长期共存，拖慢后续每个媒体能力的实现速度。

备选方案是提供迁移脚本和兼容读取。该方案被拒绝，因为它会迫使所有调用点在未来数月里都继续背负旧概念。

## Risks / Trade-offs

- [改动面极大] → 通过统一的目录定义、解析器和标准请求收口，避免每个入口各自重构。
- [一次性替换容易遗漏调用点] → 以类型系统为主导，先删除旧字段和旧接口，让未改完的位置直接在编译期暴露。
- [模型能力矩阵容易与本地渠道文档漂移] → 将渠道定义集中在单一模块，并为关键模型能力表增加快照测试与文档更新时间注释，同时明确以 [vidu视频渠道.md](/Users/sunmeng/workspace/Koma/vidu视频渠道.md) 为准。
- [灵绘 UI 复杂度上升] → 用能力描述符中的 `editorVariant`、输入契约和参数 schema 驱动界面裁剪，而不是继续堆叠条件分支。
- [无兼容会导致本地旧配置失效] → 接受为 pre-launch 破坏性变更，在变更说明中明确“需重新配置渠道”，不为此保留运行时债务。
- [插件接口破坏] → 提升媒体插件契约版本，要求所有渠道实现新解析上下文与标准请求接口。

## Migration Plan

1. 删除旧的媒体配置与项目选择字段定义，建立新的目录类型、项目选择类型和设置存储结构。
2. 重写 Provider Registry 为渠道目录注册表，并落地统一的 `MediaModelResolver`。
3. 重写 LLM / TTI / ITV / TTS 的标准请求接口与执行入口，先打通服务层和工作流层。
4. 重建设置页、项目级选择器和灵绘视频节点编辑器，使其全部基于目录与能力描述符渲染。
5. 以 Vidu 作为首个 ITV 渠道实现多模型能力矩阵，并用其验证四类视频能力的端到端链路。
6. 删除剩余的旧 provider/config 兼容代码、旧状态字段和旧 UI 分支，确保代码库内只存在一套新模型。

回滚策略：

- 由于项目尚未上线，回滚只以代码级回滚为准，不设计运行时双 schema 支持。
- 新旧结构不得长期并存；若重构未完成，不应进入可发布状态。

## Open Questions

- 当前没有阻塞性开放问题。本次设计已经明确采用 clean-slate 替换、统一目录与统一解析器。
- 未来若要把 `video.character-extract`、`video.remix`、`image-hosting` 等扩展能力纳入同一目录体系，可以沿用本次的能力描述符机制继续扩展，不影响当前四类视频生成能力的落地。
