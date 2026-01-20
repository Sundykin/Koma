# Design: enhance-jianying-export

## Overview

本设计文档描述增强剪映草稿导出功能的技术架构，包括目录结构修复、高级特性支持和编辑器 UI 集成。

## Architecture

### 1. 目录结构修复

**问题分析**：
当前导出逻辑在 `SimpleExportDialog.tsx` 中创建了嵌套目录：
```
<用户选择的路径>/<项目名>/
  └── draft_content.json
  └── draft_meta_info.json
  └── materials/
```

但用户期望选择的路径本身就是草稿根目录，或者在已存在的剪映草稿目录下直接导出。

**解决方案**：
- 修改导出逻辑，让用户选择的路径直接作为草稿根目录
- 或提供"创建子目录"选项让用户自主选择

### 2. 数据模型扩展

扩展 `Shot` 和 `Track` 类型以支持高级属性：

```typescript
// 关键帧定义
interface Keyframe {
  time: number;           // 时间点（秒）
  value: number;          // 属性值
  interpolation?: 'linear' | 'bezier';  // 插值类型
}

interface KeyframeTrack {
  property: KeyframeProperty;  // 属性类型
  keyframes: Keyframe[];
}

type KeyframeProperty =
  | 'position_x' | 'position_y'
  | 'rotation'
  | 'scale_x' | 'scale_y' | 'uniform_scale'
  | 'alpha'
  | 'saturation' | 'contrast' | 'brightness'
  | 'volume';

// 滤镜定义
interface Filter {
  id: string;             // 滤镜 ID
  name: string;           // 显示名称
  intensity: number;      // 强度 0-100
}

// 动画定义
interface Animation {
  type: 'in' | 'out' | 'group';
  effectId: string;       // 动画效果 ID
  duration: number;       // 持续时间（秒）
}

// 音频淡入淡出
interface AudioFade {
  fadeIn: number;         // 淡入时长（秒）
  fadeOut: number;        // 淡出时长（秒）
}

// 蒙版定义
interface Mask {
  type: 'linear' | 'mirror' | 'circle' | 'rectangle' | 'heart' | 'star';
  // 各类型特定参数
  rotation?: number;
  centerX?: number;
  centerY?: number;
  feather?: number;
  invert?: boolean;
}
```

### 3. 剪映格式转换

参考 `pyJianYingDraft` 实现坐标和时间转换：

```typescript
// 坐标转换：像素 -> 半画布单位
function pixelToHalfCanvas(pixel: number, canvasSize: number): number {
  return (pixel / canvasSize) * 2;
}

// 时间转换：秒 -> 微秒
function secondsToMicroseconds(seconds: number): number {
  return Math.round(seconds * 1_000_000);
}

// 关键帧曲线类型
const CURVE_TYPE = {
  linear: 'Line',
  bezier: 'Bezier'
};
```

### 4. JianyingExporter 增强

扩展 `JianyingExporter` 类以处理高级属性：

```typescript
class JianyingExporter implements DraftExporter {
  // 新增方法
  private buildKeyframes(keyframeTracks: KeyframeTrack[]): any[];
  private buildFilters(filters: Filter[]): any[];
  private buildAnimations(animations: Animation[]): any;
  private buildAudioFade(fade: AudioFade): any;
  private buildMask(mask: Mask): any;
}
```

### 5. 编辑器 UI 组件

新增组件结构：

```
components/editor/
├── properties/
│   ├── KeyframeEditor.tsx       # 关键帧编辑器
│   ├── FilterPanel.tsx          # 滤镜选择面板
│   ├── AnimationPanel.tsx       # 动画选择面板
│   ├── AudioFadeControl.tsx     # 音频淡入淡出控制
│   └── MaskEditor.tsx           # 蒙版编辑器
└── timeline/
    └── KeyframeTrack.tsx        # 时间线关键帧轨道
```

### 6. 功能兼容性提示

在导出对话框中显示功能兼容性矩阵：

| 功能 | 原生导出 | 剪映草稿 |
|------|---------|---------|
| 基础剪辑 | ✓ | ✓ |
| 关键帧动画 | ✗ | ✓ |
| 滤镜 | ✗ | ✓ |
| 蒙版 | ✗ | ✓ |
| 音频淡入淡出 | ✗ | ✓ |

## Data Flow

```
用户编辑 Shot/Clip
    ↓
存储高级属性到项目数据
    ↓
导出时检测高级属性
    ↓
├── 有高级属性 → 提示使用剪映草稿导出
└── 无高级属性 → 可选原生导出或草稿导出
    ↓
JianyingExporter 转换格式
    ↓
输出 draft_content.json + 素材
```

## Migration

- 现有项目数据向后兼容
- 新字段（keyframes, filters, animations, audioFade, mask）为可选
- 旧版本忽略这些字段，不影响基础功能

## Testing Strategy

1. 单元测试：坐标/时间转换函数
2. 集成测试：完整导出流程
3. 兼容性测试：在剪映中打开导出的草稿验证
