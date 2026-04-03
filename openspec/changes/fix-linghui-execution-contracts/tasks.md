## 1. Multi-Angle Image Contracts

- [x] 1.1 更新图片节点执行逻辑，显式开启多角度时缺少上游参考图必须失败，不再静默回退为普通文生图
- [x] 1.2 更新多角度提示词编译与 provider 请求，保留用户原始 prompt 并与角度 prompt 一起参与请求
- [x] 1.3 调整共享参考图收集逻辑，让批量图片结果完整透传给下游节点，并保持主图优先

## 2. Script Output Contracts

- [x] 2.1 调整脚本节点生成态的 system prompt 拼装方式，保留 JSON 结构化输出约束，同时追加用户自定义说明
- [x] 2.2 调整手动脚本节点的静态解析逻辑，使 `resolveTargetsOnly` 路径下也能输出 `formattedText` 与 `shots`
- [x] 2.3 清理脚本纯文本解析中的重复调用，确保统一解析路径更易维护

## 3. Validation

- [x] 3.1 更新多角度执行与 provider 测试，验证不再静默降级且保留原始 prompt
- [x] 3.2 补充批量图片引用与静态脚本解析测试，覆盖下游消费场景
- [x] 3.3 运行目标 `vitest` 用例确认本轮修复通过
