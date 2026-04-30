import type Database from 'better-sqlite3';
import type { ITimelineRepository, TimelineRow, TrackRow, ClipRow, TimelineData } from './interfaces';
import {
  animationToRow,
  buildTimelineData,
  clipToRow,
  keyframeToRow,
  timelineToRow,
  trackToRow,
  transitionToRow,
  type TimelineClipAnimationRow,
  type TimelineClipKeyframeRow,
  type TimelineTrackTransitionRow,
} from '../projectPersistenceHelpers';

type TimelineScope = 'project' | 'episode';

export class SqliteTimelineRepository implements ITimelineRepository {
  constructor(private db: Database.Database) {}

  getByProjectId(projectId: string): TimelineData | undefined {
    return this.getProjectTimeline(projectId);
  }

  getProjectTimeline(projectId: string): TimelineData | undefined {
    return this.getTimelineByScope('project', projectId, projectId);
  }

  getEpisodeTimeline(projectId: string, episodeId: string): TimelineData | undefined {
    return this.getTimelineByScope('episode', episodeId, projectId);
  }

  listEpisodeTimelines(projectId: string): Record<string, TimelineData> {
    const rows = this.db.prepare(
      "SELECT * FROM timelines WHERE project_id = ? AND scope_type = 'episode' ORDER BY updated_at"
    ).all(projectId) as TimelineRow[];

    const result: Record<string, TimelineData> = {};
    for (const row of rows) {
      if (!row.scope_id) continue;
      const timeline = this.loadTimelineFromRow(row);
      if (timeline) {
        result[row.scope_id] = timeline;
      }
    }
    return result;
  }

  createDefault(projectId: string): TimelineData {
    const now = Date.now();
    const timeline: TimelineData = {
      version: 1,
      createdAt: now,
      updatedAt: now,
      tracks: [
        {
          id: `video-${now}`,
          type: 'video',
          clips: [],
          order: 0,
          isMainTrack: true,
          name: '视频轨道 1',
          muted: false,
          hidden: false,
        },
        {
          id: `audio-${now}`,
          type: 'audio',
          clips: [],
          order: -1,
          name: '音频轨道 1',
          muted: false,
          hidden: false,
        },
        {
          id: `text-${now}`,
          type: 'text',
          clips: [],
          order: 1,
          name: '文本轨道 1',
          muted: false,
          hidden: false,
        },
      ],
    };

    return this.saveProjectTimeline(projectId, timeline);
  }

  saveProjectTimeline(projectId: string, timeline: TimelineData): TimelineData {
    return this.saveTimelineByScope(projectId, 'project', projectId, timeline);
  }

  saveEpisodeTimeline(projectId: string, episodeId: string, timeline: TimelineData): TimelineData {
    return this.saveTimelineByScope(projectId, 'episode', episodeId, timeline);
  }

  deleteEpisodeTimeline(episodeId: string): void {
    this.db.prepare("DELETE FROM timelines WHERE scope_type = 'episode' AND scope_id = ?").run(episodeId);
  }

  updateTimeline(id: string, data: Partial<TimelineRow>): void {
    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    for (const [key, value] of Object.entries(data)) {
      if (key === 'id') continue;
      fields.push(`${key} = @${key}`);
      values[key] = value ?? null;
    }

    if (!fields.some(field => field.startsWith('updated_at'))) {
      fields.push('updated_at = @updated_at');
      values.updated_at = Date.now();
    }

    if (fields.length === 0) return;

    this.db.prepare(`UPDATE timelines SET ${fields.join(', ')} WHERE id = @id`).run(values);
  }

