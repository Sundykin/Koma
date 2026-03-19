## 1. Spec And Data Model

- [x] 1.1 在 `AppSettings` 中定义 `promptTemplates` override 结构
- [x] 1.2 为模板定义变量契约元数据（allowed/required）
- [x] 1.3 为道具预览视频补充新的模板 ID 与默认模板

## 2. Storage And Migration

- [x] 2.1 将模板 overrides 的读取/保存迁移到 `settings.json`
- [x] 2.2 实现 `prompt-templates.json` -> `settings.json` 的迁移逻辑
- [x] 2.3 实现浏览器本地模板存储到 settings 的迁移逻辑

## 3. Validation And Resolver

- [x] 3.1 实现模板草稿保存校验（未知变量、缺失必需变量）
- [x] 3.2 实现运行时模板解析校验（缺失变量、未替换占位符）
- [x] 3.3 在 Prompt Studio 中展示结构化校验错误

## 4. Runtime Wiring

- [x] 4.1 将 `tti_shot_image` 接入分镜文生图 fallback
- [x] 4.2 将 `itv_character_motion` 接入角色预览视频
- [x] 4.3 将 `itv_prop_motion` 接入道具预览视频
- [x] 4.4 为关键 AI 调用日志补充 `templateId` / `promptSource`（default/custom/finalized）

## 5. Verification

- [ ] 5.1 验证迁移后模板只写入 `settings.json`
- [ ] 5.2 验证非法变量模板无法保存
- [ ] 5.3 验证运行时不会把未替换变量发给 provider
- [ ] 5.4 验证三条修复链路的模板修改可被实际调用消费
