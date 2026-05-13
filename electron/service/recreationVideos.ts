/**
 * RecreationVideosService — R4 二创：独立的视频导入库
 *
 * 与 project 无关：用户拖入视频文件 → 复制到 {businessRoot}/recreation/videos/
 * → ffprobe 拿元数据 → 写入 recreation_videos 表。
 *
 * 诊断报告也存这里（metadata_json.diagnosis）；不污染 episode 表。
 */
import crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { logger } from 'ee-core/log';

import { baseDB } from './storage';
import { getRecreationVideosDir } from './paths';
import { ffmpegService } from './ffmpeg';

export interface RecreationVideoRow {
  id: string;
  filename: string;
  file_path: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  size_bytes: number | null;
  codec: string | null;
  sha256: string | null;
  diagnosis_status: 'none' | 'running' | 'completed' | 'failed';
  metadata_json: string | null;
  parent_id: string | null;
  derived_from_plan_id: string | null;
  derived_kind: string | null;
  source_task_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface RecreationVideo {
  id: string;
  filename: string;
  filePath: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  sizeBytes: number | null;
  codec: string | null;
  sha256: string | null;
  diagnosisStatus: 'none' | 'running' | 'completed' | 'failed';
  parentId: string | null;
  derivedFromPlanId: string | null;
  derivedKind: string | null;
  sourceTaskId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface InsertDerivedInput {
  parentId: string;
  derivedFromPlanId: string | null;
  derivedKind: string;
  sourceTaskId: string | null;
  filePath: string;
  filename: string;
}

function rowToVideo(row: RecreationVideoRow): RecreationVideo {
  return {
    id: row.id,
    filename: row.filename,
    filePath: row.file_path,
    durationMs: row.duration_ms,
    width: row.width,
    height: row.height,
    fps: row.fps,
    sizeBytes: row.size_bytes,
    codec: row.codec,
    sha256: row.sha256,
    diagnosisStatus: row.diagnosis_status,
    parentId: row.parent_id,
    derivedFromPlanId: row.derived_from_plan_id,
    derivedKind: row.derived_kind,
    sourceTaskId: row.source_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function parseJsonSafely(raw: string | null): any | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export class RecreationVideosService {
  /**
   * 导入一个本地视频文件：
   *   1. 复制到 recreation/videos/<id>.<ext>
   *   2. ffprobe 拿元数据
   *   3. 计算 sha256（去重）
   *   4. 写 recreation_videos 表
   *
   * 如果发现同 sha256 已存在，返回已有记录、不重复落地（清掉拷贝）。
   */
  async importVideo(srcPath: string, originalFilename?: string): Promise<RecreationVideo> {
    const stat = await fsp.stat(srcPath);
    if (!stat.isFile()) {
      throw new Error(`不是有效文件: ${srcPath}`);
    }
    const filename = originalFilename || path.basename(srcPath);
    const ext = path.extname(filename) || '.mp4';
    const id = crypto.randomUUID();
    const dir = getRecreationVideosDir();
    await fsp.mkdir(dir, { recursive: true });
    const dest = path.join(dir, `${id}${ext}`);
    await fsp.copyFile(srcPath, dest);

    let sha: string | null = null;
    try {
      sha = await sha256File(dest);
    } catch {
      // 大文件可能因为权限等失败；忽略，sha 留 null
    }

    // 去重检查：sha 命中则删本次拷贝，返回已有记录
    if (sha) {
      const existing = this.getBySha(sha);
      if (existing) {
        await fsp.unlink(dest).catch(() => undefined);
        return existing;
      }
    }

    // ffprobe 元数据
    let durationMs: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let fps: number | null = null;
    let codec: string | null = null;
    try {
      const info = await ffmpegService.getMediaInfo(dest);
      // 0 / NaN 一律按 null 处理，便于上层判断"是否真的拿到"
      durationMs = info.duration && Number.isFinite(info.duration) && info.duration > 0 ? info.duration : null;
      width = info.width && info.width > 0 ? info.width : null;
      height = info.height && info.height > 0 ? info.height : null;
      fps = info.fps && Number.isFinite(info.fps) && info.fps > 0 ? info.fps : null;
      codec = info.videoCodec ?? null;
      logger.info('[recreationVideos] ffprobe ok', { dest, durationMs, width, height, fps, codec });
    } catch (err) {
      // ffprobe 失败也允许导入，前端展示 "未知" 元数据；但日志里要看到为什么失败
      logger.warn('[recreationVideos] ffprobe failed', { dest, err: err instanceof Error ? err.message : String(err) });
    }

    const now = Date.now();
    baseDB.getDb().prepare(`
      INSERT INTO recreation_videos (
        id, filename, file_path, duration_ms, width, height, fps, size_bytes,
        codec, sha256, diagnosis_status, metadata_json,
        parent_id, derived_from_plan_id, derived_kind, source_task_id,
        created_at, updated_at
      ) VALUES (
        @id, @filename, @file_path, @duration_ms, @width, @height, @fps, @size_bytes,
        @codec, @sha256, 'none', NULL,
        NULL, NULL, NULL, NULL,
        @created_at, @updated_at
      )
    `).run({
      id, filename, file_path: dest,
      duration_ms: durationMs,
      width, height, fps,
      size_bytes: stat.size,
      codec,
      sha256: sha,
      created_at: now,
      updated_at: now,
    });

    return this.getById(id)!;
  }

  /**
   * 写入派生产物行：复用 ffprobe 拿元数据，不复制文件（executor 已经把文件写到最终目录）。
   * 注意：派生产物没有 sha 去重——同一源视频反复跑同一修改单应该出多个版本。
   */
  async insertDerived(input: InsertDerivedInput): Promise<RecreationVideo> {
    const stat = await fsp.stat(input.filePath);
    if (!stat.isFile()) {
      throw new Error(`派生文件不存在: ${input.filePath}`);
    }
    let durationMs: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let fps: number | null = null;
    let codec: string | null = null;
    try {
      const info = await ffmpegService.getMediaInfo(input.filePath);
      durationMs = info.duration && Number.isFinite(info.duration) && info.duration > 0 ? info.duration : null;
      width = info.width && info.width > 0 ? info.width : null;
      height = info.height && info.height > 0 ? info.height : null;
      fps = info.fps && Number.isFinite(info.fps) && info.fps > 0 ? info.fps : null;
      codec = info.videoCodec ?? null;
    } catch (err) {
      logger.warn('[recreationVideos] insertDerived ffprobe failed', { path: input.filePath, err });
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    baseDB.getDb().prepare(`
      INSERT INTO recreation_videos (
        id, filename, file_path, duration_ms, width, height, fps, size_bytes,
        codec, sha256, diagnosis_status, metadata_json,
        parent_id, derived_from_plan_id, derived_kind, source_task_id,
        created_at, updated_at
      ) VALUES (
        @id, @filename, @file_path, @duration_ms, @width, @height, @fps, @size_bytes,
        @codec, NULL, 'none', NULL,
        @parent_id, @derived_from_plan_id, @derived_kind, @source_task_id,
        @created_at, @updated_at
      )
    `).run({
      id,
      filename: input.filename,
      file_path: input.filePath,
      duration_ms: durationMs,
      width, height, fps,
      size_bytes: stat.size,
      codec,
      parent_id: input.parentId,
      derived_from_plan_id: input.derivedFromPlanId,
      derived_kind: input.derivedKind,
      source_task_id: input.sourceTaskId,
      created_at: now,
      updated_at: now,
    });
    return this.getById(id)!;
  }

  /** 列出某源视频的全部派生产物，新→旧 */
  listDerived(parentId: string): RecreationVideo[] {
    const rows = baseDB.getDb()
      .prepare('SELECT * FROM recreation_videos WHERE parent_id = ? ORDER BY created_at DESC')
      .all(parentId) as RecreationVideoRow[];
    return rows.map(rowToVideo);
  }

  list(): RecreationVideo[] {
    const rows = baseDB.getDb()
      .prepare('SELECT * FROM recreation_videos WHERE parent_id IS NULL ORDER BY created_at DESC')
      .all() as RecreationVideoRow[];
    return rows.map(rowToVideo);
  }

  getById(id: string): RecreationVideo | null {
    const row = baseDB.getDb()
      .prepare('SELECT * FROM recreation_videos WHERE id = ?')
      .get(id) as RecreationVideoRow | undefined;
    return row ? rowToVideo(row) : null;
  }

  getBySha(sha: string): RecreationVideo | null {
    const row = baseDB.getDb()
      .prepare('SELECT * FROM recreation_videos WHERE sha256 = ? LIMIT 1')
      .get(sha) as RecreationVideoRow | undefined;
    return row ? rowToVideo(row) : null;
  }

  async deleteVideo(id: string): Promise<boolean> {
    const row = this.getById(id);
    if (!row) return false;
    await fsp.unlink(row.filePath).catch(() => undefined);
    baseDB.getDb().prepare('DELETE FROM recreation_videos WHERE id = ?').run(id);
    return true;
  }

  setDiagnosisStatus(id: string, status: 'none' | 'running' | 'completed' | 'failed'): void {
    baseDB.getDb().prepare(`
      UPDATE recreation_videos SET diagnosis_status = ?, updated_at = ? WHERE id = ?
    `).run(status, Date.now(), id);
  }

  /**
   * 启动时调用：把所有 status='running' 的视频强制改为 'failed'。
   *
   * 原因：诊断 task 在主进程跑，process 崩溃 / 应用强退 / service 抛错未捕获
   * 都可能让 SQLite 状态卡在 'running'，UI 卡死在"解析中"无法重试。
   * 启动期统一 reconcile —— 用户看到 'failed' 后可以再点 AI 解析。
   */
  reconcileOnBoot(): number {
    const result = baseDB.getDb().prepare(`
      UPDATE recreation_videos SET diagnosis_status = 'failed', updated_at = ?
      WHERE diagnosis_status = 'running'
    `).run(Date.now());
    return result.changes ?? 0;
  }

  /** 写诊断报告到 metadata_json.diagnosis；同时更新 diagnosis_status */
  saveDiagnosis(id: string, diagnosis: any | null): void {
    const row = baseDB.getDb()
      .prepare('SELECT metadata_json FROM recreation_videos WHERE id = ?')
      .get(id) as { metadata_json: string | null } | undefined;
    if (!row) throw new Error(`recreation video not found: ${id}`);
    const existing = (parseJsonSafely(row.metadata_json) || {}) as Record<string, unknown>;
    if (diagnosis == null) {
      delete existing.diagnosis;
    } else {
      existing.diagnosis = diagnosis;
    }
    const next = Object.keys(existing).length ? JSON.stringify(existing) : null;
    baseDB.getDb().prepare(`
      UPDATE recreation_videos SET metadata_json = ?, diagnosis_status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next,
      diagnosis == null ? 'none' : 'completed',
      Date.now(),
      id,
    );
  }

  loadDiagnosis(id: string): any | null {
    const row = baseDB.getDb()
      .prepare('SELECT metadata_json FROM recreation_videos WHERE id = ?')
      .get(id) as { metadata_json: string | null } | undefined;
    if (!row) return null;
    const parsed = parseJsonSafely(row.metadata_json);
    if (!parsed || typeof parsed !== 'object') return null;
    return (parsed as Record<string, unknown>).diagnosis ?? null;
  }
}

export const recreationVideosService = new RecreationVideosService();
