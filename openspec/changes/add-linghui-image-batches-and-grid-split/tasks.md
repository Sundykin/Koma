## 1. Spec And Data Model

- [x] 1.1 为图片节点补充多图集合、主图和宫格切分的 spec delta
- [x] 1.2 扩展图片节点类型定义，兼容旧单图属性与新集合结构
- [x] 1.3 提供统一的图片集合解析 helper，供节点 UI、提示词引用和执行链路复用

## 2. Image Node Collection Experience

- [x] 2.1 重构 `ImageNodeEditor`，支持最多四张图片的导入、移除、主图切换和比例校验
- [x] 2.2 调整生成模式，让图片节点支持最多四张生成结果与主图切换
- [x] 2.3 重构 `ImageNode` 卡片，在有图时直接展示图片，多图时支持展开平铺动画

## 3. Downstream Consumption Rules

- [x] 3.1 更新提示词引用构建逻辑，让图片节点只暴露主图
- [x] 3.2 更新执行链路，让下游图片/视频节点只消费图片节点主图
- [x] 3.3 补齐节点预览、上游输入展示与结果展示中的主图解析

## 4. Grid Split Tool

- [x] 4.1 为图片节点增加宫格切分工具，支持 4 / 9 / 16 / 25 宫格布局与多选
- [x] 4.2 扩展 FFmpeg IPC，支持 NxN 图片切分与切块高清化输出
- [x] 4.3 在切分完成后自动在画布中创建对应数量的导入图片节点

## 5. Validation

- [x] 5.1 运行 `openspec validate add-linghui-image-batches-and-grid-split --strict`
- [x] 5.2 运行 `pnpm -s exec tsc --noEmit --pretty false -p frontend/tsconfig.json`
- [ ] 5.3 验证多图导入、主图切换、下游引用与宫格切分节点生成链路
