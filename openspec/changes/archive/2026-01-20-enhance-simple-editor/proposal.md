# 提案: 增强 SimpleEditor 编辑器功能

## 变更 ID
`enhance-simple-editor`

## 概述
全面增强 SimpleEditor 编辑器：删除无用的 VideoEditor 组件、增加音频播放能力、预览区视频/素材移动与缩放、字幕功能、FFmpeg 视频合成导出、素材上传、时间线持久化修复、动态刻度、时间线缩放、碰撞检测与吸附对齐。

## 背景与问题

### 当前问题
1. **冗余代码**: VideoEditor 组件与 SimpleEditor 功能重复，增加维护成本
2. **无声音播放**: 当前只有画面渲染，视频/音频素材的声音无法播放
3. **预览区不可交互**: 无法在预览区域直接拖拽移动/缩放素材
4. **缺少字幕功能**: 没有字幕编辑和渲染能力
5. **无视频导出**: 缺少使用 FFmpeg 合成轨道并导出视频的功能
6. **无素材上传**: 用户无法上传自己的素材
7. **时间线未持久化**: 重新进入项目无法恢复上次编辑的时间线状态
8. **刻度固定**: 时间线刻度固定为 55 秒，无法反映实际内容时长
9. **无缩放功能**: 时间线无法缩放查看不同精度
10. **碰撞检测不完善**: 同轨道素材可以叠加，缺少吸附对齐功能

### 目标
1. 删除 VideoEditor.tsx 及相关引用，统一使用 SimpleEditor
2. 实现音频播放（同步视频帧与音频）
3. 预览区支持素材拖拽移动和缩放
4. 实现字幕编辑和渲染功能
5. 集成 FFmpeg 实现轨道视频合成导出
6. 支持用户素材上传
7. 修复时间线持久化，确保恢复编辑状态
8. 时间线刻度根据实际内容时长动态展示
9. 实现时间线缩放控制
10. 完善碰撞检测，增加吸附对齐能力

## 设计方案

### 1. 删除 VideoEditor 组件

**删除文件**:
- `components/editor/VideoEditor.tsx`
- `components/editor/Player.tsx` (VideoEditor 专用)
- `components/editor/Sidebar.tsx` (VideoEditor 专用)
- `components/editor/EnhancedPlayer.tsx`
- 更新 `components/editor/index.ts` 移除导出

**保留**:
- `components/editor/Timeline/` 目录 (EnhancedTimeline 被 VideoEditor 使用，评估后决定是否保留)

### 2. 音频播放功能

**实现方式**:
- 扩展 SimpleAudioController 支持音频播放
- 视频素材使用 HTMLVideoElement 播放音频
- 音频素材使用 HTMLAudioElement 播放
- 与 MediaEngine 同步 currentTime

**API 扩展**:
```typescript
class SimpleAudioController {
  loadClip(clip: Clip): void;        // 加载音频/视频片段
  play(): void;                       // 开始播放
  pause(): void;                      // 暂停
  seek(time: number): void;           // 跳转
  setVolume(clipId: string, vol: number): void; // 设置音量
  setMuted(clipId: string, muted: boolean): void;
}
```

### 3. 预览区素材操作

**交互设计**:
- 选中素材后显示变换控制框（8个控制点 + 旋转手柄）
- 拖拽控制框内部移动素材位置 (x, y)
- 拖拽角点等比缩放 (scale)
- 拖拽边点非等比缩放
- 拖拽旋转手柄旋转素材 (rotation)

**比例选择器**:
- 提供预设比例：16:9、9:16、4:3、1:1
- 自适应画布渲染

### 4. 字幕功能

**字幕数据结构**:
```typescript
interface SubtitleClip extends Clip {
  type: MediaType.TEXT;
  text: string;              // 字幕内容
  fontSize: number;          // 字号
  fontFamily: string;        // 字体
  fontColor: string;         // 颜色
  backgroundColor?: string;  // 背景色
  position: 'top' | 'center' | 'bottom'; // 预设位置
  customX?: number;          // 自定义 X
  customY?: number;          // 自定义 Y
}
```

**字幕编辑器**:
- PropertiesPanel 中增加字幕编辑区
- 支持实时预览
- 支持导入 SRT/ASS 字幕文件

### 5. FFmpeg 视频导出

**导出流程**:
1. 用户点击「导出」按钮
2. 弹出导出配置对话框（分辨率、帧率、格式）
3. 逐帧渲染到 Canvas
4. Canvas 导出为图片序列或直接编码
5. 使用 FFmpeg 合成图片序列 + 音频轨
6. 输出最终视频文件

