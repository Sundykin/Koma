/**
 * LibTV AUDIO_PRESETS 灵绘对齐版（来源：15gvxu:8668-8728 的 eH handler）。
 *
 * audioToVideo 动作把当前 AudioNode 作为音轨样例 + 派生：
 *   - 右侧一个 VideoNode（VIDEO_GENERATE + 默认 prompt）
 *   - 下方一个 ImageNode（IMAGE_RESOURCE + 默认参考图）
 *   - 2 条 audio→video / image→video 连线
 *
 * 灵绘默认 imageUrl / audioUrl 留空，让派生节点走 EmptyState 引导用户上传/选库。
 */
export const LINGHUI_AUDIO_PRESETS = {
  audioToVideo: {
    audioUrl: '',
    imageUrl: '',
    prompt: '基于参考图与音乐节奏自然推进画面，镜头运动跟着音乐律动，画面呼吸感与音色一致。',
  },
} as const;
