/**
 * LibTV TEXT_PRESETS 灵绘对齐版（来源：15gvxu:55145-55256 的 eY/eV/eW handler）。
 *
 * - textToVideo.prompts：当前 TextNode 写入示例文本，用户可改
 * - textToVideo.videoPrompt：派生下游 VideoNode 的 params.prompt 默认值
 * - imageToPrompt.imageUrl：派生上游 ImageNode 的 source 默认值
 *   LibTV 在该字段挂了官方样例图（CDN）；灵绘默认留空，让 ImageNode 进入 EmptyState 引导用户上传/选库
 * - imageToPrompt.prompt：当前 TextNode 的 prompt 默认值（"反推这张图的描述"）
 * - textToMusic.prompt：派生 AudioNode 前先写入 TextNode 的 content/prompt
 */
export const LINGHUI_TEXT_PRESETS = {
  textToVideo: {
    prompts: [
      '一位身穿深蓝色风衣的女主角，站在雨后霓虹反光的街道中央，远处车流模糊，镜头从低角度仰拍。',
      '清晨的山顶日出，主角背对镜头眺望远方云海，光线从画面右上方斜射，营造温暖橙金色调。',
      '夜晚的赛博朋克城市俯瞰镜头，主角站在天台边缘，发丝随风飘动，远处广告牌闪烁霓虹。',
      '复古胶片质感的咖啡馆内景，主角端着咖啡望向窗外，光线柔和有颗粒感，背景虚化。',
    ] as readonly string[],
    videoPrompt: '电影感运镜：主角缓步走入画面，镜头平滑跟随，景深变化自然，光影流动。',
  },
  imageToPrompt: {
    /**
     * 灵绘暂不内置样例图；用户点击"图片反推提示词"后会拿到一个空的 IMAGE 上游节点，
     * 通过它自身的 EmptyState 上传图片或从素材库引用，然后回到 TextNode 运行得到反推描述。
     */
    imageUrl: '',
    prompt: '请仔细观察输入图片，输出一段详细的中文描述，包含主体、场景、构图、光影、风格和氛围。可直接作为后续生成任务的 prompt。',
  },
  textToMusic: {
    prompt: '温暖治愈的钢琴独奏，慢板，带轻微环境音，适合配 90 秒的电影回忆片段。',
  },
} as const;

export type LinghuiTextPresetKey = keyof typeof LINGHUI_TEXT_PRESETS;

export function pickRandomTextPrompt(): string {
  const prompts = LINGHUI_TEXT_PRESETS.textToVideo.prompts;
  return prompts[Math.floor(Math.random() * prompts.length)] ?? prompts[0];
}
