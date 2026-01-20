## 1. 导出框架基础设施

- [x] 1.1 创建 `frontend/src/services/draftExport/` 目录
- [x] 1.2 创建 `types.ts` - 定义 DraftExporter、CoordinateTransformer、ExportOptions、ExportResult 接口
- [x] 1.3 创建 `coordinateTransform.ts` - 定义坐标转换基类和工具函数
- [x] 1.4 创建 `ExporterRegistry.ts` - 实现导出器注册表
- [x] 1.5 创建 `index.ts` - 导出模块入口

## 2. 剪映导出器实现

- [x] 2.1 创建 `frontend/src/types/jianying.ts` - 定义剪映草稿 TypeScript 类型
  - DraftContent, DraftMetaInfo
  - JianyingTrack, JianyingSegment
  - JianyingMaterial (video/audio/text)
  - JianyingTimerange, JianyingClipSettings

- [x] 2.2 创建 `JianyingCoordinateTransformer.ts` - 剪映坐标转换器
  - 像素 → 半画布单位
  - 秒 → 微秒
  - 透明度、缩放、旋转转换

- [x] 2.3 创建 `JianyingExporter.ts` - 剪映导出器主类
  - 实现 DraftExporter 接口
  - convertTracks() - Track[] → JianyingTrack[]
  - convertClip() - Clip → JianyingSegment
  - extractMaterials() - 提取素材列表
  - generateDraftContent() - 生成 draft_content.json
  - generateDraftMetaInfo() - 生成 draft_meta_info.json
  - export() - 主导出流程

## 3. 工具函数

- [x] 3.1 ID 生成函数 (UUID 格式，与剪映一致)
- [x] 3.2 草稿模板加载（基于参考代码的 template JSON）
- [x] 3.3 素材路径处理（绝对路径转换、可选复制）

## 4. 导出对话框集成

- [x] 4.1 修改 `SimpleExportDialog.tsx`
  - 添加导出类型选择（视频 / 草稿）
  - 添加草稿格式选择（剪映 / 未来更多）
  - 根据选择显示不同的选项面板

- [x] 4.2 剪映草稿导出选项面���
  - 草稿名称输入
  - 输出目录选择
  - 是否复制素材选项

- [x] 4.3 实现导出流程
  - 调用 ExporterRegistry 获取导出器
  - 执行导出并显示进度
  - 显示结果（成功/警告/错误）

## 5. 测试与验证

- [ ] 5.1 单元测试：坐标转换正确性
- [ ] 5.2 单元测试：时间单位转换
- [ ] 5.3 集成测试：导出草稿并在剪映中打开验证
- [ ] 5.4 验证不同素材类型兼容性（视频、图片、音频、文本）