  addTrack(data: TrackRow): void {
    this.db.prepare(`
      INSERT INTO timeline_tracks (
        id, timeline_id, name, type, kind, muted, locked, visible, height,
        hidden, is_main_track, track_order, sort_order
      ) VALUES (
        @id, @timeline_id, @name, @type, @kind, @muted, @locked, @visible, @height,
        @hidden, @is_main_track, @track_order, @sort_order
      )
    `).run({
      id: data.id,
      timeline_id: data.timeline_id,
      name: data.name ?? '',
      type: data.type,
      kind: data.kind ?? (data.type === 'subtitle' ? 'text' : data.type),
      muted: data.muted ?? 0,
      locked: data.locked ?? 0,
      visible: data.visible ?? 1,
      height: data.height ?? 60,
      hidden: data.hidden ?? 0,
      is_main_track: data.is_main_track ?? 0,
      track_order: data.track_order ?? data.sort_order ?? 0,
      sort_order: data.sort_order ?? 0,
    });
  }

  updateTrack(id: string, data: Partial<TrackRow>): void {
    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    for (const [key, value] of Object.entries(data)) {
      if (key === 'id') continue;
      fields.push(`${key} = @${key}`);
      values[key] = value ?? null;
    }

    if (fields.length === 0) return;

    this.db.prepare(`UPDATE timeline_tracks SET ${fields.join(', ')} WHERE id = @id`).run(values);
  }

  deleteTrack(id: string): void {
    this.db.prepare('DELETE FROM timeline_tracks WHERE id = ?').run(id);
  }

  addClip(data: ClipRow): void {
    this.db.prepare(`
      INSERT INTO timeline_clips (
        id, track_id, asset_id, asset_ref_id, start_time, end_time, in_point, out_point,
        duration, offset_time, source_duration, source_width, source_height, sort_order,
        name, type, src, x, y, scale, rotation, opacity, text,
        font_size, font_family, font_color, background_color, text_position, text_align,
        filter_id, filter_name, filter_resource_id, filter_intensity,
        audio_fade_in, audio_fade_out,
        mask_type, mask_center_x, mask_center_y, mask_size, mask_width,
        mask_rotation, mask_feather, mask_invert, mask_round_corner,
        metadata_json
      ) VALUES (
        @id, @track_id, @asset_id, @asset_ref_id, @start_time, @end_time, @in_point, @out_point,
        @duration, @offset_time, @source_duration, @source_width, @source_height, @sort_order,
        @name, @type, @src, @x, @y, @scale, @rotation, @opacity, @text,
        @font_size, @font_family, @font_color, @background_color, @text_position, @text_align,
        @filter_id, @filter_name, @filter_resource_id, @filter_intensity,
        @audio_fade_in, @audio_fade_out,
        @mask_type, @mask_center_x, @mask_center_y, @mask_size, @mask_width,
        @mask_rotation, @mask_feather, @mask_invert, @mask_round_corner,
        @metadata_json
      )
    `).run({
      id: data.id,
      track_id: data.track_id,
      asset_id: data.asset_id ?? null,
      asset_ref_id: data.asset_ref_id ?? data.asset_id ?? null,
      start_time: data.start_time,
      end_time: data.end_time,
      in_point: data.in_point ?? 0,
      out_point: data.out_point ?? null,
      duration: data.duration ?? Math.max(data.end_time - data.start_time, 0),
      offset_time: data.offset_time ?? data.in_point ?? 0,
      source_duration: data.source_duration ?? null,
      source_width: data.source_width ?? null,
      source_height: data.source_height ?? null,
      sort_order: data.sort_order ?? 0,
      name: data.name ?? data.id,
      type: data.type ?? 'IMAGE',
      src: data.src ?? '',
      x: data.x ?? 0,
      y: data.y ?? 0,
      scale: data.scale ?? 1,
      rotation: data.rotation ?? 0,
      opacity: data.opacity ?? 1,
      text: data.text ?? null,
      font_size: data.font_size ?? null,
      font_family: data.font_family ?? null,
      font_color: data.font_color ?? null,
      background_color: data.background_color ?? null,
      text_position: data.text_position ?? null,
      text_align: data.text_align ?? null,
      filter_id: data.filter_id ?? null,
      filter_name: data.filter_name ?? null,
      filter_resource_id: data.filter_resource_id ?? null,
      filter_intensity: data.filter_intensity ?? null,
      audio_fade_in: data.audio_fade_in ?? null,
      audio_fade_out: data.audio_fade_out ?? null,
      mask_type: data.mask_type ?? null,
      mask_center_x: data.mask_center_x ?? null,
      mask_center_y: data.mask_center_y ?? null,
      mask_size: data.mask_size ?? null,
      mask_width: data.mask_width ?? null,
      mask_rotation: data.mask_rotation ?? null,
      mask_feather: data.mask_feather ?? null,
      mask_invert: data.mask_invert ?? null,
      mask_round_corner: data.mask_round_corner ?? null,
      metadata_json: data.metadata_json ?? null,
    });
  }

