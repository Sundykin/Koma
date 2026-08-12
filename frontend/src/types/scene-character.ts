/**
 * 角色 / 场景 / 道具 / 分镜 等剧本/资产相关类型
 *
 * 由 P1#4 从 frontend/src/types.ts 拆出，types.ts 现仅 re-export 本文件。
 * 调用方继续 `import { Character } from '../types'` 不变。
 */
import type {
  CharacterMediaSlots,
  PropMediaSlots,
  SceneMediaSlots,
  ShotMediaState,
  ShotVersionMediaState,
  StoredMediaAsset,
} from './media';
import type { EpisodeRef } from './project';

// 资产时间戳范围（用于 Sora2 角色提取）
export interface AssetTimestampRange {
  start: number; // 起始时间（秒）
  end: number;   // 结束时间（秒），与 start 间隔不超过 3 秒
}

export type CharacterGender = 'male' | 'female' | 'neutral' | 'unknown';

/** 子形象的差异维度：不同年龄 / 不同状态 / 不同穿着 */
export type CharacterVariantKind = 'age' | 'state' | 'outfit' | 'other';

/**
 * 角色子形象（同一角色的不同年龄 / 状态 / 穿着）。
 *
 * 子形象从主形象派生：生图时以主形象定妆照作为身份锚，只按 prompt 描述的差异改变，
 * 保证是"同一个人"。分镜里可以按 AI 分析结果自动激活，也可以在角色栏手动切换；
 * 激活后提示词编译与参考图构造都改用该子形象的定妆照（见 resolveCharacterAppearance）。
 */
export interface CharacterVariant {
  id: string;
  /** 子形象名，如「少年时期」「重伤浴血」「婚礼礼服」 */
  name: string;
  kind: CharacterVariantKind;
  /** 相对主形象的差异描述（客观可见），用于派生生图与提示词编译 */
  prompt: string;
  /**
   * 触发关键词（英文逗号分隔）：AI 匹配分镜时的线索，
   * 如「少年,童年,十岁」「重伤,浴血,受伤」「婚礼,礼服」
   */
  keywords?: string;
  media?: CharacterMediaSlots;
  createdAt?: number;
}

// 角色接口定义
export interface Character {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting'; // 主角 | 反派 | 配角
  // prompt 是唯一的视觉/小传文本来源。旧字段 description / appearance 已删除：
  // load 时 normalizeCharacterMediaState 会把它们折叠进 prompt 然后剥掉。
  prompt: string;

  age?: string;
  gender?: CharacterGender;
  /** 该人物在原文中的全部代称，多个用英文逗号分隔；无代称为空字符串 */
  aliases?: string;

  voiceId?: string;    // TTS 音色 ID
  media?: CharacterMediaSlots; // 结构化媒体槽位（主形象）

  /** 子形象列表（不同年龄 / 状态 / 穿着），从主形象派生 */
  variants?: CharacterVariant[];
  /**
   * 全局默认激活的子形象 id；为空表示用主形象。
   * 分镜级别的激活见 Shot.characterVariants，优先级高于此字段。
   */
  activeVariantId?: string;
  sora2CharacterId?: string;  // 角色提取API返回的ID
  timestampRange?: AssetTimestampRange; // Sora2 提取时间范围
  // 剧集引用追踪
  episodeRefs?: EpisodeRef[];
  fingerprint?: string;       // 资产指纹（用于去重）
}

// 场景接口定义
export interface Scene {
  id: string;
  name: string;
  // 同 Character：旧 description 字段已删除，老数据 load 时折叠进 prompt。
  prompt: string;

  location?: string;
  time?: 'day' | 'night' | 'twilight';
  mood?: string;
  /** 该场景在原文中的全部代称，多个用英文逗号分隔；无代称为空字符串 */
  aliases?: string;

  media?: SceneMediaSlots; // 结构化媒体槽位
  // 剧集引用追踪
  episodeRefs?: EpisodeRef[];
  fingerprint?: string;
}

