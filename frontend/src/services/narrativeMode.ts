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

  return [
    '【项目叙事模式：剧情模式】',
    '- 输入剧本是结构化标记行：[旁白] 开头的是旁白，[台词·角色名] 开头的是人物台词，[场景] 开头的是场景标注（仅作断镜参考，不计入字幕行覆盖）。',
    '- scriptLineIndices 必须连续不重不漏覆盖所有输入行（含 [场景] 行），不要改写任何一行的原文。',
    '- dialogue 字段已废弃：台词与旁白都由 scriptLines 承载，dialogue 一律填“无”，不要再把解说/台词单独写进 dialogue。',
  ].join('\n');
}

export function buildVideoDialogueModeDirective(mode: ProjectNarrativeMode): string {
  if (mode === 'narration') {
    return [
      '【项目叙事模式：解说模式】',
      '当前视频可依赖上游推文解说/字幕承载剧情，不要主动把第一人称解说改成大量角色对白。对白提示词只保留显式直接对白，或每单元 0-1 句确实需要口型同步的短反应；无则写“无”。',
    ].join('\n');
  }

  return [
    '【项目叙事模式：剧情模式】',
    '当前视频需要脱离解说也能看懂剧情。允许把第一人称推文解说中的认知、决定、质问、反应、转述改写成少量主角独白或角色对白，并放入对白提示词；台词必须短、当场可说、人称正确，禁止照搬来源叙述句或输出转换说明。',
  ].join('\n');
}
