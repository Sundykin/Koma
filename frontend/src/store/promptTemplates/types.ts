/**
 * Prompt 模板类型定义与分类元数据
 * （从 store/promptTemplates.ts 拆出，纯类型无逻辑）
 */
export type PromptTemplateType =
  // 全局约束模板（自动注入到 TTI/ITV 模板，对应 prompts/整体提示词.txt）
  | 'global_positive_prefix'      // 前置正向（通用一致性 + 高质量约束）
  | 'global_positive_suffix'      // 后置正向（人物/场景稳定 + 视频首帧一致性）
  | 'global_negative_suffix'      // 后置负向（畸形 / drift / 字幕水印禁项）
  | 'global_video_constraints'    // 视频规约（仅注入到视频类模板）
  // 系统提示模板（System Prompt）
  | 'shot_prompt_system'       // 分镜提示词生成的系统提示
  | 'shot_breakdown_system'    // 分镜拆解的系统提示
  | 'script_analysis_system'   // 剧本解析的系统提示
  // LLM 任务模板
  | 'random_script_generation' // 随机剧本生成（一步完成）
  | 'script_generation'        // 剧本生成
  | 'script_polish'            // 剧本润色
  | 'shot_breakdown'           // 分镜拆解
  | 'shot_breakdown_drama'     // 剧情模式分镜拆解（小说/结构化剧本 → 真正的分镜描述 + 声音行）
  | 'shot_image_prompt_generation' // 分镜图片提示词生成
  | 'storyboard_shot_prompt_generation' // 故事板分镜提示词生成（电影级制作方案板）
  | 'shot_video_6s_multi'          // 分镜视频提示词 · 多参模式 · 6 秒
  | 'shot_video_10s_multi'         // 分镜视频提示词 · 多参模式 · 10 秒
  | 'shot_video_15s_multi'         // 分镜视频提示词 · 多参模式 · 15 秒
  | 'shot_video_20s_multi'         // 分镜视频提示词 · 多参模式 · 20 秒
  | 'shot_video_6s_firstframe'     // 分镜视频提示词 · 首帧延展模式 · 6 秒
  | 'shot_video_10s_firstframe'    // 分镜视频提示词 · 首帧延展模式 · 10 秒
  | 'shot_video_16s_firstframe'    // 分镜视频提示词 · 首帧延展模式 · 16 秒
  | 'shot_video_20s_firstframe'    // 分镜视频提示词 · 首帧延展模式 · 20 秒
  | 'grid_shot_prompt_generation'  // 九宫格分镜提示词生成（将单个分镜扩展为9个连续画面）
  | 'grid_4_shot_prompt_generation' // 四宫格分镜提示词生成（将单个分镜扩展为4个连续画面，更细粒度的镜头控制）
  | 'character_extraction'     // 角色提取
  | 'scene_extraction'         // 场景提取
  | 'prop_extraction'          // 道具提取
  | 'tweet_script_generation'  // 推文文案生成（剧本 → 整段连续推文旁白）
  | 'drama_script_parse'       // 剧情模式 · 小说解析为结构化剧本（旁白 + 带说话人的人物台词）
  // TTI 图片生成模板
  | 'tti_character_costume'    // 角色定妆照（三视图）
  | 'tti_scene_preview'        // 场景预览图
  | 'tti_prop_reference'       // 道具参考图
  | 'tti_shot_image'           // 分镜图片
  | 'tti_grid_shot_image'      // 九宫格分镜图片（3×3网格）
  | 'tti_grid_4_shot_image'    // 四宫格分镜图片（2×2网格）
  | 'tti_storyboard_shot_image' // 故事板分镜图片（电影级制作方案板）
  // ITV 视频生成模板
  | 'itv_shot_video'           // 分镜视频
  | 'itv_character_motion'     // 角色动态视频
  | 'itv_prop_motion';         // 道具动态视频

