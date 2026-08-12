/**
 * 视频提示词模板"## 六、最终标准输出格式"中【分镜镜头内容】子段的渲染器。
 *
 * 不同 imageMode 决定输出结构：
 *   - 'normal' / 默认：按时长推算镜头数的硬切骨架（~4 秒一镜，2-5 镜）
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
 * 单元内部镜头数按时长推算。
 *
 * 分镜拆解现在按渠道上限出长镜头（常见 15 秒），一个 15 秒的单元如果只切 2 刀，
 * 每镜 7-8 秒——那么长的时间里模型只能做"缓慢推近"，成片就是平淡古板的样子。
 * 按 ~4 秒一个内部镜头推算，既有节奏又不至于碎到每镜讲不完一个动作。
 */
const SECONDS_PER_INNER_SHOT = 4;
const MIN_INNER_SHOTS = 2;
const MAX_INNER_SHOTS = 5;

export function planInnerShotCount(duration: number): number {
  const seconds = Number.isFinite(duration) && duration > 0 ? duration : SECONDS_PER_INNER_SHOT * MIN_INNER_SHOTS;
  const count = Math.round(seconds / SECONDS_PER_INNER_SHOT);
  return Math.max(MIN_INNER_SHOTS, Math.min(MAX_INNER_SHOTS, count));
}

/** 镜头语言：相邻内部镜头必须换景别或换机位，避免整段一个调子 */
const CAMERA_LANGUAGE_RULES = [
  '**镜头语言必须有变化**：相邻两个镜头的「景别」与「机位/运镜」不得同时相同。',
  '  典型节奏：定场（全景/中景）→ 递进（近景/特写，推或移）→ 强调（特写/细节，固定或微推）→ 收束（拉开或过肩）。',
  '**每次运镜都要有动机**：跟随人物移动、跟随视线转移、揭示画外信息、强调道具状态。',
  '  禁止无动机的匀速推拉（"缓缓推近"当万能句用就是画面平淡的根源）。',
  '**至少一次焦点转移或景别跳变**：单元内必须出现一次明确的注意力引导',
  '  （移焦、切特写、随视线摇镜、前景遮挡揭开）。',
  '**禁止整段固定机位平铺直叙**：全程 static + 同一景别判废，除非文案明示"凝固/静止/定格"。',
].join('\n');

/** 入画规则：人物与道具不能凭空出现 */
const ENTRANCE_RULES = [
  '**人物 / 道具首次进入画面必须有过程**，禁止凭空出现在画面里。三选一：',
  '  ① **入画**：从画框边缘（左/右/前景/景深处）走进、探入、递入，写明从哪个方向进入；',
  '  ② **镜头揭示**：人物/道具本来就在场，由运镜带出来（摇过去、移过去、拉开露出、越过前景遮挡）；',
  '  ③ **硬切后已在画内**：切镜瞬间就在新构图中，且上一镜已交代过它的存在与位置。',
  '**离场同理**：人物退出画面要走出画框或被镜头舍弃，不要下一帧直接消失。',
  '**首次出现的道具**要交代它从哪来（被谁拿出、从何处取、原本放在哪），',
  '  不要让它直接出现在手里。',
].join('\n');

function renderNormalShotsSection(duration: number): string {
  const count = planInnerShotCount(duration);
  const per = duration / count;
  const perStr = fmtSeconds(per);
  const lines: string[] = [];

  lines.push(`【分镜镜头内容 · ${count} 镜头硬切结构】`);
  lines.push('');
  lines.push('【硬性规则】');
  lines.push(`1. **必须输出 ${count} 个镜头**，编号「镜头 1」到「镜头 ${count}」，每个独立成段填完整内容。`);
  lines.push(`2. 每镜头约 **${perStr} 秒**，总和精确 ${duration} 秒（±0.2 秒）。允许按叙事重心在 ±40% 内调整单镜时长，但总和必须守住。`);
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
  lines.push('【输出骨架】（每个 `镜头 N：` 独立成段）');
  lines.push('');

  for (let i = 1; i <= count; i++) {
    const isFirst = i === 1;
    const isLast = i === count;
    lines.push(`镜头 ${i}（${perStr} 秒）：`);
    lines.push('- 景别 + 机位 + 运镜：__写明景别、机位高度与角度、运镜方式**及其动机**；与上一镜必须在景别或机位上有变化__');
    lines.push('- 画面（仅客观可见，禁止心理 / 旁白 / 解说）：__空间锚点 + 人物姿态与大致位置 + 视线落点 + 持物 + 主动作 + 微动作 + 表情 / 可见情绪外化；所有元素带 `@Image N` 映射__');
    lines.push('- 出入画：__本镜有人物或道具首次出现时，写明是从哪个方向入画、还是由运镜揭示、还是硬切后已在画内；都没有则写"无新增元素"__');
    if (isFirst) {
      lines.push('- 与上方【上单元结尾锚定帧】的衔接：开场画面 100% 继承（仅断言继承，不要重复描述上单元末态）');
    }
    lines.push('- 台词（仅当原文明示本镜有人开口）：`角色 @Image X 对 角色 @Image Y 台词：『完整原文』`；否则"无"');
    lines.push('- OS/OV（仅当原文明示心理独白 / 画外音）：`【对应角色】OS：『完整原文』；播报全程嘴巴闭合`；否则"无"');
    if (isLast) {
      lines.push('- 与上方【本单元结尾锚定帧】的衔接：本镜收束态即该锚定帧（仅断言一致，不要重复描述末态）');
    } else {
      lines.push(`- 硬切到镜头 ${i + 1}：\`no dissolves, no cross-fades, use hard cuts only\``);
    }
    lines.push('');
  }

  lines.push(`【结构自检】镜头编号 1..${count} 全齐；时长之和 = ${duration} 秒；相邻镜头景别与机位不同时相同；新出现的人物 / 道具都交代了出入画方式。最终答案不要输出检查清单或规则复述。`);
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
