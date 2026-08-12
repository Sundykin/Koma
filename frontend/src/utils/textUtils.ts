/**
 * 文本处理工具函数（中文版）
 * 供 entityExtractor.ts 和 ScriptAnalysisService.ts 共用
 */

export function cleanText(value?: string): string {
  return (value || '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, '，').trim();
}

export function splitVisualClauses(value?: string): string[] {
  return (value || '')
    .split(/[，,。；;、\n]+/)
    .map(cleanText)
    .filter(Boolean);
}

/**
 * 身份 / 经历 / 超自然设定类词：出现在角色外貌描述里就是污染，
 * 它们会被当成画面内容喂给 TTI（"年轻调查员"画不出来，只会让模型自由发挥）。
 */
export const CHARACTER_STORY_TOKENS = [
  // 职业与身份
  '店主', '老板', '职业', '工作', '为生', '接私活', '身份', '出身',
  '学生', '教师', '老师', '医生', '护士', '警察', '侦探', '调查员',
  '律师', '记者', '司机', '厨师', '保安', '秘书', '总裁', '董事',
  '将军', '皇帝', '公主', '王子', '大臣', '掌门', '弟子', '修士',
  // 亲属与社会关系
  '养父', '养母', '父亲', '母亲', '哥哥', '姐姐', '弟弟', '妹妹',
  '丈夫', '妻子', '未婚', '恋人', '朋友', '同事', '邻居', '上司',
  // 经历与剧情
  '靠', '继承', '去世', '身世', '成谜', '火场', '被救', '遇难', '全家',
  '重生', '穿越', '失忆', '复仇', '多年前', '从小', '曾经',
  // 超自然设定
  '能看见', '看见鬼', '鬼魂', '灵异', '法力', '灵力', '异能',
];

/**
 * 明确的画面标记：出现这些说明该短句在描述可见外观，
 * 即使句中带了身份词也要保留（"穿着深蓝色工作服" 不该因为"工作"被整句丢掉）。
 */
const VISUAL_MARKER_TOKENS = [
  '穿', '戴', '披', '系', '踩', '挽', '束',
  '发', '眉', '眼', '鼻', '唇', '嘴', '脸', '肤', '肩', '手', '身形', '身材', '体型',
  '衣', '裤', '裙', '袍', '衫', '鞋', '靴', '帽', '巾', '袄', '褂',
  '色', '疤', '痣', '纹身', '胎记', '皱纹', '胡',
];

export function sanitizeCharacterAppearance(value?: string, fallback?: string): string {
  const clauses = splitVisualClauses(value);
  const filtered = clauses.filter(clause => {
    if (!CHARACTER_STORY_TOKENS.some(token => clause.includes(token))) return true;
    // 带身份词但同时在描述可见外观 → 保留；纯身份陈述 → 丢弃
    return VISUAL_MARKER_TOKENS.some(token => clause.includes(token));
  });
  return cleanText(filtered.join('，') || fallback || '');
}
