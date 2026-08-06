/**
 * 演员库服务
 *
 * 全局（跨项目）演员档案库，存放在用户存储根目录下：
 *   {rootPath}/library/actors/actors.json      — 档案索引
 *   {rootPath}/library/actors/{actorId}/       — 定妆照等资源文件
 *
 * 两条主通路：
 *  - saveActorFromCharacter：把项目内角色（含定妆照、音色）入库
 *  - createCharacterFromActor：从库中选演员，复制为项目内角色
 */
import { v4 as uuidv4 } from 'uuid';
import type { Character } from '../types';
import type { ActorProfile } from '../types/actor-library';
import { createLogger } from '../store/logger';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';
import {
  fsCopy,
  fsExists,
  fsMkdir,
  fsReadFile,
  fsRemove,
  fsWriteFile,
} from './electronService';
import { getCharacterCostumePhotoSource } from '../utils/mediaSelectors';

const logger = createLogger('ActorLibrary');

const ACTORS_INDEX_FILE = 'actors.json';

async function getActorsRoot(): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  const root = `${config.rootPath}/library/actors`;
  if (!(await fsExists(root))) {
    await fsMkdir(root);
  }
  return root;
}

async function getIndexPath(): Promise<string> {
  return `${await getActorsRoot()}/${ACTORS_INDEX_FILE}`;
}

export async function loadActorLibrary(): Promise<ActorProfile[]> {
  try {
    const indexPath = await getIndexPath();
    if (!(await fsExists(indexPath))) return [];
    const raw = await fsReadFile(indexPath);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a): a is ActorProfile => Boolean(a && a.id && a.name));
  } catch (err) {
    logger.warn('读取演员库失败，返回空库', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function persistActorLibrary(actors: ActorProfile[]): Promise<void> {
  const indexPath = await getIndexPath();
  await fsWriteFile(indexPath, JSON.stringify(actors, null, 2));
}

/** 把项目内角色存为演员（同名同设定则覆盖更新） */
export async function saveActorFromCharacter(
  character: Character,
): Promise<ActorProfile> {
  const actors = await loadActorLibrary();
  const now = Date.now();

  // 复制定妆照进库（有本地文件才复制；纯远端引用直接记 URL）
  let costumePhotoPath: string | undefined;
  let costumePhotoRemoteUrl: string | undefined = character.media?.costumePhoto?.remoteUrl;
  const localSource = character.media?.costumePhoto?.localPath;
  if (localSource && (await fsExists(localSource))) {
    const actorDir = `${await getActorsRoot()}/${character.id}`;
    if (!(await fsExists(actorDir))) await fsMkdir(actorDir);
    const destPath = `${actorDir}/costume.png`;
    await fsCopy(localSource, destPath);
    costumePhotoPath = destPath;
  } else if (!costumePhotoRemoteUrl) {
    // 兼容旧数据：media 结构缺失时尝试 selector 取源
    const fallback = getCharacterCostumePhotoSource(character);
    if (fallback && /^https?:\/\//.test(fallback)) {
      costumePhotoRemoteUrl = fallback;
    }
  }

  const existing = actors.find(a => a.id === character.id || a.name === character.name);
  const profile: ActorProfile = {
    id: existing?.id ?? character.id,
    name: character.name,
    gender: character.gender,
    age: character.age,
    prompt: character.prompt || '',
    voiceId: character.voiceId,
    costumePhotoPath: costumePhotoPath ?? existing?.costumePhotoPath,
    costumePhotoRemoteUrl: costumePhotoRemoteUrl ?? existing?.costumePhotoRemoteUrl,
    note: existing?.note,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const next = existing
    ? actors.map(a => (a.id === existing.id ? profile : a))
    : [...actors, profile];
  await persistActorLibrary(next);
  logger.info(`演员已入库: ${profile.name}`);
  return profile;
}

/** 从演员档案创建项目内角色（复制定妆照到项目资产目录） */
export async function createCharacterFromActor(
  actor: ActorProfile,
  projectId: string,
): Promise<Character> {
  const characterId = uuidv4();
  const character: Character = {
    id: characterId,
    name: actor.name,
    role: 'supporting',
    age: actor.age,
    gender: actor.gender || 'unknown',
    prompt: actor.prompt,
    voiceId: actor.voiceId,
  };

  if (actor.costumePhotoPath && (await fsExists(actor.costumePhotoPath))) {
    const config = getStorageConfig() || (await initStorageConfig());
    const destDir = `${config.rootPath}/projects/${projectId}/assets/characters/${characterId}`;
    if (!(await fsExists(destDir))) await fsMkdir(destDir);
    const destPath = `${destDir}/costume.png`;
    await fsCopy(actor.costumePhotoPath, destPath);
    character.media = {
      costumePhoto: {
        kind: 'image',
        localPath: destPath,
        remoteUrl: actor.costumePhotoRemoteUrl,
        createdAt: Date.now(),
      },
    };
  } else if (actor.costumePhotoRemoteUrl) {
    character.media = {
      costumePhoto: {
        kind: 'image',
        remoteUrl: actor.costumePhotoRemoteUrl,
        createdAt: Date.now(),
      },
    };
  }

  logger.info(`从演员库创建角色: ${actor.name} -> 项目 ${projectId}`);
  return character;
}

/** 删除演员（连同库内资源文件） */
export async function deleteActor(actorId: string): Promise<void> {
  const actors = await loadActorLibrary();
  const target = actors.find(a => a.id === actorId);
  await persistActorLibrary(actors.filter(a => a.id !== actorId));
  if (target) {
    const actorDir = `${await getActorsRoot()}/${actorId}`;
    if (await fsExists(actorDir)) {
      await fsRemove(actorDir);
    }
  }
}
