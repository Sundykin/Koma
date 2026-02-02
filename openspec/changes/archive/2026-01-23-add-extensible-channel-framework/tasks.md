## 1. 新渠道实现（优先）

### 1.1 Gemini-3-Pro 文生图
- [x] 1.1.1 创建 `Gemini3ProProvider.ts` 实现 TTIProvider 接口
- [x] 1.1.2 实现 `generateImage()` 方法调用 `/v1/images/generations`
- [x] 1.1.3 实现 `checkProgress()` 方法调用 `/v1/images/generations/{task_id}`
- [x] 1.1.4 在 TTI_PRESETS 中添加 gemini-3-pro 预设
- [x] 1.1.5 更新 TTI 配置 UI 支持新渠道

### 1.2 Sora2 视频生成增强
- [x] 1.2.1 更新 `Sora2Provider.ts` 支持新的 API 端点
- [x] 1.2.2 实现角色引用参数（character_url）
- [x] 1.2.3 实现风格参数（metadata.style）
- [x] 1.2.4 实现故事板参数（metadata.storyboard）
- [x] 1.2.5 更新查询接口路径为 `/v1/videos/generations/{task_id}`

### 1.3 角色提取（完整实现）
- [x] 1.3.1 实现 `extractCharacter()` 方法调用 `/v1/videos/generations`
- [x] 1.3.2 **新增** `checkCharacterProgress()` 方法调用 `/v1/characters_tasks/{task_id}`
- [x] 1.3.3 解析角色创建结果（id, username, display_name）
- [x] 1.3.4 更新 ITV types 支持角色提取状态轮询
- [x] 1.3.5 导出 CharacterProgressInfo 类型

### 1.4 视频混音
- [x] 1.4.1 实现 `remixVideo()` 方法调用 `/v1/videos/{video_id}/remix`
- [x] 1.4.2 复用视频任务查询接口获取混音结果
- [x] 1.4.3 导出 RemixOptions 类型
- [x] 1.4.4 实现混音参数配置 UI（prompt、duration、aspect_ratio）

## 2. 可扩展渠道框架

### 2.1 核心框架
- [x] 2.1.1 创建 `providers/channel/types.ts` 定义 ChannelConfig 类型
- [x] 2.1.2 创建 `providers/channel/templateEngine.ts` 实现模板替换
- [x] 2.1.3 创建 `providers/channel/jsonPathResolver.ts` 实现 JSONPath 解析
- [x] 2.1.4 创建 `providers/channel/ConfigurableProvider.ts` 通用 Provider

### 2.2 配置管理
- [x] 2.2.1 导出渠���配置类型和工具函数
- [x] 2.2.2 提供 CHANNEL_TEMPLATES 预设模板
- [x] 2.2.3 实现配置验证逻辑
- [x] 2.2.4 创建渠道配置编辑 UI（JSON 编辑器 + 表单模式）

### 2.3 集成
- [x] 2.3.1 更新 Provider 工厂函数支持新渠道
- [x] 2.3.2 在渠道选择下拉框中显示新渠道
- [x] 2.3.3 实现自定义渠道的连接测试

## 3. 测试与文档

### 3.1 测试
- [ ] 3.1.1 测试 Gemini-3-Pro 文生图完整流程
- [ ] 3.1.2 测试 Sora2 视频生成（含角色引用）
- [ ] 3.1.3 测试角色提取及状态查询
- [ ] 3.1.4 测试视频混音功能
- [ ] 3.1.5 测试自定义渠道配置

### 3.2 文档
- [x] 3.2.1 更新渠道配置说明文档
- [x] 3.2.2 编写自定义渠道配置示例
