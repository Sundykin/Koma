# Change: Add Pluggable Image Hosting And RemoteUrl Normalization

## Why
当前媒体链路已经完成了 request-based “收口”（`MediaGenerationService` + `StoredMediaAsset{localPath, remoteUrl}`），但在实际运行中仍存在关键缺口：

1. **生成结果没有 remoteUrl**：部分 TTI Provider 返回 `data:`/base64（或仅落盘的本地路径），导致后续“参考图生图 / 图生视频”只能走 data-url 或错误地拼接本地路径。
2. **远程服务不接受本地路径**：ITV 自定义服务等远程端只接受可访问的 URL（或体积可控的 base64），本地路径无法被服务端读取。
3. **图床能力不可热插拔**：项目需要可切换/可并存多个“图床服务”，并且不希望在 workflow/provider 中散落兼容分支。

## What Changes
本变更将引入“远程地址规范化”的统一策略，并把图床定义为可热插拔的 `image-hosting` Provider：

1. **新增 image-hosting Provider 合同**（热插拔）：
   - 通过 `channelConfig` + `ProviderRegistry(kind='image-hosting')` 选择默认图床渠道。
   - Provider 接收 bytes（或 ArrayBuffer）并返回 URL，避免业务层处理各图床协议差异。

2. **新增 RemoteUrlService（收口点）**：
   - 将 `StoredMediaAsset` 或 `MediaAssetSource`（localPath/data-url/blob/remote）规范化为可用于远程调用的来源。
   - 在需要远程引用的场景中，优先产出 `remoteUrl`，避免大 payload data-url。

3. **在 MediaGenerationService 统一接入（单点接入，不扩散）**：
   - TTI 输出落盘后：若缺失 `remoteUrl` 且图床启用，则自动上传并回写 `remoteUrl` 后再绑定到项目数据。
   - ITV 调用前：对 `primaryImage`（及可选 refs）执行“确保 remoteUrl”策略，再进入 `mediaAssetResolver` 做最终 `ProviderAssetInput` 收口。

4. **清理遗留的图床配置入口**：
   - 移除未被使用的 `store/settings/imageHostingConfig.ts`（旧 imageHostingConfig 模式），避免两套配置并存。

## Non-Goals
1. 不修改现有 TTI/ITV/TTS 的 provider lifecycle 合同（仍保持 start/snapshot）。  
2. 不在 `mediaAssetResolver` 中引入“上传图床”副作用逻辑（保持其为纯解析/转换层）。  
3. 不强制所有图片都必须上传图床：具体策略由 `RemoteUrlService` 参数决定（best-effort / required）。  

## Impact
- Affected specs:
  - `model-providers`：新增 `image-hosting` Provider 类型与注册约束。
  - `storage`：生成图片/参考图片的 `remoteUrl` 补齐规则。
  - `asset-generation`：TTI references 的 remoteUrl 规范化。
  - `itv`：ITV primary/reference 图片的 remoteUrl 规范化策略。
- Affected code:
  - `frontend/src/services/MediaGenerationService.ts`
  - `frontend/src/services/imageHostingService.ts`（将转为 orchestrator：选择 provider + upload）
  - `frontend/src/services/mediaRemoteUrlService.ts`（新增）
  - `frontend/src/providers/registry.types.ts`、`frontend/src/providers/index.ts`（补齐 image-hosting 选择/创建）
  - `frontend/src/store/settings/imageHostingConfig.ts`（删除）
  - `packages/plugins/scdn-image-hosting/src/index.tsx`（注册真实 factory，以支持热插拔调用）

## Risks
- 隐私与合规：图片上传到第三方图床属于外发数据，需要明确默认开关与提示文案。
- 可靠性：图床不可用时的降级策略需要明确（best-effort vs fail-fast）。
- 一致性：remoteUrl 回写必须发生在“绑定到项目数据”之前，避免 shot.images/references 追加重复项。

## Open Questions
1. ITV 远程服务是否 **强制要求 http(s) URL**（不接受 data-url）？
2. 图床上传失败时默认策略：best-effort 继续，还是阻断并提示用户启用图床？

