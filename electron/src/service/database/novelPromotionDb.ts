/**
 * Novel Promotion 数据库服务
 * 管理 Episode、Clip、Storyboard、Panel、Character、Location 等数据
 */

import { BasedbService } from './basedb';

class NovelPromotionDbService extends BasedbService {
  constructor() {
    super({ dbname: 'novel_promotion.db' });
  }

  /** 初始化所有表 */
  init(): void {
    this._init();

    // ============ Episodes 表 ============
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        novel_text TEXT,
        theme TEXT,
        video_ratio TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_episodes_project
        ON episodes(project_id);
    `);

    // ============ Characters 表 ============
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        appearance TEXT,
        personality TEXT,
        image_url TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_characters_project
        ON characters(project_id);
    `);

    // ============ Locations 表 ============
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_locations_project
        ON locations(project_id);
    `);

    // ============ Clips 表 ============
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clips (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        clip_number INTEGER NOT NULL,
        summary TEXT,
        content TEXT NOT NULL,
        location TEXT,
        screenplay TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_clips_episode
        ON clips(episode_id);
    `);

    // ============ Clip Characters 关联表 ============
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clip_characters (
        clip_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        PRIMARY KEY (clip_id, character_name),
        FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_clip_characters_clip
        ON clip_characters(clip_id);
    `);

    // ============ Storyboards 表 ============
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS storyboards (
        id TEXT PRIMARY KEY,
        clip_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_storyboards_clip
        ON storyboards(clip_id);
    `);

    // ============ Panels 表 ============
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS panels (
        id TEXT PRIMARY KEY,
        storyboard_id TEXT NOT NULL,
        panel_number INTEGER NOT NULL,
        description TEXT NOT NULL,
        location TEXT,
        image_url TEXT,
        image_candidates TEXT,
        photography_plan TEXT,
        acting_notes TEXT,
        video_url TEXT,
        video_status TEXT DEFAULT 'pending',
        FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_panels_storyboard
        ON panels(storyboard_id);
    `);

    // ============ Panel Characters 关联表 ============
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS panel_characters (
        panel_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        PRIMARY KEY (panel_id, character_name),
        FOREIGN KEY (panel_id) REFERENCES panels(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_panel_characters_panel
        ON panel_characters(panel_id);
    `);
  }

  // ============ Episode CRUD ============

  createEpisode(episode: {
    id: string;
    projectId: string;
    name: string;
    novelText?: string;
    theme?: string;
    videoRatio?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO episodes (id, project_id, name, novel_text, theme, video_ratio, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    stmt.run(
      episode.id,
      episode.projectId,
      episode.name,
      episode.novelText || null,
      episode.theme || null,
      episode.videoRatio || null,
      now,
      now
    );
  }

  getEpisode(episodeId: string): any {
    const stmt = this.db.prepare('SELECT * FROM episodes WHERE id = ?');
    return stmt.get(episodeId);
  }

  getEpisodesByProject(projectId: string): any[] {
    const stmt = this.db.prepare('SELECT * FROM episodes WHERE project_id = ? ORDER BY created_at DESC');
    return stmt.all(projectId);
  }

  updateEpisode(episodeId: string, updates: {
    name?: string;
    novelText?: string;
    theme?: string;
    videoRatio?: string;
  }): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.novelText !== undefined) {
      fields.push('novel_text = ?');
      values.push(updates.novelText);
    }
    if (updates.theme !== undefined) {
      fields.push('theme = ?');
      values.push(updates.theme);
    }
    if (updates.videoRatio !== undefined) {
      fields.push('video_ratio = ?');
      values.push(updates.videoRatio);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(episodeId);

    const stmt = this.db.prepare(`UPDATE episodes SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  deleteEpisode(episodeId: string): void {
    const stmt = this.db.prepare('DELETE FROM episodes WHERE id = ?');
    stmt.run(episodeId);
  }

  // ============ Character CRUD ============

  createCharacter(character: {
    id: string;
    projectId: string;
    name: string;
    description?: string;
    appearance?: string;
    personality?: string;
    imageUrl?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO characters (id, project_id, name, description, appearance, personality, image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      character.id,
      character.projectId,
      character.name,
      character.description || null,
      character.appearance || null,
      character.personality || null,
      character.imageUrl || null,
      Date.now()
    );
  }

  getCharactersByProject(projectId: string): any[] {
    const stmt = this.db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY created_at ASC');
    return stmt.all(projectId);
  }

  updateCharacter(characterId: string, updates: {
    name?: string;
    description?: string;
    appearance?: string;
    personality?: string;
    imageUrl?: string;
  }): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.appearance !== undefined) {
      fields.push('appearance = ?');
      values.push(updates.appearance);
    }
    if (updates.personality !== undefined) {
      fields.push('personality = ?');
      values.push(updates.personality);
    }
    if (updates.imageUrl !== undefined) {
      fields.push('image_url = ?');
      values.push(updates.imageUrl);
    }

    if (fields.length === 0) return;

    values.push(characterId);

    const stmt = this.db.prepare(`UPDATE characters SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  deleteCharacter(characterId: string): void {
    const stmt = this.db.prepare('DELETE FROM characters WHERE id = ?');
    stmt.run(characterId);
  }

  // ============ Location CRUD ============

  createLocation(location: {
    id: string;
    projectId: string;
    name: string;
    description?: string;
    imageUrl?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO locations (id, project_id, name, description, image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      location.id,
      location.projectId,
      location.name,
      location.description || null,
      location.imageUrl || null,
      Date.now()
    );
  }

  getLocationsByProject(projectId: string): any[] {
    const stmt = this.db.prepare('SELECT * FROM locations WHERE project_id = ? ORDER BY created_at ASC');
    return stmt.all(projectId);
  }

  updateLocation(locationId: string, updates: {
    name?: string;
    description?: string;
    imageUrl?: string;
  }): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.imageUrl !== undefined) {
      fields.push('image_url = ?');
      values.push(updates.imageUrl);
    }

    if (fields.length === 0) return;

    values.push(locationId);

    const stmt = this.db.prepare(`UPDATE locations SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  deleteLocation(locationId: string): void {
    const stmt = this.db.prepare('DELETE FROM locations WHERE id = ?');
    stmt.run(locationId);
  }

  // ============ Clip CRUD ============

  createClip(clip: {
    id: string;
    episodeId: string;
    clipNumber: number;
    summary?: string;
    content: string;
    location?: string;
    characters?: string[];
    screenplay?: Record<string, unknown>;
  }): void {
    const transaction = this.db.transaction(() => {
      // 插入 Clip
      const stmt = this.db.prepare(`
        INSERT INTO clips (id, episode_id, clip_number, summary, content, location, screenplay, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        clip.id,
        clip.episodeId,
        clip.clipNumber,
        clip.summary || null,
        clip.content,
        clip.location || null,
        clip.screenplay ? JSON.stringify(clip.screenplay) : null,
        Date.now()
      );

      // 插入角色关联
      if (clip.characters && clip.characters.length > 0) {
        const charStmt = this.db.prepare(`
          INSERT INTO clip_characters (clip_id, character_name) VALUES (?, ?)
        `);

        for (const character of clip.characters) {
          charStmt.run(clip.id, character);
        }
      }
    });

    transaction();
  }

  getClipsByEpisode(episodeId: string): any[] {
    const clips = this.db.prepare('SELECT * FROM clips WHERE episode_id = ? ORDER BY clip_number ASC').all(episodeId);

    // 加载角色关联
    const charStmt = this.db.prepare('SELECT character_name FROM clip_characters WHERE clip_id = ?');

    return clips.map((clip: any) => {
      const characters = charStmt.all(clip.id).map((row: any) => row.character_name);
      return {
        ...clip,
        characters,
        screenplay: clip.screenplay ? JSON.parse(clip.screenplay) : null,
      };
    });
  }

  // ============ Storyboard & Panel CRUD ============

  createStoryboard(storyboard: {
    id: string;
    clipId: string;
    panels: Array<{
      id: string;
      panelNumber: number;
      description: string;
      location?: string;
      characters?: string[];
      imageUrl?: string;
      photographyPlan?: Record<string, unknown>;
      actingNotes?: Array<Record<string, unknown>>;
    }>;
  }): void {
    const transaction = this.db.transaction(() => {
      // 插入 Storyboard
      const sbStmt = this.db.prepare(`
        INSERT INTO storyboards (id, clip_id, created_at) VALUES (?, ?, ?)
      `);
      sbStmt.run(storyboard.id, storyboard.clipId, Date.now());

      // 插入 Panels
      const panelStmt = this.db.prepare(`
        INSERT INTO panels (id, storyboard_id, panel_number, description, location, image_url, photography_plan, acting_notes, video_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const charStmt = this.db.prepare(`
        INSERT INTO panel_characters (panel_id, character_name) VALUES (?, ?)
      `);

      for (const panel of storyboard.panels) {
        panelStmt.run(
          panel.id,
          storyboard.id,
          panel.panelNumber,
          panel.description,
          panel.location || null,
          panel.imageUrl || null,
          panel.photographyPlan ? JSON.stringify(panel.photographyPlan) : null,
          panel.actingNotes ? JSON.stringify(panel.actingNotes) : null,
          'pending'
        );

        // 插入角色关联
        if (panel.characters && panel.characters.length > 0) {
          for (const character of panel.characters) {
            charStmt.run(panel.id, character);
          }
        }
      }
    });

    transaction();
  }

  getStoryboardsByEpisode(episodeId: string): any[] {
    const storyboards = this.db.prepare(`
      SELECT s.* FROM storyboards s
      JOIN clips c ON s.clip_id = c.id
      WHERE c.episode_id = ?
      ORDER BY c.clip_number ASC
    `).all(episodeId);

    const panelStmt = this.db.prepare('SELECT * FROM panels WHERE storyboard_id = ? ORDER BY panel_number ASC');
    const charStmt = this.db.prepare('SELECT character_name FROM panel_characters WHERE panel_id = ?');

    return storyboards.map((sb: any) => {
      const panels = panelStmt.all(sb.id).map((panel: any) => {
        const characters = charStmt.all(panel.id).map((row: any) => row.character_name);
        return {
          ...panel,
          characters,
          photographyPlan: panel.photography_plan ? JSON.parse(panel.photography_plan) : null,
          actingNotes: panel.acting_notes ? JSON.parse(panel.acting_notes) : null,
        };
      });

      return {
        ...sb,
        panels,
      };
    });
  }

  updatePanelVideo(panelId: string, videoUrl: string, videoStatus: string): void {
    const stmt = this.db.prepare('UPDATE panels SET video_url = ?, video_status = ? WHERE id = ?');
    stmt.run(videoUrl, videoStatus, panelId);
  }
}

NovelPromotionDbService.toString = () => '[class NovelPromotionDbService]';
const novelPromotionDbService = new NovelPromotionDbService();

export { NovelPromotionDbService, novelPromotionDbService };