  updateClip(id: string, data: Partial<ClipRow>): void {
    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    for (const [key, value] of Object.entries(data)) {
      if (key === 'id') continue;
      fields.push(`${key} = @${key}`);
      values[key] = value ?? null;
    }

    if (fields.length === 0) return;

    this.db.prepare(`UPDATE timeline_clips SET ${fields.join(', ')} WHERE id = @id`).run(values);
  }

  deleteClip(id: string): void {
    this.db.prepare('DELETE FROM timeline_clips WHERE id = ?').run(id);
  }

  private getTimelineByScope(
    scopeType: TimelineScope,
    scopeId: string,
    projectId: string,
  ): TimelineData | undefined {
    const row = this.findTimelineRow(scopeType, scopeId, projectId);
    return row ? this.loadTimelineFromRow(row) : undefined;
  }

  private findTimelineRow(
    scopeType: TimelineScope,
    scopeId: string,
    projectId: string,
  ): TimelineRow | undefined {
    return this.db.prepare(
      'SELECT * FROM timelines WHERE project_id = ? AND scope_type = ? AND scope_id = ? LIMIT 1'
    ).get(projectId, scopeType, scopeId) as TimelineRow | undefined;
  }

  private saveTimelineByScope(
    projectId: string,
    scopeType: TimelineScope,
    scopeId: string,
    timeline: TimelineData,
  ): TimelineData {
    const existing = this.findTimelineRow(scopeType, scopeId, projectId);
    const timelineRow = timelineToRow(projectId, scopeType, scopeId, timeline, existing);

    const trackRows: TrackRow[] = [];
    const clipRows: ClipRow[] = [];
    const transitionRows: TimelineTrackTransitionRow[] = [];
    const keyframeRows: TimelineClipKeyframeRow[] = [];
    const animationRows: TimelineClipAnimationRow[] = [];

    timeline.tracks.forEach((track, trackIndex) => {
      const trackRow = trackToRow(timelineRow.id, track, trackIndex);
      trackRows.push(trackRow);

      (track.clips || []).forEach((clip, clipIndex) => {
        clipRows.push(clipToRow(track.id, clip, clipIndex));
        (clip.keyframes || []).forEach((frame, frameIndex) => {
          keyframeRows.push(keyframeToRow(clip.id, frame, frameIndex));
        });
        (clip.animations || []).forEach((animation, animationIndex) => {
          animationRows.push(animationToRow(clip.id, animation, animationIndex));
        });
      });

      (track.transitions || []).forEach((transition, transitionIndex) => {
        transitionRows.push(transitionToRow(track.id, transition, transitionIndex));
      });
    });

    const write = this.db.transaction(() => {
      if (existing) {
        this.updateTimeline(timelineRow.id, timelineRow);
        this.db.prepare('DELETE FROM timeline_tracks WHERE timeline_id = ?').run(timelineRow.id);
      } else {
        this.db.prepare(`
          INSERT INTO timelines (
            id, project_id, scope_type, scope_id, timeline_version,
            duration, fps, resolution_width, resolution_height, metadata_json,
            created_at, updated_at
          ) VALUES (
            @id, @project_id, @scope_type, @scope_id, @timeline_version,
            @duration, @fps, @resolution_width, @resolution_height, @metadata_json,
            @created_at, @updated_at
          )
        `).run({
          id: timelineRow.id,
          project_id: timelineRow.project_id,
          scope_type: timelineRow.scope_type ?? scopeType,
          scope_id: timelineRow.scope_id ?? scopeId,
          timeline_version: timelineRow.timeline_version ?? timeline.version,
          duration: timelineRow.duration,
          fps: timelineRow.fps,
          resolution_width: timelineRow.resolution_width,
          resolution_height: timelineRow.resolution_height,
          metadata_json: null,
          created_at: timelineRow.created_at,
          updated_at: timelineRow.updated_at,
        });
      }

      for (const row of trackRows) this.addTrack(row);
      for (const row of clipRows) this.addClip(row);

      const insertTransition = this.db.prepare(`
        INSERT INTO timeline_track_transitions (
          id, track_id, from_clip_id, to_clip_id, type, duration, sort_order
        ) VALUES (
          @id, @track_id, @from_clip_id, @to_clip_id, @type, @duration, @sort_order
        )
      `);
      for (const row of transitionRows) insertTransition.run(row);

      const insertKeyframe = this.db.prepare(`
        INSERT INTO timeline_clip_keyframes (
          id, clip_id, time, x, y, scale, rotation, opacity, easing, sort_order
        ) VALUES (
          @id, @clip_id, @time, @x, @y, @scale, @rotation, @opacity, @easing, @sort_order
        )
      `);
      for (const row of keyframeRows) insertKeyframe.run(row);

      const insertAnimation = this.db.prepare(`
        INSERT INTO timeline_clip_animations (
          id, clip_id, animation_type, effect_id, name, duration, sort_order
        ) VALUES (
          @id, @clip_id, @animation_type, @effect_id, @name, @duration, @sort_order
        )
      `);
      for (const row of animationRows) insertAnimation.run(row);
    });

    write();
    return this.getTimelineByScope(scopeType, scopeId, projectId) ?? timeline;
  }

