## Why

灵绘当前在预览、本地素材持久化、宫格切分和结果导出等路径上直接依赖 `electronService`。这让灵绘文件访问能力被桌面端实现细节绑死，也让测试只能通过大范围 mock Electron API 来维持运行。

## What Changes

- 引入通用 `FileSystemPort` 接口，抽象灵绘当前依赖的显示 URL、读写文件、复制、下载和目录选择能力
- 提供默认的 Electron 适配实现，以及用于测试的 Memory 实现
- 将灵绘核心文件访问路径切换到 `FileSystemPort`：本地预览 URL 解析、宫格切分输入落盘、结果导出写盘
- 为不支持目录选择或本地路径写入的运行时提供显式错误提示，避免静默假设 Electron 环境
- 将首版范围限制在灵绘链路，不在本轮引入 OPFS 落地，也不改造仓库内所有非灵绘服务

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 灵绘工作区需要通过可替换的文件系统端口完成本地预览、素材落盘和结果导出

## Impact

- Affected specs:
  - `linghui-studio`
- Affected code:
  - `frontend/src/services/` 下新增 `FileSystemPort` 抽象与实现
  - `frontend/src/components/linghui/linghuiExecutionShared.ts`
  - `frontend/src/components/linghui/linghuiResultExport.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `frontend/src/components/linghui/` 下若干预览 URL 解析组件
  - `frontend/src/components/linghui/` 下相关测试