// Prompt 模板分类
//
// 用于在 PromptStudio UI 分组展示，以及给"用户新建自定义模板"提供受控选项。
// 每个分类都有明确的运行时职责：
//
// - global         全局约束：被 resolvePromptTemplate 自动注入到 TTI / ITV 模板，
//                  不会被业务代码直接 resolve；用户编辑这些模板可全站生效。
// - system         系统提示：作为 role:system 与对应业务模板配对调用（如 shot_prompt_system）。
// - script         剧本生成 / 润色：random / script / polish 类。
// - analysis       剧本/分镜结构化分析：shot_breakdown（输出 JSON 分镜列表）。
// - extraction     角色 / 场景 / 道具提取：从剧本提取实体清单。
// - tweet          推文文案：剧本→旁白脚本、旁白→分镜化解说。
// - inference-image  图片提示词推理：分镜图（含九宫格）的 image prompt 生成。
// - inference-video  视频提示词推理：分镜视频的 video prompt 生成
//                  （按时长 × multi-ref / first-frame 模式 5 模板）。
// - tti            文生图直拼：定妆照、场景图、道具图、分镜图、九宫格图等
//                  直接喂给 TTI 模型的提示词组装模板。
// - itv            图生视频直拼：分镜视频、角色/道具动态视频，直接喂 ITV 模型。
export type PromptTemplateCategory =
  | 'global'
  | 'system'
  | 'script'
  | 'analysis'
  | 'extraction'
  | 'tweet'
  | 'inference-image'
  | 'inference-video'
  | 'tti'
  | 'itv';

/** 分类元数据：UI 分组标题 + 简短描述（i18n 暂走中文，后续可改 key） */
export const PROMPT_CATEGORY_META: Record<PromptTemplateCategory, { label: string; description: string; order: number }> = {
  global:           { label: '全局约束',     description: '自动注入到 TTI / ITV 模板，编辑后全站生效',           order: 0 },
  system:           { label: '系统提示',     description: 'role:system 内容，配合业务模板调用',                  order: 1 },
  script:           { label: '剧本生成',     description: '随机生成 / 命题生成 / 润色',                          order: 2 },
  analysis:         { label: '剧本分析',     description: '分镜拆解等结构化分析（输出 JSON）',                   order: 3 },
  extraction:       { label: '实体提取',     description: '从剧本提取角色 / 场景 / 道具清单',                    order: 4 },
  tweet:            { label: '推文文案',     description: '剧本 → 旁白；旁白 → 分镜化解说',                      order: 5 },
  'inference-image':{ label: '图片提示词推理', description: '分镜静态画面提示词（含九宫格）',                    order: 6 },
  'inference-video':{ label: '视频提示词推理', description: '分镜视频提示词（按时长 × 多参 / 首帧 5 模板）',      order: 7 },
  tti:              { label: 'TTI 直拼',     description: '文生图模型的直接输入提示词（定妆 / 场景图等）',       order: 8 },
  itv:              { label: 'ITV 直拼',     description: '图生视频模型的直接输入提示词（分镜视频等）',          order: 9 },
};

// Prompt 模板接口
export interface PromptTemplate {
  id: PromptTemplateType;
  name: string;
  /** 分类，用于 PromptStudio 分组展示与用户新建自定义模板时选择 */
  category: PromptTemplateCategory;
  description: string;
  template: string;
  variables: PromptTemplateVariable[];
  isCustom: boolean;    // 是否自定义
}

export interface PromptTemplateVariable {
  name: string;
  label: string;
  description: string;
  format: string;
  example?: string;
  required?: boolean;
}

export interface PromptTemplateOverride {
  template: string;
  updatedAt: number;
}

export interface PromptTemplateValidationResult {
  isValid: boolean;
  unknownVariables: string[];
  missingRequiredVariables: string[];
}

export interface ResolvedPromptTemplate {
  template: PromptTemplate;
  prompt: string;
  source: 'default' | 'custom';
}
