/**
 * IPC 业务错误码字典
 * 所有 Controller 应使用这些错误码，前端据此映射用户友好消息
 */

// ========== 通用 ==========
export const ERR_UNKNOWN = 'UNKNOWN_ERROR';
export const ERR_INVALID_PARAMS = 'INVALID_PARAMS';
export const ERR_NOT_FOUND = 'NOT_FOUND';
export const ERR_PERMISSION_DENIED = 'PERMISSION_DENIED';
export const ERR_TIMEOUT = 'TIMEOUT';
export const ERR_HANDLER_NOT_FOUND = 'HANDLER_NOT_FOUND';

// ========== 项目 ==========
export const ERR_PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND';
export const ERR_PROJECT_CREATE_FAILED = 'PROJECT_CREATE_FAILED';
export const ERR_PROJECT_IMPORT_FAILED = 'PROJECT_IMPORT_FAILED';
export const ERR_PROJECT_EXPORT_FAILED = 'PROJECT_EXPORT_FAILED';

// ========== 持久化 ==========
export const ERR_PERSISTENCE_READ = 'PERSISTENCE_READ_FAILED';
export const ERR_PERSISTENCE_WRITE = 'PERSISTENCE_WRITE_FAILED';
export const ERR_PERSISTENCE_DELETE = 'PERSISTENCE_DELETE_FAILED';
export const ERR_PERSISTENCE_BATCH = 'PERSISTENCE_BATCH_FAILED';

// ========== Chat / AI ==========
export const ERR_CHAT_SESSION_NOT_FOUND = 'CHAT_SESSION_NOT_FOUND';
export const ERR_CHAT_SEND_FAILED = 'CHAT_SEND_FAILED';
export const ERR_CHAT_STREAM_FAILED = 'CHAT_STREAM_FAILED';
export const ERR_CHAT_NO_PROVIDER = 'CHAT_NO_PROVIDER';
export const ERR_CHAT_PROVIDER_ERROR = 'CHAT_PROVIDER_ERROR';
export const ERR_CHAT_PLAN_PARSE_FAILED = 'CHAT_PLAN_PARSE_FAILED';

// ========== Provider ==========
export const ERR_PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND';
export const ERR_PROVIDER_CONFIG_INVALID = 'PROVIDER_CONFIG_INVALID';
export const ERR_PROVIDER_KEY_INVALID = 'PROVIDER_KEY_INVALID';
export const ERR_PROVIDER_QUOTA_EXCEEDED = 'PROVIDER_QUOTA_EXCEEDED';
export const ERR_PROVIDER_NETWORK = 'PROVIDER_NETWORK_ERROR';

// ========== 插件 ==========
export const ERR_PLUGIN_NOT_FOUND = 'PLUGIN_NOT_FOUND';
export const ERR_PLUGIN_INSTALL_FAILED = 'PLUGIN_INSTALL_FAILED';
export const ERR_PLUGIN_ACTIVATE_FAILED = 'PLUGIN_ACTIVATE_FAILED';
export const ERR_PLUGIN_SANDBOX_ERROR = 'PLUGIN_SANDBOX_ERROR';
export const ERR_PLUGIN_CONFLICT = 'PLUGIN_CONFLICT';

// ========== MCP ==========
export const ERR_MCP_CONNECTION_FAILED = 'MCP_CONNECTION_FAILED';
export const ERR_MCP_TOOL_CALL_FAILED = 'MCP_TOOL_CALL_FAILED';
export const ERR_MCP_SERVER_NOT_FOUND = 'MCP_SERVER_NOT_FOUND';

// ========== 工作流 ==========
export const ERR_WORKFLOW_NOT_FOUND = 'WORKFLOW_NOT_FOUND';
export const ERR_WORKFLOW_EXEC_FAILED = 'WORKFLOW_EXEC_FAILED';
export const ERR_WORKFLOW_NODE_FAILED = 'WORKFLOW_NODE_FAILED';
export const ERR_WORKFLOW_CANCELLED = 'WORKFLOW_CANCELLED';

// ========== 文件系统 ==========
export const ERR_FS_NOT_FOUND = 'FS_NOT_FOUND';
export const ERR_FS_READ_FAILED = 'FS_READ_FAILED';
export const ERR_FS_WRITE_FAILED = 'FS_WRITE_FAILED';
export const ERR_FS_ACCESS_DENIED = 'FS_ACCESS_DENIED';

// ========== FFmpeg ==========
export const ERR_FFMPEG_NOT_FOUND = 'FFMPEG_NOT_FOUND';
export const ERR_FFMPEG_EXEC_FAILED = 'FFMPEG_EXEC_FAILED';

// ========== Config ==========
export const ERR_CONFIG_READ_FAILED = 'CONFIG_READ_FAILED';
export const ERR_CONFIG_WRITE_FAILED = 'CONFIG_WRITE_FAILED';
export const ERR_CONFIG_MIGRATION_FAILED = 'CONFIG_MIGRATION_FAILED';
export const ERR_CONFIG_SECRETS_UNAVAILABLE = 'CONFIG_SECRETS_UNAVAILABLE';

/**
 * 创建带错误码的 Error
 */
export function ipcError(code: string, message: string, details?: unknown): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  if (details) (err as any).details = details;
  return err;
}
