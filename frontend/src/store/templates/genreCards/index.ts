/**
 * 短剧风格标签卡：题材（genre）/ 调性（tone）/ 前提装置（device）三轴。
 *
 * 三轴是正交的——「科幻」是题材，「搞笑」「狗血」是调性，「重生」「系统」是装置。
 * 同一个装置可以装在婚恋、复仇、宅斗上，所以不能压成一个扁平标签列表。
 *
 * 卡片内容由 worldwonderer/drama-skills（MIT）的 genre-cards / premise-devices
 * 蒸馏压缩而来，只保留能驱动下游推理的条目：
 *   压力来源 → 分镜拆解选冲突点；人物策略与信息权限 / 情绪落点 → 台词动作改写；
 *   场面颗粒 → 画面与道具提示词；集尾钩子 → 呼应提示词；禁止漂移 → 负向约束。
 *
 * 纪律沿用上游那条最重要的：**一次只注入一张主题材卡**，辅题材只摘 1-2 条，
 * 否则两套打法并行会把推理输入撑爆、也让模型不知道主要矛盾归谁。
 */
import genreAnalysis from './drama_genre_analysis.md?raw';
import device0 from './device_失忆.md?raw';
import device1 from './device_穿越.md?raw';
import device2 from './device_系统.md?raw';
import device3 from './device_读心.md?raw';
import device4 from './device_重生.md?raw';
import device5 from './device_马甲.md?raw';
import genre6 from './genre_亲子隐秘.md?raw';
import genre7 from './genre_仙侠修真.md?raw';
import genre8 from './genre_动作任务.md?raw';
import genre9 from './genre_古装权谋.md?raw';
import genre10 from './genre_复仇打脸.md?raw';
import genre11 from './genre_家庭关系.md?raw';
import genre12 from './genre_悬疑规则.md?raw';
import genre13 from './genre_生活流.md?raw';
import genre14 from './genre_科幻未来.md?raw';
import genre15 from './genre_职场喜剧.md?raw';
import genre16 from './genre_豪门婚恋.md?raw';
import genre17 from './genre_身份错位.md?raw';
import tone18 from './tone_悬疑压抑.md?raw';
import tone19 from './tone_搞笑.md?raw';
import tone20 from './tone_治愈.md?raw';
import tone21 from './tone_燃向.md?raw';
import tone22 from './tone_狗血.md?raw';
import tone23 from './tone_致郁.md?raw';

export type GenreCardKind = 'genre' | 'tone' | 'device';

export interface GenreCardMeta {
  kind: GenreCardKind;
  /** 卡名，同时是模板 id 的后缀（genre_card_<name>） */
  name: string;
  /** 匹配词：标签分析和用户手输时用来归一到这张卡 */
  aliases: string[];
}

/** 卡片正文（PromptStudio 里可改的默认值来源） */
export const GENRE_CARD_CONTENT: Record<string, string> = {
  genre_card_失忆: device0,
  genre_card_穿越: device1,
  genre_card_系统: device2,
  genre_card_读心: device3,
  genre_card_重生: device4,
  genre_card_马甲: device5,
  genre_card_亲子隐秘: genre6,
  genre_card_仙侠修真: genre7,
  genre_card_动作任务: genre8,
  genre_card_古装权谋: genre9,
  genre_card_复仇打脸: genre10,
  genre_card_家庭关系: genre11,
  genre_card_悬疑规则: genre12,
  genre_card_生活流: genre13,
  genre_card_科幻未来: genre14,
  genre_card_职场喜剧: genre15,
  genre_card_豪门婚恋: genre16,
  genre_card_身份错位: genre17,
  genre_card_悬疑压抑: tone18,
  genre_card_搞笑: tone19,
  genre_card_治愈: tone20,
  genre_card_燃向: tone21,
  genre_card_狗血: tone22,
  genre_card_致郁: tone23,
};

