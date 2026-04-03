## Why

灵绘已经支持把选中的子图保存为“工作流模板”，但模板库目前只是一组用户快照，没有系统级 Recipe 预设，也没有区分“内置配方”和“工作区自建模板”的元数据。这让 5.2.4 所要求的模板层无法落在现有能力之上继续演化。

## What Changes

- 为灵绘工作流模板记录补充来源与类型元数据，区分系统 Recipe 和工作区保存模板
- 新增首批系统内置 Recipe 模板：角色设计流、分镜创作流、配音工作流
- 让模板库读取逻辑同时返回内置 Recipe 与工作区模板，并优先展示系统 Recipe
- 调整灵绘模板抽屉展示，显式呈现模板来源、配方标签和描述，同时继续复用现有“发送到画布”插入协议
- 保持“保存为工作流”行为不变，但将其标准化为 `workspace` 来源的模板记录

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 工作流模板库需要支持 Recipe Layer 的系统预设模板与模板来源元数据

## Impact

- Affected specs:
  - `linghui-studio`
- Affected code:
  - `frontend/src/store/linghuiStorage.ts`
  - `frontend/src/components/linghui/LinghuiLibraryDrawer.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/` 下新增 Recipe 模板定义文件
  - `frontend/src/store/linghuiStorage.test.ts`
