/**
 * 内置默认 Prompt 模板（纯数据，无逻辑）
 * 修改模板内容只动这个文件；新增模板类型需同步 types.ts 的 PromptTemplateType
 */
import type { PromptTemplateType, PromptTemplate } from './types';
import { variable } from './variables';
import { VIDEO_REASONING_TEMPLATE_CONTENT } from '../templates/videoReasoning';
import { SHOT_DIRECTIVE_TEMPLATE_CONTENT } from '../templates/directives';
import { DRAMA_GENRE_ANALYSIS_TEMPLATE, GENRE_CARD_CONTENT } from '../templates/genreCards';

export const DEFAULT_TEMPLATES: Record<PromptTemplateType, PromptTemplate> = {
  // ========== 全局约束模板（自动注入到 TTI / ITV 模板） ==========

  global_positive_prefix: {
    id: 'global_positive_prefix',
    category: 'global',
    name: '全局前置正向约束',
    description: '通用一致性 + 高质量约束，会被 TTI/ITV 模板里的 {{globalPositivePrefix}} 占位符自动注入',
    template: `严格遵循当前输入提示词与参考图，不自由发挥，不新增文案外人物、场景、物件、动作、台词。保持人物身份一致、画风一致、构图稳定、比例真实、细节清晰、8k 高质量、sharp focus, high detail, clean composition, consistent style, accurate anatomy.`,
    variables: [],
    isCustom: false,
  },

  global_positive_suffix: {
    id: 'global_positive_suffix',
    category: 'global',
    name: '全局后置正向约束',
    description: '人物 / 场景稳定 + 视频首帧一致性约束，会被 {{globalPositiveSuffix}} 占位符自动注入',
    template: `优先保证人物稳定、站位稳定、朝向稳定、服装稳定、发型稳定、场景稳定、道具稳定。若为单图生视频任务，必须保持首帧一致性、镜头稳定、动作自然、避免人物乱跑、避免无依据运镜、避免无依据动作强化。无字幕，无中文文字，无水印，无 logo。`,
    variables: [],
    isCustom: false,
  },

  global_negative_suffix: {
    id: 'global_negative_suffix',
    category: 'global',
    name: '全局后置负向约束',
    description: '畸形 / drift / 字幕水印禁项，会被 {{globalNegativeSuffix}} 占位符自动注入；通常拼到 negative prompt 区域',
    template: `low quality, blurry, out of focus, worst quality, normal quality, lowres, jpeg artifacts, text, subtitle, watermark, logo, signature, username, extra people, extra character, duplicate person, wrong character, face drift, hairstyle drift, costume drift, accessory drift, prop drift, scene drift, bad anatomy, deformed body, malformed limbs, extra arms, extra legs, extra hands, extra fingers, missing fingers, fused fingers, broken hands, broken face, distorted eyes, cross-eyed, wrong proportions, bad perspective, cropped body, floating body, disconnected limbs, mutation, messy composition`,
    variables: [],
    isCustom: false,
  },

  global_video_constraints: {
    id: 'global_video_constraints',
    category: 'global',
    name: '全局视频规约',
    description: '视频生成专用规约（前 0.15 秒废帧、首帧一致性、动作约束等），会被视频类模板里的 {{globalVideoConstraints}} 占位符自动注入',
    template: `视频前 0.15 秒为废帧，严格遵循当前输入提示词与参考图，不自由发挥，不新增文案外人物、场景、物件、动作、台词。优先保证人物身份一致、站位稳定、朝向稳定、服装稳定、发型稳定、场景稳定、道具稳定、画风一致、比例真实、细节清晰。若为单图生视频任务，必须保持首帧一致性、镜头稳定、动作自然，禁止人物乱跑、禁止无依据运镜、禁止无依据大幅动作、禁止无依据景别变化。high detail, sharp focus, clean composition, consistent style, accurate anatomy. 无字幕，无中文文字，无水印，无 logo。`,
    variables: [],
    isCustom: false,
  },

  // ========== 系统提示模板 ==========

  shot_prompt_system: {
    id: 'shot_prompt_system',
    category: 'system',
    name: '分镜提示词系统提示',
    description: '生成分镜提示词时的系统角色定义',
    template: `你是一个专业的视频提示词生成专家。你的任务是为视频生成模型编写高质量的中文提示词。

要求：
1. 提示词使用中文描述
2. 如果需要引用资产，使用显式的 @mentions 形式：
   - 角色：@char_角色ID
   - 场景：@scene_场景ID
   - 道具：@prop_道具ID
3. 包含运镜描述和景别描述（视频提示词时）
4. 描述要具体、生动，但只写客观可见事实（外观、动作、光线、环境），不要复述剧情或背景设定
5. 直接输出提示词，不要有任何前缀或解释`,
    variables: [],
    isCustom: false,
  },

  shot_breakdown_system: {
    id: 'shot_breakdown_system',
    category: 'system',
    name: '分镜拆解系统提示',
    description: '分镜拆解时的系统角色定义',
    template: `你是一个专业的影视分镜师。你的任务是根据剧本内容，结合给定的角色、场景和道具，生成分镜结构。

每个分镜应该包含：
- scriptContent: 对应的剧本原文
- shotType: 景别（close-up特写/medium中景/wide全景/extreme-wide大全景）
- cameraMovement: 运镜方式（static固定/pan摇镜/zoom-in推镜/tracking跟随/handheld手持）
- duration: 预估时长（秒），{{durationConstraint}}，无法判断时填写 {{durationDefault}} 秒；优先贴近上限 {{durationMax}} 秒
- characters: 出现的角色名列表
- dialogue: 角色台词，格式为"角色名（情绪）：台词内容"，具体生成尺度必须遵守项目叙事模式
- emotion: 画面情绪氛围
- props: 出现的道具名列表
- scenes: 出现的场景名列表
- continuity: 相对上一镜是否需要延续人物站位、动作和空间状态（inherit/independent）
- continuityMode: 承接方式（none/tail-frame/video-extend），判定标准见下方
- continuityReason: 连续性判断的一句话剧情依据

{{dialogueModeDirective}}

【情绪词列表】
高兴、愤怒、悲伤、恐惧、反感、低落、惊讶、自然、急切、平静、激动、呵斥、关心、严肃

【完整覆盖硬性规则】
1. 必须按剧本原文顺序从头到尾拆解，不能跳段、不能只挑“重要情节”、不能摘要式合并中间动作。
2. 每个原文句子/动作/环境变化/视线变化/停顿/台词都必须归入某一个 shot.scriptContent；没有画面变化但承接关系重要的句子也要保留在相邻分镜中。
3. shot.scriptContent 必须优先复制原文连续片段，允许带少量相邻上下文，但禁止改写成概括句；禁止把多个相距较远的原文段落揉成一个摘要。
4. 输出前自检：把所有 shot.scriptContent 连起来，应能覆盖原剧本的主干顺序；若发现遗漏，必须补齐后再返回。

【合镜原则 — 镜头要长】
一个分镜 = 一次视频生成。分镜越碎成片越碎：每切一个新分镜，模型都要重新建立空间与人物，
接缝处必然漂移。所以**默认合并，不默认切分**。
1. duration 优先贴近 {{durationMax}} 秒；把同场景、同一段连续时间的剧情并进同一个分镜。
2. 只有换场景 / 时间跳跃 / 闪回 / 平行叙事 / 剧情硬转折才开新分镜。
   “新动作 / 新说话人 / 新视线目标 / 新道具状态 / 情绪递进”**不是**开新分镜的理由——
   这些是同一分镜**内部的镜头切换**，写在 scriptContent 里即可。
3. 台词长度是时长下限（每 4–5 汉字 ≈ 1 秒），台词多正好撑满长镜头；
   只有超过 {{durationMax}} 秒才拆分。

【视频连续性判断】
每个非首镜必须输出 continuity、continuityMode 与 continuityReason。
- continuity：同一时空的连续动作、视线、人物站位或机位承接填 inherit；明确转场、场景切换、时间跳跃、闪回或平行叙事填 independent。首镜填 independent。
- continuityMode：承接方式，三选一（首镜固定 none）
  - video-extend：本镜是上一镜动作的无缝续演，同一机位或连续运镜、动作没有中断、时间直接接续 → 下游把上一镜整段视频交给模型延长，连贯度最高
  - tail-frame：同一场景、时间连续，但换了机位或景别 → 下游取上一镜末帧作为构图起点
  - none：换场景、时间跳跃、闪回、平行叙事，或需要全新空间建立
该建议只描述剧情关系，不代表已有视频。

注意：不需要生成画面描述(description)提示词，这将在后续步骤生成。`,
    variables: [
      variable('durationConstraint'),
      variable('durationDefault'),
      variable('durationMax', {
        description: '当前视频渠道允许的最大时长（秒）；分镜按它规划长镜头。',
      }),
      variable('projectNarrativeMode', { required: false }),
      variable('dialogueModeDirective', { required: false }),
    ],
    isCustom: false,
  },

  script_analysis_system: {
    id: 'script_analysis_system',
    category: 'system',
    name: '剧本解析系统提示',
    description: '剧本解析时的系统角色定义',
    template: `你是一个专业的影视编剧和分镜师。你的任务是分析用户提供的剧本，提取关键信息。
请严格按照要求的 JSON 格式输出，不要输出任何其他内容。`,
    variables: [],
    isCustom: false,
  },

  // ========== LLM 任务模板 ==========

  random_script_generation: {
    id: 'random_script_generation',
    category: 'script',
    name: '随机剧本生成',
    description: '一步生成完整的随机剧本',
    template: `你是一个专业的编剧，请随机创作一个短视频剧本。

【创作要求】
1. 随机选择一个新颖有趣的主题和风格（如：治愈、搞笑、悬疑、科幻、爱情、职场等）
2. 时长约 {{duration}} 分钟
3. 剧本包含场景描述、角色对话、动作指示
4. 情节紧凑，有明确的开端、发展、高潮、结局
5. 对话自然生动，符合角色性格
6. 每次创作都要有变化，不要重复

【输出格式】
首先用注释标注创意元数据，然后输出完整剧本：

<!--
主题：[故事主题]
风格：[风格类型]
关键元素：[元素1, 元素2, 元素3]
一句话简介：[剧情简介]
-->

## [剧本标题]

### 场景 1：[场景名称]
[场景描述]

**角色A**：对话内容
（动作指示）

**角色B**：对话内容
...

### 场景 2：...
`,
    variables: [variable('duration')],
    isCustom: false,
  },

  script_polish: {
    id: 'script_polish',
    category: 'script',
    name: '剧本润色',
    description: '优化现有剧本的语言和结构',
    template: `你是一个专业的剧本编辑，请润色以下剧本。

原剧本：
{{script}}

润色要求：
- {{requirements}}

请保持原有的故事结构，优化语言表达，使对话更加生动自然，场景描述更加具体形象。

硬性要求：
1. 只返回润色后的完整剧本正文
2. 不要返回任何前言、后记、说明、总结或解释
3. 不要使用 Markdown 标题、粗体、分隔线、代码块
4. 不要补充“以下是润色版”之类提示语
5. 不要改动角色名、集数、场次编号的语义结构
`,
    variables: [variable('script'), variable('requirements')],
    isCustom: false,
  },

  shot_breakdown: {
    id: 'shot_breakdown',
    category: 'analysis',
    name: '分镜拆解（行号切分模式）',
    description: '把已经"推文化"的字幕行剧本切分到分镜，不改写原文，仅输出每镜归属的行号区间',
    template: `你是一位专业的分镜师。下面给你一段已经"推文化"为字幕行格式的剧本，每行已加好编号。
你的任务是把**连续的若干行**划归到一个分镜，输出每个分镜归属的"行号列表"。

【最重要硬约束】
1. **禁止改写、合并、压缩、概括、补充任何字幕行原文**。每一行都必须原样保留在某个分镜里。
2. **禁止跨行重组词序、禁止把相隔的行强行合到一个分镜**。划归到同一分镜的行必须是**连续行号**（如 [3, 4, 5]），不能跳号（如 [3, 5, 7] 是非法）。
3. **必须按字幕行号顺序、连续、不重不漏地覆盖全部行**。所有分镜的 scriptLineIndices 拼起来应等于 [1, 2, 3, ..., N]，N 是字幕总行数。

【时长要求】
每个镜头的 duration {{durationConstraint}}；无法判断时填写 {{durationDefault}}。

【情绪词列表】
高兴、愤怒、悲伤、恐惧、反感、低落、惊讶、自然、急切、平静、激动、呵斥、关心、严肃

已知角色：{{characters}}
已知场景：{{scenes}}
已知道具：{{props}}

项目叙事模式：{{projectNarrativeMode}}
{{dialogueModeDirective}}

【重要】characters、scenes、props 字段必须使用上方"已知角色/场景/道具"列表中的原始名称，不要自行编造或修改名称。如果某分镜涉及的元素不在列表中，则不填入对应字段。

【字幕行剧本（逐行编号）】
{{script}}

【切分原则】
1. 按字幕行号从 1 开始顺序，把连续若干行划归一个分镜，不许跳号。
2. 出现下列任一信号时倾向"开新镜头"：新动作 / 新视线目标 / 新道具状态 / 新空间 / 新说话人 / 情绪转折 / 时间推进。
3. 单镜分配的行数原则上 1–6 行；行数受 duration 约束（每行约 1.5–3 秒，按 duration 折算合理行数）。
4. 不许出现空分镜（scriptLineIndices 为空）。
5. dialogue 字段由项目叙事模式决定：剧情模式可从第一人称推文解说改写少量真实对白；解说模式只保留显式对白或极少必要短反应。
6. 自检：把所有分镜的 scriptLineIndices 按顺序拼起来 = [1, 2, ..., N]，无遗漏、无重复、无乱序。
7. 每个非首镜判断与上一镜的视频连续性：同一时空的连续动作、视线、人物站位或机位承接填 continuity=inherit；明确转场、场景切换、时间跳跃、闪回或平行叙事填 independent。首镜填 independent，并用 continuityReason 简述依据。

【输出 JSON】
\`\`\`json
{
  "shots": [
    {
      "scriptLineIndices": [1, 2, 3],
      "shotType": "close-up/medium/wide/extreme-wide",
      "cameraMovement": "static/pan/zoom-in/tracking/handheld",
      "duration": 6,
      "dialogue": "角色名（情绪）：「台词内容」",
      "characters": ["已知角色名称"],
      "emotion": "情绪标签",
      "props": ["已知道具名称"],
      "scenes": ["已知场景名称"],
      "continuity": "inherit/independent",
      "continuityReason": "同一场景内动作紧接上一镜"
    }
  ]
}
\`\`\`

字段说明：
- \`scriptLineIndices\`：1-based 字幕行号数组，必须连续（如 [3,4,5]），代表本分镜归属哪些行；下游会用这些索引从原剧本切片，不会读取其它字段去重建文本
- 其它字段（shotType / cameraMovement / duration / dialogue / characters / scenes / props / emotion）描述本分镜的镜头语言与元素归属
- \`dialogue\`：必须遵守项目叙事模式；剧情模式中可为第一人称推文素材生成短对白，解说模式不要强行补对白
- \`continuity\`：同一时空的动作、视线、人物站位或机位承接填 inherit；转场、场景/时间变化、闪回或平行叙事填 independent；首镜填 independent
- \`continuityReason\`：用一句可展示给用户的剧情依据说明判断
`,
    variables: [
      variable('script'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('durationConstraint'),
      variable('durationDefault'),
      variable('projectNarrativeMode', { required: false }),
      variable('dialogueModeDirective', { required: false }),
    ],
    isCustom: false,
  },

  shot_breakdown_drama: {
    id: 'shot_breakdown_drama',
    category: 'analysis',
    name: '分镜拆解（剧情模式 · 分镜创作）',
    description: '把小说/剧本拆解为真正的分镜脚本：每镜一段完整自然行文（自带景别/机位/光线/构图的专业画面描述 + 引号台词），为生图生视频提供画面感强的素材，严禁设定堆砌与心理描写。',
    template: `你是一位专业的影视分镜师。下面给你一段剧本（可能是标准分场剧本：场头行"场次号. 场景 · 时间 · 内/外" + 动作行 + 角色名（情绪）："台词" 台词行；也可能带 [旁白]/[台词·角色名]/[场景] 标注，也可能是纯小说文本）。
你的任务不是切分文字，而是**创作分镜**：把剧情拆成一个个镜头，为每个镜头写出一段专业的**分镜脚本**。

【分镜脚本 script 的写法 — 完整一段自然行文，台词用引号】
script 是**一段完整的自然行文**（不是逐行标签），它是后续生图/生视频直接取景的主素材——每句都要自带摄影语言，能被摄影机/生图模型直接还原成画面：

1. **摄影语言（每镜必须明确，自然融入行文，不要列清单）**：
   - **景别**：行文开头点明取景范围——特写 / 近景 / 中景 / 全景 / 大全景（决定生图视野）
   - **机位视角**：平视 / 俯视 / 仰视 / 低机位 / 越肩（决定观看角度）
   - **光线**：光源方向 + 色温 + 明暗对比（如"油灯从侧下暖黄打亮半张脸，身后陷于暗部"）
   - **构图**：主体在画面中的位置、前景/背景层次（如"窗框作前景框住人物，远处山影作后景"）
2. **人物动作**：写姿态、动作细节与可拍的表情（"攥紧剑柄，指节发白"，不写"他很紧张"）；动作按节拍拆开（"转身→抓起→掷出"，不写"两人激战"）。
3. **空间与道具**：场景空间结构（前后景关系、房间布局、开口与通道）、关键道具的状态（桌角豁口、剑鞘划痕）。
4. **台词用引号自然融入**：\`角色名："台词内容"\`，说话人写在引号前（如\`叶赎抬眼："你们来了。"\`），一段可有多句对话。**默认不写旁白/画外音**——剧情模式的听觉主体是人物台词；仅当剧情明确需要内心独白或叙述声音时才写一行"画外音传来：……"，一集里应极少出现。
5. **声音描写**（环境音、音效）并进行文（如：雨声渐弱，远处传来脚步）。

【严禁事项 — 违反任何一条都是废稿】
1. **严禁设定堆砌/知识文本**：不要复述角色外貌设定、身份背景、人物关系、世界观介绍、前情提要。例如禁止写"宁卓，曾是名震江湖的剑客，如今隐姓埋名"这类设定句——分镜脚本只写此刻画面里发生的事。
2. **严禁照抄参考资料**：下方"已知角色/场景/道具"括号里的描述仅供你辨认谁是谁，**一个字都不许抄进 script**；视觉一致性由下游生图步骤负责，与你无关。
3. **严禁心理描写与抽象评价**：不写"他想/她意识到/气氛十分紧张/场面感人"，改写为可见行为（"他攥紧剑柄，指节发白"）。
4. **严禁概括性叙述**：不写"两人展开激战"这类总结句，拆成具体动作节拍。

【严禁事项 — 违反任何一条都是废稿】
1. **严禁设定堆砌/知识文本**：不要复述角色外貌设定、身份背景、人物关系、世界观介绍、前情提要。例如禁止写"宁卓，曾是名震江湖的剑客，如今隐姓埋名"这类设定句——分镜脚本只写此刻画面里发生的事。
2. **严禁照抄参考资料**：下方"已知角色/场景/道具"括号里的描述仅供你辨认谁是谁，**一个字都不许抄进 script**；视觉一致性由下游生图步骤负责，与你无关。
3. **严禁心理描写与抽象评价**：不写"他想/她意识到/气氛十分紧张/场面感人"，改写为可见行为（"他攥紧剑柄，指节发白"）。
4. **严禁概括性叙述**：不写"两人展开激战"这类总结句，拆成具体动作节拍。

【合镜原则 — 镜头要长，节奏放到镜头内部】
一个分镜 = 一次视频生成。**分镜越碎，成片越碎**：每切一个新分镜，模型都要重新建立空间、
人物位置和光线，接缝处必然漂移；而同一个分镜内部的镜头切换是模型在一次生成里完成的，
连贯性天然更好。所以默认策略是**合并，不是切分**。

1. **目标时长 {{durationMax}} 秒**：把同一场景、同一段连续时间里的剧情尽量并进一个分镜，
   duration 优先贴近 {{durationMax}} 秒。只有下列情况才必须开新分镜：
   - 换场景 / 换空间
   - 明确的时间跳跃、闪回、平行叙事
   - 剧情硬转折（需要观众感知到"这是另一场戏"）
   单纯的"新动作 / 新说话人 / 新视线目标 / 情绪递进"**不是**开新分镜的理由——
   它们应该写成同一分镜内部的镜头切换。
2. **镜头内部的节奏用镜头切换承载**：一个长分镜的 script 里要写清内部有几次切镜、
   每次切镜的景别与机位怎么变（如"中景对话 → 切特写手部 → 拉回过肩双人"）。
   下游视频推理会按这个结构在单次生成里排布 2–4 个硬切镜头。
3. **时长下限由台词决定**：duration 必须容纳该镜全部台词 + 旁白的朗读时长
   （按每 4–5 个汉字 ≈ 1 秒估算），不得让配音溢出。台词多正好用来撑满长镜头；
   只有当台词长到超过 {{durationMax}} 秒**才**拆成两个分镜。
4. 每镜 script 写成一段完整行文，长镜头就写长（覆盖内部每次切镜的画面要素），
   不要因为要写得长而灌水复述。
5. 剧本中的台词与关键情节必须全部覆盖到某个分镜，不得遗漏、不得概括性合并。

【与上一镜的承接方式 — 每个非首镜必须判断】
填 continuityMode，三选一（首镜固定 none）：
- **video-extend（整段延长）**：本镜是上一镜动作的**无缝续演**——同一机位或连续运镜、
  人物动作没有中断、时间直接接续（如上镜"举起杯子"、本镜"送到嘴边喝下"）。
  下游会把上一镜**整段视频**交给模型做延长，运镜惯性和动作节奏都能接上，连贯度最高。
- **tail-frame（尾帧承接）**：同一场景、时间也连续，但**换了机位或景别**
  （如上镜中景对话，本镜切到特写）。下游取上一镜末帧作为构图起点。
- **none（独立起镜）**：换场景、时间跳跃、闪回、平行叙事，或需要全新的空间建立。
continuityReason 用一句话说明依据（动作是否连续、机位是否变化、时空是否跳跃）。

【情绪词列表】
高兴、愤怒、悲伤、恐惧、反感、低落、惊讶、自然、急切、平静、激动、呵斥、关心、严肃

已知角色（参考资料，仅供识别，禁止照抄）：{{characters}}
已知场景（参考资料，仅供识别，禁止照抄）：{{scenes}}
已知道具（参考资料，仅供识别，禁止照抄）：{{props}}

【重要】characters、scenes、props 字段必须使用上方"已知角色/场景/道具"列表中的原始名称，不要自行编造或修改名称；某分镜涉及的元素不在列表中则不填入对应字段。

【剧本原文】
{{script}}

【输出前自检】
逐镜检查 script：① 是否有任何一句是设定/背景/外貌清单式复述？② 是否有心理或评价句？③ 是否照抄了参考资料括号内容？④ 台词是否都用引号且说话人已标明（角色名在引号前）？⑤ shotType / cameraMovement 是否为下方规定的枚举值？⑥ **本段剧情的所有主要角色（主角/反派）是否至少出现在一个分镜**？某角色确无本集戏份可以不放，但必须是剧情判断而非遗漏。有则改写为当下可见的画面与动作后再返回。

【字段枚举约束（输出 JSON 时必须遵守，否则会被服务端校验拒绝）】
- shotType 只能是：close-up / medium / wide / extreme-wide
- cameraMovement 只能是：static / pan / zoom-in / tracking / handheld
- duration：{{durationConstraint}}；无法判断时填 {{durationDefault}}。优先贴近 {{durationMax}} 秒
- continuityMode 只能是：none / tail-frame / video-extend

【输出 JSON】
\`\`\`json
{
  "shots": [
    {
      "script": "中景，平视，废弃戏台，雨夜。宁卓独立台中央，背影绷直，手握剑柄微颤；帷幕被风掀起，冷蓝月光从豁口斜切进来，拉出他长而孤的影子。\\n宁卓抬眼：\"你们来了。\"",
      "shotType": "medium",
      "cameraMovement": "static",
      "duration": 6,
      "characters": ["宁卓"],
      "scenes": ["废弃戏台"],
      "props": ["长剑"],
      "emotion": "严肃",
      "continuity": "independent",
      "continuityMode": "none",
      "continuityReason": "本段首镜，建立新的雨夜戏台空间"
    }
  ]
}
\`\`\`

字段说明：
- script：分镜脚本，多行文本。无标记行 = 画面行（场景/动作/构图/光线）；[台词·角色名] 行 = 该角色的台词；[旁白] 行 = 画外音
- dialogue 字段已废弃，一律省略；台词就写在 script 的台词行里
- continuity：相对上一镜的视频末态关系，只能是 inherit / independent
- continuityMode：承接方式，只能是 none / tail-frame / video-extend（判定标准见上方章节）
- continuityReason：说明动作、视线、场景、时间或转场关系的一句话理由
`,
    variables: [
      variable('script'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('durationConstraint'),
      variable('durationDefault'),
      variable('durationMax', {
        description: '当前视频渠道允许的最大时长（秒）。分镜按它规划长镜头，节奏放到镜头内部切换。',
      }),
    ],
    isCustom: false,
  },

  shot_image_prompt_generation: {
    id: 'shot_image_prompt_generation',
    category: 'inference-image',
    name: '分镜图片提示词生成',
    description: '为分镜生成静态图片提示词',
    template: `根据以下分镜信息生成一条静态分镜图片提示词。它必须能作为后续视频提示词的 0 秒画面锚点：同一场景、同一角色状态、同一道具位置、同一光影逻辑，视频只在这张图的基础上展开动作。

{{referenceTable}}

{{gridSequenceNotice}}

> 角色参考图判断：如果上方【视觉参考集合】里列出角色参考图，角色外貌 / 发型 / 脸型 / 眼睛 / 体型 / 常规服装 / 常规配饰以参考图为唯一真相；图片提示词只写角色引用 + 当前静帧姿态、朝向、视线、表情、手部、口型和临时状态，禁止补写静态样貌，避免文字与参考图冲突。

## 输入

剧本内容（唯一真理来源）：{{scriptContent}}
台词字段（只用于判断口型、表情和说话状态；除非剧本明确要求字幕/气泡，否则不要把台词画成文字）：{{dialogueText}}
{{dialogueModeDirective}}
出场角色：{{characters}}
出现场景：{{scenes}}
出场道具：{{props}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}
推荐景别：{{shotTypeHint}}
推荐运镜（只用于选择构图方向，不输出视频动作）：{{cameraMovementHint}}
前后分镜衔接参考（仅供判断本镜起始姿态、站位与空间关系，禁止据此引入文案外的新元素）：
{{adjacentShotsInfo}}
后续视频镜头结构参考（只用于选择首帧 / 关键锚定帧，不要原样输出）：{{shotsSection}}

## 核心规则

1. **客观可见 only**：只描述静止画面中能看见的事实——姿态 / 手部动作 / 道具状态 / 空间关系 / 构图 / 光线。已有角色参考图时，不写人物静态外貌、常规服装和常规配饰；无参考图时才可按角色基准补充必要外观。不复述剧情、不描述心理、不解释事件原因、不写旁白 / 解说 / 评价 / 总结句。
2. **解剖学正确（Anatomically correct）**：人物**必须真实人体可执行**——五指、双眼、双耳、四肢、对称面部、合理关节。**禁止**：手指数量错误 / 多肢体 / 关节反向 / 头身比例失真 / 手部畸形 / 面部扭曲 / 透视畸变。姿势必须有明确重心（脚是否着地 / 手是否扶物 / 坐姿支撑点）。
3. **第三方评论 / 字幕 / 弹幕**：剧本里如有”网友评论””弹幕””字幕””新闻播报””短信””微博”等内容，**绝对不能让人物开口念出**——只能作为画面字幕 / 弹幕 / 手机屏幕等**纯视觉显示**，并写明”字幕：『内容』””手机屏幕显示『内容』”等形式。
4. **画面层次**：画面描述必须有主空间 + 背景/远景 + 前景/近景三层；优先写可见材质、遮挡关系、地面物、光柱/阴影、手部/面部特写对象，避免空泛“氛围感”。
5. **空间精度**：用自然定位词写清人物和道具位置（如“神像底座旁”“地面杂草前景”“门口左侧课桌”）。场景含多个同类物体时才使用编号；不要硬编不存在的床号 / 桌号 / 门号。
6. **情绪可见化**：把”情绪氛围”转成可见线索——表情 / 肢体张力 / 视线方向 / 嘴角 / 眉眼 / 肩颈 / 手指 / 色调 / 明暗对比。
7. **景别构图**：优先用推荐景别，并补一个服务动作的辅景别（如手部特写、眯眼特写、道具特写、系统气泡），让生图能支撑后续视频的主动作。
8. **引用编码**：所有人物 / 场景 / 道具引用**必须使用 \`@<id> <名称>\` 格式**——mention 协议字符串（\`@char_<id>\` / \`@scene_<id>\` / \`@prop_<id>\`）在前，空格分隔，再跟该对象的中文名称（如 \`@char_abc123 周明\`、\`@scene_xyz789 教室\`、\`@prop_def456 钥匙\`）。只有当上方【视觉参考集合】明确列出真实分镜锚定图 / 宫格锚定图时，才允许写 \`@shot_anchor 分镜锚定图\` 或 \`@grid_anchor 网格锚定图\`；如果【视觉参考集合】提示无锚定图或纯文字推理，**禁止**输出 \`@shot_anchor\` / \`@grid_anchor\`。**禁止**只写 mention 不带名称、只写名称不带 mention，或写成 \`<名称> @Image N\` / \`@Image N <名称>\` / \`@角色 <名称>\` 等形式。同一元素每次出现都必须重复完整标注。
9. **跨镜头一致**：已有角色参考图时，人物外观（穿着 / 发型 / 体型 / 常规配饰）只继承参考图，不在提示词里复述或改写；剧情关键持物写入道具或动作。同一场景内的家具 / 陈设 / 光照在不同分镜间保持稳定，不得引入新元素。
10. **输出结构**：直接输出下面字段，字段为空写“无”，不要前言、解释、自检、Markdown checkbox。字段之间用中文句号或分号连接，可保留字段名，方便后续视频提示词对应。

## 出图公式（每条画面描述都要覆盖这 6 层）

**【艺术风格/媒介】+【景别与视角】+【主体描述】+【环境场景】+【光影与色调】+【画质与质感修饰词】**

- **禁止主观评价词**：漂亮 / 帅气 / 很酷 / 唯美 / 高级感 / 有质感 —— 模型无法理解抽象评价，必须换成可见特征（"高级感"→"低饱和冷灰色调 + 大面积留白 + 硬边阴影"）。
- **视角要具体**：45 度侧拍 / 过肩 / 低角度仰拍 / 俯拍 / 眼平，配景别（远景 / 全景 / 中景 / 近景 / 特写 / 大特写）。
- **光影要给情绪指向**：暖金 / 琥珀 = 温暖怀旧；冷蓝 = 孤立不安；红橙 = 紧张危险；青绿 = 病态诡异；低饱和褪色 = 疲惫绝望。写清光源位置、色温、明暗比与阴影形状。
- **景深服务叙事**：浅景深 = 隔离 / 亲密 / 聚焦单人；深景深 = 交代环境信息与人物关系。
- **质感修饰词**要落到物理细节：皮肤毛孔纹理、布料织纹、金属划痕、胶片颗粒感、湿润反光。

## 输出字段

整体画风：[继承风格前缀；如明确，则写具体风格]
景别构图：【主】[推荐景别/主构图]，【辅】[特写对象/中景/系统气泡等]
画面描述：[主空间 + 背景/远景 + 前景/近景；写可见层次、材质、地面物、遮挡关系]
角色提示词：[逐条写 @char_<id> <角色名> + 当前静帧姿态、朝向、视线、表情、手部、口型和临时状态；已有角色参考图时禁止写发型、脸型、眼睛、体型、常规服装颜色材质、常规配饰等静态样貌]
系统/字幕提示词：[系统气泡、屏幕字、弹幕、字幕等纯视觉内容；无则“无”]
道具提示词：[逐条写道具名 + 引用或可见位置/材质/状态；无则“无”]
动作定格提示词：[选择最适合作为视频 0 秒的动作起手帧或关键锚定帧；写重心、接触点、视线、手部]
对白视觉提示词：[只写口型/说话状态/嘴唇细节；不要把普通对白画成文字；无则“无”]
情绪提示词：[角色名：可见情绪，用眉眼、嘴角、肩颈、手指、身体倾斜外化]
光影氛围提示词：[光源方向、色温、明暗交替、灰尘/粒子/雾气等可见物理氛围]
呼应提示词：[与上/下分镜的视觉反差、伏笔或末帧承接；无则“无”]
画质与防崩约束：4K 超高清、细节清晰、锐度清晰、无模糊、无重影；人物结构正常、面部清晰不变形、五官稳定、比例自然、手指数量正确
负面约束：不生成多余角色，不生成无关文字，不改角色服装和场景结构，避免畸形手、错位眼、穿模、透视扭曲

## 引用列表

- 可用角色：{{characterRefs}}
- 可用场景：{{sceneRefs}}
- 可用道具：{{propRefs}}

输出：直接输出提示词，不要任何说明。
`,
    variables: [
      variable('scriptContent'),
      variable('dialogueText', {
        label: '分镜台词',
        description: '当前分镜的显式台词字段。图片模板只用它判断口型、表情、字幕/气泡，不应把普通对白画成文字。',
        format: '多行台词文本或“无”',
      }),
      variable('dialogueModeDirective', { required: false }),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('emotion'),
      variable('stylePrefix'),
      variable('shotTypeHint'),
      variable('cameraMovementHint', {
        label: '推荐运镜',
        description: '当前分镜的视频运镜提示，图片模板只用它选择静帧构图方向。',
        format: '短语',
      }),
      variable('adjacentShotsInfo', {
        label: '前后分镜衔接参考',
        description: '上一镜剧情与已生成图片提示词、下一镜剧情；仅供判断起始姿态与空间关系。',
        required: false,
      }),
      variable('shotsSection', {
        label: '视频镜头结构参考',
        description: '后续视频镜头结构，只用于静态图选择 0 秒锚定帧或关键帧，不原样输出。',
        format: '多行文本',
        required: false,
      }),
      variable('shotTypeOptions'),
      variable('characterRefs'),
      variable('sceneRefs'),
      variable('propRefs'),
      variable('referenceTable', { required: false }),
      variable('gridSequenceNotice', { required: false }),
    ],
    isCustom: false,
  },

  // ========== 视频推理 · 多参模式（含 @角色/@场景/@道具 映射，依赖映射基准库） ==========

  shot_video_multi: {
    id: 'shot_video_multi',
    category: 'inference-video',
    name: '视频推理 · 多参模式',
    description: '多参照模式分镜视频提示词：含 @角色/@场景/@道具 映射；时长由 {{durationSeconds}} 注入（分镜时长按所选视频模型 spec 吸附，4–30 秒），不再分档位',
    template: VIDEO_REASONING_TEMPLATE_CONTENT.shot_video_multi,
    variables: [
      variable('durationSeconds', {
        label: '本镜时长（秒）',
        description: '分镜时长按项目所选视频模型的 VideoDurationSpec 吸附后的整数秒，范围 4–30。',
        format: '整数',
        example: '12',
      }),
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('dialogueModeDirective', { required: false }),
      variable('prevShot2Info', { required: false }),
      variable('prevShot1Info', { required: false }),
      variable('nextShotInfo', { required: false }),
      variable('referenceTable', { required: false }),
      variable('gridSequenceNotice', { required: false }),
      variable('shotsSection', { required: false }),
    ],
    isCustom: false,
  },

  shot_video_firstframe: {
    id: 'shot_video_firstframe',
    category: 'inference-video',
    name: '视频推理 · 首帧延展模式',
    description: '首帧延展模式分镜视频提示词：输出 [图片提示词] + [视频提示词] 两段；时长由 {{durationSeconds}} 注入（4–30 秒），不再分档位',
    template: VIDEO_REASONING_TEMPLATE_CONTENT.shot_video_firstframe,
    variables: [
      variable('durationSeconds', {
        label: '本镜时长（秒）',
        description: '分镜时长按项目所选视频模型的 VideoDurationSpec 吸附后的整数秒，范围 4–30。',
        format: '整数',
        example: '12',
      }),
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('dialogueModeDirective', { required: false }),
      variable('prevShotInfo', { required: false }),
      variable('nextShotInfo', { required: false }),
      variable('referenceTable', { required: false }),
      variable('gridSequenceNotice', { required: false }),
      variable('shotsSection', { required: false }),
    ],
    isCustom: false,
  },

  // ========== 推理约束段（拼在推理模板之后送进 user 区） ==========
  //
  // 这些段落原先硬编码在 ShotPromptService 里，PromptStudio 改不到。现在统一
  // 落成模板：代码只决定「注不注入」以及往变量里塞哪些计算结果，文案全部可编辑。
  // 条件变量（gridModeRule / tailFrameRule 等）在不适用时由代码传空串。

  shot_directive_mapping_schema: {
    id: 'shot_directive_mapping_schema',
    category: 'inference-directive',
    name: '推理约束 · 映射符约定',
    description: '规定 @char_/@scene_/@prop_/锚点/音色 在推理输出里的书写格式与可用清单；图片与视频推理共用',
    template: SHOT_DIRECTIVE_TEMPLATE_CONTENT.shot_directive_mapping_schema,
    variables: [
      variable('mentionFormatLines', {
        label: '映射符格式示例行',
        description: '按本分镜实际持有的资产类型生成的格式示例（角色 / 场景 / 道具 / 锚定图 / 音色）。',
        format: '多行 `   - xxx` 列表',
      }),
      variable('anchorModeRule', {
        label: '锚定图模式规则',
        description: '有锚定图时要求每镜引用锚点；无锚定图时禁止输出 @shot_anchor 等。',
        format: '一段文字',
      }),
      variable('mappingList', {
        label: '可用映射符清单',
        description: '本分镜实际绑定的角色 / 场景 / 道具 / 锚定图 / 尾帧清单。',
        format: '多行 `- 类别：`xxx`` 列表',
      }),
    ],
    isCustom: false,
  },

  shot_directive_spatial_anchored: {
    id: 'shot_directive_spatial_anchored',
    category: 'inference-directive',
    name: '推理约束 · 空间锚定（有锚定图）',
    description: '本分镜已有真实生成图时注入：图里的姿态就是空间真相，视频词只写动作如何展开',
    template: SHOT_DIRECTIVE_TEMPLATE_CONTENT.shot_directive_spatial_anchored,
    variables: [
      variable('gridModeRule', {
        label: '宫格模式补充规则',
        description: '九宫格 / 四宫格模式下要求镜头 N 对应 cell N，其它模式为空串。',
        format: '一段文字或空串',
        required: false,
      }),
      variable('storyboardModeRule', {
        label: '故事板模式补充规则',
        description: '故事板模式下要求只取剧情面板、不画版式边框，其它模式为空串。',
        format: '一段文字或空串',
        required: false,
      }),
      variable('imagePromptText', {
        label: '本分镜图像提示词原文',
        description: '作为每一镜起始姿态的真相依据贴给 LLM 对照。',
        format: '多行文本',
        required: false,
      }),
      variable('sceneBaseline', {
        label: '场景空间基线',
        description: '本分镜 @scene 的空间描述；无场景时为空串。',
        format: '多行文本或空串',
        required: false,
      }),
    ],
    isCustom: false,
  },

  shot_directive_spatial_multiref: {
    id: 'shot_directive_spatial_multiref',
    category: 'inference-directive',
    name: '推理约束 · 空间锚定（多参考模式）',
    description: '本分镜无锚定图时注入：画面由 @scene/@char/@prop 引用图组合，禁止凭空编造空间关系',
    template: SHOT_DIRECTIVE_TEMPLATE_CONTENT.shot_directive_spatial_multiref,
    variables: [
      variable('sceneBaseline', {
        label: '场景空间基线',
        description: '本分镜 @scene 的空间描述，是多参考模式下唯一的空间真相。',
        format: '多行文本或空串',
        required: false,
      }),
    ],
    isCustom: false,
  },

  shot_directive_tail_frame: {
    id: 'shot_directive_tail_frame',
    category: 'inference-directive',
    name: '推理约束 · 尾帧承接',
    description: '已截取并绑定上一镜真实视频尾帧时注入：首行写承接句，且全文只引用一次尾帧映射符',
    template: SHOT_DIRECTIVE_TEMPLATE_CONTENT.shot_directive_tail_frame,
    variables: [
      variable('tailFrameMention', {
        label: '尾帧映射符',
        description: '固定为 @previous_tail_frame。',
        format: 'mention 字符串',
      }),
      variable('tailFrameLabel', {
        label: '尾帧中文名',
        description: '跟在映射符后面的中文名，默认「上一分镜尾帧」。',
        format: '短语',
      }),
    ],
    isCustom: false,
  },

  shot_directive_video_extend: {
    id: 'shot_directive_video_extend',
    category: 'inference-directive',
    name: '推理约束 · 视频延长承接',
    description: '本分镜选择"上一镜视频延长"承接时注入：整段上一镜成片作全能参考，首行写延长声明，禁止重新开场与重演',
    template: SHOT_DIRECTIVE_TEMPLATE_CONTENT.shot_directive_video_extend,
    variables: [
      variable('previousVideoMention', {
        label: '上一镜视频映射符',
        description: '固定为 @previous_video_clip；渲染期会编译成 @video_file_N / @Video N。',
        format: 'mention 字符串',
      }),
      variable('previousVideoLabel', {
        label: '上一镜视频中文名',
        description: '跟在映射符后面的中文名，默认「上一分镜视频」。',
        format: '短语',
      }),
      variable('durationHint', {
        label: '上一镜结束时刻描述',
        description: '用于"本镜第 0 秒就是上一镜的第 X 秒"这句话，由上一镜时长推出。',
        format: '短语',
        example: '12 秒处',
      }),
    ],
    isCustom: false,
  },

  shot_directive_voice_mention: {
    id: 'shot_directive_voice_mention',
    category: 'inference-directive',
    name: '推理约束 · 音色映射',
    description: '本分镜角色绑定了音色时注入：角色身份要带 @char_<id>-音色，台词才能切到正确音色',
    template: SHOT_DIRECTIVE_TEMPLATE_CONTENT.shot_directive_voice_mention,
    variables: [
      variable('voiceRoster', {
        label: '已绑定音色的角色清单',
        description: '形如 `@char_x 叶赎 音色 @char_x-音色` 的角色列表。',
        format: '分号分隔的清单',
      }),
    ],
    isCustom: false,
  },

  shot_directive_output_boundary: {
    id: 'shot_directive_output_boundary',
    category: 'inference-directive',
    name: '推理约束 · 最终输出边界',
    description: '视频推理收尾约束：只返回提示词正文，禁止自检 / 解释 / 第二套逐镜头结构',
    template: SHOT_DIRECTIVE_TEMPLATE_CONTENT.shot_directive_output_boundary,
    variables: [
      variable('narrativeModeRule', {
        label: '叙事模式收尾规则',
        description: '剧情模式与解说模式对第一人称叙述的不同处理要求。',
        format: '一段文字',
      }),
    ],
    isCustom: false,
  },

  grid_shot_prompt_generation: {
    id: 'grid_shot_prompt_generation',
    category: 'inference-image',
    name: '九宫格分镜提示词生成',
    description: '将单个分镜的剧情拆成 9 个连续动作帧的提示词，形成单一动作链（不是 9 个独立画面）',
    template: `根据以下分镜信息，把该分镜的剧情内容拆成 **9 个时间上连续的动作帧**，构成一条**单一动作链**——不是 9 个独立场景，不是同一情境的 9 个不同视角，而是 0 秒到结束 9 个连贯瞬间。

剧本内容：{{scriptContent}}
台词字段（只用于口型、表情、字幕/气泡判断；普通对白不要画成文字）：{{dialogueText}}
{{dialogueModeDirective}}
出场角色：{{characters}}
出现场景：{{scenes}}
出场道具：{{props}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}

# 叙事弧硬约束（违反任一条都判废重写）
1. **单一时间轴**：9 帧严格按时间顺序，镜头 01 = 起手（动作 0 秒），镜头 09 = 收束（动作结束）；中间 7 帧填补连续过渡，不得跳帧、不得倒序、不得重排。
2. **单一场景 + 单一空间锚点**：9 帧必须在同一场景同一空间锚点（如：宿舍床#1 同一张床、教室同一个工位、走廊同一段位置），人物站位 / 朝向变化只允许小幅度。**禁止画面跳到不同场景或同一场景的远端**。
3. **单一动作链**：把剧情 / 情绪 / 关系推进拆成一条连贯动作链，常见骨架：
   - 起手帧（01）：当前状态 / 静态锚点（如躺着 / 坐着 / 站着 / 持物 / 视线落点）
   - 触发帧（02-03）：第一个变化（如手部动作起势、视线开始移动、表情起变）
   - 推进帧（04-05）：动作中段、视线已转移、情绪进入主峰
   - 转折帧（06-07）：动作 / 情绪关键节奏切点，可能是反应、回应、新动作起手
   - 收束帧（08-09）：动作完成、姿态归位、情绪余波；09 必须能作为下一分镜的起点（人物姿态 / 视线 / 持物 / 光影都稳定）
4. **画面要素一致**：9 帧人物外观、服装、体型、面部特征、整体色调、光照、固定陈设、道具状态全程一致；**只允许人物动作 / 姿态 / 表情 / 镜头远近角度发生变化**。
5. **画面层次一致**：每帧都写出主空间 + 背景/远景 + 前景/近景中的至少两层；需要特写时明确特写对象（手、眼、道具、系统气泡），不要只写“特写表情”。
6. **景别变化服务叙事**：远 / 中 / 近 / 特写 不与编号绑定，按节奏切换（如 01 中景定场 → 04 近景捕捉手部细节 → 07 特写表情 → 09 中景收束），**禁止 9 帧用同一景别**也禁止"每帧都换景别"的碎切。
7. **镜头机位 / 角度禁令**：除非剧情明示，禁止人物直面镜头；禁止 0° 纯正面机位；优先 30°-60° 侧拍 / 过肩 OTS。
8. **严禁孤立画面拼接**：禁止把 9 帧写成"角色 A 的 9 张特写"、"场景的 9 个不同角度"、"同一姿势的 9 种细节"——这些都是错误用法。

9. **解剖学正确（Anatomically correct）**：每帧人物动作必须**真实人体可执行**——五指、双眼、对称面部、合理关节、有明确重心 / 接触点。**禁止**：手指数量错误 / 多肢体 / 关节反向 / 头身比例失真 / 手穿过实体 / 同时执行两个相反动作 / 透视畸变。

10. **第三方评论 / 字幕 / 弹幕禁入主角动作链**：剧本里若有"网友评论""弹幕""字幕"等内容，9 帧**绝不能拍成主角对镜头念出来**——只能在某帧画面里作为字幕 / 手机屏幕 / 弹幕等纯视觉元素呈现。

# 文案精简规则
1. 每帧描述 ≤ 80 字，整段总长度 ≤ 800 字。
2. 只描述客观可见事实（人物外观 / 动作 / 表情 / 视线 / 持物 / 光线 / 环境），不复述剧情、不写心理活动、不解释事件原因、不加旁白 / 评价句。
3. 把"情绪氛围"转成可见线索：表情、肢体张力、色调、明暗对比、肢体节奏。
4. 为每个角色 / 场景 / 道具用对应 mention 引用（@char_ID / @scene_ID / @prop_ID，见下方列表）。
5. 避免空洞形容词（"epic / cinematic / 美轮美奂"）——用具体动词 / 名词 / 颜色 / 光位代替。

可用角色引用：
{{characterRefs}}

可用场景引用：
{{sceneRefs}}

可用道具引用：
{{propRefs}}

输出格式（严格按此格式输出，不要有前言或解释；每帧都包含景别/画面层次/角色动作/光影）：
镜头01：[景别；起手帧 / 静态锚点；主空间 + 背景/前景；角色姿态与光影]
镜头02：[景别；第一个变化；手部/视线/重心；可见环境层次]
镜头03：[景别；变化推进；表情和微动作；道具/前景]
镜头04：[景别；动作中段；特写对象或中景关系；光影变化]
镜头05：[景别；情绪 / 动作主峰；口型/手部/道具状态]
镜头06：[景别；节奏切点 / 反应起势；空间锚点保持]
镜头07：[景别；反应中段；表情细节和身体重心]
镜头08：[景别；收势铺垫；前景/背景呼应]
镜头09：[景别；动作完成、归位、可作为下一分镜起点的稳定态；末帧光影]
`,
    variables: [
      variable('scriptContent'),
      variable('dialogueText', {
        label: '分镜台词',
        description: '当前分镜的显式台词字段。九宫格只用它判断口型、表情、字幕/气泡。',
        format: '多行台词文本或“无”',
      }),
      variable('dialogueModeDirective', { required: false }),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('emotion'),
      variable('stylePrefix'),
      variable('characterRefs'),
      variable('sceneRefs'),
      variable('propRefs'),
    ],
    isCustom: false,
  },

  grid_4_shot_prompt_generation: {
    id: 'grid_4_shot_prompt_generation',
    category: 'inference-image',
    name: '四宫格分镜提示词生成',
    description: '将单个分镜的剧情拆成 4 个连续动作帧的提示词；适合"少切换、强稳定、节奏简洁"的镜头',
    template: `根据以下分镜信息，把该分镜的剧情内容拆成 **4 个时间上连续的动作帧**，构成一条**单一动作链** — 不是 4 个独立场景，不是同一情境的 4 个不同视角，而是 0 秒到结束 4 个关键时序锚点。

相比九宫格，四宫格只挑 4 个**最关键**的瞬间——起手 / 第一节奏切点 / 第二节奏切点 / 收束。**少切换、强稳定、节奏简洁**——适合人物对话、关键动作起承转合、情绪渐进等不需要碎切的镜头。

剧本内容：{{scriptContent}}
台词字段（只用于口型、表情、字幕/气泡判断；普通对白不要画成文字）：{{dialogueText}}
{{dialogueModeDirective}}
出场角色：{{characters}}
出现场景：{{scenes}}
出场道具：{{props}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}

# 叙事弧硬约束（违反任一条都判废重写）
1. **单一时间轴**：4 帧严格按时间顺序，01 = 起手帧（动作 0 秒），04 = 收束帧（动作结束）；02/03 = 两个关键节奏切点。不得跳帧、不得倒序、不得重排。
2. **单一场景 + 单一空间锚点**：4 帧必须在同一场景同一空间锚点；人物站位 / 朝向变化只允许小幅度。**禁止画面跳到不同场景**。
3. **单一动作链**（起承转合骨架）：
   - 镜头 01：起手帧 / 静态锚点（当前状态——躺着 / 坐着 / 站着 / 持物 / 视线落点）
   - 镜头 02：第一节奏切点——动作起势、视线开始移动、表情起变
   - 镜头 03：第二节奏切点——动作中段或情绪主峰、新动作起手
   - 镜头 04：收束帧——动作完成、姿态归位、情绪余波；必须能作为下一分镜起点
4. **画面要素一致**：4 帧人物外观、服装、体型、面部特征、整体色调、光照、固定陈设、道具状态全程一致；**只允许人物动作 / 姿态 / 表情 / 镜头远近角度发生变化**。
5. **画面层次一致**：每帧都写出主空间 + 背景/远景 + 前景/近景中的至少两层；需要特写时明确特写对象（手、眼、道具、系统气泡）。
6. **景别变化服务叙事**：远 / 中 / 近 / 特写 不与编号绑定，按节奏切换（如 01 中景定场 → 03 近景捕捉关键动作 → 04 中景收束）；4 帧不要用同一景别，也不要每帧都换。
7. **机位 / 角度禁令**：除非剧情明示，禁止人物直面镜头；禁止 0° 纯正面；优先 30°-60° 侧拍 / 过肩 OTS。
8. **严禁孤立画面拼接**：不写"4 张同一姿势的特写"、"场景的 4 个角度"、"角色的 4 个表情"——这些都是错误用法。

9. **解剖学正确（Anatomically correct）**：每帧人物动作必须**真实人体可执行**——五指、双眼、对称面部、合理关节、有明确重心 / 接触点。**禁止**：手指数量错误 / 多肢体 / 关节反向 / 头身比例失真 / 手穿过实体 / 同时执行两个相反动作 / 透视畸变。

10. **第三方评论 / 字幕 / 弹幕禁入主角动作链**：剧本里若有"网友评论""弹幕""字幕""新闻播报"等内容，4 帧**绝不能拍成主角对镜头念出来**——只能作为字幕 / 手机屏幕 / 弹幕等纯视觉元素呈现。

# 文案精简规则
1. 每帧描述 ≤ 100 字，整段总长度 ≤ 500 字。
2. 只描述客观可见事实（人物外观 / 动作 / 表情 / 视线 / 持物 / 光线 / 环境），不复述剧情、不写心理活动、不加旁白 / 评价句。
3. 把"情绪氛围"转成可见线索：表情、肢体张力、色调、明暗对比。
4. 为每个角色 / 场景 / 道具用对应 mention 引用（@char_ID / @scene_ID / @prop_ID，见下方列表）。
5. 避免空洞形容词——用具体动词 / 名词 / 颜色 / 光位代替。

可用角色引用：
{{characterRefs}}

可用场景引用：
{{sceneRefs}}

可用道具引用：
{{propRefs}}

输出格式（严格按此格式输出，不要有前言或解释；每帧都包含景别/画面层次/角色动作/光影）：
镜头01：[景别；起手帧 / 静态锚点；主空间 + 背景/前景；角色姿态与光影]
镜头02：[景别；第一节奏切点 / 动作起势；手部/视线/重心；可见环境层次]
镜头03：[景别；第二节奏切点 / 动作主峰；特写对象或中景关系；光影变化]
镜头04：[景别；收束帧 / 可作为下一分镜起点的稳定态；前景/背景呼应]
`,
    variables: [
      variable('scriptContent'),
      variable('dialogueText', {
        label: '分镜台词',
        description: '当前分镜的显式台词字段。四宫格只用它判断口型、表情、字幕/气泡。',
        format: '多行台词文本或“无”',
      }),
      variable('dialogueModeDirective', { required: false }),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('emotion'),
      variable('stylePrefix'),
      variable('characterRefs'),
      variable('sceneRefs'),
      variable('propRefs'),
    ],
    isCustom: false,
  },

  storyboard_shot_prompt_generation: {
    id: 'storyboard_shot_prompt_generation',
    category: 'inference-image',
    name: '故事板分镜提示词生成',
    description: '将单个分镜整理成带制作笔记的电影级故事板/制作方案板提示词，强调剧情递进、情绪表演、光影、镜头衔接和视频 AI 可读性',
    template: `根据以下分镜信息，生成一条用于“故事板模式”出图的图片提示词。目标是一张横版 16:9 的电影导演分镜示意图，风格为专业影视前期视觉板、商业短剧分镜表、高清写实人物合成图；白底黑线表格排版，像导演分镜脚本板；它不是单纯漂亮拼图，而是给后续视频 AI 读取剧情、动作、机位、光影、情绪和连续性的制作板。

{{referenceTable}}

{{storyboardContinuityNotice}}

## 输入

项目名称：{{projectTitle}}
副标题：{{projectSubtitle}}
拍摄形式：{{shootingFormat}}
项目类型：{{projectType}}
当前分镜时长：{{shotDurationSeconds}}秒
限制条件：{{storyboardConstraints}}
剧本内容（唯一真理来源）：{{scriptContent}}
台词字段（只用于口型、表情和说话状态；普通对白不要画成文字）：{{dialogueText}}
{{dialogueModeDirective}}
出场角色：{{characters}}
出现场景：{{scenes}}
出场道具：{{props}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}

## 整体版式（硬约束 / 最高优先级，绝对不可改写、不可降级、不可裁掉任何一项）

> 这一节是出图模型的"骨架红线"。如果模型同时收到风格前缀、参考图、其它叙事建议，**整体版式硬约束永远优先**。模型每画一张都必须自检以下 8 条全部满足；缺任意一项即视为不合格。

0.1 **画幅必须是横版 16:9**：长宽比固定 16:9，横构图，绝不允许出现竖版、方版、长条版、海报版、漫画分屏版等任何非 16:9 比例。
0.2 **白底**：整张画面的底色必须是纯白（或极接近白的高亮米白），绝对禁止深色底、暗色底、深蓝底、米黄做旧纸、牛皮纸、黑底、彩色底。所有面板的背景也应保持白底。
0.3 **黑色细线表格排版**：所有分区、面板、表格、坐标轴、调度图边线一律使用**黑色细线**勾边，线条干净均匀，像真正的导演分镜脚本板 / 案头资料表，**禁止**使用彩色描边、霓虹边、发光边、厚重黑块边、手绘潦草边。
0.4 **像导演分镜脚本板**：整体气质必须是"专业导演的案头资料表 / 商业短剧分镜表"，**不是**漂亮海报、不是 UI 设计稿、不是漫画拼贴、不是杂志版、不是 PPT 模板。
0.5 **八大模块齐备，一个都不能少**：画面必须同时包含以下 8 大模块，缺一不可、顺序可按版面合理排布但全部必须可见可读：
   1) 大主视觉
   2) 多角色设定
   3) 镜头风格（与光线）
   4) BGM 音效
   5) 分镜脚本
   6) 场景调度图
   7) 机位运动轨迹图
   8) 情绪曲线图
0.6 **信息密集但整齐**：版面信息量必须饱满，不留无意义的大片留白；同时分区井然有序、对齐严格、模块之间间距均匀、可阅读顺序清晰，绝不允许凌乱堆叠、撞图、压字、错位。
0.7 **中文字体清晰**：所有标题、字段名、笔记、标签、坐标说明一律**简体中文**，字体清晰、字号合理、笔画干净，**禁止**糊字、错字、乱码字、伪汉字、英文替换、字符错位；标题字稍粗、正文字稍细，整体像真正的中文导演案头。
0.8 **专业导演案头资料感**：整体观感是"一张影视前期的真专业资料"：克制、精确、可作业、可读，**不是**炫技、艺术化、装饰化的视觉海报。

如果同时存在"风格前缀"等其它视觉指令，必须把它们解释为应用在"主视觉/角色头像/场景调度图小画面"等画内内容上，**不能改写本节 0.1–0.8 的版式骨架**。

## 故事板核心目标

1. **横版 16:9 导演分镜板感**：画面是一张横版 16:9 的电影导演分镜示意图，风格为专业影视前期视觉板、商业短剧分镜表、高清写实人物合成图；白底、黑色细线表格、中文排版整洁，**信息密集但整齐**，专业导演案头资料感。同时保留**电影分镜信息图海报感**与电影级质感。
2. **剧情驱动，不机械填格**：不要机械固定 8 镜头、2x2 或均匀网格。先判断剧情内容、角色数量、场景复杂度、时长和情绪转折，再决定 N 个镜头 / N 个角色 / 1 个或多个场景。镜头数量必须服务叙事节奏：短动作可 4-6 镜头，15 秒标准段落可 6-8 镜头，复杂调度可 8-12 镜头。**镜头数由剧情决定，不机械补满**。
3. **默认制作板模块**：默认生成“横版 16:9 导演分镜板”，稳定包含以下模块，但允许按剧情重要性调整面积和顺序：
   - 【项目标题】项目名称必须使用“{{projectTitle}}”，副标题必须使用“{{projectSubtitle}}”，拍摄形式必须使用“{{shootingFormat}}”，类型必须使用项目类型“{{projectType}}”，时长必须使用当前分镜时长“{{shotDurationSeconds}}秒”（必须是当前分镜时长，不是项目总时长），限制条件必须使用“{{storyboardConstraints}}”；
   - 【主视觉】整张板的主图区，高清写实人物合成图；画面包含主要角色、关键道具、场景环境、光线氛围与核心动作；
   - 【多角色设定区】N 个主要角色的高清写实半身头像，商业短剧质感，表情符合人物性格；以表格形式罗列姓名、身份、外貌、服装、性格、当前情绪、人物关系；
   - 【镜头风格与光线】镜头风格、光线风格、色调、景深、构图说明；电影级布光、冷暖/明暗/反差方案；统一色板与主辅色关系；
   - 【BGM与音效】BGM 风格、关键音效、声音氛围；声音只作为制作笔记，不画成字幕；
   - 【分镜脚本区（N格）】N 个按时间顺序推进的镜头格，每格包含小画面、镜头编号、时间段、画面描述、机位、运镜、动作、台词笔记、情绪；
   - 【场景调度图】简洁平面图表现主要空间元素、全部角色站位、角色移动路线；
   - 【机位运动轨迹图】展示每个镜头的摄像机位置、人物圆点、角色标签、运动箭头、推拉摇移轨迹；按实际镜头数标注 1-N 编号机位；
   - 【情绪曲线图】红色折线表现情绪从开场到收束的变化，标注关键情绪节点。
4. **剧情层层递进**：把当前分镜整理成 N 个关键视觉节拍，形成起因 / 触发 / 反应 / 转折 / 情绪主峰 / 收束。每个节拍都要有清晰的画面动作和角色状态，不写抽象剧情总结。
5. **情绪表达到位**：把情绪转化为演员表演：微表情、视线、口型、肩颈张力、手指、身体重心、呼吸、犹豫或爆发瞬间。不要只写“悲伤/紧张/震惊”。
6. **光影表达**：明确主光源、补光、反光、色温、阴影形状、烟雾/尘粒/蒸汽/水面反射等物理可见元素。光影必须推动情绪递进。
7. **镜头语言**：为每个节拍安排景别、焦段（24mm/35mm/50mm/85mm 等）、机位、运动方式（静止 / 跟拍 / 手持 / 推进 / 摇臂 / 横移）、构图重心、前景/中景/背景层次。相邻节拍之间要有视觉衔接，不要孤立拼贴。
8. **项目风格注入**：整体画风必须继承“风格前缀”，人物 / 场景 / 道具与项目已有视觉参考保持同一美术体系。不得漂移到不相干写实、动漫或广告风格。
9. **可读笔记文字**：故事板上必须有短笔记文字，用于给视频 AI 生成连贯剧情。允许并鼓励出现：面板编号、短标题、镜头标签、动作笔记、情绪笔记、光影笔记、声音笔记、转场/衔接笔记、角色路径箭头、编号机位、俯视平面图标注。文字要短、清楚、像制作板备注；不要写成长段说明。
10. **不是对白字幕**：笔记文字不是对白字幕，也不是把台词贴在画面里。普通对白只转化为口型/表情/动作笔记；只有剧本明确要求屏幕字、弹幕、招牌、UI 时，才把那些文字作为画内文本。
11. **版式决策系统**：故事板很复杂，绝不能默认固定 2x2 或均匀网格。默认采用“横版 16:9 多区块导演分镜板”：白底黑线表格 + 主视觉大图 + 多角色头像表格 + 镜头风格/BGM 小窗 + 分镜脚本格阵 + 底部三张图表（场景调度图 / 机位运动轨迹图 / 情绪曲线图）。必须先判断当前分镜需要表达什么，再选择结构：
   - 如果剧情正好是四段强递进，可用垂直 2x2 四格宣传漫画信息图；
   - 如果有动作冲突、空间调度、追逐、对峙、多人关系，优先用电影级制作方案表：主视觉大图 + 场景调度图 + 角色路径箭头 + 编号机位 + 分镜脚本笔记；
   - 如果是连续情绪或动作推进，用宽幅 4-8 面板电影故事板，每格下方有 camera/action/light/mood notes；
   - 如果需要解释角色表演、道具、能量特效或关键姿态，可加入非对称研究区：角色表演小稿、道具/手部特写、光影色板、构图草图、动作弧线；
   - 允许非对称、多区块、多尺寸面板、主大图 + 小缩略图、插入平面图和机位图；只要叙事清晰、制作可读、风格统一即可。
12. **引用编码**：所有人物 / 场景 / 道具引用必须使用 \`@<id> <名称>\` 格式；故事板连续性引用只在上方参考集合真实存在时使用 \`@previous_storyboard_anchor 上一故事板锚点\` 或 \`@storyboard_anchor 当前故事板锚点\`。没有真实锚定图时禁止输出这些锚点。**严禁输出 \`@Image N\` / \`@图片N\` / \`references[N]\`**，这些只属于最终请求编译后的 provider 协议，不允许写入本地可编辑提示词。

## 输出格式（严格按下面结构原样输出，逐项把 {占位符} 替换为根据输入推理出来的具体内容；不要保留花括号；不要输出任何说明、不要包代码块）

生成一张横版 16:9 的电影导演分镜示意图，风格为专业影视前期视觉板、商业短剧分镜表、高清写实人物合成图。

片名：《{{projectTitle}}》
时长：{{shotDurationSeconds}}秒
场景：{场景地点}，{空间类型}，{时间}。
核心情绪：{{emotion}}
故事概念：{一句话剧情概述}

整体版式（硬约束，全部必须满足，不允许降级或裁切任意一项）：
横版 16:9，纯白底，黑色细线表格排版，像专业导演分镜脚本板 / 商业短剧分镜表。画面必须同时包含以下 8 大模块，缺一不可：大主视觉、多角色设定、镜头风格、BGM音效、分镜脚本、场景调度图、机位运动轨迹图、情绪曲线图。信息密集但整齐，分区井然有序、对齐严格、不留大片空白；所有标题/字段/标签/笔记一律简体中文，字体清晰可读，不允许糊字乱码；整体观感是专业导演案头资料感，不是海报、不是 UI 设计稿、不是漫画拼贴。

主视觉：
{主视觉画面描述}
画面中包含{主要角色列表}，以及关键道具、场景环境、光线氛围和核心动作。
整体质感为{视觉风格}，色调为{色调}，光线为{光线描述}，情绪表达细腻。

多角色设定区：
共有{角色数量}个主要角色。为每个角色配高清写实半身头像，商业短剧质感，表情符合人物性格。角色信息以表格形式排列，包含姓名、身份、外貌、服装、性格、当前情绪、人物关系。

[按当前分镜实际角色数 N 输出 N 个角色块；从“角色1”依次递增编号，不少于 1 个，不机械补满；每个角色块字段顺序固定如下]
角色1：
姓名：{角色1姓名}
身份：{角色1身份}
性别/年龄：{角色1性别年龄}
外貌特征：{角色1外貌特征}
服装造型：{角色1服装造型}
性格关键词：{角色1性格关键词}
当前情绪：{角色1当前情绪}
人物关系：{角色1与其他角色关系}

[继续输出 角色2、角色3 … 直到第 N 个角色]

镜头风格与光线：
风格：{镜头风格}
光线：{光线风格}
色调：{色彩倾向}
景深：{景深要求}
构图：{构图要求}

BGM与音效：
BGM：{背景音乐风格}
音效：{关键音效1}、{关键音效2}、{关键音效3}
声音氛围：{声音氛围描述}

分镜脚本区，共{镜头数量}格（由剧情节奏决定，4-12 之间；从镜头1按时间顺序逐格输出，每格字段顺序固定如下）：

镜头1（{时间段1}秒）：
画面：{镜头1画面}
机位：{镜头1机位}
运镜：{镜头1运镜}
出场角色：{镜头1出场角色}
动作：{镜头1动作}
台词：{镜头1台词}
情绪：{镜头1情绪}

[继续输出 镜头2、镜头3 … 直到第 N 镜；不补空格、不机械凑数]

底部图表：
场景调度图：用简洁平面图表现{主要空间元素}、{全部角色站位}、{角色移动路线}。
机位运动轨迹图：展示每个镜头的摄像机位置、人物圆点、角色标签、运动箭头、推拉摇移轨迹。
情绪曲线图：红色折线表现情绪从{起始情绪}到{中段情绪}再到{结尾情绪}的变化，并标注关键情绪节点。

视觉要求：
高清、干净、专业、商业短剧分镜设计稿，黑色细线表格，中文排版，现实主义，电影感，自然光，人物精致，表情准确，细节丰富。多角色之间站位清楚，关系明确，不要混淆角色。

连续性：{如存在上一故事板参考，写如何继承上一故事板的场景/人物/光影/末态；否则写“无上一故事板参考，按当前分镜建立起始状态”}
负面约束：不要把普通对白画成字幕，不要长段文字墙，不要无关 logo / 水印，不新增无关角色，不改角色服装和场景结构，避免畸形手、错位眼、穿模、透视扭曲。

## 引用列表

- 可用角色：{{characterRefs}}
- 可用场景：{{sceneRefs}}
- 可用道具：{{propRefs}}

输出：直接输出按上面“输出格式”填好的完整提示词，不要任何说明文字、不要包代码块。
`,
    variables: [
      variable('scriptContent'),
      variable('dialogueText', {
        label: '分镜台词',
        description: '当前分镜的显式台词字段。故事板只用它判断表情、口型和说话状态，不应把普通对白画成文字。',
        format: '多行台词文本或“无”',
      }),
      variable('dialogueModeDirective', { required: false }),
      variable('projectTitle'),
      variable('projectSubtitle'),
      variable('shootingFormat'),
      variable('projectType'),
      variable('shotDurationSeconds'),
      variable('storyboardConstraints'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('emotion'),
      variable('stylePrefix'),
      variable('characterRefs'),
      variable('sceneRefs'),
      variable('propRefs'),
      variable('referenceTable', { required: false }),
      variable('storyboardContinuityNotice', { required: false }),
    ],
    isCustom: false,
  },

  character_extraction: {
    id: 'character_extraction',
    category: 'extraction',
    name: '角色提取',
    description: '从剧本中提取所有可单独识别的人物（含"我"），输出结构化资料用于后续 AI 文生图与角色基准库',
    template: `请根据提供的小说原文、推文文案、故事情节，提取文中出现过的所有"可单独识别的人物"，包括"我"，输出结构化资料用于后续 AI 文生图与角色基准库。

【输入数据】
小说原文：
{{script}}

推文文案（已精炼的整集解说旁白；可补足剧情主线信息；无则视作空）：
{{tweetScript}}

故事情节（剧情主线摘要；无则视作空）：
{{plotSummary}}

项目视觉风格定向（视觉风格关键词；用于在原文未明说时做合理可视化补全的风格收敛，不影响客观事实；无则忽略）：
{{stylePrefix}}

【字段要求】每个人物必须输出以下字段：
1. "name"：人物标准名（最稳定、最适合作为主名称的称呼）
2. "aliases"：人物全部代称，多个代称用英文逗号分隔；不得重复 name 本身；aliases 内部不得重复；如果没有代称，填空字符串 ""
3. "age"：年龄
   - 必须依据剧本线索（职业、身份、社会角色、对白语气、家庭关系、场景、年代背景）尽量给出具体年龄或区间
   - 可写形式示例："28岁"、"约30岁"、"40岁出头"、"10岁左右的少年"、"60岁以上的老人"
   - 仅当剧本完全没有任何线索可推断时才允许填"未知"，正常情况下禁止使用"未知"
4. "gender"：只能填写 "male"、"female"、"neutral"、"unknown"；性别无法 100% 确认时根据上下文选最合理的可视化性别，不要写 "unknown" 兜底
5. "role"：只能填写 "protagonist"、"antagonist"、"supporting"
6. "appearance"：纯客观可见外观，作为文生图的核心提示词；总长度 ≥ 60 字
   - **只写"拍照能拍到的东西"**。任何职业、身份、亲属关系、经历、性格都必须写进 description，
     绝不能出现在 appearance —— appearance 会被原样喂给文生图模型，"年轻调查员"这类词画不出来，
     只会让模型自由发挥导致人物漂移。
   - **必须显式包含以下七要素**（缺一不可）：年龄段、性别、发色、发型、眼睛颜色、上身服装、下身服装
   - 在七要素之外还要尽量覆盖：脸部细节（脸型、眉型、眼型、鼻型、嘴唇、肤色）、体态（身高感、身材、姿势）、鞋履与配饰（眼镜、首饰、围巾、手套、武器/法器造型，均带材质）、衣物外可见的特征痕迹（疤痕、纹身、胎记）
   - 服装必须给出【颜色】+【款式】+【材质】三维（如：深灰色羊毛长风衣 / 白色棉质立领衬衫 / 蓝色牛仔修身长裤）
7. "description"：≤ 20 字的极简身份 / 职业标签。它是 appearance 的"泄压阀"——
   身份信息都倒进这里，appearance 才能保持纯画面。禁止剧情、性格、心理、过往经历。
8. "variants"：该人物在本文中**外观发生过明显变化的阶段**（子形象）。详见下方专门章节。

【variants：角色阶段性外观变化】
appearance 描述的是该人物的"基准形象"。但同一个人在故事里往往会变样，变样了就要单列一个阶段，
否则后面所有画面都会用同一套服装和状态，跟剧情对不上。

必须产出 variants 的典型情况：
- **境遇改变**：流浪街头 → 被富贵人家接回，衣着从破旧脏污变成体面考究，气色体态也跟着变
- **年龄跨度**：从小到大，身高体型、脸部稚气、发型都要变；老去则有白发与皱纹
- **身体状态**：负伤、患病、消瘦、淋雨落水、蓬头垢面、被囚禁
- **场合换装**：婚礼、出征、赴宴、奔丧、乔装改扮、制服与便装切换

判定与书写规则：
1. **只有原文真的写到变化才输出**。全程没变样的人物给空数组 []，不要为了凑数编造。
2. 每个阶段必须仍是**同一个人**：五官、骨相、瞳色、基础发色不得改变（年龄跨度允许自然发育变化）。
3. "prompt" 只写**相对 appearance 改变了什么**，不要重抄一遍完整外观。
   例："衣衫褴褛破洞、灰扑扑沾满尘土、头发油腻打结、面色蜡黄、赤脚" →
   "换上藕荷色云锦长衫与白色中衣，头发梳理整齐束玉冠，面色红润，脚穿黑缎软靴"
4. "prompt" 同样守 appearance 的红线：只写画面可见的客观信息，禁止性格、情绪、心理、剧情。
5. "kind" 按主要变化维度取 age / state / outfit / other。
6. "name" 用 3~6 个中文字，一眼能看懂阶段（「流浪时期」「入府之后」「少年时期」「浴血重伤」）。
7. "keywords" 给 2~6 个中文触发词，英文逗号分隔，是原文里出现就该切到该阶段的线索
   （「流浪,街头,乞讨」「接回,认亲,入府」「十二岁,少年,那年」）。
8. 阶段之间必须有明显画面差异；与基准 appearance 几乎一样的阶段不要输出。
9. 变化跨度大的人物给 2~4 个阶段即可，不要把每个小情节都拆成一个阶段。

【第一人称判定 —— 决定要不要输出"我"】
先判断原文的叙事人称，再决定：
- **第一人称叙事**（叙述者本人用"我"讲述，旁白里就出现"我看见/我走进/我心想"）
  → 必须输出"我"这个角色。原文未明说外貌时，结合上下文给最合理、最保守的可视化补全。
- **第三人称叙事**（旁白用人名或"他/她"叙述，"我"只出现在引号内的对白里）
  → **禁止把"我"输出成独立角色**。对白里的"我"是说话人的自称，必须归到那个说话人名下；
    识别不出说话人就直接忽略，不要为它单开一条记录。
- 判断依据只看**旁白**（引号外的叙述文字）用的是"我"还是人名/他/她；只有对白里出现"我"不算第一人称。

【同一人物合并 —— 减少一人被拆成多个角色】
输出前必须按上下文语境把下列情况判定为**同一个人**，合并成一条记录：
1. 本名 / 小名 / 昵称 / 绰号（顾行、阿行、行哥、小行）
2. 姓 + 称谓（顾先生、顾总、顾少、老顾、小顾）
3. 职务 / 身份指代（班主任、老板娘、司机、那个医生）—— 若全文只有一个人担任该职务，
   且与某个具名人物出现在同一情境，判定为同一人
4. 亲属称谓（我妈、母亲、妈妈；她父亲、老爷子）—— 同一视角下指向同一人
5. 前后文的"他/她"回指对象
6. 同一人物在不同时期的称呼（少年时叫小七，成年后叫萧七）
合并后：name 取最核心、最稳定、出现最多的那个称呼；其余全部塞进 aliases。
**拿不准两个称呼是不是同一人时，优先合并**——拆错比合错更难在下游修复
（分镜里会变成两个角色、两张定妆照、两条音色）。

【硬性规则】违反任一项都视为不合格：
1. 遵守上面的第一人称判定：第三人称叙事里绝不能出现名为"我"的角色。
2. 遵守上面的同一人物合并规则，同一个人只能出现一条记录。
3. 只提取"可单独识别的人物"。禁止输出泛指群体：众人 / 同学们 / 路人 / 村民们 / 所有人 等。
4. 若人物没有明确姓名但在文中可单独识别，使用文中最稳定的称呼作为 name（如：班主任、老板娘、司机、邻居阿姨）。
5. **每个人物的穿着必须尽量不重复**。原文未明确服装时，在不违背人物身份、时代、阶层、剧情氛围的前提下做合理且保守的差异化补全，确保不同人物在画面中可一眼区分。
6. 若提供了"项目视觉风格定向"，对原文未明说的视觉细节做补全时风格要向其收敛；但不得改变原文已明确的外观事实。
7. 对"成组出现的具名群体"（如"师妹们"、"四大天王"、"黑衣人们"、"七大长老"）按下述规则处理：
   - 若该群体始终整体行动、成员没有独立姓名/独立台词/单独戏份 → 作为一条"群像角色"输出：name 用群体称呼，appearance 必须描述群体整体视觉（人数范围、统一服饰款式与材质、整体年龄气质），让文生图能直接画出"一群人"
   - 若成员有独立姓名、独立台词或单独戏份 → 必须拆分为独立人物分别输出，禁止以群体条目兜底

【appearance 红线规则】
1. 只描述视觉可见的客观特征。禁止性格、情绪、气质、命运、心理、思想等抽象词。
2. 服装材质禁止"职业套装"、"日常服"、"休闲装"等模糊词，必须给出具体材质（棉布 / 呢料 / 皮革 / 亚麻 / 丝绸 / 牛仔 / 工装布 / 针织 / 化纤 等）。
3. 禁止描述被衣物遮挡的身体特征（如胸口胎记、腰背纹身、内衣、私处），只写衣物外可见的痕迹。
4. 禁止"好看的 / 普通的 / 帅气的 / 美丽的 / 清秀的"等主观或模糊词汇。
5. 禁止职业 / 身份 / 社会关系叙述（如店主、老板、养父）；这些写到 description 字段。
6. 禁止超自然能力设定（如能看见鬼魂、通灵、被诅咒）。
7. 禁止经历背景事件（如火场被救、全家遇难、身世成谜）。
8. 必须使用中文描述；任何无法在画面中直接看到的内容一律剔除。
9. appearance 写法风格统一，建议结构："一个……岁左右的……人，……发色……发型，……眼睛，穿着……上装，下身穿……"

【输出前自检】逐条过一遍，任一条不通过就改完再输出：
1. 叙事人称判对了吗？第三人称叙事的结果里是否混进了名为"我"的角色？
2. 列表里有没有两条其实是同一个人（本名与绰号、姓+称谓、职务指代、亲属称谓）？
3. 每条的 appearance 里有没有混进职业 / 身份 / 亲属关系 / 经历 / 性格？有就挪进 description。
4. 有没有把泛指群体当成单个人物输出？
5. 原文里换过装、长大过、受过伤、境遇变过的人物，是否都给出了 variants？
   variants 里有没有重抄完整外观、或写进了剧情与情绪？

【输出要求】
- 只输出 JSON，可包裹在 \`\`\`json 代码块中；禁止输出任何解释、前言、备注、Markdown 标题。
- JSON 必须严格遵循下方示例的结构（顶层对象包含 \`characters\` 数组）。
- 不得出现重复人物、不得缺字段、不得输出无效 JSON。

下面的示例取自**第一人称**原文（旁白用"我"叙述），所以输出里包含"我"；
第三人称原文的输出里不应出现"我"这条记录。

\`\`\`json
{
  "characters": [
    {
      "name": "顾行",
      "aliases": "阿行,顾先生",
      "age": "28岁",
      "gender": "male",
      "role": "protagonist",
      "appearance": "一个28岁左右的年轻男人，黑色微卷短发，深棕色丹凤眼，窄长脸，挺直鼻梁，薄唇，小麦色肤；中等偏高瘦削身形，肩背挺拔；上身穿深灰色羊毛长风衣搭白色棉质立领衬衫，下身穿黑色斜纹布修身长裤，脚踩黑色牛皮短靴，左手腕戴一只银色金属机械表，左眉尾有一道浅淡旧疤。",
      "description": "年轻调查员",
      "variants": [
        {
          "name": "流浪时期",
          "kind": "state",
          "prompt": "衣衫褴褛多处破洞、灰扑扑沾满尘土，头发油腻打结垂到肩，面色蜡黄双颊凹陷，赤脚或裹破布，指甲缝发黑",
          "keywords": "流浪,街头,乞讨,饿"
        },
        {
          "name": "入府之后",
          "kind": "outfit",
          "prompt": "换上藕荷色云锦长衫搭白色细棉中衣，头发梳理整齐束白玉冠，面色红润，脚穿黑缎软靴，腰间悬一枚青玉佩",
          "keywords": "接回,认亲,入府,少爷"
        }
      ]
    },
    {
      "name": "我",
      "aliases": "自己",
      "age": "20岁左右",
      "gender": "female",
      "role": "supporting",
      "appearance": "一个20岁左右的年轻女人，深棕色长发扎成低马尾，黑色眼睛，圆脸柔和五官，浅肤色；中等偏瘦体型；上身穿浅杏色棉质连帽外套搭白色针织内搭，下身穿蓝色牛仔修身长裤，脚踩白色帆布鞋。",
      "description": "第一人称叙述者",
      "variants": []
    }
  ]
}
\`\`\`
`,
    variables: [
      variable('script'),
      variable('tweetScript', { required: false }),
      variable('plotSummary', { required: false }),
      variable('stylePrefix', { required: false }),
    ],
    isCustom: false,
  },

  character_preview_video_prompt: {
    id: 'character_preview_video_prompt',
    category: 'inference-video',
    name: '角色预览视频提示词',
    description: '先从剧本推断角色性格与口头禅，再产出一段「动作 + 台词」，用于主形象预览视频（同时也是提取角色音频的素材）',
    template: `你在为一段角色预览短视频写提示词。这段视频只有一个用途：把这个角色演活，并留下一段干净的角色人声，供后续提取成音色样本。

【角色资料】
姓名：{{characterName}}
代称：{{aliases}}
性别 / 年龄：{{demographic}}
定位：{{role}}
外观（画面已由定妆照锁定，不要重复描述外观）：{{appearance}}

【剧本原文（用来推断这个角色怎么说话、怎么动；为空则只依据上面的角色资料）】
{{script}}

【第一步：先自己推断，不要输出这一步】
从剧本里找这个角色（含代称）的台词与行为，归纳出：
- 性格：急躁还是沉稳、外放还是压抑、强势还是讨好
- 说话习惯：句子长短、用词文白程度、有没有反复出现的口头禅 / 语气词 / 称呼方式
剧本里找不到这个角色的台词时，依据定位与外观做最保守的推断，不要编造剧情。

【第二步：输出两部分】
1. action：角色的动作与神态，英文，一句话。
   - 必须是**由上面推断出的性格推导出来的**具体行为（急性子就有小动作，阴沉就压着不动，
     跳脱就手舞足蹈），不要写"站着微笑"这种通用词
   - 只写角色本人的动作、表情、视线、呼吸、细微姿态变化；镜头保持稳定，不要写运镜、转场、特效
   - 不要写背景、道具、其它人物、环境音
   - 角色必须在说话：动作要和开口的节奏对得上（如 "leaning in slightly as he speaks"）
2. dialogue：角色说出口的一句台词，中文，8~25 字。
   - 剧本里有反复出现的口头禅 / 招牌说法，**必须用上**（可自然扩写成完整一句）
   - 没有的话，写一句最能体现该性格与说话习惯的短句
   - 必须是这个角色会说的话：语气、用词、文化程度都要贴人物
   - 只有一句，不要旁白、不要引号、不要人名前缀、不要舞台提示

【硬性规则】
- 只输出 JSON，可包裹在 \`\`\`json 代码块中，禁止任何解释文字
- action 只能是英文，dialogue 只能是中文
- 台词内容里不得出现音效词、背景音乐描述、环境声

\`\`\`json
{
  "action": "shifting his weight impatiently, tapping two fingers against his thigh, eyes flicking up as he speaks",
  "dialogue": "行了行了，废话少说，跟我走。"
}
\`\`\`
`,
    variables: [
      variable('characterName'),
      variable('aliases', { required: false }),
      variable('demographic', { required: false }),
      variable('role', { required: false }),
      variable('appearance', { required: false }),
      variable('script', {
        description: '剧本 / 章节正文；模型据此推断该角色的性格与口头禅。为空时只依据角色资料保守推断。',
        required: false,
      }),
    ],
    isCustom: false,
  },

  character_variant_derivation: {
    id: 'character_variant_derivation',
    category: 'extraction',
    name: '角色子形象派生',
    description: '从角色主形象派生出不同年龄 / 不同状态 / 不同穿着的子形象清单（含匹配关键词）',
    template: `请为下面这个角色规划「子形象」。子形象 = 同一个人在剧情不同阶段的不同外观，用于分镜里自动切换参考图。

【角色资料】
姓名：{{characterName}}
性别 / 年龄：{{demographic}}
定位：{{role}}
主形象外观（基准，必须视作同一个人）：{{appearance}}

【剧情线索（用于判断这个角色到底需要哪些子形象；为空则按角色定位给通用集合）】
{{script}}

【规划要求】
1. 产出 {{variantCount}} 个子形象，覆盖三类维度，按剧情实际需要分配数量：
   - kind="age"    不同年龄（少年 / 青年 / 中年 / 老年，只在剧情真的跨年龄时给）
   - kind="state"  不同状态（重伤、狼狈、病容、醉酒、湿身、蒙尘、情绪外显到影响外观）
   - kind="outfit" 不同穿着（战袍、礼服、便装、制服、丧服、婚服）
2. 每个子形象必须是**同一个人**：五官、骨相、肤色、瞳色、基础发色不得改变。
   prompt 里只写**相对主形象改变了什么**，不要重抄一遍主形象的完整外观。
3. prompt 只允许画面可见的客观描述（发型长度、胡须、皱纹、伤口位置、血污范围、衣服颜色款式材质、配饰）；
   禁止性格、情绪词、剧情、心理描写。
4. keywords 给 2~6 个中文触发词，英文逗号分隔，是原文里出现这些词就该切到该子形象的线索
   （如 "少年,童年,十二岁"、"重伤,浴血,染血"、"婚礼,大红喜服"）。
5. name 用 3~6 个中文字，一眼能看懂（如「少年时期」「浴血重伤」「大婚喜服」）。
6. 不得产出与主形象几乎一样的子形象；每个子形象之间必须有明显画面差异。

【输出要求】
- 只输出 JSON，可包裹在 \`\`\`json 代码块中，禁止解释文字

\`\`\`json
{
  "variants": [
    {
      "name": "少年时期",
      "kind": "age",
      "prompt": "十三四岁的少年体型，个子矮一截，脸颊未脱稚气，头发短而蓬乱未束冠，粗麻布短褐，赤脚草鞋",
      "keywords": "少年,童年,小时候,十三岁"
    },
    {
      "name": "浴血重伤",
      "kind": "state",
      "prompt": "左肩到胸口一道深长刀伤，衣襟被血浸成暗红并撕裂，脸上溅有血点与尘土，发髻散乱垂落，嘴唇发白",
      "keywords": "重伤,浴血,染血,受伤,负伤"
    }
  ]
}
\`\`\`
`,
    variables: [
      variable('characterName'),
      variable('demographic', { required: false }),
      variable('role', { required: false }),
      variable('appearance'),
      variable('script', { description: '剧情文本（剧本 / 章节正文）；用于判断角色实际需要哪些子形象。', required: false }),
      variable('variantCount', { description: '期望产出的子形象数量。', required: false }),
    ],
    isCustom: false,
  },

  shot_character_variant_match: {
    id: 'shot_character_variant_match',
    category: 'analysis',
    name: '分镜子形象匹配',
    description: '按分镜画面与台词，为每个出场角色选出该镜应激活的子形象',
    template: `请为每个分镜挑选出场角色应该使用的「子形象」。

【可选子形象清单】（每个角色的子形象；未列出的角色不用处理）
{{variantCatalog}}

【分镜列表】
{{shotList}}

【判定规则】
1. 只有当分镜内容**明确**指向某个子形象时才切换：
   - 时间线索（回忆、少年时、多年后）→ 年龄类子形象
   - 状态线索（受伤、浑身是血、落水、醉酒、病中）→ 状态类子形象
   - 场合线索（婚礼、出征、上朝、葬礼）→ 穿着类子形象
2. 状态是**延续性**的：角色受伤后，后续分镜在没有明确"痊愈/换装"线索前，继续沿用该状态子形象。
3. 没有任何线索时输出 null（用主形象），**不要为了填满而乱选**。
4. 只能从清单里选，variantId 必须原样照抄清单里的 id。

【输出要求】
- 只输出 JSON，可包裹在 \`\`\`json 代码块中，禁止解释文字
- shots 数组必须与输入分镜一一对应、顺序一致
- assignments 里只写需要切换子形象的角色；不需要切换的角色直接省略

\`\`\`json
{
  "shots": [
    { "shotId": "shot-1", "assignments": [{ "characterId": "char-1", "variantId": "var-3", "reason": "回忆少年时" }] },
    { "shotId": "shot-2", "assignments": [] }
  ]
}
\`\`\`
`,
    variables: [
      variable('variantCatalog', { description: '角色子形象清单（含 id / 名称 / 差异描述 / 触发关键词）。' }),
      variable('shotList', { description: '分镜清单（含 shotId、画面描述、台词、出场角色）。' }),
    ],
    isCustom: false,
  },

  scene_extraction: {
    id: 'scene_extraction',
    category: 'extraction',
    name: '场景提取',
    description: '从剧本中提取所有"主要场景"，输出结构化资料用于后续 AI 文生图与场景基准库',
    template: `请根据提供的小说原文、推文文案、故事情节，提取文中出现过的所有"主要场景"。

【输入数据】
小说原文：
{{script}}

推文文案（已精炼的整集解说旁白；可补足剧情主线信息；无则视作空）：
{{tweetScript}}

故事情节（剧情主线摘要；无则视作空）：
{{plotSummary}}

项目视觉风格定向（视觉风格关键词；用于在原文未明说时做合理可视化补全的风格收敛，不影响客观事实；无则忽略）：
{{stylePrefix}}

【字段要求】每个场景必须输出以下字段：
1. "name"：场景标准名称
   - 必须 ≥ 4 个字，且尽量清晰、稳定、适合后续做参考图命名
   - 例：学校校园外景 / 家中客厅内部 / 医院病房内部 / 废弃工厂仓库内部
2. "aliases"：场景全部代称，多个代称用英文逗号分隔；不得重复 name 本身；如果没有代称，填空字符串 ""
3. "description"：场景详细可视化描述（中文），按下面"description 写法规范"组织
4. "time"：可见时间状态，仅可为 "day" / "night" / "twilight"
5. "weather"：天气短语（如 晴 / 阴 / 小雨 / 暴雨 / 大雪 / 雾 等）；若不可判定填 ""
6. "mood"：可见氛围短语（落到光线 / 色调 / 空间状态 / 天气特征上的可见线索，禁止抽象评价词）
7. "keyElements"：场景内具有辨识度的可视化元素列表（字符串数组），3–6 项

【硬性规则】违反任一项都视为不合格：
1. 必须合并同一场景的不同叫法、别称、简称到同一条记录；不得重复输出同一个场景。
2. 只提取"主要场景"：对剧情推进有作用、被明确提及、可单独形成视觉画面。不要输出一闪而过、无法独立成景的泛化地点。
3. 同一地点在不同时间段或使用状态下本质仍是同一场景的，优先合并为一个场景。
4. 同一建筑内若有多个明显独立空间且能在剧情中单独成镜（客厅 / 卧室 / 病房 / 走廊），允许分别输出。
5. 若提供了"项目视觉风格定向"，对原文未明说的视觉细节做补全时风格要向其收敛；但不得改变原文已明确的空间事实。

【description 写法规范】
1. description 必须是完整自然语言句子，并尽量包含以下可视化信息：
   - 环境类型（室内 / 室外 / 场所属性）
   - 时间（白天 / 黄昏 / 夜晚 / 凌晨）
   - 氛围（落到可见光线、色调、天气特征上）
   - 空间结构（前景 / 中景 / 后景关系，房间布局，开口与通道）
   - 主要陈设
   - 主要材质
   - 光线特征（光源方向、强度、色温）
   - 可识别细节（招牌 / 标志 / 划痕 / 痕迹等可作为镜头记忆点的元素）
2. 必须以"场景可视化描述"为主，方便后续直接用于场景设定或生图参考。
3. **绝对禁止**出现以下任一项：
   - 人物姓名 / 人物代称 / 我 / 他 / 她 / 他们
   - 人物动作 / 人物情绪 / 对话内容
   - 抽象评价词（"很阴森"、"很豪华"、"很破旧"），必须落到具体画面元素上
4. 原文未把场景描写得很完整时，结合剧情语境、场景用途、时代背景、生活常识做合理保守的可视化补全；不得补出超出剧情常识的夸张设定。
5. 写法风格统一，优先采用"空间结构 + 地面 / 墙面 / 陈设 + 光线 / 氛围 + 可识别细节"的方式描述。

【室内场景特殊要求 — 为后续场景图透视全貌取景预留素材】
后续场景参考图会以"强透视 + 全貌取景"方式渲染，让下游视频模型不需要凭空想象未入画的部分。
因此对所有 description 中能判定为**室内**的场景，必须显式写明以下要素：
   a. 至少两面相邻墙体的位置与材质（如"左侧水泥墙、正面贴白色瓷砖的承重墙"）
   b. 地面材质与图案（如"灰色水磨石地面，带浅色拼缝"）
   c. 天花板状态（吊顶 / 露梁 / 裸顶管线 / 高度感）
   d. 全部主要开口的相对位置：门 / 窗 / 拱门 / 走廊入口（如"正面墙居中有一扇木门，右侧墙开两扇窄窗"）
   e. 房间整体布局轮廓（开间形状、深度方向、家具分布的相对位置）
若原文未明说，按场景用途与时代背景做合理保守补全；不得为了缩短描述而省略墙体 / 地面 / 天花板 / 开口任一项。
室外场景不强制以上 a–e 项，但仍需写清地面、主要建筑立面、纵深方向上的可见物，便于建立透视纵深。

【输出要求】
- 只输出 JSON，可包裹在 \`\`\`json 代码块中；禁止输出任何解释、前言、备注、Markdown 标题。
- JSON 必须严格遵循下方示例的结构（顶层对象包含 \`scenes\` 数组）。
- 不得出现重复场景、不得缺字段、不得输出无效 JSON。

\`\`\`json
{
  "scenes": [
    {
      "name": "学校校园外景",
      "aliases": "校园,教学楼",
      "description": "一处带有教学楼和操场的校园外部空间，时间为白天，整体氛围开阔而日常。主楼是红砖结构的教学楼，前方连接着宽阔的水泥地和塑胶跑道，操场边缘种着成排树木，地面开阔，视野完整，具有明显的校园公共区域特征。",
      "time": "day",
      "weather": "晴",
      "mood": "开阔、日常、自然光均匀",
      "keyElements": ["红砖教学楼", "塑胶跑道", "成排树木", "水泥广场"]
    },
    {
      "name": "家中客厅内部",
      "aliases": "家里,客厅",
      "description": "一间长方形的普通住宅客厅内部，时间偏傍晚，氛围安静而生活化。开间略呈横向，深度方向通向居室内侧。左侧为整面浅米色乳胶漆墙，墙上挂一幅小尺寸装饰画；正面墙体为浅灰色乳胶漆，墙面居中摆一台低矮的胡桃木电视柜，右上方开一扇方形落地窗，窗外可见暖色傍晚天光；右侧墙体为同色乳胶漆，靠墙位置设一组米色布艺三人沙发，沙发后通向走廊的拱形门洞位于右后角。地面铺设浅栎木色实木地板，带细密拼缝。顶部为简洁白色平吊顶，中央嵌一盏圆形吸顶暖光灯，灯光向四周扩散在墙面留下柔和过渡。中央区域摆放低矮深木色茶几，茶几与沙发、电视柜共同构成紧凑的居家生活动线。",
      "time": "twilight",
      "weather": "",
      "mood": "暖色调灯光、安静、居家",
      "keyElements": ["浅栎木地板", "米色布艺沙发", "胡桃木电视柜", "白色平吊顶圆形吸顶灯", "正面墙落地窗", "右后角拱形门洞"]
    }
  ]
}
\`\`\`
`,
    variables: [
      variable('script'),
      variable('tweetScript', { required: false }),
      variable('plotSummary', { required: false }),
      variable('stylePrefix', { required: false }),
    ],
    isCustom: false,
  },

  prop_extraction: {
    id: 'prop_extraction',
    category: 'extraction',
    name: '道具提取',
    description: '从剧本中提取所有"主要道具"，输出结构化资料用于后续 AI 文生图与道具基准库',
    template: `请根据提供的小说原文、推文文案、故事情节，提取文中出现过的所有"主要道具"。

【输入数据】
小说原文：
{{script}}

推文文案（已精炼的整集解说旁白；可补足剧情主线信息；无则视作空）：
{{tweetScript}}

故事情节（剧情主线摘要；无则视作空）：
{{plotSummary}}

项目视觉风格定向（视觉风格关键词；用于在原文未明说时做合理可视化补全的风格收敛，不影响客观事实；无则忽略）：
{{stylePrefix}}

【字段要求】每个道具必须输出以下字段：
1. "name"：道具标准名称，2 个字以上，清晰、稳定、适合后续做参考图命名（如：银色机械怀表 / 黑色长柄雨伞 / 桐木骨灰盒 / 旧式翻盖手机 / 朱砂符纸）
2. "aliases"：道具全部代称，多个代称用英文逗号分隔；不得重复 name 本身；如果没有代称，填空字符串 ""
3. "description"：道具详细可视化描述（中文），按下面"description 写法规范"组织
4. "importance"：道具在剧情中的重要性，仅可为 "high" / "medium" / "low"
   - high：贯穿主线、决定结局、反复出现的关键信物 / 武器 / 证物
   - medium：在 1–2 个核心情节点起作用的道具
   - low：场景中出现但仅做点缀、辅助说明的道具
5. "scenes"：该道具出现过的场景标准名列表（字符串数组，应与场景提取的 name 字段对齐）；若无法确定填空数组 []

【提取范围 — 主要道具】满足下列任一条件即纳入：
- 会与角色发生交互（被拿起、使用、交换、佩戴、丢弃、藏匿）
- 推动剧情发展（信物、关键证物、线索、武器、法宝、钥匙、信件、手机、契约、药剂等）
- 反复出现且具有可识别外观的可移动物

【严禁提取】下列类别归属场景或角色描述，不进入 props：
- 环境陈设：沙发、椅子、床、柜子、桌子、灯具、门、窗、墙壁、地板、天花板、管道、固定设施、建筑结构
- 角色服装与造型组成部分：上衣、裤子、鞋、围巾、首饰、发饰、帽子、眼镜（**例外：剧情明确把它作为关键信物使用时可保留为道具**）
- 宠物 / 随身生物 / 灵兽（属角色范畴）
- 食物 / 饮料一闪而过的消耗品（除非剧情围绕它展开）
- 一闪而过、无法独立成镜的泛化物体

【硬性规则】违反任一项都视为不合格：
1. 必须合并同一道具的不同叫法、别称、简称到同一条记录；不得重复输出同一个道具。
2. 同一道具在不同章节有外观变化（如崭新 → 烧毁），优先合并为一个道具，并在 description 里点出最具辨识度的稳定外观；不要拆成多个重复道具。
3. 同一类别下若有多件外观差异明显的同类物（如两把不同的剑、两封不同的信），允许分别输出，但必须给出独立 name 和差异化 description。
4. 若提供了"项目视觉风格定向"，对原文未明说的视觉细节做补全时风格要向其收敛；但不得改变原文已明确的客观外观。
5. \`scenes\` 数组中的场景名应使用与场景提取一致的标准名；若该道具未在任何已明确的场景中出现，填 []。

【description 写法规范】
1. description 必须是完整自然语言句子，并按以下结构尽量包含可视化信息：
   - 形状
   - 主要材质
   - 结构特征（开合方式、组成部件、连接关系）
   - 主要颜色
   - 表面纹理 / 磨损 / 污渍
   - 尺寸感（手掌大小 / 半人高 / 可单手握持 等相对尺度）
   - 可识别细节（刻字、图案、瑕疵、标签）
2. 必须以"道具可视化描述"为主，方便后续直接用于道具设定或生图参考。
3. **绝对禁止**出现以下任一项：
   - 人物姓名 / 人物代称 / 我 / 他 / 她 / 他们
   - 人物动作（"被某人拿在手中"、"挥舞"等）/ 人物情绪 / 对话内容
   - 道具在剧情中的象征意义 / 推动了什么事件
4. 原文未把道具描写得很完整时，结合道具用途、时代背景、剧情语境、生活常识做合理保守的可视化补全；不得补出超出剧情常识的夸张设定。
5. 写法风格统一，优先采用"形状 + 材质 + 结构 + 颜色 + 表面细节 + 尺寸感"的方式描述。

【输出要求】
- 只输出 JSON，可包裹在 \`\`\`json 代码块中；禁止输出任何解释、前言、备注、Markdown 标题。
- JSON 必须严格遵循下方示例的结构（顶层对象包含 \`props\` 数组）。
- 不得出现重复道具、不得缺字段、不得输出无效 JSON。

\`\`\`json
{
  "props": [
    {
      "name": "银色机械怀表",
      "aliases": "怀表,旧表",
      "description": "一只可单手握持的圆形机械怀表，外壳为做旧抛光的银色金属，正面有可向上翻开的弧形表盖，盖面刻有细密的几何花纹，连接一根短链；表盘为奶白色，黑色罗马字标，时分针为深蓝色，玻璃表面有一道斜向的细微划痕。",
      "importance": "high",
      "scenes": ["殡葬用品店后院", "家中客厅内部"]
    },
    {
      "name": "桐木骨灰盒",
      "aliases": "骨灰盒,木盒",
      "description": "一只双手可端起的长方形桐木盒，整体为浅黄褐色木质纹理，表面打磨平整带有暗淡哑光质感，盒盖与盒身通过两枚黄铜小锁扣闭合，前侧贴有一张泛黄的白色长条纸标签，四角带有轻微磕碰留下的浅色擦痕。",
      "importance": "medium",
      "scenes": ["殡葬用品店后院"]
    }
  ]
}
\`\`\`
`,
    variables: [
      variable('script'),
      variable('tweetScript', { required: false }),
      variable('plotSummary', { required: false }),
      variable('stylePrefix', { required: false }),
    ],
    isCustom: false,
  },

  tweet_script_generation: {
    id: 'tweet_script_generation',
    category: 'tweet',
    name: '推文文案生成（漫剧爆款公式版）',
    description: '把整集剧本改造成第一人称漫剧推文旁白；强制爆款开头公式 + 删水文 + 短句节奏 + 反差递进反转结构，适配漫剧短视频。',
    template: `你是一名为漫剧短视频创作者服务的专业小说润色智能体。核心使命：把用户输入的小说原文，改造成适配短视频平台、能拉满停留与完播的【第一人称漫剧爆款旁白】。
请严格按照下面的爆款公式 + 漫剧文案规则，输出一段可直接做 TTS 配音 / 直接做字幕的连续旁白。

【输入剧本】
{{script}}

═════════════════════════════════════════════════════════════
【0. 字幕标点强约束 — 最高优先级（违反任意一条 = 失败）】
═════════════════════════════════════════════════════════════
本输出会直接做成竖屏短视频字幕，标点会变成画面噪声、引号 / 句号会卡 TTS 朗读。强制：

▸ 全文**唯一允许**的标点：**中文逗号「，」**。其它标点一律用换行替代。
▸ **严禁出现**的标点（出现即不合格）：
  句号「。」 问号「？」 感叹号「！」
  引号「"」「"」「'」「'」「「」「」」 书名号「《》」
  冒号「：」 分号「；」 顿号「、」
  省略号「……」「...」 破折号「——」「—」 括号「（）」「()」
  以及对应的所有英文标点 . ? ! " ' : ; , ... — ( )（其中英文逗号也禁止，逗号只用中文「，」）
▸ **一句一行**：原文里每出现一个语义停顿（原本会用句号 / 问号 / 感叹号 / 长破折号的位置），都用**换行**代替；同一行内仅允许少量逗号做轻微停顿
▸ **每行最多 15 字**（硬上限，超出立即换行；理想区间 6–15 字，更短更利于字幕一屏读完）
▸ 人物台词不加引号：直接换行写台词内容；如需指明谁在说，用「他说」「我说」开头另起一行，再换行写台词正文
▸ 数字 / 英文 / 专有名词照常保留（比如 14 亿 / 80% / 5 月 16 号 / S 省）
▸ 拟声词 / 强情绪短句单独成行（比如：卧槽 / 砰 / 我愣住了）

正确示例（看就懂）：
我一出生就被五鬼夺寿
刚满五岁就已经半截身子埋进棺材
爷爷说我想要活命
就必须向死人借寿
棺材里的尸参熬汤我每天喝三碗
骸骨上的骨菌我一口吃八根
就连十分罕见的太岁我都一周一顿
经过这三种大补
我才勉强活到了今天

错误示例（任何一条都不允许）：
"我一出生就被五鬼夺寿。"   ← 用了引号 + 句号
我一出生就被五鬼夺寿，刚满五岁就已经半截身子埋进棺材，爷爷说...   ← 没换行，全堆在一句
我说："你疯了吗？"   ← 用了引号 + 冒号 + 问号

═════════════════════════════════════════════════════════════
【1. 人称强制 — 第一人称"我"沉浸式视角】
═════════════════════════════════════════════════════════════
- 全文统一第一人称"我"叙事，绝对不切换第三人称
- 漫剧主角视角，所有动作 / 心理 / 反应都从"我"的角度展开
- 配角通过"他 / 她 + 极短台词"融入"我"的旁白，不做独立第三人称解说

═════════════════════════════════════════════════════════════
【2. 开头黄金钩子（前 3 句必须爆款公式开局）— 王中之王】
═════════════════════════════════════════════════════════════
开头**必须**套用以下任一爆款结构（选最贴合本集核心反差 / 转折的一种）：

▸ 反转结构（最基础、最稳）
模板：「我一个 xxx，却被 xxx，就连 xxx，甚至 xxx，然而 xxx，只因 xxx」
关键字眼：却 / 竟 / 不仅 / 而且 / 就连 / 甚至 / 然而 / 不仅不…反而… / 只因
例：我一个重度精神病，却被全国人奉为神明；他们听我说自己是派大星，竟也深信不疑；只因…

▸ 都知道结构
模板：「做过 xx 的都知道，xx 不仅 xxxx，而且 xxxx，甚至 xxxx，而我却…」
例：杀过人的都知道，毁尸灭迹是头等大事，但更重要的却是如何跑路，怎么让所有人都抓不到你…

▸ 全国类
模板：「全国 14 亿人都被 xxx 骗了，其实 xxx 并不是 xxx，而是 xxx，当年…」
例：全国 13 亿人都被刘备骗了，宅心仁厚不过是他收买人心的手段，真实面目却是阴险狡诈的大耳贼…

▸ 第一次类
模板：「我（你 / 男人）第一次 xx，竟 xxx，不仅 xxx，甚至 xxx，然而 xxx，此刻…」
例：我第一次直播就把 80 万观众吓当场嗝屁，可这样诡异的直播，不仅没人出来制止，反而吸引了全球 76 亿人在线观看…

▸ 为了证明类
模板：「为了证明 xxx，可以 xxx，竟 xxx，不仅 xxxx，而且 xxxx，甚至 xxxx，此刻…」
例：为了证明癌细胞是不死的存在，我一夜之间在体内植入 37 种病毒，只因…

▸ 这是 xx 世界 / 这个世界每个人都
模板：「这是个 xx 的世界，每个人 xx 都会 xx，有的 xxxx，有的 xxxx，甚至 xxx，然而明明 xxx，却 xxx，但…」
例：这是个赛博朋克世界，所有人都有概率成为强大的升者，有觉醒成为擅长战斗的武者…而我一觉醒来成为反派…

▸ 起床第一件事
模板：「这个世界的人起床第一件事就是 xxx，不仅 xxx，而且 xxx，甚至 xxx，然而我却 xxx，此刻…」

▸ 我重生 / 穿越 / 觉醒类
模板：「我重生（穿越 / 觉醒）成了 xxx，而且还是 xxx，不仅 xxxx，而且 xxxx，甚至 xxxx，此刻…」
例：我重生成了一条狗，却被人当神明供奉；只因我虽然是狗却已经活了 68 年之久…

▸ 意外发现 / 获得类
模板：「我意外（发现 / 获得 / 觉醒） xxx，然而 xxx，甚至 xxx，但他们都不知道的是 xxx，此刻…」
例：我意外获得鱼鱼果实，却被众人嘲讽是个离不开水的废物果实；殊不知鱼鱼果实其实是恶魔果实的天花板…

▸ 还没死 / 临终之问类
模板：「xx 意识到自己马上就要死了，于是临死前 xxx，xxx」
例：奶奶意识到自己马上就要死了，于是临死前问我一个很奇怪的问题，xxx
例：爷爷意识到自己马上就要死了，于是临死前嘱咐了我两件事，第一 xxx

▸ 一出生类（异象 / 诅咒 / 命格）
模板：「我（这个 xx 里的人）一出生就 xxx，不仅 xxx，甚至 xxx，xxx」
例：我一出生就让村里的女人全成了寡妇，村子里圈养的鸡鸭也在一夜之间消失不见，xxx
例：这个村子里的男孩一出生都要穿上寿衣，而且必须穿满八年才能脱掉，xxx
例：我一出生就被五鬼夺寿不久矣，刚满五岁就已经半截身子埋进了棺材，xxx

▸ 那天那年类（特定时间 + 反常铺垫）
模板：「从我 xx 岁那年（那天）起，全家（村里 / 学校）就开始 xxx，只因 xxx」
例：从我九岁那年起，全家就开始躺在红棺材里等死，只因奶奶十年前绑回来一个疯女人 xxx
例：那天我问师傅，唐僧师徒取回的真的是真经吗，倘若是真经，为何 xxx

▸ 民间传说 / 阎王类
模板：「（民间）传说，xxx 每年都会 xxx，那年 xxx 点了我的名字，xxx」
例：传说阎王爷每年都会在生死簿随机点卯，点到谁的名字，谁就得在一年之内去地府报道，那年阎王点了我的名字 xxx

▸ 穿越具体朝代 / 历史人物类（穿越题材首选钩子家族）
模板 A：「穿越 xx，我（成了 / 当着 / 面对） xxx，每天不是 xx 就是 xx，目的就是 xxx，今天 xxx」
模板 B：「穿到 xx 后，我本想 xxx，但因 xxx，xxx，正巧 xxx」
例：穿越大唐，贞观成为李世民的儿子，每天不是去青楼看花魁弹琴吹箫，就是把李世民气得三天饿九顿，只因要让自家老爹封了我去偏远地区当个逍遥王，今天我来到了皇宫内
例：穿越大明，你当着朱元璋的面收敛贪污百万两黄金，不仅修建豪宅雇官员入商，还私自铸刀征兵 xxx
例：穿越古代，我面对皇兄诬陷我沾污皇嫂时，我直接复刻凌晨审判的那场叔嫂案，xxx
例：穿到三国后，我本想辅佐刘备成就一番大事，但因思想过于超前，被说妖言惑众，正巧此时曹操 xxx
例：穿越大唐，我靠装疯卖傻誓要打京城第一美女为妻，xxx
关键句式：「穿越大唐 / 大明 / 古代 / 三国」+ 立刻反差行为 + 「目的就是 / 只因 / 此刻」收口

▸ 我是 / 我成了 / 我以 xx 身份类（强戏剧反差身份切入）
模板：「我是（成了 / 拥有 / 以） xx 的 xx，xxx，xxx，xxx」
例：我是史上最长寿的将军，在百岁寿宴当天，本该等待狼凯旋归来恭贺大寿的我，却等来了九口带血的棺材，送棺前来的 36 人目光整齐划一
例：我成了秦始皇的私生子，对他说的第一句话就是，爹我们准备造反吧，秦始皇 3 年之后必死，大秦终亡
例：我以神仙的身份在外悲摆招摇撞骗，说自己召唤神龙呼风唤雨的法术有手就行，谁料 xxx
例：我拥有无限寿元却娶了个凡人女子为妻，为了能和她共度余生，我选择与她笑死一同老去 xxx
例：我可以凭借一个眼神吓退满朝文武百官，他能让自身为九五之尊的皇帝给你端茶倒水

▸ 强戏剧事件开局类（从荒诞情节切入，无 "我"前置铺垫）
模板：「xxx，却 xxx；眼前 xxx，下一秒 xxx」
例：富豪千金抛绣球招亲，却砸中一个乞丐，而乞丐看到绣球的第一眼，便立马捡在手中，死死抱住绣球
例：瞎眼男人在大山支教三年时间，一直以为门下学生都是村里的孩童，却不知课堂上坐着的其实是山中的大妖
例：面对未婚妻的强势退婚，我刚想咆哮少年穷，却又飞快地闭上了嘴，只因我发现自己才是沦为废物的天命主角
例：直到那个扶不起的阿斗统一了三国，诸葛亮才终于确定眼前的刘禅，老子的孔明灯早特么飞到外太空去了

▸ 我每隔 xx 就 / 周期性反差行为类
模板：「我每隔 xxx 就 xxx，xx 的越好，别人 xxx，可他们都不知道，xxx，只因 xxx」
例：我每隔一段时间就从人贩子手里买几个小姑娘回家，越年轻的越好，别人都背地里骂我是猥琐变态男，可他们不知道的是，我这么做就是为了骗补贴，只因我穿越的时候获得了一个系统，系统每天补贴我十块钱

▸ 题材速查（按本集核心反差选钩子）：
- **穿越类**（穿越大唐 / 大明 / 古代 / 三国 / 系统）→ 用上面"穿越具体朝代"家族；立刻"成为某个具体历史人物 + 反差行为 + 目的"
  例：穿越大唐，贞观成为李世民的儿子，每天不是去青楼看花魁就是把李世民气得三天饿九顿
  例：穿到三国后我本想辅佐刘备成就大事，但因思想过于超前被说妖言惑众
- **设定 / 身份反差类**（人称 + 强反差身份）→ 用上面"我是 / 我成了 / 我以"家族
  例：我是史上最长寿的将军，在百岁寿宴当天却等来了九口带血的棺材
  例：我成了秦始皇的私生子，对他说的第一句话就是，爹我们准备造反吧
- **设定 / 戏剧事件类**（无 "我"前置铺垫，直接抛荒诞情节）→ 用上面"强戏剧事件开局"家族
  例：富豪千金抛绣球招亲，却砸中一个乞丐
  例：瞎眼男人在大山支教三年，一直以为门下学生都是村里孩童，却不知课堂上坐着的是山中大妖
- **悬疑 / 校园生存类** → 直接抛尸首 / 异常状况 + 第一人称当事人视角
  例：室友被杀了，尸体就藏在他衣柜里，而我默默地关上了衣柜
  例：我直播的时候被网友发现宿舍天花板漏水，大家纷纷让我找宿管来修，只有一条弹幕说，你们这个宿舍是个棺材房 xxx
- **同人 / 经典 IP 黑化反转类** → 老 IP 名号 + 颠覆原版认知
  例：哪吒死了，死在了封神的前夜
  例：西游之行是一场大阴谋，取经归来的不是得道佛陀，而是祸乱之始的邪魔
- **猎奇 / 离奇事件类** → 强反转因果 + "竟"字递推
  例：我妹为了博人同情，竟将我活活插死
  例：这个坛子里装着清朝的第十三位皇帝，而眼前的宫女为了复活皇帝，竟要吸光我的阳寿
- **人性 / 高考重生类** → 当事人受害 / 翻盘视角 + 数字震撼
  例：高考前夕，我被 18 个高考状元同时魂穿了
  例：高考 720 分，我放弃上大学，我妈没疯，表妹一家却疯了
- **直播 / 当代题材类** → 直播开场 + 异常突发
  例：我开了个直播间算命，上来就匹配到一个大孝子，主播我奶奶什么时候死

**禁开头形式**（一律不许出现）：
- 平铺直叙的环境铺垫（"在一个 xx 的下午"、"夜深了"）
- 流水账时间线
- 人物背景介绍（"我叫 xxx，今年 xx 岁"）
- 倒水分式的世界观长篇铺陈

═════════════════════════════════════════════════════════════
【3. 爽点核心公式（贯穿全文，不只是开头）】
═════════════════════════════════════════════════════════════
- **反差**：设定与现实落差越大越爽（弱 vs 神 / 普通 vs 顶配 / 表面 vs 真实）
- **递进**：「不仅… 而且… 甚至…」一层比一层夸张
- **反转**：「然而 / 不料 / 只因 / 万万没想到 / 殊不知」
- **递推字眼**：却 / 竟 / 不仅 / 而且 / 就连 / 甚至 / 然而 / 反而 / 只因
- **倒叙开局**：先抛震撼结果，再讲来龙去脉
- **数字震撼**：「3 天后」「80% 的人」「一夜之间」「百万 / 亿级」「14 亿人都"
- **隐藏身份**：表面弱 → 实际大佬；表面强 → 一拳被秒
- **被低估翻盘**：所有人嘲讽我 → 我反手碾压
- **天降系统 / 金手指**：穿越 / 重生 / 觉醒 / 系统 / 任务 / 奖励
- **宿命反差**：被预言要死的人 → 反手改命

═════════════════════════════════════════════════════════════
【4. 内容精简原则（关键：精简不等于砍核心）】
═════════════════════════════════════════════════════════════
**精简的目标是去水，不是压缩剧情**。判断一句话该留还是该删的标准：
"把它删掉，剧情还能不能让观众听懂、能不能保持冲击？" — 不能 → 必须留。

**删除**：
- 与主线**无关**的环境铺垫（季节、天气、地点纯描写）
- 角色心理**慢镜头**长句（比如三句话讲"他犹豫了一下"）
- 与冲突 / 爽点无关的客套话、过场对白
- 与主线**无关**的支线 / 配角小动作
- "他想"、"他感觉到"、"他意识到"等慢节奏衔接副词

**必须完整保留**（不许压缩，不许跳过）：
1) **核心剧情节点**：开场设定 → 起因 → 冲突 → 转折 → 高潮 → 结局留扣，**每一个节点都至少 1–2 句旁白**
2) **关键人物登场 / 退场 / 身份揭露**：每一次都要明确点出
3) **关键台词**：用「他说："xxx"」/「我说："xxx"」+ 原文短引语融入旁白
4) **关键道具 / 设定 / 系统提示 / 数值**：金手指、奖励、属性、技能名要保留
5) **空间转换**：场景换了必须有一句旁白点出（"我冲出门"、"等我赶到时"）
6) **情绪爆点 / 反转点 / 反差点**：每个都至少 1 句旁白单独承载
7) **画面感动作**（漫剧关键）：瞳孔放大、脚步顿住、手指攥紧、转身、撞门、举刀、流血等可视化动作

**核心原则**：原剧本里每个能形成一帧漫剧画面的动作，输出旁白都要有对应承接，不能因为追求节奏而跳过画面。

═════════════════════════════════════════════════════════════
【5. 节奏与语言（不限制总字数，由内容决定篇幅）】
═════════════════════════════════════════════════════════════
- **不限制输出总字数**：篇幅完全由"必须保留的核心内容"决定。原文里有多少核心剧情节点 / 关键画面 / 关键台词，输出就有多少对应旁白；不要为了短而砍内容，也不要刻意拉长水文
- **每句单句最多 15 字（硬上限）**；理想区间 6–15 字，按 1.3–1.5 倍语速朗读约 1.5–3 秒/句；超过 15 字立即换行（这是**单句节奏 + 字幕一屏可读**要求，不是总字数要求）
- 关键转折前用「……」或短句制造停顿
- 禁止连续 3 句相同结构；轮换：陈述句 / 反问 / 短句 / 省略 / 递进
- 短视频快节奏阅读习惯：开头猛、中段稳、结尾扣
- 强情绪词（爽 / 高能 / 离谱 / 炸了 / 卧槽）只在转折点出现，不堆叠

═════════════════════════════════════════════════════════════
【6. 漫剧适配（便于后续分镜）】
═════════════════════════════════════════════════════════════
- 每句旁白都要画面感强：能直接想象出一帧画面
- 关键情绪 / 动作要明确（瞳孔放大、脚步顿住、手指攥紧）
- 保留关键台词原文，方便漫剧人物口型对应
- 整体段落紧凑，适配竖屏短视频观看

═════════════════════════════════════════════════════════════
【7. 平台合规】
═════════════════════════════════════════════════════════════
- 无低俗、暴力、血腥、擦边、违规导向内容
- 情绪正向可控（爽点不等于戾气；冲突不等于对立）
- 涉及战斗 / 死亡 / 反派表达克制，画面感聚焦于"动作"而非"伤害细节"

═════════════════════════════════════════════════════════════
【8. 元语言禁令】
═════════════════════════════════════════════════════════════
**严禁**出现：
- "接下来"、"然后我们看到"、"画面切到"、"镜头转向"
- "本集主要讲"、"剧情梗概"、"故事是这样的"
- 任何标签前缀："【高能】"、"#爽点 #反转"、"⚠️"
- Markdown 标题 / 序号 / 人名标签 / 场景标签

═════════════════════════════════════════════════════════════
【9. 结尾留白】
═════════════════════════════════════════════════════════════
- 不要把本集所有结果一次说尽
- 用悬念 / 情绪冲击 / 半句话 / 反问留扣子
- 形式参考：「然而我没想到的是……」/「下一秒，所有人都疯了。」/「这一切，才刚刚开始。」

═════════════════════════════════════════════════════════════
【10. 输出前自检（必须在交付前自我核对）】
═════════════════════════════════════════════════════════════
内部完成草稿后，**逐条**核对下面 8 条；任意一条不达标，自我修订后再输出最终版本：
1. ☐ 全文统一第一人称"我"，没有切到第三人称解说？
2. ☐ 开头第 1 句是上述爆款公式之一的钩子（反转 / 都知道 / 全国 / 第一次 / 为了证明 / 这是xx世界 / 起床 / 重生穿越 / 意外发现 / 还没死 / 一出生 / 那天那年 / 传说 / 穿越具体朝代 / 我是我成了我以身份 / 强戏剧事件开局 / 我每隔xx就周期反差），不是平铺直叙？
3. ☐ 钩子选择匹配本集题材（穿越 / 设定身份反差 / 设定戏剧事件 / 悬疑 / 同人 / 猎奇 / 人性 / 直播 / 公式开头 / 其它）？
4. ☐ 原剧本里每一个**核心剧情节点**（设定 / 起因 / 冲突 / 转折 / 高潮 / 结局留扣）都有旁白覆盖，没有跳节？
5. ☐ 原剧本里每个**关键画面动作 / 关键台词 / 关键道具 / 空间转换**都有对应旁白，没有为了短节奏而跳过画面？
6. ☐ **每行单句长度 ≤ 15 字（硬上限）**，理想区间 6–15 字；超过 15 字的行已全部换行拆短？节奏紧凑（**不在乎总字数**——内容齐全优先于篇幅）？
7. ☐ **字幕标点强约束（最高优先级）**：全文除中文逗号「，」外**没有任何其它标点**？特别检查是否有句号 / 问号 / 感叹号 / 引号 / 冒号 / 分号 / 顿号 / 省略号 / 破折号 / 括号 / 书名号 / 任何英文标点？
8. ☐ **一句一行**：原本会用句号 / 问号 / 感叹号 / 长破折号停顿的位置，全部用换行替代？没有出现"全堆在一句、靠逗号串到底"的长行？

═════════════════════════════════════════════════════════════
【输出格式】
═════════════════════════════════════════════════════════════
直接输出连续旁白文本，每句一行（用换行 \\n 分隔）。
全文**只允许**中文逗号「，」一种标点，其它标点（句号 / 问号 / 感叹号 / 引号 / 冒号 / 分号 / 顿号 / 省略号 / 破折号 / 括号 / 书名号 / 任何英文标点）一律不允许；原本会用这些标点的位置一律改成换行。
不要 Markdown 标题、序号、人名标签、场景标签；不要代码块；不要解释；不要列大纲；不要任何前缀 / 后缀。
开头第 1 句**必须**是爆款公式之一的钩子。
`,
    variables: [variable('script')],
    isCustom: false,
  },

  drama_script_parse: {
    id: 'drama_script_parse',
    category: 'script',
    name: '剧情剧本解析（小说 → 专业分场剧本）',
    description: '剧情模式专用：把小说改写成标准短剧分场剧本（场头 + 动作行 + 角色台词行），台词带说话人，供分镜拆解与配音按角色选音色。',
    template: `你是一名专业的短剧编剧。下面是一部小说/剧本的片段（或全文，可能是纯小说文本，也可能是带 markdown 排版的剧本）。请把它改写成一份**标准分场剧本**（专业短剧剧本格式）。

【小说原文】
{{script}}

═════════════════════════════════════════════════════════════
【输出格式 — 严格遵守】
═════════════════════════════════════════════════════════════
只输出剧本正文，不要任何解释、标题、代码块或 markdown。由一场一场组成，每场三种行：

1. **场头行**：\`场次号. 场景名 · 时间 · 内/外\`——场景或时间切换时开新场，场次号递增。如 \`1. 废弃戏台 · 夜 · 内\`
2. **动作行**：直接写摄影机能直接拍到的内容，一句一行：环境氛围、人物姿态动作、表情细节、空间关系。如 \`雨水顺着残破的戏台边缘往下淌。宁卓独立台中央，背影绷直。\`
3. **台词行**：\`角色名（情绪/动作）："台词内容"\`——情绪/动作括号可省略；说话人写在最前，台词用中文引号。如 \`宁卓（抬眼）："你们来了。"\`

画外音/独白**不是必须的**：仅当原文确有叙述声音需求时，写 \`角色名（画外音）："…"\`，否则一行都不要写。

【解析规则】
1. 忠实原文：不改写剧情、不删减关键情节、不脑补没有的内容。
2. 动作行只保留能被画面呈现的内容；纯背景设定、人物身份介绍、世界观说明、心理活动、议论抒情等"知识性/说明性"句子直接丢弃——心理活动要转成可见动作（"他很紧张" → \`他攥紧剑柄，指节发白。\`）。
3. 动作行一句一行、长短适中；动作按节拍拆开（"转身→抓起→掷出"，不写"两人激战"这类概括句）。
4. 说话人判断：紧跟对话的"XX说/道/问/喊"等提示语指向谁，就用谁的名字；判断不出说话人时，把那句当作动作行（写成可见动作）。
5. 角色名全文统一：同一个人物优先用最常出现的称呼。
6. 兼容 markdown 输入：剥掉「## 标题」「**加粗**」「<!-- 注释 -->」等排版符号只取内容；「### 场景 N：场景名」转成场头行；「（动作指示）」按动作行处理。

【正确示例】
1. 废弃戏台 · 夜 · 内

雨夜的废弃戏台，帷幕残破被风掀起。冷蓝月光从屋顶豁口斜切进来。宁卓独立台中央，背影绷直，手握剑柄微颤。

宁卓（抬眼）："你们来了。"

老者（画外音）："这出戏，该收场了。"

宁卓没有回头，只是攥紧了手中的剑。

现在请解析上面的【小说原文】，输出分场剧本。`,
    variables: [variable('script')],
    isCustom: false,
  },

  drama_genre_analysis: {
    id: 'drama_genre_analysis',
    category: 'analysis',
    name: '短剧风格标签分析',
    description: '从剧本 / 小说判定三轴风格标签（题材 / 调性 / 前提装置），输出 JSON 供项目设置回填',
    template: DRAMA_GENRE_ANALYSIS_TEMPLATE,
    variables: [
      variable('script'),
      variable('genreOptions', { label: '可选题材', description: '题材卡清单，由代码按卡片注册表生成。', format: '顿号分隔' }),
      variable('toneOptions', { label: '可选调性', description: '调性卡清单。', format: '顿号分隔' }),
      variable('deviceOptions', { label: '可选前提装置', description: '装置卡清单。', format: '顿号分隔' }),
    ],
    isCustom: false,
  },

  shot_directive_genre_tone: {
    id: 'shot_directive_genre_tone',
    category: 'inference-directive',
    name: '推理约束 · 风格标签',
    description: '项目定了风格标签时注入：把题材卡 / 调性卡 / 装置卡拼进推理输入，校准剧情推进与台词动作',
    template: SHOT_DIRECTIVE_TEMPLATE_CONTENT.shot_directive_genre_tone,
    variables: [
      variable('genreSection', { label: '题材卡段落', description: '主题材整卡 + 辅题材摘录；无标签时为空串。', format: '多行文本', required: false }),
      variable('toneSection', { label: '调性卡段落', description: '命中的调性卡；无则空串。', format: '多行文本', required: false }),
      variable('deviceSection', { label: '装置卡段落', description: '命中的前提装置卡；无则空串。', format: '多行文本', required: false }),
    ],
    isCustom: false,
  },

  // ========== 短剧风格标签卡 ==========
  //
  // 由项目的三轴标签决定注入哪几张；卡片正文在 PromptStudio 里可直接改。

  genre_card_失忆: {
    id: 'genre_card_失忆',
    category: 'genre-card',
    name: '装置卡 · 失忆',
    description: '前提装置卡：主角比别人多拥有什么，以及它的边界与代价',
    template: GENRE_CARD_CONTENT.genre_card_失忆,
    variables: [],
    isCustom: false,
  },

  genre_card_穿越: {
    id: 'genre_card_穿越',
    category: 'genre-card',
    name: '装置卡 · 穿越',
    description: '前提装置卡：主角比别人多拥有什么，以及它的边界与代价',
    template: GENRE_CARD_CONTENT.genre_card_穿越,
    variables: [],
    isCustom: false,
  },

  genre_card_系统: {
    id: 'genre_card_系统',
    category: 'genre-card',
    name: '装置卡 · 系统',
    description: '前提装置卡：主角比别人多拥有什么，以及它的边界与代价',
    template: GENRE_CARD_CONTENT.genre_card_系统,
    variables: [],
    isCustom: false,
  },

  genre_card_读心: {
    id: 'genre_card_读心',
    category: 'genre-card',
    name: '装置卡 · 读心',
    description: '前提装置卡：主角比别人多拥有什么，以及它的边界与代价',
    template: GENRE_CARD_CONTENT.genre_card_读心,
    variables: [],
    isCustom: false,
  },

  genre_card_重生: {
    id: 'genre_card_重生',
    category: 'genre-card',
    name: '装置卡 · 重生',
    description: '前提装置卡：主角比别人多拥有什么，以及它的边界与代价',
    template: GENRE_CARD_CONTENT.genre_card_重生,
    variables: [],
    isCustom: false,
  },

  genre_card_马甲: {
    id: 'genre_card_马甲',
    category: 'genre-card',
    name: '装置卡 · 马甲',
    description: '前提装置卡：主角比别人多拥有什么，以及它的边界与代价',
    template: GENRE_CARD_CONTENT.genre_card_马甲,
    variables: [],
    isCustom: false,
  },

  genre_card_亲子隐秘: {
    id: 'genre_card_亲子隐秘',
    category: 'genre-card',
    name: '题材卡 · 亲子隐秘',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_亲子隐秘,
    variables: [],
    isCustom: false,
  },

  genre_card_仙侠修真: {
    id: 'genre_card_仙侠修真',
    category: 'genre-card',
    name: '题材卡 · 仙侠修真',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_仙侠修真,
    variables: [],
    isCustom: false,
  },

  genre_card_动作任务: {
    id: 'genre_card_动作任务',
    category: 'genre-card',
    name: '题材卡 · 动作任务',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_动作任务,
    variables: [],
    isCustom: false,
  },

  genre_card_古装权谋: {
    id: 'genre_card_古装权谋',
    category: 'genre-card',
    name: '题材卡 · 古装权谋',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_古装权谋,
    variables: [],
    isCustom: false,
  },

  genre_card_复仇打脸: {
    id: 'genre_card_复仇打脸',
    category: 'genre-card',
    name: '题材卡 · 复仇打脸',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_复仇打脸,
    variables: [],
    isCustom: false,
  },

  genre_card_家庭关系: {
    id: 'genre_card_家庭关系',
    category: 'genre-card',
    name: '题材卡 · 家庭关系',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_家庭关系,
    variables: [],
    isCustom: false,
  },

  genre_card_悬疑规则: {
    id: 'genre_card_悬疑规则',
    category: 'genre-card',
    name: '题材卡 · 悬疑规则',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_悬疑规则,
    variables: [],
    isCustom: false,
  },

  genre_card_生活流: {
    id: 'genre_card_生活流',
    category: 'genre-card',
    name: '题材卡 · 生活流',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_生活流,
    variables: [],
    isCustom: false,
  },

  genre_card_科幻未来: {
    id: 'genre_card_科幻未来',
    category: 'genre-card',
    name: '题材卡 · 科幻未来',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_科幻未来,
    variables: [],
    isCustom: false,
  },

  genre_card_职场喜剧: {
    id: 'genre_card_职场喜剧',
    category: 'genre-card',
    name: '题材卡 · 职场喜剧',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_职场喜剧,
    variables: [],
    isCustom: false,
  },

  genre_card_豪门婚恋: {
    id: 'genre_card_豪门婚恋',
    category: 'genre-card',
    name: '题材卡 · 豪门婚恋',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_豪门婚恋,
    variables: [],
    isCustom: false,
  },

  genre_card_身份错位: {
    id: 'genre_card_身份错位',
    category: 'genre-card',
    name: '题材卡 · 身份错位',
    description: '题材卡：压力来源 / 人物策略与信息权限 / 情绪落点 / 场面颗粒 / 集尾钩子 / 禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_身份错位,
    variables: [],
    isCustom: false,
  },

  genre_card_悬疑压抑: {
    id: 'genre_card_悬疑压抑',
    category: 'genre-card',
    name: '调性卡 · 悬疑压抑',
    description: '调性卡：台词语气、动作幅度、节奏、镜头取向与禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_悬疑压抑,
    variables: [],
    isCustom: false,
  },

  genre_card_搞笑: {
    id: 'genre_card_搞笑',
    category: 'genre-card',
    name: '调性卡 · 搞笑',
    description: '调性卡：台词语气、动作幅度、节奏、镜头取向与禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_搞笑,
    variables: [],
    isCustom: false,
  },

  genre_card_治愈: {
    id: 'genre_card_治愈',
    category: 'genre-card',
    name: '调性卡 · 治愈',
    description: '调性卡：台词语气、动作幅度、节奏、镜头取向与禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_治愈,
    variables: [],
    isCustom: false,
  },

  genre_card_燃向: {
    id: 'genre_card_燃向',
    category: 'genre-card',
    name: '调性卡 · 燃向',
    description: '调性卡：台词语气、动作幅度、节奏、镜头取向与禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_燃向,
    variables: [],
    isCustom: false,
  },

  genre_card_狗血: {
    id: 'genre_card_狗血',
    category: 'genre-card',
    name: '调性卡 · 狗血',
    description: '调性卡：台词语气、动作幅度、节奏、镜头取向与禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_狗血,
    variables: [],
    isCustom: false,
  },

  genre_card_致郁: {
    id: 'genre_card_致郁',
    category: 'genre-card',
    name: '调性卡 · 致郁',
    description: '调性卡：台词语气、动作幅度、节奏、镜头取向与禁止漂移',
    template: GENRE_CARD_CONTENT.genre_card_致郁,
    variables: [],
    isCustom: false,
  },

  // ========== TTI 图片生成模板 ==========

  tti_character_costume: {
    id: 'tti_character_costume',
    category: 'tti',
    name: '角色定妆照（三视图）',
    description: '生成角色三视图定妆照',
    // 把人物 demographic + appearance 前置，让 TTI 模型先锁定主体身份与可见特征，
    // 再施加技术约束（三视图布局、纯色背景、配光、跨视图一致性）。
    template: '{{stylePrefix}}, character turnaround sheet of a {{demographic}}, {{appearance}}, full body standing reference, neutral A-pose, three poses in one image: front view | three-quarter side view | back view, identical character identity / face / hair / skin / clothing / accessories repeated across all three views, plain pure white seamless background, soft even studio lighting, no cast shadows on background, clear silhouette, all clothing layers visible, objective visible appearance only, no props, no environment, no narrative, no text, no extra characters, art style lock: match the project art style exactly (color palette, lighting, brush/line work, textures, atmosphere, rendering technique); do NOT drift toward photorealism / live-action / a different aesthetic; if a style anchor reference image is provided as references[0], inherit ONLY its art style and never copy its content',
    variables: [
      variable('stylePrefix'),
      variable('demographic', {
        description: '角色 gender + age 合成的英文人物短语，例如 "young adult male, 28 years old"；buildCharacterCostumeTemplateVariables 自动生成。',
      }),
      variable('appearance', {
        description: '角色当前用于生图的客观外观描述（脸/发/体态/服装/配饰/可见痕迹），只允许画面可见信息。',
      }),
      variable('gender', {
        description: '兼容字段：原 gender 短语，已被 demographic 取代；保留给历史自定义模板。',
        required: false,
      }),
      variable('age', {
        description: '兼容字段：原 age 短语，已被 demographic 取代；保留给历史自定义模板。',
        required: false,
      }),
    ],
    isCustom: false,
  },

  tti_character_variant: {
    id: 'tti_character_variant',
    category: 'tti',
    name: '角色子形象定妆照',
    description: '以主形象定妆照为身份锚，只按差异描述派生出同一角色的不同年龄 / 状态 / 穿着',
    // references[0] 恒为主形象定妆照：这里的核心约束是"同一个人"，
    // 模型只允许按 variantPrompt 改变差异项，不得重新设计脸/骨相/肤色/瞳色。
    template: '{{stylePrefix}}, character turnaround sheet of a {{demographic}}, SAME PERSON as the reference sheet provided as references[0]: strictly inherit the face structure, facial features, bone structure, skin tone, eye color and base hair color from it — this is a variant of the SAME character, not a new character, {{appearance}}, VARIANT CHANGES (apply exactly these differences and nothing else): {{variantPrompt}}, full body standing reference, neutral A-pose, three poses in one image: front view | three-quarter side view | back view, identical character identity repeated across all three views, plain pure white seamless background, soft even studio lighting, no cast shadows on background, clear silhouette, all clothing layers visible, objective visible appearance only, no props, no environment, no narrative, no text, no extra characters, art style lock: match the project art style exactly (color palette, lighting, brush/line work, textures, atmosphere, rendering technique); do NOT drift toward photorealism / live-action / a different aesthetic',
    variables: [
      variable('stylePrefix'),
      variable('demographic', { required: false }),
      variable('appearance', { description: '主形象的客观外观描述（身份基线）。' }),
      variable('variantPrompt', { description: '子形象相对主形象的差异描述（年龄 / 状态 / 穿着的变化）。' }),
    ],
    isCustom: false,
  },

  tti_scene_preview: {
    id: 'tti_scene_preview',
    category: 'tti',
    name: '场景预览图',
    description: '生成场景参考图：强透视全貌取景；室内必须显式露出至少两面墙 + 地面 + 天花板，让下游视频模型不需要凭空想象未拍到的空间。',
    // 设计目标：把场景图当作"空间锚定"参考图给后续 ITV 视频模型用。
    // - 透视技法（perspective drawing technique）需要被显式声明，避免出现没有纵深、像贴图一样的平面图。
    // - 室内必须给出全貌：corner vantage / two-point perspective + wide-angle 让两面墙 + 地面 + 天花板都进画面，
    //   连同所有门 / 窗 / 通道；任何被裁切的墙都会让视频模型在生视频时自由发挥，造成空间漂移。
    // - 外景给出 full establishing shot + 强透视线，建立纵深和清晰的可视边界。
    template: '{{stylePrefix}}, environment concept art reference plate, no people, no character, no character action, full establishing shot, wide-angle lens, strong perspective drawing technique with clearly visible perspective lines (orthogonal lines / vanishing points), complete spatial layout fully revealed in frame, objective environmental details only, {{description}}, location: {{location}}, visible time cues: {{time}}, visible atmosphere cues: {{mood}}, for INTERIOR locations: corner vantage using two-point perspective from a slightly raised eye-level, at least two full adjacent walls visible together with the floor and the ceiling, all major openings (doors, windows, archways, corridors) included in frame, room footprint fully readable, no cropped walls, no missing ceiling, no missing floor; for EXTERIOR locations: wide establishing view with one-point or two-point perspective revealing the full ground plane, key façades and the surrounding spatial extent; sharp depth cues (foreground / midground / background), architectural and material details, accurate proportions, no off-screen guesswork, cinematic composition, 4k high detail, art style lock: match the project art style exactly (color palette, lighting, brush/line work, textures, atmosphere, rendering technique); do NOT drift toward photorealism / live-action / a different aesthetic; if a style anchor reference image is provided as references[0], inherit ONLY its art style and never copy its content',
    variables: [
      variable('stylePrefix'),
      variable('description', {
        description: '场景中的客观环境细节，只描述空间、建筑、地面、植被、天气痕迹、陈设等可见内容；室内必须含可见的墙面 / 地面 / 天花板与门窗位置，以便下游视频模型不需要凭空想象不可见区域。禁止出现人物、角色名、人物动作和对白。',
      }),
      variable('location'),
      variable('time', {
        description: '用于表现时间状态的可见线索，如 night、twilight、overcast daylight。',
      }),
      variable('mood', {
        description: '场景氛围的可见线索，只能写光线、色调、湿度、雾气、空气状态等物理表现。',
      }),
    ],
    isCustom: false,
  },

  tti_prop_reference: {
    id: 'tti_prop_reference',
    category: 'tti',
    name: '道具参考图',
    description: '生成道具参考图',
    template: '{{stylePrefix}}, prop design sheet, no people, no hands, no character action, centered composition, plain background, studio lighting, objective product view only, {{type}}, {{description}}, clear material edges, surface texture details, clean presentation, art style lock: match the project art style exactly (color palette, lighting, brush/line work, textures, atmosphere, rendering technique); do NOT drift toward photorealism / live-action / a different aesthetic; if a style anchor reference image is provided as references[0], inherit ONLY its art style and never copy its content',
    variables: [
      variable('stylePrefix'),
      variable('description', {
        description: '道具的客观外观描述，只描述形状、结构、材质、磨损、颜色和表面细节，禁止出现人物、角色名和人物动作。',
      }),
      variable('type'),
    ],
    isCustom: false,
  },

  tti_grid_shot_image: {
    id: 'tti_grid_shot_image',
    category: 'tti',
    name: '九宫格分镜图片',
    description: '生成 3×3 九宫格网格分镜图',
    template: `{{stylePrefix}}, 根据{{shotDescription}}, 生成一张具有凝聚力的 3×3 连续动作网格图像, 9 个格子是同一环境、同一人物、同一道具状态沿时间推进的分镜锚点，不是 9 个无关画面；每格都要有清楚的前景 / 中景 / 背景层次、可读的角色轮廓、手部姿态和光影方向；严格保持人物/物体、服装、空间结构和光线的一致性, 每个网格画面的比例保持为{{aspectRatio}}, {{resolution}}分辨率, {{aspectRatio}}画幅。

{{gridPrompt}}`,
    variables: [
      variable('stylePrefix'),
      variable('shotDescription'),
      variable('gridPrompt'),
      variable('resolution'),
      variable('aspectRatio'),
    ],
    isCustom: false,
  },

  tti_grid_4_shot_image: {
    id: 'tti_grid_4_shot_image',
    category: 'tti',
    name: '四宫格分镜图片',
    description: '生成 2×2 四宫格网格分镜图（更适合稳定镜头与少切换叙事）',
    template: `{{stylePrefix}}, 根据{{shotDescription}}, 生成一张具有凝聚力的 2×2 连续动作网格图像, 4 个格子是同一环境、同一人物、同一道具状态的起手 / 节奏切点 / 动作主峰 / 收束锚点；每格都要有清楚的前景 / 中景 / 背景层次、可读的角色轮廓、手部姿态和光影方向；严格保持人物/物体、服装、空间结构和光线的一致性, 每个网格画面的比例保持为{{aspectRatio}}, {{resolution}}分辨率, {{aspectRatio}}画幅。

{{gridPrompt}}`,
    variables: [
      variable('stylePrefix'),
      variable('shotDescription'),
      variable('gridPrompt'),
      variable('resolution'),
      variable('aspectRatio'),
    ],
    isCustom: false,
  },

  tti_storyboard_shot_image: {
    id: 'tti_storyboard_shot_image',
    category: 'tti',
    name: '故事板分镜图片',
    description: '生成带制作笔记的电影级故事板 / 前期制作方案板图片',
    template: `{{globalPositivePrefix}}
{{stylePrefix}}, highly detailed cinematic storyboard infographic poster, professional film pre-production design board, clear grid-based layout without mechanical equal panels, deep blue title bar or equivalent premium header system, modern UI visual design, information-dense but clean editorial layout, Behance style premium layout, ArtStation style production design quality, clear section hierarchy, thin borders, high-end commercial visual design, ultra detailed, 8K texture, cinematic lighting and emotional progression, consistent characters / scene / props across panels, {{aspectRatio}} composition, {{resolution}} quality.

Required board sections: project title header with project name, subtitle, format, genre, duration, constraints; character design zone with front/back/side/close-up/action pose studies when characters are present; scene design zone with cinematic concept art and rich spatial detail; top-down blocking diagram / floor plan with camera positions numbered 1-N and arrows for character movement and camera motion; storyboard story zone with a story-driven N-shot sequence; lighting and style zone; emotion keywords zone; sound design zone; cinematography notes zone; unified color palette zone.

Each storyboard panel must include: scene image, very short production note or action/dialogue beat, shot size label such as wide / medium / close-up, focal length label such as 24mm / 35mm / 50mm / 85mm, camera movement label such as static / tracking / handheld / push-in / crane / lateral move. The number of panels must follow the narrative rhythm, not a fixed count. These labels are production notes, not subtitles.

Storyboard brief:
{{storyboardPrompt}}

Strict rendering rule: render short production-board notes, numbered camera marks, arrows, color swatches, lighting notes, sound notes, and shot labels as part of the storyboard sheet; these notes are not dialogue subtitles. Do not turn ordinary dialogue into subtitles or speech bubbles unless the brief explicitly asks for screen text / UI text / signage. Avoid long text walls, random unreadable filler, logos, and watermarks. Maintain project style exactly and preserve reference-image identity when references are provided.
{{globalPositiveSuffix}}`,
    variables: [
      variable('globalPositivePrefix', { required: false }),
      variable('globalPositiveSuffix', { required: false }),
      variable('stylePrefix'),
      variable('storyboardPrompt'),
      variable('resolution'),
      variable('aspectRatio'),
    ],
    isCustom: false,
  },

  // ========== ITV 视频生成模板 ==========

  itv_character_motion: {
    id: 'itv_character_motion',
    category: 'itv',
    name: '角色动态视频',
    description: '生成角色动态展示视频；音轨只保留角色本人说话的干声，供「提取角色音频」直接做音色样本',
    // 音频约束是硬要求：这段视频的音轨会被 ffmpeg 提取成音色样本，
    // 任何 BGM / 音效 / 环境音 / 旁白都会污染样本，导致克隆出来的音色带底噪。
    template: `{{characterName}} {{action}}, {{stylePrefix}}, single character alone in frame, steady locked-off camera, smooth natural animation, character showcase, professional quality.

Spoken line (the character says exactly this, lip-synced, in their own voice): {{dialogue}}

AUDIO REQUIREMENTS (strict): the audio track must contain ONLY this character's own clean speaking voice — no background music, no soundtrack, no sound effects, no foley, no ambient or room noise, no crowd noise, no narration or voice-over, no other speakers, no reverb tail. Studio-dry clean vocal recording. If no line is given, keep the audio track silent rather than adding any music or effects.`,
    variables: [
      variable('characterName'),
      variable('action'),
      variable('stylePrefix'),
      variable('dialogue', {
        description: '角色说出口的台词；留空时模型应保持静音而不是补音乐/音效。',
        required: false,
      }),
    ],
    isCustom: false,
  },

  itv_prop_motion: {
    id: 'itv_prop_motion',
    category: 'itv',
    name: '道具动态视频',
    description: '生成道具动态展示视频',
    template: '{{stylePrefix}}, {{description}}, {{motion}}, professional product animation, smooth camera movement, high quality video',
    variables: [variable('stylePrefix'), variable('description'), variable('motion')],
    isCustom: false,
  },
};
