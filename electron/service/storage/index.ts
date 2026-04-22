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
  IChannelConfigRepository,
  IPromptTemplateRepository,
  IVisualStylePresetRepository,
  IPluginRegistryRepository,
  IMCPServerRepository,
  IAgentProfileRepository,
  IRecentProjectRepository,
  IKvConfigRepository,
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
  ChannelKind,
  ChannelConfigRow,
  PromptTemplateRow,
  VisualStylePresetRow,
  PluginRegistryRow,
  MCPServerRow,
  AgentProfileRow,
  RecentProjectRow,
  KvConfigRow,
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

// 配置域 Repository 实现
export { SqliteChannelConfigRepository } from './repositories/SqliteChannelConfigRepository';
export { SqlitePromptTemplateRepository } from './repositories/SqlitePromptTemplateRepository';
export { SqliteVisualStylePresetRepository } from './repositories/SqliteVisualStylePresetRepository';
export { SqlitePluginRegistryRepository } from './repositories/SqlitePluginRegistryRepository';
export { SqliteMCPServerRepository } from './repositories/SqliteMCPServerRepository';
export { SqliteAgentProfileRepository } from './repositories/SqliteAgentProfileRepository';
export { SqliteRecentProjectRepository } from './repositories/SqliteRecentProjectRepository';
export { SqliteKvConfigRepository } from './repositories/SqliteKvConfigRepository';

// 加密 & seed
export { encryptField, decryptField, isEncrypted, ENCRYPTED_PREFIX } from './fieldCrypto';
export { seedConfigDefaults, BUILTIN_PROMPT_TEMPLATES, BUILTIN_VISUAL_STYLES } from './configSeed';
export type { BuiltinPromptTemplate, BuiltinVisualStyle } from './configSeed';