export const GENRE_CARD_META: GenreCardMeta[] = [
  { kind: 'device', name: '失忆', aliases: ['失忆', '记忆缺失', '记忆篡改'] },
  { kind: 'device', name: '穿越', aliases: ['穿越', '异世', '时空穿越'] },
  { kind: 'device', name: '系统', aliases: ['系统', '金手指', '外挂', '面板'] },
  { kind: 'device', name: '读心', aliases: ['读心', '听见心声', '预知'] },
  { kind: 'device', name: '重生', aliases: ['重生', '重来一世', '回到过去'] },
  { kind: 'device', name: '马甲', aliases: ['马甲', '隐藏身份', '双重身份', '大佬身份'] },
  { kind: 'genre', name: '亲子隐秘', aliases: ['亲子', '萌宝', '神秘小孩', '隐婚生子', '认亲', '单亲爸爸', '单亲妈妈', '血缘揭示', '领养身世'] },
  { kind: 'genre', name: '仙侠修真', aliases: ['仙侠', '修真', '修仙', '玄幻', '宗门', '御剑', '东方奇幻'] },
  { kind: 'genre', name: '动作任务', aliases: ['动作', '任务', '冒险', '追逃', '营救', '押运', '生存突围'] },
  { kind: 'genre', name: '古装权谋', aliases: ['古装', '权谋', '朝堂', '宅斗', '宫廷', '门第', '礼制身份'] },
  { kind: 'genre', name: '复仇打脸', aliases: ['复仇', '打脸', '逆袭', '权力反转', '扮猪吃虎', '隐藏身份归来', '清算'] },
  { kind: 'genre', name: '家庭关系', aliases: ['家庭', '亲情', '婆媳', '姐弟', '照护', '伦理', '代际冲突'] },
  { kind: 'genre', name: '悬疑规则', aliases: ['悬疑', '规则怪谈', '规则恐怖', '惊悚', '生存', '密室', '灵异'] },
  { kind: 'genre', name: '生活流', aliases: ['生活流', '小人物', '都市温情', '日常', '市井'] },
  { kind: 'genre', name: '科幻未来', aliases: ['科幻', '未来', '赛博朋克', '星际', 'AI', '末世', '硬科幻'] },
  { kind: 'genre', name: '职场喜剧', aliases: ['职场', '轻喜剧', '打工人', '技术流', '专业能力', '办公室'] },
  { kind: 'genre', name: '豪门婚恋', aliases: ['豪门', '霸总', '婚恋', '契约婚姻', '先婚后爱', '甜宠', '虐恋'] },
  { kind: 'genre', name: '身份错位', aliases: ['身份错位', '身体互换', '灵魂互换', '冒名顶替', '人非人身份'] },
  { kind: 'tone', name: '悬疑压抑', aliases: ['阴郁', '冷峻', '惊悚感', '压抑'] },
  { kind: 'tone', name: '搞笑', aliases: ['喜剧', '轻喜剧', '沙雕', '无厘头', '爆笑'] },
  { kind: 'tone', name: '治愈', aliases: ['温情', '治愈', '暖', '小确幸', '疗愈'] },
  { kind: 'tone', name: '燃向', aliases: ['热血', '燃', '爽感', '高光'] },
  { kind: 'tone', name: '狗血', aliases: ['虐', '狗血', '强冲突', '极致反转'] },
  { kind: 'tone', name: '致郁', aliases: ['虐心', '致郁', '悲剧', 'BE', '压抑结局'] },
];

/** 三轴标签分析模板正文 */
export const DRAMA_GENRE_ANALYSIS_TEMPLATE = genreAnalysis;

export const GENRE_CARD_NAMES = GENRE_CARD_META.map(card => card.name);

export function listCardsOfKind(kind: GenreCardKind): GenreCardMeta[] {
  return GENRE_CARD_META.filter(card => card.kind === kind);
}

/** 把用户输入或 LLM 输出的自由标签归一到卡名；命中不了返回 undefined。 */
export function matchGenreCard(raw: string, kind?: GenreCardKind): GenreCardMeta | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const pool = kind ? listCardsOfKind(kind) : GENRE_CARD_META;
  return pool.find(card => card.name === text)
    ?? pool.find(card => card.aliases.includes(text))
    // 别名做包含匹配兜底："都市甜宠爽剧" → 甜宠 → 豪门婚恋
    ?? pool.find(card => card.aliases.some(alias => text.includes(alias)));
}
