# Tasks: refactor-unified-channel-config

## 1. 类型系统更新

### 1.1 定义新的统一渠道配置类型
- [ ] 1.1.1 创建 `UnifiedChannelConfig` 接口
- [ ] 1.1.2 创建 `EndpointPair` 接口
- [ ] 1.1.3 创建 `getCapabilities()` 辅助函数
- [ ] 1.1.4 更新 `AppSettings` 类型，添加 `unifiedChannels` 字段

### 1.2 数据迁移
- [ ] 1.2.1 实现 `migrateChannelConfigs()` 迁移函数
- [ ] 1.2.2 在 `loadSettings()` 中调用迁移逻辑
- [ ] 1.2.3 添加迁移版本标记避免重复迁移

## 2. Provider 层更新

### 2.1 ConfigurableProvider 增强
- [ ] 2.1.1 支持新的 `UnifiedChannelConfig` 格式
- [ ] 2.1.2 实现 `executeEndpoint(pair, context)` 通用方法
- [ ] 2.1.3 实现 `checkEndpointProgress(pair.query, taskId)` 通用方法
- [ ] 2.1.4 添加角色提取支持：`extractCharacter()` 和 `checkCharacterProgress()`
- [ ] 2.1.5 添加混音支持：`remixVideo()`

### 2.2 工厂函数更新
- [ ] 2.2.1 更新 TTI 工厂函数支持 `UnifiedChannelConfig`
- [ ] 2.2.2 更新 ITV 工厂函数支持 `UnifiedChannelConfig`

## 3. Store 层更新

### 3.1 globalStore 更新
- [ ] 3.1.1 添加 `addUnifiedChannel()`
- [ ] 3.1.2 添加 `updateUnifiedChannel()`
- [ ] 3.1.3 添加 `deleteUnifiedChannel()`
- [ ] 3.1.4 添加 `getUnifiedChannelsByCapability(capability)`
- [ ] 3.1.5 添加 `testUnifiedChannel(config, capability)`

## 4. UI 组件更新

### 4.1 TTIConfigManager 整合
- [ ] 4.1.1 服务商下拉框添加"自定义渠道"选项
- [ ] 4.1.2 实现自定义渠道配置表单（内嵌 Modal）
- [ ] 4.1.3 渲染自定义渠道卡片（带"自定义"标签）
- [ ] 4.1.4 自定义渠道的编辑/删除/测试操作

### 4.2 ITVConfigManager 整合
- [ ] 4.2.1 服务商下拉框添加"自定义渠道"选项
- [ ] 4.2.2 实现自定义渠道配置表单
- [ ] 4.2.3 能力勾选：☑图生视频 ☐角色提取 ☐视频混音
- [ ] 4.2.4 根据勾选的能力动态显示接口配置区域
- [ ] 4.2.5 渲染自定义渠道卡片

### 4.3 移除独立的 CustomChannelManager Tab
- [ ] 4.3.1 从 SettingsPage 移除"自定义渠道"Tab
- [ ] 4.3.2 删除或标记废弃 `CustomChannelManager.tsx`

### 4.4 设置页面宽度优化
- [ ] 4.4.1 修改 SettingsPage 的 `max-width` 为 1200px
- [ ] 4.4.2 添加响应式断点支持

## 5. 测试与验证

### 5.1 功能测试
- [ ] 5.1.1 测试新建自定义 TTI 渠道
- [ ] 5.1.2 测试新建自定义 ITV 渠道（含角色提取）
- [ ] 5.1.3 测试数据迁移（旧 ChannelConfig → UnifiedChannelConfig）
- [ ] 5.1.4 测试渠道连接测试功能
- [ ] 5.1.5 测试实际图片/视频生成流程

### 5.2 UI 测试
- [ ] 5.2.1 验证设置页面宽度
- [ ] 5.2.2 验证自定义渠道卡片显示
- [ ] 5.2.3 验证能力勾选联动

## 6. 文档更新

- [ ] 6.1 更新 design.md 中的渠道配置说明
- [ ] 6.2 更新配置示例
