## 1. Spec
- [x] 1.1 新增 `update-builtin-prompt-template-objective-rules` proposal、design 与 spec delta
- [x] 1.2 在 `prompt-templates` 规范中补充变量元数据、客观视觉规则、视频时间片段规则
- [x] 1.3 在 `script-generation` 规范中移除 `random_idea_generation` 模板要求

## 2. Prompt Template Core
- [x] 2.1 将 `PromptTemplate.variables` 升级为结构化变量元数据
- [x] 2.2 删除 `random_idea_generation` 模板类型与默认模板定义
- [x] 2.3 更新内置角色/场景/道具/分镜图片/分镜视频模板文案
- [x] 2.4 更新模板校验与解析逻辑，使其基于变量元数据工作

## 3. Prompt Studio
- [x] 3.1 在模板设置页展示变量名、含义、格式、示例
- [x] 3.2 确保废弃模板不再出现在模板列表中

## 4. Workflow 收口
- [x] 4.1 清理 `scriptGenerator.ts` 对 `random_idea_generation` 的直接依赖
- [x] 4.2 为角色、场景、道具生图改用标准化视觉变量构建
- [x] 4.3 为分镜图片 fallback 改用客观视觉事实变量
- [x] 4.4 为分镜视频 fallback 改用时间片段化变量

## 5. Verification
- [x] 5.1 运行 OpenSpec 校验
- [x] 5.2 运行 TypeScript / 前端构建校验
- [x] 5.3 抽查关键模板渲染结果，确认不再复述剧情
