## Context

不同剪辑软件使用不同的数据格式和坐标系统：
- **剪映 (CapCut)**: JSON 格式，微秒时间单位，坐标以画布中心为原点，使用「半画布宽/高」为单位
- **Premiere (XML/EDL)**: XML 格式，帧为时间单位，像素坐标
- **达芬奇 (DaVinci Resolve)**: XML/EDL/FCPXML 格式

本设计需要抽象出通用的导出框架，使得添加新格式时只需实现特定的转换器。

## Goals / Non-Goals

### Goals
1. **可扩展架构**: 通过接口抽象，支持未来添加新的导出格式
2. **坐标系统抽象**: 将坐标转换逻辑独立出来，不污染编辑器核心数据
3. **剪映导出**: 作为第一个具体实现，验证架构设计
4. **编辑器数据不变**: 所有转换在导出层完成

### Non-Goals
1. 不在本次实现 Premiere/达芬奇导出（但架构需支持）
2. 不支持导出关键帧动画（剪映关键帧结构复杂）
3. 不支持导出特效、滤镜、转场
4. 不修改现有编辑器数据结构

## Decisions

### 1. 导出器接口设计

**Decision**: 使用策略模式，定义统一的 `DraftExporter` 接口

```typescript
// 编辑器标准坐标系 (保持不变)
// - 原点: 画布中心
// - 单位: 像素
// - x: 正向右, y: 正向下
// - 时间: 秒

interface EditorCoordinate {
  x: number;      // 像素，相对画布中心
  y: number;      // 像素，相对画布中心
  scale: number;  // 1.0 = 原始大小
  rotation: number; // 角度，顺时针
  opacity: number;  // 0-1
}

interface DraftExporter {
  readonly format: string;          // 格式标识: 'jianying', 'premiere', etc.
  readonly displayName: string;     // 显示名称: '剪映草稿', 'Premiere Pro'
  readonly fileExtension: string;   // 文件扩展名或目录

  // 检查是否支持当前数据
  canExport(tracks: Track[], options: ExportOptions): boolean;

  // 执行导出
  export(
    tracks: Track[],
    options: ExportOptions,
    canvasSize: { width: number; height: number }
  ): Promise<ExportResult>;
}

interface ExportOptions {
  outputPath: string;
  projectName: string;
  fps: number;
  copyMaterials: boolean;
}

interface ExportResult {
  success: boolean;
  outputPath: string;
  warnings?: string[];
  error?: string;
}
```

### 2. 坐标转换器抽象

**Decision**: 每个导出器包含自己的坐标转换逻辑，但使用统一的接口

```typescript
interface CoordinateTransformer {
  // 编辑器坐标 → 目标软件坐标
  transformPosition(
    editorX: number,
    editorY: number,
    canvasWidth: number,
    canvasHeight: number
  ): { x: number; y: number };

  // 编辑器缩放 → 目标软件缩放
  transformScale(editorScale: number): { scaleX: number; scaleY: number };

  // 编辑器旋转 → 目标软件旋转
  transformRotation(editorRotation: number): number;

  // 编辑器透明度 → 目标软件透明度
  transformOpacity(editorOpacity: number): number;

  // 编辑器时间(秒) → 目标软件时间单位
  transformTime(seconds: number): number;
}
```

### 3. 剪映坐标系统分析

**剪映坐标系特点**（基于参考代码分析）:

```typescript
// 剪映 clip.transform 坐标系
// - 原点: 画布中心
// - 单位: 「半画布宽/高」(不是像素!)
// - x: -1 = 左边缘, 0 = 中心, 1 = 右边缘
// - y: -1 = 上边缘, 0 = 中心, 1 = 下边缘
// - 时间: 微秒 (1秒 = 1,000,000微秒)

class JianyingCoordinateTransformer implements CoordinateTransformer {
  transformPosition(
    editorX: number,
    editorY: number,
    canvasWidth: number,
    canvasHeight: number
  ): { x: number; y: number } {
    // 编辑器像素 → 剪映半画布单位
    return {
      x: editorX / (canvasWidth / 2),
      y: editorY / (canvasHeight / 2)
    };
  }

  transformTime(seconds: number): number {
    return Math.round(seconds * 1_000_000);
  }

  // ... 其他转换
}
```

### 4. 导出器注册表

**Decision**: 使用注册表模式管理所有导出器

```typescript
class ExporterRegistry {
  private exporters: Map<string, DraftExporter> = new Map();

  register(exporter: DraftExporter): void {
    this.exporters.set(exporter.format, exporter);
  }

  get(format: string): DraftExporter | undefined {
    return this.exporters.get(format);
  }

  getAll(): DraftExporter[] {
    return Array.from(this.exporters.values());
  }
}

// 初始化
const exporterRegistry = new ExporterRegistry();
exporterRegistry.register(new JianyingExporter());
// 未来: exporterRegistry.register(new PremiereExporter());
```

### 5. 剪映草稿目录结构

```
<草稿名称>/
├── draft_content.json    # 时间线数据
└── draft_meta_info.json  # 草稿元信息
```

### 6. 数据模型映射 (剪映)

| Koma 类型 | 剪映类型 | 转换说明 |
|-----------|----------|----------|
| Track (video) | tracks[] type="video" | 直接映射 |
| Track (audio) | tracks[] type="audio" | 直接映射 |
| Track (text) | tracks[] type="text" | 直接映射 |
| Clip.start (秒) | segment.target_timerange.start | ×1,000,000 |
| Clip.duration (秒) | segment.target_timerange.duration | ×1,000,000 |
| Clip.x (像素) | clip.transform.x | ÷(画布宽/2) |
| Clip.y (像素) | clip.transform.y | ÷(画布高/2) |
| Clip.scale | clip.scale.x/y | 直接使用 |
| Clip.rotation (度) | clip.rotation | 直接使用 |
| Clip.opacity (0-1) | clip.alpha | 直接使用 |

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 剪映版本更新导致格式不兼容 | 参考最新版本的草稿模板，保持与 v6.7+ 兼容 |
| 不同软件坐标系差异大 | 每个导出器实现独立的 CoordinateTransformer |
| 素材路径在不同系统间不兼容 | 提供"复制素材"选项 |
| 过度抽象增加复杂度 | 保持接口简洁，只抽象必要的部分 |

## Migration Plan

无需迁移，这是新增功能。

## Open Questions

1. **Q**: 未来是否需要支持导入草稿？
   **A**: 本次只实现导出，导入可作为后续功能，使用类似的 Importer 接口

2. **Q**: 是否需要支持更多格式（EDL, FCPXML）？
   **A**: 架构支持，但本次只实现剪映格式

3. **Q**: 关键帧动画是否需要导出？
   **A**: 初期不支持，剪映的关键帧结构与本项目差异较大
