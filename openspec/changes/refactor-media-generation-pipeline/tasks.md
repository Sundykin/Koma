## 1. 统一类型与边界契约

- [x] 1.1 新增 `frontend/src/types/media.ts`，定义 `StoredMediaAsset`、`ProviderAssetInput`、`MediaOwnerRef`、`ProviderStartResult`、`ProviderTaskSnapshot`
- [x] 1.2 修改 `frontend/src/types.ts`，把 Character / Scene / Prop / Shot / ShotVersion 的媒体字段收敛到结构化媒体槽位，不再为新逻辑增加平行兼容字段
- [x] 1.3 修改 `frontend/src/providers/types.ts`，去掉旧的媒体 Provider 重复定义，统一导向 request-based 契约
- [x] 1.4 修改 `frontend/src/providers/registry.types.ts`，为媒体 Provider 增加契约版本与能力声明，支撑插件版本边界
- [x] 1.5 修改 `frontend/src/providers/tti/types.ts`，将 `generateImage(prompt, options)` 改为统一的 `TTIRequest` + `ProviderStartResult`
- [x] 1.6 修改 `frontend/src/providers/itv/types.ts`，将 `imageUrl + prompt + options` 改为 `ITVRequest.primaryImage + additionalReferences`
- [x] 1.7 修改 `frontend/src/providers/tts/types.ts`，将 `text + voiceId + options` 改为 `TTSRequest` + 统一输出契约

## 2. 项目存储与迁移

- [x] 2.1 新增 `frontend/src/store/project/mediaState.ts`，统一清洗 Character / Scene / Prop / Shot / ShotVersion 的 `media.*` 结构，并明确运行时不再迁移旧字段
- [x] 2.2 新增 `frontend/src/services/mediaAssetResolver.ts`，统一把本地文件、项目资产、`blob:`、`data:`、远程 URL 解析成 `ProviderAssetInput`
- [x] 2.3 新增 `frontend/src/services/mediaPersistenceService.ts`，统一把 Provider 输出物化为本地文件并返回 `StoredMediaAsset`
- [x] 2.4 修改 `frontend/src/store/project/entities.ts`，角色 / 场景 / 道具只读写新媒体结构，不再散落读写旧字段
- [x] 2.5 修改 `frontend/src/store/project/shots.ts`，`saveShotVersion` 改为只接受结构化媒体资产，移除针对 URL scheme 的分支判断
- [x] 2.6 修改 `frontend/src/store/project/analysis.ts`，剧集分析数据持久化与恢复切到新的 Shot 媒体结构
- [x] 2.7 修改 `frontend/src/store/assetDownloadService.ts`，下载和文件落盘逻辑统一委托给 `mediaPersistenceService`

## 3. 统一媒体任务编排

- [x] 3.1 新增 `frontend/src/services/MediaGenerationService.ts`，作为 TTI / ITV / TTS 的唯一编排入口，负责 start、轮询、持久化和回写
- [x] 3.2 修改 `frontend/src/store/taskQueueStore.ts`，使其成为唯一的媒体任务状态源，并为每个任务记录 `ownerRef`
- [x] 3.3 修改 `frontend/src/services/TaskManager.ts`，移除媒体任务职责，仅保留分析类或非媒体任务能力
- [x] 3.4 修改 `frontend/src/store/taskRecoveryService.ts`，恢复任务时走统一 Provider task-snapshot 和统一落盘路径
- [x] 3.5 修改 `frontend/src/store/projectOpenService.ts`，项目打开时不仅恢复任务，还必须把已完成结果重新绑定到对应实体或分镜版本

## 4. 工作流收口改造

- [x] 4.1 新增 `frontend/src/workflow/shotImageWorkflow.ts`，收口分镜图片生成、持久化和结果绑定
- [x] 4.2 修改 `frontend/src/services/ShotGenerationService.ts`，让它只负责 prompt 构建和 `TTIRequest.references` 组装，不再自行承担任务与存储逻辑
- [x] 4.3 修改 `frontend/src/services/AssetGenerationService.ts`，移除残留媒体生成职责，统一委托到新的 workflow / service 边界
- [x] 4.4 修改 `frontend/src/workflow/characterAssetWorkflow.ts`，角色定妆照和预览视频都改走 `MediaGenerationService`
- [x] 4.5 修改 `frontend/src/workflow/scenePropAssetWorkflow.ts`，场景图、道具图、道具预览视频都改走 `MediaGenerationService`
- [x] 4.6 修改 `frontend/src/workflow/shotRenderWorkflow.ts`，显式传递 `primaryImage`、`additionalReferences`，并移除直接调用 TTS Provider 的逻辑
- [x] 4.7 修改 `frontend/src/providers/tts/TTSService.ts`，统一接管音色解析、缓存、持久化和结构化音频输出

## 5. Provider 契约统一

