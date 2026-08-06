/**
 * 全局音色库前端服务。
 *
 * 职责：
 *  - 调用主进程 IPC 读取 / 写入 custom 部分（library.json）
 *  - 把内置 Koma 46 个音色合并进运行时快照
 *  - 解析 sampleFile（builtin / custom 两种来源）→ 可播放的 URL
 *
 * 预留：未来"导入 / 导出 JSON 团队分享"在这里增 importManifest / exportManifest，UI 暂不暴露。
 */
import { nanoid } from 'nanoid';
import { electronService, isElectron } from '../electronService';
import { toFileSystemDisplayUrl } from '../fileSystemPort';
import { createLogger } from '../../store/logger';

const logger = createLogger('voiceLibrary');
import {
  buildBuiltinVoiceCategories,
  buildBuiltinVoiceProfiles,
} from './builtin';
import {
  isBuiltinVoiceCategoryId,
  isBuiltinVoiceProfileId,
  type CustomVoiceLibraryManifest,
  type VoiceCategory,
  type VoiceLibrarySnapshot,
  type VoiceProfile,
} from '../../types/voice-library';

const BUILTIN_BRIDGE_PREFIX = 'koma-builtin://';

function emptySnapshot(): VoiceLibrarySnapshot {
  return {
    categories: [...buildBuiltinVoiceCategories()],
    profiles: [...buildBuiltinVoiceProfiles()],
  };
}

function mergeCustomIntoSnapshot(
  manifest: CustomVoiceLibraryManifest | null,
): VoiceLibrarySnapshot {
  const snapshot = emptySnapshot();
  if (!manifest) return snapshot;
  for (const c of manifest.categories) {
    snapshot.categories.push({
      id: c.id,
      name: c.name,
      source: 'custom',
      order: c.order ?? 1000 + snapshot.categories.length,
    });
  }
  for (const p of manifest.profiles) {
    snapshot.profiles.push({
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      source: 'custom-sample',
      providerVoiceId: p.providerVoiceId,
      sampleFile: p.sampleFile,
      language: p.language,
      gender: p.gender,
      note: p.note,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  }
  // 分类按 order 排序，builtin 永远排在前面
  snapshot.categories.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'builtin' ? -1 : 1;
    return a.order - b.order;
  });
  return snapshot;
}

function snapshotToCustomManifest(snapshot: VoiceLibrarySnapshot): CustomVoiceLibraryManifest {
  return {
    _version: 1,
    categories: snapshot.categories
      .filter((c) => c.source === 'custom')
      .map(({ id, name, order }) => ({ id, name, order })),
    profiles: snapshot.profiles
      .filter((p) => p.source === 'custom-sample')
      .map(({ id, categoryId, name, providerVoiceId, sampleFile, language, gender, note, createdAt, updatedAt }) => ({
        id, categoryId, name, providerVoiceId, sampleFile, language, gender, note, createdAt, updatedAt,
      })),
  };
}

export async function loadVoiceLibrary(): Promise<VoiceLibrarySnapshot> {
  if (!isElectron()) return emptySnapshot();
  try {
    const manifest = (await electronService.ipc.invoke('controller/app/getVoiceLibrary', {})) as CustomVoiceLibraryManifest;
    return mergeCustomIntoSnapshot(manifest);
  } catch (err) {
    logger.warn('load failed, returning builtin only', err);
    return emptySnapshot();
  }
}

async function persistSnapshot(snapshot: VoiceLibrarySnapshot): Promise<void> {
  if (!isElectron()) return;
  await electronService.ipc.invoke('controller/app/saveVoiceLibrary', {
    manifest: snapshotToCustomManifest(snapshot),
  });
}

async function uploadSample(voiceId: string, dataBase64: string, ext: string): Promise<string | undefined> {
  if (!isElectron()) return undefined;
  const result = await electronService.ipc.invoke('controller/app/uploadVoiceSample', {
    voiceId, dataBase64, ext,
  });
  return (result as { sampleFile?: string } | null)?.sampleFile;
}

async function deleteSample(voiceId: string): Promise<void> {
  if (!isElectron()) return;
  try {
    await electronService.ipc.invoke('controller/app/deleteVoiceSample', { voiceId });
  } catch { /* ignore */ }
}

// ───── 分类增删改（仅 custom） ─────

export async function createVoiceCategory(name: string, snapshot: VoiceLibrarySnapshot): Promise<VoiceLibrarySnapshot> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('分类名不能为空');
  const next: VoiceLibrarySnapshot = {
    categories: [...snapshot.categories, {
      id: `cat-${nanoid(8)}`,
      name: trimmed,
      source: 'custom',
      order: snapshot.categories.length,
    }],
    profiles: [...snapshot.profiles],
  };
  await persistSnapshot(next);
  return next;
}

export async function renameVoiceCategory(
  categoryId: string,
  name: string,
  snapshot: VoiceLibrarySnapshot,
): Promise<VoiceLibrarySnapshot> {
  if (isBuiltinVoiceCategoryId(categoryId)) throw new Error('内置分类不可改名');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('分类名不能为空');
  const next: VoiceLibrarySnapshot = {
    categories: snapshot.categories.map((c) =>
      c.id === categoryId ? { ...c, name: trimmed } : c,
    ),
    profiles: [...snapshot.profiles],
  };
  await persistSnapshot(next);
  return next;
}

export async function deleteVoiceCategory(
  categoryId: string,
  snapshot: VoiceLibrarySnapshot,
): Promise<VoiceLibrarySnapshot> {
  if (isBuiltinVoiceCategoryId(categoryId)) throw new Error('内置分类不可删除');
  const orphanProfiles = snapshot.profiles.filter((p) => p.categoryId === categoryId);
  for (const p of orphanProfiles) {
    if (p.source === 'custom-sample') await deleteSample(p.id);
  }
  const next: VoiceLibrarySnapshot = {
    categories: snapshot.categories.filter((c) => c.id !== categoryId),
    profiles: snapshot.profiles.filter((p) => p.categoryId !== categoryId),
  };
  await persistSnapshot(next);
  return next;
}

