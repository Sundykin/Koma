/**
 * 生产状态报告：汇总分镜生产进度与质量缺口，供导出/交接。
 */
import type { Shot, Character } from '../types';
import { extractShotPhotography, getPrimaryShotSize } from './photographyElements';
import { isShotSpeechOverDuration, isShotPromptStale, isShotVoiceStale, estimateShotSpeechDuration } from './shotFreshness';
import { findDialogueCharactersMissingVoice } from './shotReference/readiness';

export interface ProductionReportItem {
  index: number;
  shotId: string;
  scriptLines: number;
  primaryShotSize?: string;
  hasImagePrompt: boolean;
  hasVideoPrompt: boolean;
  imageCount: number;
  videoCount: number;
  audioCount: number;
  speechOver: boolean;
  promptStale: boolean;
  voiceStale: boolean;
}

export interface ProductionReport {
  shotCount: number;
  videoReady: number;
  audioReady: number;
  missingPhotography: number;
  overDuration: number;
  missingVoiceNames: string[];
  promptStale: number;
  voiceStale: number;
  allReady: boolean;
  items: ProductionReportItem[];
}

/** 汇总生产状态（各镜状态 + 质量缺口） */
export function buildProductionReport(
  shots: Shot[],
  characters: Character[],
): ProductionReport {
  const missingVoice = findDialogueCharactersMissingVoice(shots, characters);
  let missingPhotography = 0;
  let overDuration = 0;
  let promptStale = 0;
  let voiceStale = 0;
  let videoReady = 0;
  let audioReady = 0;
  const items: ProductionReportItem[] = shots.map((shot, index) => {
    const photo = extractShotPhotography(shot);
    const noPhoto = photo.shotSizes.length === 0 && photo.cameraAngles.length === 0;
    if (noPhoto) missingPhotography += 1;
    const speechOver = isShotSpeechOverDuration(shot);
    if (speechOver) overDuration += 1;
    const pStale = isShotPromptStale(shot);
    if (pStale) promptStale += 1;
    const vStale = isShotVoiceStale(shot);
    if (vStale) voiceStale += 1;
    const vCount = shot.media?.videos?.length || 0;
    const aCount = shot.media?.audios?.length || 0;
    if (vCount > 0) videoReady += 1;
    if (aCount > 0) audioReady += 1;
    return {
      index: index + 1,
      shotId: shot.id,
      scriptLines: shot.scriptLines?.length || 0,
      primaryShotSize: getPrimaryShotSize(shot),
      hasImagePrompt: Boolean(shot.imagePrompt?.trim()),
      hasVideoPrompt: Boolean(shot.videoPrompt?.trim()),
      imageCount: shot.media?.images?.length || 0,
      videoCount: vCount,
      audioCount: aCount,
      speechOver,
      promptStale: pStale,
      voiceStale: vStale,
    };
  });

  return {
    shotCount: shots.length,
    videoReady,
    audioReady,
    missingPhotography,
    overDuration,
    missingVoiceNames: missingVoice.map(v => v.name),
    promptStale,
    voiceStale,
    allReady: missingPhotography === 0 && overDuration === 0 && missingVoice.length === 0
      && promptStale === 0 && videoReady === shots.length,
    items,
  };
}

/** 生成人读的报告文本 */
export function formatProductionReport(report: ProductionReport, title = '分镜生产报告'): string {
  const lines: string[] = [
    `【${title}】`,
    `镜数：${report.shotCount} | 已渲染视频：${report.videoReady}/${report.shotCount} | 已配音：${report.audioReady}/${report.shotCount}`,
    report.allReady ? '状态：生产就绪 ✓' : '状态：有缺口待处理',
    '',
    '质量缺口：',
    `- 缺摄影语言：${report.missingPhotography} 镜`,
    `- 台词超时长：${report.overDuration} 镜`,
    `- 缺音色角色：${report.missingVoiceNames.join('、') || '无'}`,
    `- 提示词待更新：${report.promptStale} 镜`,
    `- 配音待更新：${report.voiceStale} 镜`,
    '',
    '逐镜状态：',
    ...report.items.map(item => {
      const flags = [
        item.scriptLines > 0 ? '脚本✓' : '脚本✗',
        item.hasImagePrompt && item.hasVideoPrompt ? '提示词✓' : '提示词✗',
        item.imageCount > 0 ? '图✓' : '图✗',
        item.videoCount > 0 ? '视频✓' : '视频✗',
        item.audioCount > 0 ? '配音✓' : '配音✗',
        item.speechOver ? '超时长' : '',
        item.promptStale ? '待更新' : '',
      ].filter(Boolean).join(' ');
      const size = item.primaryShotSize ? ` · ${item.primaryShotSize}` : '';
      return `#${item.index}${size} ${flags}`;
    }),
  ];
  return lines.join('\n');
}
