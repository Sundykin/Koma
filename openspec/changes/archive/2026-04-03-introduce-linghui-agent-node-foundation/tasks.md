## 1. Change Artifacts

- [x] 1.1 为 agent 节点 foundation 补齐 proposal / design / spec，明确首版能力边界

## 2. Node Foundation

- [x] 2.1 扩展灵绘类型系统、节点定义和节点注册，新增 `linghui/agent` 节点与默认属性
- [x] 2.2 新增 agent 节点卡片与编辑器，支持提示词、系统提示、工具选择、LLM 选择和最大迭代数配置

## 3. Execution Integration

- [x] 3.1 在执行 providers 中封装基于 `chatIPC` 的 Agent 执行 helper，支持文本/图片输入、工具轨迹收集和迭代上限
- [x] 3.2 在执行器、导出与相关节点流程中接入 agent 节点结果

## 4. Validation

- [x] 4.1 补充 agent 节点执行与 provider 映射的定向测试
- [x] 4.2 运行定向 `vitest` 与类型检查，记录验证结果
