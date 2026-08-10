/**
 * 视频推理模板内容：多参 / 首帧延展 两套协议，各一份。
 *
 * 演进：
 *  1. 最早是 8 个 .md（4 时长档 × 2 模式），逐字重复同一套协议，改一条规则要同步 8 遍
 *  2. 之后合并成 2 份基线 + `__DURATION__` 占位，在这里展开回 8 个模板 id
 *  3. 现在时长档位整体取消——时长由 `{{durationSeconds}}` 变量在推理时注入，
 *     取值 = 分镜时长按项目所选视频模型的 spec 吸附后的结果（4–30 秒）。
 *     模板从 8 个减到 2 个，任意秒数都能推，不再被"最近档位"吸附。
 */
import multi from './shot_video_multi.md?raw';
import firstFrame from './shot_video_firstframe.md?raw';

export const VIDEO_REASONING_TEMPLATE_CONTENT = {
  shot_video_multi: multi,
  shot_video_firstframe: firstFrame,
} as const;
