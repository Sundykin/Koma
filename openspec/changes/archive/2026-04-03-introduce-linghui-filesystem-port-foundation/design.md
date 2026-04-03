## Context

灵绘现在有两类明显的文件系统耦合点：

- 预览链路：多个节点组件和提示词编辑器直接调用 `electronService.fs.toLocalUrl(...)`
- 写盘链路：宫格切分输入落盘、结果导出等逻辑直接调用 `electronService.fs.mkdir/writeFile/writeFileBuffer/copy/downloadFile`

这种方式的问题不只在“未来无法换 OPFS”，还包括：

- Linghui 模块无法在不 mock Electron 的前提下被单测
- 运行时能力边界分散在各个模块内部，错误提示不一致
- 预览 URL 解析逻辑在多个组件中重复

5.2.3 的第一块不需要一次做完 OPFS，也不需要替换仓库内全部文件访问。更合适的 foundation slice 是先把灵绘链路用到的文件系统能力收敛到同一个 port，让 Electron 成为默认实现，Memory 成为测试实现。

## Goals / Non-Goals

**Goals:**

- 引入可复用的 `FileSystemPort` 接口和默认获取入口
- 提供 Electron 实现与 Memory 实现，支持测试注入
- 将灵绘预览 URL 解析、本地素材落盘和结果导出迁移到 `FileSystemPort`
- 对不支持的运行时能力给出明确错误，而不是继续隐式依赖 Electron

**Non-Goals:**

- 不在本轮实现 `OPFSFileSystem`
- 不改造所有非灵绘模块对 `electronService` 的使用
- 不重写已有上传文件对话框流程
- 不引入新的持久化格式或工作区结构变更

## Decisions

### Decision: 抽象放在 `frontend/src/services/fileSystemPort.ts`

首版使用通用 service 文件承载接口、默认实例、Electron 适配器和 Memory 适配器，而不是先做 Linghui 私有版本。

Why:

- 文件系统能力本身是跨功能的基础设施概念
- 后续 OPFS 或其他页面模块接入时可直接复用
- 仍然可以通过“只迁移 Linghui 调用方”来控制本轮改动面

Alternatives considered:

- 放在 `components/linghui/`：短期更近，但会把基础设施概念绑定到单一业务目录

### Decision: 用默认 port getter + 测试注入，而不是立刻全量依赖注入

首版通过 `getFileSystemPort()` 获取默认实例，并暴露 `setDefaultFileSystemPort()` / `resetDefaultFileSystemPort()` 供测试或未来宿主切换使用。

Why:

- 避免本轮把 React props、hook 参数和执行上下文都改成显式传 port
- 已经能满足测试替换和未来 runtime 切换
- 改动量足够小，便于快速打通 foundation

Trade-off:

- 仍然保留一个受控的全局默认实例，但比直接散落调用 `electronService` 更容易收口

### Decision: 首版只抽象灵绘当前真实使用的文件能力

接口会覆盖灵绘当前需要的能力：`toDisplayUrl`、`readBase64`、`writeText`、`writeBase64`、`writeBytes`、`mkdir`、`exists`、`copy`、`download`、`pickDirectory`，以及能力标记。

Why:

- 与当前 Linghui 真实调用面对齐，避免过度设计
- 后续 OPFS 落地时若需要扩展 `readDir/remove` 等能力，可以在不破坏已迁移链路的前提下继续演化

Alternatives considered:

- 严格只保留文档中的 5 个方法：无法覆盖当前结果导出和宫格切分路径

### Decision: 显式暴露 capability 标记来处理“能否在当前运行时完成”

`FileSystemPort` 首版包含 capability 标记，区分：

- `readWrite`
- `directoryPicker`
- `nativeLocalPaths`

Why:

- 宫格切分依赖 FFmpeg 和真实本地路径
- 结果导出依赖目录选择能力
- 仅用 `isAvailable()` 无法表达“可读写但不支持本地路径”的差异

## Risks / Trade-offs

- [默认实例仍然是全局状态] → 通过显式 setter/resetter 和 Memory 实现把全局状态限制在单一 service 内
- [首版只迁移灵绘，不会立即消灭全仓 Electron 依赖] → 在 proposal 和 tasks 中明确这是 foundation slice，后续再扩面
- [能力标记设计不足可能影响后续 OPFS 落地] → 先围绕灵绘当前真实需求定义，避免一次引入过多抽象

## Migration Plan

1. 新增 `FileSystemPort` service 与 Electron / Memory 实现
2. 迁移灵绘公共预览 URL 解析到 port helper
3. 迁移宫格切分输入落盘和结果导出写盘到 port
4. 补充 Memory port 和迁移后的灵绘路径测试

## Open Questions

None.
