/**
 * localStorage 键常量
 *
 * 纯 UI 客户端态。配置数据（SETTINGS / RECENT_PROJECTS / PRESETS /
 * PROMPT_TEMPLATES / STORAGE_CONFIG 等）已迁入 SQLite，经 `electronAPI.config.*`
 * 访问，不再出现在此文件中。
 */

// 应用级配置
export const STORAGE_KEYS = {
  // 语言设置
  LANGUAGE: 'app-language',
} as const;

// 聊天相关键
export const CHAT_STORAGE_KEYS = {
  SESSIONS: 'chat_sessions',
  SESSION_DATA_PREFIX: 'chat_session_',
} as const;

// 项目相关键（带项目 ID 前缀）
export const PROJECT_STORAGE_KEYS = {
  SCRIPT_VERSIONS_PREFIX: 'koma_script_versions_',
} as const;

// 生成带项目 ID 的键
export function getProjectStorageKey(prefix: string, projectId: string): string {
  return `${prefix}${projectId}`;
}

// 生成脚本版本键
export function getScriptVersionsKey(projectId: string): string {
  return getProjectStorageKey(PROJECT_STORAGE_KEYS.SCRIPT_VERSIONS_PREFIX, projectId);
}

// 生成会话数据键
export function getSessionDataKey(sessionId: string): string {
  return `${CHAT_STORAGE_KEYS.SESSION_DATA_PREFIX}${sessionId}`;
}
