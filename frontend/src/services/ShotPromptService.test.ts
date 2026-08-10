import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDialogueGuardNote,
  ensureExplicitDialogueInVideoPrompt,
  formatCharacterMappingBaseline,
  rewriteProviderImageTokensToMentions,
  sanitizeVideoPromptResult,
} from './ShotPromptService';
import type { ShotReferenceBundle } from './shotReference/types';
import type { Character, Shot, StoredMediaAsset } from '../types';
import type { CreationContext } from './CreationContext';

vi.mock('../store/projectStore', () => ({
  loadProject: vi.fn(),
  loadScenes: vi.fn(),
  loadProps: vi.fn(),
  loadEpisodeShots: vi.fn(),
  updateShot: vi.fn(),
}));

// 业务模板一律打桩成 'resolved prompt'（本文件不测模板正文）；但 inference-directive
// 约束段要用真实默认模板渲染——它们的措辞就是被测行为的一部分。
vi.mock('../store/promptTemplates', async () => {
  const { DEFAULT_TEMPLATES } = await import('../store/promptTemplates/defaults');
  return {
    resolvePromptTemplate: vi.fn(async (templateId: string, variables: Record<string, string> = {}) => {
      let prompt: string;
      if (templateId.startsWith('shot_directive_')) {
        prompt = Object.entries(variables).reduce(
          (acc, [key, value]) => acc.split(`{{${key}}}`).join(value ?? ''),
          (DEFAULT_TEMPLATES as Record<string, { template: string }>)[templateId].template,
        );
      } else {
        prompt = templateId === 'shot_prompt_system' ? 'system prompt' : 'resolved prompt';
      }
      return { prompt, source: 'default', template: { id: templateId } };
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

function createStoryboardShot(partial?: Partial<Shot>): Shot {
  return {
    id: 'shot-1',
    scriptLines: [{ id: 'line-1', text: '叶赎抬头看向幽蓝光幕。' }],
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 15,
    imageMode: 'storyboard',
    imagePrompt: '',
    videoPrompt: '',
    characters: ['char_yeshu'],
    scenes: ['scene_room'],
    props: [],
    media: {},
    ...partial,
  };
}

function createImageAsset(localPath: string): StoredMediaAsset {
  return {
    kind: 'image',
    localPath,
    createdAt: 1,
  };
}

function createContext(partial?: Partial<CreationContext>): CreationContext {
  return {
    projectId: 'project-1',
    episodeId: 'episode-1',
    characters: [],
    scenes: [],
    props: [],
    styleSnapshot: undefined,
    projectMode: 'drama',
    llmConfig: {} as CreationContext['llmConfig'],
    llmProvider: {
      chat: vi.fn(async () => '故事板提示词'),
      stream: vi.fn(),
    } as unknown as CreationContext['llmProvider'],
    itvDurationSpec: {
      kind: 'enum',
      values: [6, 10, 15, 20],
      default: 10,
    },
    ...partial,
  };
}

describe('buildDialogueGuardNote', () => {
  it('rewrites provider @Image tokens back to semantic mentions before saving editable storyboard prompts', () => {
    const bundle: ShotReferenceBundle = {
      items: [
        {
          kind: 'scene',
          id: 'scene_room',
          label: '场景：叶赎居所室内',
          source: 'https://example.com/scene.png',
          mentionToken: '@scene_room',
          priority: 80,
        },
        {
          kind: 'character',
          id: 'char_yeshu',
          label: '角色：叶赎',
          source: 'https://example.com/char.png',
          mentionToken: '@char_yeshu',
          priority: 70,
        },
      ],
      hasGridAnchor: false,
      hasShotImage: false,
      capacity: { maxRefs: 6, truncatedCount: 0, truncatedKinds: [] },
    };

    const cleaned = rewriteProviderImageTokensToMentions(
      '@Image 1 叶赎居所室内，@Image 2 叶赎抬头。@图片3 不存在。',
      bundle,
    );

    expect(cleaned).toBe('@scene_room 叶赎居所室内，@char_yeshu 叶赎抬头。 不存在。');
    expect(cleaned).not.toContain('@Image');
    expect(cleaned).not.toContain('@图片');
  });

  it('does not expose static character appearance in multi-ref baseline when a reference image exists', () => {
    // Character.appearance 字段已删，外观文本现在直接是 prompt 的一部分。
    const character = {
      id: '1778207028644_1',
      name: '小白',
      role: 'supporting',
      prompt: '小白，银白色齐腰长发披散，浅紫色大眼睛，脸颊带婴儿肥，身穿淡粉色丝绸交领短袖短衫，白色百褶短裙。',
      media: {
        costumePhoto: { url: 'https://example.com/xiaobai.png' },
      },
    } as unknown as Character;

    const baseline = formatCharacterMappingBaseline([character], 'multi-ref');

    expect(baseline).toContain('@char_1778207028644_1 小白');
    expect(baseline).toContain('外观身份以绑定参考图为准');
    expect(baseline).toContain('禁止展开发型、脸型、眼睛、体型、常规服装颜色材质、常规配饰');
    expect(baseline).not.toContain('银白色齐腰长发');
    expect(baseline).not.toContain('浅紫色大眼睛');
    expect(baseline).not.toContain('淡粉色丝绸交领短袖短衫');
  });

  it('uses the reference bundle as the source of truth for suppressing character appearance', () => {
    const character = {
      id: '1778207028644_1',
      name: '小白',
      role: 'supporting',
      prompt: '小白，银白色齐腰长发披散，浅紫色大眼睛，身穿淡粉色短衫。',
    } as unknown as Character;
    const referenceBundle: ShotReferenceBundle = {
      items: [{
        kind: 'character',
        id: character.id,
        label: '小白（角色）',
        source: 'https://example.com/xiaobai.png',
        mentionToken: '@char_1778207028644_1',
        priority: 80,
        assetId: character.id,
      }],
      hasGridAnchor: false,
      hasShotImage: false,
      capacity: { maxRefs: 6, truncatedCount: 0, truncatedKinds: [] },
    };

    const baseline = formatCharacterMappingBaseline([character], 'multi-ref', referenceBundle);

    expect(baseline).toContain('外观身份以绑定参考图为准');
    expect(baseline).not.toContain('银白色齐腰长发');
    expect(baseline).not.toContain('浅紫色大眼睛');
  });

  it('keeps fallback appearance in multi-ref baseline when no character reference image exists', () => {
    const character = {
      id: '1778207028644_0',
      name: '我',
      role: 'protagonist',
      prompt: '我，白色亚麻交领长袖武袍，黑色棉质灯笼裤。',
    } as unknown as Character;

    const baseline = formatCharacterMappingBaseline([character], 'multi-ref');

    expect(baseline).toContain('@char_1778207028644_0 我');
    expect(baseline).toContain('白色亚麻交领长袖武袍');
    expect(baseline).not.toContain('外观身份以绑定参考图为准');
  });

  it('treats third-person narration as non-spoken text', () => {
    const note = buildDialogueGuardNote(
      '沈鹿睁开眼，心里一沉。哪里不对。这不是她的卧室。',
      ['沈鹿'],
    );

    expect(note).toContain('本分镜显式口播台词（DIALOGUE）：无');
    expect(note).toContain('不得补写台词');
    expect(note).toContain('第一人称叙述、转述句、心理活动、认知句、环境说明、作者说明都不能原句塞进对白');
  });

  it('extracts explicit spoken dialogue from role-prefix lines', () => {
    const note = buildDialogueGuardNote(
      '沈鹿：这不是我的卧室。\n旁白：她瞬间清醒。',
      ['沈鹿'],
    );

    expect(note).toContain('本分镜显式口播台词（DIALOGUE，必须逐字进入最终"对白提示词"字段）：');
    expect(note).toContain('- 沈鹿：这不是我的卧室。');
    expect(note).toContain('本分镜显式 OS/OV / 旁白（VOICEOVER');
    expect(note).toContain('- 她瞬间清醒。');
  });

  it('keeps shot.dialogue as explicit dialogue even when scriptLines do not include it', () => {
    const note = buildDialogueGuardNote(
      '陈玄整理道袍，把书递给李应陵。',
      ['陈玄', '李应陵'],
      '李应陵：师傅，换一本呗？\n陈玄：修了就知道。',
    );

    expect(note).toContain('必须逐字进入最终"对白提示词"字段');
    expect(note).toContain('- 李应陵：师傅，换一本呗？');
    expect(note).toContain('- 陈玄：修了就知道。');
  });

  it('requires first-person narrated reports to become real scene dialogue with corrected pronouns', () => {
    const note = buildDialogueGuardNote(
      '小白悬在半空，抬手指向我。',
      ['我', '小白'],
      '她自称天道，说要帮我夺回气运',
    );

    expect(note).toContain('本分镜已转写的本源剧情对白 / 动作素材');
    expect(note).toContain('小白：我是天道，我可以帮你夺回气运');
    expect(note).not.toContain('→');
    expect(note).not.toContain('改写为真实剧情对白');
    expect(note).not.toContain('她自称天道，说要帮我夺回气运');
  });

  it('in drama mode rewrites first-person tweet narration into short protagonist dialogue', () => {
    const note = buildDialogueGuardNote(
      '我忽然意识到，这不是我的房间。\n我不能就这么认命。',
      ['我', '小白'],
      '',
      'drama',
    );

    expect(note).toContain('【项目叙事模式：剧情模式 —— 影视化叙事，画面独立讲故事】');
    expect(note).toContain('我：不对，这不对劲。');
    expect(note).toContain('我：我不能就这么认命。');
  });

  it('in narration mode does not force first-person tweet narration into dialogue', () => {
    const note = buildDialogueGuardNote(
      '我忽然意识到，这不是我的房间。\n我不能就这么认命。',
      ['我', '小白'],
      '',
      'narration',
    );

    expect(note).toContain('【项目叙事模式：解说模式 —— 解说字幕驱动画面】');
    expect(note).toContain('不主动把第一人称解说改写成角色对白');
    expect(note).not.toContain('我：不对，这不对劲。');
    expect(note).not.toContain('我：我不能就这么认命。');
  });

  it('does not duplicate shot.dialogue when it is also appended to script content', () => {
    const note = buildDialogueGuardNote(
      '陈玄整理道袍。\n【分镜台词字段】\n李应陵：师傅，换一本呗？',
      ['李应陵'],
      '李应陵：师傅，换一本呗？',
    );

    expect(note.match(/李应陵：师傅，换一本呗？/g)).toHaveLength(1);
  });

  it('extracts explicit self-talk only when a speech cue exists', () => {
    const note = buildDialogueGuardNote(
      '沈鹿盯着天花板，低声说：\"哪里不对。\"',
      ['沈鹿'],
    );

    expect(note).toContain('- 哪里不对。');
  });

  it('treats social media comments / 弹幕 / 字幕 as COMMENTARY (not dialogue / not voiceover)', () => {
    const note = buildDialogueGuardNote(
      '沈鹿坐在床上发呆。\n网友评论：好惨啊\n弹幕："这剧情666"\n字幕：第三日',
      ['沈鹿'],
    );

    expect(note).toContain('本分镜显式口播台词（DIALOGUE）：无');
    expect(note).toContain('本分镜社交评论 / 弹幕 / 字幕 / 第三方文本（COMMENTARY');
    expect(note).toContain('- 好惨啊');
    expect(note).toContain('- 这剧情666');
    expect(note).toContain('- 第三日');
    expect(note).toContain('禁止改写为角色对白');
  });

  it('strips leaked self-check blocks from video prompt responses', () => {
    const cleaned = sanitizeVideoPromptResult([
      '整体画风：中国古代卡通3D风格。',
      '对白提示词：陈玄：修了就知道。',
      '精确时长：15秒',
      '',
      '【自检】',
      '- [x] 总字数 ≤ 1500',
      '- [x] 没有心理描写',
    ].join('\n'));

    expect(cleaned).toBe([
      '整体画风：中国古代卡通3D风格。',
      '对白提示词：陈玄：修了就知道。',
      '精确时长：15秒',
    ].join('\n'));
  });

  it('patches missing explicit shot dialogue into the final video prompt', () => {
    const prompt = ensureExplicitDialogueInVideoPrompt(
      '整体画风：中国古代卡通3D风格。\n对白提示词：无\n精确时长：15秒',
      '李应陵：师傅，换一本呗？',
    );

    expect(prompt).toContain('对白提示词：李应陵：师傅，换一本呗？');
    expect(prompt).not.toContain('对白提示词：无');
  });

  it('patches first-person narration as corrected scene dialogue instead of verbatim narration', () => {
    const prompt = ensureExplicitDialogueInVideoPrompt(
      '整体画风：中国古代卡通3D风格。\n对白提示词：无\n精确时长：15秒',
      '她自称天道，说要帮我夺回气运',
      ['我', '小白'],
    );

    expect(prompt).toContain('对白提示词：小白：我是天道，我可以帮你夺回气运');
    expect(prompt).not.toContain('她自称天道，说要帮我夺回气运');
  });

  it('does not duplicate corrected narration dialogue when the speech text already exists', () => {
    const prompt = ensureExplicitDialogueInVideoPrompt(
      '整体画风：中国古代卡通3D风格。\n对白提示词：角色 @char_x 小白 对 角色 @char_me 我 台词：『我是天道，我可以帮你夺回气运』\n精确时长：15秒',
      '她自称天道，说要帮我夺回气运',
      ['我', '小白'],
    );

    expect(prompt.match(/我是天道，我可以帮你夺回气运/g)).toHaveLength(1);
    expect(prompt).not.toContain('她自称天道，说要帮我夺回气运');
  });

  it('does not patch first-person narration as dialogue in narration mode', () => {
    const prompt = ensureExplicitDialogueInVideoPrompt(
      '整体画风：中国古代卡通3D风格。\n对白提示词：无\n精确时长：15秒',
      '她自称天道，说要帮我夺回气运',
      ['我', '小白'],
      'narration',
    );

    expect(prompt).toContain('对白提示词：无');
    expect(prompt).not.toContain('小白：我是天道，我可以帮你夺回气运');
    expect(prompt).not.toContain('她自称天道，说要帮我夺回气运');
  });

  it('removes leaked narrative report fragments from dialogue prompt output', () => {
    const cleaned = sanitizeVideoPromptResult(
      '整体画风：玄幻写实风格。\n对白提示词：小白（急切）：「她自称天道，说要帮我夺回气运；我（反感）：「你说的这些词，怎么可能组成一句话；她自称天道，说要帮我夺回气运\n精确时长：15秒',
    );

    expect(cleaned).toContain('对白提示词：我（反感）：「你说的这些词，怎么可能组成一句话');
    expect(cleaned).not.toContain('她自称天道，说要帮我夺回气运');
  });

  it('keeps manually written dialogue entries that contain narration-like words inside 台词 markers', () => {
    const cleaned = sanitizeVideoPromptResult(
      '整体画风：动漫风格\n对白提示词：叶赎 台词：『我叫叶赎，好不容易踏上仙途。刚做了一桌好菜准备庆祝，结果遇到了一个自称天道的小萝莉！』；小白 台词：『我是天道！你看这段画面。』\n精确时长：15秒',
    );

    expect(cleaned).toContain('叶赎 台词：『我叫叶赎，好不容易踏上仙途。刚做了一桌好菜准备庆祝，结果遇到了一个自称天道的小萝莉！』');
    expect(cleaned).toContain('小白 台词：『我是天道！你看这段画面。』');
  });

  it('does not truncate content after exact duration while cleaning only the bad prefix', () => {
    const cleaned = sanitizeVideoPromptResult([
      '镜头1-镜头4 整体画风：玄幻写实风格。',
      '角色动作提示词：镜头1 侧躺；镜头2 睁眼；镜头3 戒指特写；镜头4 坐起。',
      '对白提示词：无',
      '精确时长：15秒',
      '',
      '镜头 1（3.75 秒，对应 2×2 四宫格 左上 = cell 1）：',
      '- 景别 + 机位：中景，30度侧拍。',
      '- 台词：无',
    ].join('\n'));

    expect(cleaned).toBe([
      '整体画风：玄幻写实风格。',
      '角色动作提示词：镜头1 侧躺；镜头2 睁眼；镜头3 戒指特写；镜头4 坐起。',
      '对白提示词：无',
      '精确时长：15秒',
      '',
      '镜头 1（3.75 秒，对应 2×2 四宫格 左上 = cell 1）：',
      '- 景别 + 机位：中景，30度侧拍。',
      '- 台词：无',
    ].join('\n'));
  });
});

describe('ShotPromptService storyboard prompt variables', () => {
  it('passes project title, project type, shot duration and constraints into the storyboard template', async () => {
    const { ShotPromptService } = await import('./ShotPromptService');
    const projectStore = await import('../store/projectStore');
    const promptTemplates = await import('../store/promptTemplates');

    vi.mocked(projectStore.loadProject).mockResolvedValue({
      id: 'project-1',
      title: '叶赎修仙异闻录',
      genre: '修仙玄幻',
      mode: 'drama',
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(projectStore.loadScenes).mockResolvedValue([{ id: 'scene_room', name: '叶赎居所' }] as any);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadEpisodeShots).mockResolvedValue([]);

    const service = new ShotPromptService(createContext());
    await service.generateSpecialImageShotPrompt(
      createStoryboardShot(),
      [{ id: 'char_yeshu', name: '叶赎', role: 'protagonist', prompt: '青年修士' } as Character],
      '修仙玄幻写实',
    );

    expect(promptTemplates.resolvePromptTemplate).toHaveBeenCalledWith(
      'storyboard_shot_prompt_generation',
      expect.objectContaining({
        projectTitle: '叶赎修仙异闻录',
        projectSubtitle: '短片分镜设计',
        shootingFormat: '单机位',
        projectType: '修仙玄幻',
        shotDurationSeconds: '15',
        storyboardConstraints: '镜头数量由剧情节奏决定 / 1 个角色 / 1 个场景',
      }),
    );
  });

  it('passes previous storyboard image reference into the storyboard template variables', async () => {
    const { ShotPromptService } = await import('./ShotPromptService');
    const projectStore = await import('../store/projectStore');
    const promptTemplates = await import('../store/promptTemplates');

    vi.mocked(projectStore.loadProject).mockResolvedValue({
      id: 'project-1',
      title: '叶赎修仙异闻录',
      genre: '修仙玄幻',
      mode: 'drama',
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(projectStore.loadScenes).mockResolvedValue([{ id: 'scene_room', name: '叶赎居所' }] as any);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadEpisodeShots).mockResolvedValue([
      createStoryboardShot({
        id: 'shot-prev',
        media: {
          images: [createImageAsset('/tmp/prev-storyboard.png')],
          currentImageIndex: 0,
        },
      }),
      createStoryboardShot({ id: 'shot-current' }),
    ]);

    const service = new ShotPromptService(createContext());
    await service.generateSpecialImageShotPrompt(
      createStoryboardShot({ id: 'shot-current' }),
      [{ id: 'char_yeshu', name: '叶赎', role: 'protagonist', prompt: '青年修士' } as Character],
      '修仙玄幻写实',
    );

    expect(promptTemplates.resolvePromptTemplate).toHaveBeenCalledWith(
      'storyboard_shot_prompt_generation',
      expect.objectContaining({
        referenceTable: expect.stringContaining('@previous_storyboard_anchor'),
        storyboardContinuityNotice: expect.stringContaining('@previous_storyboard_anchor'),
      }),
    );
  });

  it('uses the provided shots snapshot for previous storyboard references before reading stale storage', async () => {
    const { ShotPromptService } = await import('./ShotPromptService');
    const projectStore = await import('../store/projectStore');
    const promptTemplates = await import('../store/promptTemplates');

    vi.mocked(projectStore.loadProject).mockResolvedValue({
      id: 'project-1',
      title: '叶赎修仙异闻录',
      genre: '修仙玄幻',
      mode: 'drama',
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(projectStore.loadScenes).mockResolvedValue([{ id: 'scene_room', name: '叶赎居所' }] as any);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadEpisodeShots).mockResolvedValue([]);

    const previous = createStoryboardShot({
      id: 'shot-prev',
      media: {
        images: [createImageAsset('/tmp/prev-storyboard.png')],
        currentImageIndex: 0,
      },
    });
    const current = createStoryboardShot({ id: 'shot-current' });
    const service = new ShotPromptService(createContext());

    await service.generateSpecialImageShotPrompt(
      current,
      [{ id: 'char_yeshu', name: '叶赎', role: 'protagonist', prompt: '青年修士' } as Character],
      '修仙玄幻写实',
      undefined,
      [previous, current],
    );

    expect(promptTemplates.resolvePromptTemplate).toHaveBeenCalledWith(
      'storyboard_shot_prompt_generation',
      expect.objectContaining({
        referenceTable: expect.stringContaining('@previous_storyboard_anchor'),
        storyboardContinuityNotice: expect.stringContaining('@previous_storyboard_anchor'),
      }),
    );
  });

  it('rewrites false no-previous storyboard continuity when a previous anchor exists', async () => {
    const { ShotPromptService } = await import('./ShotPromptService');
    const projectStore = await import('../store/projectStore');

    vi.mocked(projectStore.loadProject).mockResolvedValue({
      id: 'project-1',
      title: '叶赎修仙异闻录',
      genre: '修仙玄幻',
      mode: 'drama',
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(projectStore.loadScenes).mockResolvedValue([{ id: 'scene_room', name: '叶赎居所' }] as any);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadEpisodeShots).mockResolvedValue([]);

    const previous = createStoryboardShot({
      id: 'shot-prev',
      media: {
        images: [createImageAsset('/tmp/prev-storyboard.png')],
        currentImageIndex: 0,
      },
    });
    const current = createStoryboardShot({ id: 'shot-current' });
    const chat = vi.fn(async () => [
      '## 连续性：无上一故事板参考，按当前分镜建立起始状态。角色首次登场。',
      '## 【场景设计区】：@scene_room 叶赎居所。继承上一故事板无参考，按第一镜建立。',
    ].join('\n'));
    const service = new ShotPromptService(createContext({
      llmProvider: {
        chat,
        stream: vi.fn(),
      } as unknown as CreationContext['llmProvider'],
    }));

    const result = await service.generateSpecialImageShotPrompt(
      current,
      [{ id: 'char_yeshu', name: '叶赎', role: 'protagonist', prompt: '青年修士' } as Character],
      '修仙玄幻写实',
      undefined,
      [previous, current],
    );

    expect(result).toContain('@previous_storyboard_anchor');
    expect(result).not.toContain('无上一故事板参考');
    expect(result).not.toContain('继承上一故事板无参考');
    expect(result).not.toContain('按第一镜建立');
  });
});

type ChatMessage = { role: string; content: string };

/** 跑一次视频提示词推理，返回落库结果 + LLM 实际收到的 user 段。 */
async function runVideoPrompt(options: {
  shot: Shot;
  characters: Character[];
  chatResult: string;
}): Promise<{ result: string; userMessage: string }> {
  const { ShotPromptService } = await import('./ShotPromptService');
  const projectStore = await import('../store/projectStore');

  vi.mocked(projectStore.loadScenes).mockResolvedValue([{ id: 'scene_room', name: '叶赎居所' }] as any);
  vi.mocked(projectStore.loadProps).mockResolvedValue([]);
  vi.mocked(projectStore.loadEpisodeShots).mockResolvedValue([]);

  const chat = vi.fn(async (_messages: ChatMessage[]) => options.chatResult);
  const service = new ShotPromptService(createContext({
    llmProvider: { chat, stream: vi.fn() } as unknown as CreationContext['llmProvider'],
  }));
  const { videoPrompt } = await service.generateDualShotPrompts(
    options.shot,
    options.characters,
    '',
    { image: false, video: true },
  );
  const messages = chat.mock.calls[0]?.[0] ?? [];
  return {
    result: videoPrompt,
    userMessage: messages.find(m => m.role === 'user')?.content ?? '',
  };
}

/** 多参模式的普通分镜（避免走宫格 / 故事板分支）。 */
function createVideoShot(partial?: Partial<Shot>): Shot {
  return createStoryboardShot({
    id: 'shot-current',
    imageMode: 'normal',
    videoMode: 'multi-ref',
    duration: 10,
    ...partial,
  });
}

const YESHU: Character = { id: 'char_yeshu', name: '叶赎', role: 'protagonist', prompt: '青年修士' } as Character;

describe('ShotPromptService 视频提示词的上一镜尾帧承接', () => {
  /** 已截取并绑定上一镜真实尾帧的分镜。 */
  function createShotWithTailFrame(): Shot {
    return createVideoShot({
      videoReference: {
        mode: 'manual',
        usePreviousTailFrame: true,
        sourceShotId: 'shot-prev',
        referenceFrame: createImageAsset('/tmp/prev-tail.jpg'),
        capturedAt: 1,
      },
    } as Partial<Shot>);
  }

  const runWithTailFrame = (chatResult: string) => runVideoPrompt({
    shot: createShotWithTailFrame(),
    characters: [YESHU],
    chatResult,
  });

  it('把尾帧承接约束和 @previous_tail_frame 映射符送进推理输入', async () => {
    const { userMessage } = await runWithTailFrame('画面描述：叶赎抬头。\n精确时长：10秒');

    expect(userMessage).toContain('【尾帧承接约束');
    expect(userMessage).toContain('承接上一分镜：@previous_tail_frame 上一分镜尾帧');
    // mappingSchemaNote 的"只能使用清单内对象"不得再把尾帧排除在外
    expect(userMessage).toContain('- 上一分镜尾帧：`@previous_tail_frame 上一分镜尾帧`');
  });

  it('LLM 漏写承接句时，落库的视频提示词兜底补上尾帧引用', async () => {
    const { result } = await runWithTailFrame('画面描述：叶赎抬头看向光幕。\n精确时长：10秒');

    expect(result.startsWith('承接上一分镜：@previous_tail_frame 上一分镜尾帧')).toBe(true);
    expect(result).toContain('画面描述：叶赎抬头看向光幕。');
  });

  it('LLM 已写承接句时不重复追加', async () => {
    const llmOutput = [
      '承接上一分镜：@previous_tail_frame 上一分镜尾帧 —— 叶赎仍侧身站在窗前，右手停在半抬处。',
      '画面描述：叶赎抬头看向光幕。',
      '精确时长：10秒',
    ].join('\n');
    const { result } = await runWithTailFrame(llmOutput);

    expect(result.match(/@previous_tail_frame/g)).toHaveLength(1);
    expect(result).toBe(llmOutput);
  });

  it('首行之后重复的尾帧映射符降级成纯文本，只保留一处引用', async () => {
    const { result, userMessage } = await runWithTailFrame([
      '承接上一分镜：@previous_tail_frame 上一分镜尾帧 —— 叶赎坐于桌边。',
      '画面描述：承接 @previous_tail_frame 上一分镜尾帧，破木屋内部。',
      '角色提示词：承接 @previous_tail_frame 上一分镜尾帧 的坐姿。',
      '呼应提示词：上分镜末帧 @previous_tail_frame 为两人对峙。',
      '精确时长：10秒',
    ].join('\n'));

    expect(result.match(/@previous_tail_frame/g)).toHaveLength(1);
    expect(result.split('\n')[0]).toBe('承接上一分镜：@previous_tail_frame 上一分镜尾帧 —— 叶赎坐于桌边。');
    expect(result).toContain('画面描述：承接 上一镜尾帧，破木屋内部。');
    expect(result).toContain('角色提示词：承接 上一镜尾帧 的坐姿。');
    expect(result).toContain('呼应提示词：上分镜末帧 上一镜尾帧 为两人对峙。');
    // 推理侧也要明说只写一次，别等兜底去删
    expect(userMessage).toContain('全文只允许出现这一次');
  });

  it('未绑定尾帧的分镜不注入承接约束，也不改写推理结果', async () => {
    const { result, userMessage } = await runVideoPrompt({
      shot: createVideoShot(),
      characters: [YESHU],
      chatResult: '画面描述：叶赎抬头。\n精确时长：10秒',
    });

    expect(userMessage).not.toContain('【尾帧承接约束');
    expect(result).not.toContain('@previous_tail_frame');
  });
});

describe('ShotPromptService 视频提示词的角色音色映射', () => {
  const VOICED: Character = { ...YESHU, voiceId: 'builtin-koma-voice-cherry' } as Character;

  it('把音色映射约束和 @char_<id>-音色 送进推理输入', async () => {
    const promptTemplates = await import('../store/promptTemplates');
    const { userMessage } = await runVideoPrompt({
      shot: createVideoShot(),
      characters: [VOICED],
      chatResult: '角色提示词：@char_yeshu 叶赎 抬头。\n精确时长：10秒',
    });

    expect(userMessage).toContain('【音色映射约束');
    // 映射符清单要带上音色，"只能使用清单内对象"才不会把音色映射符一起挡掉
    expect(userMessage).toContain('`@char_yeshu 叶赎 音色 @char_yeshu-音色`');
    // 模板里的资产基准库同样带音色，baseline 与最终输出格式保持一致
    expect(promptTemplates.resolvePromptTemplate).toHaveBeenCalledWith(
      'shot_video_10s_multi',
      expect.objectContaining({
        characters: expect.stringContaining('- @char_yeshu 叶赎 音色 @char_yeshu-音色：'),
      }),
    );
  });

  it('LLM 漏写音色映射符时，在角色首次出现处就地补齐', async () => {
    const { result } = await runVideoPrompt({
      shot: createVideoShot(),
      characters: [VOICED],
      chatResult: '角色提示词：@char_yeshu 叶赎 抬头看向光幕。\n精确时长：10秒',
    });

    expect(result).toContain('角色提示词：@char_yeshu 叶赎 音色 @char_yeshu-音色 抬头看向光幕。');
    expect(result.match(/@char_yeshu-音色/g)).toHaveLength(1);
  });

  it('正文完全没提到该角色时，音色兜底行插在精确时长之前', async () => {
    const { result } = await runVideoPrompt({
      shot: createVideoShot(),
      characters: [VOICED],
      chatResult: '画面描述：空镜，窗外雨声。\n精确时长：10秒',
    });

    expect(result).toContain('音色提示词：@char_yeshu 叶赎 音色 @char_yeshu-音色');
    expect(result.trim().endsWith('精确时长：10秒')).toBe(true);
  });

  it('LLM 已写音色映射符时不重复补', async () => {
    const llmOutput = [
      '角色提示词：@char_yeshu 叶赎 音色 @char_yeshu-音色，抬头看向光幕。',
      '精确时长：10秒',
    ].join('\n');
    const { result } = await runVideoPrompt({
      shot: createVideoShot(),
      characters: [VOICED],
      chatResult: llmOutput,
    });

    expect(result).toBe(llmOutput);
  });

  it('角色未绑定音色时不注入音色约束，也不改写推理结果', async () => {
    const { result, userMessage } = await runVideoPrompt({
      shot: createVideoShot(),
      characters: [YESHU],
      chatResult: '角色提示词：@char_yeshu 叶赎 抬头。\n精确时长：10秒',
    });

    expect(userMessage).not.toContain('【音色映射约束');
    expect(result).not.toContain('-音色');
  });
});

describe('推理约束段全部由可编辑模板驱动', () => {
  const VOICED: Character = {
    id: 'char_yeshu', name: '叶赎', role: 'protagonist', prompt: '青年修士',
    voiceId: 'builtin-koma-voice-cherry',
  } as Character;

  /** 有尾帧 + 有音色 + 有场景 → 五段约束会全部注入。 */
  function createFullyLoadedShot(): Shot {
    return createStoryboardShot({
      id: 'shot-current',
      imageMode: 'normal',
      videoMode: 'multi-ref',
      duration: 10,
      videoReference: {
        mode: 'manual',
        usePreviousTailFrame: true,
        sourceShotId: 'shot-prev',
        referenceFrame: createImageAsset('/tmp/prev-tail.jpg'),
        capturedAt: 1,
      },
    } as Partial<Shot>);
  }

  it('五段约束都走 resolvePromptTemplate，用户改模板即改推理输入', async () => {
    const promptTemplates = await import('../store/promptTemplates');
    await runVideoPrompt({
      shot: createFullyLoadedShot(),
      characters: [VOICED],
      chatResult: '画面描述：x\n精确时长：10秒',
    });

    const resolvedIds = vi.mocked(promptTemplates.resolvePromptTemplate).mock.calls.map(c => c[0]);
    expect(resolvedIds).toEqual(expect.arrayContaining([
      'shot_directive_mapping_schema',
      'shot_directive_spatial_multiref',
      'shot_directive_tail_frame',
      'shot_directive_voice_mention',
      'shot_directive_output_boundary',
    ]));
  });

  it('用户改写约束模板后，改动直接出现在送给 LLM 的 user 段里', async () => {
    const promptTemplates = await import('../store/promptTemplates');
    vi.mocked(promptTemplates.resolvePromptTemplate).mockImplementation(async (id: string) => ({
      prompt: id === 'shot_directive_tail_frame'
        ? '【我自己写的尾帧规则】只写一次 @previous_tail_frame。'
        : (id === 'shot_prompt_system' ? 'system prompt' : 'resolved prompt'),
      source: 'custom',
      template: { id },
    }) as any);

    const { userMessage } = await runVideoPrompt({
      shot: createFullyLoadedShot(),
      characters: [VOICED],
      chatResult: '画面描述：x\n精确时长：10秒',
    });

    expect(userMessage).toContain('【我自己写的尾帧规则】');
    expect(userMessage).not.toContain('【尾帧承接约束');
  });

  it('约束模板解析失败时只跳过该段，推理不中断', async () => {
    const promptTemplates = await import('../store/promptTemplates');
    vi.mocked(promptTemplates.resolvePromptTemplate).mockImplementation(async (id: string) => {
      if (id === 'shot_directive_voice_mention') throw new Error('模板被删了');
      return {
        prompt: id === 'shot_prompt_system' ? 'system prompt' : 'resolved prompt',
        source: 'default',
        template: { id },
      } as any;
    });

    const { result, userMessage } = await runVideoPrompt({
      shot: createFullyLoadedShot(),
      characters: [VOICED],
      chatResult: '画面描述：x\n精确时长：10秒',
    });

    expect(result).toContain('画面描述：x');
    expect(userMessage).toContain('resolved prompt');
  });
});
