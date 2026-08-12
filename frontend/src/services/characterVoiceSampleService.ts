/**
 * 角色音频提取 —— 从角色预览视频里抽出角色人声，作为音色样本入库并绑定。
 *
 * 前提：预览视频的提示词模板（itv_character_motion）已强制"音轨只保留角色本人干声，
 * 无背景音乐 / 音效 / 环境音 / 旁白"。这里只负责把那条音轨取出来转成 wav——
 * 不做降噪也不做分离，样本质量由生成侧的约束保证。
 */
import type { Character, StoredMediaAsset } from '../types';
import { getMediaAssetSource } from '../types';
import { electronService, fsExists, fsMkdir, fsReadFileAsBase64 } from './electronService';
import { ffmpegManager } from './ffmpegManager';
import {
  createVoiceCategory,
  createVoiceProfile,
  loadVoiceLibrary,
} from './voiceLibrary/voiceLibraryService';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';
import { createLogger } from '../store/logger';

const logger = createLogger('CharacterVoiceSample');

const SAMPLE_CATEGORY_NAME = '自定义音色';

/** 预览视频落地目录：与角色其它资产同级 */
async function getCharacterAssetDir(projectId: string, characterId: string): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  const dir = `${config.rootPath}/projects/${projectId}/assets/characters/${characterId}`;
  if (!(await fsExists(dir))) await fsMkdir(dir);
  return dir;
}

/**
 * 把预览视频取到本地：本地已有就直接用，只有远程 URL 时先下载。
 * ffmpeg 只能读本地文件，所以这一步不能省。
 */
async function ensureLocalVideo(
  projectId: string,
  characterId: string,
  asset: StoredMediaAsset,
): Promise<string> {
  const localSource = getMediaAssetSource(asset);
  if (localSource && !/^https?:\/\//i.test(localSource)) {
    return localSource;
  }
  const remoteUrl = asset.remoteUrl;
  if (!remoteUrl) {
    throw new Error('预览视频没有可用的文件地址');
  }
  const dir = await getCharacterAssetDir(projectId, characterId);
  const targetPath = `${dir}/preview-${Date.now()}.mp4`;
  const result = await electronService.fs.downloadFile(remoteUrl, targetPath);
  if (result && result.success === false) {
    throw new Error('预览视频下载失败，无法提取音频');
  }
  return targetPath;
}

export interface ExtractVoiceSampleResult {
  /** 提取出的 wav 路径 */
  samplePath: string;
  /** 新建的音色 ID（已绑定到角色由调用方落库） */
  voiceProfileId: string;
  voiceName: string;
}

/**
 * 从角色预览视频提取人声 → 建自定义音色 → 返回音色 ID。
 *
 * 不直接写角色数据：AssetDock 那边是"整表读-改-存"，由调用方统一落 voiceId，
 * 避免两条写路径打架。
 */
export async function extractCharacterVoiceSample(params: {
  projectId: string;
  character: Character;
  /** 音色名，默认「{角色名}的音色」 */
  voiceName?: string;
  /** 截取区间（秒）；不传则整段音轨 */
  startSeconds?: number;
  durationSeconds?: number;
}): Promise<ExtractVoiceSampleResult> {
  const { projectId, character } = params;
  const previewVideo = character.media?.previewVideo;
  if (!previewVideo) {
    throw new Error('请先生成角色预览视频');
  }

  const videoPath = await ensureLocalVideo(projectId, character.id, previewVideo);
  const dir = await getCharacterAssetDir(projectId, character.id);
  const samplePath = `${dir}/voice-sample-${Date.now()}.wav`;

  logger.info(`提取角色音频: ${character.name}`, { videoPath, samplePath });
  await ffmpegManager.extractAudioTrack({
    input: videoPath,
    output: samplePath,
    sampleRate: 44100,
    channels: 1,
    startSeconds: params.startSeconds,
    durationSeconds: params.durationSeconds,
  });

  if (!(await fsExists(samplePath))) {
    throw new Error('音频提取失败：预览视频可能没有音轨');
  }

  const voiceName = (params.voiceName || `${character.name}的音色`).trim();
  let snapshot = await loadVoiceLibrary();
  let category = snapshot.categories.find(c => c.source === 'custom');
  if (!category) {
    snapshot = await createVoiceCategory(SAMPLE_CATEGORY_NAME, snapshot);
    category = snapshot.categories.find(c => c.source === 'custom')
      ?? snapshot.categories[snapshot.categories.length - 1];
  }

  const gender = character.gender === 'male' || character.gender === 'female' || character.gender === 'neutral'
    ? character.gender
    : undefined;
  const next = await createVoiceProfile({
    categoryId: category.id,
    name: voiceName,
    gender,
    sampleDataBase64: await fsReadFileAsBase64(samplePath),
    sampleExt: 'wav',
  }, snapshot);

  const created = next.profiles[next.profiles.length - 1];
  if (!created) {
    throw new Error('音色创建失败');
  }
  logger.info(`角色音频已入库: ${character.name} → ${created.id}`);
  return { samplePath, voiceProfileId: created.id, voiceName };
}
