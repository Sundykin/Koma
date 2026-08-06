/**
 * 灵绘画布基础类型：节点类型/分类/槽位/运行状态/画布模式/通用视角与工具键
 * （从 types/linghui.ts 拆出）
 */
/**
 * LibTV 1:1：所有图片节点统一为 'linghui/image'，按 properties.mode + 是否有 result 渲染三态：
 *  1) mode='import' + 无 source → 自行上传图片占位（截图：上传 placeholder）
 *  2) mode='import' + 有 source → 上传素材展示（截图 3：浮空工具条 + 图片预览 + 文件名 + WxH）
 *  3) mode='generate' + 无 result → 未生成状态（截图 2：中心占位 + "图生图/图片高清" 引导 + 底部编辑器）
 *  4) mode='generate' + 有 result → 已生成状态（截图 4：浮空工具条 + 图片 + 底部编辑器）
 * 历史的 'linghui/image-generator' 类型已废弃；旧节点恢复时按 'linghui/image' + mode='generate' 处理。
 */
export type LinghuiNodeType =
  | 'linghui/text'
  | 'linghui/agent'
  | 'linghui/image'
  | 'linghui/panorama'
  | 'linghui/video'
  | 'linghui/audio'
  | 'linghui/script'
  | 'linghui/storyboard'
  | 'linghui/director3d'
  // 宫格切分中间节点：上游单张图被切成 N 个槽位，每个槽位可独立"彻底切分"派生为独立图节点
  | 'linghui/image-grid-slice'
  // 视频合成节点：多个视频/图片片段拼合为单一视频；详情打开"最终剪辑"工具
  | 'linghui/video-clip';

export type LinghuiRFNodeTypeKey =
  | 'linghui-text'
  | 'linghui-agent'
  | 'linghui-image'
  | 'linghui-panorama'
  | 'linghui-video'
  | 'linghui-audio'
  | 'linghui-script'
  | 'linghui-storyboard'
  | 'linghui-director3d'
  | 'linghui-image-grid-slice'
  | 'linghui-video-clip';

export type LinghuiNodeCategory = 'asset' | 'generation' | 'storyboard' | 'spatial';
export type LinghuiSlotDataType = 'image' | 'text' | 'video' | 'audio' | 'images' | 'shot' | 'storyboard';
export type LinghuiRunStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'stale';
export type LinghuiResultKind = 'image' | 'text' | 'video' | 'audio' | 'grid' | 'images' | 'shot' | 'storyboard';
export type LinghuiCanvasMode = 'mouse' | 'hand';
export type LinghuiImageNodeMode = 'import' | 'generate';

/**
 * LibTV ImageNode 视图状态机（对齐 docs/libtv-imagenode-state-machine.md）。
 * 与 Text/Video 节点同模板：
 *   generating / failed / resource / pending / empty_generate
 * - import 模式：始终 resource（纯素材节点）
 * - 有 collection / source / result 图：resource
 * - generate 模式 + 无图 + 有上游：pending
 * - 否则：empty_generate（显示"图生图 / 图片高清"建议）
 */
export type LinghuiImageNodeViewState =
  | 'generating'
  | 'failed'
  | 'resource'
  | 'pending'
  | 'empty_generate';
export type LinghuiImageToolKey =
  | 'focus'
  | 'mark'
  | 'upscale'
  | 'multi-angle'
  | 'outpaint'
  | 'relight'
  | 'repaint'
  | 'erase'
  | 'remove-bg'
  | 'crop'
  | 'mockup'
  | 'edit-elements'
  | 'edit-texts'
  | 'grid-split';
/**
 * 视频节点工具。对齐 LibTV 截图工具条：剪辑 / 高清 / 截图 / 解析 / 智能去字幕 / 音频分离。
 * - clip               剪辑：本地 FFmpeg trim 派生新视频节点
 * - upscale            高清：FFmpeg 倍率放大派生
 * - screenshot         截图：从当前视频抽首帧/中帧/尾帧派生图片节点
 * - analyze            解析：把视频转写为提示词/分镜文本
 * - subtitle-remove    智能去字幕（LibTV: "AI一键去除视频字幕，仅支持中英文字幕"，后端服务待接入）
 * - audio-separation   音频分离（一级菜单容器，下挂"音视频分离"和"人声分离"二级）
 * - 'compose' 已废弃，原因：与 LibTV 模式重合且功能模糊，并入解析。
 */
export type LinghuiVideoToolKey =
  | 'clip'
  | 'upscale'
  | 'screenshot'
  | 'analyze'
  | 'subtitle-remove'
  | 'audio-separation';
export type LinghuiNodeViewMode = 'collapsed' | 'light' | 'immersive';
export type LinghuiMultiAngleAzimuth = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;
export type LinghuiMultiAngleElevation = -30 | 0 | 30 | 60;
export type LinghuiMultiAngleDistance = 0.6 | 1 | 1.8;
export type LinghuiMultiAnglePromptProtocol = 'sks-camera-v1' | 'descriptor-only-v1';
export type LinghuiMultiAngleMode = 'object' | 'camera';
export type LinghuiMultiAnglePresetKey =
  | 'custom'
  | 'fisheye'
  | 'tilted'
  | 'front-down'
  | 'front-up'
  | 'panoramic-down'
  | 'back';
export type LinghuiRelightDirection =
  | 'front'
  | 'front-right'
  | 'right'
  | 'back-right'
  | 'back'
  | 'back-left'
  | 'left'
  | 'front-left'
  | 'high-front'
  | 'high-front-right'
  | 'high-right'
  | 'high-back-right'
  | 'high-back'
  | 'high-back-left'
  | 'high-left'
  | 'high-front-left'
  | 'low-front'
  | 'low-front-right'
  | 'low-right'
  | 'low-back-right'
  | 'low-back'
  | 'low-back-left'
  | 'low-left'
  | 'low-front-left'
  | 'top'
  | 'bottom';
export type LinghuiNodeToolState =
  | { kind: 'image'; nodeId: string; tool: LinghuiImageToolKey }
  | { kind: 'video'; nodeId: string; tool: LinghuiVideoToolKey }
  | null;

