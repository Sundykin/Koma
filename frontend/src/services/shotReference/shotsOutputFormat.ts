/**
 * 视频提示词模板"## 六、最终标准输出格式"中【分镜镜头内容】子段的渲染器。
 *
 * 不同 imageMode 决定输出结构：
 *   - 'normal' / 默认：硬切骨架；镜头数由剧情强度决定（允许一镜到底），只给建议区间
 *   - 'grid-9'：3×3 九宫格 9 帧时序锚点骨架（单镜头连续延展，固定机位）
 *   - 'grid-4'：2×2 四宫格 4 帧时序锚点骨架（单镜头连续延展，更细粒度的镜头控制）
 *
 * 渲染器跟模板的"## 六"上文（场景行 / 锁定段 / 上下单元衔接段）解耦——这一层
 * 只产出"分镜镜头内容"这一个子段。模板把这段抽成 `{{shotsSection}}` 占位。
 */
import type { ShotReferenceBundle } from './types';

export type ShotsOutputMode = 'normal' | 'grid-9' | 'grid-4';

function fmtSeconds(value: number): string {
  if (Math.abs(value - Math.round(value)) < 0.05) return `${Math.round(value)}`;
  return value.toFixed(2);
}

export interface ShotsSectionParams {
  mode: ShotsOutputMode;
  /** 视频总时长（秒） */
  duration: number;
}

export function renderShotsSection(params: ShotsSectionParams): string {
  if (params.mode === 'grid-9') return renderGrid9ShotsSection(params.duration);
  if (params.mode === 'grid-4') return renderGrid4ShotsSection(params.duration);
  return renderNormalShotsSection(params.duration);
}

/**
 * 决定 shots 段渲染模式。
 *
 * grid-4 / grid-9 只有在 bundle 里确实存在 grid-anchor 图片时才启用。`imageMode`
 * 只是图片生成意图，不能在无真实分镜图时让视频提示词内置 `@grid_anchor`
 * 或宫格 cell 结构；否则会让下游进入一个不存在的图片锚点协议。
 */
export function decideShotsMode(bundle: ShotReferenceBundle, explicitCellCount?: 4 | 9): ShotsOutputMode {
  if (!bundle.hasGridAnchor) {
    return 'normal';
  }
  if (explicitCellCount === 4) return 'grid-4';
  if (explicitCellCount === 9) return 'grid-9';
  return (bundle.gridCellCount ?? 9) === 4 ? 'grid-4' : 'grid-9';
}

// ──────────────────────────────────────────────────────────────────
// normal 多镜头骨架（沿用历史模板正文）
// ──────────────────────────────────────────────────────────────────

/**
 * 单元内部镜头数：给区间与建议值，**不给死数**。
 *
 * 切几刀是剧情决定的，不是拿时长套公式：
 *  - 追逐、搏斗、长对话的压迫感、悬念铺陈 —— 一镜到底反而更好，切一刀就泄气
 *  - 多方反应、快节奏对抗 —— 需要密集切换
 * 所以这里只推算一个「起点建议」，最终由模型按内容判断，允许一镜到底（1 镜）。
 */
const SECONDS_PER_INNER_SHOT = 4;
const MAX_INNER_SHOTS = 6;

export interface InnerShotPlan {
  /** 按时长推的经验建议值，仅作起点 */
  suggested: number;
  /** 下限恒为 1：一镜到底永远是合法选择 */
  min: number;
  max: number;
}

export function planInnerShots(duration: number): InnerShotPlan {
  const seconds = Number.isFinite(duration) && duration > 0 ? duration : SECONDS_PER_INNER_SHOT;
  const suggested = Math.max(1, Math.min(MAX_INNER_SHOTS, Math.round(seconds / SECONDS_PER_INNER_SHOT)));
  // 上限比建议值多留一档，给密集切换的动作戏空间
  const max = Math.max(suggested, Math.min(MAX_INNER_SHOTS, suggested + 1));
  return { suggested, min: 1, max };
}

