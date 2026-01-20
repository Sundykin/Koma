## Context
Phase 1 建立了完整的时间线数据结构（Track、Clip、Keyframe）。本提案实现向主流编辑软件的导出，打通 AI 生成与传统后期工作流。

## Goals / Non-Goals

**Goals:**
- 导出剪映草稿格式
- 导出 Premiere Pro XML
- 导出 DaVinci Resolve 兼容格式
- 导出通用 EDL
- 素材资源打包

**Non-Goals:**
- 不实现从其他编辑器导入
- 不支持复杂特效/转场的导出
- 不保证关键帧动画 100% 还原

## Decisions

### 1. 剪映草稿格式
**Rationale:**
- 剪映是国内最流行的视频编辑工具
- 草稿格式为 JSON，易于生成
- 支持轨道、片段、字幕、贴纸

**Structure:**
```
{exportDir}/
├── draft_content.json    # 剪映草稿主文件
├── draft_meta_info.json  # 元数据
└── resources/
    ├── videos/
    ├── audios/
    └── images/
```

**Key Mappings:**
```typescript
interface JianyingDraft {
  id: string;
  name: string;
  materials: {
    videos: JianyingVideo[];
    audios: JianyingAudio[];
    texts: JianyingText[];
  };
  tracks: JianyingTrack[];
}
```

### 2. Premiere Pro XML (FCP XML 7)
**Rationale:**
- 行业标准交换格式
- PR、FCPX、Resolve 均支持
- 结构化程度高

**Key Elements:**
- `<sequence>` → 时间线
- `<video>` / `<audio>` → 轨道
- `<clipitem>` → 片段
- `<file>` → 素材引用
- `<keyframe>` → 关键帧（有限支持）

### 3. EDL (Edit Decision List)
**Rationale:**
- 最简单的交换格式
- 几乎所有编辑器支持
- 仅包含剪辑点，无特效

**Format:**
```
TITLE: PROJECT_NAME
FCM: NON-DROP FRAME

001  AX       V     C        00:00:00:00 00:00:05:00 00:00:00:00 00:00:05:00
* FROM CLIP NAME: shot_001.mp4
```

### 4. 关键帧转换策略
**Rationale:**
- 不同编辑器关键帧系统差异大
- 需要近似转换或降级

**Strategy:**
- 位置/缩放/旋转/透明度：直接映射
- 缓动曲线：线性/贝塞尔近似
- 不支持的属性：忽略并记录警告

### 5. 资源路径处理
```typescript
interface ExportOptions {
  format: 'jianying' | 'premiere' | 'davinci' | 'edl';
  outputDir: string;
  copyResources: boolean;  // 是否复制素材
  relativePaths: boolean;  // 使用相对路径
  includeCache: boolean;   // 是否包含缓存文件
}
```

## Risks / Trade-offs

1. **风险**: 剪映草稿格式可能变化（非公开 API）
   - **缓解**: 版本检测，提供兼容性选项

2. **风险**: 关键帧动画无法完美还原
   - **缓解**: 导出报告列出不支持的功能

3. **风险**: 大项目导出耗时
   - **缓解**: 显示进度，支持取消

## Open Questions

1. 是否支持 Final Cut Pro 原生格式？
   - 当前计划：通过 XML 间接支持

2. 字幕导出使用 SRT 还是嵌入轨道？
   - 当前计划：两者都支持，用户可选
