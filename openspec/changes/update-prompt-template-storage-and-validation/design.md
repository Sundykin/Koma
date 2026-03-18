## Context

当前模板系统的默认模板定义、模板持久化、模板解析和模板消费分散在多个模块中：

- 默认模板定义在 `frontend/src/store/promptTemplates.ts`
- 自定义模板持久化在 `prompt-templates.json`
- 普通全局设置持久化在 `settings.json`
- 多个业务链路自行决定是否读取模板、是否 fallback 到硬编码

这导致同一类配置同时存在两个全局来源，也导致模板编辑后的实际生效范围不透明。

## Goals

- 将自定义 Prompt 模板存储统一到 `settings.json`
- 将模板变量约束从“文档约定”升级为“代码校验”
- 建立统一的模板解析入口，防止未替换变量进入模型调用
- 打通当前关键死链模板

## Non-Goals

- 不对历史分镜/资产记录做批量 prompt 迁移
- 不一次性重构全部旧服务与全部 LLM 硬编码 prompt

## Decision 1: 模板 overrides 只存入 settings.json

### Chosen

在 `AppSettings` 中新增 `promptTemplates` 字段，仅保存用户自定义 override，而不是复制完整默认模板：

```json
{
  "promptTemplates": {
    "tti_shot_image": {
      "template": "...",
      "updatedAt": 1730000000000
    }
  }
}
```

### Why

- `settings.json` 已经是全局配置真源，适合承载模板设置
- override-only 结构能避免把 `name/description/variables` 等默认元数据重复写入磁盘
- 后续若做设置备份、导入导出或 UI 状态同步，单一来源更稳定

### Rejected

- 继续使用独立 `prompt-templates.json`
  - 缺点：全局配置分裂，迁移和调试复杂
- 把完整模板对象写入 `settings.json`
  - 缺点：冗余大，默认元数据与代码定义容易漂移

## Decision 2: 模板变量校验分为“保存时校验”和“运行时校验”

### Template Contract

为每个模板定义契约元数据：

- `allowedVariables`: 允许出现的变量
- `requiredVariables`: 必须出现在模板中的变量

示例：

- `tti_shot_image`
  - allowed: `stylePrefix`, `description`, `shotType`, `emotion`
  - required: `stylePrefix`, `description`
- `itv_character_motion`
  - allowed: `stylePrefix`, `characterName`, `action`
  - required: `stylePrefix`, `characterName`

### Save-time Validation

用户保存模板时：

- 提取模板内所有 `{{variable}}`
- 若出现未声明变量，拒绝保存
- 若缺失必需变量，拒绝保存
- 返回结构化错误：
  - `unknownVariables`
  - `missingRequiredVariables`

### Runtime Validation

业务侧解析模板时：

- 校验传入变量集合是否覆盖 `requiredVariables`
- `fillTemplate()` 后再次扫描是否还有未替换的 `{{...}}`
- 若仍有未替换变量，直接抛错并阻断模型调用

### Why

仅在编辑器层做校验不够，因为旧数据、迁移数据、手工改文件和代码调用错误都可能绕过 UI。

## Decision 3: 新增统一模板解析入口

新增统一 resolver，业务模块不再直接裸调“读模板 + 替换字符串”：

- `loadPromptTemplates()`
- `validatePromptTemplateDraft(templateId, templateText)`
- `resolvePromptTemplate(templateId, variables)`

`resolvePromptTemplate()` 负责：

- 合并默认模板与 settings override
- 校验变量契约
- 执行变量替换
- 检测未替换占位符
- 返回模板来源信息（default/custom）

## Decision 4: 保留历史分镜 prompt 为定稿结果

### Rule

对于分镜类记录：

- 若 `shot.imagePrompt` 已存在，文生图渲染继续直接使用它
- 若 `shot.videoPrompt` 已存在，图生视频渲染继续直接使用它
- 模板修改只影响“下一次重新生成 prompt”或“无现成 prompt 的 fallback 渲染”

### Why

这符合当前数据模型，也避免模板修改意外改写历史定稿内容。

## Decision 5: 打通关键死链模板

本次只修正直接影响用户感知的三条链路：

- `tti_shot_image` -> `ShotGenerationService`
- `itv_character_motion` -> `generateCharacterPreviewVideo`
- `itv_prop_motion` -> `generatePropPreviewVideo`

其他历史硬编码 Prompt 记录为后续治理项。

## Migration Plan

### Electron

应用启动或首次读取模板时：

1. 读取 `settings.json.promptTemplates`
2. 若检测到旧 `prompt-templates.json`
3. 将旧 override 合并进 `settings.json.promptTemplates`
4. 若同一模板同时存在，以 `settings.json` 为准
5. 写回 `settings.json`
6. 将旧文件重命名为 `prompt-templates.json.bak` 或清理

### Browser

1. 读取 `localStorage[koma_prompt_templates]`
2. 迁移到 `settings` 存储键中的 `promptTemplates`
3. 清理旧模板键

## Risks

- 迁移逻辑若处理不当，可能丢失用户自定义模板
- 必需变量规则过严可能导致部分已有自定义模板首次保存失败
- 新增模板 `itv_prop_motion` 后需要同步 UI 可编辑列表与默认定义

## Verification

- 旧模板文件存在时能自动迁移到 `settings.json`
- 保存非法模板时 UI 能拿到精确的变量错误
- 渲染分镜图片时 fallback 真实读取 `tti_shot_image`
- 生成角色/道具预览视频时真实读取 ITV 模板
- provider 调用前不存在未替换的 `{{variable}}`