/** 镜头数怎么定：按叙事强度选，而不是按时长均分 */
const SHOT_COUNT_DOCTRINE = [
  '**镜头数由剧情决定，不要按时长均分**。先判断这段戏要什么，再定切几刀：',
  '- **一镜到底（1 镜）**：追逐 / 搏斗 / 长镜压迫感 / 悬念铺陈 / 沉浸式跟拍 —— ',
  '  需要不被打断的连续时间感时，切一刀就泄气。此时节奏靠**运镜与调度**承载：',
  '  跟随移动、重新构图、景深变化、人物走位进出画，绝不是锁死机位干拍。',
  '- **少切（2-3 镜）**：一次情绪递进、一次反应、一次关键动作的强调。',
  '- **多切（4 镜以上）**：多方反应、快节奏对抗、信息密集的交替呈现。',
  '',
  '判断依据写在提示词里（例如"本单元为连续追逐，采用一镜到底跟拍"），',
  '不要为了凑数切镜，也不要为了省事全用长镜。',
].join('\n');

/** 镜头语言：有切镜就要有变化；一镜到底则靠运镜与调度制造节奏 */
const CAMERA_LANGUAGE_RULES = [
  '**每次运镜都要有动机**，并把动机写进提示词：跟随人物移动、跟随视线转移、',
  '  揭示画外信息、强调道具状态、制造压迫或释放。',
  '  **禁止把"缓缓推近"当万能句用** —— 无动机的匀速推拉正是画面平淡的根源。',
  '**多镜头时**：相邻镜头的「景别」与「机位/运镜」不得同时相同。典型节奏：',
  '  定场（全景 / 中景）→ 递进（近景 / 特写）→ 强调（特写 / 细节）→ 收束（拉开或过肩）。',
  '**一镜到底时**：必须有可读的内部节奏 —— 景别通过推拉或人物走位自然变化，',
  '  至少一次重新构图或焦点转移；禁止全程锁死机位、主体一动不动地干拍。',
  '**单元内至少一次注意力引导**：移焦（虚→实）、切特写、随视线摇镜、',
  '  前景遮挡揭开、景别跳变，四选一以上。',
  '运镜幅度仍受物理约束：镜头运动平稳可执行，不写"疯狂旋转""高速穿梭"。',
].join('\n');

/** 入画规则：人物与道具不能凭空出现 */
const ENTRANCE_RULES = [
  '**人物 / 道具首次进入画面必须有过程**，禁止凭空出现在画面里。三选一：',
  '  ① **入画**：从画框边缘（左/右/前景/景深处）走进、探入、递入，写明从哪个方向进入；',
  '  ② **镜头揭示**：人物/道具本来就在场，由运镜带出来（摇过去、移过去、拉开露出、越过前景遮挡、移焦由虚转实）；',
  '  ③ **硬切后已在画内**：切镜瞬间就在新构图中，**且上一镜已交代过它的存在与位置**。',
  '     上一镜没交代过的元素不允许用这种方式出现；一镜到底时本条不适用。',
  '**离场同理**：人物退出画面要走出画框或被镜头舍弃，不要下一帧直接消失。',
  '**首次出现的道具**要交代它从哪来（被谁拿出、从何处取、原本放在哪），不要直接出现在手里。',
  '**手部交接**（递、接、放下、抽出）要写起止位置与接触点。',
].join('\n');

