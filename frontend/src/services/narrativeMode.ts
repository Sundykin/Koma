export type ProjectNarrativeMode = 'drama' | 'narration';

export function normalizeProjectNarrativeMode(mode: unknown): ProjectNarrativeMode {
  return mode === 'narration' ? 'narration' : 'drama';
}

export function formatProjectNarrativeMode(mode: ProjectNarrativeMode): string {
  return mode === 'narration' ? '解说模式' : '剧情模式';
}

export function buildShotBreakdownDialogueModeDirective(mode: ProjectNarrativeMode): string {
  if (mode === 'narration') {
    return [
      '【项目叙事模式：解说模式】',
      '- 分镜主要承载推文第一人称解说画面，dialogue 字段只填写原文明确出现的角色对白，或极少量必须同步口型的短反应。',
      '- 第一人称推文解说、心理判断、剧情概括不要主动改成大段角色对白；没有明确对白时 dialogue 写“无”。',
      '- scriptLineIndices 仍必须完整覆盖原字幕行，解说文本保留在 scriptLines 中由下游解说链路消费。',
    ].join('\n');
  }

  // 剧情模式的分镜拆解走独立模板（shot_breakdown_drama，创作式分镜脚本），
  // 不经过本指令；此分支仅为类型完备保留，当前无调用方。
  return '';
}

export function buildVideoDialogueModeDirective(mode: ProjectNarrativeMode): string {
  if (mode === 'narration') {
    return [
      '【项目叙事模式：解说模式 —— 解说字幕驱动画面】',
      '- 工作流定位：scriptLines 就是成片解说词（下游直接做字幕 + 旁白配音），画面是解说的配图。优先产出"能配合解说节奏"的画面，不追求脱离解说也能看懂剧情。',
      '- 台词：只保留原文明确出现的直接对白；没有明确对白时台词槽位写"无"。禁止把第一人称解说、心理判断、剧情概括改写成角色对白。',
      '- 口型：不重要。除明确对白外，人物不需要开口；解说词一律不进入画面字幕/气泡。',
    ].join('\n');
  }

  return [
    '【项目叙事模式：剧情模式 —— 影视化叙事，画面独立讲故事】',
    '- 工作流定位：画面必须脱离解说也能让观众看懂剧情，按影视分镜思维处理场景、角色调度与对白。',
    '- scriptContent 是一段完整的分镜脚本（画面/动作/场景 + 台词与声音的自然行文），按内容分轨处理，绝不混写：',
    '  · 画面/动作/环境描述 = 镜头拍到的内容，驱动生图与视频画面；',
    '  · 角色的直接引语（"说/问/喊/道"等发声动作引出的台词）= 该角色当场开口的对白（DIALOGUE）：写入对白提示词，需口型同步、对话朝向正确（面对面/过肩），单句在单镜头内说完；',
    '  · 若有画外音/旁白性质的叙述句（VOICEOVER）：写入旁白槽位并标注"对应人物全程嘴巴闭合"，禁止让角色开口念旁白。',
    '- 台词保持原语义，不要改写人称、不要把台词转述回叙述句；无台词的分镜槽位写"无"。',
    '- 禁止自创解说/评价/总结句；剧情信息全部通过可见动作、表情、对白与画外音承载。',
  ].join('\n');
}