// 道具接口定义
export interface Prop {
  id: string;
  name: string;
  // 同 Character：旧 description 字段已删除，老数据 load 时折叠进 prompt。
  prompt: string;

  type?: string;
  /** 该道具在原文中的全部代称，多个用英文逗号分隔；无代称为空字符串 */
  aliases?: string;

  media?: PropMediaSlots; // 结构化媒体槽位
  // Sora2 绑定相关
  sora2PropId?: string;        // Sora2 道具 ID
  timestampRange?: AssetTimestampRange; // Sora2 提取时间范围
  // 剧集引用追踪
  episodeRefs?: EpisodeRef[];
  fingerprint?: string;
}

// 分镜视频版本
export interface ShotVideo {
  path: string;
  url?: string;        // 远程URL
  thumbnailPath?: string;
  prompt?: string;
  seed?: number;
  model?: string;
  asset?: StoredMediaAsset;
  createdAt: number;
}

// 分镜视频推理模式：
// - multi-ref：多参照模式，提示词内会出现 @角色/@场景/@道具 映射，依赖映射基准库
// - first-frame：首帧延展模式，以单图为锚做微动延展，提示词不出现 @ 映射
export type ShotVideoMode = 'multi-ref' | 'first-frame';

/**
 * 项目 AI 分镜的视频连续性引用。
 *
 * `autoUsePreviousTailFrame` 始终保留自动判断，`mode=manual` 只覆盖当前生效值，
 * 因此用户可以在不重新调用 LLM 的情况下恢复自动。
 */
/**
 * 承接上一分镜的方式。
 *  - 'tail-frame'   截上一镜成片的真实尾帧当图片参考（@previous_tail_frame），
 *                   适合需要精确锁死起始画面、或上一镜视频本身有瑕疵只想取一帧的场景。
 *  - 'video-extend' 把上一镜**整段视频**作为全能参考交给模型，提示词声明"基于该视频延长生成"。
 *                   运镜惯性、动作节奏、光影漂移都由模型自己从视频里读，连贯度高于单帧承接，
 *                   代价是消耗更多额度、且上一镜视频质量直接影响本镜。
 */
export type ShotContinuityMode = 'tail-frame' | 'video-extend';

export interface ShotVideoReference {
  mode: 'auto' | 'manual';
  usePreviousTailFrame: boolean;
  autoUsePreviousTailFrame?: boolean;
  continuityReason?: string;
  sourceShotId?: string;
  referenceFrame?: StoredMediaAsset;
  capturedAt?: number;
  sourceVideoKey?: string;
  /** 承接方式；缺省视为 'tail-frame'（历史数据全是尾帧模式）。 */
  continuity?: ShotContinuityMode;
}

/**
 * 分镜内的字幕行块。
 *
 * 两种叙事模式产出不同的行结构：
 *   - 解说模式（narration）：推文文案化后切成"一行一句字幕"，role 恒为 'narration'，
 *     characterId 为空 —— 这一列就是成片字幕，配音用项目级旁白音色。
 *   - 剧情模式（drama）：完整小说先解析成结构化剧本，拆分镜时按影视分镜思维**创作**：
 *     每镜的 scriptLines = 分镜描述行（role='description'：场景/人物/动作/画面，客观可见，
 *     是图片/视频提示词的主输入）+ 声音行（role='narration' 旁白 / role='dialogue' 台词，
 *     台词带 characterId 说话人，供配音按角色选音色、进剪辑字幕轨道）。
 *
 * scriptLines 是分镜内"剧本"的唯一来源，下游 image / video prompt 推理用 join('\n') 还原文本。
 */
export type ShotScriptLineRole = 'narration' | 'dialogue' | 'description';

export interface ShotScriptLine {
  id: string;
  text: string;
  /** 行类型：旁白 / 台词。缺省视为 'narration'（解说模式全列都是旁白）。 */
  role?: ShotScriptLineRole;
  /** 仅台词行：说话人角色 ID（→ Character.voiceId 选音色）。 */
  characterId?: string;
}

