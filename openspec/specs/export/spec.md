# export Specification

## Purpose
TBD - created by archiving change export-editors. Update Purpose after archive.
## Requirements
### Requirement: Export Framework
系统 SHALL 提供统一的导出框架支持多种编辑器格式。

#### Scenario: 选择导出格式
- **WHEN** 用户点击「导出」
- **THEN** 显示格式选择对话框
- **AND** 可选剪映、Premiere、DaVinci、EDL
- **AND** 显示各格式支持的功能说明

#### Scenario: 配置导出选项
- **WHEN** 选择格式后
- **THEN** 显示格式特定选项：
  - 输出目录选择
  - 素材打包方式（复制/链接）
  - 路径类型（相对/绝对）
  - 帧率/分辨率覆盖

#### Scenario: 执行导出
- **WHEN** 确认导出配置
- **THEN** 显示导出进度
- **AND** 完成后显示导出报告
- **AND** 报告包含成功/警告/错误统计

### Requirement: Jianying Export
系统 SHALL 支持导出剪映草稿格式。

#### Scenario: 生成草稿结构
- **WHEN** 导出为剪映格式
- **THEN** 在输出目录创建：
  - draft_content.json
  - draft_meta_info.json
  - resources/ 素材目录

#### Scenario: 视频轨道映射
- **WHEN** 处理视频轨道时
- **THEN** 转换 Track → 剪映轨道
- **AND** 转换 Clip → 剪映片段
- **AND** 保留时间位置和持续时间

#### Scenario: 字幕映射
- **WHEN** 处理文字轨道时
- **THEN** 转换为剪映文字素材
- **AND** 保留字体/颜色/位置
- **AND** 不支持的样式记录警告

### Requirement: Premiere XML Export
系统 SHALL 支持导出 FCP XML 7 格式。

#### Scenario: 生成 XML 结构
- **WHEN** 导出为 Premiere 格式
- **THEN** 生成标准 XMEML 格式
- **AND** 包含 sequence、media、track 结构

#### Scenario: 关键帧导出
- **WHEN** 片段包含关键帧动画
- **THEN** 转换位置/缩放/旋转/透明度
- **AND** 缓动曲线近似为贝塞尔
- **AND** 不支持的属性记录警告

#### Scenario: 素材引用
- **WHEN** 处理媒体文件时
- **THEN** 生成 file 元素引用
- **AND** 路径根据配置使用相对/绝对

### Requirement: EDL Export
系统 SHALL 支持导出 CMX 3600 EDL 格式。

#### Scenario: 生成 EDL 文件
- **WHEN** 导出为 EDL 格式
- **THEN** 生成标准 CMX 3600 格式
- **AND** 包含 TITLE 和 FCM 头信息

#### Scenario: 剪辑点输出
- **WHEN** 处理视频片段时
- **THEN** 输出入点/出点时间码
- **AND** 添加 FROM CLIP NAME 注释

#### Scenario: 多轨道处理
- **WHEN** 存在多个视频轨道
- **THEN** 展平为单轨序列
- **AND** 按时间顺序排列
- **AND** 记录轨道信息丢失警告

### Requirement: Subtitle Export
系统 SHALL 支持导出字幕文件。

#### Scenario: SRT 导出
- **WHEN** 导出 SRT 格式
- **THEN** 提取所有文字轨道
- **AND** 格式化为 SRT 时间码和文本

#### Scenario: ASS 导出
- **WHEN** 导出 ASS 格式
- **THEN** 包含样式定义
- **AND** 保留字体/颜色/位置信息

### Requirement: Resource Management
系统 SHALL 处理导出资源文件。

#### Scenario: 素材复制
- **WHEN** 选择复制素材模式
- **THEN** 复制所有引用的媒体文件
- **AND** 按类型分类存放
- **AND** 更新引用路径

#### Scenario: 路径重写
- **WHEN** 选择相对路径模式
- **THEN** 计算相对于工程文件的路径
- **AND** 处理跨平台路径分隔符

---

# Reference: Data Structures

### ExportOptions
```typescript
interface ExportOptions {
  format: ExportFormat;
  outputDir: string;
  projectName: string;
  copyResources: boolean;     // 复制素材到导出目录
  relativePaths: boolean;     // 使用相对路径
  frameRate: number;          // 目标帧率
  resolution?: { w: number; h: number };
}

type ExportFormat = 'jianying' | 'premiere' | 'davinci' | 'edl' | 'srt' | 'ass';
```

### ExportResult
```typescript
interface ExportResult {
  success: boolean;
  outputPath: string;
  resources: ExportedResource[];
  warnings: ExportWarning[];
  errors: ExportError[];
}

interface ExportWarning {
  type: 'unsupported_feature' | 'approximated' | 'skipped';
  message: string;
  clipId?: string;
}
```