- [x] 5.1 修改 `frontend/src/providers/index.ts`，提供统一的项目级 Provider 解析入口，保证所有媒体入口遵循同一选择规则
- [x] 5.2 修改 `frontend/src/providers/tti/index.ts`，对齐新的 TTI Provider 注册与工厂签名
- [x] 5.3 修改 `frontend/src/providers/tti/ComfyUIProvider.ts`，切到 `TTIRequest` 和统一 task-snapshot 语义
- [x] 5.4 修改 `frontend/src/providers/tti/Gemini3ProProvider.ts`，切到 `TTIRequest` 和统一 task-snapshot 语义
- [x] 5.5 修改 `frontend/src/providers/tti/NanoBananaProvider.ts`，切到 `TTIRequest` 和统一 task-snapshot 语义
- [x] 5.6 修改 `frontend/src/providers/tti/OpenAICompatibleTTIProvider.ts`，切到 `TTIRequest` 和统一 task-snapshot 语义
- [x] 5.7 修改 `frontend/src/providers/itv/index.ts`，对齐新的 ITV Provider 注册与工厂签名
- [x] 5.8 修改 `frontend/src/providers/itv/Sora2Provider.ts`，接收 `ITVRequest.primaryImage + additionalReferences`，并返回统一任务快照
- [x] 5.9 修改 `frontend/src/providers/itv/RunwayProvider.ts`，接收 `ITVRequest.primaryImage + additionalReferences`，并返回统一任务快照
- [x] 5.10 修改 `frontend/src/providers/itv/KlingProvider.ts`，接收 `ITVRequest.primaryImage + additionalReferences`，并返回统一任务快照
- [x] 5.11 修改 `frontend/src/providers/itv/PikaProvider.ts`，接收 `ITVRequest.primaryImage + additionalReferences`，并返回统一任务快照
- [x] 5.12 修改 `frontend/src/providers/itv/CustomITVProvider.ts`，接收 `ITVRequest.primaryImage + additionalReferences`，并返回统一任务快照
- [x] 5.13 修改 `frontend/src/providers/itv/ComfyUIAnimateDiffProvider.ts`，接收 `ITVRequest.primaryImage + additionalReferences`，并返回统一任务快照
- [x] 5.14 修改 `frontend/src/providers/tts/index.ts`，对齐新的 TTS Provider 注册与工厂签名
- [x] 5.15 修改 `frontend/src/providers/tts/EdgeTTSProvider.ts`，输出统一音频结果并移除 `blob:` 直传到业务层的路径
- [x] 5.16 修改 `frontend/src/providers/tts/OpenAITTSProvider.ts`，输出统一音频结果
- [x] 5.17 修改 `frontend/src/providers/tts/FishAudioProvider.ts`，输出统一音频结果
- [x] 5.18 修改 `frontend/src/providers/tts/GPTSoVITSProvider.ts`，输出统一音频结果

## 6. UI 入口与项目级配置一致性

- [x] 6.1 修改 `frontend/src/components/editor/EditorView.tsx`，确保项目 `ttiConfigId` / `itvConfigId` / `ttsConfigId` 进入所有媒体入口
- [x] 6.2 修改 `frontend/src/components/storyboard/Storyboard.tsx`，移除渲染阶段对全局默认 ITV / TTS 的直接读取
- [x] 6.3 修改 `frontend/src/components/storyboard/ShotCard.tsx`，手动添加参考图时先保存为项目资产，不再把 `blob:` URL 直接写进 Shot
- [x] 6.4 修改 `frontend/src/components/asset/CharacterDetailPanel.tsx`，角色面板切到读取 `media.costumePhoto` / `media.previewVideo`
- [x] 6.5 修改 `frontend/src/components/asset/SceneDetailPanel.tsx`，场景面板切到读取 `media.previewImage`
- [x] 6.6 修改 `frontend/src/components/asset/PropDetailPanel.tsx`，道具面板切到读取 `media.previewImage` / `media.previewVideo`

## 7. 插件 SDK 边界

- [x] 7.1 修改 `packages/plugin-sdk/src/provider.ts`，增加媒体 Provider 契约版本字段和统一任务生命周期类型
- [x] 7.2 修改 `packages/plugin-sdk/src/tti.ts`，导出新的 `TTIRequest` / `ProviderStartResult` / `ProviderTaskSnapshot`
- [x] 7.3 修改 `packages/plugin-sdk/src/itv.ts`，导出新的 `ITVRequest` / `ProviderStartResult` / `ProviderTaskSnapshot`
- [x] 7.4 修改 `packages/plugins/seedream-tti-provider/src/index.tsx`，适配新的 SDK 契约
- [x] 7.5 修改 `packages/plugins/vectorengine-provider/src/index.tsx`，适配新的 SDK 契约

## 8. 数据链路验证

- [x] 8.1 验证项目恢复：Character / Scene / Prop / Shot / ShotVersion 运行时只消费 `media.*`，旧字段不再参与迁移或回写
- [x] 8.2 验证生图链路：分镜参考图、角色 / 场景 / 道具资产都能通过统一 `TTIRequest.references` 到达 Provider
- [x] 8.3 验证生视频链路：`additionalReferences` 真实进入 ITV Provider，请求重启后仍能根据 `ownerRef` 回写结果
- [x] 8.4 验证生语音链路：`shotRenderWorkflow` 不再直接调用 TTS Provider，`blob:` / `data:` 输出都能落盘为结构化音频资产
- [x] 8.5 验证项目级配置：Storyboard / Editor / Asset 面板所有入口都遵循“项目优先、全局默认兜底”规则
- [x] 8.6 验证插件边界：旧 SDK 插件快速失败，新 SDK 插件无需 `a || b || c` 兼容分支即可运行