  private loadTimelineFromRow(timelineRow: TimelineRow): TimelineData | undefined {
    const trackRows = this.db.prepare(
      'SELECT * FROM timeline_tracks WHERE timeline_id = ? ORDER BY sort_order'
    ).all(timelineRow.id) as TrackRow[];

    const trackIds = trackRows.map(track => track.id);
    const clipRows = trackIds.length > 0
      ? this.db.prepare(
          `SELECT * FROM timeline_clips WHERE track_id IN (${trackIds.map(() => '?').join(',')}) ORDER BY sort_order, start_time`
        ).all(...trackIds) as ClipRow[]
      : [];

    const clipIds = clipRows.map(clip => clip.id);
    const transitionRows = trackIds.length > 0
      ? this.db.prepare(
          `SELECT * FROM timeline_track_transitions WHERE track_id IN (${trackIds.map(() => '?').join(',')}) ORDER BY sort_order`
        ).all(...trackIds) as TimelineTrackTransitionRow[]
      : [];
    const keyframeRows = clipIds.length > 0
      ? this.db.prepare(
          `SELECT * FROM timeline_clip_keyframes WHERE clip_id IN (${clipIds.map(() => '?').join(',')}) ORDER BY sort_order`
        ).all(...clipIds) as TimelineClipKeyframeRow[]
      : [];
    const animationRows = clipIds.length > 0
      ? this.db.prepare(
          `SELECT * FROM timeline_clip_animations WHERE clip_id IN (${clipIds.map(() => '?').join(',')}) ORDER BY sort_order`
        ).all(...clipIds) as TimelineClipAnimationRow[]
      : [];

    return buildTimelineData(
      timelineRow,
      trackRows,
      clipRows,
      transitionRows,
      keyframeRows,
      animationRows,
    );
  }
}
