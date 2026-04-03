## Why

架构分析文档指出，`LinghuiNodeResult` 当前把文本、图片、视频、音频、分镜等 8 类结果都揉进一个“字段全部可选”的接口里，导致消费者需要反复做运行时分支，TypeScript 也无法保证 `kind` 对应的字段一定存在。

这类问题已经开始扩散到执行层、节点预览、结果导出和工作区持久化。先把结果结构收紧成 tagged union，可以在不改执行行为的前提下显著提高可维护性和类型安全。

## What Changes

- 将 `LinghuiNodeResult` 改为以 `kind` 为判别字段的联合类型
- 为常见消费场景提供统一的结果 helper，避免在各个组件里散落弱类型访问
- 更新静态结果解析、节点执行器、预览/编辑器、导出与持久化路径，统一遵守新的结果契约
- 补充类型与执行层测试，覆盖关键 result 形态和 helper 行为

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 节点执行结果需要遵循按 `kind` 判别的稳定结构化契约

## Impact

- Affected specs:
  - `linghui-studio`
- Affected code:
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/linghuiExecutionShared.ts`
  - `frontend/src/components/linghui/linghuiExecutionNodeExecutors.ts`
  - `frontend/src/components/linghui/linghuiImageCollections.ts`
  - `frontend/src/components/linghui/linghuiPromptReferences.ts`
  - `frontend/src/components/linghui/nodes/NodeResultPreview.tsx`
  - `frontend/src/components/linghui/AudioNodeEditor.tsx`
  - `frontend/src/components/linghui/VideoNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/linghuiResultExport.ts`
  - `frontend/src/store/linghuiStorage.ts`
  - related tests under `frontend/src/components/linghui/`, `frontend/src/store/`, `frontend/src/types/`
