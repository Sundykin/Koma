# Change: Refactor Media Generation Pipeline

## Why
当前生图、图生视频、语音合成三条链路在任务管理、Provider 契约、项目存储结构和恢复逻辑上各自演进，已经出现以下系统性问题：

- 媒体任务同时分散在 `TaskManager` 和 `taskQueueStore` 两套体系里，恢复与回写行为不一致。
- TTI / ITV / TTS Provider 的输入输出契约不统一，导致工作流层需要写大量分支与兼容代码。
- 项目数据同时维护 `imagePath`、`imageUrl`、`previewVideoTaskId` 等平行字段，数据链路跨层泄漏。
- `blob:`、`data:`、远程 URL、本地路径混用，导致持久化和恢复都不可靠。
- 分镜渲染入口没有稳定地使用项目级 `ttiConfigId` / `itvConfigId` / `ttsConfigId`，存在默认设置串线问题。

如果继续沿用当前模式，后续每新增一个 Provider 或媒体入口，都需要再复制一轮兼容逻辑，系统复杂度会持续上升。

## What Changes
- **BREAKING** 统一 TTI / ITV / TTS Provider 契约为 request-based 输入和统一的 start / task-snapshot 生命周期。
- **BREAKING** 将角色、场景、道具、分镜、分镜版本中的媒体字段收敛为结构化媒体资产对象，不再新增平行 primitive 字段。
- 新增统一边界服务，负责媒体输入标准化、结果持久化、任务绑定和恢复回写。
- 所有媒体生成任务统一接入 `taskQueueStore`，媒体恢复流程必须根据 `ownerRef` 回写实体或分镜版本。
- 所有媒体入口统一使用项目级 Provider 选择；只有项目未配置时才回退全局默认。
- 兼容逻辑只保留在项目迁移层和插件 SDK 版本边界，不在工作流、UI、Provider 调用层散落 `a || b || c` 风格兼容代码。

## Impact
- Affected specs:
  - `asset-generation`
  - `model-providers`
  - `storage`
  - `tts`
  - `itv`
- Affected code:
  - `frontend/src/types.ts`
  - `frontend/src/providers/types.ts`
  - `frontend/src/providers/index.ts`
  - `frontend/src/providers/tti/types.ts`
  - `frontend/src/providers/itv/types.ts`
  - `frontend/src/providers/tts/types.ts`
  - `frontend/src/services/TaskManager.ts`
  - `frontend/src/services/ShotGenerationService.ts`
  - `frontend/src/services/AssetGenerationService.ts`
  - `frontend/src/providers/tts/TTSService.ts`
  - `frontend/src/workflow/characterAssetWorkflow.ts`
  - `frontend/src/workflow/scenePropAssetWorkflow.ts`
  - `frontend/src/workflow/shotRenderWorkflow.ts`
  - `frontend/src/store/taskQueueStore.ts`
  - `frontend/src/store/taskRecoveryService.ts`
  - `frontend/src/store/projectOpenService.ts`
  - `frontend/src/store/project/entities.ts`
  - `frontend/src/store/project/shots.ts`
  - `frontend/src/store/project/analysis.ts`
  - `frontend/src/store/assetDownloadService.ts`
  - `frontend/src/components/editor/EditorView.tsx`
  - `frontend/src/components/storyboard/Storyboard.tsx`
  - `frontend/src/components/storyboard/ShotCard.tsx`
  - `frontend/src/components/asset/CharacterDetailPanel.tsx`
  - `frontend/src/components/asset/SceneDetailPanel.tsx`
  - `frontend/src/components/asset/PropDetailPanel.tsx`
  - `packages/plugin-sdk/src/provider.ts`
  - `packages/plugin-sdk/src/tti.ts`
  - `packages/plugin-sdk/src/itv.ts`
  - `packages/plugins/seedream-tti-provider/src/index.tsx`
  - `packages/plugins/vectorengine-provider/src/index.tsx`

## Approval Gate
本提案属于架构级与数据模型级改动。在 proposal 获批前，不进入实现阶段。
