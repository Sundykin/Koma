# Tasks: add-official-media-providers

## Phase 1: 类型定义
- [x] 更新 TTIProviderType 添加 'nano-banana'
- [x] 更新 TTIProvider 接口支持异步任务模式 (checkProgress)
- [x] 更新 TTIOptions 添加 aspectRatio, imageSize, imageUrls
- [x] 更新 ITVOptions 添加 aspectRatio

## Phase 2: NanoBanana TTI Provider
- [x] 创建 `providers/tti/NanoBananaProvider.ts`
- [x] 实现 `validate()` - 校验 apiKey
- [x] 实现 `testConnection()` - 调用余额接口测试
- [x] 实现 `generateImage()` - 创建图片任务，返回 taskId
- [x] 实现 `checkProgress()` - 轮询任务状态，返回图片 URL
- [x] 在 `providers/tti/index.ts` 注册 NanoBananaProvider

## Phase 3: Sora2 ITV Provider 改造
- [x] 重写 `providers/itv/Sora2Provider.ts` 使用官方接口
- [x] 实现 `generate()` - 创建视频任务
- [x] 实现 `checkProgress()` - 轮询任务状态
- [x] 实现 `testConnection()` - 测试连接

## Phase 4: 隐藏第三方渠道
- [x] 修改 `globalStore.ts` TTI_PRESETS 仅保留 nano-banana
- [x] 修改 `globalStore.ts` ITV_PRESETS 仅保留 sora2
- [x] 保留原有 Provider 代码（不删除）

## Phase 5: 验证
- [x] TypeScript 编译通过
- [x] 更新 shotRenderWorkflow 支持异步任务模式
