/**
 * 分镜提示词推理阶段的「约束段」模板。
 *
 * 这些段落此前是 ShotPromptService 里硬编码的字符串数组，用户在 PromptStudio 里
 * 改了视频推理模板也改不到它们——实测一次视频推理送给 LLM 的 user 段约 10.5k 字符，
 * 其中三分之一来自这些硬编码块，"能改模板"其实只改得动另外三分之二。
 *
 * 现在文案全部搬到这里，由 PromptStudio 统一编辑；代码只负责：
 *  - 判断该用哪一段（有没有锚定图 / 有没有尾帧 / 有没有绑音色）
 *  - 把计算出来的数据片段（映射符清单、场景基线、图像提示词原文等）作为变量传进去
 */
import mappingSchema from './shot_directive_mapping_schema.md?raw';
import spatialAnchored from './shot_directive_spatial_anchored.md?raw';
import spatialMultiRef from './shot_directive_spatial_multiref.md?raw';
import tailFrame from './shot_directive_tail_frame.md?raw';
import voiceMention from './shot_directive_voice_mention.md?raw';
import outputBoundary from './shot_directive_output_boundary.md?raw';

export const SHOT_DIRECTIVE_TEMPLATE_CONTENT = {
  shot_directive_mapping_schema: mappingSchema,
  shot_directive_spatial_anchored: spatialAnchored,
  shot_directive_spatial_multiref: spatialMultiRef,
  shot_directive_tail_frame: tailFrame,
  shot_directive_voice_mention: voiceMention,
  shot_directive_output_boundary: outputBoundary,
} as const;