// ───── Profile 增删改（仅 custom） ─────

export interface CreateVoiceProfileInput {
  categoryId: string;
  name: string;
  /** base64 编码的音频数据（不带 data: 前缀） */
  sampleDataBase64?: string;
  /** 不带点的扩展名，wav / mp3 / m4a / ogg / flac / webm */
  sampleExt?: string;
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
  providerVoiceId?: string;
  note?: string;
}

export async function createVoiceProfile(
  input: CreateVoiceProfileInput,
  snapshot: VoiceLibrarySnapshot,
): Promise<VoiceLibrarySnapshot> {
  const name = input.name.trim();
  if (!name) throw new Error('音色名不能为空');
  const id = `voice-${nanoid(10)}`;
  let sampleFile: string | undefined;
  if (input.sampleDataBase64 && input.sampleExt) {
    sampleFile = await uploadSample(id, input.sampleDataBase64, input.sampleExt);
  }
  const now = Date.now();
  const profile: VoiceProfile = {
    id,
    categoryId: input.categoryId,
    name,
    source: 'custom-sample',
    providerVoiceId: input.providerVoiceId,
    sampleFile,
    language: input.language,
    gender: input.gender,
    note: input.note,
    createdAt: now,
    updatedAt: now,
  };
  const next: VoiceLibrarySnapshot = {
    categories: [...snapshot.categories],
    profiles: [...snapshot.profiles, profile],
  };
  await persistSnapshot(next);
  return next;
}

export interface UpdateVoiceProfileInput {
  profileId: string;
  name?: string;
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
  providerVoiceId?: string;
  note?: string;
  /** 替换样本时填新数据；不替换就别传 */
  sampleDataBase64?: string;
  sampleExt?: string;
}

export async function updateVoiceProfile(
  input: UpdateVoiceProfileInput,
  snapshot: VoiceLibrarySnapshot,
): Promise<VoiceLibrarySnapshot> {
  if (isBuiltinVoiceProfileId(input.profileId)) throw new Error('内置音色不可修改');
  const existing = snapshot.profiles.find((p) => p.id === input.profileId);
  if (!existing) throw new Error('音色不存在');

  let sampleFile = existing.sampleFile;
  if (input.sampleDataBase64 && input.sampleExt) {
    sampleFile = await uploadSample(input.profileId, input.sampleDataBase64, input.sampleExt);
  }

  const merged: VoiceProfile = {
    ...existing,
    name: input.name?.trim() || existing.name,
    language: input.language ?? existing.language,
    gender: input.gender ?? existing.gender,
    providerVoiceId: input.providerVoiceId ?? existing.providerVoiceId,
    note: input.note ?? existing.note,
    sampleFile,
    updatedAt: Date.now(),
  };

  const next: VoiceLibrarySnapshot = {
    categories: [...snapshot.categories],
    profiles: snapshot.profiles.map((p) => (p.id === input.profileId ? merged : p)),
  };
  await persistSnapshot(next);
  return next;
}

export async function deleteVoiceProfile(
  profileId: string,
  snapshot: VoiceLibrarySnapshot,
): Promise<VoiceLibrarySnapshot> {
  if (isBuiltinVoiceProfileId(profileId)) throw new Error('内置音色不可删除');
  await deleteSample(profileId);
  const next: VoiceLibrarySnapshot = {
    categories: [...snapshot.categories],
    profiles: snapshot.profiles.filter((p) => p.id !== profileId),
  };
  await persistSnapshot(next);
  return next;
}

// ───── 样本预览 URL 解析 ─────

/**
 * 把 profile.sampleFile 解析为渲染端可以直接 src 用的 URL。
 *
 * 两种来源：
 *  - 'koma-builtin://<KomaSampleFile>' → 走 controller/app/getKomaTTSVoiceSamplePath
 *  - 'samples/<id>.<ext>'              → 走 controller/app/getVoiceSamplePath
 *
 * 浏览器（非 electron）环境返回 null。
 */
export async function resolveVoiceSampleUrl(sampleFile: string | undefined): Promise<string | null> {
  if (!sampleFile) return null;
  if (!isElectron()) return null;

  let localPath: string | null = null;
  if (sampleFile.startsWith(BUILTIN_BRIDGE_PREFIX)) {
    const rel = sampleFile.slice(BUILTIN_BRIDGE_PREFIX.length);
    const result = await electronService.ipc.invoke('controller/app/getKomaTTSVoiceSamplePath', { sampleFile: rel });
    localPath = (result as { localPath?: string | null } | null)?.localPath ?? null;
  } else {
    const result = await electronService.ipc.invoke('controller/app/getVoiceSamplePath', { sampleFile });
    localPath = (result as { localPath?: string | null } | null)?.localPath ?? null;
  }
  return localPath ? toFileSystemDisplayUrl(localPath) ?? null : null;
}

// ───── Profile 查询 ─────

export function findVoiceProfile(
  profileId: string | undefined,
  snapshot: VoiceLibrarySnapshot,
): VoiceProfile | undefined {
  if (!profileId) return undefined;
  return snapshot.profiles.find((p) => p.id === profileId);
}

export function groupProfilesByCategory(snapshot: VoiceLibrarySnapshot): Array<{ category: VoiceCategory; profiles: VoiceProfile[] }> {
  return snapshot.categories.map((category) => ({
    category,
    profiles: snapshot.profiles
      .filter((p) => p.categoryId === category.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