function renderNormalShotsSection(duration: number): string {
  const { suggested, min, max } = planInnerShots(duration);
  const lines: string[] = [];

  lines.push('【分镜镜头内容 · 硬切结构】');
  lines.push('');
  lines.push('【镜头数怎么定】');
  lines.push(SHOT_COUNT_DOCTRINE);
  lines.push('');
  lines.push(`本单元 ${duration} 秒。按时长推算的**起点建议**是 ${suggested} 个镜头，可选范围 ${min}–${max}；`);
  lines.push('这只是起点，最终镜头数以上面的叙事判断为准。');
  lines.push('');
  lines.push('【硬性规则】');
  lines.push(`1. 镜头编号从「镜头 1」开始连续，每个独立成段；总时长精确 ${duration} 秒（±0.2 秒）。`);
  lines.push('2. 单镜时长按叙事重心分配，不必均分；但每镜至少 1.5 秒，避免闪回式碎切。');
  lines.push('3. 镜头之间是原生硬切：`no dissolves, no cross-fades, use hard cuts only`。');
  lines.push('4. 同一人物外观 / 服装 / 持物 / 比例跨镜头完全一致，仅允许动作、视线、景别、机位变化。');
  lines.push('5. 单句台词必须在单镜头内说完（按 3.2 字/秒），不得跨镜头拆分。');
  lines.push('');
  lines.push('【镜头语言】');
  lines.push(CAMERA_LANGUAGE_RULES);
  lines.push('');
  lines.push('【出入画】');
  lines.push(ENTRANCE_RULES);
  lines.push('');
  lines.push('【输出骨架】按你判断的镜头数重复下面这段结构，编号从 1 连续递增：');
  lines.push('');
  lines.push('镜头 N（__秒__）：');
  lines.push('- 景别 + 机位 + 运镜：__写明景别、机位高度与角度、运镜方式**及其动机**；多镜头时与上一镜在景别或机位上必须有变化__');
  lines.push('- 画面（仅客观可见，禁止心理 / 旁白 / 解说）：__空间锚点 + 人物姿态与大致位置 + 视线落点 + 持物 + 主动作 + 微动作 + 表情 / 可见情绪外化；所有元素带 `@Image N` 映射__');
  lines.push('- 出入画：__本镜有人物或道具首次出现时，写明入画方向 / 由哪次运镜揭示 / 硬切后已在画内（须上一镜交代过）；无则"无新增元素"__');
  lines.push('- 台词（仅当原文明示本镜有人开口）：`角色 @Image X 对 角色 @Image Y 台词：『完整原文』`；否则"无"');
  lines.push('- OS/OV（仅当原文明示心理独白 / 画外音）：`【对应角色】OS：『完整原文』；播报全程嘴巴闭合`；否则"无"');
  lines.push('- 切换：__非末镜写 `硬切到镜头 N+1：no dissolves, no cross-fades, use hard cuts only`；末镜写收束态__');
  lines.push('');
  lines.push('附加要求：');
  lines.push('- **首镜**开场画面 100% 继承上方【上单元结尾锚定帧】（仅断言继承，不要重复描述上单元末态）。');
  lines.push('- **末镜**收束态即上方【本单元结尾锚定帧】（仅断言一致，不要重复描述末态）。');
  lines.push('- **一镜到底时**，镜头 1 同时承担首镜与末镜职责，并在「景别 + 机位 + 运镜」里写明为什么用长镜。');
  lines.push('');
  lines.push(`【结构自检】镜头编号连续无缺；各镜时长之和 = ${duration} 秒；镜头数与叙事强度匹配（不是按时长凑的）；多镜头时相邻镜头景别与机位不同时相同；一镜到底时有可读的内部节奏；新出现的人物 / 道具都交代了出入画方式。最终答案不要输出检查清单或规则复述。`);
  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────
// grid-9：3×3 九宫格 9 帧时序锚点骨架
// ──────────────────────────────────────────────────────────────────

interface CellSpec {
  cell: number;
  label: string;
  /** 0-1 范围内的相对时间位置，乘以 duration 得到秒数 */
  ratio: number;
  role: string;
}

const GRID9_CELLS: CellSpec[] = [
  { cell: 1, label: '左上', ratio: 0, role: '起手 / 定场' },
  { cell: 2, label: '中上', ratio: 0, role: '第 1 拍递进' },
  { cell: 3, label: '右上', ratio: 0, role: '约 1/3 节奏切换' },
  { cell: 4, label: '左中', ratio: 0, role: '第 2 拍递进' },
  { cell: 5, label: '正中', ratio: 0, role: '中段关键节奏' },
  { cell: 6, label: '右中', ratio: 0, role: '约 2/3 节奏切换' },
  { cell: 7, label: '左下', ratio: 0, role: '第 3 拍递进' },
  { cell: 8, label: '中下', ratio: 0, role: '收势前' },
  { cell: 9, label: '右下', ratio: 0, role: '收束 / 末态' },
];

const GRID4_CELLS: CellSpec[] = [
  { cell: 1, label: '左上', ratio: 0, role: '起手 / 定场' },
  { cell: 2, label: '右上', ratio: 0, role: '前段节奏切换' },
  { cell: 3, label: '左下', ratio: 0, role: '后段节奏切换' },
  { cell: 4, label: '右下', ratio: 0, role: '收束 / 末态' },
];

/**
 * grid 模式 = N 镜头硬切结构。每镜头对应网格中的一个单元格（按位置：左→右、上→下）。
 * 不再走"单镜头连续延展"——用户的心智模型是：grid cell 数 = 镜头数，且镜头之间是硬切。
 */
function renderGridShotsSection(cells: CellSpec[], duration: number, label: string): string {
  const N = cells.length;
  const shotDuration = duration / N;
  const shotDurationStr = fmtSeconds(shotDuration);
  const lines: string[] = [];

  lines.push(`【分镜镜头内容·${N} 镜头硬切结构】`);
  lines.push('');
  lines.push(`【硬性规则】`);
  lines.push(`1. **必须输出 ${N} 个镜头**：编号从"镜头 1"到"镜头 ${N}"，**每一个都必须独立成段填写完整内容**。**禁止合并、禁止省略、禁止只写其中几个**。少 1 个或多 1 个都判废。`);
  lines.push(`2. 每镜头依次对应 references 中 ${label} 的一个单元格（按位置：左→右、上→下；cell 1 = 首镜，cell ${N} = 末镜）。`);
  lines.push(`3. 每镜头时长 ≈ **${shotDurationStr} 秒**；${N} 镜头总和精确 ${duration} 秒（±0.2 秒）。`);
  lines.push(`4. 镜头之间是原生硬切：\`原生画面硬切；no dissolves, no cross-fades, use hard cuts only\`。`);
  lines.push(`5. 同一人物外观 / 服装 / 持物 / 比例 / 空间位置跨镜头**完全一致**，仅允许动作 / 视线 / 景别 / 机位变化（用自然位置描述即可，不必硬编序号）。`);
  lines.push(`6. 单句台词必须在单镜头内说完（按 3.2 字/秒），不得跨镜头拆分。`);
  lines.push('');
  lines.push(`【输出骨架】（每个 \`镜头 N：\` 都必须独立成段，按下方模板填写）`);
  lines.push('');

  for (const spec of cells) {
    const isFirst = spec.cell === 1;
    const isLast = spec.cell === N;
    const headerLine = `镜头 ${spec.cell}（${shotDurationStr} 秒，对应 ${label} ${spec.label} = cell ${spec.cell}，${spec.role}）：`;
    lines.push(headerLine);
    lines.push(`- 景别 + 机位：__（按节奏选；机位优先 30°-60° 侧拍 / 过肩 OTS / 侧后跟拍）__`);
    lines.push(`- 画面（仅写客观可见画面，禁止写心理 / 旁白 / 解说）：__基于 cell ${spec.cell} 的视觉锚点；人物姿态 + 大致空间位置（自然描述，例如"靠窗床边"，不强制硬编号）+ 上下层级（如有）+ 视线方向 + 持物 + 主动作 + 微动作 + 表情变化 / 可见情绪外化（眉眼、嘴角、肩颈、呼吸、手指、重心）；所有元素带 \`@Image N\` 映射__`);
    if (isFirst) {
      lines.push(`- 与上方【上单元结尾锚定帧】的衔接：开场画面 100% 继承（仅断言继承，不要在此重复描述上单元末态内容）`);
    }
    lines.push(`- 台词（仅当原文明示该镜头有人物开口说话时填）：\`角色 @Image X 对 角色 @Image Y 台词：『完整原文』\`；否则写"无"`);
    lines.push(`- OS/OV（仅当原文明示心理独白 / 画外音时填）：\`【对应角色】OS：『完整原文』；播报全程对应人物嘴巴闭合\`；否则写"无"`);
    if (isLast) {
      lines.push(`- 与上方【本单元结尾锚定帧】的衔接：本镜头收束态即【本单元结尾锚定帧】（仅断言一致，不要在此重复描述末态内容）`);
    } else {
      lines.push(`- 硬切到镜头 ${spec.cell + 1}：\`no dissolves, no cross-fades, use hard cuts only\``);
    }
    lines.push('');
  }

  lines.push(`【结构约束】镜头编号必须从 1 到 ${N} 全齐；每镜头时长之和 = ${duration} 秒；人物镜头必须含主动作 + 微动作 + 表情 / 可见情绪外化；最终答案不要输出检查清单或规则复述。`);
  return lines.join('\n');
}

function renderGrid9ShotsSection(duration: number): string {
  return renderGridShotsSection(GRID9_CELLS, duration, '3×3 九宫格');
}

function renderGrid4ShotsSection(duration: number): string {
  return renderGridShotsSection(GRID4_CELLS, duration, '2×2 四宫格');
}
