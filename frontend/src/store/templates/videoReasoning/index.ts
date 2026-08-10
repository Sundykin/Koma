/**
 * 视频推理模板内容（多参 / 首帧延展 两套协议 × 4 个时长档）
 *
 * 8 份模板此前是 8 个 .md 文件，逐字重复同一套协议，只有时长数字不同——改一条规则
 * 要同步 8 遍，实际已经出现过漂移。现在只留两份基线：
 *   - shot_video_multi.base.md      多参模式协议
 *   - shot_video_firstframe.base.md 首帧延展模式协议
 * 时长以 `__DURATION__` 占位，在这里按档位展开成 8 份默认模板内容。
 * 展开结果与旧文件逐字一致，模板 id / PromptStudio 里的可编辑条目 / 用户已保存的
 * 覆写都不受影响。
 *
 * 注：占位符刻意不用 `{{}}`，避免被 PromptTemplate 的变量校验当成未声明变量。
 */
import multiBase from './shot_video_multi.base.md?raw';
import firstFrameBase from './shot_video_firstframe.base.md?raw';

/** 多参模式启用的时长档（秒） */
export const MULTI_REF_DURATIONS = [6, 10, 15, 20] as const;
/** 首帧延展模式启用的时长档（秒） */
export const FIRST_FRAME_DURATIONS = [6, 10, 16, 20] as const;

const withDuration = (base: string, seconds: number): string =>
  base.split('__DURATION__').join(String(seconds));

export const VIDEO_REASONING_TEMPLATE_CONTENT = {
  shot_video_6s_multi: withDuration(multiBase, 6),
  shot_video_10s_multi: withDuration(multiBase, 10),
  shot_video_15s_multi: withDuration(multiBase, 15),
  shot_video_20s_multi: withDuration(multiBase, 20),
  shot_video_6s_firstframe: withDuration(firstFrameBase, 6),
  shot_video_10s_firstframe: withDuration(firstFrameBase, 10),
  shot_video_16s_firstframe: withDuration(firstFrameBase, 16),
  shot_video_20s_firstframe: withDuration(firstFrameBase, 20),
} as const;