**FFmpeg 命令模板**:
```bash
ffmpeg -framerate {fps} -i frames/%05d.png \
       -i audio.wav \
       -c:v libx264 -preset medium -crf 23 \
       -c:a aac -b:a 192k \
       -pix_fmt yuv420p \
       output.mp4
```

### 6. 素材上传

**上传入口**:
- AssetPanel 顶部增加「上传」按钮
- 支持拖拽文件到 AssetPanel

**上传处理**:
1. 复制文件到项目目录 `assets/uploads/`
2. 生成缩略图
3. 提取元数据（时长、分辨率）
4. 添加到素材列表

### 7. 时间线持久化

**存储位置**: `projects/{projectId}/episodes/{episodeId}/timeline.json`

**存储内容**:
```typescript
interface TimelinePersistence {
  version: 2;
  tracks: Track[];
  duration: number;
  zoom: number;           // 缩放级别
  scrollLeft: number;     // 滚动位置
  updatedAt: number;
}
```

**加载逻辑**:
1. 进入编辑器时读取 timeline.json
2. 如果存在且有效，恢复轨道状态
3. 如果不存在，从 shots 初始化

### 8. 动态时间刻度

**刻度计算**:
- 根据实际内容时长 + 缓冲区计算总刻度范围
- 根据缩放级别选择刻度间隔：
  - zoom < 0.5: 每 10 秒一个刻度
  - 0.5 <= zoom < 1: 每 5 秒一个刻度
  - 1 <= zoom < 2: 每 1 秒一个刻度
  - zoom >= 2: 每 0.5 秒一个刻度

### 9. 时间线缩放

**缩放控制**:
- 工具栏增加缩放滑块 (0.1x - 5x)
- 支持 Ctrl + 滚轮缩放
- 支持 +/- 快捷键缩放
- 缩放以当前播放头为中心

### 10. 碰撞检测与吸附对齐

**碰撞检测增强**:
- 拖拽中实时检测碰撞
- 碰撞时显示红色警告边框
- 释放时如有碰撞，回退到原位置

**吸附对齐**:
- 吸附阈值: 10px (可配置)
- 吸附点:
  - 播放头位置
  - 其他片段的开始/结束点
  - 时间刻度标记
- 吸附时显示对齐辅助线

## 涉及文件

| 文件 | 变更类�� |
|------|---------|
| `components/editor/VideoEditor.tsx` | **删除** |
| `components/editor/Player.tsx` | **删除** |
| `components/editor/Sidebar.tsx` | **删除** |
| `components/editor/EnhancedPlayer.tsx` | **删除** |
| `components/editor/index.ts` | 修改 - 移除删除组件的导出 |
| `engine/simpleEngine.ts` | 修改 - 增强音频控制 |
| `components/editor/SimplePlayer.tsx` | 修改 - 增加素材交互控制、比例选择 |
| `components/editor/SimpleTimeline.tsx` | 修改 - 动态刻度、缩放、吸附对齐 |
| `components/editor/SimpleEditor.tsx` | 修改 - 时间线持久化加载 |
| `components/editor/SimplePropertiesPanel.tsx` | 修改 - 字幕编辑 |
| `components/editor/SimpleAssetPanel.tsx` | 修改 - 素材上传 |
| `components/editor/ExportDialog.tsx` | 修改 - FFmpeg 导出对话框 |
| `services/ffmpegManager.ts` | 修改 - 视频合成导出 |
| `types/editor.ts` | 修改 - SubtitleClip、TimelinePersistence |
| `utils/trackCollision.ts` | 修改 - 增强碰撞检测、吸附逻辑 |

## 风险与考量

1. **音频同步**: 确保音视频同步，避免延迟
2. **导出性能**: 大视频导出需要显示进度，支持取消
3. **向后兼容**: 删除 VideoEditor 后确保无引用遗漏
4. **持久化冲突**: 处理 timeline.json 与 shots 数据不一致的情况
5. **FFmpeg 依赖**: 确保 Electron 端 FFmpeg 可用

## 验收标准

1. VideoEditor 组件及相关文件已删除，无编译错误
2. 视频/音频素材可以正常播放声音
3. 预览区可以选中素材并拖拽移动、缩放、旋转
4. 可以添加字幕并在预览中正确渲染
5. 可以导出视频（包含画面和音频）
6. 可以上传自定义素材到项目
7. 重新进入项目能恢复上次的时间线编辑状态
8. 时间线刻度根据内容时长自动调整
9. 可以缩放时间线查看不同精度
10. 同轨道素材不能叠加，拖拽时有吸附对齐提示
