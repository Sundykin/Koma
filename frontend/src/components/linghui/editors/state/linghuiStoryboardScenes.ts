import type { LinghuiStoryboardScene } from '../../../../types/linghui';

export interface LinghuiStoryboardSceneDef {
  scene: LinghuiStoryboardScene;
  label: string;
  shortLabel: string;
  targetShotCount: number;
  description: string;
  promptPrefix: string;
}

const STORYBOARD_SCRIPT_BASE_PROMPT = [
  '按 LibTV 剧情推演 / 分镜脚本生成逻辑，把用户剧情和上游参考拆成可继续制作的镜头序列。',
  '只生成分镜脚本，不生成宫格图片，不输出说明文字。',
  '每个镜头都要清楚表达主体、动作、景别、机位、光线和情绪变化。',
].join('\n');

export const LINGHUI_STORYBOARD_SCENES: LinghuiStoryboardSceneDef[] = [
  {
    scene: 'plot_deduction_four_grid',
    label: '剧情推演四镜头',
    shortLabel: '四镜头',
    targetShotCount: 4,
    description: '快速拆出起因、推进、转折、余韵。',
    promptPrefix: [
      STORYBOARD_SCRIPT_BASE_PROMPT,
      '输出 4 个清晰剧情节拍：建立场景 / 关键行动 / 冲突或转折 / 留白收束。',
    ].join('\n'),
  },
  {
    scene: 'plot_deduction_nine_grid',
    label: '剧情推演九镜头',
    shortLabel: '九镜头',
    targetShotCount: 9,
    description: '对齐 LibTV 剧情推演九宫格，输出九段连续镜头。',
    promptPrefix: [
      STORYBOARD_SCRIPT_BASE_PROMPT,
      '输出 9 个连续剧情节点：起因、铺垫、行动、阻碍、反应、升级、转折、高潮、余韵。',
      '镜头之间必须有动作和情绪递进，避免重复同一构图。',
    ].join('\n'),
  },
  {
    scene: 'coherent_storyboard_16',
    label: '16镜头连贯分镜',
    shortLabel: '16镜头',
    targetShotCount: 16,
    description: '更细密的 4×4 连贯剧情分镜脚本。',
    promptPrefix: [
      STORYBOARD_SCRIPT_BASE_PROMPT,
      '输出 16 个清楚镜头节拍：建立场景、人物行动、冲突升级、关键反应、高潮与结尾悬念逐步推进。',
      '每个镜头都要有新的信息量，镜头尺度、机位或表演状态必须变化。',
    ].join('\n'),
  },
  {
    scene: 'coherent_storyboard_25',
    label: '25镜头长段落',
    shortLabel: '25镜头',
    targetShotCount: 25,
    description: '长段落剧情推演，适合复杂场景和连续动作。',
    promptPrefix: [
      STORYBOARD_SCRIPT_BASE_PROMPT,
      '输出 25 个长段落分镜：环境建立、人物目标、行动推进、障碍、反转、高潮和收束必须完整。',
      '保持人物/场景/光影连续，同时让机位、景别、动作和节奏有明显变化。',
    ].join('\n'),
  },
];

export const DEFAULT_LINGHUI_STORYBOARD_SCENE: LinghuiStoryboardScene = 'plot_deduction_nine_grid';

export function resolveLinghuiStoryboardScene(scene?: unknown): LinghuiStoryboardSceneDef {
  return LINGHUI_STORYBOARD_SCENES.find(item => item.scene === scene) ?? LINGHUI_STORYBOARD_SCENES[1];
}