export type ShotImageMode = 'normal' | 'grid' | 'grid-9' | 'grid-4' | 'storyboard';

// 分镜/镜头接口定义
export interface Shot {
  id: string;
  scriptLines: ShotScriptLine[]; // 字幕行块列表（取代旧 scriptContent + tweetCopy）
  shotType: 'close-up' | 'medium' | 'wide' | 'extreme-wide'; // 特写 | 中景 | 全景 | 大全景
  cameraMovement: 'static' | 'pan' | 'zoom-in' | 'tracking' | 'handheld'; // 固定 | 摇镜 | 推镜 | 跟随 | 手持
  duration: number;      // 持续时长(秒)
  imagePrompt?: string;  // 图片生成提示词
  videoPrompt?: string;  // 视频生成提示词
  /** 生成提示词时的脚本内容指纹（shotFreshness.computeShotScriptHash）——脚本改动后置为滞后提示 */
  promptScriptHash?: string;
  /** 生成配音时的台词指纹（shotFreshness.computeShotVoiceHash）——台词改动后提示配音待更新 */
  voiceScriptHash?: string;
  /**
   * 图片生成模式（默认 normal）：
   *  - 'normal'   普通单图模式
   *  - 'grid-9'   3×3 九宫格（9 帧时序）
   *  - 'grid-4'   2×2 四宫格（4 帧时序，更细的镜头控制 / 更少切换）
   *  - 'storyboard' 电影故事板 / 制作方案板（多面板叙事参考）
   *  - 'grid'     旧值，等价于 'grid-9'，仅向后兼容老数据
   */
  imageMode?: ShotImageMode;
  /** 故事板模式下是否把上一张故事板图片作为连续性参考；未设置时默认继承。 */
  inheritPreviousStoryboard?: boolean;
  videoMode?: ShotVideoMode; // 视频推理模式（默认 'multi-ref'）
  /** 项目视频生成使用的上一镜真实视频尾帧；与 Linghui 数据模型无关。 */
  videoReference?: ShotVideoReference;
  media?: ShotMediaState; // 结构化媒体槽位
  // 关联资产
  characters: string[];  // 涉及的角色ID
  /**
   * 本镜生效的角色子形象：characterId → variantId。
   * 由 AI 分镜分析自动匹配，也可在分镜角色栏手动切换；
   * 未命中的角色回落到 Character.activeVariantId，再回落到主形象。
   */
  characterVariants?: Record<string, string>;
  scenes?: string[];     // 涉及的场景ID（可在 UI 中编辑）
  dialogue?: string;     // 台词（用于 TTS）
  /**
   * 上次出配音时编译出的音色绑定快照（dialogue 里的 @voice_xxx / @char_xxx-音色 解析结果）。
   * 仅作展示和缓存用，下次再出配音会重新编译覆盖。结构与 AudioMentionCompiler 输出对齐。
   * 注：多音色分段合成已由 scriptLines 角色行 + generateShotAudioWithSegments
   * （MediaGenerationService）+ concatAudioClips 实现，不消费此处的 bindings[1..]。
   */
  audioBindings?: ShotAudioBinding[];
  emotion?: string;      // 情绪标签
  props?: string[];      // 涉及的道具ID
  confirmed?: boolean;   // 是否已确认（用于入轨）
  seed?: number;         // 生成种子（用于复现）
  currentVersion?: number; // 当前版本号（兼容旧数据）
}

export interface ShotAudioBinding {
  index: number;
  voiceProfileId: string;
  providerVoiceId?: string;
  voiceName: string;
  sourceCharacterId?: string;
}

// 剧本分析结果接口
export interface ScriptAnalysisResult {
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  shots: Shot[];
}

export interface ShotVersion {
  version: number;
  media?: ShotVersionMediaState; // 结构化媒体槽位
  prompt: string;
  seed: number;
  model: string;
  createdAt: number;
}

export interface ShotMeta {
  id: string;
  prompt: string;
  seed: number;
  model: string;
  currentVersion: number;
  versions: ShotVersion[];
}
