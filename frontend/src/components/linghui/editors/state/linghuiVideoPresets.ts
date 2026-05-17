/**
 * LibTV VIDEO_PRESETS 灵绘对齐版（来源：15gvxu:192400-192509 的 iU/iO handler）。
 *
 * - firstFrame.imageUrl  / firstLastFrame.firstImageUrl / lastImageUrl：
 *   LibTV 在该字段挂了官方样例图（CDN）；灵绘默认全部留空，让派生的 ImageNode 进入
 *   EmptyState 引导用户上传/选库（与 #14 TextNode imageToPrompt 同模式）。
 * - firstFrame.prompt  / firstLastFrame.prompt：
 *   写入当前 VideoNode 的 prompt 默认值（用户可再改）。
 */
export const LINGHUI_VIDEO_PRESETS = {
  firstFrame: {
    imageUrl: '',
    prompt: '基于上游首帧图自然推进画面，镜头平滑跟随主体动作，光影连续，时长 5 秒以内。',
  },
  firstLastFrame: {
    firstImageUrl: '',
    lastImageUrl: '',
    prompt: '从首帧自然过渡到尾帧，镜头和光影变化平滑，主体动作连续可信，时长 5 秒以内。',
  },
} as const;

export type LinghuiVideoPresetKey = keyof typeof LINGHUI_VIDEO_PRESETS;
