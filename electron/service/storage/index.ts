/**
 * 存储层统一导出
 */
export { BaseDB, baseDB } from './BaseDB';

// Repository 接口
export type {
  IProjectRepository,
  ICharacterRepository,
  ISceneRepository,
  IPropRepository,
  IShotRepository,
  IAssetRepository,
  IEpisodeRepository,
  ITimelineRepository,
  ProjectRow,
  CharacterRow,
  SceneRow,
  PropRow,
  ShotRow,
  ShotVersionRow,
  AssetRow,
  EpisodeRow,
  TimelineRow,
  TrackRow,
  ClipRow,
  TimelineData,
} from './repositories/interfaces';

// SQLite 实现
export { SqliteProjectRepository } from './repositories/SqliteProjectRepository';
export { SqliteCharacterRepository } from './repositories/SqliteCharacterRepository';
export { SqliteSceneRepository } from './repositories/SqliteSceneRepository';
export { SqlitePropRepository } from './repositories/SqlitePropRepository';
export { SqliteShotRepository } from './repositories/SqliteShotRepository';
export { SqliteAssetRepository } from './repositories/SqliteAssetRepository';
export { SqliteEpisodeRepository } from './repositories/SqliteEpisodeRepository';
export { SqliteTimelineRepository } from './repositories/SqliteTimelineRepository';
