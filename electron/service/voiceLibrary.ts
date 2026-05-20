/**
 * 全局音色库存储（main 进程）。
 *
 * 数据布局：
 *   ~/.koma/voiceLibrary/library.json      —— 自定义分类 + 自定义 profile 清单
 *   ~/.koma/voiceLibrary/samples/<id>.<ext> —— 用户上传的音色样本
 *
 * 内置 Koma 46 个音色不写库，启动时由前端 voiceLibraryService 合并到只读分类
 * `builtin-koma-*` 下；这里只负责"用户自建"的部分。
 *
 * 元数据是几 KB 量级，整体原子重写即可，不引入 SQLite 表。
 *
 * 预留：library.json 顶层 `_version` + `_reserved` 字段为后续"导入/导出 / 团队分享"留口子，
 * 当前 UI 不暴露 import/export。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from 'ee-core/log';
import {
  getVoiceLibraryDir,
  getVoiceLibraryManifestPath,
  getVoiceLibrarySamplesDir,
} from './paths';

/** 与前端 `frontend/src/types/voice-library.ts` 保持镜像 */
export interface VoiceLibraryCategoryDTO {
  id: string;
  name: string;
  order: number;
}

export interface VoiceLibraryProfileDTO {
  id: string;
  categoryId: string;
  name: string;
  providerVoiceId?: string;
  sampleFile?: string; // 形如 'samples/<id>.wav'，相对 voiceLibrary 根
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface VoiceLibraryManifest {
  _version: 1;
  categories: VoiceLibraryCategoryDTO[];
  profiles: VoiceLibraryProfileDTO[];
}

const EMPTY_MANIFEST: VoiceLibraryManifest = { _version: 1, categories: [], profiles: [] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeCategory(input: unknown): VoiceLibraryCategoryDTO | null {
  if (!isPlainObject(input)) return null;
  const id = String(input.id ?? '').trim();
  const name = String(input.name ?? '').trim();
  if (!id || !name) return null;
  const order = Number(input.order);
  return { id, name, order: Number.isFinite(order) ? order : 0 };
}

function sanitizeProfile(input: unknown): VoiceLibraryProfileDTO | null {
  if (!isPlainObject(input)) return null;
  const id = String(input.id ?? '').trim();
  const categoryId = String(input.categoryId ?? '').trim();
  const name = String(input.name ?? '').trim();
  if (!id || !categoryId || !name) return null;
  const now = Date.now();
  const createdAt = Number(input.createdAt);
  const updatedAt = Number(input.updatedAt);
  const gender = input.gender;
  return {
    id,
    categoryId,
    name,
    providerVoiceId: input.providerVoiceId ? String(input.providerVoiceId) : undefined,
    sampleFile: input.sampleFile ? String(input.sampleFile) : undefined,
    language: input.language ? String(input.language) : undefined,
    gender: gender === 'male' || gender === 'female' || gender === 'neutral' ? gender : undefined,
    note: input.note ? String(input.note) : undefined,
    createdAt: Number.isFinite(createdAt) ? createdAt : now,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : now,
  };
}

async function ensureDirs(): Promise<void> {
  await fs.promises.mkdir(getVoiceLibrarySamplesDir(), { recursive: true });
}

/** 读取（不存在 / 损坏返回空 manifest，不抛错） */
export async function readVoiceLibraryManifest(): Promise<VoiceLibraryManifest> {
  const filePath = getVoiceLibraryManifestPath();
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return { ...EMPTY_MANIFEST };
    const categories = Array.isArray(parsed.categories)
      ? (parsed.categories.map(sanitizeCategory).filter(Boolean) as VoiceLibraryCategoryDTO[])
      : [];
    const profiles = Array.isArray(parsed.profiles)
      ? (parsed.profiles.map(sanitizeProfile).filter(Boolean) as VoiceLibraryProfileDTO[])
      : [];
    return { _version: 1, categories, profiles };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return { ...EMPTY_MANIFEST };
    logger.warn(`[voiceLibrary] read manifest failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ...EMPTY_MANIFEST };
  }
}

/** 整体原子写（先写临时文件再 rename） */
export async function writeVoiceLibraryManifest(manifest: VoiceLibraryManifest): Promise<void> {
  await ensureDirs();
  const filePath = getVoiceLibraryManifestPath();
  const tmp = `${filePath}.tmp`;
  const next: VoiceLibraryManifest = {
    _version: 1,
    categories: manifest.categories.map(sanitizeCategory).filter(Boolean) as VoiceLibraryCategoryDTO[],
    profiles: manifest.profiles.map(sanitizeProfile).filter(Boolean) as VoiceLibraryProfileDTO[],
  };
  await fs.promises.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await fs.promises.rename(tmp, filePath);
}

/** 安全的 voiceId（防越界文件名） */
function isSafeVoiceId(id: string): boolean {
  return /^[A-Za-z0-9_\-]{1,128}$/.test(id);
}

const ALLOWED_SAMPLE_EXTS = new Set(['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'webm']);

/**
 * 把 base64 上传的样本写入 samples/，返回相对 voiceLibrary 根的子路径（如 'samples/abc.wav'）。
 * 同 voiceId 下任一旧扩展名都先清掉，保证一个 profile 一份样本。
 */
export async function saveVoiceLibrarySample(args: {
  voiceId: string;
  dataBase64: string;
  ext: string;
}): Promise<string> {
  const voiceId = String(args.voiceId || '').trim();
  const ext = String(args.ext || '').trim().toLowerCase().replace(/^\./, '');
  if (!isSafeVoiceId(voiceId)) throw new Error('Invalid voiceId');
  if (!ALLOWED_SAMPLE_EXTS.has(ext)) throw new Error(`Unsupported audio extension: ${ext}`);
  const data = String(args.dataBase64 || '');
  if (!data) throw new Error('Empty audio data');
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) throw new Error('Empty audio data');

  await ensureDirs();
  removeVoiceLibrarySampleSync(voiceId);

  const filename = `${voiceId}.${ext}`;
  const absPath = path.join(getVoiceLibrarySamplesDir(), filename);
  await fs.promises.writeFile(absPath, buffer);
  return path.posix.join('samples', filename);
}

function removeVoiceLibrarySampleSync(voiceId: string): number {
  const dir = getVoiceLibrarySamplesDir();
  let removed = 0;
  for (const ext of ALLOWED_SAMPLE_EXTS) {
    const candidate = path.join(dir, `${voiceId}.${ext}`);
    try {
      fs.unlinkSync(candidate);
      removed += 1;
    } catch {
      // not present
    }
  }
  return removed;
}

export function removeVoiceLibrarySample(voiceId: string): number {
  if (!isSafeVoiceId(voiceId)) return 0;
  return removeVoiceLibrarySampleSync(voiceId);
}

/**
 * 解析 sampleFile（相对 voiceLibrary 根）→ 绝对路径；越界 / 不存在返回空串。
 */
export function resolveVoiceLibrarySamplePath(sampleFile: string): string {
  const root = getVoiceLibraryDir();
  const trimmed = String(sampleFile || '').replace(/^[\\/]+/, '').trim();
  if (!trimmed) return '';
  const resolved = path.resolve(root, trimmed);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return '';
  try {
    if (!fs.existsSync(resolved)) return '';
    return resolved;
  } catch {
    return '';
  }
}
